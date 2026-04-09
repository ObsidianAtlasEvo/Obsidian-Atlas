import type { FastifyInstance } from 'fastify';
import { ping } from '../services/ollama.js';

const startTime = Date.now();

export default async function healthRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/health
   * Returns server status, uptime, and Ollama reachability.
   */
  app.get('/v1/health', async (_request, reply) => {
    const ollamaReachable = await ping();

    return reply.status(200).send({
      status: 'ok',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      ollamaReachable,
    });
  });
}
