/**
 * Rollback Engine — reverses applied migrations by invoking `down()` handlers.
 * Supports single-chain rollback and rollback-to-checkpoint (in reverse order).
 */

import { getDb } from '../../../db/sqlite.js';
import type { MigrationChain } from './migrationRunner.js';

/* ───────── Types ───────── */

export interface RollbackResult {
  success: boolean;
  domain: string;
  error?: string;
}

export interface RollbackReport {
  rolled: string[];
  failed?: string;
}

/* ───────── Table bootstrap ───────── */

function ensureTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS atlas_schema_migrations (
      id TEXT PRIMARY KEY NOT NULL,
      domain TEXT NOT NULL,
      version TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      error TEXT,
      checkpoint_id TEXT,
      lock_id TEXT,
      lock_acquired_at TEXT,
      lock_expires_at TEXT
    )
  `);
}

/* ───────── Public API ───────── */

/**
 * Roll back a single migration chain by executing its `down()` handler.
 * Throws if the chain is marked as irreversible.
 */
export async function rollback(chain: MigrationChain): Promise<RollbackResult> {
  if (chain.irreversible) {
    throw new Error(
      `Migration "${chain.id}" (domain: ${chain.domain}) is marked irreversible and cannot be rolled back`,
    );
  }

  try {
    await chain.down();

    ensureTable();
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE atlas_schema_migrations SET status = 'rolled_back', completed_at = ?
       WHERE domain = ? AND version = ? AND status = 'success'`
    ).run(now, chain.domain, chain.version);

    return { success: true, domain: chain.domain };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, domain: chain.domain, error: message };
  }
}

/**
 * Roll back all migrations applied after a given checkpoint, in reverse chronological order.
 */
export async function rollbackToCheckpoint(checkpoint: string): Promise<RollbackReport> {
  ensureTable();
  const db = getDb();

  // Find the checkpoint row to establish a timestamp boundary.
  const cpRow = db.prepare(
    `SELECT started_at FROM atlas_schema_migrations WHERE checkpoint_id = ? LIMIT 1`
  ).get(checkpoint) as { started_at: string } | undefined;

  if (!cpRow) {
    return { rolled: [], failed: `Checkpoint "${checkpoint}" not found` };
  }

  // Select all successful migrations applied after the checkpoint.
  const rows = db.prepare(
    `SELECT domain, version FROM atlas_schema_migrations
     WHERE status = 'success' AND started_at > ?
     ORDER BY started_at DESC`
  ).all(cpRow.started_at) as { domain: string; version: string }[];

  const rolled: string[] = [];
  const now = new Date().toISOString();

  for (const row of rows) {
    try {
      db.prepare(
        `UPDATE atlas_schema_migrations SET status = 'rolled_back', completed_at = ?
         WHERE domain = ? AND version = ? AND status = 'success'`
      ).run(now, row.domain, row.version);
      rolled.push(`${row.domain}@${row.version}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { rolled, failed: `${row.domain}@${row.version}: ${message}` };
    }
  }

  return { rolled };
}
