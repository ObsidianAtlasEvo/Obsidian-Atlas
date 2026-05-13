#!/usr/bin/env tsx
/**
 * P4-A2 backfill: SQLite `truth_entries` → Postgres `truth_claims` (mig 011).
 *
 * Usage:
 *   tsx scripts/migrate-p4-a2-truth.ts [--dry-run] [--batch=500] [--user=<id>]
 *
 * The script reads from SQLite via the same `getDb()` helper services use,
 * maps each row through `mapSqliteToTruthClaim` (deterministic UUID v5),
 * and POSTs batches to the Supabase REST endpoint with
 * `Prefer: resolution=merge-duplicates` so re-runs are idempotent.
 *
 * Emits a JSON summary to stdout when finished:
 *   { mode, total, inserted, skipped, failed, durationMs }
 */
import { getDb } from '../src/db/sqlite.js';
import { supabaseRest } from '../src/db/supabase.js';
import {
  mapSqliteToTruthClaim,
  type SqliteTruthEntryRow,
} from '../src/services/governance/truthLedgerService.js';

interface CliOptions {
  dryRun: boolean;
  batchSize: number;
  userId?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { dryRun: false, batchSize: 500 };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--batch=')) {
      const n = Number(arg.slice('--batch='.length));
      if (Number.isFinite(n) && n > 0) opts.batchSize = Math.floor(n);
    } else if (arg.startsWith('--user=')) {
      opts.userId = arg.slice('--user='.length);
    }
  }
  return opts;
}

function fetchSqliteRows(userId?: string): SqliteTruthEntryRow[] {
  const db = getDb();
  if (userId) {
    return db
      .prepare(`SELECT * FROM truth_entries WHERE user_id = ? ORDER BY created_at ASC`)
      .all(userId) as SqliteTruthEntryRow[];
  }
  return db
    .prepare(`SELECT * FROM truth_entries ORDER BY user_id ASC, created_at ASC`)
    .all() as SqliteTruthEntryRow[];
}

async function postBatch(rows: SqliteTruthEntryRow[]): Promise<{ ok: boolean; status?: number }> {
  const payload = rows.map(mapSqliteToTruthClaim);
  return supabaseRest('POST', 'truth_claims', payload, {
    Prefer: 'resolution=merge-duplicates,return=minimal',
  });
}

interface Summary {
  mode: 'dry-run' | 'apply';
  total: number;
  inserted: number;
  skipped: number;
  failed: number;
  durationMs: number;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const started = Date.now();

  const rows = fetchSqliteRows(opts.userId);
  const summary: Summary = {
    mode: opts.dryRun ? 'dry-run' : 'apply',
    total: rows.length,
    inserted: 0,
    skipped: 0,
    failed: 0,
    durationMs: 0,
  };

  if (opts.dryRun) {
    for (const row of rows) {
      try {
        mapSqliteToTruthClaim(row);
        summary.skipped += 1;
      } catch {
        summary.failed += 1;
      }
    }
  } else {
    for (let i = 0; i < rows.length; i += opts.batchSize) {
      const batch = rows.slice(i, i + opts.batchSize);
      try {
        const res = await postBatch(batch);
        if (res.ok) summary.inserted += batch.length;
        else summary.failed += batch.length;
      } catch {
        summary.failed += batch.length;
      }
    }
  }

  summary.durationMs = Date.now() - started;
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((err) => {
  console.error('[migrate-p4-a2-truth] fatal:', err);
  process.exit(1);
});
