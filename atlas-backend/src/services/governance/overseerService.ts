/**
 * OverseerService — The Atlas Overseer.
 *
 * Six-stage pipeline (post Wave-3E cutover, spec § 1):
 *   Stage 0 — Intent router  → RouterDecision (mode, condensed, overrides)
 *   Stage 1 — Multi-model synthesis (mode-aware system prompt)
 *   Stage 2 — Completeness audit (mode-aware gap fill)
 *   Stage 3 — Personalization layer (4 Supabase channels) — REPLACES user-lens
 *   Stage 4 — Constitutional sycophancy / brevity check (unchanged)
 *   Stage 5 — Gap detector (appends one `> Continues:` or `> Next:` line)
 *
 * Graceful degradation: every new stage is wrapped so that on failure the
 * pipeline passes the prior stage's output through unchanged. The pipeline
 * cannot fail closed.
 *
 * Emergency kill switch: `ATLAS_SHAPE_V2_DISABLE=1` routes through the legacy
 * 4-step path. Not user-facing; ops-only fire extinguisher (spec § 10).
 */

import { env } from '../../config/env.js';
import { getPolicyProfile } from '../evolution/policyStore.js';
import { getDb } from '../../db/sqlite.js';
import { routeIntent } from '../responseShape/intentRouter.js';
import { buildModeSystemPrompt, resolveSections } from '../responseShape/modeLibrary.js';
import { translate as personalizedTranslate } from '../responseShape/personalizationLayer.js';
import { detectAndAppend as detectGaps } from '../responseShape/gapDetector.js';
import type { ChatTurn, RouterDecision } from '../responseShape/types.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ModelOutput {
  modelId: string;
  content: string;
  confidence?: number;
}

export interface OverseerContext {
  query: string;
  mode: string;
  userId: string;
  conversationId?: string;
  modelOutputs?: ModelOutput[];
  /** Recent turns (excluding current trailing user turn). Wave-3E plumbing. */
  recentTurns?: ChatTurn[];
}

export interface OverseerGapOutcome {
  appendedLine?: string;
  unfinishedBusinessIdCreated?: string;
  unfinishedBusinessIdTouched?: string;
}

