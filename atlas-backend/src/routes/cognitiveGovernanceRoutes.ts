import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createConstitutionClause,
  evaluateConstitutionalAlignment,
  getConstitutionVersionHistory,
  listActiveConstitutionClauses,
} from '../services/governance/constitutionalCoreService.js';
import { dispatchCognitiveCommand } from '../services/governance/cognitiveOrchestrator.js';
import {
  addDecisionOption,
  createDecisionRecord,
  getDecisionWithOptions,
  listDecisions,
  markChosenOption,
  recordDecisionOutcome,
  scheduleDecisionReview,
  updateDecisionAnalysis,
} from '../services/governance/decisionLedgerService.js';
import {
  createClaim,
  createEvidence,
  linkClaimToEvidence,
  listActiveClaims,
  listOpenContradictions,
  registerContradiction,
  resolveContradiction,
  supersedeClaim,
} from '../services/governance/truthEvidenceLedgerService.js';
import {
  claimTypeSchema,
  cognitiveCommandKindSchema,
  constitutionClauseTypeSchema,
  contradictionStatusSchema,
  epistemicStateSchema,
  evidenceSourceClassSchema,
  linkRoleSchema,
  provenanceSchema,
} from '../types/cognitiveSovereignty.js';

const userIdQuery = z.object({ userId: z.string().min(1) });

const createClauseBody = z.object({
  userId: z.string().min(1),
  clauseType: constitutionClauseTypeSchema,
  title: z.string().min(1).max(500),
  body: z.string().min(1).max(50_000),
  priority: z.number().int().optional(),
  protected: z.boolean().optional(),
  versionGroupId: z.string().min(8).max(64).optional(),
});

const alignmentBody = z.object({
  userId: z.string().min(1),
  recommendationText: z.string().min(1).max(100_000),
  userActionSummary: z.string().max(20_000).optional(),
});

const dispatchBody = z.object({
  userId: z.string().min(1),
  kind: cognitiveCommandKindSchema,
  rawText: z.string().max(200_000).optional().default(''),
  recommendationDraft: z.string().max(100_000).optional(),
});

const createClaimBody = z.object({
  userId: z.string().min(1),
  statement: z.string().min(1).max(20_000),
  claimType: claimTypeSchema,
  epistemicState: epistemicStateSchema,
  confidence: z.number().min(0).max(1),
  provenance: provenanceSchema,
  constitutionClauseId: z.string().min(1).optional().nullable(),
});

const supersedeClaimBody = z.object({
  userId: z.string().min(1),
  newStatement: z.string().min(1).max(20_000),
});

const createEvidenceBody = z.object({
  userId: z.string().min(1),
  sourceClass: evidenceSourceClassSchema,
  excerpt: z.string().min(1).max(30_000),
  sourceRef: z.string().max(4000).optional().nullable(),
  retrievedAt: z.string().optional().nullable(),
  supportStrength: z.number().min(0).max(1).optional(),
});

const linkBody = z.object({
  claimId: z.string().min(1),
  evidenceId: z.string().min(1),
  linkRole: linkRoleSchema,
  strength: z.number().min(0).max(1).optional(),
});

const contradictionBody = z.object({
  userId: z.string().min(1),
  claimAId: z.string().min(1),
  claimBId: z.string().min(1),
  contradictionStrength: z.number().min(0).max(1).optional(),
});

const resolveContradictionBody = z.object({
  userId: z.string().min(1),
  status: contradictionStatusSchema,
  resolutionNote: z.string().min(1).max(10_000),
});

const createDecisionBody = z.object({
  userId: z.string().min(1),
  statement: z.string().min(1).max(10_000),
  context: z.string().max(50_000).optional(),
  constitutionClauseIds: z.array(z.string().min(1)).optional(),
  linkedClaimIds: z.array(z.string().min(1)).optional(),
});

