/**
 * memoryGovernance.ts — Phase 0.75: Shared governance types, Zod schemas,
 * and classification rules for the Atlas memory substrate.
 *
 * This file is the single source of truth for all governance-layer enums,
 * types, and schema-validation used by:
 *   - memoryArbitrator.ts  (arbitration decisions)
 *   - memoryDistiller.ts   (structured candidate extraction)
 *   - policyAutoWriter.ts  (eligibility gate)
 *   - memoryService.ts     (recall filtering)
 *
 * Design invariants:
 *   - All enums are string-literal unions, not numeric, for auditability.
 *   - Legacy rows (missing governance fields) MUST remain safe to use.
 *     Every helper accepts undefined/null and returns a safe default.
 *   - No direct Supabase I/O in this file. Pure types + logic.
 *   - Zod schemas match the DB enum definitions in migration 006 exactly.
 */

import { z } from 'zod';

// ── Core Enums ───────────────────────────────────────────────────────────────

/**
 * Memory class — lifecycle stage + trust level of a memory row.
 *
 * durable      — explicitly user-stated or multi-confirmed. Long decay.
 * contextual   — project/topic/session scoped, not global identity.
 * tentative    — extracted once, unconfirmed. Short decay if assistant-inferred.
 * corrected    — demoted by explicit user correction. Low policy weight.
 * superseded   — replaced by a newer memory via arbitration.
 * anomaly      — detected inconsistency / outlier / decayed past trust threshold.
 */
export type MemoryClass =
  | 'durable'
  | 'contextual'
  | 'tentative'
  | 'corrected'
  | 'superseded'
  | 'anomaly';

/**
 * Provenance — who/what is the origin of this memory.
 *
 * CRITICAL: assistant_inferred must NEVER be treated as equivalent to user_stated.
 * Only user_stated and user_confirmed may drive durable class or policy writes.
 */
export type MemoryProvenance =
  | 'user_stated'       // user said this explicitly
  | 'user_confirmed'    // user confirmed something Atlas proposed
  | 'assistant_inferred'// Atlas extracted this from assistant output / behavior — untrusted by default
  | 'system_derived'    // derived from system signals (usage stats, explicit corrections)
  | 'corrected_by_user';// user explicitly corrected a previous memory

export type MemoryConfirmationStatus =
  | 'unconfirmed'
  | 'confirmed'
  | 'contradicted'
  | 'quarantined';

export type MemoryContradictionStatus =
  | 'none'
  | 'unresolved'
  | 'resolved_superseded'
  | 'resolved_demoted';

export type MemoryDecayPolicy =
  | 'fast'    // session/temp instructions — decay within days
  | 'standard'// contextual prefs — decay within weeks
  | 'slow'    // confirmed preferences — decay within months
  | 'none';   // explicit durable facts (name, job, explicit long-term goal)

export type MemoryScopeType =
  | 'global'    // applies everywhere
  | 'topic'     // applies to a specific subject area (e.g. "atlas-architecture")
  | 'chamber'   // applies within a specific Atlas chamber
  | 'project'   // applies to a named project/repo
  | 'session';  // applies only for current conversation session

export type MemorySupersessionMode =
  | 'narrowed'         // new memory is more specific / restricts the old one
  | 'expanded'         // new memory is broader / extends the old one
  | 'replaced'         // direct replacement, content fully updated
  | 'corrected'        // explicit user correction drove replacement
  | 'conflict_demoted';// neither wins; prior demoted due to new contradiction

// ── Arbitration Decision ────────────────────────────────────────────────────

/**
 * The decision the memoryArbitrator returns for every candidate.
 * Each decision maps to a concrete DB action with no ambiguity.
 */
export type ArbitrationVerdict =
  | 'insert_new'       // no conflict — insert as a new row
  | 'supersede'        // replaces an existing row with full replacement
  | 'narrow'           // inserts new row marked as narrowing of an existing one
  | 'expand'           // inserts new row as expansion of an existing one
  | 'reaffirm'         // existing row is already correct; bump stability, no new row
  | 'unresolved'       // contradicts existing but neither is strong enough to win
  | 'quarantine'       // contradicts trusted memory; candidate isolated
  | 'discard';         // candidate is too weak / too similar to add any value

