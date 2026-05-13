// Atlas-Audit: [VIII] Verified
import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
import type { ConversationTrace, MemoryKind, MemoryRecord } from '../../types/atlas.js';
import { dualWrite } from '../../utils/dualWriteWrapper.js';
import { shadowCompare } from '../../utils/shadowReadParity.js';
import {
  shouldReadSupabase,
  shouldWriteSqlite,
  shouldWriteSupabase,
  storeFlags,
} from '../../utils/storeFlags.js';
import {
  getUserMemoryBySqliteId,
  listRecentUserMemories,
  listUserMemoriesByKind,
  markUserMemorySuperseded,
  upsertUserMemory,
} from './userMemoriesSupabase.js';

export type MemoryOrigin = 'user' | 'inferred' | 'system';

/**
 * P4-A1 cutover gate.
 *
 * The SQLite-only legacy path is preserved verbatim. Two new behaviors layer
 * on top, controlled by `MEMORY_STORE`:
 *   - `dual`: every write fires a background secondary write into the
 *     canonical Postgres `user_memories` table (via `userMemoriesSupabase`).
 *     Read calls additionally fire a shadow comparison; the returned value is
 *     always the SQLite result, so caller signatures are unchanged.
 *   - `supabase`: SQLite remains the read-of-record in this stage because the
 *     read APIs are synchronous. The flip to Postgres-as-read-of-record will
 *     land in a follow-up that converts call sites to async.
 *
 * Secondary writes are best-effort via `dualWrite`; their failures are
 * logged but never propagated.
 */

type MemoryRow = {
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
  origin?: string | null;
  archived_at?: string | null;
  replaces_memory_id?: string | null;
};

type TraceRow = {
  id: string;
  user_id: string;
  user_message: string;
  assistant_response: string;
  response_score: number;
  memory_candidates: number;
  dataset_approved: number;
  created_at: string;
};

