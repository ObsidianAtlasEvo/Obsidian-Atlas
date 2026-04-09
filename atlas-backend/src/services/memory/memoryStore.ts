// Atlas-Audit: [VIII] Verified
import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
import type { ConversationTrace, MemoryKind, MemoryRecord } from '../../types/atlas.js';

export type MemoryOrigin = 'user' | 'inferred' | 'system';

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

  if (record.replacesMemoryId) {
    db.transaction(run)();
  } else {
    run();
  }

  return {
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
  return row ? toMemoryRecord(row) : null;
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
  return rows.map(toMemoryRecord);
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
  return rows.map(toMemoryRecord);
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
