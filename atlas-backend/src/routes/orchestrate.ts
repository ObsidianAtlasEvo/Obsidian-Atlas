// ── Multi-Model Orchestration Route ──────────────────────────────────────────
// POST /v1/chat/multi-stream
//
// Fans a query out to multiple AI models in parallel, then optionally
// synthesizes their responses through the user's cognitive lens.
// Responses are streamed as Server-Sent Events so the UI can display
// model outputs as they arrive rather than waiting for all to complete.
//
// SSE event sequence:
//   models-selected  → which models will be queried
//   model-start      → a model's call has been initiated
//   model-complete   → a model returned successfully
//   model-error      → a model failed or timed out
//   synthesis-start  → Atlas synthesis is beginning
//   synthesis-token  → streaming synthesis token (if streaming is available)
//   synthesis-done   → final synthesis result with metadata
//   done             → all processing complete

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { orchestrator } from '../services/orchestrator.js';
import { synthesizer } from '../services/synthesizer.js';
import { resolveModelListForTier } from './models.js';
import { getTierConfig, hasFeature, type UserTier } from '../services/tierManager.js';
import { getModelById } from '../services/modelRegistry.js';
import { createAllProviders } from '../services/providers/index.js';
import type { ModelResponse } from '../services/orchestrator.js';
import type { UserContext } from '../services/synthesizer.js';

// ── Request body schema ───────────────────────────────────────────────────────

interface IncomingMessage {
  role: string;
  content: string;
}

interface PostureBody {
  depth: number;
  challenge: number;
  directness: number;
  languageLevel: string;
}

interface ContextBody {
  doctrine: string[];
  activeDirectives: string[];
  posture: PostureBody;
  resonanceMode: string;
}

