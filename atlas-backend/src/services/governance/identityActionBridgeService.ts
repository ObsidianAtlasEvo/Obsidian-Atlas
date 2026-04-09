import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
import { identityGoalStatusSchema } from '../../types/strategicLayer.js';
import { recordGovernanceAudit } from './governanceAudit.js';

function nowIso(): string {
  return new Date().toISOString();
}

export function createIdentityGoal(input: {
  userId: string;
  aspirationStatement: string;
  traitArchetype: string;
  operationalDefinition?: string;
  symbolicVsEnactedNote?: string;
  constitutionClauseIds?: string[];
}): string {
  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO identity_goals (
      id, user_id, aspiration_statement, trait_archetype, operational_definition, symbolic_vs_enacted_note,
      status, linked_constitution_clause_ids_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.aspirationStatement.trim().slice(0, 10_000),
    input.traitArchetype.trim().slice(0, 200),
    (input.operationalDefinition ?? '').trim().slice(0, 10_000),
    (input.symbolicVsEnactedNote ?? '').trim().slice(0, 5000),
    JSON.stringify(input.constitutionClauseIds ?? []),
    ts,
    ts
  );
  recordGovernanceAudit({
    userId: input.userId,
    action: 'identity_goal_create',
    entityType: 'identity_goal',
    entityId: id,
  });
  return id;
}

export function createActionProtocol(input: {
  userId: string;
  identityGoalId: string;
  title: string;
  observableBehaviors?: string[];
  measurableIndicators?: string[];
  environmentalSupports?: string[];
  failurePoints?: string[];
  reviewCadence?: string;
  maintenanceRoutines?: string[];
  correctiveProtocols?: string[];
  linkedDecisionIds?: string[];
  linkedEvolutionEventIds?: string[];
  linkedUnfinishedId?: string | null;
}): string {
  const db = getDb();
  const goal = db
    .prepare(`SELECT id FROM identity_goals WHERE id = ? AND user_id = ?`)
    .get(input.identityGoalId, input.userId) as { id: string } | undefined;
  if (!goal) throw new Error('identity_goal_not_found');

  const id = randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO action_protocols (
      id, user_id, identity_goal_id, title,
      observable_behaviors_json, measurable_indicators_json, environmental_supports_json, failure_points_json,
      review_cadence, maintenance_routines_json, corrective_protocols_json,
      linked_decision_ids_json, linked_evolution_event_ids_json, linked_unfinished_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.identityGoalId,
    input.title.trim().slice(0, 500),
    JSON.stringify(input.observableBehaviors ?? []),
    JSON.stringify(input.measurableIndicators ?? []),
    JSON.stringify(input.environmentalSupports ?? []),
    JSON.stringify(input.failurePoints ?? []),
    (input.reviewCadence ?? '').trim().slice(0, 2000),
    JSON.stringify(input.maintenanceRoutines ?? []),
    JSON.stringify(input.correctiveProtocols ?? []),
    JSON.stringify(input.linkedDecisionIds ?? []),
    JSON.stringify(input.linkedEvolutionEventIds ?? []),
    input.linkedUnfinishedId ?? null,
    ts,
    ts
  );
  recordGovernanceAudit({
    userId: input.userId,
    action: 'action_protocol_create',
    entityType: 'action_protocol',
    entityId: id,
  });
  return id;
}

export function recordProtocolReview(input: {
  userId: string;
  protocolId: string;
  behavioralEvidence: string;
  gapAnalysis: string;
  nextAdjustments: string;
}): string {
  const db = getDb();
  const p = db
    .prepare(`SELECT id FROM action_protocols WHERE id = ? AND user_id = ?`)
    .get(input.protocolId, input.userId) as { id: string } | undefined;
  if (!p) throw new Error('protocol_not_found');
  const id = randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO identity_protocol_reviews (id, user_id, protocol_id, reviewed_at, behavioral_evidence, gap_analysis, next_adjustments)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.protocolId,
    ts,
    input.behavioralEvidence.trim().slice(0, 10_000),
    input.gapAnalysis.trim().slice(0, 10_000),
    input.nextAdjustments.trim().slice(0, 10_000)
  );
  db.prepare(`UPDATE action_protocols SET updated_at = ? WHERE id = ?`).run(ts, input.protocolId);
  return id;
}

