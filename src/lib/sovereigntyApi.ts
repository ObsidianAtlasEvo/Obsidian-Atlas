/**
 * sovereigntyApi.ts — Typed client for /v1/sovereignty/* endpoints.
 *
 * Every function returns either the typed payload or `null` on network / backend
 * failure. Callers use `null` to drive empty/error UI states. Never throws.
 *
 * All surface-state payloads are declared as shallow record types; the backend
 * shapes are nested unknown-records today (phase 0.98 surfaces are composed
 * inline). Callers that want strongly-typed fields should narrow further.
 */

import { atlasApiUrl } from './atlasApi';

export type UnknownRecord = Record<string, unknown>;

// ── Response envelopes ─────────────────────────────────────────────────────

export interface HomeSurfaceResponse {
  state: UnknownRecord | null;
  summary?: string | null;
}
export interface DirectiveSurfaceResponse {
  latest: UnknownRecord | null;
  state: UnknownRecord | null;
  summary: string | null;
}
export interface TruthObservatoryResponse {
  observatory: UnknownRecord | null;
  summary: string | null;
}
export interface TimelineEvent {
  id?: string;
  event_type?: string;
  occurred_at?: string;
  [k: string]: unknown;
}
export interface TimelineResponse {
  events: TimelineEvent[];
  grouped: Record<string, TimelineEvent[]>;
}
export interface TransparencyLogEntry {
  id?: string;
  category?: string;
  detail?: string;
  created_at?: string;
  [k: string]: unknown;
}
export interface TransparencyLogResponse {
  log: TransparencyLogEntry[] | null;
}
export interface CognitionMapResponse {
  map: UnknownRecord | null;
}
export interface CreatorConsoleResponse {
  state: UnknownRecord | null;
}

export interface WorkstreamRow { id: string; title?: string; status?: string; [k: string]: unknown; }
export interface FrontRow { id: string; title?: string; [k: string]: unknown; }
export interface ChainRow { id: string; [k: string]: unknown; }
export interface CommitmentRow { id: string; description?: string; status?: string; [k: string]: unknown; }
export interface LeverageRow { id: string; [k: string]: unknown; }
export interface DecisionRow { id: string; [k: string]: unknown; }
export interface OutcomeFeedbackRow { id: string; [k: string]: unknown; }
export interface OperationalReview { [k: string]: unknown; }

export interface ClaimRow { id: string; statement?: string; confidence?: number; [k: string]: unknown; }
export interface EvidenceRow { id: string; source?: string; [k: string]: unknown; }
export interface AssumptionRow { id: string; [k: string]: unknown; }
export interface ContradictionRow { id: string; [k: string]: unknown; }
export interface DriftEventRow { id: string; [k: string]: unknown; }

export type ActionStatus = 'staged' | 'approved' | 'executing' | 'completed' | 'rejected' | 'failed';
export type RiskClass = 'low' | 'medium' | 'high' | 'critical';
export type Reversibility = 'reversible' | 'partially_reversible' | 'irreversible';

export interface ActionContractRow {
  id: string;
  user_id: string;
  action_type: string;
  target: string;
  status: ActionStatus;
  risk_class?: RiskClass;
  reversibility?: Reversibility;
  payload?: UnknownRecord;
  contract_metadata?: UnknownRecord;
  reversal_anchor?: string | null;
  irreversible?: boolean;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}
export type ActionTier = 'auto' | 'user_confirm' | 'multi_step' | 'blocked';

export type ConnectorHealth = 'healthy' | 'degraded' | 'offline' | 'unknown';
export interface ConnectorRow {
  id: string;
  user_id: string;
  connector_name: string;
  connector_type: string | null;
  auth_method: string | null;
  health_status: ConnectorHealth;
  trust_score: number;
  last_checked_at: string | null;
  connector_metadata: UnknownRecord;
  created_at: string;
  updated_at: string;
}

export interface WatcherEventRow {
  id: string;
  event_type?: string;
  severity?: string;
  resolved?: boolean;
  detected_at?: string;
  [k: string]: unknown;
}
export interface WatcherSweepResult {
  detected: number;
  suppressed: number;
  [k: string]: unknown;
}

export interface ConstitutionalEvalResult {
  id: string;
  test_name?: string;
  passed?: boolean;
  score?: number;
  [k: string]: unknown;
}
export interface EvalReadiness {
  ready: boolean;
  blockingFailures: string[];
}
export interface EvalHealth {
  score: number;
  passed: boolean;
}
export interface EvalResultsResponse {
  results: ConstitutionalEvalResult[];
  readiness: EvalReadiness;
  health: EvalHealth;
}

