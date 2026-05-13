/**
 * userMemoriesSupabase — translates the SQLite `memories` API into the
 * canonical Postgres `user_memories` table (migration 004_memory_layer.sql).
 *
 * This module is the secondary store for the P4-A1 cutover. It is never
 * called directly by service code — instead `memoryStore.ts` routes through
 * `storeFlags.memory()` and `dualWrite()`.
 *
 * Schema mapping (see /home/user/workspace/p4r_A1_memories_objective.md):
 *   SQLite.memories.id              → user_memories.id            (uuid v5)
 *   SQLite.memories.user_id         → user_memories.user_id       (uuid)
 *   SQLite.memories.kind            → user_memories.kind          (filtered)
 *   summary + "\n\n" + detail        → user_memories.content
 *   confidence                       → user_memories.importance   (clamped)
 *   source_trace_id                  → user_memories.source_turn_id (uuid v5)
 *   created_at                       → user_memories.created_at
 *   updated_at                       → user_memories.last_referenced_at
 *   replaces_memory_id (reverse)     → user_memories.superseded_by
 *
 * Embedding is left NULL on backfill — embeddingService will regenerate
 * lazily on next access. Tags and `origin` are dropped because
 * `user_memories` has no place to store them.
 */
import type { MemoryRecord, MemoryKind } from '../../types/atlas.js';
import { supabaseRest } from '../../db/supabase.js';
import { deterministicUuid } from '../../utils/uuidMapping.js';

/** kinds allowed by the user_memories.kind CHECK constraint. */
const CANONICAL_KINDS = new Set<string>(['preference', 'fact', 'pattern', 'correction', 'goal']);

export type CanonicalKind = 'preference' | 'fact' | 'pattern' | 'correction' | 'goal';

/**
 * Map an Atlas `MemoryKind` to a kind value `user_memories.kind` will accept.
 * The SQLite model is wider (includes `project`, `identity`, `style`, etc.);
 * the Postgres CHECK is narrower. Best-effort mapping below; anything still
 * outside the canonical set is coerced to `fact` so the row is not lost.
 */
export function mapKind(kind: MemoryKind | string): CanonicalKind {
  if (CANONICAL_KINDS.has(kind)) {
    return kind as CanonicalKind;
  }
  switch (kind) {
    case 'project':
    case 'identity':
    case 'constraint':
      return 'fact';
    case 'style':
      return 'preference';
    case 'skill':
      return 'pattern';
    case 'rejection':
      return 'correction';
    default:
      return 'fact';
  }
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function joinContent(summary: string, detail: string): string {
  const s = summary.trim();
  const d = detail.trim();
  if (!s) return d;
  if (!d) return s;
  return `${s}\n\n${d}`;
}

function maybeSourceTurnId(sqliteTraceId: string | null | undefined): string | null {
  if (!sqliteTraceId) return null;
  try {
    return deterministicUuid('traces', sqliteTraceId);
  } catch {
    return null;
  }
}

export interface UserMemoryRow {
  id: string;
  user_id: string;
  kind: CanonicalKind;
  content: string;
  importance: number;
  source_turn_id: string | null;
  created_at: string;
  last_referenced_at: string;
}

/** Build a `user_memories` row from a SQLite memory snapshot. */
export function toUserMemoryRow(input: {
  sqliteId: string;
  userId: string;
  kind: MemoryKind | string;
  summary: string;
  detail: string;
  confidence: number;
  sourceTraceId: string | null | undefined;
  createdAt: string;
  updatedAt: string;
}): UserMemoryRow {
  return {
    id: deterministicUuid('memories', input.sqliteId),
    user_id: input.userId,
    kind: mapKind(input.kind),
    content: joinContent(input.summary, input.detail),
    importance: clamp01(input.confidence),
    source_turn_id: maybeSourceTurnId(input.sourceTraceId),
    created_at: input.createdAt,
    last_referenced_at: input.updatedAt,
  };
}

// ── Writes ──────────────────────────────────────────────────────────────────

/** Upsert one memory into `user_memories` (idempotent on id). */
export async function upsertUserMemory(record: MemoryRecord): Promise<void> {
  const row = toUserMemoryRow({
    sqliteId: record.id,
    userId: record.userId,
    kind: record.kind,
    summary: record.summary,
    detail: record.detail,
    confidence: record.confidence,
    sourceTraceId: record.sourceTraceId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });

  const result = await supabaseRest(
    'POST',
    'user_memories?on_conflict=id',
    [row],
    { Prefer: 'resolution=merge-duplicates,return=minimal' },
  );
  if (!result.ok) {
    throw new Error(`[userMemoriesSupabase] upsert failed status=${result.status ?? '?'}`);
  }
}

/**
 * Mark `superseded_by` on the row that was replaced. SQLite stores the
 * pointer on the new row (`replaces_memory_id`); Postgres stores it on the
 * old row (`superseded_by`). This is the reverse-pass equivalent.
 */
export async function markUserMemorySuperseded(
  replacedSqliteId: string,
  replacementSqliteId: string,
): Promise<void> {
  const replacedUuid = deterministicUuid('memories', replacedSqliteId);
  const replacementUuid = deterministicUuid('memories', replacementSqliteId);
  const result = await supabaseRest(
    'PATCH',
    `user_memories?id=eq.${replacedUuid}`,
    { superseded_by: replacementUuid },
    { Prefer: 'return=minimal' },
  );
  if (!result.ok) {
    throw new Error(`[userMemoriesSupabase] supersede patch failed status=${result.status ?? '?'}`);
  }
}

// ── Reads (used by shadow parity comparisons during the dual phase) ─────────

function fromUserMemoryRow(row: UserMemoryRow, sourceTraceId: string): MemoryRecord {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind as MemoryKind,
    summary: row.content,
    detail: '',
    confidence: row.importance,
    sourceTraceId,
    tags: [],
    createdAt: row.created_at,
    updatedAt: row.last_referenced_at,
  };
}

export async function getUserMemoryBySqliteId(
  userId: string,
  sqliteId: string,
): Promise<MemoryRecord | null> {
  const uuid = deterministicUuid('memories', sqliteId);
  const result = await supabaseRest<UserMemoryRow[]>(
    'GET',
    `user_memories?id=eq.${uuid}&user_id=eq.${userId}&select=id,user_id,kind,content,importance,source_turn_id,created_at,last_referenced_at`,
  );
  if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) return null;
  return fromUserMemoryRow(result.data[0]!, sqliteId);
}

export async function listRecentUserMemories(userId: string, limit: number): Promise<MemoryRecord[]> {
  const result = await supabaseRest<UserMemoryRow[]>(
    'GET',
    `user_memories?user_id=eq.${userId}&superseded_by=is.null&order=created_at.desc&limit=${limit}&select=id,user_id,kind,content,importance,source_turn_id,created_at,last_referenced_at`,
  );
  if (!result.ok || !Array.isArray(result.data)) return [];
  return result.data.map((r) => fromUserMemoryRow(r, ''));
}

export async function listUserMemoriesByKind(
  userId: string,
  kind: MemoryKind,
  limit: number,
): Promise<MemoryRecord[]> {
  const mapped = mapKind(kind);
  const result = await supabaseRest<UserMemoryRow[]>(
    'GET',
    `user_memories?user_id=eq.${userId}&kind=eq.${mapped}&superseded_by=is.null&order=created_at.desc&limit=${limit}&select=id,user_id,kind,content,importance,source_turn_id,created_at,last_referenced_at`,
  );
  if (!result.ok || !Array.isArray(result.data)) return [];
  return result.data.map((r) => fromUserMemoryRow(r, ''));
}
