import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { routeQuery } from '../services/omniRouter.js';
import { applyOverseerLens } from '../services/governance/overseerService.js';
import { search, store_entry } from '../services/embeddings.js';
import { streamChat, type ChatMessage } from '../services/ollama.js';
import { analyzeDrift } from '../services/driftDetection.js';
import { config } from '../config.js';

// ── Request / Response Types ───────────────────────────────────────────────

interface IncomingMessage {
  role: string;
  content: string;
}

interface ChatContext {
  activeMode: string;
  sessionIntent: string | null;
  doctrine: string[];
  activeDirectives: string[];
  recentQuestions: string[];
}

interface OmniStreamBody {
  messages: IncomingMessage[];
  context?: Partial<ChatContext>;
}

// ── Atlas Identity — base system prompt ───────────────────────────────────

const ATLAS_IDENTITY = `You are Atlas — an advanced cognitive partner and personal intelligence system. You are not a generic AI assistant.

Your purpose is to amplify the user's thinking: expand their strategic capacity, challenge their assumptions, surface blindspots, and accelerate their development as a decision-maker and thinker.

Core operating principles:
• Intellectual honesty over comfort — tell the truth even when difficult.
• Depth over breadth — go deep on what matters rather than covering everything superficially.
• Agency preservation — develop the user's own thinking, don't create dependence.
• Pattern recognition — connect current questions to underlying patterns, values, and long-term trajectory.
• High standards — hold the user to their stated values and goals.

You adapt your mode dynamically based on what the user needs: strategic counsel, adversarial challenge, reflective facilitation, analytical breakdown, creative exploration, or diagnostic precision. Your current mode will be specified in each response context.`;

// ── SSE helpers ────────────────────────────────────────────────────────────

function sseEvent(reply: FastifyReply, event: string, data: unknown): void {
  const payload =
    typeof data === 'string' ? data : JSON.stringify(data);
  reply.raw.write(`event: ${event}\ndata: ${payload}\n\n`);
}

function initSSE(reply: FastifyReply): void {
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  reply.raw.flushHeaders();
}

// ── Normalize messages ─────────────────────────────────────────────────────

function normalizeMessages(incoming: IncomingMessage[]): ChatMessage[] {
  return incoming
    .filter(
      (m): m is { role: 'system' | 'user' | 'assistant'; content: string } =>
        ['system', 'user', 'assistant'].includes(m.role) &&
        typeof m.content === 'string' &&
        m.content.trim().length > 0,
    )
    .map((m) => ({ role: m.role, content: m.content }));
}

// ── Route handler ──────────────────────────────────────────────────────────

