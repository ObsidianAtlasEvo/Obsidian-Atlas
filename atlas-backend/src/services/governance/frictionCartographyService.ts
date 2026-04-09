import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
import { frictionTypeSchema } from '../../types/intelligenceChambers.js';
import { listOpenContradictions } from './truthEvidenceLedgerService.js';
import { listOpenUnfinishedRanked } from './unfinishedBusinessService.js';
import { listDecisions } from './decisionLedgerService.js';
import { listActiveTwinTraits } from './cognitiveTwinService.js';
import { recordGovernanceAudit } from './governanceAudit.js';

function nowIso(): string {
  return new Date().toISOString();
}

function insertFriction(input: {
  userId: string;
  frictionType: string;
  severity: number;
  title: string;
  description: string;
  rootHypothesis: string;
  surfaceNote: string;
  clusterKey: string;
  linkedUnfinishedId?: string | null;
  linkedDecisionId?: string | null;
  smallestRelease: string;
  recommendations: string[];
  recurrence?: number;
  identityRel?: number;
  constitutionalRel?: number;
}): void {
  frictionTypeSchema.parse(input.frictionType);
  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO friction_cartography_items (
      id, user_id, friction_type, severity, recurrence_score, identity_relevance, constitutional_relevance,
      title, description, root_hypothesis, surface_vs_root_note, cluster_key,
      linked_unfinished_id, linked_decision_id, reinforcing_item_ids_json, smallest_release_hint,
      recommendations_json, auto_generated, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, 1, 'active', ?, ?)`
  ).run(
    id,
    input.userId,
    input.frictionType,
    input.severity,
    input.recurrence ?? 0,
    input.identityRel ?? 0.5,
    input.constitutionalRel ?? 0,
    input.title.slice(0, 300),
    input.description.slice(0, 8000),
    input.rootHypothesis.slice(0, 2000),
    input.surfaceNote.slice(0, 2000),
    input.clusterKey,
    input.linkedUnfinishedId ?? null,
    input.linkedDecisionId ?? null,
    input.smallestRelease.slice(0, 1500),
    JSON.stringify(input.recommendations),
    ts,
    ts
  );
}

/** Rebuild heuristic friction map (does not delete user-authored rows). */
export function rebuildFrictionHeuristics(userId: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM friction_cartography_items WHERE user_id = ? AND auto_generated = 1`).run(userId);

  const unfinished = listOpenUnfinishedRanked(userId, 25);
  for (const u of unfinished) {
    if (u.composite_score < 0.5) continue;
    const isAvoid =
      u.kind === 'emotional_avoidance' || u.kind === 'avoided_conversation' || u.description.toLowerCase().includes('avoid');
    insertFriction({
      userId,
      frictionType: isAvoid ? 'fear_avoidance' : 'internal_conflict',
      severity: clamp01(u.composite_score),
      title: `Open loop: ${u.title.slice(0, 120)}`,
      description: u.description.slice(0, 2000),
      rootHypothesis: isAvoid
        ? 'Avoidance is consuming bandwidth that would otherwise close meaning.'
        : 'Unresolved significance is creating recurring drag without a closure protocol.',
      surfaceNote: 'User may attribute stuckness to busyness; structure suggests significance without closure.',
      clusterKey: `unfinished:${u.kind}`,
      linkedUnfinishedId: u.id,
      smallestRelease: 'Schedule a 12-minute decision: close, delegate, or consciously defer with a written re-entry rule.',
      recommendations: ['Use Threshold Protocol for overwhelm if this loop spikes under stress.', 'Link to one decision record if the loop is choice-shaped.'],
      recurrence: u.recurrence_score,
      identityRel: u.identity_relevance_score,
    });
  }

  const decisions = listDecisions(userId, 30).filter((d) => d.status === 'draft');
  if (decisions.length >= 4) {
    insertFriction({
      userId,
      frictionType: 'ambiguity',
      severity: clamp01(0.45 + decisions.length * 0.02),
      title: 'Decision draft backlog',
      description: `${decisions.length} decisions remain in draft — ambiguity friction often masquerades as prudence.`,
      rootHypothesis: 'Commitment avoidance or missing decision protocol under uncertainty.',
      surfaceNote: 'Surface story is often “I need more data.”',
      clusterKey: 'decision:draft_backlog',
      linkedDecisionId: decisions[0]?.id ?? null,
      smallestRelease: 'Pick the single highest-stakes draft; write one-sentence commitment or explicit deferral rule.',
      recommendations: ['Open Decision view; add explicit tradeoff fields.', 'Run Simulation Forge on top contender.'],
    });
  }

  const twin = listActiveTwinTraits(userId).filter((t) => t.source === 'system_inferred' && t.confidence < 0.42);
  if (twin.length >= 3) {
    insertFriction({
      userId,
      frictionType: 'cognitive',
      severity: 0.55,
      title: 'Under-calibrated cognitive model',
      description: 'Multiple low-confidence inferred twin traits increase misalignment risk between guidance and reality.',
      rootHypothesis: 'Insufficient explicit user declarations; model is interpolating noise.',
      surfaceNote: 'Feels like “Atlas doesn’t get me” when it is under-specified.',
      clusterKey: 'twin:low_confidence_cluster',
      smallestRelease: 'Confirm or correct one trait with a concrete behavioral example.',
      recommendations: ['Declare one user_authored twin trait.', 'Run self-revision heuristic triggers.'],
    });
  }

  const contradictions = listOpenContradictions(userId);
  if (contradictions.length > 0) {
    insertFriction({
      userId,
      frictionType: 'hidden_contradiction',
      severity: clamp01(0.5 + contradictions.length * 0.06),
      title: 'Open epistemic contradictions',
      description: 'Contradictions force either split-brain reasoning or quiet rationalization.',
      rootHypothesis: 'Competing claims have not been reconciled at the evidence layer.',
      surfaceNote: 'User may experience as general confusion or irritability.',
      clusterKey: 'epistemic:open_contradictions',
      smallestRelease: 'Pick one contradiction pair; schedule Truth Chamber pass or manual resolution note.',
      recommendations: ['Truth Chamber on the weaker claim.', 'Attach evidence or supersede a claim.'],
      constitutionalRel: 0.4,
    });
  }

  recordGovernanceAudit({
    userId,
    action: 'friction_cartography_rebuild',
    entityType: 'friction_cartography',
    entityId: userId,
  });
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function listFrictionItems(userId: string, limit = 80) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM friction_cartography_items WHERE user_id = ? AND status = 'active' ORDER BY severity DESC, updated_at DESC LIMIT ?`
    )
    .all(userId, limit) as Record<string, unknown>[];
}

export function createFrictionItemManual(input: {
  userId: string;
  frictionType: string;
  severity: number;
  title: string;
  description: string;
  rootHypothesis?: string;
  surfaceNote?: string;
  clusterKey?: string;
  smallestRelease?: string;
  recommendations?: string[];
}): string {
  frictionTypeSchema.parse(input.frictionType);
  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO friction_cartography_items (
      id, user_id, friction_type, severity, recurrence_score, identity_relevance, constitutional_relevance,
      title, description, root_hypothesis, surface_vs_root_note, cluster_key,
      linked_unfinished_id, linked_decision_id, reinforcing_item_ids_json, smallest_release_hint,
      recommendations_json, auto_generated, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 0, 0.5, 0, ?, ?, ?, ?, ?, NULL, NULL, '[]', ?, ?, 0, 'active', ?, ?)`
  ).run(
    id,
    input.userId,
    input.frictionType,
    clamp01(input.severity),
    input.title.slice(0, 300),
    input.description.slice(0, 8000),
    (input.rootHypothesis ?? '').slice(0, 2000),
    (input.surfaceNote ?? '').slice(0, 2000),
    (input.clusterKey ?? 'manual').slice(0, 120),
    (input.smallestRelease ?? '').slice(0, 1500),
    JSON.stringify(input.recommendations ?? []),
    ts,
    ts
  );
  return id;
}

export function clusterFrictionSummary(userId: string): { cluster_key: string; count: number; max_severity: number }[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT cluster_key, COUNT(*) as count, MAX(severity) as max_severity
       FROM friction_cartography_items WHERE user_id = ? AND status = 'active' AND cluster_key IS NOT NULL
       GROUP BY cluster_key ORDER BY max_severity DESC`
    )
    .all(userId) as { cluster_key: string; count: number; max_severity: number }[];
}
