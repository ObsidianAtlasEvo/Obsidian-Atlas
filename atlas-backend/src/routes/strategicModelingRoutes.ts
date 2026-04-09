import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  addAtlasRgEdge,
  explainNeighborhoodPlainLanguage,
  listAtlasRgEdges,
  listAtlasRgNodes,
  listStructuralTensionEdges,
  neighborsOf,
  runGraphReasoningQuery,
  syncDecisionToGraph,
  upsertAtlasRgNode,
} from '../services/governance/atlasRealityGraphService.js';
import {
  createActionProtocol,
  createIdentityGoal,
  listActionProtocolsForGoal,
  listIdentityGoals,
  recordProtocolReview,
  setIdentityGoalStatus,
} from '../services/governance/identityActionBridgeService.js';
import {
  completeSimulationForgeManual,
  createSimulationForge,
  getSimulationForge,
  listSimulationForges,
  runSimulationForge,
  updateSimulationForgeDecomposition,
} from '../services/governance/simulationForgeService.js';
import {
  createSelfRevisionRecord,
  listSelfRevisionRecords,
  runSelfRevisionHeuristicTriggers,
  setSelfRevisionStatus,
} from '../services/governance/selfRevisionService.js';
import {
  atlasRgNodeKindSchema,
  atlasRgRelationSchema,
  identityGoalStatusSchema,
  selfRevisionCategorySchema,
  selfRevisionSeveritySchema,
  selfRevisionStatusSchema,
  simulationForgeReviewSchema,
} from '../types/strategicLayer.js';

const userIdQuery = z.object({ userId: z.string().min(1) });