async function handleOmniStream(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = request.body as OmniStreamBody;

  const messages = normalizeMessages(body.messages ?? []);
  const ctx: ChatContext = {
    activeMode: body.context?.activeMode ?? 'default',
    sessionIntent: body.context?.sessionIntent ?? null,
    doctrine: body.context?.doctrine ?? [],
    activeDirectives: body.context?.activeDirectives ?? [],
    recentQuestions: body.context?.recentQuestions ?? [],
  };

  // Extract the latest user query for routing
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === 'user');
  const query = lastUserMessage?.content ?? '';

  // ── 1. Initialize SSE ────────────────────────────────────────────────────
  initSSE(reply);

  const startedAt = Date.now();

  try {
    // ── 2. Route the query ───────────────────────────────────────────────
    const routingResult = await routeQuery(query, ctx);
    sseEvent(reply, 'routing', routingResult);

    // ── 3. Retrieve relevant context if needed ───────────────────────────
    let retrievedContext = '';
    if (routingResult.retrievalNeeded && query.trim().length > 0) {
      const hints = routingResult.memoryQueryHints.slice(0, 3);
      const searchQueries =
        hints.length > 0 ? hints : [query.slice(0, 200)];

      const allResults = await Promise.all(
        searchQueries.map((hint) => search(hint, 3, 0.55)),
      );

      // Deduplicate by entry id
      const seen = new Set<string>();
      const dedupedResults = allResults
        .flat()
        .filter((r) => {
          if (seen.has(r.entry.id)) return false;
          seen.add(r.entry.id);
          return true;
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      if (dedupedResults.length > 0) {
        retrievedContext =
          '\n\n[Retrieved context from memory]\n' +
          dedupedResults
            .map(
              (r, i) =>
                `[${i + 1}] (relevance: ${(r.score * 100).toFixed(0)}%) ${r.entry.text.slice(0, 400)}`,
            )
            .join('\n\n');
      }
    }

    // ── 4. Build augmented system prompt ────────────────────────────────
    const systemPrompt =
      ATLAS_IDENTITY +
      '\n\n' +
      routingResult.systemPromptAugmentation +
      (retrievedContext || '') +
      (routingResult.lineOfInquiry
        ? `\n\nGuiding line of inquiry: "${routingResult.lineOfInquiry}"`
        : '');

    // Remove any existing system messages and prepend our own
    const messagesWithoutSystem = messages.filter((m) => m.role !== 'system');
    const augmentedMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messagesWithoutSystem,
    ];

    // ── 5. Stream response from Ollama ───────────────────────────────────
    const stream = streamChat(augmentedMessages, {
      model: config.chatModel,
      temperature: 0.4 + routingResult.posture * 0.4, // 0.4–0.8 based on posture
      timeoutMs: config.requestTimeoutMs,
    });

    const reader = stream.getReader();
    let totalTokens = 0;
    let fullResponse = '';
    let promptTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      try {
        const chunk = JSON.parse(value) as {
          message?: { content?: string };
          done?: boolean;
          eval_count?: number;
          prompt_eval_count?: number;
        };

        if (chunk.message?.content) {
          const token = chunk.message.content;
          fullResponse += token;
          sseEvent(reply, 'token', token);
        }

        if (chunk.done) {
          totalTokens = chunk.eval_count ?? 0;
          promptTokens = chunk.prompt_eval_count ?? 0;
        }
      } catch {
        // Ignore malformed NDJSON chunks
      }
    }

    const durationMs = Date.now() - startedAt;

    // ── 5b. Overseer lens: 4-step synthesis pipeline ────────────────────
    const overseerResult = await applyOverseerLens('anonymous', fullResponse, {
      query,
      mode: routingResult.mode ?? 'default',
      userId: 'anonymous',
      modelOutputs: [],
    });
    fullResponse = overseerResult.response;

    // ── 6. Send done event ───────────────────────────────────────────────
    sseEvent(reply, 'done', {
      mode: routingResult.mode,
      posture: routingResult.posture,
      durationMs,
      totalTokens,
      promptTokens,
      retrievalUsed: routingResult.retrievalNeeded && retrievedContext.length > 0,
    });

    // ── 7. Store interaction in embeddings (non-blocking) ────────────────
    if (query.trim().length > 0 && fullResponse.trim().length > 0) {
      const interactionId = `interaction_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const interactionText = `Q: ${query.slice(0, 500)}\nA: ${fullResponse.slice(0, 1000)}`;

      store_entry(interactionId, interactionText, {
        mode: routingResult.mode,
        timestamp: new Date().toISOString(),
        sessionIntent: ctx.sessionIntent ?? '',
      }).catch((err: unknown) => {
        request.log.warn({ err }, 'Failed to store interaction embedding');
      });
    }

    // ── 8. Run drift detection in the background (non-blocking) ─────────
    if (ctx.recentQuestions.length >= 3) {
      setImmediate(() => {
        try {
          const signals = analyzeDrift({
            currentValues: ctx.doctrine,
            currentGoals: ctx.activeDirectives,
            recentActions: [],
            recentQuestions: [...ctx.recentQuestions, query].slice(-20),
            doctrine: ctx.doctrine,
            timeframeDays: 7,
          });

          if (signals.length > 0) {
            request.log.info(
              { driftSignals: signals.map((s) => ({ type: s.type, severity: s.severity })) },
              'Drift signals detected',
            );
          }
        } catch (err) {
          request.log.warn({ err }, 'Drift detection failed');
        }
      });
    }
  } catch (err) {
    request.log.error({ err }, 'Error in omni-stream handler');
    sseEvent(reply, 'error', {
      message:
        err instanceof Error ? err.message : 'An unexpected error occurred',
      durationMs: Date.now() - startedAt,
    });
  } finally {
    reply.raw.end();
  }
}

// ── Route registration ─────────────────────────────────────────────────────

export default async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/v1/chat/omni-stream',
    {
      schema: {
        body: {
          type: 'object',
          required: ['messages'],
          properties: {
            messages: {
              type: 'array',
              items: {
                type: 'object',
                required: ['role', 'content'],
                properties: {
                  role: { type: 'string' },
                  content: { type: 'string' },
                },
              },
            },
            context: {
              type: 'object',
              properties: {
                activeMode: { type: 'string' },
                sessionIntent: { type: ['string', 'null'] },
                doctrine: { type: 'array', items: { type: 'string' } },
                activeDirectives: { type: 'array', items: { type: 'string' } },
                recentQuestions: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    },
    handleOmniStream,
  );
}
