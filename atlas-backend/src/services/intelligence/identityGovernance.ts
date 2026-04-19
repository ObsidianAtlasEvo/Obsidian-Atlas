/**
 * identityGovernance.ts — Phase 0.8: Identity Resolution types, Zod schemas,
 * and pure classification functions.
 *
 * Design invariants:
 *   - Zero I/O. All exports are pure types, schemas, or pure functions.
 *   - Imports only from memoryGovernance.ts (already-defined phase) and zod.
 *   - All functions accept undefined/null gracefully and return safe defaults.
 *   - TypeScript strict-mode compatible.
 */

import { z } from 'zod';
import {
  type MemoryProvenance,
  type MemoryScopeType,
  memoryProvenanceSchema,
  memoryScopeTypeSchema,
} from './memoryGovernance.js';

// ── Re-export upstream types so consumers can import from one place ──────────

export type { MemoryProvenance, MemoryScopeType };

// ── Identity Domain ──────────────────────────────────────────────────────────

/**
 * The six first-class identity domains Atlas tracks per user.
 *
 * communication_profile — tone, verbosity, formality, preferred formats
 * challenge_profile     — how the user wants to be challenged / pushed back on
 * epistemic_profile     — certainty tolerance, evidence bar, nuance preference
 * chamber_profile       — behaviour preferences scoped to specific chambers
 * workflow_profile      — task/project execution preferences
 * active_constraints    — hard constraints currently in effect (do-nots)
 */
export type IdentityDomain =
  | 'communication_profile'
  | 'challenge_profile'
  | 'epistemic_profile'
  | 'chamber_profile'
  | 'workflow_profile'
  | 'active_constraints';

export const identityDomainSchema = z.enum([
  'communication_profile',
  'challenge_profile',
  'epistemic_profile',
  'chamber_profile',
  'workflow_profile',
  'active_constraints',
]);

// ── Scope + Explicitness ─────────────────────────────────────────────────────

/** How tightly a signal is scoped to its context. */
export type ScopeStrength = 'narrow' | 'moderate' | 'broad';

/**
 * How explicitly the user expressed a preference.
 *
 * explicit       — user directly stated this ("I prefer X")
 * inferred       — Atlas inferred from observed behaviour
 * system_derived — derived from system-level signals (usage stats, corrections)
 */
export type ExplicitnessLevel = 'explicit' | 'inferred' | 'system_derived';

export const scopeStrengthSchema = z.enum(['narrow', 'moderate', 'broad']);
export const explicitnessLevelSchema = z.enum(['explicit', 'inferred', 'system_derived']);

// ── ScopeResolution ──────────────────────────────────────────────────────────

/**
 * The fully resolved scope assignment for a signal or memory candidate.
 */
export interface ScopeResolution {
  scopeType: MemoryScopeType;
  scopeKey?: string;
  scopeStrength: ScopeStrength;
  scopeConfidence: number;     // 0..1
  scopeExpiration?: Date;
  scopeReasoning: string;
}

export const scopeResolutionSchema = z.object({
  scopeType: memoryScopeTypeSchema,
  scopeKey: z.string().max(120).optional(),
  scopeStrength: scopeStrengthSchema,
  scopeConfidence: z.number().min(0).max(1),
  scopeExpiration: z.date().optional(),
  scopeReasoning: z.string().max(400),
});

// ── IdentitySignalInput ──────────────────────────────────────────────────────

/**
 * Fully-specified input for creating an identity signal from a governed memory.
 */
export interface IdentitySignalInput {
  content: string;
  domain: IdentityDomain;
  provenance: MemoryProvenance;
  explicitnessLevel: ExplicitnessLevel;
  correctionPriority: number;
  scopeResolution: ScopeResolution;
  confidence: number;
  stabilityScore: number;
  memoryId?: string;
}

export const identitySignalInputSchema = z.object({
  content: z.string().min(4).max(600),
  domain: identityDomainSchema,
  provenance: memoryProvenanceSchema,
  explicitnessLevel: explicitnessLevelSchema,
  correctionPriority: z.number().int(),
  scopeResolution: scopeResolutionSchema,
  confidence: z.number().min(0).max(1),
  stabilityScore: z.number().min(0).max(1),
  memoryId: z.string().uuid().optional(),
});

// ── ResolvedIdentityDomain ───────────────────────────────────────────────────

/**
 * The resolved state of a single identity domain for a user.
 * This is what gets stored in user_identity_domains and returned to callers.
 */
export interface ResolvedIdentityDomain {
  domain: IdentityDomain;
  confidence: number;
  stability: number;
  scopeType: MemoryScopeType;
  scopeKey?: string;
  contradictionStatus: 'none' | 'unresolved' | 'resolved';
  payload: Record<string, unknown>;
  lastChangedAt: Date;
}

export const resolvedIdentityDomainSchema = z.object({
  domain: identityDomainSchema,
  confidence: z.number().min(0).max(1),
  stability: z.number().min(0).max(1),
  scopeType: memoryScopeTypeSchema,
  scopeKey: z.string().max(120).optional(),
  contradictionStatus: z.enum(['none', 'unresolved', 'resolved']),
  payload: z.record(z.string(), z.unknown()),
  lastChangedAt: z.date(),
});

