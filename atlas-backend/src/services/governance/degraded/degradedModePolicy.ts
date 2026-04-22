/**
 * degradedModePolicy.ts — V1.0 Phase D
 *
 * Stage-aware policy engine that translates the current DegradedMode into
 * concrete per-stage execution decisions for the conductor pipeline.
 *
 * Problem solved:
 *   The conductor's Stage 0 snapshot previously only captured three boolean flags
 *   (groqUnavailable, localOllamaDisabled, memoryLayerEnabled) derived from static
 *   env vars. This means the conductor has NO runtime awareness of whether the system
 *   is in DEGRADED_1, DEGRADED_2, or DEGRADED_3 — it only knows about config, not
 *   about live health.
 *
 *   Without degradedModePolicy, a system in DEGRADED_3 (one step from OFFLINE)
 *   still attempts full 8-stage consensus synthesis, wastes tokens on a likely-
 *   failing call, and surfaces a poor user experience without explanation.
 *
 * Design:
 *   - Pure transform: given a DegradedMode, returns a StagePolicy record
 *   - StagePolicy is consumed by the conductor at Stage 0; stages inspect it before executing
 *   - NOMINAL: all stages proceed as configured
 *   - DEGRADED_1: memory layer skipped (Stage 4 no-ops), synthesis class capped at fast_cloud
 *   - DEGRADED_2: context assembly skipped, overseer skipped (Stage 7 no-op), fast_cloud only
 *   - DEGRADED_3: minimum viable path only — direct swarm, no memory, no overseer, no membrane
 *   - OFFLINE: reject at admission (conductor returns an error result immediately)
 *
 * Usage (Stage 0 of cognitiveOrchestrator):
 *   const stagePolicy = resolveDegradedPolicy(getCurrentMode());
 *   // Pass stagePolicy to all stage gates.
 *
 * Stage gate pattern:
 *   if (!stagePolicy.memoryAssemblyEnabled) { curatedContextBlock = ''; }
 *   if (!stagePolicy.overseerEnabled) { overseerResult = null; }
 */

import type { DegradedMode } from './degradedModeOracle.js';
import { getCurrentMode } from './degradedModeOracle.js';

// ── StagePolicy ───────────────────────────────────────────────────────────

/**
 * StagePolicy — per-request execution gates derived from DegradedMode.
 * Read-only after Stage 0 resolution.
 */
export interface StagePolicy {
  /** Raw degraded mode for trace/telemetry. */
  readonly mode: DegradedMode;

  // ── Stage 4 gates ──────────────────────────────────────────────────────
  /** Whether memory recall + context assembly should run. */
  readonly memoryAssemblyEnabled: boolean;
  /** Whether the session membrane cache is eligible. */
  readonly membraneEnabled: boolean;

  // ── Stage 5/6 gates ───────────────────────────────────────────────────
  /** Maximum synthesis class permitted under this policy. */
  readonly maxSynthesisClass: 'fast_local' | 'fast_cloud' | 'consensus' | 'deep_research';
  /** Whether swarm multi-model dispatch is permitted. */
  readonly swarmEnabled: boolean;

  // ── Stage 7 gates ─────────────────────────────────────────────────────
  /** Whether the Overseer post-hoc annotation should run. */
  readonly overseerEnabled: boolean;

  // ── Admission gate ────────────────────────────────────────────────────
  /** Whether the conductor should reject the request outright (OFFLINE mode). */
  readonly rejectAtAdmission: boolean;

  /** Human-readable reason shown in SSE status event when degraded. */
  readonly degradedReason: string | null;
}

// ── Synthesis class cap ordering ──────────────────────────────────────────

const SYNTHESIS_ORDER = ['fast_local', 'fast_cloud', 'consensus', 'deep_research'] as const;
type SynthesisClass = (typeof SYNTHESIS_ORDER)[number];

/**
 * Returns the lower-capability of two synthesis classes.
 */
export function capSynthesisClass(
  requested: SynthesisClass,
  cap: SynthesisClass,
): SynthesisClass {
  const reqIdx = SYNTHESIS_ORDER.indexOf(requested);
  const capIdx = SYNTHESIS_ORDER.indexOf(cap);
  return reqIdx <= capIdx ? requested : cap;
}

// ── Policy table ─────────────────────────────────────────────────────────

