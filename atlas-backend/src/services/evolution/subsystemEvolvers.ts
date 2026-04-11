/**
 * subsystemEvolvers.ts — Evolution handlers for the 5 subsystems
 * not covered by the existing memory + policy evolution pipeline.
 */
import type { EvalResult } from './evalEngine.js';

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
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
    // Increment interaction count; every 10 interactions, update the addendum
    const row = db
      .prepare(`SELECT interaction_count FROM user_prompt_addenda WHERE user_id = ?`)
      .get(userId) as { interaction_count: number } | undefined;
    const count = (row?.interaction_count ?? 0) + 1;
    const shouldUpdate = count % 10 === 0;
    if (shouldUpdate) {
      const addendum = `This user prefers ${ctx.evalResult.responseScore > 0.7 ? 'deep analytical' : 'accessible'} responses based on ${count} interactions.`;
      db.prepare(
        `INSERT INTO user_prompt_addenda (user_id, interaction_count, prompt_addendum)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           interaction_count = ?,
           prompt_addendum = ?,
           updated_at = datetime('now')`
      ).run(userId, count, addendum, count, addendum);
    } else {
      db.prepare(
        `INSERT INTO user_prompt_addenda (user_id, interaction_count)
         VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           interaction_count = ?,
           updated_at = datetime('now')`
      ).run(userId, count, count);
    }
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
    // Only add goal signals when eval suggests strong intent patterns
    if (ctx.evalResult.responseScore > 0.75 && ctx.userMessage) {
      const goalSignal = ctx.userMessage.slice(0, 200);
      db.prepare(
        `INSERT INTO goal_memory (user_id, goal, confidence, source) VALUES (?, ?, ?, ?)`
      ).run(userId, goalSignal, ctx.evalResult.responseScore, 'chronos_evolution');
    }
  } catch (err) {
    console.error('[Evolution] evolveGoalMemory error:', err);
  }
}