export interface ArbitrationDecision {
  verdict: ArbitrationVerdict;
  targetMemoryId?: string;        // existing row being acted on (if any)
  supersessionMode?: MemorySupersessionMode;
  reason: string;                 // human-readable for audit trail
  similarityScore?: number;       // cosine score that triggered candidate lookup
  conflictStrength?: 'weak' | 'moderate' | 'strong';
}

// ── Governed Memory Candidate ───────────────────────────────────────────────

/**
 * What the distiller now emits per extracted memory.
 * Replaces the old unstructured {kind, content, importance} triple with a
 * full governance-ready candidate.
 */
export interface GovernedMemoryCandidate {
  // Core content
  kind: string;                   // MemoryKind (preference|fact|pattern|correction|goal)
  content: string;

  // Governance fields
  memoryClass: MemoryClass;
  provenance: MemoryProvenance;
  scopeType: MemoryScopeType;
  scopeKey?: string;              // required when scopeType != 'global'
  decayPolicy: MemoryDecayPolicy;

  // Evidence
  confidence: number;             // 0..1 extraction confidence
  importance: number;             // 0..1 intended importance (for recall ranking)
  sourceTurnIds: string[];        // which turns produced this
  extractionRationale?: string;   // LLM's reason for extraction

  // Eligibility pre-assessment
  policyEligibleCandidate: boolean; // distiller's initial yes/no — arbitrator confirms
}

// ── Zod Schemas ─────────────────────────────────────────────────────────────

export const memoryClassSchema = z.enum([
  'durable', 'contextual', 'tentative', 'corrected', 'superseded', 'anomaly',
]);

export const memoryProvenanceSchema = z.enum([
  'user_stated',
  'user_confirmed',
  'assistant_inferred',
  'system_derived',
  'corrected_by_user',
]);

export const memoryScopeTypeSchema = z.enum([
  'global', 'topic', 'chamber', 'project', 'session',
]);

export const memoryDecayPolicySchema = z.enum([
  'fast', 'standard', 'slow', 'none',
]);

export const governedMemoryCandidateSchema = z.object({
  kind: z.enum(['preference', 'fact', 'pattern', 'correction', 'goal']),
  content: z.string().min(4).max(600),
  memoryClass: memoryClassSchema,
  provenance: memoryProvenanceSchema,
  scopeType: memoryScopeTypeSchema,
  scopeKey: z.string().max(120).optional(),
  decayPolicy: memoryDecayPolicySchema,
  confidence: z.number().min(0).max(1),
  importance: z.number().min(0).max(1),
  sourceTurnIds: z.array(z.string()).max(10).default([]),
  extractionRationale: z.string().max(400).optional(),
  policyEligibleCandidate: z.boolean(),
});

// ── Classification Rules ─────────────────────────────────────────────────────

/**
 * Assign a MemoryClass based on provenance + kind + whether content hints at scope.
 *
 * Rules (in priority order):
 * 1. If provenance is corrected_by_user → 'corrected'
 * 2. If provenance is assistant_inferred AND not recurrently confirmed → 'tentative'
 * 3. If content contains session/project/this-context cues → 'contextual'
 * 4. If provenance is user_stated or user_confirmed AND importance >= 0.7 → 'durable'
 * 5. Otherwise → 'tentative'
 */
export function classifyMemory(
  provenance: MemoryProvenance,
  kind: string,
  content: string,
  importance: number,
  recurrenceCount = 0,
): MemoryClass {
  if (provenance === 'corrected_by_user') return 'corrected';

  // Assistant inference is tentative until confirmed or repeatedly evidenced.
  if (provenance === 'assistant_inferred') {
    return recurrenceCount >= 3 ? 'contextual' : 'tentative';
  }

  // Scope cues in content → contextual even if user-stated.
  const scopeCues = /\b(for this|in this|on this|currently|right now|this session|this project|this context|for now|temporary|just for)\b/i;
  if (scopeCues.test(content)) return 'contextual';

  // Strong user signal → durable.
  if (
    (provenance === 'user_stated' || provenance === 'user_confirmed') &&
    importance >= 0.65
  ) return 'durable';

  // Corrections from kind=correction always durable (the correction itself is the fact).
  if (kind === 'correction' && (provenance === 'user_stated' || provenance === 'user_confirmed')) {
    return 'durable';
  }

  return 'tentative';
}

