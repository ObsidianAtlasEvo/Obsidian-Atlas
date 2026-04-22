/**
 * membranePivotDetector.ts — V1.0 Phase E
 *
 * Detects semantic intent pivots between the cached membrane's origin intent
 * and the current request's intent, triggering membrane invalidation when
 * the user's conversational direction has shifted significantly.
 *
 * Problem solved:
 *   The membrane cache key includes intentHash (derived from mode + posture).
 *   However, two requests can share the same mode+posture combination while
 *   being about completely different topics (e.g., both 'direct_qa' at posture 3,
 *   but one asks about a project and the next asks about a relationship conflict).
 *
 *   Without pivot detection, the stale membrane from the first request is served
 *   to the second request — injecting wrong context and degrading response quality.
 *   The membrane correctly caches the ASSEMBLED CONTEXT, not the raw query — so
 *   a topical pivot means the cache is semantically stale even though the key matches.
 *
 * Detection approach (zero-cost — no model calls):
 *   1. Character-level n-gram Jaccard similarity between current prompt and the
 *      cached membrane's originPromptSnippet (stored at write time).
 *   2. Intent mode comparison — same mode but gravity dropped >1 level signals pivot.
 *   3. Chamber keyword overlap — presence of chamber-specific vocabulary.
 *
 *   If Jaccard similarity < PIVOT_THRESHOLD and at least one other signal fires,
 *   the membrane is declared stale and should be invalidated.
 *
 * Design contract:
 *   - Pure function: no I/O, no external calls, no DB
 *   - Synchronous, <0.5ms
 *   - Conservative threshold (0.15) — only triggers on clear topical breaks,
 *     not minor phrasing variation
 *   - Can be disabled via env flag DISABLE_MEMBRANE_PIVOT_DETECTION=true
 *
 * Integration point:
 *   Called from checkMembraneValidity() in sessionMembraneService.ts as trigger #8.
 *   The membrane record must carry originPromptSnippet (added to MembraneRecord
 *   in this phase) for the Jaccard check to work. Falls back to mode comparison
 *   only if originPromptSnippet is absent (backwards-compatible).
 */

import { env } from '../../config/env.js';

// ── Constants ─────────────────────────────────────────────────────────────

/**
 * Jaccard similarity below this threshold triggers pivot detection.
 * 0.15 = very little lexical overlap → different topic.
 * Deliberately conservative to avoid false positives.
 */
const PIVOT_THRESHOLD = 0.15;

/**
 * Minimum prompt length (chars) to apply Jaccard check.
 * Very short prompts (greetings, single-word queries) are too sparse for reliable similarity.
 */
const MIN_PROMPT_LENGTH = 20;

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Build a set of character n-grams from a string.
 * N=3 (trigrams) balances precision and noise tolerance.
 */
function charNgrams(text: string, n = 3): Set<string> {
  const normalised = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const grams = new Set<string>();
  for (let i = 0; i <= normalised.length - n; i++) {
    grams.add(normalised.slice(i, i + n));
  }
  return grams;
}

/**
 * Jaccard similarity between two n-gram sets.
 * Returns 0.0 (completely different) to 1.0 (identical).
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1.0;
  if (a.size === 0 || b.size === 0) return 0.0;

  let intersection = 0;
  for (const g of a) {
    if (b.has(g)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ── Chamber keyword vocabulary ────────────────────────────────────────────

const CHAMBER_KEYWORDS: Record<string, string[]> = {
  truth_chamber: ['truth', 'evidence', 'fact', 'claim', 'verify', 'false', 'accurate'],
  decision_forge: ['decide', 'decision', 'choose', 'option', 'trade-off', 'priority', 'weigh'],
  legacy: ['legacy', 'past', 'history', 'meaning', 'impact', 'contribution', 'left behind'],
  simulation: ['simulate', 'scenario', 'what if', 'model', 'predict', 'forecast', 'future'],
  evolution: ['grow', 'evolve', 'change', 'improve', 'develop', 'progress', 'transform'],
  identity_bridge: ['identity', 'who am i', 'values', 'belief', 'authentic', 'real', 'self'],
  resonance: ['resonate', 'align', 'feel', 'energy', 'connection', 'sense', 'harmony'],
  sovereign_console: ['sovereign', 'atlas', 'system', 'config', 'override', 'admin', 'control'],
};

function hasChamberKeyword(text: string, chamber: string): boolean {
  const keywords = CHAMBER_KEYWORDS[chamber] ?? [];
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

// ── Public API ────────────────────────────────────────────────────────────

export interface PivotDetectionInput {
  /** Current user prompt (full text). */
  currentPrompt: string;
  /** Snippet of the prompt stored in the membrane at write time. */
  cachedOriginPromptSnippet?: string | null;
  /** Current routing mode (SovereignResponseMode string). */
  currentMode?: string | null;
  /** Mode stored in the membrane record. */
  cachedMode?: string | null;
  /** Current gravity (posture 1–5). */
  currentGravity: number;
  /** Gravity stored in the membrane record. */
  cachedGravity?: number | null;
  /** Current chamber. */
  currentChamber: string;
}

