/**
 * Stage 0 — Intent Router.
 *
 * Spec: `/home/user/workspace/atlas_response_shape_spec.md` § 3.
 *
 * Classifies an incoming user query into one of seven IntentClass values,
 * picks the recommended ModeId from the shape library, and returns a
 * RouterDecision the overseer pipeline consumes.
 *
 * The router never fails closed:
 *   - Cheap lexical classifier always runs (sync, ~1ms).
 *   - LLM refinement only runs when cheap confidence < 0.85; on timeout or
 *     parse error the cheap result is used.
 *   - Supabase reads (doctrine + unfinished_business) are wrapped in
 *     try/catch; on failure the channel is skipped.
 *   - Hard total budget: 800 ms via Promise.race.
 */

import { supabaseRest } from '../../db/supabase.js';
import type {
  ChatTurn,
  DoctrineDirective,
  IntentClass,
  ModeId,
  RouterDecision,
  SectionId,
} from './types.js';

// ---------------------------------------------------------------------------
// Mode mapping
// ---------------------------------------------------------------------------

const INTENT_TO_MODE: Record<IntentClass, ModeId> = {
  factual: 'factual-quick',
  decision: 'decision-support',
  claim: 'claim-audit',
  positioning: 'positioning-comparison',
  gap: 'gap-identifier',
  artifact: 'artifact-generator',
  mixed: 'decision-support',
};

const FALLBACK_MODE: ModeId = 'decision-support';
const HARD_BUDGET_MS = 800;
const LLM_TIMEOUT_MS = 600;
const LLM_REFINE_THRESHOLD = 0.85;
const FALLBACK_CONFIDENCE_THRESHOLD = 0.55;
const CONDENSED_MAX_CHARS = 90;

// TODO(spec § 3): real continuation check is cosine ≥ 0.78 over Gemini
// text-embedding-004 (768-d). This implementation uses a Jaccard word-set
// proxy in the hot path; upgrade to the embedding check once we can budget
// an extra Gemini call (or move it off the hot path).
const CONTINUATION_JACCARD_THRESHOLD = 0.45;

// ---------------------------------------------------------------------------
// Cheap lexical classifier
// ---------------------------------------------------------------------------

interface LexicalScore {
  intent: IntentClass;
  confidence: number;
  matched: string[];
}

interface PatternGroup {
  intent: IntentClass;
  patterns: RegExp[];
  /** When >0, short queries (≤ this length) boost confidence by 0.1. */
  shortQueryBonusMaxLen?: number;
}

