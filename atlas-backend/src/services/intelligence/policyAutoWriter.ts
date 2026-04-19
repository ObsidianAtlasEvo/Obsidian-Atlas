/**
 * policyAutoWriter.ts — Phase 0.5 bridge between the memory distiller and
 * the existing rule-based policy engine.
 *
 * The memory distiller emits a PolicyPatch (verbosity, tone, structure, etc.)
 * alongside a confidence score. This module:
 *
 *   1. Loads the current SQLite policy_profiles row for the user
 *   2. Validates the patch (tone must be a known value, no overshoot on
 *      truthFirstStrictness, etc.)
 *   3. Applies the patch via the existing updatePolicyProfile() path, which
 *      flips is_learned=1 so userTelemetryFromPolicyProfile() starts injecting
 *      the preferences into swarm + overseer prompts
 *   4. Reports back what was actually applied (so the distiller run audit row
 *      can record `policy_patched=true` with the exact diff)
 *
 * Invariants:
 *   - Feature-flag gated (env.memoryPolicyAutoWriteEnabled).
 *   - Non-throwing; returns null when nothing was applied.
 *   - Minimum confidence 0.7 enforced here as a second gate beyond the
 *     distiller's own schema.
 *   - truthFirstStrictness moves at most ±0.1 per application to avoid a
 *     single high-confidence correction flipping the whole dial.
 *   - Tone values outside the allowed enum silently drop rather than failing.
 */

import { env } from '../../config/env.js';
import {
  getPolicyProfile,
  updatePolicyProfile,
} from '../evolution/policyStore.js';
import type { PolicyProfile } from '../../types/atlas.js';
import type { PolicyPatch } from './memoryDistiller.js';
import { markPolicyPatched } from './memoryDistiller.js';

const ALLOWED_TONES: ReadonlyArray<PolicyProfile['tone']> = [
  'direct',
  'professional',
  'warm',
  'analytical',
];

const MIN_APPLY_CONFIDENCE = 0.7;
const MAX_STRICTNESS_STEP = 0.1;

export interface ApplyResult {
  applied: true;
  diff: Partial<
    Pick<
      PolicyProfile,
      'verbosity' | 'tone' | 'structurePreference' | 'truthFirstStrictness' | 'preferredComputeDepth' | 'latencyTolerance'
    >
  >;
  profileAfter: PolicyProfile;
  confidence: number;
}

export type ApplyOutcome = ApplyResult | null;

/**
 * Apply a distiller-emitted PolicyPatch to a user's policy profile.
 * Returns null (no-op) when the flag is off, the confidence is too low,
 * or nothing in the patch survives validation.
 */
export async function applyPolicyPatch(userId: string, patch: PolicyPatch | null): Promise<ApplyOutcome> {
  if (!env.memoryPolicyAutoWriteEnabled) return null;
  if (!userId || !patch) return null;
  if (patch.confidence < MIN_APPLY_CONFIDENCE) return null;

  const current = getPolicyProfile(userId);

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
    // Only apply when the change is meaningful (avoid stamping updated_at for no-op).
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

  // Record what we applied on the latest distiller run (best-effort).
  void markPolicyPatched(userId, { ...next, __confidence: patch.confidence, __evidence: patch.evidence });

  return {
    applied: true,
    diff: next as ApplyResult['diff'],
    profileAfter,
    confidence: patch.confidence,
  };
}
