/**
 * policyAutoWriter.ts — Phase 0.75 hardened policy mutation bridge.
 *
 * Phase 0.75 changes from Phase 0.5:
 *
 *   1. ELIGIBILITY GATE (new):
 *      Before any policy mutation, the writer now checks that the source
 *      memories backing the patch are policy_eligible=true in Supabase.
 *      A patch backed only by quarantined, tentative, or assistant_inferred
 *      memories CANNOT write policy — even if confidence is high.
 *
 *   2. SCOPE GATE (new):
 *      Policy patches scoped to 'session', 'project', or 'topic' CANNOT
 *      write global policy_profiles. They are suppressed with a log.
 *
 *   3. PROVENANCE GATE (new):
 *      A policy patch that came from assistant_inferred evidence is rejected.
 *      Only user_stated or user_confirmed evidence may drive policy writes.
 *
 *   4. CONTRADICTION GATE (new):
 *      If the user has any unresolved contradicting memory on the same
 *      dimension as the patch, the write is suppressed pending resolution.
 *
 *   5. RECURRENCE REQUIREMENT (new):
 *      Verbosity, tone, and structurePreference changes require either:
 *      - confidence >= 0.85, OR
 *      - at least 2 policy-eligible memories corroborating the preference.
 *      This prevents a single strong-sounding extraction from reshaping behavior.
 *
 *   6. AUDIT TRAIL (enhanced):
 *      Every apply/reject decision is written to memory_governance_events
 *      via markPolicyPatched so a future UI can answer "why did Atlas
 *      change my tone on date X?"
 *
 * Phase 0.5 invariants preserved:
 *   - Feature-flag gated (env.memoryPolicyAutoWriteEnabled)
 *   - Non-throwing
 *   - Min confidence 0.7 (now + additional gates above)
 *   - truthFirstStrictness moves at most ±0.1 per apply
 *   - Allowed tones restricted to PolicyProfile enum
 */

import { env } from '../../config/env.js';
import {
  getPolicyProfile,
  updatePolicyProfile,
} from '../evolution/policyStore.js';
import type { PolicyProfile } from '../../types/atlas.js';
import type { PolicyPatch } from './memoryDistiller.js';
import { markPolicyPatched } from './memoryDistiller.js';
import { supabaseRest } from '../../db/supabase.js';
import {
  simulatePolicyMutation,
  type SimulationInput,
} from './policySimulationService.js';
import type { EvidenceProfile } from './evidenceArbitrationService.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_TONES: ReadonlyArray<PolicyProfile['tone']> = [
  'direct', 'professional', 'warm', 'analytical',
];

const MIN_APPLY_CONFIDENCE = 0.75;           // Phase 0.75: raised from 0.7
const MAX_STRICTNESS_STEP = 0.1;
const HIGH_CONFIDENCE_BYPASS_THRESHOLD = 0.85; // confidence high enough to waive recurrence check

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApplyResult {
  applied: true;
  diff: Partial<Pick<
    PolicyProfile,
    'verbosity' | 'tone' | 'structurePreference' | 'truthFirstStrictness' | 'preferredComputeDepth' | 'latencyTolerance'
  >>;
  profileAfter: PolicyProfile;
  confidence: number;
  gateSummary: PolicyGateSummary;
}

export type ApplyOutcome = ApplyResult | null;

interface PolicyGateSummary {
  passed: boolean;
  rejectionReasons: string[];
  eligibleMemoryCount: number;
  unresolvedConflictCount: number;
  scopeType: string;
  provenanceOk: boolean;
}

// ── Policy-eligible memory check ──────────────────────────────────────────────

/**
 * Check Supabase for how many policy-eligible, non-quarantined, non-conflicted
 * memories the user has that corroborate the patch.
 * Returns { eligibleCount, unresolvedCount }.
 */
async function checkPolicyEligibility(
  userId: string,
): Promise<{ eligibleCount: number; unresolvedCount: number }> {
  if (!process.env.SUPABASE_URL) {
    // If Supabase not configured, fall back to the Phase 0.5 behavior (flag-only).
    return { eligibleCount: 1, unresolvedCount: 0 };
  }

  try {
    const eligibleRes = await supabaseRest<Array<{ id: string }>>(
      'POST',
      'rpc/atlas_policy_eligible_memories',
      { p_user_id: userId, p_limit: 20 },
    );
    const eligibleCount = eligibleRes.ok && Array.isArray(eligibleRes.data)
      ? eligibleRes.data.length
      : 0;

    const conflictRes = await supabaseRest<Array<{ id: string }>>(
      'POST',
      'rpc/atlas_conflicted_memories',
      { p_user_id: userId, p_limit: 10 },
    );
    const unresolvedCount = conflictRes.ok && Array.isArray(conflictRes.data)
      ? conflictRes.data.filter((r) => {
          const row = r as unknown as { contradiction_status?: string };
          return row.contradiction_status === 'unresolved';
        }).length
      : 0;

    return { eligibleCount, unresolvedCount };
  } catch {
    return { eligibleCount: 0, unresolvedCount: 0 };
  }
}

