/**
 * migrate-p4-a4-srg — one-shot backfill of SQLite `srg_decisions` rows into
 * the canonical Postgres `decisions` table.
 *
 * Mapping rules (see /home/user/workspace/p4r_A4_srg_objective.md):
 *   - id                    → deterministicUuid('srg_decisions', sqliteId)
 *   - user_id               → cast to uuid (no transform; app already uses uuids)
 *   - title, rationale      → passthrough
 *   - status                → decision_metadata.srg_status
 *   - linked_truth_ids_json → decision_metadata.linked_truth_ids (parsed)
 *   - created_at            → created_at (and decided_at)
 *   - updated_at            → decision_metadata.updated_at
 *   - description           → null
 *   - options               → []
 *   - chosen_option         → null
 *   - reversibility         → 'reversible'
 *   - decision_metadata.source = 'srg' (marker for downstream filtering)
 *
 * Idempotency: writes via Supabase REST with
 *   Prefer: resolution=ignore-duplicates
 * so re-runs are safe.
 *
 * Usage:
 *   npx tsx atlas-backend/scripts/migrate-p4-a4-srg.ts \
 *       [--dry-run] [--batch-size=500] [--user-id=<uuid>]
 */
import fs from 'node:fs';
import path from 'node:path';

import { initSqlite } from '../src/db/sqlite.js';
import { supabaseRest } from '../src/db/supabase.js';
import { deterministicUuid } from '../src/utils/uuidMapping.js';

interface SqliteSrgRow {
  id: string;
  user_id: string;
  title: string;
  rationale: string;
  status: string;
  linked_truth_ids_json: string;
  created_at: string;
  updated_at: string;
}

interface DecisionInsertRow {
  id: string;
  user_id: string;
  title: string;
  description: null;
  rationale: string;
  options: unknown[];
  chosen_option: null;
  reversibility: 'reversible';
  decision_metadata: Record<string, unknown>;
  decided_at: string;
  created_at: string;
}

interface CliFlags {
  dryRun: boolean;
  batchSize: number;
  userId: string | null;
}

interface RunSummary {
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  userFilter: string | null;
  batchSize: number;
  totalRows: number;
  insertedBatches: number;
  failedBatches: number;
  rowsAttempted: number;
  rowsSkippedParseError: number;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { dryRun: false, batchSize: 500, userId: null };
  for (const arg of argv) {
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg.startsWith('--batch-size=')) {
      const n = Number(arg.slice('--batch-size='.length));
      if (Number.isFinite(n) && n > 0) flags.batchSize = Math.floor(n);
    } else if (arg.startsWith('--user-id=')) {
      flags.userId = arg.slice('--user-id='.length) || null;
    }
  }
  return flags;
}

function parseLinkedTruthIds(raw: string): string[] {
  if (!raw || raw.trim() === '') return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
    return [];
  } catch {
    return [];
  }
}

function mapRow(row: SqliteSrgRow): DecisionInsertRow {
  return {
    id: deterministicUuid('srg_decisions', row.id),
    user_id: row.user_id,
    title: row.title,
    description: null,
    rationale: row.rationale,
    options: [],
    chosen_option: null,
    reversibility: 'reversible',
    decision_metadata: {
      source: 'srg',
      srg_status: row.status,
      linked_truth_ids: parseLinkedTruthIds(row.linked_truth_ids_json),
      updated_at: row.updated_at,
      sqlite_id: row.id,
    },
    decided_at: row.created_at,
    created_at: row.created_at,
  };
}

async function writeBatch(rows: DecisionInsertRow[]): Promise<boolean> {
  if (rows.length === 0) return true;
  const res = await supabaseRest<unknown>('POST', 'decisions', rows, {
    Prefer: 'resolution=ignore-duplicates,return=minimal',
  });
  return res.ok;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const startedAt = new Date().toISOString();

  process.stderr.write(
    `[p4-a4] starting backfill dryRun=${flags.dryRun} batchSize=${flags.batchSize}` +
      (flags.userId ? ` user=${flags.userId}` : '') +
      `\n`,
  );

  const db = initSqlite();
  const whereUser = flags.userId ? 'WHERE user_id = ?' : '';
  const params: string[] = flags.userId ? [flags.userId] : [];
  const rows = db
    .prepare(
      `SELECT id, user_id, title, rationale, status, linked_truth_ids_json, created_at, updated_at
         FROM srg_decisions
         ${whereUser}
         ORDER BY created_at ASC`,
    )
    .all(...params) as SqliteSrgRow[];

  const summary: RunSummary = {
    startedAt,
    finishedAt: '',
    dryRun: flags.dryRun,
    userFilter: flags.userId,
    batchSize: flags.batchSize,
    totalRows: rows.length,
    insertedBatches: 0,
    failedBatches: 0,
    rowsAttempted: 0,
    rowsSkippedParseError: 0,
  };

  process.stderr.write(`[p4-a4] selected ${rows.length} rows\n`);

  for (let i = 0; i < rows.length; i += flags.batchSize) {
    const batchSqlite = rows.slice(i, i + flags.batchSize);
    const batch: DecisionInsertRow[] = [];
    for (const r of batchSqlite) {
      try {
        batch.push(mapRow(r));
      } catch (err) {
        summary.rowsSkippedParseError += 1;
        process.stderr.write(`[p4-a4] skip id=${r.id} err=${(err as Error).message}\n`);
      }
    }
    summary.rowsAttempted += batch.length;

    if (flags.dryRun) {
      process.stderr.write(
        `[p4-a4] dry-run batch ${i / flags.batchSize + 1} rows=${batch.length}\n`,
      );
      summary.insertedBatches += 1;
      continue;
    }

    const ok = await writeBatch(batch);
    if (ok) {
      summary.insertedBatches += 1;
      process.stderr.write(
        `[p4-a4] wrote batch ${i / flags.batchSize + 1} rows=${batch.length}\n`,
      );
    } else {
      summary.failedBatches += 1;
      process.stderr.write(
        `[p4-a4] FAILED batch ${i / flags.batchSize + 1} rows=${batch.length}\n`,
      );
    }
  }

  summary.finishedAt = new Date().toISOString();

  const logDir = path.resolve(process.cwd(), 'atlas-backend/migration-logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `p4-a4-${startedAt.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(logPath, JSON.stringify(summary, null, 2));
  process.stderr.write(`[p4-a4] summary -> ${logPath}\n`);

  if (summary.failedBatches > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[p4-a4] fatal:', err);
  process.exit(1);
});
