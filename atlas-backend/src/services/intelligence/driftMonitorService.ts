/**
 * driftMonitorService.ts — Phase 0.85: Drift Detection
 *
 * Tracks adaptation volatility over time and raises governance flags that
 * throttle or freeze policy mutations when adaptation is drifting too fast,
 * is disproportionately assistant-inferred, or contains unresolved contradictions.
 *
 * Governing principle: Drift is a signal that Atlas is being reshaped by noise,
 * not by the user. When drift exceeds safe bounds, the system should slow down,
 * not speed up.
 *
 * NOTE: This service does NOT import policySimulationService (circular guard).
 */

import { supabaseRest } from '../../db/supabase.js';
import { env } from '../../config/env.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DriftState {
  userId: string;
  overallDriftScore: number;
  personalizationDrift: number;
  policyDrift: number;
  scopeDrift: number;
  provenanceDrift: number;
  contradictionDrift: number;
  instabilityDrift: number;
  driftRiskLevel: 'low' | 'moderate' | 'elevated' | 'severe';
  policyMutationCount7d: number;
  correctionCount7d: number;
  assistantInferencePct: number;
  scopeLeakageCount7d: number;
  mutationSuppressed: boolean;
  lastEvaluatedAt: Date;
}

// ── Risk classification ───────────────────────────────────────────────────────

/**
 * Pure function: classify overall drift risk from weighted sub-scores.
 *
 * Thresholds:
 *   low:      overall < 0.25
 *   moderate: 0.25 ≤ overall < 0.50
 *   elevated: 0.50 ≤ overall < 0.75  → suppress new mutations
 *   severe:   overall ≥ 0.75          → freeze mutations
 */
export function classifyDrift(
  metrics: Record<string, number>,
): DriftState['driftRiskLevel'] {
  const overall = metrics['overall'] ?? 0.0;
  if (overall >= 0.75) return 'severe';
  if (overall >= 0.50) return 'elevated';
  if (overall >= 0.25) return 'moderate';
  return 'low';
}

// ── Sub-score calculators ─────────────────────────────────────────────────────

/**
 * Map raw count/percentage metrics into 0..1 sub-scores.
 * Each sub-score is independently clamped and feeds the weighted average.
 */
function computeSubScores(raw: {
  policyMutationCount7d: number;
  correctionCount7d: number;
  assistantInferencePct: number;       // 0..1
  scopeLeakageCount7d: number;
  unresolvedConflictCount7d: number;
  instabilitySignalCount?: number;
}): {
  personalizationDrift: number;
  policyDrift: number;
  scopeDrift: number;
  provenanceDrift: number;
  contradictionDrift: number;
  instabilityDrift: number;
} {
  // Policy drift: >10 mutations in 7 days is fully saturated
  const policyDrift = Math.min(raw.policyMutationCount7d / 10, 1.0);

  // Scope drift: >5 scope leakage events in 7 days is fully saturated
  const scopeDrift = Math.min(raw.scopeLeakageCount7d / 5, 1.0);

  // Provenance drift: assistant inference % directly maps
  const provenanceDrift = Math.min(raw.assistantInferencePct, 1.0);

  // Contradiction drift: >5 unresolved conflicts in 7 days is fully saturated
  const contradictionDrift = Math.min(raw.unresolvedConflictCount7d / 5, 1.0);

  // Personalization drift: corrections are a sign of over-personalization
  // >4 corrections in 7 days is fully saturated
  const personalizationDrift = Math.min(raw.correctionCount7d / 4, 1.0);

  // Instability drift: optional signal; default low
  const instabilityDrift = Math.min((raw.instabilitySignalCount ?? 0) / 8, 1.0);

  return {
    personalizationDrift,
    policyDrift,
    scopeDrift,
    provenanceDrift,
    contradictionDrift,
    instabilityDrift,
  };
}

