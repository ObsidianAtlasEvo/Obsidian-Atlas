/**
 * epistemicBoundaryService.ts — Phase 0.85: Epistemic Boundary Enforcement
 *
 * THE guardrail contract for Atlas's epistemic integrity. This service draws
 * the hard line between what may be personalized and what must remain
 * epistemically constant regardless of user preferences.
 *
 * Personalization may shape HOW Atlas communicates.
 * It may NEVER shape WHETHER Atlas is truthful, accurate, or safe.
 *
 * All functions in this file are pure — no I/O, no side effects.
 * This makes them suitable for synchronous gate-checking in any hot path.
 *
 * Governing principle: The user's preferences govern style, not truth.
 */

// ── Domain constants ───────────────────────────────────────────────────────────

/**
 * Domains where user-directed personalization is fully permitted.
 * Personalization in these domains changes style, framing, and presentation.
 * It does NOT affect factual accuracy or epistemic standards.
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

export type PersonalizationAllowedDomain = typeof PERSONALIZATION_ALLOWED_DOMAINS[number];

/**
 * Domains that are constitutionally protected from personalization.
 * Any mutation request targeting these domains is BLOCKED unconditionally.
 *
 * These are not negotiable — not even high-confidence, high-stability signals
 * may alter them, because they guard the epistemic contract with the user.
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

export type EpistemicProtectedDomain = typeof EPISTEMIC_PROTECTED_DOMAINS[number];

export const EPISTEMIC_BOUNDARY_VERSION = '0.85';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BoundaryCheckResult {
  allowed: boolean;
  allowedModifiers: string[];
  blockedModifiers: string[];
  guardrailWarnings: string[];
  constitutionSafeConstraints: string[];
}

// ── Core boundary check ───────────────────────────────────────────────────────

/**
 * Check a list of proposed personalization modifiers against boundary rules.
 *
 * Returns which modifiers are permitted, which are blocked, and any
 * guardrail warnings that should be logged or surfaced in audit trails.
 */
export function checkPersonalizationRequest(
  requestedModifiers: string[],
): BoundaryCheckResult {
  const allowedSet = new Set<string>(PERSONALIZATION_ALLOWED_DOMAINS);
  const protectedSet = new Set<string>(EPISTEMIC_PROTECTED_DOMAINS);

  const allowedModifiers: string[] = [];
  const blockedModifiers: string[] = [];
  const guardrailWarnings: string[] = [];
  const constitutionSafeConstraints: string[] = [];

  for (const modifier of requestedModifiers) {
    if (protectedSet.has(modifier)) {
      blockedModifiers.push(modifier);
      guardrailWarnings.push(
        `[GUARDRAIL v${EPISTEMIC_BOUNDARY_VERSION}] Modifier '${modifier}' is an epistemic-protected domain. Personalization blocked unconditionally.`,
      );
      constitutionSafeConstraints.push(
        `${modifier}: constitutionally protected — cannot be personalized`,
      );
    } else if (allowedSet.has(modifier)) {
      allowedModifiers.push(modifier);
    } else {
      // Unknown modifier — conservatively block and warn
      blockedModifiers.push(modifier);
      guardrailWarnings.push(
        `[GUARDRAIL v${EPISTEMIC_BOUNDARY_VERSION}] Modifier '${modifier}' is not in the approved personalization domain list. Blocked as unknown.`,
      );
    }
  }

  const allowed = blockedModifiers.length === 0 && requestedModifiers.length > 0;

  return {
    allowed,
    allowedModifiers,
    blockedModifiers,
    guardrailWarnings,
    constitutionSafeConstraints,
  };
}

// ── Field-level epistemic gate ────────────────────────────────────────────────

/**
 * Final gate: is this specific policy field safe to personalize at this value?
 *
 * Rules:
 *   - Any field in EPISTEMIC_PROTECTED_DOMAINS → blocked.
 *   - truthFirstStrictness:
 *       safe only if delta < 0.15 AND direction is an increase (never below 0.65).
 *   - Any field whose name contains 'factual', 'accuracy', 'truth', 'evidence',
 *     'contradiction', 'confidence', 'safety', 'constitution' → blocked.
 *   - All other fields in PERSONALIZATION_ALLOWED_DOMAINS → safe.
 *   - Unknown fields → blocked (conservative default).
 */
