/**
 * migrate-p4-b1-doctrine — one-shot backfill of SQLite `doctrine_nodes`
 * into the new Postgres `doctrine_nodes` table (migration 023).
 *
 * Usage:
 *   tsx scripts/migrate-p4-b1-doctrine.ts [--dry-run] [--batch=500]
 *
 * Pure helpers live in src/services/governance/doctrineMigrationHelpers.ts so
 * they are typechecked and covered by unit tests; this file is the thin
 * entrypoint that wires them to better-sqlite3 and supabaseRest.
 */
import { getDb } from '../src/db/sqlite.js';
import { supabaseRest } from '../src/db/supabase.js';
import {
  topologicalSortDoctrine,
  toPostgresPayload,
  type SqliteDoctrineRow,
} from '../src/services/governance/doctrineMigrationHelpers.js';

interface Summary {
  scanned: number;
  written: number;
  skipped_cycles: number;
  errors: number;
  dry_run: boolean;
  batch_size: number;
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
  const db = getDb();

  const rows = db
    .prepare(`SELECT * FROM doctrine_nodes ORDER BY created_at ASC`)
    .all() as SqliteDoctrineRow[];

  const { ordered, cycles } = topologicalSortDoctrine(rows);

  const summary: Summary = {
    scanned: rows.length,
    written: 0,
    skipped_cycles: cycles.length,
    errors: 0,
    dry_run: dryRun,
    batch_size: batchSize,
  };

  if (cycles.length > 0) {
    console.warn(
      `[migrate-p4-b1] ${cycles.length} doctrine rows participate in cycles via supersedes_doctrine_id; skipping`,
      cycles.map((c) => c.id),
    );
  }

  for (let i = 0; i < ordered.length; i += batchSize) {
    const batch = ordered.slice(i, i + batchSize).map(toPostgresPayload);
    if (dryRun) {
      summary.written += batch.length;
      continue;
    }
    const res = await supabaseRest('POST', 'doctrine_nodes', batch, {
      Prefer: 'return=minimal,resolution=ignore-duplicates',
    });
    if (!res.ok) {
      summary.errors += batch.length;
      console.error(
        `[migrate-p4-b1] batch ${i / batchSize} failed (status ${res.status ?? 'n/a'})`,
      );
      continue;
    }
    summary.written += batch.length;
  }

  console.log(JSON.stringify(summary, null, 2));
  if (summary.errors > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[migrate-p4-b1] fatal:', err);
  process.exit(1);
});