export interface OverseerResult {
  response: string;
  synthesisNotes: string;
  gapsFound: string[];
  constitutionalFlags: string[];
  wasPersonalized: boolean;
  degraded: boolean;
  /** RouterDecision used for this response (null on legacy / error paths). */
  routerDecision: RouterDecision | null;
  /** Channel names that fired in personalization (empty on legacy / error paths). */
  personalizationApplied: string[];
  /** Telemetry from the gap detector (Stage 5). */
  gapDetectorOutcome: OverseerGapOutcome;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveGroq(): { base: string; apiKey: string; model: string } | null {
  const apiKey = env.groqApiKey?.trim() || env.cloudOpenAiApiKey?.trim();
  if (!apiKey) return null;
  const base = (
    env.groqBaseUrl?.trim() ||
    env.cloudOpenAiBaseUrl?.trim() ||
    'https://api.groq.com/openai/v1'
  ).replace(/\/$/, '');
  const model =
    env.groqDelegateModel?.trim() ||
    env.cloudChatModel?.trim() ||
    'llama-3.3-70b-versatile';
  return { base, apiKey, model };
}

async function groqCall(
  systemPrompt: string,
  userContent: string,
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const config = resolveGroq();
  if (!config) throw new Error('Groq unavailable — no API key configured');

  const res = await fetch(`${config.base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: opts.temperature ?? 0.15,
      max_tokens: opts.maxTokens ?? 2048,
      stream: false,
    }),
    signal: AbortSignal.timeout(28_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Groq ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0]?.message?.content?.trim() ?? '';
}

// ---------------------------------------------------------------------------
// Step 1 — Multi-model synthesis
// ---------------------------------------------------------------------------

async function synthesizeOutputs(
  query: string,
  modelOutputs: ModelOutput[],
  rawResponse: string,
  modePromptFragment = ''
): Promise<{ synthesized: string; notes: string }> {
  if (modelOutputs.length === 0) {
    // Single-model path — still run through synthesis for quality normalization
    return { synthesized: rawResponse, notes: 'single-model-passthrough' };
  }

  const outputBlock = modelOutputs
    .map(
      (o, i) =>
        `[Model ${i + 1}: ${o.modelId}${o.confidence !== undefined ? ` (confidence ${(o.confidence * 100).toFixed(0)}%)` : ''}]\n${o.content}`
    )
    .join('\n\n---\n\n');

  const modeBlock = modePromptFragment ? `${modePromptFragment}\n\n` : '';
  const system = `${modeBlock}You are the Atlas Overseer synthesis engine.
Your task: combine multiple AI model outputs into one authoritative, accurate answer.
Rules:
- Cross-reference all outputs for factual consistency
- When models disagree, note the disagreement explicitly and state which position has stronger evidence and why
- Assign your own confidence level to contested claims (e.g. "High confidence:", "Uncertain:")
- Merge complementary information — do not discard unique correct insights from any model
- Remove hallucinations, contradictions, and content lacking cross-model support
- Do not flatter or add commentary about the models themselves
- Output the synthesized answer only, followed by a single line starting "SYNTHESIS_NOTES:" summarizing any disagreements or confidence flags`;

  const text = await groqCall(
    system,
    `USER QUERY: ${query}\n\nMODEL OUTPUTS:\n\n${outputBlock}`,
    { temperature: 0.1, maxTokens: 3000 }
  );

  const notesSplit = text.lastIndexOf('\nSYNTHESIS_NOTES:');
  if (notesSplit !== -1) {
    return {
      synthesized: text.slice(0, notesSplit).trim(),
      notes: text.slice(notesSplit + '\nSYNTHESIS_NOTES:'.length).trim(),
    };
  }
  return { synthesized: text, notes: '' };
}

// ---------------------------------------------------------------------------
// Step 2 — Completeness check and gap filling
// ---------------------------------------------------------------------------

async function fillGaps(
  query: string,
  synthesized: string,
  modePromptFragment = ''
): Promise<{ filled: string; gaps: string[] }> {
  const modeBlock = modePromptFragment ? `${modePromptFragment}\n\n` : '';
  const system = `${modeBlock}You are the Atlas completeness auditor.
Given the user's question and the synthesized answer so far, identify any meaningful gaps:
- Missing context, definitions, or background the user likely needs
- Logical steps that were skipped
- Edge cases or caveats that materially affect the answer
- Missing actionable next steps if the query is task-oriented

Output format (strict):
GAPS_FOUND: <comma-separated list of gaps, or "none">
SUPPLEMENTED_ANSWER: <the complete answer including any gap-filling additions>

Rules:
- If there are no meaningful gaps, set GAPS_FOUND: none and reproduce the answer verbatim under SUPPLEMENTED_ANSWER
- Do not add padding, opinion, or flattery — only substantive gap-filling content`;

  const text = await groqCall(
    system,
    `USER QUERY: ${query}\n\nCURRENT ANSWER:\n${synthesized}`,
    { temperature: 0.1, maxTokens: 3500 }
  );

  const gapsMatch = text.match(/GAPS_FOUND:\s*(.+?)(?:\n|$)/i);
  const answerMatch = text.match(/SUPPLEMENTED_ANSWER:\s*([\s\S]+)$/i);

  const gapsRaw = gapsMatch?.[1]?.trim() ?? 'none';
  const gaps =
    gapsRaw.toLowerCase() === 'none' ? [] : gapsRaw.split(',').map((g) => g.trim()).filter(Boolean);

  const filled = answerMatch?.[1]?.trim() ?? synthesized;
  return { filled, gaps };
}

// ---------------------------------------------------------------------------
// LEGACY Step 3 — User lens translation (kept ONLY for ATLAS_SHAPE_V2_DISABLE=1
// fire-extinguisher path, spec § 10). Wave 3E retires the canonical path in
// favor of personalizationLayer.translate(). Do not invoke this from new code.
// ---------------------------------------------------------------------------

async function applyUserLensLegacy(
  userId: string,
  query: string,
  answer: string
): Promise<{ translated: string; personalized: boolean }> {
  let profile;
  try {
    profile = getPolicyProfile(userId);
  } catch {
    return { translated: answer, personalized: false };
  }

  const verbosityMap = {
    low: 'concise — prioritize brevity, use bullet points if helpful, skip preamble',
    medium: 'balanced — thorough but not exhaustive, structured sections when appropriate',
    high:
      'comprehensive — full depth, detailed examples, complete reasoning chains, long-form prose welcome',
  };
  const toneMap = {
    direct: 'direct and terse — no softening, no throat-clearing',
    professional: 'professional and measured — clear, precise, authoritative',
    warm: 'warm and approachable — conversational but still substantive',
    analytical: 'analytical and rigorous — reasoning made explicit, trade-offs surfaced',
  };
  const structureMap = {
    minimal: 'minimal structure — flowing prose over headers and bullets',
    balanced: 'balanced structure — headers and bullets used where they genuinely aid clarity',
    structured:
      'high structure — consistent headers, numbered steps, tables, explicit section breaks',
  };

  // Load evolved mind profile for vocabulary level if available
  let vocabLevel = 'intermediate';
  let domainExpertise = '';
  try {
    const db = getDb();
    const mindRow = db
      .prepare(
        `SELECT depth_preference, domain_interests FROM mind_profiles WHERE user_id = ? LIMIT 1`
      )
      .get(userId) as { depth_preference: number; domain_interests: string } | undefined;
    if (mindRow) {
      const depth = mindRow.depth_preference ?? 0.5;
      vocabLevel =
        depth < 0.35 ? 'accessible (avoid jargon, explain terms)' : depth > 0.7 ? 'expert-level (assume domain familiarity, use precise terminology)' : 'intermediate (some jargon acceptable with brief context)';
      const interests = JSON.parse(mindRow.domain_interests || '[]') as string[];
      if (interests.length > 0) domainExpertise = `User has noted interest/expertise in: ${interests.join(', ')}.`;
    }
  } catch {
    // Non-fatal
  }

  // Only apply learned style preferences — unlearned defaults must not be passed to the LLM
  // as if they were user-stated. For new users, translate only vocabulary level (evidence-based).
  const learnedStyleBlock = profile.isLearned
    ? `VERBOSITY: ${verbosityMap[profile.verbosity] ?? 'medium'}
TONE: ${toneMap[profile.tone] ?? 'analytical'}
STRUCTURE: ${structureMap[profile.structurePreference] ?? 'balanced'}`
    : `NOTE: This user has no learned style preferences yet. Do not assert or infer tone/verbosity.
Adapt from live evidence in the conversation only. Default to precision and neutrality.`;

  const system = `You are the Atlas user-lens translator.
Rewrite the answer to perfectly match this specific user's evolved profile:

${learnedStyleBlock}
VOCABULARY LEVEL: ${vocabLevel}
${domainExpertise ? `DOMAIN CONTEXT: ${domainExpertise}` : ''}

Rules:
- Preserve ALL factual content — do not drop any information from the answer
- Rewrite for this user's voice, depth, and format preferences
- Do not add flattery, hedging, or meta-commentary about the translation itself
- Output the rewritten answer only`;

  const translated = await groqCall(
    system,
    `USER QUERY: ${query}\n\nANSWER TO TRANSLATE:\n${answer}`,
    { temperature: 0.2, maxTokens: 3500 }
  );

  return { translated: translated || answer, personalized: true };
}

// ---------------------------------------------------------------------------
// Step 4 — Constitutional check
// ---------------------------------------------------------------------------

const SYCOPHANCY_PATTERNS = [
  /great (point|question|idea)/i,
  /you'?re (absolutely|totally|completely) right/i,
  /\bbrilliant\b/i,
  /excellent (point|question)/i,
  /i (completely|totally) agree/i,
  /couldn'?t agree more/i,
  /\bspot on\b/i,
  /\bwell said\b/i,
  /\bperfectly put\b/i,
  /\binsightful question\b/i,
];

function constitutionalCheck(response: string, truthFirstStrictness: number): string[] {
  const flags: string[] = [];
  const hits = SYCOPHANCY_PATTERNS.filter((p) => p.test(response));
  if (hits.length >= 1 && truthFirstStrictness > 0.5) {
    flags.push(
      `sycophancy_pattern_detected: ${hits.length} flattery phrase(s) found — response may prioritize approval over accuracy`
    );
  }
  const wordCount = response.trim().split(/\s+/).length;
  if (wordCount < 40 && response.trim().length > 0) {
    flags.push(`brevity_concern: response is ${wordCount} words — may lack sufficient substance`);
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Training record
// ---------------------------------------------------------------------------

function recordTraining(
  userId: string,
  query: string,
  finalResponse: string,
  flags: string[],
  routerDecision: RouterDecision | null = null,
  personalizationApplied: string[] = []
): void {
  try {
    const db = getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS overseer_training_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      query TEXT NOT NULL,
      response TEXT NOT NULL,
      constitutional_flags TEXT NOT NULL DEFAULT '[]',
      degraded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    // Wave-3E cutover: extend with response-shape telemetry columns.
    // ALTER TABLE … ADD COLUMN IF NOT EXISTS is idempotent across reboots.
    try {
      db.exec(
        `ALTER TABLE overseer_training_records ADD COLUMN router_decision TEXT`
      );
    } catch {
      /* column already exists */
    }
    try {
      db.exec(
        `ALTER TABLE overseer_training_records ADD COLUMN personalization_applied TEXT`
      );
    } catch {
      /* column already exists */
    }
    let routerJson = '';
    let personalizationJson = '';
    try {
      routerJson = routerDecision ? JSON.stringify(routerDecision) : '';
    } catch {
      routerJson = '';
    }
    try {
      personalizationJson = JSON.stringify(personalizationApplied);
    } catch {
      personalizationJson = '[]';
    }
    db.prepare(
      `INSERT INTO overseer_training_records
         (user_id, query, response, constitutional_flags, router_decision, personalization_applied)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      query.slice(0, 500),
      finalResponse.slice(0, 3000),
      JSON.stringify(flags),
      routerJson,
      personalizationJson
    );
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

const EMPTY_GAP_OUTCOME: OverseerGapOutcome = {};

export async function applyOverseerLens(
  userId: string,
  rawResponse: string,
  context: OverseerContext
): Promise<OverseerResult> {
  const allOutputs = context.modelOutputs ?? [];
  let profile;
  try {
    profile = getPolicyProfile(userId);
  } catch {
    profile = null;
  }

  // If Groq unavailable, degrade gracefully — still do regex constitutional check
  const groqConfig = resolveGroq();
  if (!groqConfig) {
    const flags = constitutionalCheck(rawResponse, profile?.truthFirstStrictness ?? 0.72);
    const note =
      flags.length > 0
        ? `\n\n---\n*[Overseer: degraded mode — ${flags.join('; ')}]*`
        : '';
    recordTraining(userId, context.query, rawResponse + note, flags, null, []);
    return {
      response: rawResponse + note,
      synthesisNotes: 'degraded — Groq unavailable',
      gapsFound: [],
      constitutionalFlags: flags,
      wasPersonalized: false,
      degraded: true,
      routerDecision: null,
      personalizationApplied: [],
      gapDetectorOutcome: EMPTY_GAP_OUTCOME,
    };
  }

  // ── Emergency kill switch (spec § 10) — legacy 4-step path. ────────────────
  const v2Disabled = process.env.ATLAS_SHAPE_V2_DISABLE === '1';
  if (v2Disabled) {
    try {
      const { synthesized, notes } = await synthesizeOutputs(
        context.query,
        allOutputs,
        rawResponse
      );
      const { filled, gaps } = await fillGaps(context.query, synthesized);
      const { translated, personalized } = await applyUserLensLegacy(userId, context.query, filled);
      const flags = constitutionalCheck(translated, profile?.truthFirstStrictness ?? 0.72);
      let finalResponse = translated;
      if (flags.length > 0) {
        finalResponse += `\n\n---\n*[Overseer: constitutional note — ${flags.join('; ')}]*`;
      }
      recordTraining(userId, context.query, finalResponse, flags, null, []);
      return {
        response: finalResponse,
        synthesisNotes: `legacy-v1: ${notes}`,
        gapsFound: gaps,
        constitutionalFlags: flags,
        wasPersonalized: personalized,
        degraded: false,
        routerDecision: null,
        personalizationApplied: [],
        gapDetectorOutcome: EMPTY_GAP_OUTCOME,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      recordTraining(userId, context.query, rawResponse, ['pipeline_error_legacy'], null, []);
      return {
        response: rawResponse,
        synthesisNotes: `legacy-v1 pipeline_error: ${errMsg}`,
        gapsFound: [],
        constitutionalFlags: [],
        wasPersonalized: false,
        degraded: true,
        routerDecision: null,
        personalizationApplied: [],
        gapDetectorOutcome: EMPTY_GAP_OUTCOME,
      };
    }
  }

  // ── Stage 0 — Intent router ────────────────────────────────────────────────
  let decision: RouterDecision | null = null;
  try {
    decision = await routeIntent(
      context.userId || userId,
      context.query,
      context.recentTurns ?? []
    );
  } catch (err) {
    console.warn('[OverseerService] Stage 0 (router) failed, continuing without decision:', err);
    decision = null;
  }

  const modePromptFragment = decision
    ? buildModeSystemPrompt(decision, resolveSections(decision))
    : '';

  try {
    // Stage 1: synthesis (mode-aware prompt fragment prepended)
    const { synthesized, notes } = await synthesizeOutputs(
      context.query,
      allOutputs,
      rawResponse,
      modePromptFragment
    );

    // Stage 2: completeness audit (also mode-aware)
    const { filled, gaps } = await fillGaps(context.query, synthesized, modePromptFragment);

    // Stage 3: personalization layer (replaces legacy user-lens). Graceful degrade.
    let personalizedText = filled;
    let personalizationApplied: string[] = [];
    if (decision) {
      try {
        const translateResult = await personalizedTranslate({
          userId: context.userId || userId,
          query: context.query,
          decision,
          synthesizedAnswer: filled,
        });
        personalizedText = translateResult.translated || filled;
        personalizationApplied = translateResult.personalizationApplied;
      } catch (err) {
        console.warn('[OverseerService] Stage 3 (personalization) failed, passing through:', err);
      }
    }

    // Stage 4: constitutional check (unchanged)
    const flags = constitutionalCheck(personalizedText, profile?.truthFirstStrictness ?? 0.72);

    let postConstitutional = personalizedText;
    if (flags.length > 0) {
      postConstitutional +=
        `\n\n---\n*[Overseer: constitutional note — ${flags.join('; ')}]*`;
    }

    // Stage 5: gap detector (appends at most one `> Continues:` / `> Next:` line).
    let finalResponse = postConstitutional;
    let gapDetectorOutcome: OverseerGapOutcome = EMPTY_GAP_OUTCOME;
    if (decision) {
      try {
        const gapResult = await detectGaps({
          userId: context.userId || userId,
          query: context.query,
          decision,
          finalResponse: postConstitutional,
        });
        finalResponse = gapResult.augmentedResponse;
        gapDetectorOutcome = {
          appendedLine: gapResult.appendedLine,
          unfinishedBusinessIdCreated: gapResult.unfinishedBusinessIdCreated,
          unfinishedBusinessIdTouched: gapResult.unfinishedBusinessIdTouched,
        };
      } catch (err) {
        console.warn('[OverseerService] Stage 5 (gap detector) failed, passing through:', err);
      }
    }

    recordTraining(userId, context.query, finalResponse, flags, decision, personalizationApplied);

    return {
      response: finalResponse,
      synthesisNotes: notes,
      gapsFound: gaps,
      constitutionalFlags: flags,
      wasPersonalized: personalizationApplied.length > 0,
      degraded: false,
      routerDecision: decision,
      personalizationApplied,
      gapDetectorOutcome,
    };
  } catch (err) {
    // Pipeline failed mid-flight — degrade gracefully, never block user.
    // TPD (tokens per day) exhaustion is end-of-day normal behaviour — suppress the log noise.
    const errMsg = err instanceof Error ? err.message : String(err);
    const isTPD = errMsg.includes('per day') || errMsg.includes('tokens per day') || errMsg.includes('TPD');
    if (!isTPD) {
      console.error('[OverseerService] pipeline error:', err);
    }
    recordTraining(userId, context.query, rawResponse, ['pipeline_error'], decision, []);
    return {
      response: rawResponse,
      synthesisNotes: `pipeline_error: ${errMsg}`,
      gapsFound: [],
      constitutionalFlags: [],
      wasPersonalized: false,
      degraded: true,
      routerDecision: decision,
      personalizationApplied: [],
      gapDetectorOutcome: EMPTY_GAP_OUTCOME,
    };
  }
}
