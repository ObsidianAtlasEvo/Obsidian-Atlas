import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getTwinTraitHistory, listActiveTwinTraits, setTwinTrait } from '../services/governance/cognitiveTwinService.js';
import {
  linkEvolutionToEntity,
  recordEvolutionEvent,
  summarizeDevelopmentalWindows,
} from '../services/governance/evolutionTimelineService.js';
import {
  completeChamberSessionManual,
  createChamberSession,
  getChamberSession,
  listChamberSessions,
  runTruthChamberAnalysis,
} from '../services/governance/truthChamberService.js';
import {
  bumpRecurrence,
  createUnfinishedItem,
  listOpenUnfinishedRanked,
  recordUnfinishedSurfaced,
  resolveUnfinishedItem,
} from '../services/governance/unfinishedBusinessService.js';
import { evolutionEventTypeSchema } from '../types/longitudinal.js';
import { twinDomainSchema, twinSourceSchema } from '../types/longitudinal.js';
import { unfinishedKindSchema, unfinishedStatusSchema } from '../types/longitudinal.js';
import { truthChamberOutputSchema } from '../types/longitudinal.js';

const userIdQuery = z.object({ userId: z.string().min(1) });

const evolutionEventBody = z.object({
  userId: z.string().min(1),
  eventType: evolutionEventTypeSchema,
  title: z.string().min(1).max(2000),
  body: z.string().min(1).max(50_000),
  significance: z.number().min(0).max(1).optional(),
  evidenceRefs: z.array(z.unknown()).optional(),
  patternFingerprint: z.string().max(64).optional().nullable(),
  userDeclared: z.boolean().optional(),
  narratedSelfImageRisk: z.number().min(0).max(1).optional().nullable(),
  genuineImprovementScore: z.number().min(0).max(1).optional().nullable(),
  relatedDomain: z.string().max(200).optional().nullable(),
});

const evolutionLinkBody = z.object({
  evolutionEventId: z.string().min(1),
  entityType: z.string().min(1).max(120),
  entityId: z.string().min(1).max(120),
  linkRole: z.string().max(80).optional(),
});

const twinTraitBody = z.object({
  userId: z.string().min(1),
  domain: twinDomainSchema,
  traitKey: z.string().min(1).max(200),
  value: z.string().min(1).max(20_000),
  source: twinSourceSchema,
  confidence: z.number().min(0).max(1),
});

const unfinishedBody = z.object({
  userId: z.string().min(1),
  kind: unfinishedKindSchema,
  title: z.string().min(1).max(2000),
  description: z.string().min(1).max(30_000),
  significanceScore: z.number().min(0).max(1).optional(),
  recurrenceScore: z.number().min(0).max(1).optional(),
  urgencyScore: z.number().min(0).max(1).optional(),
  identityRelevanceScore: z.number().min(0).max(1).optional(),
  decisionId: z.string().min(1).optional().nullable(),
  constitutionVersionGroupId: z.string().max(200).optional().nullable(),
  linkedClaimIds: z.array(z.string().min(1)).optional(),
});

const resolveUnfinishedBody = z.object({
  userId: z.string().min(1),
  status: unfinishedStatusSchema,
  resolutionNote: z.string().min(1).max(20_000),
});

const chamberCreateBody = z.object({
  userId: z.string().min(1),
  targetText: z.string().min(1).max(50_000),
  targetClaimId: z.string().min(1).optional().nullable(),
  constitutionClauseIds: z.array(z.string().min(1)).optional(),
  evidenceIds: z.array(z.string().min(1)).optional(),
  decisionIds: z.array(z.string().min(1)).optional(),
});

const chamberManualBody = z.object({
  userId: z.string().min(1),
  output: truthChamberOutputSchema,
});