export type AuditEventType =
  | 'approval'
  | 'freeze'
  | 'suppression'
  | 'quarantine'
  | 'revert'
  | 'drift_flag'
  | 'contradiction_flag'
  | 'eval_run'
  | 'eval_fail'
  | 'contract_executed';
export interface AuditEventRow {
  id: string;
  event_type?: AuditEventType | string;
  created_at?: string;
  actor?: string;
  target?: string;
  [k: string]: unknown;
}
export interface AuditLogResponse {
  events: AuditEventRow[];
  summary: string;
}

export type SovereigntyScope =
  | 'memory'
  | 'claims'
  | 'chamber'
  | 'action'
  | 'identity'
  | 'eval'
  | 'connector'
  | 'directive';
export interface ActiveControlRow {
  id: string;
  scope: SovereigntyScope | string;
  control_type?: string;
  scope_key?: string | null;
  created_at?: string;
  [k: string]: unknown;
}

export interface DispatchStepResult {
  stepId: string;
  status: 'completed' | 'failed' | 'cancelled';
  attempts?: number;
  output?: UnknownRecord;
  error?: string | null;
}
export interface DispatchResult {
  contractId: string;
  success: boolean;
  steps: DispatchStepResult[];
  skipped?: boolean;
  reason?: string;
  [k: string]: unknown;
}
export interface IngestionCycleResult {
  connectorId: string;
  skipped?: boolean;
  reason?: string;
  inserted?: number;
  updated?: number;
  [k: string]: unknown;
}
export interface ConnectorHealthReport {
  connectors: Array<{ id: string; health: string; [k: string]: unknown }>;
  stale: number;
  failed: number;
}

