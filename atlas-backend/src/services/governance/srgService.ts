/**
 * srgService — gated reads for the legacy `srg_decisions` table.
 *
 * P4-A4 routes SQLite `srg_decisions` rows into the canonical Postgres
 * `decisions` table (migration 010) with `decision_metadata.source = 'srg'`.
 * No parallel `srg_decisions` table is created in Postgres.
 *
 * Three store modes (sqlite | dual | supabase) gate behavior via
 * `storeFlags.srg()`:
 *   - sqlite   — read SQLite only (default; matches legacy behavior).
 *   - dual     — read SQLite as primary; shadow-compare Supabase result in
 *                the background (`shadowCompare`); never block callers.
 *   - supabase — read Supabase only. Sync wrappers throw in this mode so
 *                callers must migrate to the async API before promoting.
 */
import { getDb } from '../../db/sqlite.js';
import { supabaseRest } from '../../db/supabase.js';
import { shadowCompare } from '../../utils/shadowReadParity.js';
import { shouldReadSupabase, storeFlags } from '../../utils/storeFlags.js';

export interface SrgDecisionRow {
  id: string;
  title: string;
  status: string;
  rationale: string;
  created_at: string;
  updated_at: string;
}

interface SupabaseDecisionRow {
  id: string;
  title: string;
  rationale: string | null;
  created_at: string;
  decision_metadata: Record<string, unknown> | null;
}

function readSqliteRecent(userId: string, limit: number): SrgDecisionRow[] {
  try {
    const db = getDb();
    return db
      .prepare(
        `SELECT id, title, status, rationale, created_at, updated_at FROM srg_decisions
         WHERE user_id = ?
         ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(userId, limit) as SrgDecisionRow[];
  } catch {
    return [];
  }
}

function readSqliteStaleDrafts(
  userId: string,
  beforeIso: string,
  limit: number,
): SrgDecisionRow[] {
  try {
    const db = getDb();
    return db
      .prepare(
        `SELECT id, title, status, rationale, created_at, updated_at FROM srg_decisions
         WHERE user_id = ? AND status = 'draft' AND created_at < ?
         ORDER BY created_at ASC LIMIT ?`,
      )
      .all(userId, beforeIso, limit) as SrgDecisionRow[];
  } catch {
    return [];
  }
}

function mapSupabaseRow(row: SupabaseDecisionRow): SrgDecisionRow {
  const meta = row.decision_metadata ?? {};
  const status = typeof meta.srg_status === 'string' ? meta.srg_status : '';
  const updatedAt = typeof meta.updated_at === 'string' ? meta.updated_at : row.created_at;
  return {
    id: row.id,
    title: row.title,
    status,
    rationale: row.rationale ?? '',
    created_at: row.created_at,
    updated_at: updatedAt,
  };
}

async function readSupabaseRecent(userId: string, limit: number): Promise<SrgDecisionRow[]> {
  const path =
    `decisions?user_id=eq.${encodeURIComponent(userId)}` +
    `&decision_metadata->>source=eq.srg` +
    `&select=id,title,rationale,created_at,decision_metadata` +
    `&order=decided_at.desc&limit=${limit}`;
  const res = await supabaseRest<SupabaseDecisionRow[]>('GET', path);
  if (!res.ok || !res.data) return [];
  return res.data.map(mapSupabaseRow);
}

async function readSupabaseStaleDrafts(
  userId: string,
  beforeIso: string,
  limit: number,
): Promise<SrgDecisionRow[]> {
  const path =
    `decisions?user_id=eq.${encodeURIComponent(userId)}` +
    `&decision_metadata->>source=eq.srg` +
    `&decision_metadata->>srg_status=eq.draft` +
    `&created_at=lt.${encodeURIComponent(beforeIso)}` +
    `&select=id,title,rationale,created_at,decision_metadata` +
    `&order=created_at.asc&limit=${limit}`;
  const res = await supabaseRest<SupabaseDecisionRow[]>('GET', path);
  if (!res.ok || !res.data) return [];
  return res.data.map(mapSupabaseRow);
}

function equalsById(a: SrgDecisionRow[], b: SrgDecisionRow[]): boolean {
  return a.length === b.length && a.every((row, i) => row.id === b[i]?.id);
}

/**
 * Sync read of the most recent SRG decisions. Works for `sqlite` and `dual`
 * modes; in `dual` a background shadow compare is fired. Throws in
 * `supabase` mode — callers must migrate to {@link listRecentSrgDecisionsAsync}
 * before promoting the flag.
 */
export function listRecentSrgDecisionsSync(userId: string, limit: number): SrgDecisionRow[] {
  const mode = storeFlags.srg();
  if (shouldReadSupabase(mode)) {
    throw new Error(
      'srgService: SRG_STORE=supabase requires the async API (listRecentSrgDecisionsAsync)',
    );
  }
  const primary = readSqliteRecent(userId, limit);
  if (mode === 'dual') {
    void shadowCompare(primary, () => readSupabaseRecent(userId, limit), {
      table: 'srg_decisions',
      key: `recent:${userId}:${limit}`,
      equals: equalsById,
    });
  }
  return primary;
}

/** Async, three-mode aware variant of {@link listRecentSrgDecisionsSync}. */
export async function listRecentSrgDecisionsAsync(
  userId: string,
  limit: number,
): Promise<SrgDecisionRow[]> {
  const mode = storeFlags.srg();
  if (shouldReadSupabase(mode)) {
    return readSupabaseRecent(userId, limit);
  }
  const primary = readSqliteRecent(userId, limit);
  if (mode === 'dual') {
    void shadowCompare(primary, () => readSupabaseRecent(userId, limit), {
      table: 'srg_decisions',
      key: `recent:${userId}:${limit}`,
      equals: equalsById,
    });
  }
  return primary;
}

/**
 * Sync read of stale draft SRG decisions older than {@link beforeIso}.
 * Same three-mode semantics as {@link listRecentSrgDecisionsSync}.
 */
export function listStaleDraftSrgDecisionsSync(
  userId: string,
  beforeIso: string,
  limit: number,
): SrgDecisionRow[] {
  const mode = storeFlags.srg();
  if (shouldReadSupabase(mode)) {
    throw new Error(
      'srgService: SRG_STORE=supabase requires the async API (listStaleDraftSrgDecisionsAsync)',
    );
  }
  const primary = readSqliteStaleDrafts(userId, beforeIso, limit);
  if (mode === 'dual') {
    void shadowCompare(primary, () => readSupabaseStaleDrafts(userId, beforeIso, limit), {
      table: 'srg_decisions',
      key: `stale_drafts:${userId}:${beforeIso}:${limit}`,
      equals: equalsById,
    });
  }
  return primary;
}

/** Async, three-mode aware variant of {@link listStaleDraftSrgDecisionsSync}. */
export async function listStaleDraftSrgDecisionsAsync(
  userId: string,
  beforeIso: string,
  limit: number,
): Promise<SrgDecisionRow[]> {
  const mode = storeFlags.srg();
  if (shouldReadSupabase(mode)) {
    return readSupabaseStaleDrafts(userId, beforeIso, limit);
  }
  const primary = readSqliteStaleDrafts(userId, beforeIso, limit);
  if (mode === 'dual') {
    void shadowCompare(primary, () => readSupabaseStaleDrafts(userId, beforeIso, limit), {
      table: 'srg_decisions',
      key: `stale_drafts:${userId}:${beforeIso}:${limit}`,
      equals: equalsById,
    });
  }
  return primary;
}
