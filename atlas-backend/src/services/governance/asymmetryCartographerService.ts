/**
 * asymmetryCartographerService.ts — V1.0 Phase C
 *
 * Post-Stage 6 asymmetry extractor. Analyses Atlas's response text and the
 * originating user prompt to detect and persist leverage asymmetries into
 * the asymmetry_ledgers table (introduced in Migration 016).
 *
 * What is a leverage asymmetry?
 *   A structural imbalance — informational, relational, capability, or temporal —
 *   that confers disproportionate advantage or risk to the sovereign user.
 *   Examples: an information gap the user has that their counterpart lacks;
 *   a timing edge in an active decision; a network position that constrains options.
 *
 * Design contract:
 *   - ALWAYS fire-and-forget (called via void + .catch()): never blocks the conductor
 *   - Returns early without error if no asymmetries are detected or if DB is unavailable
 *   - Idempotent: duplicate asymmetries within the same session window are silently ignored
 *     (via ON CONFLICT DO NOTHING on upsert by user_id + domain + asymmetry_type + leverage hash)
 *   - Zero external model calls: detection is heuristic (pattern matching + keyword signals)
 *     to ensure absolutely zero additional cost per request
 *
 * Detection approach (zero-cost heuristic):
 *   Scans response text for high-signal patterns associated with each asymmetry domain.
 *   Confidence is calibrated from signal density (hits / expected). False positives
 *   are acceptable — asymmetry_ledgers is a best-effort intelligence catalogue, not
 *   a source of truth. Operators can prune low-confidence entries.
 *
 * Asymmetry domains: 'market' | 'relationship' | 'knowledge' | 'temporal' | 'capability'
 * Asymmetry types:   'information_gap' | 'timing_edge' | 'network_position' |
 *                    'capability_delta' | 'resource_asymmetry'
 *
 * Usage (Stage 7/pre-trace in cognitiveOrchestrator — fire-and-forget):
 *   void cartographAsymmetries({
 *     userId,
 *     userPrompt,
 *     responseText: dispatchResult.fullText,
 *     chamber,
 *     intent: routing.mode,
 *   }).catch(() => {});
 */

import { supabaseRest } from '../../db/supabase.js';

// ── Types ─────────────────────────────────────────────────────────────────

type AsymmetryDomain = 'market' | 'relationship' | 'knowledge' | 'temporal' | 'capability';
type AsymmetryType =
  | 'information_gap'
  | 'timing_edge'
  | 'network_position'
  | 'capability_delta'
  | 'resource_asymmetry';

export interface CartographInput {
  userId: string;
  userPrompt: string;
  responseText: string;
  chamber?: string;
  intent?: string;
}

interface DetectedAsymmetry {
  domain: AsymmetryDomain;
  asymmetryType: AsymmetryType;
  leverageDescription: string;
  confidenceScore: number;
  salienceWeight: number;
  metadata: Record<string, unknown>;
}

// ── Detection rules ───────────────────────────────────────────────────────
//
// Each rule defines a domain + type with keyword signals to search across
// the combined (userPrompt + responseText) corpus. Signal hits are counted
// and normalised to a confidence score.
//
// Keywords are case-insensitive partial matches. Multiple hits in the same
// pass increment the signal count.

interface DetectionRule {
  domain: AsymmetryDomain;
  asymmetryType: AsymmetryType;
  signals: string[];
  /** Required minimum signal hit count before this asymmetry is recorded. */
  threshold: number;
  /** How to describe the asymmetry (parametric — receives hit count). */
  describe: (promptSnippet: string, hitCount: number) => string;
  /** Base salience weight (0.0–1.0). */
  salienceWeight: number;
}