// ── ActiveIdentityContract ───────────────────────────────────────────────────

/**
 * The live identity lens for a single turn — composed from all resolved domains,
 * filtered and scoped to the current chamber/project/topic.
 *
 * This is what the Overseer receives, never the raw domain rows.
 */
export interface ActiveIdentityContract {
  userId: string;
  activeToneProfile: Record<string, unknown>;
  activeDepthProfile: Record<string, unknown>;
  activeChallengeProfile: Record<string, unknown>;
  activeScopeExceptions: ScopeResolution[];
  activeIdentityConstraints: string[];
  activeConflictsToRespect: string[];
  activeUncertaintyNotes: string[];
  activeBehaviorBoundaries: string[];
  resolvedAt: Date;
}

export const activeIdentityContractSchema = z.object({
  userId: z.string().uuid(),
  activeToneProfile: z.record(z.string(), z.unknown()),
  activeDepthProfile: z.record(z.string(), z.unknown()),
  activeChallengeProfile: z.record(z.string(), z.unknown()),
  activeScopeExceptions: z.array(scopeResolutionSchema),
  activeIdentityConstraints: z.array(z.string()),
  activeConflictsToRespect: z.array(z.string()),
  activeUncertaintyNotes: z.array(z.string()),
  activeBehaviorBoundaries: z.array(z.string()),
  resolvedAt: z.date(),
});

// ── Pure Functions ───────────────────────────────────────────────────────────

/**
 * Rule-based domain assignment from content text and memory kind.
 *
 * Priority order (first match wins):
 * 1. kind === 'correction' → active_constraints
 * 2. Content has constraint / forbidden / boundary cues → active_constraints
 * 3. Content has tone / style / formality / format cues → communication_profile
 * 4. Content has challenge / pushback / devil's advocate cues → challenge_profile
 * 5. Content has evidence / certainty / nuance / source cues → epistemic_profile
 * 6. Content has chamber / room / space cues → chamber_profile
 * 7. Content has workflow / task / project / deadline cues → workflow_profile
 * 8. Default → communication_profile
 */
