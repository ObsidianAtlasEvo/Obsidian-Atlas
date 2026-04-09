import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';

export function appendAutonomyLog(input: {
  userId: string;
  kind: string;
  message: string;
  decisionJson?: string | null;
  status?: string;
}): void {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO autonomy_log (id, user_id, created_at, kind, message, decision_json, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    now,
    input.kind,
    input.message,
    input.decisionJson ?? null,
    input.status ?? 'info'
  );
}

export type AutonomyLogRow = {
  id: string;
  userId: string;
  createdAt: string;
  kind: string;
  message: string;
  decisionJson: string | null;
  status: string;
};

export function listRecentAutonomyLogs(userId: string, limit: number): AutonomyLogRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, user_id, created_at, kind, message, decision_json, status
       FROM autonomy_log
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(userId, limit) as {
    id: string;
    user_id: string;
    created_at: string;
    kind: string;
    message: string;
    decision_json: string | null;
    status: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    createdAt: r.created_at,
    kind: r.kind,
    message: r.message,
    decisionJson: r.decision_json,
    status: r.status,
  }));
}
