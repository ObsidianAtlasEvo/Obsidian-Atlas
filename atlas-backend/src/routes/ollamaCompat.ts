import type { FastifyInstance } from 'fastify';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { attachAtlasSession } from '../services/auth/authProvider.js';
import { messagesWithPrimeDirective } from '../services/intelligence/primeDirective.js';
import { streamChat } from '../services/ollama.js';
import { resolveAuthenticatedRouteUserId } from './identityHardening.js';

const ollamaCompatRouteLimiter = new RateLimiterMemory({
  keyPrefix: 'atlas:ollama-compat',
  points: 5,
  duration: 60,
});

/**
 * Ollama-compatible /api/chat endpoint.
 * Accepts the same JSON format the frontend expects (Ollama NDJSON streaming)
 * but routes through Groq when DISABLE_LOCAL_OLLAMA=true.
 */
export async function registerOllamaCompatRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/chat', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const forwarded = request.headers['x-forwarded-for'];
    const rateLimitKey = Array.isArray(forwarded)
      ? (forwarded[0]?.split(',')[0]?.trim() || request.ip)
      : typeof forwarded === 'string'
        ? (forwarded.split(',')[0]?.trim() || request.ip)
        : request.ip;

    try {
      await ollamaCompatRouteLimiter.consume(rateLimitKey);
    } catch (err) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(
          typeof err === 'object' &&
          err !== null &&
          'msBeforeNext' in err &&
          typeof (err as { msBeforeNext?: unknown }).msBeforeNext === 'number'
            ? ((err as { msBeforeNext: number }).msBeforeNext / 1000)
            : 60
        )
      );
      return reply
        .code(429)
        .header('retry-after', String(retryAfterSeconds))
        .send({
          error: 'rate_limit_exceeded',
          message: 'Too many requests. Please retry later.',
        });
    }

    await attachAtlasSession(request);
    const userId = resolveAuthenticatedRouteUserId(
      request.atlasAuthUser?.databaseUserId,
      undefined,
    );

    if (!userId) {
      return reply.code(401).send({ error: 'Authentication required' });
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

    const messages = messagesWithPrimeDirective(userId, body.messages ?? []);

    const temperature = body.options?.temperature ?? 0.7;

    // Use streamChat which now routes to Groq when DISABLE_LOCAL_OLLAMA=true
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