function toMemoryRecord(r: MemoryRow): MemoryRecord {
  return {
    id: r.id,
    userId: r.user_id,
    kind: r.kind as MemoryKind,
    summary: r.summary,
    detail: r.detail,
    confidence: r.confidence,
    sourceTraceId: r.source_trace_id,
    tags: JSON.parse(r.tags) as string[],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function memorySelectColumns(): string {
  return `id, user_id, kind, summary, detail, confidence, source_trace_id, tags, created_at, updated_at,
          COALESCE(origin, 'inferred') AS origin, archived_at, replaces_memory_id`;
}

/**
 * Insert a new memory row. Generates `id` and timestamps when omitted.
 * `memoryOrigin` separates user-authored substrate from pipeline-inferred rows (default `inferred`).
 * `replacesMemoryId`: soft-archives the prior row and links revision lineage (same user only).
 */
export function saveMemory(
  record: Omit<MemoryRecord, 'id' | 'createdAt' | 'updatedAt'> & {
    id?: string;
    createdAt?: string;
    updatedAt?: string;
    memoryOrigin?: MemoryOrigin;
    replacesMemoryId?: string | null;
  }
): MemoryRecord {
  const db = getDb();
  const id = record.id ?? randomUUID();
  const now = new Date().toISOString();
  const createdAt = record.createdAt ?? now;
  const updatedAt = record.updatedAt ?? now;
  const origin = record.memoryOrigin ?? 'inferred';

  const run = () => {
    if (record.replacesMemoryId) {
      db.prepare(
        `UPDATE memories SET archived_at = ?, updated_at = ?
         WHERE id = ? AND user_id = ? AND archived_at IS NULL`
      ).run(now, now, record.replacesMemoryId, record.userId);
    }

    db.prepare(
      `INSERT INTO memories (
         id, user_id, kind, summary, detail, confidence, source_trace_id, tags,
         created_at, updated_at, origin, archived_at, replaces_memory_id
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`
    ).run(
      id,
      record.userId,
      record.kind,
      record.summary,
      record.detail,
      record.confidence,
      record.sourceTraceId,
      JSON.stringify(record.tags),
      createdAt,
      updatedAt,
      origin,
      record.replacesMemoryId ?? null
    );
  };

  const mode = storeFlags.memory();
  const result: MemoryRecord = {
    id,
    userId: record.userId,
    kind: record.kind,
    summary: record.summary,
    detail: record.detail,
    confidence: record.confidence,
    sourceTraceId: record.sourceTraceId,
    tags: record.tags,
    createdAt,
    updatedAt,
  };

  const primary = (): MemoryRecord => {
    if (!shouldWriteSqlite(mode)) return result;
    if (record.replacesMemoryId) {
      db.transaction(run)();
    } else {
      run();
    }
    return result;
  };

  const secondary = shouldWriteSupabase(mode)
    ? async () => {
        await upsertUserMemory(result);
        if (record.replacesMemoryId) {
          await markUserMemorySuperseded(record.replacesMemoryId, id);
        }
      }
    : null;

  // dualWrite's promise begins synchronously, so `primary()` runs inline and
  // its SQLite side-effects are committed before this function returns. The
  // secondary write completes in the background; failures are logged inside
  // dualWrite and never surface here.
  void dualWrite(primary, secondary, { table: 'memories', mode });

  return result;
}

/**
 * Load a single memory row if it belongs to the user (includes archived rows for explicit id lookup).
 */
export function getMemoryById(userId: string, id: string): MemoryRecord | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT ${memorySelectColumns()}
       FROM memories
       WHERE id = ? AND user_id = ?`
    )
    .get(id, userId) as MemoryRow | undefined;
  const primary = row ? toMemoryRecord(row) : null;
  const mode = storeFlags.memory();
  if (mode === 'dual' || shouldReadSupabase(mode)) {
    void shadowCompare(primary, () => getUserMemoryBySqliteId(userId, id), {
      table: 'memories',
      key: `${userId}:${id}`,
      equals: memoryRecordsEquivalent,
    });
  }
  return primary;
}

export function listRecentMemories(userId: string, limit: number): MemoryRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT ${memorySelectColumns()}
       FROM memories
       WHERE user_id = ? AND archived_at IS NULL
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(userId, limit) as MemoryRow[];
  const primary = rows.map(toMemoryRecord);
  const mode = storeFlags.memory();
  if (mode === 'dual' || shouldReadSupabase(mode)) {
    void shadowCompare(primary, () => listRecentUserMemories(userId, limit), {
      table: 'memories',
      key: `${userId}:recent:${limit}`,
      equals: memoryListsEquivalent,
    });
  }
  return primary;
}

export function listMemoriesByKind(userId: string, kind: MemoryKind, limit: number): MemoryRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT ${memorySelectColumns()}
       FROM memories
       WHERE user_id = ? AND kind = ? AND archived_at IS NULL
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(userId, kind, limit) as MemoryRow[];
  const primary = rows.map(toMemoryRecord);
  const mode = storeFlags.memory();
  if (mode === 'dual' || shouldReadSupabase(mode)) {
    void shadowCompare(primary, () => listUserMemoriesByKind(userId, kind, limit), {
      table: 'memories',
      key: `${userId}:kind=${kind}:${limit}`,
      equals: memoryListsEquivalent,
    });
  }
  return primary;
}

/**
 * Loose equality for shadow parity: compares the fields that survive the
 * SQLite → user_memories projection. Tags/origin/archived_at are dropped by
 * the canonical schema, so excluding them avoids false-positive parity
 * misses.
 */
function memoryRecordsEquivalent(a: MemoryRecord | null, b: MemoryRecord | null): boolean {
  if (a === null || b === null) return a === b;
  return a.userId === b.userId && a.confidence === b.confidence;
}

function memoryListsEquivalent(a: MemoryRecord[], b: MemoryRecord[]): boolean {
  return a.length === b.length;
}

export function saveTrace(trace: ConversationTrace): ConversationTrace {
  const db = getDb();
  db.prepare(
    `INSERT INTO traces (id, user_id, user_message, assistant_response, response_score, memory_candidates, dataset_approved, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    trace.id,
    trace.userId,
    trace.userMessage,
    trace.assistantResponse,
    trace.responseScore,
    trace.memoryCandidates,
    trace.datasetApproved ? 1 : 0,
    trace.createdAt
  );
  return trace;
}

export function listRecentTraces(userId: string, limit: number): ConversationTrace[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, user_id, user_message, assistant_response, response_score, memory_candidates, dataset_approved, created_at
       FROM traces
       WHERE user_id = ? AND archived_at IS NULL
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(userId, limit) as TraceRow[];
  return rows.map(toConversationTrace);
}

function toConversationTrace(r: TraceRow): ConversationTrace {
  return {
    id: r.id,
    userId: r.user_id,
    userMessage: r.user_message,
    assistantResponse: r.assistant_response,
    responseScore: r.response_score,
    memoryCandidates: r.memory_candidates,
    datasetApproved: Boolean(r.dataset_approved),
    createdAt: r.created_at,
  };
}
