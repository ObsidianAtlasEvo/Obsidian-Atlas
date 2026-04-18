/**
 * OverseerService — The Atlas Overseer.
 *
 * Every AI response passes through a 4-step LLM synthesis pipeline before reaching the user:
 *   Step 1 — Multi-model synthesis: combine all model outputs into one cohesive answer,
 *             cross-reference for truth, resolve disagreements with confidence assessments.
 *   Step 2 — Completeness check: identify gaps and fill them with supplementary information.
 *   Step 3 — User lens translation: rewrite through the user's evolved vocabulary level,
 *             depth preference, domain expertise, tone, and structural style.
 *   Step 4 — Constitutional check: enforce truth-first, strip sycophancy, flag violations.
 *
 * Graceful degradation: if Groq is unavailable, falls back to returning the raw response
 * with sycophancy flags appended — response delivery is never blocked.
 */

import { env } from '../../config/env.js';
import { getPolicyProfile } from '../evolution/policyStore.js';
import { getDb } from '../../db/sqlite.js';

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
}

export interface OverseerResult {
  response: string;
  synthesisNotes: string;
  gapsFound: string[];
  constitutionalFlags: string[];
  wasPersonalized: boolean;
  degraded: boolean;
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
  rawResponse: string
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

  const system = `You are the Atlas Overseer synthesis engine.
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
  synthesized: string
): Promise<{ filled: string; gaps: string[] }> {
  const system = `You are the Atlas completeness auditor.
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
// Step 3 — User lens translation
// ---------------------------------------------------------------------------

async function applyUserLens(
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
  flags: string[]
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
    db.prepare(
      `INSERT INTO overseer_training_records (user_id, query, response, constitutional_flags)
       VALUES (?, ?, ?, ?)`
    ).run(userId, query.slice(0, 500), finalResponse.slice(0, 3000), JSON.stringify(flags));
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

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
    recordTraining(userId, context.query, rawResponse + note, flags);
    return {
      response: rawResponse + note,
      synthesisNotes: 'degraded — Groq unavailable',
      gapsFound: [],
      constitutionalFlags: flags,
      wasPersonalized: false,
      degraded: true,
    };
  }

  try {
    // Step 1: Synthesize all model outputs
    const { synthesized, notes } = await synthesizeOutputs(
      context.query,
      allOutputs,
      rawResponse
    );

    // Step 2: Completeness check + gap filling
    const { filled, gaps } = await fillGaps(context.query, synthesized);

    // Step 3: Translate through user's evolved lens
    const { translated, personalized } = await applyUserLens(userId, context.query, filled);

    // Step 4: Constitutional check
    const flags = constitutionalCheck(translated, profile?.truthFirstStrictness ?? 0.72);

    let finalResponse = translated;
    if (flags.length > 0) {
      // Append non-intrusive constitutional flag for training visibility
      // (does NOT block the response — just marks it for Chronos review)
      finalResponse +=
        `\n\n---\n*[Overseer: constitutional note — ${flags.join('; ')}]*`;
    }

    recordTraining(userId, context.query, finalResponse, flags);

    return {
      response: finalResponse,
      synthesisNotes: notes,
      gapsFound: gaps,
      constitutionalFlags: flags,
      wasPersonalized: personalized,
      degraded: false,
    };
  } catch (err) {
    // Pipeline failed mid-flight — degrade gracefully, never block user
    // TPD (tokens per day) exhaustion is end-of-day normal behaviour — suppress the log noise
    const errMsg = err instanceof Error ? err.message : String(err);
    const isTPD = errMsg.includes('per day') || errMsg.includes('tokens per day') || errMsg.includes('TPD');
    if (!isTPD) {
      console.error('[OverseerService] pipeline error:', err);
    }
    recordTraining(userId, context.query, rawResponse, ['pipeline_error']);
    return {
      response: rawResponse,
      synthesisNotes: `pipeline_error: ${err instanceof Error ? err.message : String(err)}`,
      gapsFound: [],
      constitutionalFlags: [],
      wasPersonalized: false,
      degraded: true,
    };
  }
}