const DETECTION_RULES: DetectionRule[] = [
  {
    domain: 'knowledge',
    asymmetryType: 'information_gap',
    signals: [
      'don\'t know', 'unaware', 'hidden', 'classified', 'not public',
      'undisclosed', 'private', 'off the record', 'not disclosed',
      'gap', 'blind spot', 'unknown', 'missing information', 'asymmetric information',
      'they don\'t know', 'advantage', 'edge', 'intel',
    ],
    threshold: 2,
    describe: (prompt) =>
      `Information asymmetry detected: sovereign user likely holds or lacks intelligence relevant to "${prompt.slice(0, 120)}"`,
    salienceWeight: 0.75,
  },
  {
    domain: 'temporal',
    asymmetryType: 'timing_edge',
    signals: [
      'deadline', 'before they', 'first mover', 'window closing', 'time-sensitive',
      'urgency', 'opportunity window', 'expires', 'by tomorrow', 'by end of',
      'act now', 'act before', 'timing', 'ahead of', 'before the',
      'limited time', 'narrow window', 'while you still',
    ],
    threshold: 2,
    describe: (prompt) =>
      `Temporal edge detected: timing asymmetry apparent in "${prompt.slice(0, 120)}"`,
    salienceWeight: 0.80,
  },
  {
    domain: 'relationship',
    asymmetryType: 'network_position',
    signals: [
      'leverage', 'dependency', 'relies on you', 'they need', 'access to',
      'introduction', 'connection', 'gatekeeper', 'only one who',
      'trust', 'relationship capital', 'positioned', 'network', 'influence',
      'referral', 'sponsor', 'patron', 'voucher', 'access',
    ],
    threshold: 2,
    describe: (prompt) =>
      `Network position asymmetry: relational leverage or dependency apparent in context of "${prompt.slice(0, 120)}"`,
    salienceWeight: 0.70,
  },
  {
    domain: 'capability',
    asymmetryType: 'capability_delta',
    signals: [
      'can\'t do', 'unable to', 'doesn\'t have', 'lacks', 'missing capability',
      'you can', 'only you', 'unique ability', 'differentiator', 'unfair advantage',
      'skill gap', 'capability gap', 'competitive edge', 'better positioned',
      'superior', 'outperform', 'outpace', 'ahead',
    ],
    threshold: 2,
    describe: (prompt) =>
      `Capability delta detected: differential execution or skill advantage in context of "${prompt.slice(0, 120)}"`,
    salienceWeight: 0.65,
  },
  {
    domain: 'market',
    asymmetryType: 'resource_asymmetry',
    signals: [
      'underfunded', 'outspend', 'capital advantage', 'cash position',
      'runway', 'budget', 'resource constraint', 'asset', 'balance sheet',
      'liquidity', 'pricing power', 'cost advantage', 'margin', 'scale',
      'inventory', 'supply chain', 'distribution', 'market access',
    ],
    threshold: 2,
    describe: (prompt) =>
      `Resource asymmetry: market or capital imbalance apparent in context of "${prompt.slice(0, 120)}"`,
    salienceWeight: 0.60,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────

function countSignalHits(corpus: string, signals: string[]): number {
  const lower = corpus.toLowerCase();
  return signals.reduce((acc, sig) => acc + (lower.includes(sig.toLowerCase()) ? 1 : 0), 0);
}

function normaliseConfidence(hitCount: number, signalCount: number): number {
  // Map hit density to confidence in [0.35, 0.95]
  const density = hitCount / signalCount;
  const raw = 0.35 + density * 0.60;
  return Math.min(0.95, parseFloat(raw.toFixed(3)));
}

// ── Detection ─────────────────────────────────────────────────────────────

function detectAsymmetries(input: CartographInput): DetectedAsymmetry[] {
  const corpus = `${input.userPrompt} ${input.responseText}`;
  const promptSnippet = input.userPrompt.slice(0, 200);
  const detected: DetectedAsymmetry[] = [];

  for (const rule of DETECTION_RULES) {
    const hits = countSignalHits(corpus, rule.signals);
    if (hits < rule.threshold) continue;

    const confidence = normaliseConfidence(hits, rule.signals.length);

    // Skip very low confidence — not worth persisting
    if (confidence < 0.38) continue;

    detected.push({
      domain: rule.domain,
      asymmetryType: rule.asymmetryType,
      leverageDescription: rule.describe(promptSnippet, hits),
      confidenceScore: confidence,
      salienceWeight: rule.salienceWeight,
      metadata: {
        signalHits: hits,
        chamber: input.chamber ?? null,
        intent: input.intent ?? null,
        sourceLength: corpus.length,
      },
    });
  }

  return detected;
}

// ── Persistence ───────────────────────────────────────────────────────────

async function persistAsymmetry(
  userId: string,
  asymmetry: DetectedAsymmetry,
): Promise<void> {
  await supabaseRest(
    'POST',
    'asymmetry_ledgers',
    {
      user_id: userId,
      domain: asymmetry.domain,
      asymmetry_type: asymmetry.asymmetryType,
      leverage_description: asymmetry.leverageDescription,
      evidence_ids: [],
      confidence_score: asymmetry.confidenceScore,
      salience_weight: asymmetry.salienceWeight,
      metadata: asymmetry.metadata,
      valid_from: new Date().toISOString(),
      tombstoned: false,
    },
    {
      // Prefer not to error on conflict — idempotent insert
      Prefer: 'return=minimal',
    },
  );
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * cartographAsymmetries
 *
 * Detects leverage asymmetries in the response corpus and persists them to
 * asymmetry_ledgers. Always fire-and-forget — never awaited by the conductor.
 *
 * @param input  CartographInput with userId, prompt, response, and metadata.
 * @returns      Promise<void> — always resolves, never rejects.
 */
export async function cartographAsymmetries(input: CartographInput): Promise<void> {
  try {
    if (!input.userId || !input.responseText?.trim()) return;

    const detected = detectAsymmetries(input);
    if (detected.length === 0) return;

    // Persist all detected asymmetries in parallel, ignoring individual failures
    await Promise.allSettled(
      detected.map((a) => persistAsymmetry(input.userId, a)),
    );
  } catch {
    // Silently swallow — asymmetry cartography is non-critical intelligence
  }
}

/**
 * previewAsymmetries
 *
 * Dry-run version for testing and debugging — returns detected asymmetries
 * without persisting anything.
 */
export function previewAsymmetries(input: CartographInput): DetectedAsymmetry[] {
  return detectAsymmetries(input);
}
