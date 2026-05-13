/**
 * truthLedgerService — gated reads/writes for the legacy SQLite `truth_entries`
 * table, routed to the canonical Postgres `truth_claims` table during the
 * P4-A2 cutover.
 *
 * The original P4 plan proposed creating a new Postgres `truth_entries`
 * table. The reconciliation report flagged this as a duplicate of
 * `truth_claims` from migration 011 (which is the operative schema; the
 * later `CREATE TABLE IF NOT EXISTS truth_claims` in mig 019 is a no-op
 * against the existing table). This service maps SQLite rows into the
 * mig 011 schema instead.
 *
 * Three store modes (sqlite | dual | supabase) gate behavior via
 * `storeFlags.truth()`:
 *   - sqlite   — read & write SQLite only (default; matches legacy behavior).
 *   - dual     — SQLite primary; secondary Postgres write is best-effort
 *                (`dualWrite`); reads fire a shadow compare against Postgres
 *                without blocking the caller.
 *   - supabase — Postgres only. Sync wrappers throw so callers must migrate
 *                to the async API before promoting the flag.
 */
import { randomUUID } from 'node:crypto';

import { getDb } from '../../db/sqlite.js';
import { supabaseRest } from '../../db/supabase.js';
import { dualWrite } from '../../utils/dualWriteWrapper.js';
import { shadowCompare } from '../../utils/shadowReadParity.js';
import {
  shouldReadSupabase,
  shouldWriteSqlite,
  shouldWriteSupabase,
  storeFlags,
} from '../../utils/storeFlags.js';
import { deterministicUuid } from '../../utils/uuidMapping.js';

export interface TruthEntrySummary {
  statement: string;
  status: string;
  confidence: number;
}

const ALLOWED_STATUS = new Set([
  'proposed',
  'supported',
  'contested',
  'stale',
  'retired',
]);

export function normalizeStatus(raw: string | null | undefined): string {
  if (!raw) return 'proposed';
  return ALLOWED_STATUS.has(raw) ? raw : 'proposed';
}

export function clampConfidence(raw: number | null | undefined): number {
  if (typeof raw !== 'number' || Number.isNaN(raw)) return 0.5;
  return Math.max(0, Math.min(1, raw));
}

