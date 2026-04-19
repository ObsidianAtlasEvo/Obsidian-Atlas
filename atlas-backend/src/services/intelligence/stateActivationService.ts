/**
 * stateActivationService.ts — Phase 0.9: Temporal Cognition Stack
 *
 * Determines the active/latent/frozen lifecycle state for all identity signals,
 * memories, domains, and priorities. Writes significant state transitions to
 * the state_activation_log table.
 *
 * Design invariants:
 * - Non-throwing: all errors caught, safe defaults returned.
 * - Feature-flagged: all Supabase calls gated on env.MEMORY_LAYER_ENABLED.
 * - computeActivationState() is pure (no I/O) — all side-effects in batchComputeActivations().
 * - State transitions are logged only when state changes significantly.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type ActivationState =
  | 'active'
  | 'latent'
  | 'tentative'
  | 'frozen'
  | 'quarantined'
  | 'archived'
  | 'suppressed'
  | 'pending_confirmation';

export interface ActivationDecision {
  entityId: string;
  entityType: string;
  state: ActivationState;
  activationScore: number;
  activationReason: string;
  deactivationReason?: string;
  reactivationTrigger?: string;
}

export interface MemoryRowInput {
  id: string;
  kind?: string | null;
  memory_class?: string | null;
  scope_type?: string | null;
  scope_key?: string | null;
  stability_score?: number | null;
  quarantined?: boolean | null;
  confirmation_status?: string | null;
  contradiction_status?: string | null;
  provenance?: string | null;
  created_at?: string | null;
  last_reaffirmed_at?: string | null;
}

export interface SovereigntyControlInput {
  controlType: 'freeze' | 'suppress' | 'confirm' | 'quarantine' | 'revert';
  controlScope: 'global' | 'domain' | 'memory' | 'chamber' | 'project' | 'policy_field';
  scopeKey?: string;
  active: boolean;
  expiresAt?: Date;
}

export interface DriftStateInput {
  driftDetected?: boolean;
  driftScore?: number;
  lastDriftAt?: Date | null;
}

export interface ComputeActivationInput {
  memoryRow: MemoryRowInput;
  sovereigntyControls: SovereigntyControlInput[];
  driftState?: DriftStateInput;
  projectActive?: boolean;
  chamberActive?: boolean;
}

// ── Days helper ───────────────────────────────────────────────────────────────

function daysSince(isoDate?: string | null): number {
  if (!isoDate) return Infinity;
  return (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24);
}

// ── Sovereignty check helpers ─────────────────────────────────────────────────

function isGloballySuppressed(controls: SovereigntyControlInput[]): boolean {
  const now = Date.now();
  return controls.some(
    (c) =>
      c.active &&
      c.controlScope === 'global' &&
      c.controlType === 'suppress' &&
      (!c.expiresAt || c.expiresAt.getTime() > now),
  );
}

function isDomainFrozen(
  controls: SovereigntyControlInput[],
  domain: string | null | undefined,
): boolean {
  if (!domain) return false;
  const now = Date.now();
  return controls.some(
    (c) =>
      c.active &&
      c.controlType === 'freeze' &&
      (!c.expiresAt || c.expiresAt.getTime() > now) &&
      (c.controlScope === 'global' ||
        (c.controlScope === 'domain' && c.scopeKey === domain)),
  );
}

function isMemorySuppressed(
  controls: SovereigntyControlInput[],
  memoryId: string,
): boolean {
  const now = Date.now();
  return controls.some(
    (c) =>
      c.active &&
      (c.controlType === 'suppress' || c.controlType === 'quarantine') &&
      (!c.expiresAt || c.expiresAt.getTime() > now) &&
      (c.controlScope === 'global' ||
        (c.controlScope === 'memory' && c.scopeKey === memoryId)),
  );
}

// ── Core computation (pure, no I/O) ──────────────────────────────────────────

/**
 * Compute the activation state for a single memory row.
 * Rule precedence (top → bottom):
 * 1. quarantined=true         → quarantined
 * 2. sovereignty freeze       → frozen
 * 3. sovereignty suppress     → suppressed
 * 4. anomaly class            → archived
 * 5. session-scope + ended    → latent
 * 6. project-scope + dormant  → latent
 * 7. stale (>60d) + not user_stated → latent
 * 8. contradiction unresolved → pending_confirmation
 * 9. tentative + low recurrence → tentative
 * 10. default                 → active
 */
