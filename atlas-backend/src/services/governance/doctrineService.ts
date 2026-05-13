import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
import { supabaseRest } from '../../db/supabase.js';
import { dualWrite } from '../../utils/dualWriteWrapper.js';
import {
  shouldReadSupabase,
  shouldWriteSqlite,
  shouldWriteSupabase,
  storeFlags,
} from '../../utils/storeFlags.js';
import { deterministicUuid } from '../../utils/uuidMapping.js';
import { recordGovernanceAudit } from './governanceAudit.js';

export interface DoctrineNodeRow {
  id: string;
  user_id: string;
  layer: string;
  title: string;
  body: string;
  priority: number;
  immutable: number;
  created_at: string;
  updated_at: string;
  origin: string;
  version_group_id: string;
  version: number;
  supersedes_doctrine_id: string | null;
  archived_at: string | null;
}

interface SupabaseDoctrineRow {
  id: string;
  user_id: string;
  layer: string;
  title: string;
  body: string;
  priority: number;
  immutable: boolean;
  created_at: string;
  updated_at: string;
  origin: string;
  version_group_id: string;
  version: number;
  supersedes_doctrine_id: string | null;
  archived_at: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function pgId(id: string): string {
  return deterministicUuid('doctrine_nodes', id);
}

function fromSupabase(row: SupabaseDoctrineRow): DoctrineNodeRow {
  return {
    id: row.id,
    user_id: row.user_id,
    layer: row.layer,
    title: row.title,
    body: row.body,
    priority: row.priority,
    immutable: row.immutable ? 1 : 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    origin: row.origin,
    version_group_id: row.version_group_id,
    version: row.version,
    supersedes_doctrine_id: row.supersedes_doctrine_id,
    archived_at: row.archived_at,
  };
}

function sqliteInsert(row: DoctrineNodeRow): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO doctrine_nodes (
      id, user_id, layer, title, body, priority, immutable, created_at, updated_at,
      origin, version_group_id, version, supersedes_doctrine_id, archived_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    row.user_id,
    row.layer,
    row.title,
    row.body,
    row.priority,
    row.immutable,
    row.created_at,
    row.updated_at,
    row.origin,
    row.version_group_id,
    row.version,
    row.supersedes_doctrine_id,
    row.archived_at,
  );
}

async function supabaseInsert(row: DoctrineNodeRow): Promise<void> {
  await supabaseRest('POST', 'doctrine_nodes', {
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
  });
}

export function createDoctrineNode(node: {
  id?: string;
  userId: string;
  layer: string;
  title: string;
  body: string;
  priority?: number;
  immutable?: boolean;
  origin?: string;
  versionGroupId?: string;
}): DoctrineNodeRow {
  const id = node.id || randomUUID();
  const versionGroupId = node.versionGroupId || id;
  const ts = nowIso();

  const row: DoctrineNodeRow = {
    id,
    user_id: node.userId,
    layer: node.layer,
    title: node.title.trim(),
    body: node.body.trim(),
    priority: node.priority ?? 0,
    immutable: node.immutable ? 1 : 0,
    created_at: ts,
    updated_at: ts,
    origin: node.origin ?? 'user',
    version_group_id: versionGroupId,
    version: 1,
    supersedes_doctrine_id: null,
    archived_at: null,
  };

  const mode = storeFlags.doctrine();

  if (shouldWriteSqlite(mode)) {
    sqliteInsert(row);
  }
  if (shouldWriteSupabase(mode)) {
    void dualWrite(
      () => undefined,
      () => supabaseInsert(row),
      { table: 'doctrine_nodes', mode },
    );
  }

  recordGovernanceAudit({
    userId: node.userId,
    action: 'doctrine_node_create',
    entityType: 'doctrine_nodes',
    entityId: id,
  });

  return row;
}

