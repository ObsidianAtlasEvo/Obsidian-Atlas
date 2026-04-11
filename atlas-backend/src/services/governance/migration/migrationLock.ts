/**
 * Migration Lock — advisory locking mechanism that prevents concurrent
 * migrations on the same domain. Lock records live in `atlas_schema_migrations`
 * with a 10-minute auto-expiry.
 */

import { randomUUID } from 'node:crypto';
import { getDb } from '../../../db/sqlite.js';

/* ───────── Types ───────── */

export interface LockHandle {
  lockId: string;
  domain: string;
  acquiredAt: Date;
  expiresAt: Date;
}

/* ───────── Constants ───────── */

const LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes

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

/* ───────── Helpers ───────── */

function nowIso(): string {
  return new Date().toISOString();
}

/* ───────── Public API ───────── */

/**
 * Acquire an advisory lock for a migration domain.
 * Throws if the domain is already locked by a non-expired lock.
 */
export async function acquireLock(domain: string): Promise<LockHandle> {
  ensureTable();

  if (await isLocked(domain)) {
    throw new Error(`Migration lock already held for domain "${domain}"`);
  }

  const db = getDb();
  const lockId = randomUUID();
  const acquiredAt = new Date();
  const expiresAt = new Date(acquiredAt.getTime() + LOCK_TTL_MS);

  db.prepare(
    `INSERT INTO atlas_schema_migrations
       (id, domain, version, status, lock_id, lock_acquired_at, lock_expires_at, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    domain,
    '__lock__',
    'lock',
    lockId,
    acquiredAt.toISOString(),
    expiresAt.toISOString(),
    nowIso(),
  );

  return { lockId, domain, acquiredAt, expiresAt };
}

/**
 * Release a previously acquired lock.
 */
export async function releaseLock(handle: LockHandle): Promise<void> {
  ensureTable();
  const db = getDb();
  db.prepare(
    `DELETE FROM atlas_schema_migrations WHERE lock_id = ? AND domain = ?`
  ).run(handle.lockId, handle.domain);
}

/**
 * Check whether a domain is currently locked (non-expired).
 */
export async function isLocked(domain: string): Promise<boolean> {
  ensureTable();
  const db = getDb();
  const now = new Date().toISOString();

  const row = db.prepare(
    `SELECT lock_id FROM atlas_schema_migrations
     WHERE domain = ? AND status = 'lock' AND lock_expires_at > ?
     LIMIT 1`
  ).get(domain, now) as { lock_id: string } | undefined;

  return row !== undefined;
}
