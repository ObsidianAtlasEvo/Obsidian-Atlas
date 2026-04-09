import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
import {
  selfRevisionCategorySchema,
  selfRevisionSeveritySchema,
  selfRevisionStatusSchema,
} from '../../types/strategicLayer.js';
import { recordGovernanceAudit } from './governanceAudit.js';
import { listActiveTwinTraits } from './cognitiveTwinService.js';
import { listOpenUnfinishedRanked } from './unfinishedBusinessService.js';

function nowIso(): string {
  return new Date().toISOString();
}

export function createSelfRevisionRecord(input: {
  userId: string;
  category: string;
  severity: string;
  detectedPattern: string;
  recommendationTitle: string;
  recommendationBody: string;
  betterStructures?: string[];
  triggerSources?: string[];
  linkedTwinDomains?: string[];
  linkedEvolutionFingerprints?: string[];
}): string {
  selfRevisionCategorySchema.parse(input.category);
  selfRevisionSeveritySchema.parse(input.severity);
  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO self_revision_records (
      id, user_id, category, severity, detected_pattern, recommendation_title, recommendation_body,
      better_structures_json, trigger_sources_json, linked_twin_domains_json, linked_evolution_fingerprints_json,
      status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`
  ).run(
    id,
    input.userId,
    input.category,
    input.severity,
    input.detectedPattern.trim().slice(0, 5000),
    input.recommendationTitle.trim().slice(0, 500),
    input.recommendationBody.trim().slice(0, 20_000),
    JSON.stringify(input.betterStructures ?? []),
    JSON.stringify(input.triggerSources ?? []),
    JSON.stringify(input.linkedTwinDomains ?? []),
    JSON.stringify(input.linkedEvolutionFingerprints ?? []),
    ts
  );
  recordGovernanceAudit({
    userId: input.userId,
    action: 'self_revision_create',
    entityType: 'self_revision_record',
    entityId: id,
  });
  return id;
}

export function setSelfRevisionStatus(
  userId: string,
  recordId: string,
  status: string,
  supersededById?: string | null
): void {
  selfRevisionStatusSchema.parse(status);
  const db = getDb();
  const n = db
    .prepare(
      `UPDATE self_revision_records SET status = ?, reviewed_at = ?, superseded_by_id = COALESCE(?, superseded_by_id)
       WHERE id = ? AND user_id = ?`
    )
    .run(status, nowIso(), supersededById ?? null, recordId, userId).changes;
  if (!n) throw new Error('self_revision_not_found');
}

export function listSelfRevisionRecords(userId: string, status?: string, limit = 60) {
  const db = getDb();
  if (status) {
    selfRevisionStatusSchema.parse(status);
    return db
      .prepare(
        `SELECT * FROM self_revision_records WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?`
      )
      .all(userId, status, limit) as Record<string, unknown>[];
  }
  return db
    .prepare(`SELECT * FROM self_revision_records WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(userId, limit) as Record<string, unknown>[];
}

/**
 * Lightweight heuristic triggers: high-urgency unfinished + low-confidence inferred twin traits.
 * Does not call an LLM; produces candidate records for user review.
 */
export function runSelfRevisionHeuristicTriggers(userId: string): string[] {
  const db = getDb();
  const created: string[] = [];
  const unfinished = listOpenUnfinishedRanked(userId, 5);
  for (const u of unfinished) {
    if (u.composite_score < 0.55) continue;
    const needle = `%unfinished_business:${u.id}%`;
    const dup = db
      .prepare(
        `SELECT id FROM self_revision_records WHERE user_id = ? AND status = 'open' AND trigger_sources_json LIKE ? LIMIT 1`
      )
      .get(userId, needle) as { id: string } | undefined;
    if (dup) continue;
    const id = createSelfRevisionRecord({
      userId,
      category: 'weak_self_correction',
      severity: u.composite_score > 0.75 ? 'high' : 'medium',
      detectedPattern: `Open loop recurrence: "${u.title.slice(0, 200)}"`,
      recommendationTitle: 'Close or renegotiate the loop explicitly',
      recommendationBody:
        'Name a single next action, deadline, or conscious deferral. If deferred, capture the condition under which it returns.',
      betterStructures: ['Written loop closure protocol', 'If-then re-entry rule for deferred items'],
      triggerSources: [`unfinished_business:${u.id}`],
      linkedTwinDomains: [],
      linkedEvolutionFingerprints: u.pattern_fingerprint ? [u.pattern_fingerprint] : [],
    });
    created.push(id);
  }

  const traits = listActiveTwinTraits(userId).filter((t) => t.source === 'system_inferred' && t.confidence < 0.45);
  for (const t of traits.slice(0, 3)) {
    const needle = `%cognitive_twin_trait:${t.id}%`;
    const dup = db
      .prepare(
        `SELECT id FROM self_revision_records WHERE user_id = ? AND status = 'open' AND trigger_sources_json LIKE ? LIMIT 1`
      )
      .get(userId, needle) as { id: string } | undefined;
    if (dup) continue;
    const id = createSelfRevisionRecord({
      userId,
      category: 'interpretation_instability',
      severity: 'low',
      detectedPattern: `Low-confidence inferred trait may be unstable: [${t.domain}] ${t.trait_key}`,
      recommendationTitle: 'Calibrate or explicitly declare this dimension',
      recommendationBody:
        'Either confirm with a concrete example, revise the trait, or promote a user_declared replacement so Atlas does not overfit noise.',
      betterStructures: ['Example-anchored trait definition', 'Quarterly twin review'],
      triggerSources: [`cognitive_twin_trait:${t.id}`],
      linkedTwinDomains: [t.domain],
      linkedEvolutionFingerprints: [],
    });
    created.push(id);
  }

  return created;
}

export function formatSelfRevisionForPrompt(userId: string, limit = 8): string {
  const rows = listSelfRevisionRecords(userId, 'open', limit) as {
    category: string;
    severity: string;
    recommendation_title: string;
    detected_pattern: string;
  }[];
  if (rows.length === 0) return '(no open self-revision records)';
  return rows
    .map(
      (r) =>
        `- [${r.severity}/${r.category}] ${r.recommendation_title}\n  Pattern: ${r.detected_pattern.slice(0, 280)}`
    )
    .join('\n');
}