const POLICY_TABLE: Record<DegradedMode, Omit<StagePolicy, 'mode'>> = {
  NOMINAL: {
    memoryAssemblyEnabled: true,
    membraneEnabled: true,
    maxSynthesisClass: 'deep_research',
    swarmEnabled: true,
    overseerEnabled: true,
    rejectAtAdmission: false,
    degradedReason: null,
  },
  DEGRADED_1: {
    // Light degradation: memory and membrane skipped to reduce DB pressure.
    // Synthesis still allowed up to fast_cloud (consensus skipped — costs Groq + Gemini calls).
    memoryAssemblyEnabled: false,
    membraneEnabled: false,
    maxSynthesisClass: 'fast_cloud',
    swarmEnabled: true,
    overseerEnabled: true,
    rejectAtAdmission: false,
    degradedReason: 'Atlas is operating in light degraded mode. Memory context temporarily unavailable.',
  },
  DEGRADED_2: {
    // Moderate degradation: full context pipeline disabled, overseer disabled.
    // Single fast_cloud model only.
    memoryAssemblyEnabled: false,
    membraneEnabled: false,
    maxSynthesisClass: 'fast_cloud',
    swarmEnabled: false,
    overseerEnabled: false,
    rejectAtAdmission: false,
    degradedReason: 'Atlas is operating in reduced capacity mode. Some intelligence features are paused.',
  },
  DEGRADED_3: {
    // Severe degradation: minimum viable path only. No memory, no swarm, no overseer.
    // Direct single-model call with no context enrichment.
    memoryAssemblyEnabled: false,
    membraneEnabled: false,
    maxSynthesisClass: 'fast_cloud',
    swarmEnabled: false,
    overseerEnabled: false,
    rejectAtAdmission: false,
    degradedReason: 'Atlas is in emergency reduced mode. Core synthesis only — full intelligence resumes when systems recover.',
  },
  OFFLINE: {
    memoryAssemblyEnabled: false,
    membraneEnabled: false,
    maxSynthesisClass: 'fast_cloud',
    swarmEnabled: false,
    overseerEnabled: false,
    rejectAtAdmission: true,
    degradedReason: 'Atlas is temporarily offline. Please try again in a moment.',
  },
};

// ── Public API ────────────────────────────────────────────────────────────

/**
 * resolveDegradedPolicy
 *
 * Returns the StagePolicy for the given DegradedMode.
 * Called at Stage 0 with the result of getCurrentMode().
 *
 * @param mode  Current DegradedMode from the oracle.
 * @returns     Frozen StagePolicy for the conductor to apply at each stage gate.
 */
export function resolveDegradedPolicy(mode: DegradedMode): StagePolicy {
  const base = POLICY_TABLE[mode] ?? POLICY_TABLE.NOMINAL;
  return Object.freeze({ mode, ...base });
}

/**
 * resolveLivePolicy
 *
 * Convenience: resolves policy from the live DegradedMode oracle.
 * Use this in the conductor Stage 0 snapshot for real-time policy.
 */
export function resolveLivePolicy(): StagePolicy {
  return resolveDegradedPolicy(getCurrentMode());
}

/**
 * applySynthesisCap
 *
 * Given a resolved synthesis class (from capabilityRouter) and a StagePolicy,
 * returns the lower-capability of the two. Ensures policy-level caps are
 * always applied on top of capability routing.
 */
export function applySynthesisCap(
  resolved: SynthesisClass,
  policy: StagePolicy,
): SynthesisClass {
  return capSynthesisClass(resolved, policy.maxSynthesisClass);
}

/**
 * describePolicy
 *
 * Returns a concise one-liner for SSE trace events and checkpoint summaries.
 */
export function describePolicy(policy: StagePolicy): string {
  if (policy.rejectAtAdmission) return `policy:${policy.mode} REJECT_AT_ADMISSION`;
  const flags: string[] = [];
  if (!policy.memoryAssemblyEnabled) flags.push('no_memory');
  if (!policy.membraneEnabled) flags.push('no_membrane');
  if (!policy.swarmEnabled) flags.push('no_swarm');
  if (!policy.overseerEnabled) flags.push('no_overseer');
  const capStr = `max_synthesis:${policy.maxSynthesisClass}`;
  return `policy:${policy.mode} ${capStr}${flags.length ? ' ' + flags.join(',') : ''}`;
}