// ── Fetch plumbing ─────────────────────────────────────────────────────────

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T | null> {
  try {
    const init: RequestInit = {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    };
    const res = await fetch(atlasApiUrl(path), init);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function withQuery(path: string, params: Record<string, string | number | boolean | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

// ── Home / Directive / Truth / Timeline / Transparency / Cognition ─────────

export const fetchHomeSurface = (userId: string) =>
  request<HomeSurfaceResponse>('GET', withQuery('/v1/sovereignty/home-surface', { userId }));
export const rebuildHomeSurface = (userId: string) =>
  request<HomeSurfaceResponse>('POST', '/v1/sovereignty/home-surface/rebuild', { userId });

export const fetchDirectiveSurface = (userId: string) =>
  request<DirectiveSurfaceResponse>('GET', withQuery('/v1/sovereignty/directive-surface', { userId }));
export const rebuildDirectiveSurface = (userId: string) =>
  request<DirectiveSurfaceResponse>('POST', '/v1/sovereignty/directive-surface/rebuild', { userId });

export const fetchTruthObservatory = (userId: string) =>
  request<TruthObservatoryResponse>('GET', withQuery('/v1/sovereignty/truth-observatory', { userId }));

export const fetchTimeline = (userId: string) =>
  request<TimelineResponse>('GET', withQuery('/v1/sovereignty/timeline', { userId }));

export const fetchTransparencyLog = (userId: string) =>
  request<TransparencyLogResponse>('GET', withQuery('/v1/sovereignty/transparency-log', { userId }));

export const fetchCognitionMap = (userId: string, mapType?: string) =>
  request<CognitionMapResponse>('GET', withQuery('/v1/sovereignty/cognition-map', { userId, mapType }));
export const rebuildCognitionMap = (userId: string, mapType?: string) =>
  request<CognitionMapResponse>('POST', '/v1/sovereignty/cognition-map/rebuild', { userId, mapType });

// ── Creator Console ────────────────────────────────────────────────────────

export const fetchCreatorConsole = (userId: string) =>
  request<CreatorConsoleResponse>('GET', withQuery('/v1/sovereignty/creator-console', { userId }));

export interface CreatorConsoleUpdatePatch {
  memory_state?: UnknownRecord;
  identity_state?: UnknownRecord;
  policy_state?: UnknownRecord;
  chamber_state?: UnknownRecord;
  truth_state?: UnknownRecord;
  operational_state?: UnknownRecord;
  sovereignty_actions?: UnknownRecord;
}
export const updateCreatorConsole = (userId: string, patch: CreatorConsoleUpdatePatch) =>
  request<CreatorConsoleResponse>('POST', '/v1/sovereignty/creator-console/update', { userId, ...patch });

// ── Operational Sovereignty ────────────────────────────────────────────────

export const fetchWorkstreams = (userId: string) =>
  request<{ workstreams: WorkstreamRow[] | null }>('GET', withQuery('/v1/sovereignty/workstreams', { userId }));
export const fetchFronts = (userId: string) =>
  request<{ fronts: FrontRow[] | null }>('GET', withQuery('/v1/sovereignty/fronts', { userId }));
export const fetchChains = (userId: string) =>
  request<{ chains: ChainRow[] | null }>('GET', withQuery('/v1/sovereignty/chains', { userId }));
export const fetchCommitments = (userId: string) =>
  request<{ commitments: CommitmentRow[] | null }>('GET', withQuery('/v1/sovereignty/commitments', { userId }));
export const fetchLeverage = (userId: string) =>
  request<{ candidates: LeverageRow[] | null }>('GET', withQuery('/v1/sovereignty/leverage', { userId }));
export const fetchDecisions = (userId: string) =>
  request<{ decisions: DecisionRow[] | null }>('GET', withQuery('/v1/sovereignty/decisions', { userId }));
export const fetchOutcomeFeedback = (userId: string) =>
  request<{ feedback: OutcomeFeedbackRow[] | null }>('GET', withQuery('/v1/sovereignty/outcome-feedback', { userId }));
export const fetchOperationalReview = (userId: string) =>
  request<{ review: OperationalReview | null }>('GET', withQuery('/v1/sovereignty/operational-review', { userId }));

// ── Truth Spine ────────────────────────────────────────────────────────────

export const fetchClaims = (userId: string) =>
  request<{ claims: ClaimRow[] | null }>('GET', withQuery('/v1/sovereignty/claims', { userId }));
export const fetchClaimEvidence = (userId: string, claimId: string) =>
  request<{ evidence: EvidenceRow[] | null }>(
    'GET',
    withQuery('/v1/sovereignty/claim-evidence', { userId, claimId }),
  );
export const fetchAssumptions = (userId: string) =>
  request<{ assumptions: AssumptionRow[] | null }>('GET', withQuery('/v1/sovereignty/assumptions', { userId }));
export const fetchContradictions = (userId: string) =>
  request<{ contradictions: ContradictionRow[] | null }>(
    'GET',
    withQuery('/v1/sovereignty/contradictions', { userId }),
  );
export const fetchDriftEvents = (userId: string) =>
  request<{ events: DriftEventRow[] | null }>('GET', withQuery('/v1/sovereignty/drift-events', { userId }));

// ── Action Contracts + Executor ────────────────────────────────────────────

export const fetchActionContracts = (userId: string, status?: ActionStatus) =>
  request<{ contracts: ActionContractRow[] | null }>(
    'GET',
    withQuery('/v1/sovereignty/actions', { userId, status }),
  );
export interface CreateActionInput {
  action_type: string;
  target: string;
  payload?: UnknownRecord;
  reversibility?: Reversibility;
  risk_class?: RiskClass;
}
export const createActionContract = (userId: string, data: CreateActionInput) =>
  request<{ contract: ActionContractRow | null }>('POST', '/v1/sovereignty/actions', { userId, ...data });

export const approveActionLegacy = (userId: string, contractId: string) =>
  request<{ ok: boolean }>('POST', '/v1/sovereignty/actions/approve', { userId, contractId });
export const rejectActionLegacy = (userId: string, contractId: string) =>
  request<{ ok: boolean }>('POST', '/v1/sovereignty/actions/reject', { userId, contractId });

export const approveActionContract = (
  userId: string,
  contractId: string,
  tier?: ActionTier,
  approverId?: string,
) =>
  request<{ result: UnknownRecord | null }>(
    'POST',
    `/v1/sovereignty/action-contracts/${encodeURIComponent(contractId)}/approve`,
    { userId, contractId, tier, approverId },
  );
export const rejectActionContract = (userId: string, contractId: string, reason: string) =>
  request<{ result: UnknownRecord | null }>(
    'POST',
    `/v1/sovereignty/action-contracts/${encodeURIComponent(contractId)}/reject`,
    { userId, contractId, reason },
  );
export const escalateActionContract = (userId: string, contractId: string, reason: string) =>
  request<{ result: UnknownRecord | null }>(
    'POST',
    `/v1/sovereignty/action-contracts/${encodeURIComponent(contractId)}/escalate`,
    { userId, contractId, reason },
  );
export const dispatchActionContract = (userId: string, contractId: string, ingest = true) =>
  request<{ result: DispatchResult | null }>(
    'POST',
    `/v1/sovereignty/action-contracts/${encodeURIComponent(contractId)}/dispatch`,
    { userId, contractId, ingest },
  );
export const reverseActionContract = (userId: string, contractId: string, reason: string) =>
  request<{ result: UnknownRecord | null }>(
    'POST',
    `/v1/sovereignty/action-contracts/${encodeURIComponent(contractId)}/reverse`,
    { userId, contractId, reason },
  );

// ── Connectors ─────────────────────────────────────────────────────────────

export const fetchConnectors = (userId: string) =>
  request<{ connectors: ConnectorRow[] | null }>('GET', withQuery('/v1/sovereignty/connectors', { userId }));
export interface RegisterConnectorInput {
  connector_name: string;
  connector_type?: string;
  auth_method?: string;
}
export const registerConnectorApi = (userId: string, data: RegisterConnectorInput) =>
  request<{ connector: ConnectorRow | null }>('POST', '/v1/sovereignty/connectors', { userId, ...data });
export const setConnectorHealthApi = (userId: string, connectorId: string, health: ConnectorHealth) =>
  request<{ ok: boolean }>('POST', '/v1/sovereignty/connectors/health', {
    userId,
    connectorId,
    health_status: health,
  });
export const syncConnector = (userId: string, connectorId: string) =>
  request<{ result: IngestionCycleResult | null }>(
    'POST',
    `/v1/sovereignty/connectors/${encodeURIComponent(connectorId)}/sync`,
    { userId, connectorId },
  );
export const fetchConnectorsHealth = (userId: string) =>
  request<{ report: ConnectorHealthReport | null }>(
    'GET',
    withQuery('/v1/sovereignty/connectors/health', { userId }),
  );

// ── Watchers ───────────────────────────────────────────────────────────────

export const fetchWatcherEvents = (userId: string, resolved?: boolean) =>
  request<{ events: WatcherEventRow[] | null }>(
    'GET',
    withQuery('/v1/sovereignty/watchers', { userId, resolved }),
  );
export const sweepWatchers = (userId: string) =>
  request<{ result: WatcherSweepResult | null }>('POST', '/v1/sovereignty/watchers/sweep', { userId });
export const resolveWatcherEvent = (userId: string, eventId: string) =>
  request<{ ok: boolean }>('POST', '/v1/sovereignty/watchers/resolve', { userId, eventId });

// ── Constitutional Eval ────────────────────────────────────────────────────

export const fetchEvalResults = (userId: string) =>
  request<EvalResultsResponse>('GET', withQuery('/v1/sovereignty/eval/results', { userId }));
export const runEvalSuite = (userId: string) =>
  request<{ results: ConstitutionalEvalResult[] | null }>('POST', '/v1/sovereignty/eval/run', { userId });

// ── Audit Log ──────────────────────────────────────────────────────────────

export const fetchAuditLog = (userId: string, eventType?: AuditEventType) =>
  request<AuditLogResponse>('GET', withQuery('/v1/sovereignty/audit-log', { userId, eventType }));

// ── Sovereignty Controls (freeze/suppress/confirm/quarantine/revert) ──────

export interface ControlActionInput {
  scope: SovereigntyScope;
  scopeKey?: string;
  reason?: string;
}
export const freezeScope = (userId: string, input: ControlActionInput) =>
  request<{ id: string | null }>('POST', '/v1/sovereignty/controls/freeze', { userId, ...input });
export const suppressScope = (userId: string, input: ControlActionInput) =>
  request<{ id: string | null }>('POST', '/v1/sovereignty/controls/suppress', { userId, ...input });
export const confirmScope = (userId: string, input: ControlActionInput) =>
  request<{ id: string | null }>('POST', '/v1/sovereignty/controls/confirm', { userId, ...input });
export const quarantineScope = (userId: string, input: ControlActionInput) =>
  request<{ id: string | null }>('POST', '/v1/sovereignty/controls/quarantine', { userId, ...input });
export const revertScope = (userId: string, input: ControlActionInput) =>
  request<{ id: string | null }>('POST', '/v1/sovereignty/controls/revert', { userId, ...input });

export const fetchActiveControls = (userId: string) =>
  request<{ controls: ActiveControlRow[] | null }>('GET', withQuery('/v1/sovereignty/controls/active', { userId }));
export const resolveActiveControl = (controlId: string) =>
  request<{ ok: boolean }>('POST', '/v1/sovereignty/controls/resolve', { controlId });
