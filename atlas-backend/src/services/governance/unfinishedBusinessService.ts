import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
import type { UnfinishedKind, UnfinishedStatus } from '../../types/longitudinal.js';
import { unfinishedKindSchema, unfinishedStatusSchema } from '../../types/longitudinal.js';
import { computePatternFingerprint } from './evolutionTimelineService.js';
import { recordGovernanceAudit } from './governanceAudit.js';

function nowIso(): string {
  return new Date().toISOString();
}

export function computeUnfinishedCompositeScore(input: {
  significance: number;
  recurrence: number;
  urgency: number;
  identityRelevance: number;
}): number {
  const s = Math.max(0, Math.min(1, input.significance));
  const r = Math.max(0, Math.min(1, input.recurrence));
  const u = Math.max(0, Math.min(1, input.urgency));
  const i = Math.max(0, Math.min(1, input.identityRelevance));
  return Number((0.35 * s + 0.25 * r + 0.2 * u + 0.2 * i).toFixed(4));
}

export interface UnfinishedRow {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  description: string;
  significance_score: number;
  recurrence_score: number;
  urgency_score: number;
  identity_relevance_score: number;
  composite_score: number;
  surfaced_count: number;
  last_surfaced_at: string | null;
  status: string;
  decision_id: string | null;
  constitution_version_group_id: string | null;
  linked_claim_ids_json: string;
  pattern_fingerprint: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
}

export function createUnfinishedItem(input: {
  userId: string;
  kind: UnfinishedKind;
  title: string;
  description: string;
  significanceScore?: number;
  recurrenceScore?: number;
  urgencyScore?: number;
  identityRelevanceScore?: number;
  decisionId?: string | null;
  constitutionVersionGroupId?: string | null;
  linkedClaimIds?: string[];
  patternFingerprint?: string | null;
}): UnfinishedRow {
  unfinishedKindSchema.parse(input.kind);
  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  const sig = input.significanceScore ?? 0.5;
  const rec = input.recurrenceScore ?? 0;
  const urg = input.urgencyScore ?? 0.5;
  const idrel = input.identityRelevanceScore ?? 0.5;
  const composite = computeUnfinishedCompositeScore({
    significance: sig,
    recurrence: rec,
    urgency: urg,
    identityRelevance: idrel,
  });
  const fp = input.patternFingerprint ?? computePatternFingerprint(`${input.title}\n${input.description}`);

  db.prepare(
    `INSERT INTO unfinished_business_items (
      id, user_id, kind, title, description, significance_score, recurrence_score, urgency_score,
      identity_relevance_score, composite_score, surfaced_count, last_surfaced_at, status,
      decision_id, constitution_version_group_id, linked_claim_ids_json, pattern_fingerprint,
      created_at, updated_at, resolved_at, resolution_note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 'open', ?, ?, ?, ?, ?, ?, NULL, NULL)`
  ).run(
    id,
    input.userId,
    input.kind,
    input.title.trim(),
    input.description.trim(),
    sig,
    rec,
    urg,
    idrel,
    composite,
    input.decisionId ?? null,
    input.constitutionVersionGroupId ?? null,
    JSON.stringify(input.linkedClaimIds ?? []),
    fp,
    ts,
    ts
  );

  recordGovernanceAudit({
    userId: input.userId,
    action: 'unfinished_business_create',
    entityType: 'unfinished_business_item',
    entityId: id,
    payload: { kind: input.kind, composite },
  });

  return db.prepare(`SELECT * FROM unfinished_business_items WHERE id = ?`).get(id) as UnfinishedRow;
}

export function bumpRecurrence(userId: string, itemId: string, delta = 0.15): void {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM unfinished_business_items WHERE id = ? AND user_id = ?`)
    .get(itemId, userId) as UnfinishedRow | undefined;
  if (!row) throw new Error('unfinished_not_found');
  const rec = Math.min(1, row.recurrence_score + delta);
  const composite = computeUnfinishedCompositeScore({
    significance: row.significance_score,
    recurrence: rec,
    urgency: row.urgency_score,
    identityRelevance: row.identity_relevance_score,
  });
  const ts = nowIso();
  db.prepare(
    `UPDATE unfinished_business_items SET recurrence_score = ?, composite_score = ?, updated_at = ? WHERE id = ?`
  ).run(rec, composite, ts, itemId);
}

export function recordUnfinishedSurfaced(userId: string, itemId: string): void {
  const db = getDb();
  const ts = nowIso();
  const n = db
    .prepare(
      `UPDATE unfinished_business_items SET surfaced_count = surfaced_count + 1, last_surfaced_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`
    )
    .run(ts, ts, itemId, userId).changes;
  if (!n) throw new Error('unfinished_not_found');
}

export function listOpenUnfinishedRanked(userId: string, limit = 30): UnfinishedRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM unfinished_business_items
       WHERE user_id = ? AND status = 'open'
       ORDER BY composite_score DESC, urgency_score DESC, updated_at DESC
       LIMIT ?`
    )
    .all(userId, limit) as UnfinishedRow[];
}

export function resolveUnfinishedItem(
  userId: string,
  itemId: string,
  status: UnfinishedStatus,
  resolutionNote: string
): void {
  unfinishedStatusSchema.parse(status);
  if (status === 'open') throw new Error('use_defer_or_resolve');
  const db = getDb();
  const ts = nowIso();
  const n = db
    .prepare(
      `UPDATE unfinished_business_items SET status = ?, resolution_note = ?, resolved_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`
    )
    .run(status, resolutionNote.trim(), status === 'resolved' || status === 'archived' ? ts : null, ts, itemId, userId)
    .changes;
  if (!n) throw new Error('unfinished_not_found');
  recordGovernanceAudit({
    userId,
    action: 'unfinished_business_resolve',
    entityType: 'unfinished_business_item',
    entityId: itemId,
    payload: { status },
  });
}

/** Items with same fingerprint — recurring open loops under different wording. */
export function findSimilarUnfinished(userId: string, fingerprint: string): UnfinishedRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM unfinished_business_items
       WHERE user_id = ? AND pattern_fingerprint = ? AND status = 'open'
       ORDER BY composite_score DESC`
    )
    .all(userId, fingerprint) as UnfinishedRow[];
}

export function formatUnfinishedBusinessForPrompt(userId: string, limit = 12): string {
  const rows = listOpenUnfinishedRanked(userId, limit);
  if (rows.length === 0) return '(no open unfinished_business_items — not a session log)';
  return rows
    .map(
      (r) =>
        `- [${r.kind}] score=${r.composite_score.toFixed(2)} sig=${r.significance_score.toFixed(2)} rec=${r.recurrence_score.toFixed(2)} urg=${r.urgency_score.toFixed(2)} id=${r.id}\n  ${r.title}: ${r.description.slice(0, 400)}${r.description.length > 400 ? '…' : ''}`
    )
    .join('\n');
}
