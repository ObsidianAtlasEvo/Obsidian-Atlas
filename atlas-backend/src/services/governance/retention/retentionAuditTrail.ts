/**
 * Retention Audit Trail — Phase 4 §5
 *
 * Immutable audit trail for all data retention operations:
 * deletions, erasures, legal hold placements/releases, and
 * hold re-confirmations. Writes to `atlas_sovereign_audit`.
 */

import { randomUUID } from 'node:crypto';
import { getDb } from '../../../db/sqlite.js';

export interface RetentionEvent {
  id?: string;
  type: 'DELETION' | 'ERASURE' | 'HOLD_PLACED' | 'HOLD_RELEASED' | 'RECONFIRMATION';
  table?: string;
  rowId?: string;
  userId?: string;
  actorId: string;
  timestamp?: Date;
  detail?: string;
}

export interface RetentionFilter {
  type?: RetentionEvent['type'];
  table?: string;
  userId?: string;
  since?: Date;
  limit?: number;
}

interface RetentionEventRow {
  id: string;
  user_id: string | null;
  actor_id: string;
  event_type: string;
  table_name: string | null;
  row_id: string | null;
  detail: string | null;
  created_at: string;
}

function rowToEvent(row: RetentionEventRow): RetentionEvent {
  return {
    id: row.id,
    type: row.event_type as RetentionEvent['type'],
    table: row.table_name ?? undefined,
    rowId: row.row_id ?? undefined,
    userId: row.user_id ?? undefined,
    actorId: row.actor_id,
    timestamp: new Date(row.created_at),
    detail: row.detail ?? undefined,
  };
}

/**
 * Log a retention event to `atlas_sovereign_audit`.
 */
export async function logRetentionEvent(event: RetentionEvent): Promise<void> {
  const db = getDb();
  const id = event.id ?? randomUUID();
  const now = event.timestamp ?? new Date();

  db.prepare(
    `INSERT INTO atlas_sovereign_audit (id, user_id, actor_id, event_type, table_name, row_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    event.userId ?? null,
    event.actorId,
    event.type,
    event.table ?? null,
    event.rowId ?? null,
    event.detail ?? null,
    now.toISOString()
  );
}

/**
 * Query retention events with optional filtering.
 */
export async function queryRetentionEvents(filter: RetentionFilter): Promise<RetentionEvent[]> {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.type) {
    conditions.push('event_type = ?');
    params.push(filter.type);
  }
  if (filter.table) {
    conditions.push('table_name = ?');
    params.push(filter.table);
  }
  if (filter.userId) {
    conditions.push('user_id = ?');
    params.push(filter.userId);
  }
  if (filter.since) {
    conditions.push('created_at >= ?');
    params.push(filter.since.toISOString());
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filter.limit ?? 100;

  const rows = db.prepare(
    `SELECT * FROM atlas_sovereign_audit ${where} ORDER BY created_at DESC LIMIT ?`
  ).all(...params, limit) as RetentionEventRow[];

  return rows.map(rowToEvent);
}
