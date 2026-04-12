import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { assertGovernanceAccess } from '../services/governance/governanceAccess.js';
import { getSovereignOverview } from '../services/governance/sovereignOverviewService.js';

export function registerSovereignOverviewRoutes(app: FastifyInstance): void {
  app.get('/v1/cognitive/sovereign-overview', async (request, reply) => {
    const parsed = z.object({ userId: z.string().min(1) }).safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    if (!(await assertGovernanceAccess(request, reply, parsed.data.userId))) return;
    const overview = getSovereignOverview(parsed.data.userId);
    return reply.send({
      ...overview,
      cloudEvolutionEngineConfigured: Boolean(env.supabaseUrl?.trim() && env.supabaseServiceKey?.trim()),
    });
  });
}
