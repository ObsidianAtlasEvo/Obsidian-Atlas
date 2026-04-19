/**
 * personalizationIntensityService.ts — Phase 0.85: Personalization Intensity
 *
 * Determines how strongly personalization may act on a given signal, and which
 * influence domains are permitted to be modified. This service is the second
 * gate in the epistemic governance pipeline — after evidence arbitration
 * produces a profile, intensity decides *how much* that profile may shape
 * Atlas's behavior.
 *
 * Governing principle: A signal's confirmed quality, scope, and drift context
 * together determine the maximum intensity at which it may personalize output.
 * Epistemic-protected domains are NEVER modifiable regardless of intensity.
 */

import type { EvidenceProfile } from './evidenceArbitrationService.js';

// ── Domain constants ───────────────────────────────────────────────────────────

/**
 * Domains where user-directed personalization is permitted.
 * These affect style, structure, and presentation — never epistemic truth.
 */
export const PERSONALIZATION_ALLOWED_DOMAINS = [
  'tone',
  'pacing',
  'depth',
  'structure',
  'challenge_level',
  'chamber_intensity',
  'communicative_framing',
  'verbosity',
  'formatting',
  'example_selection',
  'pushback_calibration',
] as const;

/**
 * Domains that are ALWAYS off-limits for personalization.
 * Enforced in both this service and epistemicBoundaryService.
 */
export const EPISTEMIC_PROTECTED_DOMAINS = [
  'factual_standards',
  'contradiction_disclosure',
  'confidence_labeling',
  'evidence_requirements',
  'truth_first_posture',
  'constitutional_refusals',
  'safety_integrity_boundaries',
] as const;

export type PersonalizationIntensity = 'blocked' | 'light' | 'moderate' | 'strong';

export interface IntensityDecision {
  intensity: PersonalizationIntensity;
  allowedDomains: string[];
  suppressedDomains: string[];
  reason: string;
}

// ── Pure logic ────────────────────────────────────────────────────────────────

/**
 * Derive the effective personalization intensity for a set of evidence profiles.
 *
 * Rules (in descending precedence):
 *  1. ANY profile is 'blocked' for personalization → overall 'blocked' for that signal.
 *  2. Drift risk 'elevated' or 'severe' → cap at 'light' for all new mutations.
 *  3. Only confirmed + stable signals may reach 'strong'.
 *  4. 'moderate' allowed if at least one 'moderate' trust profile exists.
 *  5. Default → 'light'.
 *  6. Epistemic-protected domains are ALWAYS suppressed regardless of intensity.
 */
export function computeIntensity(
  profiles: EvidenceProfile[],
  contradictionStatus: string,
  driftRiskLevel: string,
): IntensityDecision {
  const allAllowedDomains = [...PERSONALIZATION_ALLOWED_DOMAINS];
  const alwaysSuppressed = [...EPISTEMIC_PROTECTED_DOMAINS];

  // Rule 1: blocked profile → blocked overall
  const hasBlockedProfile = profiles.some(
    (p) => p.personalizationIntensityCap === 'blocked',
  );
  if (hasBlockedProfile || contradictionStatus === 'contradicted') {
    return {
      intensity: 'blocked',
      allowedDomains: [],
      suppressedDomains: [...allAllowedDomains, ...alwaysSuppressed],
      reason: hasBlockedProfile
        ? 'One or more evidence profiles carry a blocked personalization cap.'
        : 'Unresolved contradiction status prevents personalization.',
    };
  }

  // Rule 2: elevated/severe drift → hard cap at 'light'
  if (driftRiskLevel === 'elevated' || driftRiskLevel === 'severe') {
    return {
      intensity: 'light',
      allowedDomains: allAllowedDomains,
      suppressedDomains: alwaysSuppressed,
      reason: `Drift risk level '${driftRiskLevel}' enforces light-only personalization ceiling.`,
    };
  }

  if (profiles.length === 0) {
    return {
      intensity: 'light',
      allowedDomains: allAllowedDomains,
      suppressedDomains: alwaysSuppressed,
      reason: 'No evidence profiles provided — defaulting to light intensity.',
    };
  }

  // Rule 3: strong requires confirmed + stable across all profiles
  const allConfirmedAndStable = profiles.every(
    (p) =>
      p.evidenceConfirmationStatus === 'confirmed' &&
      p.evidenceStability >= 0.7 &&
      p.personalizationIntensityCap === 'strong',
  );
  if (allConfirmedAndStable) {
    return {
      intensity: 'strong',
      allowedDomains: allAllowedDomains,
      suppressedDomains: alwaysSuppressed,
      reason: 'All profiles confirmed, stable, and strong-capped.',
    };
  }

  // Rule 4: moderate if any moderate-trust profile
  const hasModerate = profiles.some(
    (p) =>
      p.operationalTrustLevel === 'moderate' &&
      (p.personalizationIntensityCap === 'moderate' ||
        p.personalizationIntensityCap === 'strong'),
  );
  if (hasModerate) {
    return {
      intensity: 'moderate',
      allowedDomains: allAllowedDomains,
      suppressedDomains: alwaysSuppressed,
      reason: 'At least one moderate-trust, moderate-capped evidence profile present.',
    };
  }

  // Default → light
  return {
    intensity: 'light',
    allowedDomains: allAllowedDomains,
    suppressedDomains: alwaysSuppressed,
    reason: 'Evidence profiles support only light personalization intensity.',
  };
}

/**
 * Compact human-readable audit string for a personalization intensity decision.
 */
export function formatIntensityForLog(decision: IntensityDecision): string {
  return (
    `[intensity:${decision.intensity}] ` +
    `allowed=${decision.allowedDomains.length} domains | ` +
    `suppressed=${decision.suppressedDomains.length} domains | ` +
    `reason="${decision.reason}"`
  );
}