interface MultiStreamBody {
  messages: IncomingMessage[];
  models?: string[];
  tier?: UserTier;
  synthesize?: boolean;
  context?: Partial<ContextBody>;
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

function initSSE(reply: FastifyReply): void {
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.setHeader('X-Accel-Buffering', 'no');
  reply.raw.flushHeaders();
}

function sseEvent(reply: FastifyReply, event: string, data: unknown): void {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  reply.raw.write(`event: ${event}\ndata: ${payload}\n\n`);
}

// ── Normalize incoming messages ───────────────────────────────────────────────

type ValidRole = 'system' | 'user' | 'assistant';
const VALID_ROLES: ValidRole[] = ['system', 'user', 'assistant'];

function normalizeMessages(
  incoming: IncomingMessage[],
): { role: ValidRole; content: string }[] {
  return incoming.filter(
    (m): m is { role: ValidRole; content: string } =>
      VALID_ROLES.includes(m.role as ValidRole) &&
      typeof m.content === 'string' &&
      m.content.trim().length > 0,
  );
}

// ── Context builder ───────────────────────────────────────────────────────────

function buildUserContext(contextBody: Partial<ContextBody> | undefined): UserContext {
  return {
    doctrine: contextBody?.doctrine ?? [],
    activeDirectives: contextBody?.activeDirectives ?? [],
    posture: {
      depth: contextBody?.posture?.depth ?? 0.6,
      challenge: contextBody?.posture?.challenge ?? 0.5,
      directness: contextBody?.posture?.directness ?? 0.7,
      languageLevel: contextBody?.posture?.languageLevel ?? 'expert',
    },
    resonanceMode: contextBody?.resonanceMode ?? 'analytical',
  };
}

// ── Auto-select models for a tier ─────────────────────────────────────────────

/**
 * Select a well-rounded set of default models when the user hasn't specified.
 * Prefers variety: one local, one fast cloud, one strong cloud.
 */
async function autoSelectModels(tier: UserTier, requestedModels: string[] | undefined): Promise<string[]> {
  const resolved = resolveModelListForTier(requestedModels, tier);
  if (resolved.length > 0) return resolved;

  // Hard fallback to the most universally available models
  const tierConfig = getTierConfig(tier);
  const providers = createAllProviders();

  const candidates = ['ollama/llama3.1:70b', 'groq/llama-3.1-70b-versatile', 'google/gemini-2.0-flash', 'deepseek/deepseek-chat', 'mistral/mistral-nemo'];
  const available: string[] = [];

  for (const modelId of candidates) {
    if (available.length >= tierConfig.maxModelsPerQuery) break;
    const model = getModelById(modelId);
    if (!model) continue;
    const provider = providers.get(model.provider);
    if (!provider) continue;
    try {
      const ok = await provider.isAvailable();
      if (ok) available.push(modelId);
    } catch {
      // skip unavailable
    }
  }

  return available;
}

// ── Main handler ──────────────────────────────────────────────────────────────

async function handleMultiStream(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = request.body as MultiStreamBody;

  const messages = normalizeMessages(body.messages ?? []);
  const tier = (['free', 'sovereign', 'creator'] as UserTier[]).includes(
    body.tier as UserTier,
  )
    ? (body.tier as UserTier)
    : 'free';

  const shouldSynthesize = body.synthesize !== false; // default true
  const userContext = buildUserContext(body.context);

  const overallStart = Date.now();

  // ── 1. Initialize SSE ───────────────────────────────────────────────────────
  initSSE(reply);

  try {
    // ── 2. Select models ──────────────────────────────────────────────────────
    const selectedModelIds = await autoSelectModels(tier, body.models);

    if (selectedModelIds.length === 0) {
      sseEvent(reply, 'error', {
        message: 'No models are available. Configure at least one API key or ensure Ollama is running.',
      });
      sseEvent(reply, 'done', { durationMs: Date.now() - overallStart });
      reply.raw.end();
      return;
    }

    sseEvent(reply, 'models-selected', {
      models: selectedModelIds,
      tier,
      synthesizeEnabled: shouldSynthesize,
    });

    // ── 3. Emit model-start events ────────────────────────────────────────────
    // Note: we emit these immediately so the UI can show which models are running.
    // Actual parallel execution starts in orchestrate() below.
    for (const modelId of selectedModelIds) {
      sseEvent(reply, 'model-start', { modelId });
    }

    // ── 4. Run the orchestrator ───────────────────────────────────────────────
    const orchestrationResult = await orchestrator.orchestrate({
      messages,
      selectedModels: selectedModelIds,
      timeoutMs: 45_000, // per-model timeout
      maxModels: getTierConfig(tier).maxModelsPerQuery,
    });

    // ── 5. Stream model results as they arrived ───────────────────────────────
    for (const response of orchestrationResult.responses) {
      if (response.status === 'success') {
        sseEvent(reply, 'model-complete', {
          modelId: response.modelId,
          provider: response.provider,
          content: response.content,
          tokensUsed: response.tokensUsed,
          durationMs: response.durationMs,
        });
      } else {
        sseEvent(reply, 'model-error', {
          modelId: response.modelId,
          provider: response.provider,
          error: response.error ?? 'Unknown error',
          status: response.status,
          durationMs: response.durationMs,
        });
      }
    }

    // ── 6. Optionally synthesize ──────────────────────────────────────────────
    if (shouldSynthesize) {
      const successfulResponses: ModelResponse[] = orchestrationResult.responses.filter(
        (r) => r.status === 'success',
      );

      if (successfulResponses.length === 0) {
        sseEvent(reply, 'synthesis-done', {
          synthesizedResponse: 'No successful model responses to synthesize.',
          sourcesUsed: [],
          consensusAreas: [],
          disagreementAreas: [],
          atlasJudgment: 'All models failed — cannot synthesize.',
          confidence: 0,
        });
      } else {
        sseEvent(reply, 'synthesis-start', {
          modelsBeingSynthesized: successfulResponses.map((r) => r.modelId),
        });

        // Extract original query from the last user message
        const originalQuery =
          [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

        // For tiers with raw-responses feature, include that flag
        const canUseAdvancedSynthesis = hasFeature(tier, 'advanced-synthesis');

        const synthesisResult = await synthesizer.synthesize({
          originalQuery,
          modelResponses: orchestrationResult.responses,
          userContext: canUseAdvancedSynthesis
            ? userContext
            : { ...userContext, doctrine: [], activeDirectives: [] },
        });

        // Stream the synthesis in chunks to improve perceived responsiveness
        // Since Ollama doesn't support streaming here, we chunk the text manually
        const text = synthesisResult.synthesizedResponse;
        const chunkSize = 150; // characters per token-like chunk
        for (let i = 0; i < text.length; i += chunkSize) {
          const token = text.slice(i, i + chunkSize);
          sseEvent(reply, 'synthesis-token', token);
        }

        sseEvent(reply, 'synthesis-done', {
          synthesizedResponse: synthesisResult.synthesizedResponse,
          sourcesUsed: synthesisResult.sourcesUsed,
          consensusAreas: synthesisResult.consensusAreas,
          disagreementAreas: synthesisResult.disagreementAreas,
          atlasJudgment: synthesisResult.atlasJudgment,
          confidence: synthesisResult.confidence,
        });
      }
    }

    // ── 7. Emit done ──────────────────────────────────────────────────────────
    sseEvent(reply, 'done', {
      tier,
      modelsQueried: orchestrationResult.modelsQueried,
      modelsSucceeded: orchestrationResult.modelsSucceeded,
      synthesized: shouldSynthesize,
      totalDurationMs: Date.now() - overallStart,
    });
  } catch (err) {
    request.log.error({ err }, 'Error in multi-stream handler');
    sseEvent(reply, 'error', {
      message: err instanceof Error ? err.message : 'An unexpected error occurred',
      durationMs: Date.now() - overallStart,
    });
  } finally {
    reply.raw.end();
  }
}

// ── Route registration ─────────────────────────────────────────────────────────

export default async function orchestrateRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/v1/chat/multi-stream',
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
            models: {
              type: 'array',
              items: { type: 'string' },
            },
            tier: {
              type: 'string',
              enum: ['free', 'sovereign', 'creator'],
            },
            synthesize: { type: 'boolean' },
            context: {
              type: 'object',
              properties: {
                doctrine: {
                  type: 'array',
                  items: { type: 'string' },
                },
                activeDirectives: {
                  type: 'array',
                  items: { type: 'string' },
                },
                posture: {
                  type: 'object',
                  properties: {
                    depth: { type: 'number', minimum: 0, maximum: 1 },
                    challenge: { type: 'number', minimum: 0, maximum: 1 },
                    directness: { type: 'number', minimum: 0, maximum: 1 },
                    languageLevel: { type: 'string' },
                  },
                },
                resonanceMode: { type: 'string' },
              },
            },
          },
        },
      },
    },
    handleMultiStream,
  );
}