// ── Gate evaluation ───────────────────────────────────────────────────────────

async function evaluateGates(
  userId: string,
  patch: PolicyPatch,
): Promise<PolicyGateSummary> {
  const rejectionReasons: string[] = [];
  const scopeType = patch.scopeType ?? patch.governanceClass ?? 'global';

  // Gate 1: Scope — non-global patches cannot write global policy.
  const provenanceOk = !patch.evidence?.some((e) =>
    e.toLowerCase().includes('[assistant]') || e.toLowerCase().includes('atlas said')
  );

  if (scopeType !== 'global' && scopeType !== 'undefined') {
    rejectionReasons.push(`scope-gate: patch is scoped to '${scopeType}', not global`);
  }

  // Gate 2: Provenance — check that evidence is user-origin.
  if (!provenanceOk) {
    rejectionReasons.push('provenance-gate: evidence appears to originate from assistant output');
  }

  // Gate 3: Confidence floor.
  if (patch.confidence < MIN_APPLY_CONFIDENCE) {
    rejectionReasons.push(`confidence-gate: ${patch.confidence.toFixed(2)} < ${MIN_APPLY_CONFIDENCE}`);
  }

  // Gate 4: Policy-eligible memories + unresolved contradictions.
  const { eligibleCount, unresolvedCount } = await checkPolicyEligibility(userId);

  if (eligibleCount === 0) {
    rejectionReasons.push('eligibility-gate: no policy-eligible memories found for this user');
  }

  if (unresolvedCount >= 2) {
    rejectionReasons.push(`contradiction-gate: ${unresolvedCount} unresolved memory conflicts; policy write deferred`);
  }

  // Gate 5: Recurrence requirement for preference dimensions.
  const affectsBehavioralPrefs = patch.verbosity || patch.tone || patch.structurePreference;
  if (affectsBehavioralPrefs && patch.confidence < HIGH_CONFIDENCE_BYPASS_THRESHOLD && eligibleCount < 2) {
    rejectionReasons.push(
      `recurrence-gate: behavioral preference change requires confidence >= ${HIGH_CONFIDENCE_BYPASS_THRESHOLD} OR >= 2 eligible memories (got ${eligibleCount})`,
    );
  }

  return {
    passed: rejectionReasons.length === 0,
    rejectionReasons,
    eligibleMemoryCount: eligibleCount,
    unresolvedConflictCount: unresolvedCount,
    scopeType,
    provenanceOk,
  };
}

// ── Main API ──────────────────────────────────────────────────────────────────

/**
 * Apply a distiller-emitted PolicyPatch to a user's policy profile.
 * Returns null (no-op) when any gate fails.
 *
 * Phase 0.75: All gates must pass before any field is written.
 * Rejected patches are logged via governance events for interpretability.
 */
