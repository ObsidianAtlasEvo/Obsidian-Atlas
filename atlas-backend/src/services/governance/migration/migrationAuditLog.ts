/**
 * Migration Audit Log — records migration lifecycle events to the
 * `atlas_schema_migrations` table for observability and post-mortem analysis.
 */

import { randomUUID } from 'node:crypto';
import { getDb } from '../../../db/sqlite.js';

/* ───────── Types ───────── */

export interface MigrationLogEntry {
  domain: string;
  version: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'rolled_back';
  startedAt: string;
  completedAt?: string;
  error?: string;
  checkpointId?: string;
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
 * Write a migration lifecycle entry to the `atlas_schema_migrations` table.
 */
export async function logMigration(entry: MigrationLogEntry): Promise<void> {
  ensureTable();
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO atlas_schema_migrations
       (id, domain, version, status, started_at, completed_at, error, checkpoint_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    entry.domain,
    entry.version,
    entry.status,
    entry.startedAt,
    entry.completedAt ?? null,
    entry.error ?? null,
    entry.checkpointId ?? null,
  );
}
