import type { FastifyInstance } from 'fastify';
import { getExplainabilityEngine } from './explainabilityEngine.js';

export function registerExplainabilityRoutes(
  app: FastifyInstance,
  opts: { supabaseUrl: string; supabaseKey: string },
): void {
  app.get('/v1/explanations', async (request, reply) => {
    const q = request.query as { userId?: string; limit?: string };
    const userId = q.userId?.trim();
    if (!userId) {
      return reply.status(400).send({ error: 'userId query parameter required' });
    }
    const limit = Math.min(200, Math.max(1, parseInt(q.limit ?? '50', 10) || 50));
    try {
      const engine = getExplainabilityEngine();
      const data = await engine.query({ userId, limit }, opts.supabaseUrl, opts.supabaseKey);
      return reply.send({ data });
    } catch (e) {
      request.log.error(e);
      return reply.status(502).send({
        error: 'explanations_unavailable',
        message: e instanceof Error ? e.message : 'Failed to load explanations',
      });
    }
  });
}
