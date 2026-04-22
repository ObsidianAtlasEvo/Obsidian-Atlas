/**
 * contextSlicePlanner.ts — V1.0 Phase C
 *
 * Computes per-lane token budgets and slices the assembled curatedContextBlock
 * so that each execution lane (local, fast_cloud, consensus, deep_research)
 * receives only as many tokens as it can usefully absorb.
 *
 * Problem solved:
 *   Stage 4 assembles a full curatedContextBlock sized to gravity + sensitivityClass.
 *   Without slicing, the same block is forwarded to every lane — including fast_cloud
 *   calls that are cost-optimised for brevity. Over-stuffed context payloads:
 *     - inflate prompt token costs (consensus and deep_research already expensive)
 *     - trigger length-based truncation in smaller models
 *     - dilute relevance for high-gravity intents that use a focused specialist
 *
 * Design contract:
 *   - Pure transform: no I/O, no external service calls, no DB writes
 *   - Deterministic output: same input always produces same slice
 *   - Non-blocking: synchronous execution — adds <1 ms to hot path
 *   - Graceful degradation: returns original block if slicing fails or is disabled
 *
 * Token estimation:
 *   We use character-level approximation (1 token ≈ 4 chars) to avoid the cost
 *   of a full tokeniser. This is accurate enough for budget gating; the model
 *   itself handles actual truncation at the inference boundary.
 *
 * Usage (Stage 4.5 — between Stage 4 assembly and Stage 5/6 dispatch):
 *   const slicedContext = sliceContextForLane(curatedContextBlock, profile);
 *   // Pass slicedContext to all dispatch calls instead of curatedContextBlock.
 */

import type { RequestProfile, SynthesisClass } from '../../types/requestProfile.js';

// ── Token budget table (per synthesis class) ──────────────────────────────
//
// Budgets are expressed in approximate tokens (1 token ≈ 4 chars).
// They represent the MAXIMUM context allowed into each lane.
//
// Rationale per lane:
//   fast_local      — Ollama sovereign path. Full context welcome — local GPU,
//                     no per-token cost. Budget matches max gravity assembly.
//   fast_cloud      — Cost-optimised single-model path. Keep context lean to
//                     reduce token spend and stay under 4K effective prompt size.
//   consensus       — Dual-model path. Both models receive the block; moderate
//                     budget prevents doubling cost while preserving key context.
//   deep_research   — Tavily + Groq + Gemini pipeline. Tavily results dominate;
//                     curatedContextBlock supplements — cap it to avoid conflict.
//
const LANE_TOKEN_BUDGETS: Record<SynthesisClass, number> = {
  fast_local: 2_000,     // No cost, full context
  fast_cloud: 400,       // Lean — cost-optimised
  consensus: 800,        // Moderate — two model calls
  deep_research: 300,    // Minimal supplement — Tavily owns the context
};

// ── Gravity multipliers ───────────────────────────────────────────────────
//
// Higher gravity (deeper synthesis) earns a larger slice budget.
// Applied on top of base lane budget. Posture 1 = 0.5× (fast, tight), 5 = 1.5×.
//
const GRAVITY_MULTIPLIERS: Record<number, number> = {
  1: 0.5,
  2: 0.75,
  3: 1.0,
  4: 1.25,
  5: 1.5,
};

// ── Section headers used by contextCuratorService ────────────────────────
//
// When truncating, we attempt to preserve complete sections rather than
// hard-cutting mid-paragraph. Section order reflects importance priority.
//
const SECTION_PRIORITY_ORDER = [
  'CONSTITUTIONAL ALIGNMENT',
  'COGNITIVE TWIN',
  'DECISION LEDGER',
  'TRUTH & EVIDENCE',
  'IDENTITY & ACTION',
  'EVOLUTION TIMELINE',
  'LEGACY LAYER',
  'SIMULATION FORGE',
  'REALITY GRAPH',
  'UNFINISHED BUSINESS',
];

// ── Helpers ───────────────────────────────────────────────────────────────

/** Approximate token count (4 chars = 1 token). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Convert token budget to character limit. */
function tokensToChars(tokens: number): number {
  return tokens * 4;
}

/**
 * Extract section blocks from a curatedContextBlock.
 * Returns an ordered array of { header, body } pairs.
 */
