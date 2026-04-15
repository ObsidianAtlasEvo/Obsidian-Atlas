/**
 * Legal Hold Registry — Phase 4 §5
 *
 * Manages legal holds that prevent data from being deleted during
 * retention sweeps or erasure requests. Only the Sovereign Creator
 * (crowleyrc62@gmail.com) can release holds. Holds older than 90 days
 * without re-confirmation are flagged.
 */

import { randomUUID } from 'node:crypto';
import { getDb } from '../../../db/sqlite.js';
import { logRetentionEvent } from './retentionAuditTrail.js';
import { SOVEREIGN_CREATOR_EMAIL } from '../../intelligence/sovereignCreatorDirective.js';

export interface LegalHold {
  id?: string;
  table: string;
  rowId?: string;
  userId?: string;
  reason: string;
  placedBy: string;
  placedAt?: Date;
  expiresAt?: Date;
  lastConfirmedAt?: Date;
}

interface LegalHoldRow {
  id: string;
  table_name: string;
  row_id: string | null;
  user_id: string | null;
  reason: string;
  placed_by: string;
  placed_at: string;
  expires_at: string | null;
  last_confirmed_at: string | null;
  released_at: string | null;
  released_by: string | null;
}

function rowToHold(row: LegalHoldRow): LegalHold {
  return {
    id: row.id,
    table: row.table_name,
    rowId: row.row_id ?? undefined,
    userId: row.user_id ?? undefined,
    reason: row.reason,
    placedBy: row.placed_by,
    placedAt: new Date(row.placed_at),
    expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    lastConfirmedAt: row.last_confirmed_at ? new Date(row.last_confirmed_at) : undefined,
  };
}

/**
 * Place a legal hold on a table/row. Returns the hold ID.
 */
export async function placeHold(hold: LegalHold): Promise<string> {
  const db = getDb();
  const id = hold.id ?? randomUUID();
  const now = new Date();
  const placedAt = hold.placedAt ?? now;

  db.prepare(
    `INSERT INTO atlas_legal_holds (id, table_name, row_id, user_id, reason, placed_by, placed_at, expires_at, last_confirmed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    hold.table,
    hold.rowId ?? null,
    hold.userId ?? null,
    hold.reason,
    hold.placedBy,
    placedAt.toISOString(),
    hold.expiresAt ? hold.expiresAt.toISOString() : null,
    (hold.lastConfirmedAt ?? placedAt).toISOString()
  );

  await logRetentionEvent({
    type: 'HOLD_PLACED',
    table: hold.table,
    rowId: hold.rowId,
    userId: hold.userId,
    actorId: hold.placedBy,
    detail: hold.reason,
  });

  return id;
}

/**
 * Release a legal hold. Only the Sovereign Creator can release holds.
 */
export async function releaseHold(holdId: string, actorId: string): Promise<void> {
  if (actorId !== SOVEREIGN_CREATOR_EMAIL) {
    throw new Error(`Only Sovereign Creator (${SOVEREIGN_CREATOR_EMAIL}) can release legal holds`);
  }

  const db = getDb();
  const now = new Date().toISOString();
  const result = db.prepare(
    `UPDATE atlas_legal_holds SET released_at = ?, released_by = ? WHERE id = ? AND released_at IS NULL`
  ).run(now, actorId, holdId);

  if (result.changes === 0) {
    throw new Error(`Hold ${holdId} not found or already released`);
  }

  await logRetentionEvent({
    type: 'HOLD_RELEASED',
    actorId,
    detail: `Released hold ${holdId}`,
  });
}

/**
 * Check whether a specific table+row combination is under legal hold.
 */
export async function hasHold(table: string, rowId: string): Promise<boolean> {
  const db = getDb();
  const row = db.prepare(
    `SELECT 1 FROM atlas_legal_holds
     WHERE table_name = ? AND (row_id = ? OR row_id IS NULL)
       AND released_at IS NULL
       AND (expires_at IS NULL OR expires_at > ?)
     LIMIT 1`
  ).get(table, rowId, new Date().toISOString());
  return row !== undefined;
}

/**
 * Return all active (non-released, non-expired) legal holds.
 */
export async function getActiveHolds(): Promise<LegalHold[]> {
  const db = getDb();
  const now = new Date().toISOString();
  const rows = db.prepare(
    `SELECT * FROM atlas_legal_holds
     WHERE released_at IS NULL
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY placed_at DESC`
  ).all(now) as LegalHoldRow[];
  return rows.map(rowToHold);
}

/**
 * Returns true if the hold is older than 90 days without re-confirmation.
 */
export async function requiresReconfirmation(holdId: string): Promise<boolean> {
  const db = getDb();
  const row = db.prepare(
    `SELECT last_confirmed_at FROM atlas_legal_holds WHERE id = ? AND released_at IS NULL`
  ).get(holdId) as { last_confirmed_at: string | null } | undefined;

  if (!row) return false;

  const lastConfirmed = row.last_confirmed_at ? new Date(row.last_confirmed_at) : new Date(0);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  return lastConfirmed < ninetyDaysAgo;
}
