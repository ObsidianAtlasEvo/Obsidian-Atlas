/**
 * Migration Runner — executes domain-by-domain migrations in topological order,
 * resolving inter-domain dependencies before processing. Checkpoints on partial
 * failure so recovery can resume from the last known good state.
 */

import { randomUUID } from 'node:crypto';
import { getDb } from '../../../db/sqlite.js';
import { logMigration } from './migrationAuditLog.js';
import { acquireLock, releaseLock } from './migrationLock.js';
import type { LockHandle } from './migrationLock.js';

/* ───────── Types ───────── */

export interface MigrationChain {
  id: string;
  domain: string;
  version: string;
  up: () => Promise<void>;
  down: () => Promise<void>;
  dependsOn?: string[];
  irreversible?: boolean;
}

export interface MigrationReport {
  ran: string[];
  failed?: string;
  error?: string;
  checkpointAt?: string;
}

export interface MigrationStatus {
  id: string;
  domain: string;
  version: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  checkpointId: string | null;
}

/* ───────── Topological sort (DFS) ───────── */
// atlas_schema_migrations is created authoritatively by initSqlite() — see
// atlas-backend/src/db/sqlite.ts (CREATE TABLE + migrateAtlasSchemaMigrationsTable).
// Do NOT redeclare it here; the canonical schema is a superset of what this
// module writes and the runner must not mask schema drift with a local
// CREATE TABLE IF NOT EXISTS.

function topoSort(chains: MigrationChain[]): MigrationChain[] {
  const byDomain = new Map<string, MigrationChain>();
  for (const c of chains) byDomain.set(c.domain, c);

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const order: MigrationChain[] = [];

  function visit(domain: string): void {
    if (visited.has(domain)) return;
    if (inStack.has(domain)) {
      throw new Error(`Circular dependency detected involving domain "${domain}"`);
    }

    const chain = byDomain.get(domain);
    if (!chain) return;

    inStack.add(domain);
    for (const dep of chain.dependsOn ?? []) {
      visit(dep);
    }
    inStack.delete(domain);
    visited.add(domain);
    order.push(chain);
  }

  for (const chain of chains) {
    visit(chain.domain);
  }

  return order;
}

/* ───────── Helpers ───────── */

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Returns true if a chain with the same (domain, version) has previously
 * completed with status='success'. Used to make `runMigrations` idempotent
 * across process restarts — without this guard, every boot would re-execute
 * every `up()` in the chain list, which is only safe for purely idempotent
 * chains and breaks the one-shot contract of real schema migrations.
 */
function isMigrationApplied(domain: string, version: string): boolean {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT 1 FROM atlas_schema_migrations
       WHERE domain = ? AND version = ? AND status = 'success'
       LIMIT 1`,
    )
    .get(domain, version) as { 1?: number } | undefined;
  return row !== undefined;
}

/* ───────── Public API ───────── */

/**
 * Run migrations for the given domains in topological (dependency) order.
 * On failure: records checkpoint, marks the failed migration, and stops.
 */
export async function runMigrations(chains: MigrationChain[]): Promise<MigrationReport> {
  // Filter to only chains whose domain is requested
  const sorted = topoSort(chains);

  const ran: string[] = [];
  let checkpointId: string | undefined;

  for (const chain of sorted) {
    // Idempotency gate: if this (domain, version) has already run to success,
    // skip it entirely — don't acquire a lock, don't invoke up(), don't log
    // another lifecycle entry. The runner is called on every boot so this
    // gate is what makes boot-time wiring safe.
    if (isMigrationApplied(chain.domain, chain.version)) {
      continue;
    }

    let lock: LockHandle | undefined;

    try {
      lock = await acquireLock(chain.domain);
    } catch (lockErr) {
      const errMsg = lockErr instanceof Error ? lockErr.message : String(lockErr);
      return {
        ran,
        failed: chain.domain,
        error: `Lock acquisition failed: ${errMsg}`,
        checkpointAt: checkpointId,
      };
    }

    const startedAt = nowIso();

    await logMigration({
      domain: chain.domain,
      version: chain.version,
      status: 'running',
      startedAt,
    });

    try {
      await chain.up();

      const completedAt = nowIso();
      checkpointId = randomUUID();

      await logMigration({
        domain: chain.domain,
        version: chain.version,
        status: 'success',
        startedAt,
        completedAt,
        checkpointId,
      });

      ran.push(`${chain.domain}@${chain.version}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const failedCheckpoint = randomUUID();

      // Record failure in the migrations table
      const db = getDb();
      db.prepare(
        `INSERT INTO atlas_schema_migrations
           (id, domain, version, status, started_at, completed_at, error, checkpoint_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        randomUUID(),
        chain.domain,
        chain.version,
        'failed',
        startedAt,
        nowIso(),
        errorMsg,
        failedCheckpoint,
      );

      await releaseLock(lock);

      return {
        ran,
        failed: chain.domain,
        error: errorMsg,
        checkpointAt: checkpointId,
      };
    }

    await releaseLock(lock);
  }

  return { ran, checkpointAt: checkpointId };
}

/**
 * Read migration status from the `atlas_schema_migrations` table.
 */
export async function getMigrationStatus(): Promise<MigrationStatus[]> {
  const db = getDb();

  const rows = db.prepare(
    `SELECT id, domain, version, status, started_at, completed_at, error, checkpoint_id
     FROM atlas_schema_migrations
     WHERE status != 'lock' AND status != 'canary'
     ORDER BY started_at DESC`
  ).all() as Array<{
    id: string;
    domain: string;
    version: string;
    status: string;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
    checkpoint_id: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    domain: r.domain,
    version: r.version,
    status: r.status,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    error: r.error,
    checkpointId: r.checkpoint_id,
  }));
}