export function listIdentityGoals(userId: string, status?: string) {
  const db = getDb();
  if (status) {
    identityGoalStatusSchema.parse(status);
    return db
      .prepare(`SELECT * FROM identity_goals WHERE user_id = ? AND status = ? ORDER BY updated_at DESC`)
      .all(userId, status) as Record<string, unknown>[];
  }
  return db
    .prepare(`SELECT * FROM identity_goals WHERE user_id = ? ORDER BY updated_at DESC`)
    .all(userId) as Record<string, unknown>[];
}

export function listActionProtocolsForGoal(userId: string, goalId: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM action_protocols WHERE user_id = ? AND identity_goal_id = ? ORDER BY created_at ASC`
    )
    .all(userId, goalId) as Record<string, unknown>[];
}

export function setIdentityGoalStatus(userId: string, goalId: string, status: string): void {
  identityGoalStatusSchema.parse(status);
  const db = getDb();
  const n = db
    .prepare(`UPDATE identity_goals SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
    .run(status, nowIso(), goalId, userId).changes;
  if (!n) throw new Error('identity_goal_not_found');
}

/** Behavioral support gap: goals with few behaviors in protocols vs aspiration-only language. */
export function assessIdentityBehaviorGap(userId: string): { goalId: string; aspiration: string; protocolCount: number; behaviorCount: number }[] {
  const goals = listIdentityGoals(userId, 'active') as { id: string; aspiration_statement: string }[];
  const db = getDb();
  const out: { goalId: string; aspiration: string; protocolCount: number; behaviorCount: number }[] = [];
  for (const g of goals) {
    const protos = db
      .prepare(`SELECT observable_behaviors_json FROM action_protocols WHERE user_id = ? AND identity_goal_id = ?`)
      .all(userId, g.id) as { observable_behaviors_json: string }[];
    let behaviorCount = 0;
    for (const p of protos) {
      behaviorCount += (JSON.parse(p.observable_behaviors_json) as string[]).length;
    }
    out.push({
      goalId: g.id,
      aspiration: g.aspiration_statement.slice(0, 200),
      protocolCount: protos.length,
      behaviorCount,
    });
  }
  return out;
}

export function formatIdentityBridgeForPrompt(userId: string, goalLimit = 6): string {
  const goals = listIdentityGoals(userId, 'active').slice(0, goalLimit) as {
    id: string;
    aspiration_statement: string;
    trait_archetype: string;
    operational_definition: string;
  }[];
  if (goals.length === 0) return '(no active identity goals)';
  const gaps = assessIdentityBehaviorGap(userId);
  const gapMap = new Map(gaps.map((g) => [g.goalId, g]));
  const parts: string[] = [];
  for (const g of goals) {
    parts.push(
      `### ${g.trait_archetype}\nAspiration: ${g.aspiration_statement.slice(0, 500)}\nOperational def: ${(g.operational_definition || '(none)').slice(0, 400)}`
    );
    const protos = listActionProtocolsForGoal(userId, g.id) as { title: string; review_cadence: string }[];
    for (const p of protos) {
      parts.push(`  - Protocol: ${p.title} | review: ${p.review_cadence || '—'}`);
    }
    const gg = gapMap.get(g.id);
    if (gg && gg.behaviorCount < 2) {
      parts.push(`  ⚠ low behavioral specificity (${gg.behaviorCount} observable behaviors across ${gg.protocolCount} protocols)`);
    }
  }
  return parts.join('\n');
}