const decisionOptionBody = z.object({
  label: z.string().min(1).max(2000),
  rationale: z.string().max(20_000).optional(),
  rejected: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const decisionAnalysisBody = z.object({
  userId: z.string().min(1),
  atlasRecommendation: z.string().max(50_000).optional(),
  userPreferenceSnapshot: z.string().max(20_000).optional(),
  risks: z.array(z.string()).optional(),
  tradeoffs: z.array(z.string()).optional(),
  expectedUpside: z.string().max(10_000).optional(),
  predictedDownside: z.string().max(10_000).optional(),
});

const decisionOutcomeBody = z.object({
  userId: z.string().min(1),
  actualOutcome: z.string().min(1).max(20_000),
  varianceAnalysis: z.string().max(20_000).optional(),
  lessonExtracted: z.string().max(20_000).optional(),
  recurringPatternNote: z.string().max(20_000).optional(),
});

const reviewScheduleBody = z.object({
  userId: z.string().min(1),
  checkpointAtIso: z.string().min(1),
});

const chosenOptionBody = z.object({
  userId: z.string().min(1),
    optionId: z.string().min(1),
});

export function registerCognitiveGovernanceRoutes(app: FastifyInstance): void {
  app.post('/v1/cognitive/orchestrator/dispatch', async (request, reply) => {
    const parsed = dispatchBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const d = parsed.data;
    const result = dispatchCognitiveCommand({
      kind: d.kind,
      userId: d.userId,
      rawText: d.rawText,
      recommendationDraft: d.recommendationDraft,
    });
    return reply.send(result);
  });

  app.post('/v1/cognitive/alignment/evaluate', async (request, reply) => {
    const parsed = alignmentBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const out = evaluateConstitutionalAlignment(parsed.data);
    return reply.send(out);
  });

  app.get('/v1/cognitive/constitution/clauses', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    return reply.send({ clauses: listActiveConstitutionClauses(parsed.data.userId) });
  });

  app.get('/v1/cognitive/constitution/history', async (request, reply) => {
    const q = z
      .object({ userId: z.string().min(1), versionGroupId: z.string().min(8).max(64) })
      .safeParse(request.query);
    if (!q.success) {
      return reply.status(400).send({ error: 'validation_error', details: q.error.flatten() });
    }
    return reply.send({ versions: getConstitutionVersionHistory(q.data.userId, q.data.versionGroupId) });
  });

  app.post('/v1/cognitive/constitution/clauses', async (request, reply) => {
    const parsed = createClauseBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const row = createConstitutionClause({
      userId: parsed.data.userId,
      clauseType: parsed.data.clauseType,
      title: parsed.data.title,
      body: parsed.data.body,
      priority: parsed.data.priority,
      protected: parsed.data.protected,
      versionGroupId: parsed.data.versionGroupId,
    });
    return reply.status(201).send({ clause: row });
  });

  app.get('/v1/cognitive/ledger/claims', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    return reply.send({ claims: listActiveClaims(parsed.data.userId) });
  });

  app.get('/v1/cognitive/ledger/contradictions', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    return reply.send({ contradictions: listOpenContradictions(parsed.data.userId) });
  });

  app.post('/v1/cognitive/ledger/claims', async (request, reply) => {
    const parsed = createClaimBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const claim = createClaim(parsed.data);
    return reply.status(201).send({ claim });
  });

  app.post('/v1/cognitive/ledger/claims/:claimId/supersede', async (request, reply) => {
    const claimId = z.string().min(1).safeParse((request.params as { claimId?: string }).claimId);
    const parsed = supersedeClaimBody.safeParse(request.body);
    if (!claimId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      const claim = supersedeClaim(parsed.data.userId, claimId.data, parsed.data.newStatement);
      return reply.status(201).send({ claim });
    } catch (e) {
      return reply.status(404).send({ error: 'claim_not_found' });
    }
  });

  app.post('/v1/cognitive/ledger/evidence', async (request, reply) => {
    const parsed = createEvidenceBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const evidence = createEvidence(parsed.data);
    return reply.status(201).send({ evidence });
  });

  app.post('/v1/cognitive/ledger/links', async (request, reply) => {
    const parsed = linkBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    linkClaimToEvidence(parsed.data);
    return reply.status(204).send();
  });

  app.post('/v1/cognitive/ledger/contradictions', async (request, reply) => {
    const parsed = contradictionBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const id = registerContradiction(parsed.data);
    return reply.status(201).send({ id });
  });

  app.patch('/v1/cognitive/ledger/contradictions/:id', async (request, reply) => {
    const id = z.string().min(1).safeParse((request.params as { id?: string }).id);
    const parsed = resolveContradictionBody.safeParse(request.body);
    if (!id.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      resolveContradiction(parsed.data.userId, id.data, parsed.data.status, parsed.data.resolutionNote);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: 'contradiction_not_found' });
    }
  });

  app.get('/v1/cognitive/decisions', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    return reply.send({ decisions: listDecisions(parsed.data.userId) });
  });

  app.get('/v1/cognitive/decisions/:decisionId', async (request, reply) => {
    const decisionId = z.string().min(1).safeParse((request.params as { decisionId?: string }).decisionId);
    const parsed = userIdQuery.safeParse(request.query);
    if (!decisionId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    const bundle = getDecisionWithOptions(parsed.data.userId, decisionId.data);
    if (!bundle) return reply.status(404).send({ error: 'not_found' });
    return reply.send(bundle);
  });

  app.post('/v1/cognitive/decisions', async (request, reply) => {
    const parsed = createDecisionBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const decision = createDecisionRecord(parsed.data);
    return reply.status(201).send({ decision });
  });

  app.post('/v1/cognitive/decisions/:decisionId/options', async (request, reply) => {
    const decisionId = z.string().min(1).safeParse((request.params as { decisionId?: string }).decisionId);
    const parsed = decisionOptionBody.safeParse(request.body);
    if (!decisionId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    const opt = addDecisionOption({ decisionId: decisionId.data, ...parsed.data });
    return reply.status(201).send({ option: opt });
  });

  app.patch('/v1/cognitive/decisions/:decisionId/analysis', async (request, reply) => {
    const decisionId = z.string().min(1).safeParse((request.params as { decisionId?: string }).decisionId);
    const parsed = decisionAnalysisBody.safeParse(request.body);
    if (!decisionId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      updateDecisionAnalysis({ decisionId: decisionId.data, ...parsed.data });
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: 'decision_not_found' });
    }
  });

  app.patch('/v1/cognitive/decisions/:decisionId/outcome', async (request, reply) => {
    const decisionId = z.string().min(1).safeParse((request.params as { decisionId?: string }).decisionId);
    const parsed = decisionOutcomeBody.safeParse(request.body);
    if (!decisionId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      recordDecisionOutcome({ decisionId: decisionId.data, ...parsed.data });
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: 'decision_not_found' });
    }
  });

  app.patch('/v1/cognitive/decisions/:decisionId/review', async (request, reply) => {
    const decisionId = z.string().min(1).safeParse((request.params as { decisionId?: string }).decisionId);
    const parsed = reviewScheduleBody.safeParse(request.body);
    if (!decisionId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      scheduleDecisionReview({ decisionId: decisionId.data, ...parsed.data });
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: 'decision_not_found' });
    }
  });

  app.patch('/v1/cognitive/decisions/:decisionId/chosen-option', async (request, reply) => {
    const decisionId = z.string().min(1).safeParse((request.params as { decisionId?: string }).decisionId);
    const parsed = chosenOptionBody.safeParse(request.body);
    if (!decisionId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      markChosenOption(parsed.data.userId, decisionId.data, parsed.data.optionId);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: 'not_found' });
    }
  });
}
