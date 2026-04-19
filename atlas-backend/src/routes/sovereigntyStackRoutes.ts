/**
 * sovereigntyStackRoutes.ts — Phase 0.95 / 0.97 / 0.98 / 0.985–0.99 HTTP surface.
 *
 * Exposes the 35 intelligence services that power the Sovereign Interface,
 * Operational Sovereignty, Truth & Reality Spine, External Action Plane,
 * Connector Federation, Constitutional Assurance, Background Agency, and
 * Platform Sovereignty layers.
 *
 * Every handler:
 *   - validates userId via zod (sessions already attached upstream)
 *   - wraps service calls in try/catch
 *   - returns safe JSON with a consistent shape
 *   - never throws
 *
 * These routes surface real governed state — no synthetic data, no mock panels.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

// Phase 0.95 — Operational Sovereignty
import { getWorkstreams } from '../services/intelligence/workstreamStateService.js';
import { getFronts } from '../services/intelligence/frontModelService.js';
import { getChains } from '../services/intelligence/executionContinuityService.js';
import { getOpenCommitments } from '../services/intelligence/commitmentTrackerService.js';
import { getLeverageCandidates } from '../services/intelligence/leverageEngineService.js';
import { getDecisions } from '../services/intelligence/decisionLedgerService.js';
import { getOutcomeFeedback } from '../services/intelligence/outcomeFeedbackService.js';
import {
  composeDirectiveState,
  formatDirectiveSummary,
} from '../services/intelligence/directiveCenterService.js';
import { generateOperationalReview } from '../services/intelligence/operationalReviewService.js';

// Phase 0.97 — Truth & Reality Spine
import { getClaims } from '../services/intelligence/claimGovernanceService.js';
import { getEvidenceForClaim } from '../services/intelligence/truthEvidenceLedgerService.js';
import { getAssumptions } from '../services/intelligence/assumptionRegistryService.js';
import { getContradictions } from '../services/intelligence/contradictionTensionService.js';
import { getDriftEvents } from '../services/intelligence/realityDriftMonitorService.js';

// Phase 0.98 — Sovereign Interface
import {
  buildHomeSurface,
  getLatestHomeSurface,
  formatHomeSummary,
} from '../services/intelligence/homeSurfaceService.js';
import {
  buildDirectiveSurface,
  getLatestDirectiveSurface,
} from '../services/intelligence/directiveUISurfaceService.js';
import {
  getConsoleState,
  updateConsoleState,
  type CreatorConsoleUpdateInput,
} from '../services/intelligence/creatorConsoleService.js';
import {
  buildTruthObservatory,
  formatTruthSummary,
} from '../services/intelligence/truthSurfaceService.js';
import {
  getTimelineEvents,
  groupTimelineEvents,
} from '../services/intelligence/timelineSurfaceService.js';
import { getTransparencyLog } from '../services/intelligence/behaviorTransparencyService.js';
import {
  buildCognitionMap,
  getLatestMap,
} from '../services/intelligence/cognitionMapUIService.js';

// Phase 0.985–0.99 — Platform Sovereignty
import {
  getActionContracts,
  approveContract,
  rejectContract,
  createActionContract,
  type ActionStatus,
} from '../services/intelligence/actionContractService.js';
import {
  getConnectors,
  registerConnector,
  updateConnectorHealth,
} from '../services/intelligence/connectorRegistryService.js';
import {
  getWatcherEvents,
  resolveWatcherEvent,
  runScheduledWatcherSweep,
} from '../services/intelligence/watcherFrameworkService.js';
import {
  runAndPersistFullEvalSuite,
  getRecentEvalResults,
  classifyReleaseReadiness,
  computeConstitutionalHealth,
} from '../services/intelligence/constitutionalEvalService.js';
import {
  getAuditLog,
  formatAuditSummary,
  logGovernanceEvent,
  type AuditEventType,
} from '../services/intelligence/auditGovernanceService.js';

// User Sovereignty Controls (Phase 0.9 governance)
import {
  freeze,
  suppress,
  confirm,
  quarantine,
  revert,
  getActiveControls,
  resolveControl,
} from '../services/intelligence/userSovereigntyService.js';

// Phase 0.985 — Action Executor
import {
  approveActionContract,
  rejectActionContract,
  escalateActionContract,
} from '../services/intelligence/actionExecutorService.js';
import { dispatchContract } from '../services/intelligence/actionDispatchBroker.js';
import { reverseContract } from '../services/intelligence/actionReversalLayer.js';
import { ingestActionResult } from '../services/intelligence/actionResultIngestionService.js';

// Phase 0.986 — Connector Outbound + Sync
import { runIngestionCycle } from '../services/intelligence/connectorIngestionPipeline.js';
import { runSyncHealthCheck } from '../services/intelligence/connectorSyncMonitor.js';
import { getConnectorById } from '../services/intelligence/connectorRegistryService.js';

// ── Common schemas ──────────────────────────────────────────────────────────

const userIdQuery = z.object({ userId: z.string().min(1).max(120) });

const actionStatusSchema = z.enum([
  'staged', 'approved', 'executing', 'completed', 'rejected', 'failed',
]);

const auditEventTypeSchema = z.enum([
  'freeze', 'revert', 'policy_mutation', 'suppression',
  'quarantine', 'inspection', 'approval',
]);

const sovereigntyScopeSchema = z.enum([
  'global', 'domain', 'memory', 'chamber', 'project', 'policy_field',
]);

// Small helper: safe handler that never throws and always returns JSON.
function safe<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  return fn().catch((err) => {
    console.error('[sovereigntyStackRoutes] handler error:', err);
    return { error: 'internal_error' } as unknown as T;
  });
}

export function registerSovereigntyStackRoutes(app: FastifyInstance): void {
  // ── Phase 0.98: Home / Directive / Truth / Timeline / Cognition ─────────────

  app.get('/v1/sovereignty/home-surface', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const state = await safe(() => getLatestHomeSurface(parsed.data.userId));
    return reply.send({ state });
  });

  app.post('/v1/sovereignty/home-surface/rebuild', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.body ?? request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const state = await safe(() => buildHomeSurface(parsed.data.userId));
    const summary = state && !('error' in (state as object))
      ? formatHomeSummary(state as Parameters<typeof formatHomeSummary>[0])
      : null;
    return reply.send({ state, summary });
  });

  app.get('/v1/sovereignty/directive-surface', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const [latest, state] = await Promise.all([
      safe(() => getLatestDirectiveSurface(parsed.data.userId)),
      safe(() => composeDirectiveState(parsed.data.userId)),
    ]);
    const summary = state && !('error' in (state as object))
      ? formatDirectiveSummary(state as Parameters<typeof formatDirectiveSummary>[0])
      : null;
    return reply.send({ latest, state, summary });
  });

  app.post('/v1/sovereignty/directive-surface/rebuild', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.body ?? request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const state = await safe(() => buildDirectiveSurface(parsed.data.userId));
    return reply.send({ state });
  });

  app.get('/v1/sovereignty/truth-observatory', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const observatory = await safe(() => buildTruthObservatory(parsed.data.userId));
    const summary = observatory && !('error' in (observatory as object))
      ? formatTruthSummary(observatory as Parameters<typeof formatTruthSummary>[0])
      : null;
    return reply.send({ observatory, summary });
  });

  app.get('/v1/sovereignty/timeline', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const events = await safe(() => getTimelineEvents(parsed.data.userId));
    if (Array.isArray(events)) {
      return reply.send({ events, grouped: groupTimelineEvents(events) });
    }
    return reply.send({ events: [], grouped: {} });
  });

  app.get('/v1/sovereignty/transparency-log', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const log = await safe(() => getTransparencyLog(parsed.data.userId));
    return reply.send({ log });
  });

  const cognitionMapQuery = z.object({
    userId: z.string().min(1),
    mapType: z.string().min(1).optional(),
  });
  app.get('/v1/sovereignty/cognition-map', async (request, reply) => {
    const parsed = cognitionMapQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const mapType = parsed.data.mapType ?? 'identity';
    const map = await safe(() => getLatestMap(parsed.data.userId, mapType));
    return reply.send({ map });
  });

  app.post('/v1/sovereignty/cognition-map/rebuild', async (request, reply) => {
    const parsed = cognitionMapQuery.safeParse(request.body ?? request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const mapType = parsed.data.mapType ?? 'identity';
    const map = await safe(() => buildCognitionMap(parsed.data.userId, mapType));
    return reply.send({ map });
  });

  // ── Phase 0.98: Creator Console (governed controls panel state) ─────────────

  app.get('/v1/sovereignty/creator-console', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const state = await safe(() => getConsoleState(parsed.data.userId));
    return reply.send({ state });
  });

  const consoleUpdateBody = z.object({
    userId: z.string().min(1),
    memory_state: z.record(z.string(), z.unknown()).optional(),
    identity_state: z.record(z.string(), z.unknown()).optional(),
    policy_state: z.record(z.string(), z.unknown()).optional(),
    chamber_state: z.record(z.string(), z.unknown()).optional(),
    truth_state: z.record(z.string(), z.unknown()).optional(),
    operational_state: z.record(z.string(), z.unknown()).optional(),
    sovereignty_actions: z.record(z.string(), z.unknown()).optional(),
  });
  app.post('/v1/sovereignty/creator-console/update', async (request, reply) => {
    const parsed = consoleUpdateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const { userId, ...rest } = parsed.data;
    const state = await safe(() => updateConsoleState(userId, rest as CreatorConsoleUpdateInput));
    return reply.send({ state });
  });

  // ── Phase 0.95: Operational Sovereignty reads ───────────────────────────────

  app.get('/v1/sovereignty/workstreams', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const workstreams = await safe(() => getWorkstreams(parsed.data.userId));
    return reply.send({ workstreams });
  });

  app.get('/v1/sovereignty/fronts', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const fronts = await safe(() => getFronts(parsed.data.userId));
    return reply.send({ fronts });
  });

  app.get('/v1/sovereignty/chains', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const chains = await safe(() => getChains(parsed.data.userId));
    return reply.send({ chains });
  });

  app.get('/v1/sovereignty/commitments', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const commitments = await safe(() => getOpenCommitments(parsed.data.userId));
    return reply.send({ commitments });
  });

  app.get('/v1/sovereignty/leverage', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const candidates = await safe(() => getLeverageCandidates(parsed.data.userId));
    return reply.send({ candidates });
  });

  app.get('/v1/sovereignty/decisions', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const decisions = await safe(() => getDecisions(parsed.data.userId));
    return reply.send({ decisions });
  });

  app.get('/v1/sovereignty/outcome-feedback', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const feedback = await safe(() => getOutcomeFeedback(parsed.data.userId));
    return reply.send({ feedback });
  });

  app.get('/v1/sovereignty/operational-review', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const review = await safe(() => generateOperationalReview(parsed.data.userId));
    return reply.send({ review });
  });

  // ── Phase 0.97: Truth spine reads ───────────────────────────────────────────

  app.get('/v1/sovereignty/claims', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const claims = await safe(() => getClaims(parsed.data.userId));
    return reply.send({ claims });
  });

  const claimEvidenceQuery = z.object({
    userId: z.string().min(1),
    claimId: z.string().min(1),
  });
  app.get('/v1/sovereignty/claim-evidence', async (request, reply) => {
    const parsed = claimEvidenceQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const evidence = await safe(() => getEvidenceForClaim(parsed.data.userId, parsed.data.claimId));
    return reply.send({ evidence });
  });

  app.get('/v1/sovereignty/assumptions', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const assumptions = await safe(() => getAssumptions(parsed.data.userId));
    return reply.send({ assumptions });
  });

  app.get('/v1/sovereignty/contradictions', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const contradictions = await safe(() => getContradictions(parsed.data.userId));
    return reply.send({ contradictions });
  });

  app.get('/v1/sovereignty/drift-events', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const events = await safe(() => getDriftEvents(parsed.data.userId));
    return reply.send({ events });
  });

  // ── Phase 0.985: Action Contracts (staging ledger — NOT an executor) ────────

  const actionListQuery = z.object({
    userId: z.string().min(1),
    status: actionStatusSchema.optional(),
  });
  app.get('/v1/sovereignty/actions', async (request, reply) => {
    const parsed = actionListQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const contracts = await safe(() =>
      getActionContracts(parsed.data.userId, parsed.data.status as ActionStatus | undefined),
    );
    return reply.send({ contracts });
  });

  const actionCreateBody = z.object({
    userId: z.string().min(1),
    action_type: z.string().min(1).max(120),
    target: z.string().min(1).max(240),
    payload: z.record(z.string(), z.unknown()).optional(),
    reversibility: z.enum(['reversible', 'partially_reversible', 'irreversible']).optional(),
    risk_class: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  });
  app.post('/v1/sovereignty/actions', async (request, reply) => {
    const parsed = actionCreateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const { userId, ...rest } = parsed.data;
    const contract = await safe(() => createActionContract(userId, rest));
    // Governance event: action staged
    if (contract && !('error' in (contract as object))) {
      logGovernanceEvent(userId, 'approval', {
        actor: 'user',
        target: 'action_contract',
        after_state: { status: 'staged' },
        audit_metadata: { action_type: rest.action_type },
      }).catch(() => {});
    }
    return reply.send({ contract });
  });

  const actionActionBody = z.object({
    userId: z.string().min(1),
    contractId: z.string().min(1),
  });
  app.post('/v1/sovereignty/actions/approve', async (request, reply) => {
    const parsed = actionActionBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const ok = await safe(() => approveContract(parsed.data.userId, parsed.data.contractId));
    logGovernanceEvent(parsed.data.userId, 'approval', {
      actor: 'user',
      target: 'action_contract',
      after_state: { status: 'approved' },
      audit_metadata: { contract_id: parsed.data.contractId },
    }).catch(() => {});
    return reply.send({ ok });
  });

  app.post('/v1/sovereignty/actions/reject', async (request, reply) => {
    const parsed = actionActionBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const ok = await safe(() => rejectContract(parsed.data.userId, parsed.data.contractId));
    logGovernanceEvent(parsed.data.userId, 'approval', {
      actor: 'user',
      target: 'action_contract',
      after_state: { status: 'rejected' },
      audit_metadata: { contract_id: parsed.data.contractId },
    }).catch(() => {});
    return reply.send({ ok });
  });

  // ── Phase 0.986: Connector Registry (live outbound + ingestion) ─────────────

  app.get('/v1/sovereignty/connectors', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const connectors = await safe(() => getConnectors(parsed.data.userId));
    return reply.send({ connectors });
  });

  const connectorCreateBody = z.object({
    userId: z.string().min(1),
    connector_name: z.string().min(1).max(120),
    connector_type: z.string().max(80).optional(),
    auth_method: z.string().max(80).optional(),
  });
  app.post('/v1/sovereignty/connectors', async (request, reply) => {
    const parsed = connectorCreateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const { userId, ...rest } = parsed.data;
    const connector = await safe(() => registerConnector(userId, rest));
    return reply.send({ connector });
  });

  const connectorHealthBody = z.object({
    userId: z.string().min(1),
    connectorId: z.string().min(1),
    health_status: z.enum(['healthy', 'degraded', 'offline', 'unknown']),
  });
  app.post('/v1/sovereignty/connectors/health', async (request, reply) => {
    const parsed = connectorHealthBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const ok = await safe(() =>
      updateConnectorHealth(
        parsed.data.userId,
        parsed.data.connectorId,
        parsed.data.health_status,
      ),
    );
    return reply.send({ ok });
  });

  // ── Phase 0.988: Watcher framework ──────────────────────────────────────────

  const watcherListQuery = z.object({
    userId: z.string().min(1),
    resolved: z.coerce.boolean().optional(),
  });
  app.get('/v1/sovereignty/watchers', async (request, reply) => {
    const parsed = watcherListQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const events = await safe(() =>
      getWatcherEvents(parsed.data.userId, parsed.data.resolved),
    );
    return reply.send({ events });
  });

  app.post('/v1/sovereignty/watchers/sweep', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.body ?? request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const result = await safe(() => runScheduledWatcherSweep(parsed.data.userId));
    return reply.send({ result });
  });

  const watcherResolveBody = z.object({
    userId: z.string().min(1),
    eventId: z.string().min(1),
  });
  app.post('/v1/sovereignty/watchers/resolve', async (request, reply) => {
    const parsed = watcherResolveBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const ok = await safe(() =>
      resolveWatcherEvent(parsed.data.userId, parsed.data.eventId),
    );
    return reply.send({ ok });
  });

  // ── Phase 0.987: Constitutional Eval ────────────────────────────────────────

  app.get('/v1/sovereignty/eval/results', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const results = await safe(() => getRecentEvalResults(parsed.data.userId));
    if (Array.isArray(results)) {
      const readiness = classifyReleaseReadiness(results);
      const health = computeConstitutionalHealth(results);
      return reply.send({ results, readiness, health });
    }
    return reply.send({ results: [], readiness: { ready: false, blockingFailures: [] }, health: { score: 0, passed: false } });
  });

  app.post('/v1/sovereignty/eval/run', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.body ?? request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const results = await safe(() => runAndPersistFullEvalSuite(parsed.data.userId));
    return reply.send({ results });
  });

  // ── Phase 0.99: Audit Governance Log ────────────────────────────────────────

  const auditListQuery = z.object({
    userId: z.string().min(1),
    eventType: auditEventTypeSchema.optional(),
  });
  app.get('/v1/sovereignty/audit-log', async (request, reply) => {
    const parsed = auditListQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const events = await safe(() =>
      getAuditLog(parsed.data.userId, parsed.data.eventType as AuditEventType | undefined),
    );
    if (Array.isArray(events)) {
      return reply.send({ events, summary: formatAuditSummary(events) });
    }
    return reply.send({ events: [], summary: 'no audit events' });
  });

  // ── Phase 0.9: User Sovereignty Controls (freeze/suppress/confirm/quarantine/revert) ─

  const controlActionBody = z.object({
    userId: z.string().min(1),
    scope: sovereigntyScopeSchema,
    scopeKey: z.string().max(200).optional(),
    reason: z.string().max(500).optional(),
  });

  app.post('/v1/sovereignty/controls/freeze', async (request, reply) => {
    const parsed = controlActionBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const id = await safe(() =>
      freeze(parsed.data.userId, parsed.data.scope, parsed.data.scopeKey, parsed.data.reason),
    );
    logGovernanceEvent(parsed.data.userId, 'freeze', {
      actor: 'user',
      target: parsed.data.scope,
      after_state: { scope_key: parsed.data.scopeKey },
      audit_metadata: { reason: parsed.data.reason },
    }).catch(() => {});
    return reply.send({ id });
  });

  app.post('/v1/sovereignty/controls/suppress', async (request, reply) => {
    const parsed = controlActionBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const id = await safe(() =>
      suppress(parsed.data.userId, parsed.data.scope, parsed.data.scopeKey, parsed.data.reason),
    );
    logGovernanceEvent(parsed.data.userId, 'suppression', {
      actor: 'user',
      target: parsed.data.scope,
      after_state: { scope_key: parsed.data.scopeKey },
      audit_metadata: { reason: parsed.data.reason },
    }).catch(() => {});
    return reply.send({ id });
  });

  app.post('/v1/sovereignty/controls/confirm', async (request, reply) => {
    const parsed = controlActionBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const id = await safe(() =>
      confirm(parsed.data.userId, parsed.data.scope, parsed.data.scopeKey, parsed.data.reason),
    );
    logGovernanceEvent(parsed.data.userId, 'approval', {
      actor: 'user',
      target: parsed.data.scope,
      after_state: { scope_key: parsed.data.scopeKey },
      audit_metadata: { reason: parsed.data.reason, control: 'confirm' },
    }).catch(() => {});
    return reply.send({ id });
  });

  app.post('/v1/sovereignty/controls/quarantine', async (request, reply) => {
    const parsed = controlActionBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const id = await safe(() =>
      quarantine(parsed.data.userId, parsed.data.scope, parsed.data.scopeKey, parsed.data.reason),
    );
    logGovernanceEvent(parsed.data.userId, 'quarantine', {
      actor: 'user',
      target: parsed.data.scope,
      after_state: { scope_key: parsed.data.scopeKey },
      audit_metadata: { reason: parsed.data.reason },
    }).catch(() => {});
    return reply.send({ id });
  });

  const revertBody = z.object({
    userId: z.string().min(1),
    scope: sovereigntyScopeSchema,
    scopeKey: z.string().max(200).optional(),
    reason: z.string().max(500).optional(),
  });
  app.post('/v1/sovereignty/controls/revert', async (request, reply) => {
    const parsed = revertBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const id = await safe(() =>
      revert(parsed.data.userId, parsed.data.scope, parsed.data.scopeKey, parsed.data.reason),
    );
    logGovernanceEvent(parsed.data.userId, 'revert', {
      actor: 'user',
      target: parsed.data.scope,
      before_state: { scope_key: parsed.data.scopeKey },
      audit_metadata: { reason: parsed.data.reason },
    }).catch(() => {});
    return reply.send({ id });
  });

  app.get('/v1/sovereignty/controls/active', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const controls = await safe(() => getActiveControls(parsed.data.userId));
    return reply.send({ controls });
  });

  const controlResolveBody = z.object({ controlId: z.string().min(1) });
  app.post('/v1/sovereignty/controls/resolve', async (request, reply) => {
    const parsed = controlResolveBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    await safe(() => resolveControl(parsed.data.controlId));
    return reply.send({ ok: true });
  });

  // ── Phase 0.985: Action Executor — approve / reject / dispatch / reverse ───

  const actionApproveBody = z.object({
    userId: z.string().min(1),
    contractId: z.string().min(1),
    tier: z.enum(['auto', 'user_confirm', 'multi_step', 'blocked']).optional(),
    approverId: z.string().max(120).optional(),
  });
  app.post('/v1/sovereignty/action-contracts/:id/approve', async (request, reply) => {
    const merged = { ...(request.body as object), contractId: (request.params as { id?: string }).id };
    const parsed = actionApproveBody.safeParse(merged);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const result = await safe(() =>
      approveActionContract(
        parsed.data.userId,
        parsed.data.contractId,
        parsed.data.tier,
        parsed.data.approverId,
      ),
    );
    return reply.send({ result });
  });

  const actionRejectBody = z.object({
    userId: z.string().min(1),
    contractId: z.string().min(1),
    reason: z.string().min(1).max(500),
  });
  app.post('/v1/sovereignty/action-contracts/:id/reject', async (request, reply) => {
    const merged = { ...(request.body as object), contractId: (request.params as { id?: string }).id };
    const parsed = actionRejectBody.safeParse(merged);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const result = await safe(() =>
      rejectActionContract(parsed.data.userId, parsed.data.contractId, parsed.data.reason),
    );
    return reply.send({ result });
  });

  app.post('/v1/sovereignty/action-contracts/:id/escalate', async (request, reply) => {
    const merged = { ...(request.body as object), contractId: (request.params as { id?: string }).id };
    const parsed = actionRejectBody.safeParse(merged);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const result = await safe(() =>
      escalateActionContract(parsed.data.userId, parsed.data.contractId, parsed.data.reason),
    );
    return reply.send({ result });
  });

  const actionDispatchBody = z.object({
    userId: z.string().min(1),
    contractId: z.string().min(1),
    ingest: z.boolean().optional(),
  });
  app.post('/v1/sovereignty/action-contracts/:id/dispatch', async (request, reply) => {
    const merged = { ...(request.body as object), contractId: (request.params as { id?: string }).id };
    const parsed = actionDispatchBody.safeParse(merged);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const result = await safe(() => dispatchContract(parsed.data.userId, parsed.data.contractId));
    if (
      result &&
      !('error' in (result as object)) &&
      parsed.data.ingest !== false
    ) {
      const dispatch = result as Awaited<ReturnType<typeof dispatchContract>>;
      if (dispatch.success) {
        await safe(() =>
          ingestActionResult(parsed.data.userId, parsed.data.contractId, dispatch),
        );
      }
    }
    return reply.send({ result });
  });

  const actionReverseBody = z.object({
    userId: z.string().min(1),
    contractId: z.string().min(1),
    reason: z.string().min(1).max(500),
  });
  app.post('/v1/sovereignty/action-contracts/:id/reverse', async (request, reply) => {
    const merged = { ...(request.body as object), contractId: (request.params as { id?: string }).id };
    const parsed = actionReverseBody.safeParse(merged);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const result = await safe(() =>
      reverseContract(parsed.data.userId, parsed.data.contractId, parsed.data.reason),
    );
    return reply.send({ result });
  });

  // ── Phase 0.986: Connector outbound + sync health ──────────────────────────

  const connectorSyncBody = z.object({
    userId: z.string().min(1),
    connectorId: z.string().min(1),
  });
  app.post('/v1/sovereignty/connectors/:id/sync', async (request, reply) => {
    const merged = { ...(request.body as object), connectorId: (request.params as { id?: string }).id };
    const parsed = connectorSyncBody.safeParse(merged);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const connector = await safe(() =>
      getConnectorById(parsed.data.userId, parsed.data.connectorId),
    );
    if (!connector || 'error' in (connector as object)) {
      return reply.send({ result: { connectorId: parsed.data.connectorId, skipped: true, reason: 'connector_not_found' } });
    }
    const result = await safe(() =>
      runIngestionCycle(parsed.data.userId, connector as NonNullable<Awaited<ReturnType<typeof getConnectorById>>>),
    );
    return reply.send({ result });
  });

  app.get('/v1/sovereignty/connectors/health', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error' });
    const report = await safe(() => runSyncHealthCheck(parsed.data.userId));
    return reply.send({ report });
  });
}