export function registerStrategicModelingRoutes(app: FastifyInstance): void {
  app.post('/v1/cognitive/forge', async (request, reply) => {
    const parsed = z
      .object({
        userId: z.string().min(1),
        title: z.string().min(1),
        situationSummary: z.string().min(1),
        domainTags: z.array(z.string()).optional(),
        scenarioDecomposition: z.array(z.string()).optional(),
        linkedDecisionIds: z.array(z.string()).optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const id = createSimulationForge(parsed.data);
    return reply.status(201).send({ forgeId: id });
  });

  app.patch('/v1/cognitive/forge/:forgeId/decomposition', async (request, reply) => {
    const forgeId = z.string().min(1).safeParse((request.params as { forgeId?: string }).forgeId);
    const parsed = z
      .object({ userId: z.string().min(1), scenarioDecomposition: z.array(z.string()) })
      .safeParse(request.body);
    if (!forgeId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      updateSimulationForgeDecomposition(parsed.data.userId, forgeId.data, parsed.data.scenarioDecomposition);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: 'not_found' });
    }
  });

  app.post('/v1/cognitive/forge/:forgeId/run', async (request, reply) => {
    const forgeId = z.string().min(1).safeParse((request.params as { forgeId?: string }).forgeId);
    const parsed = userIdQuery.safeParse(request.body);
    if (!forgeId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      const review = await runSimulationForge(forgeId.data, parsed.data.userId);
      return reply.send({ review });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  app.post('/v1/cognitive/forge/:forgeId/complete', async (request, reply) => {
    const forgeId = z.string().min(1).safeParse((request.params as { forgeId?: string }).forgeId);
    const parsed = z
      .object({ userId: z.string().min(1), review: z.unknown() })
      .safeParse(request.body);
    if (!forgeId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    const rev = simulationForgeReviewSchema.safeParse(parsed.data.review);
    if (!rev.success) {
      return reply.status(400).send({ error: 'validation_error', details: rev.error.flatten() });
    }
    try {
      completeSimulationForgeManual(parsed.data.userId, forgeId.data, rev.data);
      return reply.status(204).send();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  app.get('/v1/cognitive/forge', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    return reply.send({ forges: listSimulationForges(parsed.data.userId) });
  });

  app.get('/v1/cognitive/forge/:forgeId', async (request, reply) => {
    const forgeId = z.string().min(1).safeParse((request.params as { forgeId?: string }).forgeId);
    const parsed = userIdQuery.safeParse(request.query);
    if (!forgeId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    const row = getSimulationForge(parsed.data.userId, forgeId.data);
    if (!row) return reply.status(404).send({ error: 'not_found' });
    return reply.send({ forge: row });
  });

  app.post('/v1/cognitive/graph/nodes', async (request, reply) => {
    const parsed = z
      .object({
        userId: z.string().min(1),
        kind: z.string(),
        label: z.string().min(1),
        summary: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
        ledgerRefType: z.string().nullable().optional(),
        ledgerRefId: z.string().nullable().optional(),
        id: z.string().optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    try {
      atlasRgNodeKindSchema.parse(parsed.data.kind);
      const id = upsertAtlasRgNode({
        userId: parsed.data.userId,
        id: parsed.data.id,
        kind: parsed.data.kind,
        label: parsed.data.label,
        summary: parsed.data.summary,
        metadata: parsed.data.metadata,
        ledgerRefType: parsed.data.ledgerRefType,
        ledgerRefId: parsed.data.ledgerRefId,
      });
      return reply.status(201).send({ nodeId: id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  app.post('/v1/cognitive/graph/edges', async (request, reply) => {
    const parsed = z
      .object({
        userId: z.string().min(1),
        srcNodeId: z.string().min(1),
        dstNodeId: z.string().min(1),
        relation: z.string(),
        weight: z.number().optional(),
        rationale: z.string().optional(),
        meta: z.record(z.unknown()).optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    try {
      atlasRgRelationSchema.parse(parsed.data.relation);
      const id = addAtlasRgEdge({
        userId: parsed.data.userId,
        srcNodeId: parsed.data.srcNodeId,
        dstNodeId: parsed.data.dstNodeId,
        relation: parsed.data.relation,
        weight: parsed.data.weight,
        rationale: parsed.data.rationale,
        meta: parsed.data.meta,
      });
      return reply.status(201).send({ edgeId: id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  app.get('/v1/cognitive/graph/nodes', async (request, reply) => {
    const parsed = userIdQuery.extend({ limit: z.coerce.number().optional() }).safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    return reply.send({ nodes: listAtlasRgNodes(parsed.data.userId, parsed.data.limit ?? 200) });
  });

  app.get('/v1/cognitive/graph/edges', async (request, reply) => {
    const parsed = userIdQuery.extend({ limit: z.coerce.number().optional() }).safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    return reply.send({ edges: listAtlasRgEdges(parsed.data.userId, parsed.data.limit ?? 400) });
  });

  app.get('/v1/cognitive/graph/tensions', async (request, reply) => {
    const parsed = userIdQuery.extend({ limit: z.coerce.number().optional() }).safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    return reply.send({
      edges: listStructuralTensionEdges(parsed.data.userId, parsed.data.limit ?? 80),
    });
  });

  app.get('/v1/cognitive/graph/nodes/:nodeId/neighbors', async (request, reply) => {
    const nodeId = z.string().min(1).safeParse((request.params as { nodeId?: string }).nodeId);
    const parsed = userIdQuery.safeParse(request.query);
    if (!nodeId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    return reply.send(neighborsOf(parsed.data.userId, nodeId.data));
  });

  app.get('/v1/cognitive/graph/nodes/:nodeId/explain', async (request, reply) => {
    const nodeId = z.string().min(1).safeParse((request.params as { nodeId?: string }).nodeId);
    const parsed = userIdQuery.safeParse(request.query);
    if (!nodeId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    const text = explainNeighborhoodPlainLanguage(parsed.data.userId, nodeId.data);
    return reply.send({ plainLanguage: text });
  });

  app.get('/v1/cognitive/graph/query', async (request, reply) => {
    const parsed = userIdQuery
      .extend({
        kind: z.enum(['tensions', 'leverage', 'narrative_divergence_hint']),
      })
      .safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    return reply.send(runGraphReasoningQuery(parsed.data.userId, parsed.data.kind));
  });

  app.post('/v1/cognitive/graph/sync/decision', async (request, reply) => {
    const parsed = z.object({ userId: z.string().min(1), decisionId: z.string().min(1) }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      const nodeId = syncDecisionToGraph(parsed.data.userId, parsed.data.decisionId);
      return reply.status(201).send({ nodeId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  app.post('/v1/cognitive/identity/goals', async (request, reply) => {
    const parsed = z
      .object({
        userId: z.string().min(1),
        aspirationStatement: z.string().min(1),
        traitArchetype: z.string().min(1),
        operationalDefinition: z.string().optional(),
        symbolicVsEnactedNote: z.string().optional(),
        constitutionClauseIds: z.array(z.string()).optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const id = createIdentityGoal(parsed.data);
    return reply.status(201).send({ goalId: id });
  });

  app.get('/v1/cognitive/identity/goals', async (request, reply) => {
    const parsed = userIdQuery.extend({ status: z.string().optional() }).safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    return reply.send({ goals: listIdentityGoals(parsed.data.userId, parsed.data.status) });
  });

  app.patch('/v1/cognitive/identity/goals/:goalId/status', async (request, reply) => {
    const goalId = z.string().min(1).safeParse((request.params as { goalId?: string }).goalId);
    const parsed = z.object({ userId: z.string().min(1), status: z.string() }).safeParse(request.body);
    if (!goalId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      identityGoalStatusSchema.parse(parsed.data.status);
      setIdentityGoalStatus(parsed.data.userId, goalId.data, parsed.data.status);
      return reply.status(204).send();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  app.post('/v1/cognitive/identity/protocols', async (request, reply) => {
    const parsed = z
      .object({
        userId: z.string().min(1),
        identityGoalId: z.string().min(1),
        title: z.string().min(1),
        observableBehaviors: z.array(z.string()).optional(),
        measurableIndicators: z.array(z.string()).optional(),
        environmentalSupports: z.array(z.string()).optional(),
        failurePoints: z.array(z.string()).optional(),
        reviewCadence: z.string().optional(),
        maintenanceRoutines: z.array(z.string()).optional(),
        correctiveProtocols: z.array(z.string()).optional(),
        linkedDecisionIds: z.array(z.string()).optional(),
        linkedEvolutionEventIds: z.array(z.string()).optional(),
        linkedUnfinishedId: z.string().nullable().optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    try {
      const id = createActionProtocol(parsed.data);
      return reply.status(201).send({ protocolId: id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  app.get('/v1/cognitive/identity/goals/:goalId/protocols', async (request, reply) => {
    const goalId = z.string().min(1).safeParse((request.params as { goalId?: string }).goalId);
    const parsed = userIdQuery.safeParse(request.query);
    if (!goalId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    return reply.send({ protocols: listActionProtocolsForGoal(parsed.data.userId, goalId.data) });
  });

  app.post('/v1/cognitive/identity/protocols/:protocolId/reviews', async (request, reply) => {
    const protocolId = z.string().min(1).safeParse((request.params as { protocolId?: string }).protocolId);
    const parsed = z
      .object({
        userId: z.string().min(1),
        behavioralEvidence: z.string(),
        gapAnalysis: z.string(),
        nextAdjustments: z.string(),
      })
      .safeParse(request.body);
    if (!protocolId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      const id = recordProtocolReview({ ...parsed.data, protocolId: protocolId.data });
      return reply.status(201).send({ reviewId: id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  app.post('/v1/cognitive/self-revision', async (request, reply) => {
    const parsed = z
      .object({
        userId: z.string().min(1),
        category: z.string(),
        severity: z.string(),
        detectedPattern: z.string().min(1),
        recommendationTitle: z.string().min(1),
        recommendationBody: z.string().min(1),
        betterStructures: z.array(z.string()).optional(),
        triggerSources: z.array(z.string()).optional(),
        linkedTwinDomains: z.array(z.string()).optional(),
        linkedEvolutionFingerprints: z.array(z.string()).optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    try {
      selfRevisionCategorySchema.parse(parsed.data.category);
      selfRevisionSeveritySchema.parse(parsed.data.severity);
      const id = createSelfRevisionRecord(parsed.data);
      return reply.status(201).send({ recordId: id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  app.post('/v1/cognitive/self-revision/run-triggers', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    const created = runSelfRevisionHeuristicTriggers(parsed.data.userId);
    return reply.send({ createdRecordIds: created });
  });

  app.get('/v1/cognitive/self-revision', async (request, reply) => {
    const parsed = userIdQuery.extend({ status: z.string().optional() }).safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    return reply.send({ records: listSelfRevisionRecords(parsed.data.userId, parsed.data.status) });
  });

  app.patch('/v1/cognitive/self-revision/:recordId/status', async (request, reply) => {
    const recordId = z.string().min(1).safeParse((request.params as { recordId?: string }).recordId);
    const parsed = z
      .object({
        userId: z.string().min(1),
        status: z.string(),
        supersededById: z.string().optional(),
      })
      .safeParse(request.body);
    if (!recordId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      selfRevisionStatusSchema.parse(parsed.data.status);
      setSelfRevisionStatus(parsed.data.userId, recordId.data, parsed.data.status, parsed.data.supersededById);
      return reply.status(204).send();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });
}