const PATTERN_GROUPS: PatternGroup[] = [
  {
    intent: 'factual',
    patterns: [
      /^(what|when|where|who|which)\s+(is|are|was|were|did|does)\b/i,
      /\bdefine\b/i,
      /\bexplain\b/i,
    ],
    shortQueryBonusMaxLen: 80,
  },
  {
    intent: 'decision',
    patterns: [
      /\bshould i\b/i,
      /\bwhich\b[^?]*\b(better|best|right|choose)\b/i,
      /\bversus\b|\bvs\.?\b/i,
      /\bworth (it|doing)\b/i,
      /\bpros and cons\b/i,
    ],
  },
  {
    intent: 'claim',
    patterns: [
      /\bis it true\b/i,
      /\bfact[- ]?check\b/i,
      /\baudit\b/i,
      /\bverify\b/i,
      /\b(true|false|accurate|correct)\??$/i,
    ],
  },
  {
    intent: 'positioning',
    patterns: [
      /\b(different|differ|compare|vs|unique)\b[^.]*\b(you|atlas|chatbot|gpt|claude|ai)\b/i,
      /\bare you\b/i,
      /\bwhat makes you\b/i,
    ],
  },
  {
    intent: 'gap',
    patterns: [
      /\b(missing|gap|weakness|blind ?spot|don'?t see|haven'?t covered)\b/i,
      /\bwhat (am i|are we) missing\b/i,
    ],
  },
  {
    intent: 'artifact',
    patterns: [
      /\b(draft|write|generate|give me|create|build me|template|plan|checklist|list of)\b/i,
      /```/, // explicit code-fence requests / examples
      /\bin (table|markdown|json|yaml) form\b/i,
    ],
  },
];

function cheapClassify(query: string): LexicalScore {
  const len = query.length;
  let best: LexicalScore = {
    intent: 'mixed',
    confidence: 0.2,
    matched: [],
  };

  for (const group of PATTERN_GROUPS) {
    const hits: string[] = [];
    for (const re of group.patterns) {
      const m = query.match(re);
      if (m) hits.push(m[0]);
    }
    if (hits.length === 0) continue;
    // Each pattern hit contributes ~0.35, capped at 0.9.
    let conf = Math.min(0.9, 0.55 + 0.35 * (hits.length - 1));
    if (group.shortQueryBonusMaxLen && len <= group.shortQueryBonusMaxLen) {
      conf = Math.min(0.95, conf + 0.1);
    }
    if (conf > best.confidence) {
      best = { intent: group.intent, confidence: conf, matched: hits };
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// LLM refinement (Groq) — inline minimal call. Mirrors overseerService's
// `groqCall` shape but kept local so this service has no cross-service deps.
// ---------------------------------------------------------------------------

interface LlmRefinement {
  intent: IntentClass;
  mode: ModeId;
  condensed: boolean;
  confidence: number;
  reason: string;
}

const VALID_INTENTS: IntentClass[] = [
  'factual',
  'decision',
  'claim',
  'positioning',
  'gap',
  'artifact',
  'mixed',
];
const VALID_MODES: ModeId[] = [
  'factual-quick',
  'decision-support',
  'claim-audit',
  'positioning-comparison',
  'gap-identifier',
  'artifact-generator',
];

function parseLlmJson(text: string): LlmRefinement | null {
  const trimmed = text.trim();
  // Strip code fences if the model wrapped its JSON.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const raw = fenceMatch ? fenceMatch[1] : trimmed;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const intent = String(o.intent ?? '').toLowerCase() as IntentClass;
  const mode = String(o.mode ?? '').toLowerCase() as ModeId;
  if (!VALID_INTENTS.includes(intent)) return null;
  if (!VALID_MODES.includes(mode)) return null;
  const confidence = typeof o.confidence === 'number' ? Math.max(0, Math.min(1, o.confidence)) : 0.6;
  const reason = typeof o.reason === 'string' ? o.reason.slice(0, 200) : '';
  const condensed = typeof o.condensed === 'boolean' ? o.condensed : false;
  return { intent, mode, condensed, confidence, reason };
}

async function llmRefine(query: string, recentTurns: ChatTurn[]): Promise<LlmRefinement | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim() || process.env.ATLAS_CLOUD_OPENAI_API_KEY?.trim();
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
    'You are an intent classifier for the Atlas response system. Given a user query and ' +
    'up to 2 prior turns, return strict JSON with keys: ' +
    'intent (one of factual,decision,claim,positioning,gap,artifact,mixed), ' +
    'mode (one of factual-quick,decision-support,claim-audit,positioning-comparison,gap-identifier,artifact-generator), ' +
    'condensed (boolean), confidence (0..1), reason (≤30 words). ' +
    'Return ONLY the JSON object, no prose.';

  const prior = recentTurns
    .slice(-2)
    .map((t) => `${t.role}: ${t.content.slice(0, 400)}`)
    .join('\n');
  const userContent = `PRIOR TURNS:\n${prior || '(none)'}\n\nQUERY:\n${query}`;

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
          { role: 'user', content: userContent },
        ],
        temperature: 0.1,
        max_tokens: 200,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content;
    if (!text) return null;
    return parseLlmJson(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Doctrine + unfinished_business readers — wired through a __deps indirection
// so tests can swap them without mocking the Supabase module path.
// ---------------------------------------------------------------------------

interface UnfinishedRow {
  id: string;
  topic?: string | null;
  summary?: string | null;
  title?: string | null;
  description?: string | null;
}

interface Deps {
  readDoctrineDirectives: (userId: string) => Promise<DoctrineDirective[]>;
  readOpenUnfinishedBusiness: (userId: string) => Promise<UnfinishedRow[]>;
}

interface RawDoctrineRow {
  id?: unknown;
  directive_type?: unknown;
  payload?: unknown;
}

async function defaultReadDoctrineDirectives(userId: string): Promise<DoctrineDirective[]> {
  try {
    const path =
      `doctrine_nodes?select=id,directive_type,payload` +
      `&user_id=eq.${encodeURIComponent(userId)}` +
      `&scope=eq.response_shape` +
      `&limit=50`;
    const res = await supabaseRest<RawDoctrineRow[]>('GET', path);
    if (!res.ok || !res.data) return [];
    const out: DoctrineDirective[] = [];
    for (const row of res.data) {
      const id = typeof row.id === 'string' ? row.id : String(row.id ?? '');
      const dt = String(row.directive_type ?? '');
      if (
        dt !== 'always_include_section' &&
        dt !== 'never_include_section' &&
        dt !== 'force_mode' &&
        dt !== 'default'
      )
        continue;
      const payload =
        row.payload && typeof row.payload === 'object'
          ? (row.payload as Record<string, unknown>)
          : {};
      out.push({ id, directiveType: dt, payload });
    }
    return out;
  } catch (err) {
    console.warn('[intentRouter] doctrine read failed (non-fatal):', err);
    return [];
  }
}

async function defaultReadOpenUnfinishedBusiness(userId: string): Promise<UnfinishedRow[]> {
  try {
    const path =
      `unfinished_business?select=id,topic,summary,title,description` +
      `&user_id=eq.${encodeURIComponent(userId)}` +
      `&status=in.(open,snoozed)` +
      `&order=updated_at.desc` +
      `&limit=20`;
    const res = await supabaseRest<UnfinishedRow[]>('GET', path);
    if (!res.ok || !res.data) return [];
    return res.data;
  } catch (err) {
    console.warn('[intentRouter] unfinished_business read failed (non-fatal):', err);
    return [];
  }
}

const deps: Deps = {
  readDoctrineDirectives: defaultReadDoctrineDirectives,
  readOpenUnfinishedBusiness: defaultReadOpenUnfinishedBusiness,
};

/** Test-only hook: swap doctrine + unfinished-business readers. */
export function __setDeps(overrides: Partial<Deps>): void {
  if (overrides.readDoctrineDirectives) deps.readDoctrineDirectives = overrides.readDoctrineDirectives;
  if (overrides.readOpenUnfinishedBusiness)
    deps.readOpenUnfinishedBusiness = overrides.readOpenUnfinishedBusiness;
}

/** Test-only hook: restore default readers. */
export function __resetDeps(): void {
  deps.readDoctrineDirectives = defaultReadDoctrineDirectives;
  deps.readOpenUnfinishedBusiness = defaultReadOpenUnfinishedBusiness;
}

// ---------------------------------------------------------------------------
// Jaccard similarity over lowercase word sets — cheap continuation check.
// ---------------------------------------------------------------------------

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function rowText(row: UnfinishedRow): string {
  return [row.topic, row.summary, row.title, row.description]
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .join(' ');
}

async function findContinuedThread(
  userId: string,
  query: string,
): Promise<string | undefined> {
  const rows = await deps.readOpenUnfinishedBusiness(userId);
  if (rows.length === 0) return undefined;
  const queryTokens = tokenize(query);
  let bestId: string | undefined;
  let bestScore = 0;
  for (const row of rows) {
    const score = jaccard(queryTokens, tokenize(rowText(row)));
    if (score > bestScore) {
      bestScore = score;
      bestId = row.id;
    }
  }
  return bestScore >= CONTINUATION_JACCARD_THRESHOLD ? bestId : undefined;
}

// ---------------------------------------------------------------------------
// Doctrine application
// ---------------------------------------------------------------------------

function applyDoctrine(
  decision: RouterDecision,
  directives: DoctrineDirective[],
): RouterDecision {
  let mode = decision.mode;
  let primaryIntent = decision.primaryIntent;
  let confidence = decision.confidence;
  const overrides: SectionId[] = [...(decision.sectionOverrides ?? [])];

  for (const d of directives) {
    if (d.directiveType === 'force_mode') {
      const forced = String(d.payload?.mode ?? '') as ModeId;
      if (VALID_MODES.includes(forced)) {
        mode = forced;
        // Reverse-map mode → intent so primaryIntent stays consistent.
        const reverse: Partial<Record<ModeId, IntentClass>> = {
          'factual-quick': 'factual',
          'decision-support': 'decision',
          'claim-audit': 'claim',
          'positioning-comparison': 'positioning',
          'gap-identifier': 'gap',
          'artifact-generator': 'artifact',
        };
        primaryIntent = reverse[forced] ?? primaryIntent;
        confidence = Math.max(confidence, 0.9);
      }
    } else if (d.directiveType === 'always_include_section') {
      const sectionId = String(d.payload?.section_id ?? '');
      if (sectionId) overrides.push(sectionId);
    } else if (d.directiveType === 'never_include_section') {
      const sectionId = String(d.payload?.section_id ?? '');
      if (sectionId) overrides.push(`!${sectionId}`);
    }
  }

  return {
    ...decision,
    mode,
    primaryIntent,
    confidence,
    sectionOverrides: overrides.length ? overrides : decision.sectionOverrides,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function shouldCondense(args: {
  query: string;
  intent: IntentClass;
  continuedThread?: string;
  sectionOverrides?: SectionId[];
}): boolean {
  const { query, intent, continuedThread, sectionOverrides } = args;
  if (query.length > CONDENSED_MAX_CHARS) return false;
  if (/\?[^?]*\?/.test(query)) return false; // multiple question marks → multi-part
  if (intent !== 'factual' && intent !== 'decision' && intent !== 'claim') return false;
  if (continuedThread) return false;
  if (sectionOverrides && sectionOverrides.length > 0) return false;
  return true;
}

async function routeIntentInner(
  userId: string,
  query: string,
  recentTurns: ChatTurn[],
): Promise<RouterDecision> {
  // 1) Cheap classifier
  const cheap = cheapClassify(query);
  let intent: IntentClass = cheap.intent;
  let confidence = cheap.confidence;
  let mode: ModeId = INTENT_TO_MODE[intent];
  let reason = `lexical:${cheap.intent}(${cheap.matched.slice(0, 3).join('|') || 'none'})`;

  // 2) LLM refinement when cheap confidence below threshold
  if (confidence < LLM_REFINE_THRESHOLD) {
    const refined = await llmRefine(query, recentTurns);
    if (refined) {
      intent = refined.intent;
      mode = refined.mode;
      confidence = Math.max(confidence, refined.confidence);
      reason = `llm:${refined.reason || refined.intent}`;
    }
  }

  let decision: RouterDecision = {
    primaryIntent: intent,
    mode,
    condensed: false,
    confidence,
    reasonTrace: reason.slice(0, 200),
  };

  // 3) Doctrine override
  const directives = await deps.readDoctrineDirectives(userId);
  if (directives.length > 0) {
    decision = applyDoctrine(decision, directives);
  }

  // 4) Unfinished-business continuation
  const continuedThread = await findContinuedThread(userId, query);
  if (continuedThread) {
    decision = { ...decision, continuedThread };
  }

  // 5) Condensation
  decision = {
    ...decision,
    condensed: shouldCondense({
      query,
      intent: decision.primaryIntent,
      continuedThread: decision.continuedThread,
      sectionOverrides: decision.sectionOverrides,
    }),
  };

  // 6) Fallback when confidence is too low
  if (decision.confidence < FALLBACK_CONFIDENCE_THRESHOLD) {
    decision = {
      ...decision,
      mode: FALLBACK_MODE,
      primaryIntent: 'mixed',
      // Keep the reasonTrace intact per objective.
    };
  }

  return decision;
}

/** Hard-budget timeout fallback if the whole pipeline exceeds 800ms. */
function timeoutFallback(query: string): RouterDecision {
  const cheap = cheapClassify(query);
  return {
    primaryIntent: cheap.intent,
    mode: INTENT_TO_MODE[cheap.intent],
    condensed: false,
    confidence: cheap.confidence,
    reasonTrace: `timeout:${cheap.intent}`,
  };
}

export async function routeIntent(
  userId: string,
  query: string,
  recentTurns: ChatTurn[],
): Promise<RouterDecision> {
  const work = routeIntentInner(userId, query, recentTurns);
  const timeout = new Promise<RouterDecision>((resolve) => {
    setTimeout(() => resolve(timeoutFallback(query)), HARD_BUDGET_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } catch (err) {
    console.warn('[intentRouter] routeIntent unhandled error, falling back:', err);
    return timeoutFallback(query);
  }
}
