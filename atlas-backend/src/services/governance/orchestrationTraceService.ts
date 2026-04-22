/**
 * orchestrationTraceService.ts — V1.0 Phase F
 *
 * Persists the ConductorTrace record (emitted at Stage 8) to the
 * orchestration_traces table for operator audit, latency analysis,
 * and incident replay.
 *
 * Design contract:
 *   - Always fire-and-forget from the conductor (void + .catch())
 *   - Never throws, never blocks the user-visible response
 *   - Returns early if Supabase is unavailable (no env vars)
 *   - Idempotent: duplicate trace_id rows are silently ignored
 *
 * Usage (Stage 8 aftermath in omniStream.ts or conductor pre-trace):
 *   void persistOrchestrationTrace(userId, orchestrationTrace).catch(() => {});
 */

import { supabaseRest } from '../../db/supabase.js';
import type { ConductorTrace } from './cognitiveOrchestrator.js';

// ── Public API ────────────────────────────────────────────────────────────

/**
 * persistOrchestrationTrace
 *
 * Writes a ConductorTrace to orchestration_traces. Fire-and-forget.
 *
 * @param userId   Authoritative user ID from the verified session.
 * @param trace    The ConductorTrace from Stage 8.
 */
export async function persistOrchestrationTrace(
  userId: string,
  trace: ConductorTrace,
): Promise<void> {
  try {
    if (!userId || !trace?.traceId) return;

    await supabaseRest(
      'POST',
      'orchestration_traces',
      {
        user_id: userId,
        trace_id: trace.traceId,
        request_id: trace.requestId,
        membrane_path: trace.membranePath,
        membrane_invalidation_reason: trace.membraneInvalidationReason ?? null,
        desired_synthesis_class: trace.capabilityResolution?.requested ?? null,
        resolved_synthesis_class: trace.capabilityResolution?.resolved ?? null,
        capability_downgraded: trace.capabilityResolution?.downgraded ?? false,
        capability_reason: trace.capabilityResolution?.reason ?? null,
        context_sliced: trace.contextSlice?.sliced ?? false,
        context_budget_tokens: trace.contextSlice?.budgetTokens ?? null,
        context_estimated_tokens: trace.contextSlice?.estimatedTokens ?? null,
        degraded_mode: trace.degradedMode ?? 'NOMINAL',
        memory_assembly_gated: trace.memoryAssemblyGated ?? false,
        highest_stage_reached: trace.highestStageReached,
        stage_durations_ms: trace.stageDurationsMs,
        doctrine_version_hash: trace.doctrineVersionHash ?? null,
        sensitivity_class: trace.sensitivityClass ?? null,
        policy_profile_version: trace.policyProfileVersion ?? null,
        degraded_state_hash: trace.degradedStateHash ?? null,
        redis_available: trace.redisAvailable,
      },
      { Prefer: 'return=minimal' },
    );
  } catch {
    // Silently swallow — trace persistence is non-critical
  }
}

/**
 * getRecentTraces
 *
 * Retrieves the most recent N orchestration traces for a user.
 * Used by the sovereign console for operator visibility.
 *
 * @param userId  User ID to query.
 * @param limit   Number of traces to return (default 20, max 100).
 */
export async function getRecentTraces(
  userId: string,
  limit = 20,
): Promise<unknown[]> {
  const clampedLimit = Math.min(limit, 100);
  try {
    const result = await supabaseRest<unknown[]>(
      'GET',
      `orchestration_traces?user_id=eq.${encodeURIComponent(userId)}&tombstoned=eq.false&order=created_at.desc&limit=${clampedLimit}`,
    );
    return result.ok && Array.isArray(result.data) ? result.data : [];
  } catch {
    return [];
  }
}

/**
 * getDegradedTraces
 *
 * Retrieves traces where the system was in a degraded mode.
 * Useful for incident analysis.
 */
export async function getDegradedTraces(
  userId: string,
  limit = 50,
): Promise<unknown[]> {
  const clampedLimit = Math.min(limit, 100);
  try {
    const result = await supabaseRest<unknown[]>(
      'GET',
      `orchestration_traces?user_id=eq.${encodeURIComponent(userId)}&degraded_mode=neq.NOMINAL&tombstoned=eq.false&order=created_at.desc&limit=${clampedLimit}`,
    );
    return result.ok && Array.isArray(result.data) ? result.data : [];
  } catch {
    return [];
  }
}
