import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { streamChat } from '../services/ollama.js';
import { messagesWithPrimeDirective } from '../services/intelligence/primeDirective.js';

/**
 * Ollama-compatible /api/chat endpoint.
 * Accepts the same JSON format the frontend expects (Ollama NDJSON streaming)
 * but routes through Groq when DISABLE_LOCAL_OLLAMA=true.
 */
export async function registerOllamaCompatRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/ollama/chat', async (request, reply) => {
    // Auth gate: userId must come from verified session (route is inside protectedApp scope)
    const userId = request.atlasAuthUser?.databaseUserId ?? request.atlasSession?.userId;
    if (!userId) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    // Guard: when Ollama is disabled, at least one cloud provider key must be set
    if (
      env.disableLocalOllama &&
      !env.groqApiKey &&
      !env.geminiApiKey &&
      !env.openaiApiKey
    ) {
      return reply.code(503).send({
        error:
          'No cloud provider configured. Set GROQ_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY.',
      });
    }

    const body = request.body as {
      model?: string;
      messages: { role: string; content: string }[];
      stream?: boolean;
      options?: { temperature?: number; num_ctx?: number };
    };

    if (!body.messages || !Array.isArray(body.messages)) {
      return reply.code(400).send({ error: 'messages array required' });
    }

    const rawMessages = body.messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

    // Inject Prime Directive so the LLM operates under Atlas identity context
    const messages = messagesWithPrimeDirective(userId, rawMessages);

    const temperature = body.options?.temperature ?? 0.7;

    // streamChat routes to Groq when DISABLE_LOCAL_OLLAMA=true and GROQ_API_KEY is set
    const stream = streamChat(messages, { temperature });

    reply.raw.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    try {
      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply.raw.write(value + '\n');
      }
    } catch (err) {
      reply.raw.write(JSON.stringify({
        model: 'atlas',
        message: { role: 'assistant', content: '' },
        done: true,
        error: String(err),
      }) + '\n');
    }

    reply.raw.end();
  });
}
