import type { FastifyInstance } from 'fastify';
import { streamChat } from '../services/ollama.js';

/**
 * Ollama-compatible /api/chat endpoint.
 * Accepts the same JSON format the frontend expects (Ollama NDJSON streaming)
 * but routes through Groq when DISABLE_LOCAL_OLLAMA=true.
 */
export async function registerOllamaCompatRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/chat', async (request, reply) => {
    const body = request.body as {
      model?: string;
      messages: { role: string; content: string }[];
      stream?: boolean;
      options?: { temperature?: number; num_ctx?: number };
    };

    if (!body.messages || !Array.isArray(body.messages)) {
      return reply.code(400).send({ error: 'messages array required' });
    }

    const messages = body.messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

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
