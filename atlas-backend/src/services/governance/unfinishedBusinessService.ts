import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
import { supabaseRest } from '../../db/supabase.js';
import type { UnfinishedKind, UnfinishedStatus } from '../../types/longitudinal.js';
import { unfinishedKindSchema, unfinishedStatusSchema } from '../../types/longitudinal.js';
import { dualWrite } from '../../utils/dualWriteWrapper.js';
import { shadowCompare } from '../../utils/shadowReadParity.js';
import {
  shouldReadSupabase,
  shouldWriteSupabase,
  storeFlags,
} from '../../utils/storeFlags.js';
import { deterministicUuid } from '../../utils/uuidMapping.js';
import { computePatternFingerprint } from './evolutionTimelineService.js';
import { recordGovernanceAudit } from './governanceAudit.js';
import {
  mapStatusToPostgres,
  postgresRowToSqlite,
  sqliteRowToPostgres,
  type PostgresUnfinishedRow,
} from './unfinishedBusinessMapping.js';

function nowIso(): string {
  return new Date().toISOString();
}

const PG_TABLE = 'unfinished_business';
const SESSION_START_LATENCY_BUDGET_MS = 250;

async function pgInsertRow(row: PostgresUnfinishedRow): Promise<void> {
  const res = await supabaseRest('POST', PG_TABLE, { ...row });
  if (!res.ok) throw new Error(`pg insert failed status=${res.status}`);
}

async function pgPatchRow(id: string, patch: Record<string, unknown>): Promise<void> {
  const res = await supabaseRest(
    'PATCH',
    `${PG_TABLE}?id=eq.${encodeURIComponent(id)}`,
    patch,
  );
  if (!res.ok) throw new Error(`pg patch failed status=${res.status}`);
}

async function pgFetchOpenRanked(userId: string, limit: number): Promise<UnfinishedRow[]> {
  const path =
    `${PG_TABLE}?select=*` +
    `&user_id=eq.${encodeURIComponent(userId)}` +
    `&status=eq.open` +
    `&order=composite_score.desc,urgency_score.desc,updated_at.desc` +
    `&limit=${limit}`;
  const res = await supabaseRest<PostgresUnfinishedRow[]>('GET', path);
  if (!res.ok || !res.data) throw new Error(`pg list failed status=${res.status}`);
  return res.data.map((r) => postgresRowToSqlite(r));
}

async function timedPgFetch(
  userId: string,
  limit: number,
): Promise<{ rows: UnfinishedRow[]; ms: number }> {
  const t0 = Date.now();
  const rows = await pgFetchOpenRanked(userId, limit);
  return { rows, ms: Date.now() - t0 };
}

export function computeUnfinishedCompositeScore(input: {
  significance: number;
  recurrence: number;
  urgency: number;
  identityRelevance: number;
}): number {
  const s = Math.max(0, Math.min(1, input.significance));
  const r = Math.max(0, Math.min(1, input.recurrence));
  const u = Math.max(0, Math.min(1, input.urgency));
  const i = Math.max(0, Math.min(1, input.identityRelevance));
  return Number((0.35 * s + 0.25 * r + 0.2 * u + 0.2 * i).toFixed(4));
}

export interface UnfinishedRow {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  description: string;
  significance_score: number;
  recurrence_score: number;
  urgency_score: number;
  identity_relevance_score: number;
  composite_score: number;
  surfaced_count: number;
  last_surfaced_at: string | null;
  status: string;
  decision_id: string | null;
  constitution_version_group_id: string | null;
  linked_claim_ids_json: string;
  pattern_fingerprint: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
}

