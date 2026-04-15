import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { getDb } from '../../db/sqlite.js';
import type { EvalResult } from './evalEngine.js';

export type SftMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export interface SftJsonlRow {
  id: string;
  userId: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  meta: {
    exchangeTraceId: string;
    evaluation: EvalResult;
    createdAt: string;
  };
}

function sftPath(userId: string): string {
  const dir = path.join(env.dataDir, 'datasets', userId);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'sft.jsonl');
}

/**
 * TRL-friendly conversational lines: `messages` uses chat roles for SFTTrainer chat templates.
 */
export function appendApprovedSftExample(input: {
  userId: string;
  exchangeTraceId: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  evaluation: EvalResult;
}): SftJsonlRow {
  const row: SftJsonlRow = {
    id: randomUUID(),
    userId: input.userId,
    messages: input.messages,
    meta: {
      exchangeTraceId: input.exchangeTraceId,
      evaluation: input.evaluation,
      createdAt: new Date().toISOString(),
    },
  };
  fs.appendFileSync(sftPath(input.userId), `${JSON.stringify(row)}\n`, 'utf8');
  return row;
}

/**
 * HuggingFace TRL conversational line only: `{"messages":[...]}` (no meta) for `atlas_sft.jsonl`.
 */
export function appendAtlasSftJsonl(messages: SftMessage[]): void {
  const dir = path.join(env.dataDir, 'datasets');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'atlas_sft.jsonl');
  const line = JSON.stringify({ messages });
  fs.appendFileSync(file, `${line}\n`, 'utf8');
}

/**
 * Persist an eval result to the eval_history SQLite table for queryable history.
 */
export function appendEvalToSqlite(userId: string, evalResult: EvalResult): void {
  getDb()
    .prepare(
      `INSERT INTO eval_history (user_id, truth_alignment, cognitive_density, style_adherence, combined_normalized, gap_flagged, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      evalResult.truthAlignment,
      evalResult.cognitiveDensity,
      evalResult.styleAdherence,
      evalResult.combinedNormalized,
      evalResult.gapFlagged ? 1 : 0,
      evalResult.source
    );
}

/**
 * Retrieve recent eval history rows for a user (most recent first).
 */
export function getRecentEvalHistory(userId: string, limit: number): EvalResult[] {
  const rows = getDb()
    .prepare(
      `SELECT truth_alignment, cognitive_density, style_adherence, combined_normalized, gap_flagged, source, created_at
       FROM eval_history
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(userId, limit) as Array<{
    truth_alignment: number;
    cognitive_density: number;
    style_adherence: number;
    combined_normalized: number;
    gap_flagged: number;
    source: string;
    created_at: string;
  }>;

  return rows.map((r) => ({
    truthAlignment: r.truth_alignment,
    cognitiveDensity: r.cognitive_density,
    styleAdherence: r.style_adherence,
    combinedNormalized: r.combined_normalized,
    responseScore: r.combined_normalized,
    gapFlagged: Boolean(r.gap_flagged),
    datasetApproved: false,
    memoryCandidatesApproved: false,
    reasons: [],
    source: r.source as EvalResult['source'],
  }));
}
