/**
 * Pure helpers for the P4 doctrine_nodes backfill (script lives in
 * atlas-backend/scripts/migrate-p4-b1-doctrine.ts).
 *
 * Kept under `src/` so they are typechecked by `tsc --noEmit` and covered by
 * unit tests; the script in `scripts/` is a thin entrypoint that wires these
 * helpers to better-sqlite3 + supabaseRest.
 */
import { deterministicUuid } from '../../utils/uuidMapping.js';

export interface SqliteDoctrineRow {
  id: string;
  user_id: string;
  layer: string;
  title: string;
  body: string;
  priority: number;
  immutable: number;
  origin: string;
  version_group_id: string;
  version: number;
  supersedes_doctrine_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

function pgId(id: string): string {
  return deterministicUuid('doctrine_nodes', id);
}

/**
 * Topologically sort rows so a doctrine node only appears after the node it
 * supersedes. Rows that participate in a cycle are returned in `cycles` and
 * omitted from `ordered`.
 */
export function topologicalSortDoctrine<
  R extends { id: string; supersedes_doctrine_id: string | null },
>(rows: R[]): { ordered: R[]; cycles: R[] } {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const ordered: R[] = [];
  const cycles: R[] = [];

  function visit(r: R): boolean {
    if (visited.has(r.id)) return true;
    if (visiting.has(r.id)) return false;
    visiting.add(r.id);
    const parentId = r.supersedes_doctrine_id;
    if (parentId) {
      const parent = byId.get(parentId);
      if (parent && !visit(parent)) {
        visiting.delete(r.id);
        return false;
      }
    }
    visiting.delete(r.id);
    visited.add(r.id);
    ordered.push(r);
    return true;
  }

  for (const r of rows) {
    if (!visit(r)) cycles.push(r);
  }
  return { ordered, cycles };
}

export function toPostgresPayload(row: SqliteDoctrineRow): Record<string, unknown> {
  return {
    id: pgId(row.id),
    user_id: row.user_id,
    layer: row.layer,
    title: row.title,
    body: row.body,
    priority: row.priority,
    immutable: !!row.immutable,
    origin: row.origin,
    version_group_id: pgId(row.version_group_id),
    version: row.version,
    supersedes_doctrine_id: row.supersedes_doctrine_id
      ? pgId(row.supersedes_doctrine_id)
      : null,
    archived_at: row.archived_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