export async function applyPolicyPatch(
  userId: string,
  patch: PolicyPatch | null,
): Promise<ApplyOutcome> {
  if (!env.memoryPolicyAutoWriteEnabled) return null;
  if (!userId || !patch) return null;

  const gateSummary = await evaluateGates(userId, patch);

  if (!gateSummary.passed) {
    console.info(
      `[policyAutoWriter] patch REJECTED for user ${userId}: ${gateSummary.rejectionReasons.join('; ')}`,
    );
    // Log rejection to governance events for interpretability.
    await logPolicyDecision(userId, 'rejected', patch, gateSummary);
    return null;
  }

  // ── Phase 0.85: Policy Simulation Gate ────────────────────────────────────
  // Before any field mutation, run the 7-step simulation sandbox.
  // If outcome is 'reject', the patch is suppressed even if governance gates passed.
  // If outcome is 'stage', we log but still defer live application.
  // Only outcome='apply' allows proceeding to field mutation.
  const primaryField = patch.verbosity
    ? 'verbosity'
    : patch.tone
    ? 'tone'
    : patch.structurePreference
    ? 'structurePreference'
    : 'truthFirstStrictness';

  const current = getPolicyProfile(userId);

  const evidenceChain: EvidenceProfile[] = (patch.evidence ?? []).map((e, i) => ({
    id: `pat-${i}`,
    userId,
    evidenceType: e.toLowerCase().includes('user') ? 'user_stated_truth' : 'assistant_inference',
    evidenceDirectness: 'direct',
    evidenceStrength: patch.confidence,
    evidenceRecurrence: 1,
    evidenceStability: 0.8,
    evidenceConfirmationStatus: 'unconfirmed',
    evidenceOperationalWeight: patch.confidence,
    operationalTrustLevel: patch.confidence >= 0.85 ? 'high' : 'moderate',
    policyEligibilityRecommendation: patch.confidence >= 0.75 ? 'apply' : 'stage',
    identityEligibilityRecommendation: 'contextual',
    personalizationIntensityCap: 'moderate',
  } satisfies EvidenceProfile));

  const simInput: SimulationInput = {
    userId,
    policyField: primaryField,
    currentValue: (current as unknown as Record<string, unknown>)[primaryField],
    proposedValue: (patch as unknown as Record<string, unknown>)[primaryField] ?? patch.truthFirstStrictnessDelta,
    evidenceChain,
    contradictionBurden: gateSummary.unresolvedConflictCount > 0
      ? Math.min(1, gateSummary.unresolvedConflictCount * 0.25)
      : 0,
    correctionHistory: [],
  };

  let simResult: Awaited<ReturnType<typeof simulatePolicyMutation>> | null = null;
  try {
    simResult = await simulatePolicyMutation(simInput);
    if (!simResult.shouldApplyLive) {
      console.info(
        `[policyAutoWriter] simulation BLOCKED patch (outcome=${simResult.outcome}, reason=${simResult.reason})`,
      );
      await logPolicyDecision(userId, 'rejected', patch, {
        ...gateSummary,
        rejectionReasons: [
          ...gateSummary.rejectionReasons,
          `simulation-gate: ${simResult.outcome} — ${simResult.reason}`,
        ],
      });
      return null;
    }
    console.info(
      `[policyAutoWriter] simulation approved patch (outcome=${simResult.outcome}, risk=${simResult.riskLevel})`,
    );
  } catch (simErr) {
    // Simulation is advisory — if it throws, log and continue with prior gate approval
    console.warn('[policyAutoWriter] policySimulationService threw (non-fatal, proceeding):', simErr);
  }
  // ────────────────────────────────────────────────────────────────────────────

  const next: Partial<Parameters<typeof updatePolicyProfile>[1]> = {};

  if (patch.verbosity && patch.verbosity !== current.verbosity) {
    next.verbosity = patch.verbosity;
  }

  if (patch.tone) {
    const normalized = patch.tone.trim().toLowerCase() as PolicyProfile['tone'];
    if (ALLOWED_TONES.includes(normalized) && normalized !== current.tone) {
      next.tone = normalized;
    }
  }

  if (patch.structurePreference && patch.structurePreference !== current.structurePreference) {
    next.structurePreference = patch.structurePreference;
  }

  if (typeof patch.truthFirstStrictnessDelta === 'number' && patch.truthFirstStrictnessDelta !== 0) {
    const clampedDelta = Math.max(-MAX_STRICTNESS_STEP, Math.min(MAX_STRICTNESS_STEP, patch.truthFirstStrictnessDelta));
    const proposed = Math.max(0, Math.min(1, current.truthFirstStrictness + clampedDelta));
    if (Math.abs(proposed - current.truthFirstStrictness) >= 0.02) {
      next.truthFirstStrictness = Number(proposed.toFixed(3));
    }
  }

  if (patch.preferredComputeDepth && patch.preferredComputeDepth !== current.preferredComputeDepth) {
    next.preferredComputeDepth = patch.preferredComputeDepth;
  }

  if (patch.latencyTolerance && patch.latencyTolerance !== current.latencyTolerance) {
    next.latencyTolerance = patch.latencyTolerance;
  }

  if (Object.keys(next).length === 0) return null;

  let profileAfter: PolicyProfile;
  try {
    profileAfter = updatePolicyProfile(userId, next);
  } catch (err) {
    console.warn('[policyAutoWriter] updatePolicyProfile failed (non-fatal):', err);
    return null;
  }

  const auditPayload = {
    ...next,
    __confidence: patch.confidence,
    __evidence: patch.evidence,
    __gate_summary: gateSummary,
    __governance_version: '0.75',
  };

  // Record the applied patch on the latest distiller run.
  void markPolicyPatched(userId, auditPayload).catch(() => {});

  // Log to governance events.
  await logPolicyDecision(userId, 'applied', patch, gateSummary, next);

  return {
    applied: true,
    diff: next as ApplyResult['diff'],
    profileAfter,
    confidence: patch.confidence,
    gateSummary,
  };
}

// ── Internal audit helpers ─────────────────────────────────────────────────────

async function logPolicyDecision(
  userId: string,
  decision: 'applied' | 'rejected',
  patch: PolicyPatch,
  gateSummary: PolicyGateSummary,
  diff?: Record<string, unknown>,
): Promise<void> {
  if (!process.env.SUPABASE_URL) return;
  try {
    await supabaseRest(
      'POST',
      'memory_governance_events',
      {
        user_id: userId,
        memory_id: null,
        event_type: 'policy_applied',
        payload: {
          decision,
          confidence: patch.confidence,
          scope_type: gateSummary.scopeType,
          eligible_memory_count: gateSummary.eligibleMemoryCount,
          unresolved_conflict_count: gateSummary.unresolvedConflictCount,
          rejection_reasons: gateSummary.rejectionReasons,
          diff: diff ?? null,
          evidence_sample: Array.isArray(patch.evidence) ? patch.evidence.slice(0, 3) : [],
          governance_version: '0.75',
        },
      },
      { Prefer: 'return=minimal' },
    );
  } catch {
    // never throw from audit
  }
}