export function inferDomainFromContent(
  content: string,
  kind: string,
): IdentityDomain {
  if (!content) return 'communication_profile';

  // Corrections always become constraints.
  if (kind === 'correction') return 'active_constraints';

  const lower = content.toLowerCase();

  // Constraint / boundary signals.
  if (/\b(don't|do not|never|always|must not|forbidden|boundary|constraint|stop|refuse|avoid|don't ever)\b/.test(lower)) {
    return 'active_constraints';
  }

  // Communication profile signals.
  if (/\b(tone|style|formal|informal|casual|verbose|concise|brief|markdown|bullet|list|format|explain|plain|detail|length|short|long|simple|technical)\b/.test(lower)) {
    return 'communication_profile';
  }

  // Challenge profile signals.
  if (/\b(challenge|push back|disagree|devil's advocate|question|probe|critical|push|argue|contradict|confront|skeptic|doubt)\b/.test(lower)) {
    return 'challenge_profile';
  }

  // Epistemic profile signals.
  if (/\b(evidence|source|cite|certain|uncertain|probability|nuance|hedge|caveat|always acknowledge|claim|fact.check|verify|speculate|confidence|epistemic)\b/.test(lower)) {
    return 'epistemic_profile';
  }

  // Chamber profile signals.
  if (/\b(chamber|room|space|atlas chamber|in this chamber|when i'm in)\b/.test(lower)) {
    return 'chamber_profile';
  }

  // Workflow profile signals.
  if (/\b(workflow|task|project|deadline|priority|planning|schedule|process|pipeline|checklist|step.by.step|next steps|todo|backlog)\b/.test(lower)) {
    return 'workflow_profile';
  }

  return 'communication_profile';
}

/**
 * Compute the identity weight for a signal — how much it should influence
 * the domain's aggregate confidence and payload.
 *
 * Weight components:
 *   - provenance base:        user_stated=0.9, user_confirmed=0.8,
 *                             corrected_by_user=1.0, system_derived=0.6,
 *                             assistant_inferred=0.3 (capped at 0.45 per doctrine)
 *   - explicitness multiplier: explicit=1.0, inferred=0.7, system_derived=0.6
 *   - correction bonus:       correctionPriority >= 100 → +0.1 (clamped to 1.0)
 *   - stability factor:       multiply by (0.5 + 0.5 * stability)
 *   - confidence factor:      multiply by confidence
 */
export function computeIdentityWeight(
  provenance: MemoryProvenance | null | undefined,
  explicitnessLevel: ExplicitnessLevel | null | undefined,
  correctionPriority: number | null | undefined,
  stability: number | null | undefined,
  confidence: number | null | undefined,
): number {
  const safeProvenance = provenance ?? 'assistant_inferred';
  const safeExplicitness = explicitnessLevel ?? 'inferred';
  const safePriority = correctionPriority ?? 0;
  const safeStability = Math.max(0, Math.min(1, stability ?? 0.5));
  const safeConfidence = Math.max(0, Math.min(1, confidence ?? 0.5));

  // Provenance base score.
  const provenanceBase: Record<MemoryProvenance, number> = {
    corrected_by_user: 1.0,
    user_stated: 0.9,
    user_confirmed: 0.8,
    system_derived: 0.6,
    assistant_inferred: 0.3,
  };
  let base = provenanceBase[safeProvenance] ?? 0.3;

  // Cap assistant_inferred per doctrine.
  if (safeProvenance === 'assistant_inferred') {
    base = Math.min(base, 0.45);
  }

  // Explicitness multiplier.
  const explicitMultiplier: Record<ExplicitnessLevel, number> = {
    explicit: 1.0,
    inferred: 0.7,
    system_derived: 0.6,
  };
  const multiplier = explicitMultiplier[safeExplicitness] ?? 0.7;

  // Correction bonus.
  const correctionBonus = safePriority >= 100 ? 0.1 : 0;

  // Stability and confidence factors.
  const stabilityFactor = 0.5 + 0.5 * safeStability;

  const raw = (base * multiplier + correctionBonus) * stabilityFactor * safeConfidence;
  return Math.max(0, Math.min(1, raw));
}

/**
 * Gate: returns true only when a signal is safe to shape Overseer behaviour.
 *
 * Rules (ALL must be true):
 * 1. Provenance must be user_stated, user_confirmed, or corrected_by_user
 * 2. Explicitness must be 'explicit' (not inferred by default — system_derived may pass with high confidence)
 * 3. Confidence >= 0.55
 * 4. Stability >= 0.5
 * 5. Scope is not 'session' (session-scoped signals never drive global identity)
 * 6. Correction priority >= 0 (demoted signals have -1)
 */
export function isOperationallyEligible(
  signal: IdentitySignalInput | null | undefined,
): boolean {
  if (!signal) return false;

  const trustedProvenance = new Set<MemoryProvenance>([
    'user_stated',
    'user_confirmed',
    'corrected_by_user',
  ]);

  if (!trustedProvenance.has(signal.provenance)) return false;
  if (signal.explicitnessLevel === 'inferred') return false;
  if (signal.confidence < 0.55) return false;
  if (signal.stabilityScore < 0.5) return false;
  if (signal.scopeResolution.scopeType === 'session') return false;
  if (signal.correctionPriority < 0) return false;

  return true;
}

/**
 * Map a MemoryScopeType to a ScopeStrength.
 *
 * session           → narrow  (most restricted)
 * project/topic/chamber → moderate
 * global            → broad
 */
export function computeScopeStrength(
  scopeType: MemoryScopeType | null | undefined,
): ScopeStrength {
  if (!scopeType) return 'broad';
  switch (scopeType) {
    case 'session': return 'narrow';
    case 'project':
    case 'topic':
    case 'chamber': return 'moderate';
    case 'global':
    default:        return 'broad';
  }
}

/**
 * Compute a correction priority score for a memory based on kind and provenance.
 *
 * Score semantics:
 *   100 — explicit user correction (kind='correction' or provenance='corrected_by_user')
 *   10  — user_stated preference
 *   5   — user_confirmed preference
 *   3   — system_derived signal
 *   1   — assistant_inferred signal (lowest trust)
 */
export function correctionPriorityScore(
  kind: string | null | undefined,
  provenance: MemoryProvenance | null | undefined,
): number {
  const safeKind = kind ?? '';
  const safeProvenance = provenance ?? 'assistant_inferred';

  if (safeKind === 'correction' || safeProvenance === 'corrected_by_user') {
    return 100;
  }
  if (safeProvenance === 'user_stated') return 10;
  if (safeProvenance === 'user_confirmed') return 5;
  if (safeProvenance === 'system_derived') return 3;
  // assistant_inferred
  return 1;
}

// ── Internal test helpers ─────────────────────────────────────────────────────

/**
 * Exported purely for unit tests. Not part of the public API contract.
 */
export const __internal = {
  /** All valid identity domains as an array (for test iteration). */
  ALL_DOMAINS: [
    'communication_profile',
    'challenge_profile',
    'epistemic_profile',
    'chamber_profile',
    'workflow_profile',
    'active_constraints',
  ] as IdentityDomain[],

  /** All valid scope strengths. */
  ALL_SCOPE_STRENGTHS: ['narrow', 'moderate', 'broad'] as ScopeStrength[],

  /**
   * Build a minimal IdentitySignalInput for test use without having to
   * specify every field.
   */
  buildSignalInput(overrides: Partial<IdentitySignalInput> = {}): IdentitySignalInput {
    const defaultScope: ScopeResolution = {
      scopeType: 'global',
      scopeStrength: 'broad',
      scopeConfidence: 0.8,
      scopeReasoning: 'default test scope',
    };
    return {
      content: 'test signal content',
      domain: 'communication_profile',
      provenance: 'user_stated',
      explicitnessLevel: 'explicit',
      correctionPriority: 0,
      scopeResolution: defaultScope,
      confidence: 0.7,
      stabilityScore: 0.6,
      ...overrides,
    };
  },
} as const;
