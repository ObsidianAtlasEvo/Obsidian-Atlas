/**
 * subsystemEvolvers.ts — Evolution handlers for the 5 subsystems
 * not covered by the existing memory + policy evolution pipeline.
 */
import type { EvalResult } from './evalEngine.js';
import { getPolicyProfile } from './policyStore.js';

export interface SubsystemEvalContext {
  evalResult: EvalResult;
  userMessage?: string;
}

export async function evolveMindProfile(userId: string, ctx: SubsystemEvalContext): Promise<void> {
  try {
    const { getDb } = await import('../../db/sqlite.js');
    const db = getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS mind_profiles (
      user_id TEXT PRIMARY KEY,
      depth_preference REAL DEFAULT 0.5,
      abstraction_bias REAL DEFAULT 0.5,
      challenge_level REAL DEFAULT 0.5,
      domain_interests TEXT DEFAULT '[]',
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
    // Nudge depth based on eval score
    const depthNudge = ctx.evalResult.responseScore > 0.7 ? 0.02 : -0.01;
    db.prepare(
      `INSERT INTO mind_profiles (user_id, depth_preference) VALUES (?, 0.5)
       ON CONFLICT(user_id) DO UPDATE SET
         depth_preference = MIN(1.0, MAX(0.0, depth_preference + ?)),
         updated_at = datetime('now')`
    ).run(userId, depthNudge);
  } catch (err) {
    console.error('[Evolution] evolveMindProfile error:', err);
  }
}

export async function evolveSystemPrompt(userId: string, ctx: SubsystemEvalContext): Promise<void> {
  try {
    const { getDb } = await import('../../db/sqlite.js');
    const db = getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS user_prompt_addenda (
      user_id TEXT PRIMARY KEY,
      prompt_addendum TEXT NOT NULL DEFAULT '',
      interaction_count INTEGER DEFAULT 0,
      avg_response_score REAL DEFAULT 0.5,
      last_score REAL DEFAULT 0.5,
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
    // Migrate: add columns that may be missing from tables created before this schema version
    for (const migration of [
      `ALTER TABLE user_prompt_addenda ADD COLUMN avg_response_score REAL DEFAULT 0.5`,
      `ALTER TABLE user_prompt_addenda ADD COLUMN last_score REAL DEFAULT 0.5`,
    ]) {
      try { db.exec(migration); } catch { /* column already exists — safe to ignore */ }
    }

    // Read current state
    const row = db
      .prepare(`SELECT interaction_count, avg_response_score, last_score FROM user_prompt_addenda WHERE user_id = ?`)
      .get(userId) as { interaction_count: number; avg_response_score: number; last_score: number } | undefined;

    const count = (row?.interaction_count ?? 0) + 1;
    const prevAvg = row?.avg_response_score ?? 0.5;
    const prevLast = row?.last_score ?? 0.5;
    const currentScore = ctx.evalResult.responseScore;

    // Exponential moving average (alpha=0.15) for smoothed signal
    const newAvg = prevAvg * 0.85 + currentScore * 0.15;

    // Signal-based analysis: derive addendum from multiple signals
    const trend = currentScore - prevLast; // positive = improving
    const policy = getPolicyProfile(userId);

    const signals: string[] = [];

    // Depth signal
    if (newAvg >= 0.75 || policy.preferredComputeDepth === 'Heavy') {
      signals.push('Prefer deep analytical synthesis with explicit epistemic hedging.');
    } else if (newAvg < 0.45) {
      signals.push('Prioritize clarity and conciseness over analytical depth.');
    }

    // Trend signal
    if (trend > 0.15 && count >= 5) {
      signals.push('Recent engagement quality is improving — maintain current communication pattern.');
    } else if (trend < -0.15 && count >= 5) {
      signals.push('Recent engagement quality is declining — recalibrate depth and tone.');
    }

    // Policy signals
    if (policy.tone === 'direct') {
      signals.push('User prefers blunt, direct responses without softening.');
    } else if (policy.tone === 'warm') {
      signals.push('User responds well to a warmer, more collaborative tone.');
    }
    if (policy.structurePreference === 'minimal') {
      signals.push('Avoid heavy use of bullet points — prefer flowing prose.');
    } else if (policy.structurePreference === 'structured') {
      signals.push('Use structured formatting (bullets, headers) for complex outputs.');
    }
    if (policy.writingStyleEnabled) {
      signals.push('Apply personalized writing style adaptations when relevant.');
    }

    // Interaction volume signal
    if (count >= 50) {
      signals.push(`Long-term user (${count} interactions) — avoid re-explaining established context.`);
    }

    const addendum = signals.length > 0
      ? `BEHAVIORAL_CALIBRATION (${count} interactions, avg_score=${newAvg.toFixed(2)}):\n` +
        signals.map((s) => `- ${s}`).join('\n')
      : '';

    db.prepare(
      `INSERT INTO user_prompt_addenda (user_id, interaction_count, avg_response_score, last_score, prompt_addendum)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         interaction_count = excluded.interaction_count,
         avg_response_score = excluded.avg_response_score,
         last_score = excluded.last_score,
         prompt_addendum = excluded.prompt_addendum,
         updated_at = datetime('now')`
    ).run(userId, count, newAvg, currentScore, addendum);
  } catch (err) {
    console.error('[Evolution] evolveSystemPrompt error:', err);
  }
}

export async function evolveFeatureFlags(
  userId: string,
  ctx: SubsystemEvalContext
): Promise<void> {
  try {
    const { getDb } = await import('../../db/sqlite.js');
    const db = getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS user_feature_recommendations (
      user_id TEXT NOT NULL,
      feature TEXT NOT NULL,
      recommended_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, feature)
    )`);
    if (ctx.evalResult.responseScore > 0.8) {
      db.prepare(
        `INSERT OR IGNORE INTO user_feature_recommendations (user_id, feature) VALUES (?, ?)`
      ).run(userId, 'advanced_reasoning_mode');
    }
  } catch (err) {
    console.error('[Evolution] evolveFeatureFlags error:', err);
  }
}

export async function evolveResonanceModel(
  userId: string,
  ctx: SubsystemEvalContext
): Promise<void> {
  try {
    const { getDb } = await import('../../db/sqlite.js');
    const db = getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS resonance_state (
      user_id TEXT PRIMARY KEY,
      confidence REAL DEFAULT 0.5,
      interaction_count INTEGER DEFAULT 0,
      model_json TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
    const confidenceNudge = ctx.evalResult.responseScore > 0.6 ? 0.01 : -0.005;
    db.prepare(
      `INSERT INTO resonance_state (user_id, confidence) VALUES (?, 0.5)
       ON CONFLICT(user_id) DO UPDATE SET
         confidence = MIN(1.0, MAX(0.0, confidence + ?)),
         interaction_count = interaction_count + 1,
         updated_at = datetime('now')`
    ).run(userId, confidenceNudge);
  } catch (err) {
    console.error('[Evolution] evolveResonanceModel error:', err);
  }
}

/**
 * Structured goal schema extracted by the LLM.
 */
interface ExtractedGoal {
  explicit_goal: string;
  implicit_goal: string;
  emotional_driver: string;
  time_horizon: string;
  confidence: number;
}

function isExtractedGoal(v: unknown): v is ExtractedGoal {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.explicit_goal === 'string' &&
    typeof o.implicit_goal === 'string' &&
    typeof o.emotional_driver === 'string' &&
    typeof o.time_horizon === 'string' &&
    typeof o.confidence === 'number'
  );
}

export async function evolveGoalMemory(
  userId: string,
  ctx: SubsystemEvalContext
): Promise<void> {
  try {
    const { getDb } = await import('../../db/sqlite.js');
    const db = getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS goal_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      goal TEXT NOT NULL,
      confidence REAL DEFAULT 0.5,
      source TEXT DEFAULT 'evolution',
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    if (!(ctx.evalResult.responseScore > 0.75 && ctx.userMessage)) return;

    // Attempt LLM-powered structured goal extraction (Groq, non-streaming).
    let goalDetail: string;
    let goalConfidence = ctx.evalResult.responseScore;

    try {
      const { completeGroqChat } = await import('../intelligence/universalAdapter.js');
      const { env } = await import('../../config/env.js');
      const model = env.groqDelegateModel?.trim() || 'llama-3.3-70b-versatile';
      const systemPrompt = [
        'Extract a structured goal signal from the user message.',
        'Return ONLY a JSON object with keys: explicit_goal, implicit_goal, emotional_driver, time_horizon, confidence (0-1).',
        'Be concise. No markdown, no explanation, no extra keys.',
      ].join(' ');
      const res = await completeGroqChat({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: ctx.userMessage.slice(0, 2000) },
        ],
        temperature: 0.1,
        timeoutMs: 12_000,
      });
      const raw = res.text.trim();
      const fenced = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
      const parsed: unknown = JSON.parse(fenced);
      if (isExtractedGoal(parsed)) {
        goalDetail = JSON.stringify(parsed);
        goalConfidence = Math.min(1, Math.max(0, parsed.confidence));
      } else {
        // Fallback: store raw with explicit label
        goalDetail = JSON.stringify({
          explicit_goal: ctx.userMessage.slice(0, 400),
          implicit_goal: '',
          emotional_driver: '',
          time_horizon: 'unknown',
          confidence: ctx.evalResult.responseScore,
          _parse_error: 'schema_mismatch',
        });
      }
    } catch {
      // LLM unavailable or failed — fall back to structured minimal form instead of raw char-slice
      goalDetail = JSON.stringify({
        explicit_goal: ctx.userMessage.slice(0, 400),
        implicit_goal: '',
        emotional_driver: '',
        time_horizon: 'unknown',
        confidence: ctx.evalResult.responseScore,
        _source: 'fallback_no_llm',
      });
    }

    db.prepare(
      `INSERT INTO goal_memory (user_id, goal, confidence, source) VALUES (?, ?, ?, ?)`
    ).run(userId, goalDetail, goalConfidence, 'llm_goal_extraction');
  } catch (err) {
    console.error('[Evolution] evolveGoalMemory error:', err);
  }
}