export function registerLongitudinalRoutes(app: FastifyInstance): void {
  app.post('/v1/cognitive/evolution/events', async (request, reply) => {
    const parsed = evolutionEventBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const id = recordEvolutionEvent({
      userId: parsed.data.userId,
      eventType: parsed.data.eventType,
      title: parsed.data.title,
      body: parsed.data.body,
      significance: parsed.data.significance,
      evidenceRefs: parsed.data.evidenceRefs,
      patternFingerprint: parsed.data.patternFingerprint,
      userDeclared: parsed.data.userDeclared,
      narratedSelfImageRisk: parsed.data.narratedSelfImageRisk,
      genuineImprovementScore: parsed.data.genuineImprovementScore,
      relatedDomain: parsed.data.relatedDomain,
    });
    return reply.status(201).send({ id });
  });

  app.post('/v1/cognitive/evolution/links', async (request, reply) => {
    const parsed = evolutionLinkBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    linkEvolutionToEntity(
      parsed.data.evolutionEventId,
      parsed.data.entityType,
      parsed.data.entityId,
      parsed.data.linkRole
    );
    return reply.status(204).send();
  });

  app.get('/v1/cognitive/evolution/summary', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    return reply.send(summarizeDevelopmentalWindows(parsed.data.userId));
  });

  app.get('/v1/cognitive/twin/traits', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    return reply.send({ traits: listActiveTwinTraits(parsed.data.userId) });
  });

  app.get('/v1/cognitive/twin/traits/history', async (request, reply) => {
    const q = z
      .object({ userId: z.string().min(1), versionGroupId: z.string().min(1).max(200) })
      .safeParse(request.query);
    if (!q.success) {
      return reply.status(400).send({ error: 'validation_error', details: q.error.flatten() });
    }
    return reply.send({ versions: getTwinTraitHistory(q.data.userId, q.data.versionGroupId) });
  });

  app.post('/v1/cognitive/twin/traits', async (request, reply) => {
    const parsed = twinTraitBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const trait = setTwinTrait(parsed.data);
    return reply.status(201).send({ trait });
  });

  app.post('/v1/cognitive/unfinished', async (request, reply) => {
    const parsed = unfinishedBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const item = createUnfinishedItem(parsed.data);
    return reply.status(201).send({ item });
  });

  app.get('/v1/cognitive/unfinished', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    return reply.send({ items: listOpenUnfinishedRanked(parsed.data.userId) });
  });

  app.patch('/v1/cognitive/unfinished/:id/resolve', async (request, reply) => {
    const id = z.string().min(1).safeParse((request.params as { id?: string }).id);
    const parsed = resolveUnfinishedBody.safeParse(request.body);
    if (!id.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      resolveUnfinishedItem(parsed.data.userId, id.data, parsed.data.status, parsed.data.resolutionNote);
      return reply.status(204).send();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  app.patch('/v1/cognitive/unfinished/:id/surface', async (request, reply) => {
    const id = z.string().min(1).safeParse((request.params as { id?: string }).id);
    const parsed = z.object({ userId: z.string().min(1) }).safeParse(request.body);
    if (!id.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      recordUnfinishedSurfaced(parsed.data.userId, id.data);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: 'not_found' });
    }
  });

  app.patch('/v1/cognitive/unfinished/:id/recurrence', async (request, reply) => {
    const id = z.string().min(1).safeParse((request.params as { id?: string }).id);
    const parsed = z
      .object({ userId: z.string().min(1), delta: z.number().min(0).max(1).optional() })
      .safeParse(request.body);
    if (!id.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      bumpRecurrence(parsed.data.userId, id.data, parsed.data.delta);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: 'not_found' });
    }
  });

  app.post('/v1/cognitive/chamber/sessions', async (request, reply) => {
    const parsed = chamberCreateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const sessionId = createChamberSession(parsed.data);
    return reply.status(201).send({ sessionId });
  });

  app.post('/v1/cognitive/chamber/sessions/:sessionId/run', async (request, reply) => {
    const sessionId = z.string().min(1).safeParse((request.params as { sessionId?: string }).sessionId);
    const parsed = userIdQuery.safeParse(request.body);
    if (!sessionId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      const output = await runTruthChamberAnalysis(sessionId.data, parsed.data.userId);
      return reply.send({ output });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  app.post('/v1/cognitive/chamber/sessions/:sessionId/complete', async (request, reply) => {
    const sessionId = z.string().min(1).safeParse((request.params as { sessionId?: string }).sessionId);
    const parsed = chamberManualBody.safeParse(request.body);
    if (!sessionId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      completeChamberSessionManual(parsed.data.userId, sessionId.data, parsed.data.output);
      return reply.status(204).send();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  app.get('/v1/cognitive/chamber/sessions', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    return reply.send({ sessions: listChamberSessions(parsed.data.userId) });
  });

  app.get('/v1/cognitive/chamber/sessions/:sessionId', async (request, reply) => {
    const sessionId = z.string().min(1).safeParse((request.params as { sessionId?: string }).sessionId);
    const parsed = userIdQuery.safeParse(request.query);
    if (!sessionId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    const row = getChamberSession(parsed.data.userId, sessionId.data);
    if (!row) return reply.status(404).send({ error: 'not_found' });
    return reply.send({ session: row });
  });
}
