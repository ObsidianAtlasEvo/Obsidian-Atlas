/**
 * migrate-p4-b2-unfinished — one-shot backfill of SQLite
 * `unfinished_business_items` into the new Postgres `unfinished_business`
 * table (migration 024).
 *
 * Usage:
 *   tsx scripts/migrate-p4-b2-unfinished.ts [--dry-run] [--batch=500]
 *
 * Emits a JSON summary on stdout. Idempotent via
 * `Prefer: resolution=merge-duplicates` on the deterministic primary key,
 * so reruns are safe.
 */
import { getDb } from '../src/db/sqlite.js';
import { supabaseRest } from '../src/db/supabase.js';
import {
  sqliteRowToPostgres,
  type PostgresUnfinishedRow,
} from '../src/services/governance/unfinishedBusinessMapping.js';
import type { UnfinishedRow } from '../src/services/governance/unfinishedBusinessService.js';

interface Summary {
  scanned: number;
  written: number;
  errors: number;
  dry_run: boolean;
  batch_size: number;
  duration_ms: number;
}

function parseArgs(argv: string[]): { dryRun: boolean; batchSize: number } {
  let dryRun = false;
  let batchSize = 500;
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') dryRun = true;
    else if (a.startsWith('--batch=')) {
      const n = Number(a.split('=')[1]);
      if (Number.isFinite(n) && n > 0) batchSize = Math.floor(n);
    }
  }
  return { dryRun, batchSize };
}

async function main(): Promise<void> {
  const { dryRun, batchSize } = parseArgs(process.argv);
  const t0 = Date.now();
  const db = getDb();

  const rows = db
    .prepare(`SELECT * FROM unfinished_business_items ORDER BY created_at ASC`)
    .all() as UnfinishedRow[];

  const summary: Summary = {
    scanned: rows.length,
    written: 0,
    errors: 0,
    dry_run: dryRun,
    batch_size: batchSize,
    duration_ms: 0,
  };

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch: PostgresUnfinishedRow[] = rows
      .slice(i, i + batchSize)
      .map((r) => sqliteRowToPostgres(r));
    if (dryRun) {
      summary.written += batch.length;
      continue;
    }
    const res = await supabaseRest('POST', 'unfinished_business', batch, {
      Prefer: 'return=minimal,resolution=merge-duplicates',
    });
    if (!res.ok) {
      summary.errors += batch.length;
      console.error(
        `[migrate-p4-b2] batch ${Math.floor(i / batchSize)} failed (status ${res.status ?? 'n/a'})`,
      );
      continue;
    }
    summary.written += batch.length;
  }

  summary.duration_ms = Date.now() - t0;
  console.log(JSON.stringify(summary, null, 2));
  if (summary.errors > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[migrate-p4-b2] fatal:', err);
  process.exit(1);
});