export function computeActivationState(input: ComputeActivationInput): ActivationDecision {
  const { memoryRow, sovereigntyControls, driftState, projectActive, chamberActive } = input;
  const memId = memoryRow.id;

  const stability = memoryRow.stability_score ?? 0.5;
  const isUserStated =
    memoryRow.provenance === 'user_stated' ||
    memoryRow.provenance === 'user_confirmed' ||
    memoryRow.provenance === 'corrected_by_user';

  // Rule 1: quarantined=true → quarantined
  if (memoryRow.quarantined === true) {
    return {
      entityId: memId,
      entityType: 'memory',
      state: 'quarantined',
      activationScore: 0,
      activationReason: 'memory flagged as quarantined',
      deactivationReason: 'quarantine flag set',
      reactivationTrigger: 'user_review',
    };
  }

  // Rule 2: domain freeze via sovereignty controls
  if (isDomainFrozen(sovereigntyControls, memoryRow.scope_key)) {
    return {
      entityId: memId,
      entityType: 'memory',
      state: 'frozen',
      activationScore: 0.1,
      activationReason: 'domain frozen by user sovereignty control',
      deactivationReason: 'freeze control active',
      reactivationTrigger: 'user_unfreeze',
    };
  }

  // Rule 3: user sovereignty suppress
  if (isMemorySuppressed(sovereigntyControls, memId) || isGloballySuppressed(sovereigntyControls)) {
    return {
      entityId: memId,
      entityType: 'memory',
      state: 'suppressed',
      activationScore: 0,
      activationReason: 'suppressed by user sovereignty control',
      deactivationReason: 'suppress control active',
      reactivationTrigger: 'user_resolve_control',
    };
  }

  // Rule 4: anomaly class → archived
  if (memoryRow.memory_class === 'anomaly') {
    return {
      entityId: memId,
      entityType: 'memory',
      state: 'archived',
      activationScore: 0.05,
      activationReason: 'memory_class=anomaly — auto-archived',
      deactivationReason: 'anomaly classification',
      reactivationTrigger: 'manual_reclassification',
    };
  }

  // Rule 5: session-scope + session ended (chamberActive=false as proxy)
  if (memoryRow.scope_type === 'session' && chamberActive === false) {
    return {
      entityId: memId,
      entityType: 'memory',
      state: 'latent',
      activationScore: 0.15,
      activationReason: 'session-scoped memory with no active session',
      deactivationReason: 'session ended',
      reactivationTrigger: 'new_session_start',
    };
  }

  // Rule 6: project-scope + project dormant
  if (memoryRow.scope_type === 'project' && projectActive === false) {
    return {
      entityId: memId,
      entityType: 'memory',
      state: 'latent',
      activationScore: 0.2,
      activationReason: 'project-scoped memory with dormant project',
      deactivationReason: 'project dormant',
      reactivationTrigger: 'project_reactivation',
    };
  }

  // Rule 7: stale (>60d) + not user_stated
  const reaffirmedDays = daysSince(memoryRow.last_reaffirmed_at ?? memoryRow.created_at);
  if (reaffirmedDays > 60 && !isUserStated) {
    return {
      entityId: memId,
      entityType: 'memory',
      state: 'latent',
      activationScore: 0.25,
      activationReason: `stale: last reaffirmed ${Math.round(reaffirmedDays)}d ago, not user-stated`,
      deactivationReason: 'temporal decay without user reaffirmation',
      reactivationTrigger: 'user_reaffirmation',
    };
  }

  // Rule 8: contradiction_status=unresolved → pending_confirmation
  if (memoryRow.contradiction_status === 'unresolved') {
    return {
      entityId: memId,
      entityType: 'memory',
      state: 'pending_confirmation',
      activationScore: 0.3,
      activationReason: 'unresolved contradiction detected',
      deactivationReason: 'contradiction_status=unresolved',
      reactivationTrigger: 'contradiction_resolved',
    };
  }

  // Rule 9: tentative class + low stability (proxy for low recurrence)
  if (memoryRow.memory_class === 'tentative' && stability < 0.4) {
    return {
      entityId: memId,
      entityType: 'memory',
      state: 'tentative',
      activationScore: stability,
      activationReason: `tentative class with low stability (${stability.toFixed(2)})`,
      deactivationReason: 'low recurrence evidence',
      reactivationTrigger: 'signal_recurrence',
    };
  }

  // Rule 10: default → active
  const activationScore = Math.min(
    1,
    stability * 0.6 +
      (isUserStated ? 0.3 : 0) +
      (driftState?.driftDetected ? -0.1 : 0),
  );

  return {
    entityId: memId,
    entityType: 'memory',
    state: 'active',
    activationScore: Math.max(0, activationScore),
    activationReason: `standard active: stability=${stability.toFixed(2)}, user_stated=${isUserStated}`,
  };
}

// ── Batch computation with logging ────────────────────────────────────────────