export function createUnfinishedItem(input: {
  userId: string;
  kind: UnfinishedKind;
  title: string;
  description: string;
  significanceScore?: number;
  recurrenceScore?: number;
  urgencyScore?: number;
  identityRelevanceScore?: number;
  decisionId?: string | null;
  constitutionVersionGroupId?: string | null;
  linkedClaimIds?: string[];
  patternFingerprint?: string | null;
}): UnfinishedRow {
  unfinishedKindSchema.parse(input.kind);
  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  const sig = input.significanceScore ?? 0.5;
  const rec = input.recurrenceScore ?? 0;
  const urg = input.urgencyScore ?? 0.5;
  const idrel = input.identityRelevanceScore ?? 0.5;
  const composite = computeUnfinishedCompositeScore({
    significance: sig,
    recurrence: rec,
    urgency: urg,
    identityRelevance: idrel,
  });
  const fp = input.patternFingerprint ?? computePatternFingerprint(`${input.title}\n${input.description}`);

  db.prepare(
    `INSERT INTO unfinished_business_items (
      id, user_id, kind, title, description, significance_score, recurrence_score, urgency_score,
      identity_relevance_score, composite_score, surfaced_count, last_surfaced_at, status,
      decision_id, constitution_version_group_id, linked_claim_ids_json, pattern_fingerprint,
      created_at, updated_at, resolved_at, resolution_note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 'open', ?, ?, ?, ?, ?, ?, NULL, NULL)`
  ).run(
    id,
    input.userId,
    input.kind,
    input.title.trim(),
    input.description.trim(),
    sig,
    rec,
    urg,
    idrel,
    composite,
    input.decisionId ?? null,
    input.constitutionVersionGroupId ?? null,
    JSON.stringify(input.linkedClaimIds ?? []),
    fp,
    ts,
    ts
  );

  recordGovernanceAudit({
    userId: input.userId,
    action: 'unfinished_business_create',
    entityType: 'unfinished_business_item',
    entityId: id,
    payload: { kind: input.kind, composite },
  });

  const row = db.prepare(`SELECT * FROM unfinished_business_items WHERE id = ?`).get(id) as UnfinishedRow;

  const mode = storeFlags.unfinishedBusiness();
  if (shouldWriteSupabase(mode)) {
    const pgRow = sqliteRowToPostgres(row);
    void dualWrite(async () => undefined, () => pgInsertRow(pgRow), {
      table: PG_TABLE,
      mode,
    });
  }
  return row;
}

export function bumpRecurrence(userId: string, itemId: string, delta = 0.15): void {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM unfinished_business_items WHERE id = ? AND user_id = ?`)
    .get(itemId, userId) as UnfinishedRow | undefined;
  if (!row) throw new Error('unfinished_not_found');
  const rec = Math.min(1, row.recurrence_score + delta);
  const composite = computeUnfinishedCompositeScore({
    significance: row.significance_score,
    recurrence: rec,
    urgency: row.urgency_score,
    identityRelevance: row.identity_relevance_score,
  });
  const ts = nowIso();
  db.prepare(
    `UPDATE unfinished_business_items SET recurrence_score = ?, composite_score = ?, updated_at = ? WHERE id = ?`
  ).run(rec, composite, ts, itemId);

  const mode = storeFlags.unfinishedBusiness();
  if (shouldWriteSupabase(mode)) {
    const pgId = deterministicUuid('unfinished_business_items', itemId);
    void dualWrite(
      async () => undefined,
      () => pgPatchRow(pgId, { recurrence_score: rec, composite_score: composite, updated_at: ts }),
      { table: PG_TABLE, mode },
    );
  }
}

export function recordUnfinishedSurfaced(userId: string, itemId: string): void {
  const db = getDb();
  const ts = nowIso();
  const n = db
    .prepare(
      `UPDATE unfinished_business_items SET surfaced_count = surfaced_count + 1, last_surfaced_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`
    )
    .run(ts, ts, itemId, userId).changes;
  if (!n) throw new Error('unfinished_not_found');

  const mode = storeFlags.unfinishedBusiness();
  if (shouldWriteSupabase(mode)) {
    const pgId = deterministicUuid('unfinished_business_items', itemId);
    // PG side mirrors last_surfaced_at / updated_at; surfaced_count is recomputed
    // from SQLite on the eventual full cutover.
    void dualWrite(
      async () => undefined,
      () => pgPatchRow(pgId, { last_surfaced_at: ts, updated_at: ts }),
      { table: PG_TABLE, mode },
    );
  }
}

function listOpenUnfinishedRankedSqlite(userId: string, limit: number): UnfinishedRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM unfinished_business_items
       WHERE user_id = ? AND status = 'open'
       ORDER BY composite_score DESC, urgency_score DESC, updated_at DESC
       LIMIT ?`
    )
    .all(userId, limit) as UnfinishedRow[];
}

export function listOpenUnfinishedRanked(userId: string, limit = 30): UnfinishedRow[] {
  return listOpenUnfinishedRankedSqlite(userId, limit);
}

const READ_LATENCY: { p50: number; p95: number; samples: number[] } = {
  p50: 0,
  p95: 0,
  samples: [],
};
const LATENCY_WINDOW = 100;

function recordReadLatency(ms: number): void {
  READ_LATENCY.samples.push(ms);
  if (READ_LATENCY.samples.length > LATENCY_WINDOW) READ_LATENCY.samples.shift();
  const sorted = [...READ_LATENCY.samples].sort((a, b) => a - b);
  const p50idx = Math.floor(sorted.length * 0.5);
  const p95idx = Math.floor(sorted.length * 0.95);
  READ_LATENCY.p50 = sorted[p50idx] ?? 0;
  READ_LATENCY.p95 = sorted[p95idx] ?? sorted[sorted.length - 1] ?? 0;
}