export function updateDoctrineNode(
  id: string,
  userId: string,
  updates: Partial<Pick<DoctrineNodeRow, 'title' | 'body' | 'layer' | 'priority'>>
): DoctrineNodeRow {
  const db = getDb();
  const mode = storeFlags.doctrine();
  const ts = nowIso();

  const existing = db
    .prepare(`SELECT * FROM doctrine_nodes WHERE id = ? AND user_id = ? AND archived_at IS NULL`)
    .get(id, userId) as DoctrineNodeRow | undefined;
  if (!existing) throw new Error('doctrine_node_not_found');

  if (shouldWriteSqlite(mode)) {
    db.prepare(
      `UPDATE doctrine_nodes SET
        title = COALESCE(?, title),
        body = COALESCE(?, body),
        layer = COALESCE(?, layer),
        priority = COALESCE(?, priority),
        updated_at = ?
      WHERE id = ? AND user_id = ?`
    ).run(
      updates.title ?? null,
      updates.body ?? null,
      updates.layer ?? null,
      updates.priority ?? null,
      ts,
      id,
      userId,
    );
  }

  if (shouldWriteSupabase(mode)) {
    const patch: Record<string, unknown> = { updated_at: ts };
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.body !== undefined) patch.body = updates.body;
    if (updates.layer !== undefined) patch.layer = updates.layer;
    if (updates.priority !== undefined) patch.priority = updates.priority;
    void dualWrite(
      () => undefined,
      () =>
        supabaseRest(
          'PATCH',
          `doctrine_nodes?id=eq.${pgId(id)}&user_id=eq.${userId}`,
          patch,
        ),
      { table: 'doctrine_nodes', mode },
    );
  }

  recordGovernanceAudit({
    userId,
    action: 'doctrine_node_update',
    entityType: 'doctrine_nodes',
    entityId: id,
  });

  return db.prepare(`SELECT * FROM doctrine_nodes WHERE id = ?`).get(id) as DoctrineNodeRow;
}

export function archiveDoctrineNode(id: string, userId: string): void {
  const db = getDb();
  const mode = storeFlags.doctrine();
  const ts = nowIso();

  if (shouldWriteSqlite(mode)) {
    const n = db
      .prepare(`UPDATE doctrine_nodes SET archived_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND archived_at IS NULL`)
      .run(ts, ts, id, userId).changes;
    if (!n) throw new Error('doctrine_node_not_found');
  }

  if (shouldWriteSupabase(mode)) {
    void dualWrite(
      () => undefined,
      () =>
        supabaseRest(
          'PATCH',
          `doctrine_nodes?id=eq.${pgId(id)}&user_id=eq.${userId}&archived_at=is.null`,
          { archived_at: ts, updated_at: ts },
        ),
      { table: 'doctrine_nodes', mode },
    );
  }

  recordGovernanceAudit({
    userId,
    action: 'doctrine_node_archive',
    entityType: 'doctrine_nodes',
    entityId: id,
  });
}

export function getDoctrineNode(id: string, userId: string): DoctrineNodeRow | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM doctrine_nodes WHERE id = ? AND user_id = ? AND archived_at IS NULL`)
    .get(id, userId) as DoctrineNodeRow | undefined;
}

export async function getDoctrineNodeAsync(
  id: string,
  userId: string,
): Promise<DoctrineNodeRow | undefined> {
  const mode = storeFlags.doctrine();
  if (shouldReadSupabase(mode)) {
    const res = await supabaseRest<SupabaseDoctrineRow[]>(
      'GET',
      `doctrine_nodes?id=eq.${pgId(id)}&user_id=eq.${userId}&archived_at=is.null&limit=1`,
    );
    if (!res.ok || !res.data || res.data.length === 0) return undefined;
    return fromSupabase(res.data[0]);
  }
  return getDoctrineNode(id, userId);
}

export function listDoctrineNodes(userId: string, limit = 100): DoctrineNodeRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM doctrine_nodes WHERE user_id = ? AND archived_at IS NULL ORDER BY priority DESC, created_at DESC LIMIT ?`)
    .all(userId, limit) as DoctrineNodeRow[];
}

export async function listDoctrineNodesAsync(
  userId: string,
  limit = 100,
): Promise<DoctrineNodeRow[]> {
  const mode = storeFlags.doctrine();
  if (shouldReadSupabase(mode)) {
    const res = await supabaseRest<SupabaseDoctrineRow[]>(
      'GET',
      `doctrine_nodes?user_id=eq.${userId}&order=priority.desc,created_at.desc&archived_at=is.null&limit=${limit}`,
    );
    if (!res.ok || !res.data) return [];
    return res.data.map(fromSupabase);
  }
  return listDoctrineNodes(userId, limit);
}