export interface PivotDetectionResult {
  /** True if a semantic pivot was detected. */
  isPivot: boolean;
  /** Human-readable reason for debugging. */
  reason: string;
  /** Jaccard similarity score (0–1), or null if not computed. */
  jaccardScore: number | null;
}

/**
 * detectMembranePivot
 *
 * Returns whether the current request represents a semantic pivot from the
 * membrane's origin request. If true, the membrane should be invalidated.
 *
 * Never throws. Returns { isPivot: false } on any error.
 */
export function detectMembranePivot(
  input: PivotDetectionInput,
): PivotDetectionResult {
  // Respect disable flag
  if (process.env.DISABLE_MEMBRANE_PIVOT_DETECTION === 'true') {
    return { isPivot: false, reason: 'pivot_detection_disabled', jaccardScore: null };
  }

  // Short-circuit: if we have no cached data to compare against, no pivot possible
  if (!input.cachedOriginPromptSnippet && !input.cachedMode) {
    return { isPivot: false, reason: 'no_cached_origin', jaccardScore: null };
  }

  try {
    let lexicalPivot = false;
    let jaccardScore: number | null = null;

    // 1. Jaccard similarity check
    if (
      input.cachedOriginPromptSnippet &&
      input.currentPrompt.length >= MIN_PROMPT_LENGTH &&
      input.cachedOriginPromptSnippet.length >= MIN_PROMPT_LENGTH
    ) {
      const currentGrams = charNgrams(input.currentPrompt.slice(0, 500));
      const cachedGrams = charNgrams(input.cachedOriginPromptSnippet.slice(0, 500));
      jaccardScore = jaccardSimilarity(currentGrams, cachedGrams);
      lexicalPivot = jaccardScore < PIVOT_THRESHOLD;
    }

    // 2. Mode change check (different sovereign response mode = pivot)
    const modePivot = !!(
      input.cachedMode &&
      input.cachedMode !== input.currentMode &&
      // Exclude mode changes that the membrane key already captures
      !['direct_qa', 'truth_pressure', 'decision_support'].includes(input.currentMode ?? '')
    );

    // 3. Gravity drop check (gravity dropped by >1 suggests a topic reset)
    const gravityDropPivot = !!(
      input.cachedGravity !== null &&
      input.cachedGravity !== undefined &&
      input.currentGravity < input.cachedGravity - 1
    );

    // 4. Chamber keyword mismatch (current prompt signals different chamber vocabulary)
    const chamberKeywordMismatch =
      input.cachedMode !== null &&
      !hasChamberKeyword(input.currentPrompt, input.currentChamber) &&
      Object.entries(CHAMBER_KEYWORDS).some(
        ([ch, kws]) =>
          ch !== input.currentChamber &&
          kws.some((k) => input.currentPrompt.toLowerCase().includes(k)),
      );

    // Pivot requires lexical divergence PLUS at least one structural signal
    // (or if no prompt snippet available, structural signals alone)
    const structuralSignals = [modePivot, gravityDropPivot, chamberKeywordMismatch].filter(Boolean);

    const isPivot = lexicalPivot
      ? structuralSignals.length >= 1
      : !input.cachedOriginPromptSnippet && structuralSignals.length >= 2;

    if (!isPivot) {
      return { isPivot: false, reason: 'no_pivot', jaccardScore };
    }

    const reasons: string[] = [];
    if (lexicalPivot) reasons.push(`jaccard:${jaccardScore?.toFixed(3)}<${PIVOT_THRESHOLD}`);
    if (modePivot) reasons.push(`mode_change:${input.cachedMode}->${input.currentMode}`);
    if (gravityDropPivot) reasons.push(`gravity_drop:${input.cachedGravity}->${input.currentGravity}`);
    if (chamberKeywordMismatch) reasons.push('chamber_keyword_mismatch');

    return {
      isPivot: true,
      reason: `intent_pivot:${reasons.join(',')}`,
      jaccardScore,
    };
  } catch {
    // Never block on pivot detection failure
    return { isPivot: false, reason: 'pivot_detection_error', jaccardScore: null };
  }
}
