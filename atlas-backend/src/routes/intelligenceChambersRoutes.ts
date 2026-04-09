import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  clusterFrictionSummary,
  createFrictionItemManual,
  listFrictionItems,
  rebuildFrictionHeuristics,
} from '../services/governance/frictionCartographyService.js';
import {
  activateThresholdProtocol,
  closeThresholdActivation,
  createThresholdProtocol,
  getThresholdProtocol,
  listThresholdActivations,
  listThresholdProtocols,
  matchThresholdProtocols,
} from '../services/governance/thresholdProtocolService.js';
import {
  computeTrajectorySnapshot,
  getTrajectorySnapshot,
  listTrajectorySnapshots,
  persistTrajectorySnapshot,
} from '../services/governance/trajectoryObservatoryService.js';
import { frictionTypeSchema, trajectoryHorizonSchema } from '../types/intelligenceChambers.js';

const userIdQuery = z.object({ userId: z.string().min(1) });

export function registerIntelligenceChambersRoutes(app: FastifyInstance): void {
  app.post('/v1/cognitive/trajectory/compute', async (request, reply) => {
    const parsed = z
      .object({ userId: z.string().min(1), horizon: z.string().optional(), persist: z.boolean().optional() })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    const h = (parsed.data.horizon ?? 'medium') as 'near' | 'medium';
    trajectoryHorizonSchema.parse(h);
    const live = computeTrajectorySnapshot(parsed.data.userId, h);
    let snapshotId: string | undefined;
    if (parsed.data.persist) {
      snapshotId = persistTrajectorySnapshot(parsed.data.userId, h);
    }
    return reply.send({ live, snapshotId });
  });

  app.get('/v1/cognitive/trajectory/snapshots', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    return reply.send({ snapshots: listTrajectorySnapshots(parsed.data.userId) });
  });

  app.get('/v1/cognitive/trajectory/snapshots/:id', async (request, reply) => {
    const id = z.string().min(1).safeParse((request.params as { id?: string }).id);
    const parsed = userIdQuery.safeParse(request.query);
    if (!id.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    const row = getTrajectorySnapshot(parsed.data.userId, id.data);
    if (!row) return reply.status(404).send({ error: 'not_found' });
    return reply.send({ snapshot: row });
  });

  app.post('/v1/cognitive/friction/rebuild', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    rebuildFrictionHeuristics(parsed.data.userId);
    return reply.send({ items: listFrictionItems(parsed.data.userId) });
  });

  app.get('/v1/cognitive/friction/items', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    return reply.send({
      items: listFrictionItems(parsed.data.userId),
      clusters: clusterFrictionSummary(parsed.data.userId),
    });
  });

  app.post('/v1/cognitive/friction/items', async (request, reply) => {
    const parsed = z
      .object({
        userId: z.string().min(1),
        frictionType: z.string(),
        severity: z.number(),
        title: z.string().min(1),
        description: z.string().min(1),
        rootHypothesis: z.string().optional(),
        surfaceNote: z.string().optional(),
        clusterKey: z.string().optional(),
        smallestRelease: z.string().optional(),
        recommendations: z.array(z.string()).optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    try {
      frictionTypeSchema.parse(parsed.data.frictionType);
      const id = createFrictionItemManual(parsed.data);
      return reply.status(201).send({ itemId: id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  app.get('/v1/cognitive/threshold/protocols', async (request, reply) => {
    const parsed = userIdQuery.extend({ includeArchived: z.enum(['1', '0']).optional() }).safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    return reply.send({
      protocols: listThresholdProtocols(parsed.data.userId, parsed.data.includeArchived === '1'),
    });
  });

  app.post('/v1/cognitive/threshold/protocols', async (request, reply) => {
    const parsed = z
      .object({
        userId: z.string().min(1),
        title: z.string().min(1),
        stateDescription: z.string().min(1),
        triggerTypes: z.array(z.string()).optional(),
        warningSigns: z.array(z.string()).optional(),
        unreliableInState: z.string().optional(),
        immediateSteps: z.array(z.string()).optional(),
        doNotTrust: z.array(z.string()).optional(),
        standardsApplyNote: z.string().optional(),
        approvedActions: z.array(z.string()).optional(),
        forbiddenActions: z.array(z.string()).optional(),
        recoverySteps: z.array(z.string()).optional(),
        reflectionPrompts: z.array(z.string()).optional(),
        consultNote: z.string().optional(),
        linkedConstitutionClauseIds: z.array(z.string()).optional(),
        linkedLegacyIds: z.array(z.string()).optional(),
        linkedUnfinishedIds: z.array(z.string()).optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const id = createThresholdProtocol(parsed.data);
    return reply.status(201).send({ protocolId: id });
  });

  app.get('/v1/cognitive/threshold/protocols/:id', async (request, reply) => {
    const id = z.string().min(1).safeParse((request.params as { id?: string }).id);
    const parsed = userIdQuery.safeParse(request.query);
    if (!id.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    const row = getThresholdProtocol(parsed.data.userId, id.data);
    if (!row) return reply.status(404).send({ error: 'not_found' });
    return reply.send({ protocol: row });
  });

  app.post('/v1/cognitive/threshold/protocols/:id/activate', async (request, reply) => {
    const id = z.string().min(1).safeParse((request.params as { id?: string }).id);
    const parsed = z.object({ userId: z.string().min(1), contextNote: z.string().optional() }).safeParse(request.body);
    if (!id.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      const activationId = activateThresholdProtocol(parsed.data.userId, id.data, parsed.data.contextNote);
      return reply.status(201).send({ activationId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  app.get('/v1/cognitive/threshold/activations', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    return reply.send({ activations: listThresholdActivations(parsed.data.userId) });
  });

  app.patch('/v1/cognitive/threshold/activations/:activationId/close', async (request, reply) => {
    const activationId = z.string().min(1).safeParse((request.params as { activationId?: string }).activationId);
    const parsed = z.object({ userId: z.string().min(1), recoveryReviewText: z.string().min(1) }).safeParse(request.body);
    if (!activationId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      closeThresholdActivation(parsed.data.userId, activationId.data, parsed.data.recoveryReviewText);
      return reply.status(204).send();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  app.get('/v1/cognitive/threshold/match', async (request, reply) => {
    const parsed = userIdQuery.extend({ text: z.string().min(1) }).safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    return reply.send({ matches: matchThresholdProtocols(parsed.data.userId, parsed.data.text) });
  });
}