/** Observability hook — current rolling P50/P95 of Postgres reads. */
export function getReadLatencyStats(): { p50: number; p95: number; n: number } {
  return { p50: READ_LATENCY.p50, p95: READ_LATENCY.p95, n: READ_LATENCY.samples.length };
}

/** Test/internal hook — feed synthetic latency samples (used by latency test). */
export function _recordReadLatencyForTesting(ms: number): void {
  recordReadLatency(ms);
}

/** Test/internal hook — reset the rolling latency window. */
export function _resetReadLatencyForTesting(): void {
  READ_LATENCY.p50 = 0;
  READ_LATENCY.p95 = 0;
  READ_LATENCY.samples = [];
}

/** Hot-path latency budget for session-start reads (ms). */
export const SESSION_START_READ_BUDGET_MS = SESSION_START_LATENCY_BUDGET_MS;

/**
 * Async variant that honors the store-mode contract end-to-end:
 *   - sqlite:   read SQLite
 *   - dual:     read SQLite (canonical), shadow-compare Postgres, record latency
 *   - supabase: read Postgres, record latency
 */
export async function listOpenUnfinishedRankedAsync(
  userId: string,
  limit = 30,
): Promise<UnfinishedRow[]> {
  const mode = storeFlags.unfinishedBusiness();

  if (shouldReadSupabase(mode)) {
    const { rows, ms } = await timedPgFetch(userId, limit);
    recordReadLatency(ms);
    if (ms > SESSION_START_LATENCY_BUDGET_MS) {
      console.warn(`[unfinished_business] slow PG read user=${userId} ms=${ms}`);
    }
    return rows;
  }

  const sqliteRows = listOpenUnfinishedRankedSqlite(userId, limit);
  if (mode === 'dual') {
    await shadowCompare(
      sqliteRows,
      async () => {
        const { rows, ms } = await timedPgFetch(userId, limit);
        recordReadLatency(ms);
        return rows;
      },
      {
        table: PG_TABLE,
        key: `${userId}:limit=${limit}`,
        equals: (a, b) => a.length === b.length && a.every((r, i) => r.id === b[i]?.id),
      },
    );
  }
  return sqliteRows;
}

export function resolveUnfinishedItem(
  userId: string,
  itemId: string,
  status: UnfinishedStatus,
  resolutionNote: string
): void {
  unfinishedStatusSchema.parse(status);
  if (status === 'open') throw new Error('use_defer_or_resolve');
  const db = getDb();
  const ts = nowIso();
  const resolvedAt = status === 'resolved' || status === 'archived' ? ts : null;
  const n = db
    .prepare(
      `UPDATE unfinished_business_items SET status = ?, resolution_note = ?, resolved_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`
    )
    .run(status, resolutionNote.trim(), resolvedAt, ts, itemId, userId)
    .changes;
  if (!n) throw new Error('unfinished_not_found');
  recordGovernanceAudit({
    userId,
    action: 'unfinished_business_resolve',
    entityType: 'unfinished_business_item',
    entityId: itemId,
    payload: { status },
  });

  const mode = storeFlags.unfinishedBusiness();
  if (shouldWriteSupabase(mode)) {
    const pgId = deterministicUuid('unfinished_business_items', itemId);
    void dualWrite(
      async () => undefined,
      () =>
        pgPatchRow(pgId, {
          status: mapStatusToPostgres(status),
          resolution_note: resolutionNote.trim(),
          resolved_at: resolvedAt,
          updated_at: ts,
        }),
      { table: PG_TABLE, mode },
    );
  }
}

/** Items with same fingerprint — recurring open loops under different wording. */
export function findSimilarUnfinished(userId: string, fingerprint: string): UnfinishedRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM unfinished_business_items
       WHERE user_id = ? AND pattern_fingerprint = ? AND status = 'open'
       ORDER BY composite_score DESC`
    )
    .all(userId, fingerprint) as UnfinishedRow[];
}

export function formatUnfinishedBusinessForPrompt(userId: string, limit = 12): string {
  const rows = listOpenUnfinishedRanked(userId, limit);
  if (rows.length === 0) return '(no open unfinished_business_items — not a session log)';
  return rows
    .map(
      (r) =>
        `- [${r.kind}] score=${r.composite_score.toFixed(2)} sig=${r.significance_score.toFixed(2)} rec=${r.recurrence_score.toFixed(2)} urg=${r.urgency_score.toFixed(2)} id=${r.id}\n  ${r.title}: ${r.description.slice(0, 400)}${r.description.length > 400 ? '…' : ''}`
    )
    .join('\n');
}