export function enforceEpistemicBoundary(
  policyField: string,
  proposedValue: unknown,
  currentValue?: unknown,
): { safe: boolean; reason: string } {
  // Hard block: explicitly protected domain
  if ((EPISTEMIC_PROTECTED_DOMAINS as ReadonlyArray<string>).includes(policyField)) {
    return {
      safe: false,
      reason: `Field '${policyField}' is an epistemic-protected domain — personalization blocked unconditionally (v${EPISTEMIC_BOUNDARY_VERSION}).`,
    };
  }

  // Semantic block: field name contains epistemic-sensitive keywords
  const epistemicKeywords = [
    'factual', 'accuracy', 'truth', 'evidence',
    'contradiction', 'confidence', 'safety', 'constitution',
    'integrity', 'disclosure',
  ];
  const fieldLower = policyField.toLowerCase();
  for (const keyword of epistemicKeywords) {
    if (fieldLower.includes(keyword)) {
      return {
        safe: false,
        reason: `Field '${policyField}' matches epistemic-sensitive keyword '${keyword}' — personalization blocked to protect epistemic integrity (v${EPISTEMIC_BOUNDARY_VERSION}).`,
      };
    }
  }

  // Special rule: truthFirstStrictness
  if (policyField === 'truthFirstStrictness') {
    if (typeof proposedValue !== 'number') {
      return {
        safe: false,
        reason: `truthFirstStrictness must be a numeric value — non-numeric proposed value blocked.`,
      };
    }

    const proposed = proposedValue as number;

    // Hard floor: must never drop below 0.65
    if (proposed < 0.65) {
      return {
        safe: false,
        reason: `truthFirstStrictness may not be lowered below 0.65 — constitutional floor protects epistemic integrity. Proposed: ${proposed.toFixed(3)}.`,
      };
    }

    // Delta constraint: max ±0.15 per mutation
    if (typeof currentValue === 'number') {
      const delta = proposed - (currentValue as number);
      if (Math.abs(delta) >= 0.15) {
        return {
          safe: false,
          reason: `truthFirstStrictness delta ${delta.toFixed(3)} exceeds max allowed ±0.15 per mutation. Current: ${(currentValue as number).toFixed(3)}, Proposed: ${proposed.toFixed(3)}.`,
        };
      }
      if (delta < 0) {
        return {
          safe: false,
          reason: `truthFirstStrictness may not decrease. Personalization can only raise this value, never lower it. Current: ${(currentValue as number).toFixed(3)}, Proposed: ${proposed.toFixed(3)}.`,
        };
      }
    }

    return {
      safe: true,
      reason: `truthFirstStrictness adjustment is within safe bounds (delta < 0.15, value ≥ 0.65, direction: increase).`,
    };
  }

  // Explicitly allowed domain → safe
  if ((PERSONALIZATION_ALLOWED_DOMAINS as ReadonlyArray<string>).includes(policyField)) {
    return {
      safe: true,
      reason: `Field '${policyField}' is in the approved personalization domain list.`,
    };
  }

  // Unknown field → conservatively block
  return {
    safe: false,
    reason: `Field '${policyField}' is not in the approved personalization domain list. Unknown fields are blocked by default (v${EPISTEMIC_BOUNDARY_VERSION}).`,
  };
}

// ── Audit formatting ──────────────────────────────────────────────────────────

/**
 * Produce a compact audit string from a boundary check result.
 */
export function formatBoundaryReport(result: BoundaryCheckResult): string {
  const lines: string[] = [
    `[boundary v${EPISTEMIC_BOUNDARY_VERSION}] allowed=${result.allowed}`,
    `  allowed_modifiers: ${result.allowedModifiers.join(', ') || 'none'}`,
    `  blocked_modifiers: ${result.blockedModifiers.join(', ') || 'none'}`,
  ];

  if (result.guardrailWarnings.length > 0) {
    lines.push(`  warnings(${result.guardrailWarnings.length}):`);
    for (const w of result.guardrailWarnings) {
      lines.push(`    - ${w}`);
    }
  }

  if (result.constitutionSafeConstraints.length > 0) {
    lines.push(`  constitution_constraints:`);
    for (const c of result.constitutionSafeConstraints) {
      lines.push(`    * ${c}`);
    }
  }

  return lines.join('\n');
}