interface RawControlRow {
  control_type: string;
  control_scope: string;
  scope_key?: string | null;
  active: boolean;
  expires_at?: string | null;
}

/**
 * Load sovereignty controls for a user from Supabase.
 */
async function loadSovereigntyControls(
  userId: string,
): Promise<SovereigntyControlInput[]> {
  const result = await supabaseRest<RawControlRow[]>(
    'GET',
    `user_sovereignty_controls?user_id=eq.${encodeURIComponent(userId)}&active=eq.true`,
  );
  if (!result.ok || !result.data) return [];
  return result.data.map((r) => ({
    controlType: r.control_type as SovereigntyControlInput['controlType'],
    controlScope: r.control_scope as SovereigntyControlInput['controlScope'],
    scopeKey: r.scope_key ?? undefined,
    active: r.active,
    expiresAt: r.expires_at ? new Date(r.expires_at) : undefined,
  }));
}

/**
 * Load drift state for a user from Supabase (best-effort).
 */
async function loadDriftState(userId: string): Promise<DriftStateInput> {
  const result = await supabaseRest<Array<{
    drift_detected: boolean;
    drift_score: number;
    created_at: string;
  }>>(
    'GET',
    `identity_diff_log?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=1`,
  );
  if (!result.ok || !result.data || result.data.length === 0) {
    return { driftDetected: false, driftScore: 0 };
  }
  const row = result.data[0]!;
  return {
    driftDetected: row.drift_detected ?? false,
    driftScore: row.drift_score ?? 0,
    lastDriftAt: row.created_at ? new Date(row.created_at) : null,
  };
}

/**
 * Log a significant activation state change to state_activation_log.
 */
async function logStateChange(
  userId: string,
  decision: ActivationDecision,
): Promise<void> {
  try {
    await supabaseRest('POST', 'state_activation_log', {
      id: randomUUID(),
      user_id: userId,
      entity_type: decision.entityType,
      entity_id: decision.entityId,
      state_status: decision.state,
      activation_score: decision.activationScore,
      activation_reason: decision.activationReason ?? null,
      deactivation_reason: decision.deactivationReason ?? null,
      reactivation_trigger: decision.reactivationTrigger ?? null,
    });
  } catch {
    // Logging failure must never block the calling path
  }
}

/**
 * Batch compute activation decisions for all provided memory rows.
 * Fetches sovereignty controls and drift state once, then applies rules.
 * Logs significant state changes (non-active states) to state_activation_log.
 */
export async function batchComputeActivations(
  userId: string,
  memoryRows: MemoryRowInput[],
): Promise<ActivationDecision[]> {
  if (!env.memoryLayerEnabled) return [];
  if (memoryRows.length === 0) return [];

  try {
    const [sovereigntyControls, driftState] = await Promise.all([
      loadSovereigntyControls(userId),
      loadDriftState(userId),
    ]);

    const decisions: ActivationDecision[] = [];
    const logPromises: Promise<void>[] = [];

    for (const row of memoryRows) {
      const decision = computeActivationState({
        memoryRow: row,
        sovereigntyControls,
        driftState,
        projectActive: undefined, // would be enriched per-memory in a full impl
        chamberActive: undefined,
      });

      decisions.push(decision);

      // Log significant state transitions (anything not simply 'active')
      if (decision.state !== 'active') {
        logPromises.push(logStateChange(userId, decision));
      }
    }

    // Fire-and-forget log writes — never block return
    Promise.allSettled(logPromises).catch(() => {});

    return decisions;
  } catch (err) {
    console.error('[stateActivation] batchComputeActivations error:', err);
    return [];
  }
}

/**
 * Get the current activation state for a specific entity.
 * Returns the most recent log entry state, or 'active' as a safe default.
 */
export async function getActivationState(
  userId: string,
  entityType: string,
  entityId: string,
): Promise<ActivationState> {
  if (!env.memoryLayerEnabled) return 'active';

  try {
    const qs = [
      `user_id=eq.${encodeURIComponent(userId)}`,
      `entity_type=eq.${encodeURIComponent(entityType)}`,
      `entity_id=eq.${encodeURIComponent(entityId)}`,
      `order=created_at.desc`,
      `limit=1`,
    ].join('&');

    const result = await supabaseRest<Array<{ state_status: string }>>(
      'GET',
      `state_activation_log?${qs}`,
    );

    if (!result.ok || !result.data || result.data.length === 0) {
      return 'active'; // No log entry → assume active
    }

    return (result.data[0]!.state_status ?? 'active') as ActivationState;
  } catch (err) {
    console.error('[stateActivation] getActivationState error:', err);
    return 'active';
  }
}