function parseEvidence(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Full shape of a SQLite `truth_entries` row, used by the backfill script. */
export interface SqliteTruthEntryRow {
  id: string;
  user_id: string;
  statement: string;
  status: string;
  confidence: number;
  evidence_json: string;
  superseded_by_id: string | null;
  constitution_ref: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Map a SQLite `truth_entries` row to the Postgres `truth_claims` insert
 * payload, applying the column transforms from the A2 objective.
 *
 * `superseded_by_id` and `constitution_ref` are stashed under
 * `claim_metadata` because mig 011 `truth_claims` has no dedicated
 * columns for them.
 */
export function mapSqliteToTruthClaim(row: SqliteTruthEntryRow): Record<string, unknown> {
  const evidence = parseEvidence(row.evidence_json);
  const metadata: Record<string, unknown> = {};
  if (evidence !== null) metadata.evidence = evidence;
  if (row.superseded_by_id) {
    metadata.superseded_by_id = deterministicUuid('truth_entries', row.superseded_by_id);
  }
  if (row.constitution_ref) metadata.constitution_ref = row.constitution_ref;

  return {
    id: deterministicUuid('truth_entries', row.id),
    user_id: row.user_id,
    claim_text: row.statement,
    status: normalizeStatus(row.status),
    confidence_score: clampConfidence(row.confidence),
    evidence_score: 0,
    claim_type: null,
    domain: null,
    claim_metadata: metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function readSqliteRecent(userId: string, limit: number): TruthEntrySummary[] {
  try {
    const db = getDb();
    return db
      .prepare(
        `SELECT statement, status, confidence FROM truth_entries
         WHERE user_id = ? AND status != 'superseded'
         ORDER BY confidence DESC, updated_at DESC
         LIMIT ?`,
      )
      .all(userId, limit) as TruthEntrySummary[];
  } catch {
    return [];
  }
}

async function readSupabaseRecent(
  userId: string,
  limit: number,
): Promise<TruthEntrySummary[]> {
  const path =
    `truth_claims?user_id=eq.${encodeURIComponent(userId)}` +
    `&status=neq.retired` +
    `&select=claim_text,status,confidence_score` +
    `&order=confidence_score.desc,updated_at.desc` +
    `&limit=${limit}`;
  const res = await supabaseRest<
    Array<{ claim_text: string; status: string; confidence_score: number | string }>
  >('GET', path);
  if (!res.ok || !res.data) return [];
  return res.data.map((r) => ({
    statement: r.claim_text,
    status: r.status,
    confidence:
      typeof r.confidence_score === 'string' ? Number(r.confidence_score) : r.confidence_score,
  }));
}

function equalsByStatement(a: TruthEntrySummary[], b: TruthEntrySummary[]): boolean {
  return a.length === b.length && a.every((row, i) => row.statement === b[i]?.statement);
}

/**
 * Sync read of truth entries for legacy prompt-assembly paths. Works for
 * `sqlite` and `dual` modes; throws in `supabase` mode so callers must
 * migrate to {@link listTruthEntriesAsync} before promoting the flag.
 */
export function listTruthEntriesSync(userId: string, limit = 16): TruthEntrySummary[] {
  const mode = storeFlags.truth();
  if (shouldReadSupabase(mode)) {
    throw new Error(
      'truthLedgerService: TRUTH_STORE=supabase requires the async API (listTruthEntriesAsync)',
    );
  }
  const primary = readSqliteRecent(userId, limit);
  if (mode === 'dual') {
    void shadowCompare(primary, () => readSupabaseRecent(userId, limit), {
      table: 'truth_entries',
      key: `recent:${userId}:${limit}`,
      equals: equalsByStatement,
    });
  }
  return primary;
}

/** Async, three-mode aware variant of {@link listTruthEntriesSync}. */
export async function listTruthEntriesAsync(
  userId: string,
  limit = 16,
): Promise<TruthEntrySummary[]> {
  const mode = storeFlags.truth();
  if (shouldReadSupabase(mode)) {
    return readSupabaseRecent(userId, limit);
  }
  const primary = readSqliteRecent(userId, limit);
  if (mode === 'dual') {
    void shadowCompare(primary, () => readSupabaseRecent(userId, limit), {
      table: 'truth_entries',
      key: `recent:${userId}:${limit}`,
      equals: equalsByStatement,
    });
  }
  return primary;
}

export interface CreateTruthEntryInput {
  userId: string;
  statement: string;
  status?: string;
  confidence?: number;
  evidence?: unknown;
  constitutionRef?: string | null;
  supersededById?: string | null;
}

export interface CreateTruthEntryResult {
  id: string;
  created_at: string;
  updated_at: string;
}

function insertSqlite(input: CreateTruthEntryInput): {
  result: CreateTruthEntryResult;
  row: SqliteTruthEntryRow;
} {
  const id = randomUUID();
  const ts = new Date().toISOString();
  const row: SqliteTruthEntryRow = {
    id,
    user_id: input.userId,
    statement: input.statement,
    status: normalizeStatus(input.status),
    confidence: clampConfidence(input.confidence ?? 0.5),
    evidence_json: JSON.stringify(input.evidence ?? null),
    superseded_by_id: input.supersededById ?? null,
    constitution_ref: input.constitutionRef ?? null,
    created_at: ts,
    updated_at: ts,
  };
  const db = getDb();
  db.prepare(
    `INSERT INTO truth_entries
       (id, user_id, statement, status, confidence, evidence_json,
        superseded_by_id, constitution_ref, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.user_id,
    row.statement,
    row.status,
    row.confidence,
    row.evidence_json,
    row.superseded_by_id,
    row.constitution_ref,
    row.created_at,
    row.updated_at,
  );
  return { result: { id, created_at: ts, updated_at: ts }, row };
}

async function insertSupabase(row: SqliteTruthEntryRow): Promise<void> {
  await supabaseRest('POST', 'truth_claims', [mapSqliteToTruthClaim(row)], {
    Prefer: 'resolution=merge-duplicates',
  });
}

/**
 * Create a truth entry honoring the three-mode contract.
 *   - sqlite   → SQLite only.
 *   - dual     → SQLite primary, Postgres best-effort secondary via dualWrite.
 *   - supabase → Postgres only; SQLite is skipped.
 */
export async function createTruthEntry(
  input: CreateTruthEntryInput,
): Promise<CreateTruthEntryResult> {
  const mode = storeFlags.truth();

  if (!shouldWriteSqlite(mode)) {
    const ts = new Date().toISOString();
    const row: SqliteTruthEntryRow = {
      id: randomUUID(),
      user_id: input.userId,
      statement: input.statement,
      status: normalizeStatus(input.status),
      confidence: clampConfidence(input.confidence ?? 0.5),
      evidence_json: JSON.stringify(input.evidence ?? null),
      superseded_by_id: input.supersededById ?? null,
      constitution_ref: input.constitutionRef ?? null,
      created_at: ts,
      updated_at: ts,
    };
    await insertSupabase(row);
    return { id: row.id, created_at: ts, updated_at: ts };
  }

  let inserted: { result: CreateTruthEntryResult; row: SqliteTruthEntryRow } | null = null;
  return dualWrite(
    () => {
      inserted = insertSqlite(input);
      return inserted.result;
    },
    shouldWriteSupabase(mode)
      ? async () => {
          if (inserted) await insertSupabase(inserted.row);
        }
      : null,
    { table: 'truth_entries', mode },
  );
}
