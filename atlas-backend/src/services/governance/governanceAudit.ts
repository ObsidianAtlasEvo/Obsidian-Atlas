import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';

export function recordGovernanceAudit(input: {
  userId: string;
  actor?: string;
  action: string;
  entityType: string;
  entityId: string;
  payload?: unknown;
}): void {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO cognitive_governance_audit (id, user_id, actor, action, entity_type, entity_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.actor ?? 'system',
    input.action,
    input.entityType,
    input.entityId,
    input.payload != null ? JSON.stringify(input.payload) : null,
    now
  );
}
