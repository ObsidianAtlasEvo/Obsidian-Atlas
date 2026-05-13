/**
 * migrate-p4-b0-semantic.ts — Backfill SQLite `semantic_claims` to Postgres.
 *
 * Stage B0 of the P4 SQLite→Postgres migration. The Postgres table was
 * introduced by `atlas-backend/migrations/026_semantic_claims_postgres.sql`.
 *
 * Run-time contract:
 *   tsx atlas-backend/scripts/migrate-p4-b0-semantic.ts [--dry-run] [--batch=N]
 *
 *   --dry-run   No inserts; only count + sample mapping output.
 *   --batch=N   Rows per Supabase POST batch (default 500).
 *
 * Behavior:
 *   * Skips entirely if SQLite has zero rows (semantic consolidation only
 *     landed in PR #163; production may not have any rows yet).
 *   * UUID-maps each TEXT id via `deterministicUuid('semantic_claims', id)`.
 *   * Memory IDs inside `evidence_memory_ids` are remapped via
 *     `deterministicUuid('memories', id)` so they continue to reference
 *     the (Stage A1-migrated) `user_memories` rows.
 *   * Idempotent: relies on the Postgres PRIMARY KEY for natural dedupe;
 *     `Prefer: resolution=merge-duplicates` is sent on each POST.
 *   * Emits a summary JSON object to stdout on completion.
 *
 * Pure mapping / arg-parsing helpers live in
 * `atlas-backend/src/utils/semanticBackfillMapping.ts` so they are covered
 * by unit tests.
 */
import { getDb } from '../src/db/sqlite.js';
import { supabaseRest } from '../src/db/supabase.js';
import {
  mapSemanticClaimRow,
  parseBackfillArgs,
  type PostgresSemanticClaimRow,
  type SqliteSemanticClaimRow,
} from '../src/utils/semanticBackfillMapping.js';

interface Summary {
  table: string;
  dry_run: boolean;
  rows_read: number;
  rows_sent: number;
  rows_failed: number;
  batches: number;
  started_at: string;
  finished_at: string;
}

async function postBatch(rows: PostgresSemanticClaimRow[]): Promise<boolean> {
  const res = await supabaseRest('POST', 'semantic_claims', rows, {
    Prefer: 'return=minimal,resolution=merge-duplicates',
  });
  return res.ok;
}

async function run(): Promise<Summary> {
  const opts = parseBackfillArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();

  const db = getDb();
  const total = (
    db.prepare('SELECT COUNT(*) AS n FROM semantic_claims').get() as { n: number }
  ).n;

  if (total === 0) {
    return {
      table: 'semantic_claims',
      dry_run: opts.dryRun,
      rows_read: 0,
      rows_sent: 0,
      rows_failed: 0,
      batches: 0,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    };
  }

  let rowsRead = 0;
  let rowsSent = 0;
  let rowsFailed = 0;
  let batches = 0;
  let offset = 0;
  const select = db.prepare(
    `SELECT id, user_id, claim, domain, confidence, evidence_memory_ids,
            evidence_count, times_surfaced, last_surfaced_at, invalidated_at,
            created_at, updated_at
     FROM semantic_claims
     ORDER BY created_at ASC
     LIMIT ? OFFSET ?`,
  );

  while (offset < total) {
    const sqliteRows = select.all(opts.batchSize, offset) as SqliteSemanticClaimRow[];
    if (sqliteRows.length === 0) break;
    rowsRead += sqliteRows.length;
    offset += sqliteRows.length;

    const pgRows = sqliteRows.map(mapSemanticClaimRow);
    batches += 1;

    if (opts.dryRun) {
      if (batches === 1) {
        console.log('[dry-run] sample mapped row:', JSON.stringify(pgRows[0], null, 2));
      }
      rowsSent += pgRows.length;
      continue;
    }

    const ok = await postBatch(pgRows);
    if (ok) rowsSent += pgRows.length;
    else rowsFailed += pgRows.length;
  }

  return {
    table: 'semantic_claims',
    dry_run: opts.dryRun,
    rows_read: rowsRead,
    rows_sent: rowsSent,
    rows_failed: rowsFailed,
    batches,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  };
}

run()
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.rows_failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('[migrate-p4-b0-semantic] fatal:', err);
    process.exit(2);
  });