function extractSections(block: string): Array<{ header: string; body: string }> {
  // Sections are separated by blank lines and begin with an all-caps header line
  // (as produced by contextCuratorService / formatCuratedContextWithEpistemic).
  const sectionRegex = /^([A-Z &]+):\s*\n([\s\S]*?)(?=\n[A-Z &]+:\s*\n|$)/gm;
  const sections: Array<{ header: string; body: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = sectionRegex.exec(block)) !== null) {
    sections.push({ header: match[1].trim(), body: match[2].trim() });
  }

  // Fallback: no structured sections found — treat entire block as one section
  if (sections.length === 0 && block.trim().length > 0) {
    sections.push({ header: '__raw__', body: block });
  }

  return sections;
}

/**
 * Reassemble sections in priority order up to charBudget.
 */
function assemblePrioritised(
  sections: Array<{ header: string; body: string }>,
  charBudget: number,
): string {
  // Sort by priority index (known headers first, unknown sections last)
  const sorted = [...sections].sort((a, b) => {
    const idxA = SECTION_PRIORITY_ORDER.indexOf(a.header);
    const idxB = SECTION_PRIORITY_ORDER.indexOf(b.header);
    const normA = idxA === -1 ? SECTION_PRIORITY_ORDER.length : idxA;
    const normB = idxB === -1 ? SECTION_PRIORITY_ORDER.length : idxB;
    return normA - normB;
  });

  const parts: string[] = [];
  let remaining = charBudget;

  for (const sec of sorted) {
    if (remaining <= 0) break;

    const raw = sec.header === '__raw__'
      ? sec.body
      : `${sec.header}:\n${sec.body}`;

    if (raw.length <= remaining) {
      parts.push(raw);
      remaining -= raw.length;
    } else if (remaining > 80) {
      // Partial include with truncation marker
      parts.push(raw.slice(0, remaining - 20) + '\n[…truncated]');
      remaining = 0;
    }
    // If remaining < 80, skip — not worth a micro-fragment
  }

  return parts.join('\n\n');
}

// ── Public API ────────────────────────────────────────────────────────────

export interface SliceResult {
  /** The sliced context block to forward to the execution lane. */
  slicedBlock: string;
  /** Approximate token count of the slice. */
  estimatedTokens: number;
  /** Token budget applied for this lane. */
  budgetTokens: number;
  /** Whether slicing was applied (false = original block returned unchanged). */
  sliced: boolean;
}

/**
 * sliceContextForLane
 *
 * Given the full curatedContextBlock and the resolved RequestProfile,
 * returns a lane-appropriate slice that fits within the token budget.
 *
 * @param curatedContextBlock  Full context from Stage 4 assembly.
 * @param profile              Frozen RequestProfile from Stage 2.
 * @returns                    SliceResult with sliced block and metadata.
 */
export function sliceContextForLane(
  curatedContextBlock: string,
  profile: RequestProfile,
): SliceResult {
  // Passthrough for empty context (low sensitivity / no memory)
  if (!curatedContextBlock || curatedContextBlock.trim().length === 0) {
    return {
      slicedBlock: curatedContextBlock,
      estimatedTokens: 0,
      budgetTokens: 0,
      sliced: false,
    };
  }

  const lane = profile.preferredSynthesisClass;
  const gravity = Math.max(1, Math.min(5, profile.gravity)) as 1 | 2 | 3 | 4 | 5;
  const multiplier = GRAVITY_MULTIPLIERS[gravity] ?? 1.0;
  const budgetTokens = Math.round(LANE_TOKEN_BUDGETS[lane] * multiplier);
  const budgetChars = tokensToChars(budgetTokens);
  const existingTokens = estimateTokens(curatedContextBlock);

  // No slicing needed if already within budget
  if (existingTokens <= budgetTokens) {
    return {
      slicedBlock: curatedContextBlock,
      estimatedTokens: existingTokens,
      budgetTokens,
      sliced: false,
    };
  }

  // Slice: extract sections, prioritise, reassemble within budget
  try {
    const sections = extractSections(curatedContextBlock);
    const slicedBlock = assemblePrioritised(sections, budgetChars);
    return {
      slicedBlock,
      estimatedTokens: estimateTokens(slicedBlock),
      budgetTokens,
      sliced: true,
    };
  } catch {
    // Slicing failed — safe fallback to character truncation
    const fallback = curatedContextBlock.slice(0, budgetChars);
    return {
      slicedBlock: fallback,
      estimatedTokens: estimateTokens(fallback),
      budgetTokens,
      sliced: true,
    };
  }
}

/**
 * describeSlice
 *
 * Returns a human-readable one-liner for SSE trace events.
 */
export function describeSlice(result: SliceResult): string {
  if (!result.sliced) {
    return `context_slice:passthrough tokens≈${result.estimatedTokens}`;
  }
  return `context_slice:trimmed budget=${result.budgetTokens} actual≈${result.estimatedTokens}`;
}
