import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
import type { EvalResult } from './evalEngine.js';

export function saveEvolutionGap(input: {
  userId: string;
  traceId: string | null;
  reason: string;
  evaluation: EvalResult;
}): string {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO evolution_gaps (id, user_id, trace_id, reason, eval_snapshot, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, input.userId, input.traceId, input.reason, JSON.stringify(input.evaluation), now);
  return id;
}

export type EvolutionGapRow = {
  id: string;
  userId: string;
  traceId: string | null;
  reason: string;
  createdAt: string;
};

export function listRecentEvolutionGaps(userId: string, limit: number): EvolutionGapRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, user_id, trace_id, reason, created_at
       FROM evolution_gaps
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(userId, limit) as {
    id: string;
    user_id: string;
    trace_id: string | null;
    reason: string;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    traceId: r.trace_id,
    reason: r.reason,
    createdAt: r.created_at,
  }));
}
