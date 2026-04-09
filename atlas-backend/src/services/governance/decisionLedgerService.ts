import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
import type { DecisionStatus } from '../../types/cognitiveSovereignty.js';
import { decisionStatusSchema } from '../../types/cognitiveSovereignty.js';
import { recordGovernanceAudit } from './governanceAudit.js';

export interface DecisionLedgerRow {
  id: string;
  user_id: string;
  statement: string;
  context: string;
  status: string;
  user_preference_snapshot: string | null;
  atlas_recommendation: string | null;
  risks_json: string;
  tradeoffs_json: string;
  expected_upside: string | null;
  predicted_downside: string | null;
  actual_outcome: string | null;
  variance_analysis: string | null;
  lesson_extracted: string | null;
  recurring_pattern_note: string | null;
  review_checkpoint_at: string | null;
  review_status: string | null;
  constitution_clause_ids_json: string;
  linked_claim_ids_json: string;
  created_at: string;
  updated_at: string;
}

export interface DecisionOptionRow {
  id: string;
  decision_id: string;
  label: string;
  rationale: string;
  rejected: number;
  chosen: number;
  sort_order: number;
  created_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createDecisionRecord(input: {
  userId: string;
  statement: string;
  context?: string;
  constitutionClauseIds?: string[];
  linkedClaimIds?: string[];
}): DecisionLedgerRow {
  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO decision_ledger (
      id, user_id, statement, context, status, user_preference_snapshot, atlas_recommendation,
      risks_json, tradeoffs_json, expected_upside, predicted_downside, actual_outcome,
      variance_analysis, lesson_extracted, recurring_pattern_note, review_checkpoint_at, review_status,
      constitution_clause_ids_json, linked_claim_ids_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'draft', NULL, NULL, '[]', '[]', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.statement.trim(),
    (input.context ?? '').trim(),
    JSON.stringify(input.constitutionClauseIds ?? []),
    JSON.stringify(input.linkedClaimIds ?? []),
    ts,
    ts
  );
  recordGovernanceAudit({
    userId: input.userId,
    action: 'decision_ledger_create',
    entityType: 'decision_ledger',
    entityId: id,
  });
  return db.prepare(`SELECT * FROM decision_ledger WHERE id = ?`).get(id) as DecisionLedgerRow;
}

export function addDecisionOption(input: {
  decisionId: string;
  label: string;
  rationale?: string;
  rejected?: boolean;
  sortOrder?: number;
}): DecisionOptionRow {
  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO decision_options (id, decision_id, label, rationale, rejected, chosen, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(
    id,
    input.decisionId,
    input.label.trim(),
    (input.rationale ?? '').trim(),
    input.rejected ? 1 : 0,
    input.sortOrder ?? 0,
    ts
  );
  return db.prepare(`SELECT * FROM decision_options WHERE id = ?`).get(id) as DecisionOptionRow;
}

export function markChosenOption(userId: string, decisionId: string, optionId: string): void {
  const db = getDb();
  const d = db
    .prepare(`SELECT id FROM decision_ledger WHERE id = ? AND user_id = ?`)
    .get(decisionId, userId) as { id: string } | undefined;
  if (!d) throw new Error('decision_not_found');
  const ts = nowIso();
  db.prepare(`UPDATE decision_options SET chosen = 0 WHERE decision_id = ?`).run(decisionId);
  const n = db
    .prepare(`UPDATE decision_options SET chosen = 1 WHERE id = ? AND decision_id = ?`)
    .run(optionId, decisionId).changes;
  if (!n) throw new Error('option_not_found');
  db.prepare(`UPDATE decision_ledger SET status = 'committed', updated_at = ? WHERE id = ?`).run(ts, decisionId);
}

export function updateDecisionAnalysis(input: {
  userId: string;
  decisionId: string;
  atlasRecommendation?: string;
  userPreferenceSnapshot?: string;
  risks?: string[];
  tradeoffs?: string[];
  expectedUpside?: string;
  predictedDownside?: string;
}): void {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM decision_ledger WHERE id = ? AND user_id = ?`)
    .get(input.decisionId, input.userId) as DecisionLedgerRow | undefined;
  if (!row) throw new Error('decision_not_found');
  const ts = nowIso();
  db.prepare(
    `UPDATE decision_ledger SET
      atlas_recommendation = COALESCE(?, atlas_recommendation),
      user_preference_snapshot = COALESCE(?, user_preference_snapshot),
      risks_json = COALESCE(?, risks_json),
      tradeoffs_json = COALESCE(?, tradeoffs_json),
      expected_upside = COALESCE(?, expected_upside),
      predicted_downside = COALESCE(?, predicted_downside),
      updated_at = ?
    WHERE id = ?`
  ).run(
    input.atlasRecommendation ?? null,
    input.userPreferenceSnapshot ?? null,
    input.risks != null ? JSON.stringify(input.risks) : null,
    input.tradeoffs != null ? JSON.stringify(input.tradeoffs) : null,
    input.expectedUpside ?? null,
    input.predictedDownside ?? null,
    ts,
    input.decisionId
  );
}

export function recordDecisionOutcome(input: {
  userId: string;
  decisionId: string;
  actualOutcome: string;
  varianceAnalysis?: string;
  lessonExtracted?: string;
  recurringPatternNote?: string;
}): void {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM decision_ledger WHERE id = ? AND user_id = ?`)
    .get(input.decisionId, input.userId) as DecisionLedgerRow | undefined;
  if (!row) throw new Error('decision_not_found');
  const ts = nowIso();
  db.prepare(
    `UPDATE decision_ledger SET
      actual_outcome = ?,
      variance_analysis = COALESCE(?, variance_analysis),
      lesson_extracted = COALESCE(?, lesson_extracted),
      recurring_pattern_note = COALESCE(?, recurring_pattern_note),
      status = 'reviewed',
      updated_at = ?
    WHERE id = ?`
  ).run(
    input.actualOutcome.trim(),
    input.varianceAnalysis ?? null,
    input.lessonExtracted ?? null,
    input.recurringPatternNote ?? null,
    ts,
    input.decisionId
  );
  recordGovernanceAudit({
    userId: input.userId,
    action: 'decision_outcome_record',
    entityType: 'decision_ledger',
    entityId: input.decisionId,
  });
}

export function scheduleDecisionReview(input: {
  userId: string;
  decisionId: string;
  checkpointAtIso: string;
}): void {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM decision_ledger WHERE id = ? AND user_id = ?`)
    .get(input.decisionId, input.userId) as DecisionLedgerRow | undefined;
  if (!row) throw new Error('decision_not_found');
  const ts = nowIso();
  db.prepare(
    `UPDATE decision_ledger SET review_checkpoint_at = ?, review_status = 'pending', updated_at = ? WHERE id = ?`
  ).run(input.checkpointAtIso, ts, input.decisionId);
}

export function listDecisions(userId: string, limit = 50): DecisionLedgerRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM decision_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(userId, limit) as DecisionLedgerRow[];
}

export function getDecisionWithOptions(
  userId: string,
  decisionId: string
): { decision: DecisionLedgerRow; options: DecisionOptionRow[] } | null {
  const db = getDb();
  const decision = db
    .prepare(`SELECT * FROM decision_ledger WHERE id = ? AND user_id = ?`)
    .get(decisionId, userId) as DecisionLedgerRow | undefined;
  if (!decision) return null;
  const options = db
    .prepare(`SELECT * FROM decision_options WHERE decision_id = ? ORDER BY sort_order ASC, created_at ASC`)
    .all(decisionId) as DecisionOptionRow[];
  return { decision, options };
}

export function setDecisionStatus(userId: string, decisionId: string, status: DecisionStatus): void {
  decisionStatusSchema.parse(status);
  const db = getDb();
  const n = db
    .prepare(`UPDATE decision_ledger SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
    .run(status, nowIso(), decisionId, userId).changes;
  if (!n) throw new Error('decision_not_found');
}