function weightedOverall(scores: {
  personalizationDrift: number;
  policyDrift: number;
  scopeDrift: number;
  provenanceDrift: number;
  contradictionDrift: number;
  instabilityDrift: number;
}): number {
  // Weights must sum to 1.0
  const result =
    scores.policyDrift * 0.25 +
    scores.provenanceDrift * 0.25 +
    scores.contradictionDrift * 0.20 +
    scores.personalizationDrift * 0.15 +
    scores.scopeDrift * 0.10 +
    scores.instabilityDrift * 0.05;
  return Math.min(Math.max(result, 0.0), 1.0);
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function countRows(table: string, filter: string): Promise<number> {
  if (!env.memoryLayerEnabled) return 0;
  try {
    const result = await supabaseRest<Array<{ count: string }>>(
      'GET',
      `${table}?select=count&${filter}`,
      undefined,
      { Prefer: 'count=exact' },
    );
    if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
      return parseInt(result.data[0]?.count ?? '0', 10);
    }
    return 0;
  } catch {
    return 0;
  }
}

// ── Main evaluation ───────────────────────────────────────────────────────────

/**
 * Full drift evaluation for a user.
 * Queries multiple tables to compute live sub-scores, then classifies risk.
 */
export async function evaluateDrift(userId: string): Promise<DriftState> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const uid = encodeURIComponent(userId);

  // 1. Policy mutations in last 7 days (outcome='apply')
  const policyMutationCount7d = await countRows(
    'policy_simulations',
    `user_id=eq.${uid}&simulation_outcome=eq.apply&created_at=gte.${encodeURIComponent(sevenDaysAgo)}&select=id`,
  );

  // 2. Correction events in last 7 days
  const correctionCount7d = await countRows(
    'memory_governance_events',
    `user_id=eq.${uid}&event_type=eq.corrected&created_at=gte.${encodeURIComponent(sevenDaysAgo)}&select=id`,
  );

  // 3. Unresolved conflicts in last 7 days
  const unresolvedConflictCount7d = await countRows(
    'memory_governance_events',
    `user_id=eq.${uid}&event_type=eq.unresolved_conflict&created_at=gte.${encodeURIComponent(sevenDaysAgo)}&select=id`,
  );

  // 4. Scope leakage events (scope mismatch in policy writes) in last 7 days
  const scopeLeakageCount7d = await countRows(
    'memory_governance_events',
    `user_id=eq.${uid}&event_type=eq.scope_leakage&created_at=gte.${encodeURIComponent(sevenDaysAgo)}&select=id`,
  );

  // 5. Assistant-inferred percentage of active memories in last 30 days
  let assistantInferencePct = 0.0;
  if (env.memoryLayerEnabled) {
    try {
      const totalResult = await supabaseRest<Array<{ count: string }>>(
        'GET',
        `user_memories?user_id=eq.${uid}&created_at=gte.${encodeURIComponent(thirtyDaysAgo)}&select=id`,
        undefined,
        { Prefer: 'count=exact' },
      );
      const inferredResult = await supabaseRest<Array<{ count: string }>>(
        'GET',
        `user_memories?user_id=eq.${uid}&provenance=eq.assistant_inferred&created_at=gte.${encodeURIComponent(thirtyDaysAgo)}&select=id`,
        undefined,
        { Prefer: 'count=exact' },
      );
      const total = totalResult.ok && Array.isArray(totalResult.data)
        ? parseInt(totalResult.data[0]?.count ?? '0', 10)
        : 0;
      const inferred = inferredResult.ok && Array.isArray(inferredResult.data)
        ? parseInt(inferredResult.data[0]?.count ?? '0', 10)
        : 0;
      assistantInferencePct = total > 0 ? Math.min(inferred / total, 1.0) : 0.0;
    } catch {
      assistantInferencePct = 0.0;
    }
  }

  const subScores = computeSubScores({
    policyMutationCount7d,
    correctionCount7d,
    assistantInferencePct,
    scopeLeakageCount7d,
    unresolvedConflictCount7d,
  });

  const overallDriftScore = weightedOverall(subScores);
  const driftRiskLevel = classifyDrift({ overall: overallDriftScore });
  const mutationSuppressed = driftRiskLevel === 'elevated' || driftRiskLevel === 'severe';

  const state: DriftState = {
    userId,
    overallDriftScore,
    ...subScores,
    driftRiskLevel,
    policyMutationCount7d,
    correctionCount7d,
    assistantInferencePct,
    scopeLeakageCount7d,
    mutationSuppressed,
    lastEvaluatedAt: new Date(),
  };

  // Persist state for future fast reads
  await updateDriftState(userId, state).catch((err) => {
    console.error('[driftMonitor] updateDriftState error:', err);
  });

  return state;
}

