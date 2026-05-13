/**
 * migrate-p4-a1-memories.ts — Backfill SQLite `memories` → canonical
 * Postgres `user_memories` (migration 004_memory_layer.sql).
 *
 * Run-time contract:
 *   tsx atlas-backend/scripts/migrate-p4-a1-memories.ts \
 *     [--dry-run] [--batch-size=500] [--user-id=<filter>]
 *
 * Behavior:
 *   * Skips rows where `archived_at IS NOT NULL`.
 *   * UUID-maps each TEXT id via `deterministicUuid('memories', id)`.
 *   * source_trace_id → source_turn_id via `deterministicUuid('traces', id)`.
 *   * Idempotent: relies on the Postgres PRIMARY KEY for natural dedupe and
 *     sends `Prefer: resolution=merge-duplicates` on each POST.
 *   * Second pass mirrors SQLite's `replaces_memory_id` onto Postgres'
 *     reverse-direction `superseded_by`.
 *   * Per-batch counts go to stderr; a summary JSON is written to
 *     atlas-backend/migration-logs/p4-a1-<timestamp>.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../src/db/sqlite.js';
import { supabaseRest } from '../src/db/supabase.js';
import { deterministicUuid } from '../src/utils/uuidMapping.js';
import {
  toUserMemoryRow,
  type UserMemoryRow,
} from '../src/services/memory/userMemoriesSupabase.js';

interface CliOptions {
  dryRun: boolean;
  batchSize: number;
  userId: string | null;
}

interface Summary {
  table: string;
  dry_run: boolean;
  user_id_filter: string | null;
  rows_scanned: number;
  rows_skipped_archived: number;
  rows_sent: number;
  rows_failed: number;
  batches: number;
  supersede_attempts: number;
  supersede_failures: number;
  started_at: string;
  finished_at: string;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { dryRun: false, batchSize: 500, userId: null };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--batch-size=')) {
      const n = Number.parseInt(arg.slice('--batch-size='.length), 10);
      if (Number.isFinite(n) && n > 0) opts.batchSize = n;
    } else if (arg.startsWith('--user-id=')) {
      const v = arg.slice('--user-id='.length).trim();
      opts.userId = v.length > 0 ? v : null;
    }
  }
  return opts;
}

interface SqliteMemoryRow {
  id: string;
  user_id: string;
  kind: string;
  summary: string;
  detail: string;
  confidence: number;
  source_trace_id: string;
  tags: string;
  created_at: string;
  updated_at: string;
  origin: string | null;
  archived_at: string | null;
  replaces_memory_id: string | null;
}

async function postBatch(rows: UserMemoryRow[]): Promise<boolean> {
  const res = await supabaseRest('POST', 'user_memories?on_conflict=id', rows, {
    Prefer: 'return=minimal,resolution=merge-duplicates',
  });
  return res.ok;
}

async function patchSupersede(replacedSqliteId: string, replacementSqliteId: string): Promise<boolean> {
  const replacedUuid = deterministicUuid('memories', replacedSqliteId);
  const replacementUuid = deterministicUuid('memories', replacementSqliteId);
  const res = await supabaseRest(
    'PATCH',
    `user_memories?id=eq.${replacedUuid}`,
    { superseded_by: replacementUuid },
    { Prefer: 'return=minimal' },
  );
  return res.ok;
}

async function run(): Promise<Summary> {
  const opts = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const db = getDb();

  const whereUser = opts.userId ? 'AND user_id = ?' : '';
  const params: unknown[] = opts.userId ? [opts.userId] : [];

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM memories WHERE 1=1 ${whereUser}`)
    .get(...params) as { n: number };
  const total = totalRow?.n ?? 0;

  process.stderr.write(
    `[p4-a1] scanning ${total} memories rows${opts.userId ? ` for user=${opts.userId}` : ''}${
      opts.dryRun ? ' (dry-run)' : ''
    }\n`,
  );

  const summary: Summary = {
    table: 'memories→user_memories',
    dry_run: opts.dryRun,
    user_id_filter: opts.userId,
    rows_scanned: 0,
    rows_skipped_archived: 0,
    rows_sent: 0,
    rows_failed: 0,
    batches: 0,
    supersede_attempts: 0,
    supersede_failures: 0,
    started_at: startedAt,
    finished_at: '',
  };

  const supersedeQueue: Array<{ replaced: string; replacement: string }> = [];

  let offset = 0;
  while (offset < total) {
    const batch = db
      .prepare(
        `SELECT id, user_id, kind, summary, detail, confidence,
                source_trace_id, tags, created_at, updated_at,
                origin, archived_at, replaces_memory_id
           FROM memories
          WHERE 1=1 ${whereUser}
          ORDER BY created_at ASC, id ASC
          LIMIT ? OFFSET ?`,
      )
      .all(...params, opts.batchSize, offset) as SqliteMemoryRow[];

    if (batch.length === 0) break;

    const rows: UserMemoryRow[] = [];
    for (const r of batch) {
      summary.rows_scanned += 1;
      if (r.archived_at !== null && r.archived_at !== '') {
        summary.rows_skipped_archived += 1;
        continue;
      }
      rows.push(
        toUserMemoryRow({
          sqliteId: r.id,
          userId: r.user_id,
          kind: r.kind,
          summary: r.summary,
          detail: r.detail,
          confidence: r.confidence,
          sourceTraceId: r.source_trace_id,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }),
      );
      if (r.replaces_memory_id) {
        supersedeQueue.push({ replaced: r.replaces_memory_id, replacement: r.id });
      }
    }

    summary.batches += 1;
    if (rows.length > 0) {
      if (opts.dryRun) {
        summary.rows_sent += rows.length;
      } else {
        const ok = await postBatch(rows);
        if (ok) summary.rows_sent += rows.length;
        else summary.rows_failed += rows.length;
      }
    }

    process.stderr.write(
      `[p4-a1] batch=${summary.batches} sent=${summary.rows_sent} failed=${summary.rows_failed} skipped=${summary.rows_skipped_archived}\n`,
    );

    offset += batch.length;
  }

  for (const sup of supersedeQueue) {
    summary.supersede_attempts += 1;
    if (opts.dryRun) continue;
    const ok = await patchSupersede(sup.replaced, sup.replacement);
    if (!ok) summary.supersede_failures += 1;
  }
  process.stderr.write(
    `[p4-a1] supersede attempts=${summary.supersede_attempts} failures=${summary.supersede_failures}\n`,
  );

  summary.finished_at = new Date().toISOString();
  return summary;
}

run()
  .then((summary) => {
    const logsDir = path.resolve(process.cwd(), 'atlas-backend/migration-logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const stamp = summary.started_at.replace(/[:.]/g, '-');
    const outPath = path.join(logsDir, `p4-a1-${stamp}.json`);
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
    process.stderr.write(`[p4-a1] wrote summary → ${outPath}\n`);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    process.exit(summary.rows_failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('[p4-a1] fatal:', err instanceof Error ? err.stack : err);
    process.exit(2);
  });
