import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { recordDistortionObservation } from '../services/governance/distortionObservationService.js';
import {
  createLegacyArtifact,
  evaluateLegacyExtractionSignals,
  linkLegacyToEntity,
  listLegacyArtifacts,
  reviseLegacyArtifact,
  setLegacyArtifactStatus,
} from '../services/governance/legacyArtifactService.js';
import {
  legacyArtifactKindSchema,
  legacyArtifactStatusSchema,
  legacyProvenanceSchema,
} from '../types/legacyLayer.js';
import { provenanceSchema } from '../types/cognitiveSovereignty.js';

const userIdQuery = z.object({ userId: z.string().min(1) });

export function registerLegacyRoutes(app: FastifyInstance): void {
  app.post('/v1/cognitive/legacy/artifacts', async (request, reply) => {
    const parsed = z
      .object({
        userId: z.string().min(1),
        artifactKind: z.string(),
        title: z.string().min(1),
        body: z.string().min(1),
        durabilityScore: z.number().min(0).max(1).optional(),
        fleetingVsPrincipleNote: z.string().optional(),
        provenance: z.string(),
        extractionTrigger: z.string().optional(),
        extractionContext: z.record(z.unknown()).optional(),
        reviewCadenceHint: z.string().optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    try {
      legacyArtifactKindSchema.parse(parsed.data.artifactKind);
      legacyProvenanceSchema.parse(parsed.data.provenance);
      const id = createLegacyArtifact(parsed.data);
      return reply.status(201).send({ artifactId: id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  app.post('/v1/cognitive/legacy/artifacts/:priorId/revise', async (request, reply) => {
    const priorId = z.string().min(1).safeParse((request.params as { priorId?: string }).priorId);
    const parsed = z
      .object({
        userId: z.string().min(1),
        title: z.string().optional(),
        body: z.string().optional(),
        durabilityScore: z.number().optional(),
        fleetingVsPrincipleNote: z.string().optional(),
        reviewCadenceHint: z.string().optional(),
      })
      .safeParse(request.body);
    if (!priorId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      const id = reviseLegacyArtifact({ ...parsed.data, priorId: priorId.data });
      return reply.status(201).send({ artifactId: id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  app.get('/v1/cognitive/legacy/artifacts', async (request, reply) => {
    const parsed = userIdQuery.extend({ status: z.string().optional() }).safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    return reply.send({ artifacts: listLegacyArtifacts(parsed.data.userId, { status: parsed.data.status }) });
  });

  app.patch('/v1/cognitive/legacy/artifacts/:artifactId/status', async (request, reply) => {
    const artifactId = z.string().min(1).safeParse((request.params as { artifactId?: string }).artifactId);
    const parsed = z.object({ userId: z.string().min(1), status: z.string() }).safeParse(request.body);
    if (!artifactId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      legacyArtifactStatusSchema.parse(parsed.data.status);
      setLegacyArtifactStatus(parsed.data.userId, artifactId.data, parsed.data.status);
      return reply.status(204).send();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  app.post('/v1/cognitive/legacy/links', async (request, reply) => {
    const parsed = z
      .object({
        legacyId: z.string().min(1),
        entityType: z.string().min(1),
        entityId: z.string().min(1),
        linkRole: z.string().optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    const id = linkLegacyToEntity(parsed.data);
    return reply.status(201).send({ linkId: id });
  });

  app.post('/v1/cognitive/legacy/evaluate-extraction', async (request, reply) => {
    const parsed = z.object({ text: z.string().min(1) }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    return reply.send(evaluateLegacyExtractionSignals(parsed.data.text));
  });

  app.post('/v1/cognitive/legacy/distortions', async (request, reply) => {
    const parsed = z
      .object({
        userId: z.string().min(1),
        patternLabel: z.string().min(1),
        description: z.string().min(1),
        provenance: z.string(),
        confidence: z.number().optional(),
        sourceChamberSessionId: z.string().nullable().optional(),
        linkedClaimId: z.string().nullable().optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      provenanceSchema.parse(parsed.data.provenance);
      const id = recordDistortionObservation(parsed.data);
      return reply.status(201).send({ observationId: id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });
}