/**
 * Read drift state from cache. If stale (>30 min), trigger fresh evaluation.
 */
export async function getDriftState(userId: string): Promise<DriftState> {
  const STALE_MS = 30 * 60 * 1000; // 30 minutes

  if (!env.memoryLayerEnabled) {
    return _defaultDriftState(userId);
  }

  try {
    const uid = encodeURIComponent(userId);
    const result = await supabaseRest<Array<Record<string, unknown>>>(
      'GET',
      `drift_monitor_state?user_id=eq.${uid}&select=*`,
    );

    if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
      const row = result.data[0] as Record<string, unknown>;
      const lastEval = new Date(row['last_evaluated_at'] as string);
      const isStale = Date.now() - lastEval.getTime() > STALE_MS;

      if (!isStale) {
        return _rowToDriftState(userId, row);
      }
    }
  } catch (err) {
    console.error('[driftMonitor] getDriftState read error:', err);
  }

  // Stale or missing — recompute
  return evaluateDrift(userId);
}

/**
 * Persist drift state to drift_monitor_state (upsert by user_id).
 */
export async function updateDriftState(
  userId: string,
  state: DriftState,
): Promise<void> {
  if (!env.memoryLayerEnabled) return;

  const row = {
    user_id: userId,
    overall_drift_score: state.overallDriftScore,
    personalization_drift: state.personalizationDrift,
    policy_drift: state.policyDrift,
    scope_drift: state.scopeDrift,
    provenance_drift: state.provenanceDrift,
    contradiction_drift: state.contradictionDrift,
    instability_drift: state.instabilityDrift,
    drift_risk_level: state.driftRiskLevel,
    policy_mutation_count_7d: state.policyMutationCount7d,
    correction_count_7d: state.correctionCount7d,
    assistant_inference_pct: state.assistantInferencePct,
    scope_leakage_count_7d: state.scopeLeakageCount7d,
    mutation_suppressed: state.mutationSuppressed,
    last_evaluated_at: state.lastEvaluatedAt.toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    await supabaseRest(
      'POST',
      'drift_monitor_state',
      row,
      { Prefer: 'return=minimal,resolution=merge-duplicates' },
    );
  } catch (err) {
    console.error('[driftMonitor] updateDriftState write error:', err);
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _defaultDriftState(userId: string): DriftState {
  return {
    userId,
    overallDriftScore: 0.0,
    personalizationDrift: 0.0,
    policyDrift: 0.0,
    scopeDrift: 0.0,
    provenanceDrift: 0.0,
    contradictionDrift: 0.0,
    instabilityDrift: 0.0,
    driftRiskLevel: 'low',
    policyMutationCount7d: 0,
    correctionCount7d: 0,
    assistantInferencePct: 0.0,
    scopeLeakageCount7d: 0,
    mutationSuppressed: false,
    lastEvaluatedAt: new Date(),
  };
}

function _rowToDriftState(userId: string, row: Record<string, unknown>): DriftState {
  return {
    userId,
    overallDriftScore: (row['overall_drift_score'] as number) ?? 0.0,
    personalizationDrift: (row['personalization_drift'] as number) ?? 0.0,
    policyDrift: (row['policy_drift'] as number) ?? 0.0,
    scopeDrift: (row['scope_drift'] as number) ?? 0.0,
    provenanceDrift: (row['provenance_drift'] as number) ?? 0.0,
    contradictionDrift: (row['contradiction_drift'] as number) ?? 0.0,
    instabilityDrift: (row['instability_drift'] as number) ?? 0.0,
    driftRiskLevel: (row['drift_risk_level'] as DriftState['driftRiskLevel']) ?? 'low',
    policyMutationCount7d: (row['policy_mutation_count_7d'] as number) ?? 0,
    correctionCount7d: (row['correction_count_7d'] as number) ?? 0,
    assistantInferencePct: (row['assistant_inference_pct'] as number) ?? 0.0,
    scopeLeakageCount7d: (row['scope_leakage_count_7d'] as number) ?? 0,
    mutationSuppressed: (row['mutation_suppressed'] as boolean) ?? false,
    lastEvaluatedAt: new Date((row['last_evaluated_at'] as string) ?? Date.now()),
  };
}

// ── Internal exports for tests ────────────────────────────────────────────────

export const __internal = {
  classifyDrift,
  computeSubScores,
  weightedOverall,
};
