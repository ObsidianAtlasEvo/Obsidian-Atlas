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

/* ───────── Public API ───────── */
// atlas_schema_migrations is created authoritatively by initSqlite() — see
// atlas-backend/src/db/sqlite.ts. Do not redeclare here.

/**
 * Write a migration lifecycle entry to the `atlas_schema_migrations` table.
 */
export async function logMigration(entry: MigrationLogEntry): Promise<void> {
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
