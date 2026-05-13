/**
 * Stage 5 — Gap Detector.
 *
 * Spec: `/home/user/workspace/atlas_response_shape_spec.md` § 5.
 *
 * Runs after the constitutional check. Appends AT MOST one actionable line
 * (`> Continues:` or `> Next:`) to the final response and writes a new row
 * into `unfinished_business` when the response itself surfaces a gap Atlas
 * couldn't close.
 *
 * Hard rules:
 *   - Never append a Self-Governance / Audit / Framing-bias style block.
 *   - At most ONE appended line.
 *   - Any Supabase or Groq failure → graceful degrade. Never throw.
 *   - Quick lookups stay quick: factual-quick skipped unless a low-confidence
 *     pattern fires (the `appendThreshold` knob in modeLibrary).
 */

import { randomUUID } from 'node:crypto';

import { supabaseRest } from '../../db/supabase.js';
import { MODE_LIBRARY } from './modeLibrary.js';
import type { ModeId, RouterDecision } from './types.js';

const PG_TABLE = 'unfinished_business';
const CONTINUATION_TOPIC_MAX = 120;
const QUERY_TOPIC_MAX = 100;
const NEXT_STEP_WORD_BUDGET_TOKENS = 80;
const LLM_TIMEOUT_MS = 600;
const GAP_DETECTOR_SOURCE_TAG = 'response_shape_gap_detector';
const NEW_GAP_KIND = 'recurring_insight';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GapDetectorInput {
  userId: string;
  query: string;
  decision: RouterDecision;
  /** Final response text after the constitutional check (Stage 4). */
  finalResponse: string;
}

export interface GapDetectorOutput {
  /** finalResponse plus at most one appended `>` line. */
  augmentedResponse: string;
  appendedLine?: string;
  unfinishedBusinessIdCreated?: string;
  unfinishedBusinessIdTouched?: string;
}

// ---------------------------------------------------------------------------
// Pattern banks — cheap lexical scanner per mode
// ---------------------------------------------------------------------------

