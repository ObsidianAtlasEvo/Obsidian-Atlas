import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
import { recordGovernanceAudit } from './governanceAudit.js';

function nowIso(): string {
  return new Date().toISOString();
}

function versionGroup(userId: string, title: string): string {
  const h = createHash('sha256').update(`${userId}:${title}`).digest('hex').slice(0, 24);
  return `th:${userId}:${h}`;
}

export function createThresholdProtocol(input: {
  userId: string;
  title: string;
  stateDescription: string;
  triggerTypes?: string[];
  warningSigns?: string[];
  unreliableInState?: string;
  immediateSteps?: string[];
  doNotTrust?: string[];
  standardsApplyNote?: string;
  approvedActions?: string[];
  forbiddenActions?: string[];
  recoverySteps?: string[];
  reflectionPrompts?: string[];
  consultNote?: string;
  linkedConstitutionClauseIds?: string[];
  linkedLegacyIds?: string[];
  linkedUnfinishedIds?: string[];
  versionGroupId?: string;
}): string {
  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  const vg = input.versionGroupId ?? versionGroup(input.userId, input.title);
  db.prepare(
    `INSERT INTO threshold_protocols (
      id, user_id, title, state_description, trigger_types_json, warning_signs_json, unreliable_in_state,
      immediate_steps_json, do_not_trust_json, standards_apply_note, approved_actions_json, forbidden_actions_json,
      recovery_steps_json, reflection_prompts_json, consult_note,
      linked_constitution_clause_ids_json, linked_legacy_ids_json, linked_unfinished_ids_json,
      version_group_id, version, supersedes_id, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, 'active', ?, ?)`
  ).run(
    id,
    input.userId,
    input.title.trim().slice(0, 400),
    input.stateDescription.trim().slice(0, 10_000),
    JSON.stringify(input.triggerTypes ?? []),
    JSON.stringify(input.warningSigns ?? []),
    (input.unreliableInState ?? '').trim().slice(0, 4000),
    JSON.stringify(input.immediateSteps ?? []),
    JSON.stringify(input.doNotTrust ?? []),
    (input.standardsApplyNote ?? '').trim().slice(0, 4000),
    JSON.stringify(input.approvedActions ?? []),
    JSON.stringify(input.forbiddenActions ?? []),
    JSON.stringify(input.recoverySteps ?? []),
    JSON.stringify(input.reflectionPrompts ?? []),
    (input.consultNote ?? '').trim().slice(0, 2000),
    JSON.stringify(input.linkedConstitutionClauseIds ?? []),
    JSON.stringify(input.linkedLegacyIds ?? []),
    JSON.stringify(input.linkedUnfinishedIds ?? []),
    vg,
    ts,
    ts
  );
  recordGovernanceAudit({
    userId: input.userId,
    action: 'threshold_protocol_create',
    entityType: 'threshold_protocol',
    entityId: id,
  });
  return id;
}

export function listThresholdProtocols(userId: string, includeArchived = false) {
  const db = getDb();
  if (includeArchived) {
    return db
      .prepare(`SELECT * FROM threshold_protocols WHERE user_id = ? ORDER BY updated_at DESC`)
      .all(userId) as Record<string, unknown>[];
  }
  return db
    .prepare(
      `SELECT * FROM threshold_protocols WHERE user_id = ? AND archived_at IS NULL AND status = 'active' ORDER BY updated_at DESC`
    )
    .all(userId) as Record<string, unknown>[];
}

export function getThresholdProtocol(userId: string, id: string) {
  const db = getDb();
  return db.prepare(`SELECT * FROM threshold_protocols WHERE id = ? AND user_id = ?`).get(id, userId) as
    | Record<string, unknown>
    | undefined;
}

export function activateThresholdProtocol(userId: string, protocolId: string, contextNote?: string): string {
  const p = getThresholdProtocol(userId, protocolId);
  if (!p) throw new Error('protocol_not_found');
  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO threshold_protocol_activations (id, user_id, protocol_id, context_note, activated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, userId, protocolId, (contextNote ?? '').slice(0, 4000), ts);
  recordGovernanceAudit({
    userId,
    action: 'threshold_protocol_activate',
    entityType: 'threshold_protocol_activation',
    entityId: id,
  });
  return id;
}

export function closeThresholdActivation(
  userId: string,
  activationId: string,
  recoveryReviewText: string
): void {
  const db = getDb();
  const ts = nowIso();
  const n = db
    .prepare(
      `UPDATE threshold_protocol_activations SET closed_at = ?, recovery_review_text = ? WHERE id = ? AND user_id = ?`
    )
    .run(ts, recoveryReviewText.slice(0, 12_000), activationId, userId).changes;
  if (!n) throw new Error('activation_not_found');
}

export function listThresholdActivations(userId: string, limit = 40) {
  const db = getDb();
  return db
    .prepare(
      `SELECT a.*, p.title as protocol_title FROM threshold_protocol_activations a
       JOIN threshold_protocols p ON p.id = a.protocol_id
       WHERE a.user_id = ? ORDER BY a.activated_at DESC LIMIT ?`
    )
    .all(userId, limit) as Record<string, unknown>[];
}

/** Lightweight pattern hint for live routing (keyword overlap — not clinical diagnosis). */
export function matchThresholdProtocols(userId: string, userText: string): { protocolId: string; title: string; score: number }[] {
  const text = userText.toLowerCase();
  const protos = listThresholdProtocols(userId, false) as {
    id: string;
    title: string;
    warning_signs_json: string;
    trigger_types_json: string;
  }[];
  const scored: { protocolId: string; title: string; score: number }[] = [];
  for (const p of protos) {
    const signs = JSON.parse(p.warning_signs_json) as string[];
    const triggers = JSON.parse(p.trigger_types_json) as string[];
    let score = 0;
    for (const s of signs) {
      if (s.length > 3 && text.includes(s.toLowerCase())) score += 2;
    }
    for (const t of triggers) {
      if (t.length > 3 && text.includes(t.toLowerCase())) score += 1;
    }
    if (p.title.length > 4 && text.includes(p.title.toLowerCase().slice(0, 12))) score += 1;
    if (score > 0) scored.push({ protocolId: p.id, title: p.title, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 4);
}