/**
 * Assign a MemoryDecayPolicy based on class and scope.
 */
export function assignDecayPolicy(
  memoryClass: MemoryClass,
  scopeType: MemoryScopeType,
): MemoryDecayPolicy {
  if (scopeType === 'session') return 'fast';
  if (memoryClass === 'durable') return 'slow';
  if (memoryClass === 'corrected') return 'slow'; // corrections should persist
  if (memoryClass === 'contextual') return 'standard';
  if (memoryClass === 'anomaly') return 'fast';
  if (memoryClass === 'tentative') return 'standard';
  return 'standard';
}

/**
 * Infer scope type from content text when no explicit scope is provided.
 */
export function inferScopeType(content: string): { scopeType: MemoryScopeType; scopeKey?: string } {
  const sessionPhrases = /\b(for now|this session|right now|just for today|currently|temporarily)\b/i;
  const projectPhrases = /\b(for (?:this|the) (?:\w+ )?(?:project|repo|codebase|integration)|in (?:atlas|obsidian))\b/i;
  const topicPhrases = /\b(when (?:discussing|working on|doing)|for (?:architecture|design|code|audit|analysis|reviews))\b/i;

  if (sessionPhrases.test(content)) return { scopeType: 'session' };
  if (projectPhrases.test(content)) return { scopeType: 'project', scopeKey: extractScopeKey(content) };
  if (topicPhrases.test(content)) return { scopeType: 'topic', scopeKey: extractScopeKey(content) };

  return { scopeType: 'global' };
}

function extractScopeKey(content: string): string {
  // Best-effort: grab the first significant noun phrase after scope trigger.
  const m = content.match(/\b(?:for|on|in|about)\s+([\w\-]+(?:\s+[\w\-]+)?)/i);
  return m ? m[1].toLowerCase().trim().slice(0, 60) : '';
}

/**
 * Compute initial stability score based on class and provenance.
 * This is the baseline — arbitration and reaffirmation modify it over time.
 */
export function initialStabilityScore(
  memoryClass: MemoryClass,
  provenance: MemoryProvenance,
): number {
  if (provenance === 'user_stated') {
    return memoryClass === 'durable' ? 0.75 : 0.60;
  }
  if (provenance === 'user_confirmed') return 0.65;
  if (provenance === 'corrected_by_user') return 0.80;
  if (provenance === 'system_derived') return 0.55;
  // assistant_inferred
  return 0.35; // starts low; must earn stability
}

/**
 * Determine whether a candidate is policy-eligible at the time of insertion.
 * Policy eligibility = the memory is strong enough to affect behavior.
 *
 * Requirements (ALL must be true):
 * 1. Class must be 'durable' or 'corrected' — not tentative/contextual/anomaly
 * 2. Provenance must NOT be 'assistant_inferred'
 * 3. Initial stability >= 0.6
 * 4. Scope must be 'global' (scoped prefs require separate routing logic, not policy)
 * 5. Kind must not be anomaly-adjacent
 */
export function isInitiallyPolicyEligible(
  memoryClass: MemoryClass,
  provenance: MemoryProvenance,
  stability: number,
  scopeType: MemoryScopeType,
  confidence: number,
): boolean {
  if (memoryClass === 'tentative' || memoryClass === 'anomaly' || memoryClass === 'superseded') return false;
  if (provenance === 'assistant_inferred') return false;
  if (stability < 0.60) return false;
  if (scopeType !== 'global') return false;
  if (confidence < 0.65) return false;
  return true;
}

/**
 * Detect provenance from the role of the turn that produced the evidence.
 * User-role turns → user_stated. Assistant-role turns → assistant_inferred.
 * Mixed → system_derived (conservative).
 */
export function provenanceFromRoles(roles: readonly string[]): MemoryProvenance {
  const unique = new Set(roles);
  if (unique.size === 0) return 'assistant_inferred';
  if (unique.has('user') && !unique.has('assistant')) return 'user_stated';
  if (unique.has('assistant') && !unique.has('user')) return 'assistant_inferred';
  // Mixed user + assistant — evidence is indirect.
  return 'system_derived';
}