const GAP_PATTERNS: Partial<Record<ModeId, RegExp>> = {
  'claim-audit':
    /\b(insufficient evidence|cannot verify|not enough data|inconclusive|unable to confirm)\b/i,
  'decision-support':
    /\b(depends on|hinges on|need to know|once you decide|after you clarify)\b/i,
  'positioning-comparison':
    /\b(don'?t (yet )?have|cannot (yet )?do|not (yet )?able|limitation|honest limit)\b/i,
};

const FACTUAL_LOW_CONFIDENCE =
  /\b(approximately|roughly|i'?m not sure|might be|unclear)\b/i;

// ---------------------------------------------------------------------------
// Dependency indirection — Supabase + Groq are swappable via __setDeps so
// tests don't have to mock module paths.
// ---------------------------------------------------------------------------

interface UnfinishedRowLookup {
  /** Source columns vary across migrations; we prefer the most descriptive
   *  available value: `topic` → `summary` → `title` → `description`. */
  topic?: string | null;
  summary?: string | null;
  title?: string | null;
  description?: string | null;
}

interface SupabaseInsertResult {
  ok: boolean;
  id?: string;
}

interface Deps {
  fetchUnfinishedRow: (id: string) => Promise<UnfinishedRowLookup | null>;
  touchUnfinishedRow: (id: string) => Promise<boolean>;
  insertUnfinishedRow: (row: Record<string, unknown>) => Promise<SupabaseInsertResult>;
  llmNextStep: (args: {
    query: string;
    finalResponse: string;
    matchedPattern: string;
  }) => Promise<string | null>;
}

async function defaultFetchUnfinishedRow(id: string): Promise<UnfinishedRowLookup | null> {
  try {
    const path =
      `${PG_TABLE}?select=topic,summary,title,description` +
      `&id=eq.${encodeURIComponent(id)}` +
      `&limit=1`;
    const res = await supabaseRest<UnfinishedRowLookup[]>('GET', path);
    if (!res.ok || !res.data || res.data.length === 0) return null;
    return res.data[0] ?? null;
  } catch (err) {
    console.warn('[gapDetector] unfinished_business fetch failed (non-fatal):', err);
    return null;
  }
}

async function defaultTouchUnfinishedRow(id: string): Promise<boolean> {
  try {
    // mig 024 uses `updated_at`; objective spec called it `last_touched_at`.
    // Set both — Supabase will ignore the missing column gracefully? Actually
    // an unknown column triggers a 400; send only `updated_at` to stay safe.
    const res = await supabaseRest(
      'PATCH',
      `${PG_TABLE}?id=eq.${encodeURIComponent(id)}`,
      { updated_at: new Date().toISOString() },
    );
    return res.ok;
  } catch (err) {
    console.warn('[gapDetector] unfinished_business touch failed (non-fatal):', err);
    return false;
  }
}

async function defaultInsertUnfinishedRow(
  row: Record<string, unknown>,
): Promise<SupabaseInsertResult> {
  try {
    const res = await supabaseRest<Array<{ id?: string }>>(
      'POST',
      PG_TABLE,
      row,
    );
    if (!res.ok) return { ok: false };
    const first = res.data?.[0];
    return { ok: true, id: typeof first?.id === 'string' ? first.id : undefined };
  } catch (err) {
    console.warn('[gapDetector] unfinished_business insert failed (non-fatal):', err);
    return { ok: false };
  }
}

async function defaultLlmNextStep(args: {
  query: string;
  finalResponse: string;
  matchedPattern: string;
}): Promise<string | null> {
  const apiKey =
    process.env.GROQ_API_KEY?.trim() ||
    process.env.ATLAS_CLOUD_OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const base = (
    process.env.GROQ_BASE_URL?.trim() ||
    process.env.ATLAS_CLOUD_OPENAI_BASE_URL?.trim() ||
    'https://api.groq.com/openai/v1'
  ).replace(/\/$/, '');
  const model =
    process.env.GROQ_DELEGATE_MODEL?.trim() ||
    process.env.ATLAS_CLOUD_CHAT_MODEL?.trim() ||
    'llama-3.3-70b-versatile';

  const system =
    "Given the user's query, the response, and the matched gap pattern, " +
    'output a single sentence (≤25 words) describing the smallest concrete next step the user could take. ' +
    'No preamble. Just the sentence.';
  const user =
    `QUERY:\n${args.query}\n\nRESPONSE:\n${args.finalResponse}\n\nMATCHED PATTERN: ${args.matchedPattern}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
        max_tokens: NEXT_STEP_WORD_BUDGET_TOKENS,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    // Collapse to one line, strip surrounding quotes/blockquote prefixes.
    return text
      .replace(/^[`'"\s>]+/, '')
      .replace(/[`'"\s]+$/, '')
      .split(/\r?\n/)[0]!
      .trim()
      .slice(0, 320);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const deps: Deps = {
  fetchUnfinishedRow: defaultFetchUnfinishedRow,
  touchUnfinishedRow: defaultTouchUnfinishedRow,
  insertUnfinishedRow: defaultInsertUnfinishedRow,
  llmNextStep: defaultLlmNextStep,
};

/** Test-only hook. */
export function __setDeps(overrides: Partial<Deps>): void {
  Object.assign(deps, overrides);
}

/** Test-only hook. */
export function __resetDeps(): void {
  deps.fetchUnfinishedRow = defaultFetchUnfinishedRow;
  deps.touchUnfinishedRow = defaultTouchUnfinishedRow;
  deps.insertUnfinishedRow = defaultInsertUnfinishedRow;
  deps.llmNextStep = defaultLlmNextStep;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickContinuationText(row: UnfinishedRowLookup): string {
  const raw =
    (typeof row.topic === 'string' && row.topic) ||
    (typeof row.summary === 'string' && row.summary) ||
    (typeof row.title === 'string' && row.title) ||
    (typeof row.description === 'string' && row.description) ||
    '';
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  return oneLine.slice(0, CONTINUATION_TOPIC_MAX);
}

function append(finalResponse: string, line: string): string {
  return `${finalResponse}\n\n${line}`;
}

/**
 * For factual-quick the modeLibrary sets allowGapAppend=false but provides
 * an appendThreshold knob — quick lookups still surface a `> Next:` only
 * when the response hedges (low-confidence words). Honor that knob here.
 */
function rule2Allowed(mode: ModeId): boolean {
  const hints = MODE_LIBRARY[mode]?.gapDetectorHints;
  if (!hints) return false;
  if (hints.allowGapAppend) return true;
  // Special factual-quick path: knob present → eligible for the low-conf check.
  if (mode === 'factual-quick' && hints.appendThreshold !== undefined) return true;
  return false;
}

function findGapMatch(
  mode: ModeId,
  finalResponse: string,
): { matched: string } | null {
  // gap-identifier: the response IS the gap.
  if (mode === 'gap-identifier') return { matched: 'gap-identifier:response_is_gap' };

  if (mode === 'factual-quick') {
    const hints = MODE_LIBRARY[mode]?.gapDetectorHints;
    if (hints?.appendThreshold === undefined) return null;
    const m = finalResponse.match(FACTUAL_LOW_CONFIDENCE);
    return m ? { matched: m[0] } : null;
  }

  const pattern = GAP_PATTERNS[mode];
  if (!pattern) return null;
  const m = finalResponse.match(pattern);
  return m ? { matched: m[0] } : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function detectAndAppend(input: GapDetectorInput): Promise<GapDetectorOutput> {
  const { userId, query, decision, finalResponse } = input;

  // Rule 1 — Continuation marker. Wins over Rule 2 unconditionally.
  if (decision.continuedThread) {
    let topic = '';
    try {
      const row = await deps.fetchUnfinishedRow(decision.continuedThread);
      if (row) topic = pickContinuationText(row);
    } catch (err) {
      console.warn('[gapDetector] continuation lookup failed (non-fatal):', err);
    }
    if (topic.length === 0) {
      // No usable text → skip the append (graceful), but still touch the row
      // best-effort so callers can observe the surfacing.
      let touched = false;
      try {
        touched = await deps.touchUnfinishedRow(decision.continuedThread);
      } catch {
        touched = false;
      }
      return {
        augmentedResponse: finalResponse,
        unfinishedBusinessIdTouched: touched ? decision.continuedThread : undefined,
      };
    }
    const line = `> Continues: ${topic}`;
    // Touch best-effort; failure must not affect the append.
    let touched = false;
    try {
      touched = await deps.touchUnfinishedRow(decision.continuedThread);
    } catch {
      touched = false;
    }
    return {
      augmentedResponse: append(finalResponse, line),
      appendedLine: line,
      unfinishedBusinessIdTouched: touched ? decision.continuedThread : undefined,
    };
  }

  // Rule 2 — New gap detection.
  if (rule2Allowed(decision.mode)) {
    const match = findGapMatch(decision.mode, finalResponse);
    if (match) {
      let nextStep: string | null = null;
      try {
        nextStep = await deps.llmNextStep({
          query,
          finalResponse,
          matchedPattern: match.matched,
        });
      } catch (err) {
        console.warn('[gapDetector] llmNextStep threw (non-fatal):', err);
        nextStep = null;
      }
      if (nextStep && nextStep.length > 0) {
        const line = `> Next: ${nextStep}`;
        const augmentedResponse = append(finalResponse, line);
        const row = {
          // mig 024 schema (`unfinished_business`): kind, title, description
          // are NOT NULL; we map `topic` → title and `summary` → description.
          user_id: userId,
          kind: NEW_GAP_KIND,
          title: query.slice(0, QUERY_TOPIC_MAX),
          description: nextStep,
          status: 'open',
          pattern_fingerprint: GAP_DETECTOR_SOURCE_TAG,
        };
        let insertedId: string | undefined;
        try {
          const result = await deps.insertUnfinishedRow(row);
          if (result.ok) insertedId = result.id ?? randomUUID();
        } catch (err) {
          console.warn('[gapDetector] insert threw (non-fatal):', err);
        }
        return {
          augmentedResponse,
          appendedLine: line,
          unfinishedBusinessIdCreated: insertedId,
        };
      }
    }
  }

  // Rule 3 — Default: no append.
  return { augmentedResponse: finalResponse };
}
