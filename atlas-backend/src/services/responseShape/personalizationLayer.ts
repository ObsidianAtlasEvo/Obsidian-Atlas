/**
 * Stage 3 — Personalization Layer.
 *
 * Spec: `/home/user/workspace/atlas_response_shape_spec.md` § 4.
 *
 * Replaces the legacy SQLite-backed user-lens step. Reads four Supabase
 * channels in parallel, builds a PersonalizationContext, and translates
 * the synthesized answer through a Groq call that preserves the mode's
 * required section structure (Wave 1B's `buildModeSystemPrompt`).
 *
 * Hard total budget for context load: 400 ms via `Promise.race`.
 * Every channel read is wrapped in its own try/catch — one failing reader
 * never aborts the others. On any failure the channel's default is used
 * and the function returns normally; this stage can never fail closed.
 */

import { supabaseRest } from '../../db/supabase.js';
import { MODE_LIBRARY, buildModeSystemPrompt, resolveSections } from './modeLibrary.js';
import type {
  DoctrineDirective,
  PersonalizationContext,
  RouterDecision,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONTEXT_LOAD_BUDGET_MS = 400;
const GROQ_TIMEOUT_MS = 28_000;
const GROQ_MAX_TOKENS = 3_500;
const EXEMPLAR_MAX_CHARS = 200;
const EXEMPLAR_LIMIT = 3;
const CONFIDENCE_OVER_THRESHOLD = 0.3;
const CONFIDENCE_UNDER_THRESHOLD = -0.3;
const MIN_GOVERNANCE_EVENTS = 3;

// Verbosity / tone / structure / vocab maps — vendored from
// overseerService.ts user-lens step so this layer is self-contained.
// (Wave 3 will retire the overseer's translator; we own the maps now.)
const VERBOSITY_MAP: Record<PersonalizationContext['verbosity'], string> = {
  low: 'concise — prioritize brevity, use bullet points if helpful, skip preamble',
  medium: 'balanced — thorough but not exhaustive, structured sections when appropriate',
  high:
    'comprehensive — full depth, detailed examples, complete reasoning chains, long-form prose welcome',
};
const TONE_MAP: Record<PersonalizationContext['tone'], string> = {
  direct: 'direct and terse — no softening, no throat-clearing',
  professional: 'professional and measured — clear, precise, authoritative',
  warm: 'warm and approachable — conversational but still substantive',
  analytical: 'analytical and rigorous — reasoning made explicit, trade-offs surfaced',
};
const STRUCTURE_MAP: Record<PersonalizationContext['structurePreference'], string> = {
  minimal: 'minimal structure — flowing prose over headers and bullets',
  balanced: 'balanced structure — headers and bullets used where they genuinely aid clarity',
  structured:
    'high structure — consistent headers, numbered steps, tables, explicit section breaks',
};
const VOCAB_MAP: Record<PersonalizationContext['vocabLevel'], string> = {
  accessible: 'accessible (avoid jargon, explain terms)',
  intermediate: 'intermediate (some jargon acceptable with brief context)',
  expert: 'expert-level (assume domain familiarity, use precise terminology)',
};

const DEFAULT_CONTEXT: PersonalizationContext = {
  verbosity: 'medium',
  tone: 'analytical',
  structurePreference: 'balanced',
  vocabLevel: 'intermediate',
  memoryExemplars: [],
  doctrineDirectives: [],
  confidenceCalibration: 0,
};

// ---------------------------------------------------------------------------
// Public input/output types
// ---------------------------------------------------------------------------

export interface TranslateInput {
  userId: string;
  query: string;
  decision: RouterDecision;
  /** Output of Stage 1 (synthesis) + Stage 2 (completeness). */
  synthesizedAnswer: string;
}

export type PersonalizationChannel =
  | 'memory_exemplars'
  | 'tone_register'
  | 'doctrine_sections'
  | 'confidence_calibration';

export interface TranslateResult {
  translated: string;
  /** Names of channels that fired this call. Empty array on graceful degrade. */
  personalizationApplied: PersonalizationChannel[];
  context: PersonalizationContext;
}

// ---------------------------------------------------------------------------
// Channel readers — wired through __setDeps so tests don't mock supabaseRest.
// ---------------------------------------------------------------------------

interface MemoryRow {
  content?: string | null;
  importance?: number | null;
  created_at?: string | null;
}

interface IdentitySignalRow {
  domain?: string | null;
  signal_content?: string | null;
}

interface GovernanceEventRow {
  event_type?: string | null;
  payload?: Record<string, unknown> | null;
}

interface AdaptationEventRow {
  adaptation_type?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface DoctrineRow {
  id?: unknown;
  directive_type?: unknown;
  payload?: unknown;
}

interface Deps {
  readMemoryExemplars: (userId: string) => Promise<MemoryRow[]>;
  readIdentitySignals: (userId: string) => Promise<IdentitySignalRow[]>;
  readDoctrineDirectives: (userId: string) => Promise<DoctrineDirective[]>;
  readGovernanceEvents: (userId: string) => Promise<GovernanceEventRow[]>;
  readAdaptationEvents: (userId: string) => Promise<AdaptationEventRow[]>;
  callGroq: (system: string, user: string) => Promise<string | null>;
}

async function defaultReadMemoryExemplars(userId: string): Promise<MemoryRow[]> {
  // mig 004 columns: content, importance (NOT salience — see schema), created_at.
  // Filter out superseded rows the same way the rest of the codebase does.
  const path =
    `user_memories?select=content,importance,created_at` +
    `&user_id=eq.${encodeURIComponent(userId)}` +
    `&superseded_by=is.null` +
    `&order=importance.desc,created_at.desc` +
    `&limit=${EXEMPLAR_LIMIT}`;
  const res = await supabaseRest<MemoryRow[]>('GET', path);
  if (!res.ok || !res.data) return [];
  return res.data;
}

async function defaultReadIdentitySignals(userId: string): Promise<IdentitySignalRow[]> {
  // mig 007: only `signal_content` (text) and `domain` exist; no signal_key/signal_value.
  // We filter to active=true + the two communication-relevant domains and parse
  // signal_content for structured cues.
  const path =
    `identity_signals?select=domain,signal_content` +
    `&user_id=eq.${encodeURIComponent(userId)}` +
    `&active=eq.true` +
    `&domain=in.(communication_profile,chamber_profile)` +
    `&limit=20`;
  const res = await supabaseRest<IdentitySignalRow[]>('GET', path);
  if (!res.ok || !res.data) return [];
  return res.data;
}

async function defaultReadDoctrineDirectives(userId: string): Promise<DoctrineDirective[]> {
  // doctrine_nodes lands with Stage B1 (mig 023). Until then the read returns
  // {ok:false} → empty array (graceful degrade).
  const path =
    `doctrine_nodes?select=id,directive_type,payload` +
    `&user_id=eq.${encodeURIComponent(userId)}` +
    `&scope=eq.response_shape` +
    `&status=eq.active` +
    `&limit=50`;
  const res = await supabaseRest<DoctrineRow[]>('GET', path);
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
}

async function defaultReadGovernanceEvents(userId: string): Promise<GovernanceEventRow[]> {
  // mig 006 event_type enum: inserted | reaffirmed | contradicted | quarantined |
  // policy_applied | decayed | superseded | corrected | unresolved_conflict.
  // We use `corrected` + `contradicted` as proxies for "user-driven correction"
  // signals and parse payload.direction if present (over_confident | under_confident).
  const path =
    `memory_governance_events?select=event_type,payload` +
    `&user_id=eq.${encodeURIComponent(userId)}` +
    `&event_type=in.(corrected,contradicted)` +
    `&order=created_at.desc` +
    `&limit=50`;
  const res = await supabaseRest<GovernanceEventRow[]>('GET', path);
  if (!res.ok || !res.data) return [];
  return res.data;
}

async function defaultReadAdaptationEvents(userId: string): Promise<AdaptationEventRow[]> {
  // behavior_adaptation_events lands with Stage B3 (mig 025). Until then this
  // read returns {ok:false} → empty array (graceful degrade).
  const path =
    `behavior_adaptation_events?select=adaptation_type,metadata` +
    `&user_id=eq.${encodeURIComponent(userId)}` +
    `&adaptation_type=like.confidence_*` +
    `&order=created_at.desc` +
    `&limit=20`;
  const res = await supabaseRest<AdaptationEventRow[]>('GET', path);
  if (!res.ok || !res.data) return [];
  return res.data;
}

async function defaultCallGroq(system: string, user: string): Promise<string | null> {
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
        max_tokens: GROQ_MAX_TOKENS,
        stream: false,
      }),
      signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

const deps: Deps = {
  readMemoryExemplars: defaultReadMemoryExemplars,
  readIdentitySignals: defaultReadIdentitySignals,
  readDoctrineDirectives: defaultReadDoctrineDirectives,
  readGovernanceEvents: defaultReadGovernanceEvents,
  readAdaptationEvents: defaultReadAdaptationEvents,
  callGroq: defaultCallGroq,
};

/** Test-only hook: swap any subset of readers / callGroq. */
export function __setDeps(overrides: Partial<Deps>): void {
  if (overrides.readMemoryExemplars) deps.readMemoryExemplars = overrides.readMemoryExemplars;
  if (overrides.readIdentitySignals) deps.readIdentitySignals = overrides.readIdentitySignals;
  if (overrides.readDoctrineDirectives) deps.readDoctrineDirectives = overrides.readDoctrineDirectives;
  if (overrides.readGovernanceEvents) deps.readGovernanceEvents = overrides.readGovernanceEvents;
  if (overrides.readAdaptationEvents) deps.readAdaptationEvents = overrides.readAdaptationEvents;
  if (overrides.callGroq) deps.callGroq = overrides.callGroq;
}

/** Test-only hook: restore default readers. */
export function __resetDeps(): void {
  deps.readMemoryExemplars = defaultReadMemoryExemplars;
  deps.readIdentitySignals = defaultReadIdentitySignals;
  deps.readDoctrineDirectives = defaultReadDoctrineDirectives;
  deps.readGovernanceEvents = defaultReadGovernanceEvents;
  deps.readAdaptationEvents = defaultReadAdaptationEvents;
  deps.callGroq = defaultCallGroq;
}

// ---------------------------------------------------------------------------
// Channel parsers
// ---------------------------------------------------------------------------

function parseExemplars(rows: MemoryRow[]): string[] {
  return rows
    .map((r) => (typeof r.content === 'string' ? r.content.trim() : ''))
    .filter((s) => s.length > 0)
    .slice(0, EXEMPLAR_LIMIT)
    .map((s) => (s.length > EXEMPLAR_MAX_CHARS ? `${s.slice(0, EXEMPLAR_MAX_CHARS)}…` : s));
}

function parseIdentitySignals(rows: IdentitySignalRow[]): {
  verbosity?: PersonalizationContext['verbosity'];
  tone?: PersonalizationContext['tone'];
  structurePreference?: PersonalizationContext['structurePreference'];
  vocabLevel?: PersonalizationContext['vocabLevel'];
  anyRow: boolean;
} {
  const result: {
    verbosity?: PersonalizationContext['verbosity'];
    tone?: PersonalizationContext['tone'];
    structurePreference?: PersonalizationContext['structurePreference'];
    vocabLevel?: PersonalizationContext['vocabLevel'];
    anyRow: boolean;
  } = { anyRow: rows.length > 0 };

  // signal_content is free text in mig 007. Pull lexical cues that match the
  // canonical enums; if nothing matches, the channel just doesn't override.
  for (const row of rows) {
    const text = (row.signal_content ?? '').toLowerCase();
    const domain = row.domain ?? '';
    if (!text) continue;
    if (domain === 'communication_profile') {
      if (!result.verbosity) {
        if (/\b(brief|concise|terse|short)\b/.test(text)) result.verbosity = 'low';
        else if (/\b(detailed|comprehensive|long-form|verbose|thorough)\b/.test(text))
          result.verbosity = 'high';
        else if (/\b(medium|balanced)\b/.test(text)) result.verbosity = 'medium';
      }
      if (!result.tone) {
        if (/\b(direct|blunt|terse|no.{0,4}fluff)\b/.test(text)) result.tone = 'direct';
        else if (/\b(warm|conversational|friendly)\b/.test(text)) result.tone = 'warm';
        else if (/\b(professional|formal)\b/.test(text)) result.tone = 'professional';
        else if (/\b(analytical|rigorous)\b/.test(text)) result.tone = 'analytical';
      }
      if (!result.structurePreference) {
        if (/\b(prose|flowing|minimal|narrative)\b/.test(text))
          result.structurePreference = 'minimal';
        else if (/\b(structured|headers|tables|numbered|outline)\b/.test(text))
          result.structurePreference = 'structured';
        else if (/\b(balanced)\b/.test(text)) result.structurePreference = 'balanced';
      }
    } else if (domain === 'chamber_profile') {
      if (!result.vocabLevel) {
        if (/\b(expert|advanced|specialist|technical)\b/.test(text))
          result.vocabLevel = 'expert';
        else if (/\b(accessible|beginner|plain|simple)\b/.test(text))
          result.vocabLevel = 'accessible';
        else if (/\b(intermediate)\b/.test(text)) result.vocabLevel = 'intermediate';
      }
    }
  }
  return result;
}

function computeConfidenceCalibration(args: {
  governance: GovernanceEventRow[];
  adaptation: AdaptationEventRow[];
}): { calibration: number; relevantCount: number } {
  let over = 0;
  let under = 0;
  let relevant = 0;

  for (const row of args.governance) {
    const direction = String(
      (row.payload as Record<string, unknown> | undefined)?.confidence_direction ?? '',
    ).toLowerCase();
    if (direction === 'over_confident') {
      over += 1;
      relevant += 1;
    } else if (direction === 'under_confident') {
      under += 1;
      relevant += 1;
    } else if (row.event_type === 'corrected' || row.event_type === 'contradicted') {
      // Treat a bare correction without direction as a mild over-confidence signal:
      // the user pushed back on Atlas's claim → Atlas overstated.
      over += 1;
      relevant += 1;
    }
  }

  for (const row of args.adaptation) {
    const t = (row.adaptation_type ?? '').toLowerCase();
    if (t.includes('over')) {
      over += 1;
      relevant += 1;
    } else if (t.includes('under')) {
      under += 1;
      relevant += 1;
    } else if (t.startsWith('confidence_')) {
      relevant += 1;
    }
  }

  const total = Math.max(relevant, 5);
  const raw = (over - under) / total;
  const calibration = Math.max(-1, Math.min(1, raw));
  return { calibration, relevantCount: relevant };
}

// ---------------------------------------------------------------------------
// loadPersonalizationContext — the parallel-read entrypoint
// ---------------------------------------------------------------------------

async function loadAllChannels(
  userId: string,
  modeAllowsExemplars: boolean,
): Promise<{
  exemplarRows: MemoryRow[];
  identityRows: IdentitySignalRow[];
  doctrine: DoctrineDirective[];
  governance: GovernanceEventRow[];
  adaptation: AdaptationEventRow[];
}> {
  const exemplarsP = modeAllowsExemplars
    ? deps.readMemoryExemplars(userId).catch((err) => {
        console.warn('[personalization] memory exemplars read failed:', err);
        return [] as MemoryRow[];
      })
    : Promise.resolve([] as MemoryRow[]);

  const identityP = deps.readIdentitySignals(userId).catch((err) => {
    console.warn('[personalization] identity signals read failed:', err);
    return [] as IdentitySignalRow[];
  });
  const doctrineP = deps.readDoctrineDirectives(userId).catch((err) => {
    console.warn('[personalization] doctrine read failed:', err);
    return [] as DoctrineDirective[];
  });
  const governanceP = deps.readGovernanceEvents(userId).catch((err) => {
    console.warn('[personalization] governance events read failed:', err);
    return [] as GovernanceEventRow[];
  });
  const adaptationP = deps.readAdaptationEvents(userId).catch((err) => {
    console.warn('[personalization] adaptation events read failed:', err);
    return [] as AdaptationEventRow[];
  });

  const settled = await Promise.allSettled([
    exemplarsP,
    identityP,
    doctrineP,
    governanceP,
    adaptationP,
  ]);

  const pick = <T>(s: PromiseSettledResult<T>, fallback: T): T =>
    s.status === 'fulfilled' ? s.value : fallback;

  return {
    exemplarRows: pick(settled[0] as PromiseSettledResult<MemoryRow[]>, []),
    identityRows: pick(settled[1] as PromiseSettledResult<IdentitySignalRow[]>, []),
    doctrine: pick(settled[2] as PromiseSettledResult<DoctrineDirective[]>, []),
    governance: pick(settled[3] as PromiseSettledResult<GovernanceEventRow[]>, []),
    adaptation: pick(settled[4] as PromiseSettledResult<AdaptationEventRow[]>, []),
  };
}

export async function loadPersonalizationContext(
  userId: string,
  decision: RouterDecision,
): Promise<PersonalizationContext> {
  const modeDef = MODE_LIBRARY[decision.mode];
  const allowExemplars = modeDef?.personalizationKnobs.allowExemplars ?? false;

  const work = loadAllChannels(userId, allowExemplars);

  // 400 ms hard budget — any reader exceeding it is dropped to its default.
  const timeout = new Promise<Awaited<typeof work>>((resolve) => {
    setTimeout(
      () =>
        resolve({
          exemplarRows: [],
          identityRows: [],
          doctrine: [],
          governance: [],
          adaptation: [],
        }),
      CONTEXT_LOAD_BUDGET_MS,
    );
  });

  let bundle: Awaited<typeof work>;
  try {
    bundle = await Promise.race([work, timeout]);
  } catch (err) {
    console.warn('[personalization] loadPersonalizationContext unhandled error:', err);
    return { ...DEFAULT_CONTEXT };
  }

  const memoryExemplars = parseExemplars(bundle.exemplarRows);
  const signals = parseIdentitySignals(bundle.identityRows);
  const { calibration } = computeConfidenceCalibration({
    governance: bundle.governance,
    adaptation: bundle.adaptation,
  });

  return {
    verbosity: signals.verbosity ?? DEFAULT_CONTEXT.verbosity,
    tone: signals.tone ?? DEFAULT_CONTEXT.tone,
    structurePreference: signals.structurePreference ?? DEFAULT_CONTEXT.structurePreference,
    vocabLevel: signals.vocabLevel ?? DEFAULT_CONTEXT.vocabLevel,
    memoryExemplars,
    doctrineDirectives: bundle.doctrine,
    confidenceCalibration: calibration,
  };
}

// ---------------------------------------------------------------------------
// translate — Stage 3 entrypoint
// ---------------------------------------------------------------------------

function calibrationLine(c: number): string {
  if (c > CONFIDENCE_OVER_THRESHOLD)
    return 'user tends to over-commit; hedge more, name uncertainty';
  if (c < CONFIDENCE_UNDER_THRESHOLD)
    return 'user tends to under-commit; state findings cleanly without excess hedging';
  return 'standard hedging';
}

function buildSystemPrompt(args: {
  decision: RouterDecision;
  context: PersonalizationContext;
}): string {
  const sections = resolveSections(args.decision);
  const modeShape = buildModeSystemPrompt(args.decision, sections);

  const personalizationBlock = [
    `VERBOSITY: ${VERBOSITY_MAP[args.context.verbosity]}`,
    `TONE: ${TONE_MAP[args.context.tone]}`,
    `STRUCTURE: ${STRUCTURE_MAP[args.context.structurePreference]}`,
    `VOCAB: ${VOCAB_MAP[args.context.vocabLevel]}`,
    `CONFIDENCE CALIBRATION: ${calibrationLine(args.context.confidenceCalibration)}`,
  ];

  if (args.context.memoryExemplars.length > 0) {
    personalizationBlock.push(
      '',
      'USER CONTEXT EXEMPLARS (use to ground concrete examples where natural; do not quote verbatim, paraphrase):',
      ...args.context.memoryExemplars.map((e) => `- ${e}`),
    );
  }

  const rules = [
    '- Preserve ALL factual content from the synthesized answer',
    '- Conform output to the response mode structure above',
    '- No flattery, no throat-clearing, no meta-commentary about the translation',
    '- Output only the rewritten response',
  ];

  return [
    modeShape,
    '',
    'PERSONALIZATION:',
    ...personalizationBlock,
    '',
    'RULES:',
    ...rules,
  ].join('\n');
}

function decideFiredChannels(args: {
  context: PersonalizationContext;
  identityRowCount: number;
  governanceCount: number;
  adaptationCount: number;
  modeAllowsRescale: boolean;
}): PersonalizationChannel[] {
  const fired: PersonalizationChannel[] = [];
  if (args.context.memoryExemplars.length > 0) fired.push('memory_exemplars');
  if (args.identityRowCount > 0) fired.push('tone_register');
  if (args.context.doctrineDirectives.some((d) => d.directiveType !== 'default')) {
    fired.push('doctrine_sections');
  }
  const relevantEvents = args.governanceCount + args.adaptationCount;
  if (
    args.modeAllowsRescale &&
    args.context.confidenceCalibration !== 0 &&
    relevantEvents >= MIN_GOVERNANCE_EVENTS
  ) {
    fired.push('confidence_calibration');
  }
  return fired;
}

export async function translate(input: TranslateInput): Promise<TranslateResult> {
  const modeDef = MODE_LIBRARY[input.decision.mode];
  const modeAllowsRescale = modeDef?.personalizationKnobs.allowConfidenceRescale ?? false;
  const modeAllowsExemplars = modeDef?.personalizationKnobs.allowExemplars ?? false;

  // We need the raw bundle (not just the parsed context) to decide which
  // channels actually fired. loadAllChannels gives us that; we then derive
  // the context from the same bundle so the two views agree.
  const bundle = await Promise.race([
    loadAllChannels(input.userId, modeAllowsExemplars),
    new Promise<Awaited<ReturnType<typeof loadAllChannels>>>((resolve) =>
      setTimeout(
        () =>
          resolve({
            exemplarRows: [],
            identityRows: [],
            doctrine: [],
            governance: [],
            adaptation: [],
          }),
        CONTEXT_LOAD_BUDGET_MS,
      ),
    ),
  ]);

  const memoryExemplars = parseExemplars(bundle.exemplarRows);
  const signals = parseIdentitySignals(bundle.identityRows);
  const { calibration } = computeConfidenceCalibration({
    governance: bundle.governance,
    adaptation: bundle.adaptation,
  });

  const context: PersonalizationContext = {
    verbosity: signals.verbosity ?? DEFAULT_CONTEXT.verbosity,
    tone: signals.tone ?? DEFAULT_CONTEXT.tone,
    structurePreference: signals.structurePreference ?? DEFAULT_CONTEXT.structurePreference,
    vocabLevel: signals.vocabLevel ?? DEFAULT_CONTEXT.vocabLevel,
    memoryExemplars,
    doctrineDirectives: bundle.doctrine,
    confidenceCalibration: modeAllowsRescale ? calibration : 0,
  };

  const system = buildSystemPrompt({ decision: input.decision, context });
  const userContent = `USER QUERY: ${input.query}\n\nSYNTHESIZED ANSWER:\n${input.synthesizedAnswer}`;

  let translated: string | null = null;
  try {
    translated = await deps.callGroq(system, userContent);
  } catch (err) {
    console.warn('[personalization] groq translator threw, falling back:', err);
    translated = null;
  }

  if (!translated || translated.length === 0) {
    // Graceful degrade: return the synthesized answer unchanged.
    return {
      translated: input.synthesizedAnswer,
      personalizationApplied: [],
      context,
    };
  }

  return {
    translated,
    personalizationApplied: decideFiredChannels({
      context,
      identityRowCount: signals.anyRow ? bundle.identityRows.length : 0,
      governanceCount: bundle.governance.length,
      adaptationCount: bundle.adaptation.length,
      modeAllowsRescale,
    }),
    context,
  };
}
