import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
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

function nowIso(): string {
  return new Date().toISOString();
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
  const db = getDb();
  const id = node.id || randomUUID();
  const versionGroupId = node.versionGroupId || id;
  const ts = nowIso();

  db.prepare(
    `INSERT INTO doctrine_nodes (
      id, user_id, layer, title, body, priority, immutable, created_at, updated_at,
      origin, version_group_id, version, supersedes_doctrine_id, archived_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL)`
  ).run(
    id,
    node.userId,
    node.layer,
    node.title.trim(),
    node.body.trim(),
    node.priority ?? 0,
    node.immutable ? 1 : 0,
    ts,
    ts,
    node.origin ?? 'user',
    versionGroupId
  );

  recordGovernanceAudit({
    userId: node.userId,
    action: 'doctrine_node_create',
    entityType: 'doctrine_nodes',
    entityId: id,
  });

  return db.prepare(`SELECT * FROM doctrine_nodes WHERE id = ?`).get(id) as DoctrineNodeRow;
}

export function updateDoctrineNode(
  id: string,
  userId: string,
  updates: Partial<Pick<DoctrineNodeRow, 'title' | 'body' | 'layer' | 'priority'>>
): DoctrineNodeRow {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM doctrine_nodes WHERE id = ? AND user_id = ? AND archived_at IS NULL`)
    .get(id, userId) as DoctrineNodeRow | undefined;
  if (!row) throw new Error('doctrine_node_not_found');

  const ts = nowIso();
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
    userId
  );

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
  const ts = nowIso();
  const n = db
    .prepare(`UPDATE doctrine_nodes SET archived_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND archived_at IS NULL`)
    .run(ts, ts, id, userId).changes;
  if (!n) throw new Error('doctrine_node_not_found');

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

export function listDoctrineNodes(userId: string, limit = 100): DoctrineNodeRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM doctrine_nodes WHERE user_id = ? AND archived_at IS NULL ORDER BY priority DESC, created_at DESC LIMIT ?`)
    .all(userId, limit) as DoctrineNodeRow[];
}
