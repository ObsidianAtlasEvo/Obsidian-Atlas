import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getDeepResearchQuotaSnapshot,
  setUserTavilyByok,
} from '../services/intelligence/quotaManager.js';

const quotaBodySchema = z.object({
  userId: z.string().min(1),
});

const byokBodySchema = z.object({
  userId: z.string().min(1),
  /** Set to `null` or empty string to clear BYOK. */
  tavilyApiKey: z.union([z.string(), z.null()]),
});

export function registerSovereigntyRoutes(app: FastifyInstance): void {
  app.post('/v1/sovereignty/deep-research-quota', async (request, reply) => {
    const parsed = quotaBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const snap = getDeepResearchQuotaSnapshot(parsed.data.userId);
    return reply.send({
      hasByok: snap.hasByok,
      unlimited: snap.unlimited,
      usedToday: snap.usedToday,
      limit: snap.limit,
      resetsUtcMidnight: snap.resetsUtcMidnight,
    });
  });

  app.put('/v1/sovereignty/tavily-byok', async (request, reply) => {
    const parsed = byokBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const raw = parsed.data.tavilyApiKey;
    setUserTavilyByok(parsed.data.userId, raw === null ? null : raw);
    return reply.send({ ok: true });
  });
}
