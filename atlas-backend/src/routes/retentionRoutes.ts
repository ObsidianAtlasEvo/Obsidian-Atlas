/**
 * Retention Routes — Phase 4 §5
 *
 * Backend API for the data retention & deletion subsystem:
 * - GET  /api/governance/retention/status          — last deletion report + next run
 * - GET  /api/governance/retention/holds            — active legal holds
 * - DELETE /api/governance/retention/holds/:holdId  — release hold (Sovereign Creator only)
 * - POST /api/governance/retention/erasure          — initiate erasure request
 * - GET  /api/governance/retention/erasure/:requestId — erasure status
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getRetentionStatus } from '../services/governance/retention/deletionExecutor.js';
import {
  getActiveHolds,
  releaseHold,
} from '../services/governance/retention/legalHoldRegistry.js';
import {
  requestErasure,
  getErasureStatus,
} from '../services/governance/retention/erasureExecutor.js';
import { queryRetentionEvents } from '../services/governance/retention/retentionAuditTrail.js';

const CREATOR_EMAIL = 'crowleyrc62@gmail.com';

const erasureBody = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
  reason: z.enum(['GDPR', 'CCPA', 'USER_REQUEST']).optional(),
});

const holdIdParams = z.object({
  holdId: z.string().min(1),
});

const erasureIdParams = z.object({
  requestId: z.string().min(1),
});

const releaseHoldBody = z.object({
  actorId: z.string().email(),
});

export function registerRetentionRoutes(app: FastifyInstance): void {
  /**
   * GET /api/governance/retention/status
   * Returns last deletion report and next scheduled run time.
   */
  app.get('/api/governance/retention/status', async (_request, reply) => {
    const status = getRetentionStatus();
    return reply.send(status);
  });

  /**
   * GET /api/governance/retention/holds
   * Returns all active legal holds.
   */
  app.get('/api/governance/retention/holds', async (_request, reply) => {
    const holds = await getActiveHolds();
    return reply.send({ holds });
  });

  /**
   * DELETE /api/governance/retention/holds/:holdId
   * Release a legal hold. Sovereign Creator only.
   */
  app.delete<{ Params: { holdId: string }; Body: { actorId: string } }>(
    '/api/governance/retention/holds/:holdId',
    async (request, reply) => {
      const params = holdIdParams.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: 'validation_error', details: params.error.flatten() });
      }

      const body = releaseHoldBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: 'validation_error', details: body.error.flatten() });
      }

      if (body.data.actorId.trim().toLowerCase() !== CREATOR_EMAIL) {
        return reply.status(403).send({ error: 'forbidden', message: 'Only Sovereign Creator can release holds' });
      }

      try {
        await releaseHold(params.data.holdId, body.data.actorId);
        return reply.status(200).send({ success: true });
      } catch (err) {
        return reply.status(404).send({ error: 'not_found', message: String(err) });
      }
    }
  );

  /**
   * POST /api/governance/retention/erasure
   * Initiate a GDPR/CCPA erasure request.
   */
  app.post('/api/governance/retention/erasure', async (request, reply) => {
    const parsed = erasureBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }

    try {
      const certificate = await requestErasure(parsed.data);
      return reply.status(201).send({ certificate });
    } catch (err) {
      return reply.status(500).send({ error: 'erasure_failed', message: String(err) });
    }
  });

  /**
   * GET /api/governance/retention/erasure/:requestId
   * Get the status of an erasure request.
   */
  app.get<{ Params: { requestId: string } }>(
    '/api/governance/retention/erasure/:requestId',
    async (request, reply) => {
      const params = erasureIdParams.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: 'validation_error', details: params.error.flatten() });
      }

      try {
        const status = await getErasureStatus(params.data.requestId);
        return reply.send(status);
      } catch (err) {
        return reply.status(404).send({ error: 'not_found', message: String(err) });
      }
    }
  );

  /**
   * GET /api/governance/retention/audit
   * Returns the last 50 retention events.
   */
  app.get('/api/governance/retention/audit', async (_request, reply) => {
    const events = await queryRetentionEvents({ limit: 50 });
    return reply.send({ events });
  });
}
