import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
import {
  legacyArtifactKindSchema,
  legacyArtifactStatusSchema,
  legacyExtractionTriggerSchema,
  legacyProvenanceSchema,
} from '../../types/legacyLayer.js';
import { recordGovernanceAudit } from './governanceAudit.js';

function nowIso(): string {
  return new Date().toISOString();
}

function stableVersionGroup(userId: string, title: string): string {
  const h = createHash('sha256').update(`${userId}:${title.trim().toLowerCase().slice(0, 120)}`).digest('hex');
  return `legacy:${userId}:${h.slice(0, 24)}`;
}

function fingerprintText(title: string, body: string): string {
  return createHash('sha256').update(`${title}\n${body}`.slice(0, 8000)).digest('hex').slice(0, 32);
}

/** Heuristic signals for suggesting legacy capture (no LLM). */
export const LEGACY_EXTRACTION_TRIGGERS = {
  principlePhrases: [
    /\b(from now on|I will never|non-negotiable|my law is|I finally see that|the real lesson)\b/i,
    /\b(always remember|enduring principle|core doctrine|what I stand for)\b/i,
  ],
  lessonPhrases: [/\b(lesson learned|what I got wrong|I was wrong about|cost me)\b/i],
  frameworkPhrases: [/\b(heuristic|framework|when X then Y|decision rule)\b/i],
};

export function evaluateLegacyExtractionSignals(userText: string): { suggest: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const re of LEGACY_EXTRACTION_TRIGGERS.principlePhrases) {
    if (re.test(userText)) reasons.push('principle_language');
  }
  for (const re of LEGACY_EXTRACTION_TRIGGERS.lessonPhrases) {
    if (re.test(userText)) reasons.push('lesson_language');
  }
  for (const re of LEGACY_EXTRACTION_TRIGGERS.frameworkPhrases) {
    if (re.test(userText)) reasons.push('framework_language');
  }
  return { suggest: reasons.length > 0, reasons };
}

export function createLegacyArtifact(input: {
  userId: string;
  artifactKind: string;
  title: string;
  body: string;
  durabilityScore?: number;
  fleetingVsPrincipleNote?: string;
  provenance: string;
  extractionTrigger?: string;
  extractionContext?: Record<string, unknown>;
  reviewCadenceHint?: string;
  versionGroupId?: string;
  patternFingerprint?: string | null;
}): string {
  legacyArtifactKindSchema.parse(input.artifactKind);
  legacyProvenanceSchema.parse(input.provenance);
  const trigger = input.extractionTrigger ?? 'manual';
  legacyExtractionTriggerSchema.parse(trigger);

  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  const vg = input.versionGroupId ?? stableVersionGroup(input.userId, input.title);
  const fp = input.patternFingerprint ?? fingerprintText(input.title, input.body);

  db.prepare(
    `INSERT INTO legacy_artifacts (
      id, user_id, artifact_kind, title, body, durability_score, fleeting_vs_principle_note, provenance,
      status, version_group_id, version, supersedes_id, extraction_trigger, extraction_context_json,
      pattern_fingerprint, review_cadence_hint, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 1, NULL, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.artifactKind,
    input.title.trim().slice(0, 500),
    input.body.trim().slice(0, 100_000),
    input.durabilityScore ?? 0.65,
    (input.fleetingVsPrincipleNote ?? '').trim().slice(0, 5000),
    input.provenance,
    vg,
    trigger,
    input.extractionContext != null ? JSON.stringify(input.extractionContext) : null,
    fp,
    (input.reviewCadenceHint ?? '').trim().slice(0, 2000),
    ts,
    ts
  );

  recordGovernanceAudit({
    userId: input.userId,
    action: 'legacy_artifact_create',
    entityType: 'legacy_artifact',
    entityId: id,
  });
  return id;
}

/** New version row; archives prior active row in same version group. */
export function reviseLegacyArtifact(input: {
  userId: string;
  priorId: string;
  title?: string;
  body?: string;
  durabilityScore?: number;
  fleetingVsPrincipleNote?: string;
  reviewCadenceHint?: string;
}): string {
  const db = getDb();
  const prior = db
    .prepare(`SELECT * FROM legacy_artifacts WHERE id = ? AND user_id = ?`)
    .get(input.priorId, input.userId) as
    | {
        version_group_id: string;
        version: number;
        title: string;
        body: string;
        artifact_kind: string;
        provenance: string;
        extraction_trigger: string;
        pattern_fingerprint: string | null;
      }
    | undefined;
  if (!prior) throw new Error('legacy_artifact_not_found');

  const nextVersion = prior.version + 1;
  const id = randomUUID();
  const ts = nowIso();
  const title = (input.title ?? prior.title).trim().slice(0, 500);
  const body = (input.body ?? prior.body).trim().slice(0, 100_000);

  db.prepare(`UPDATE legacy_artifacts SET archived_at = ?, status = 'archived', updated_at = ? WHERE id = ?`).run(
    ts,
    ts,
    input.priorId
  );

  db.prepare(
    `INSERT INTO legacy_artifacts (
      id, user_id, artifact_kind, title, body, durability_score, fleeting_vs_principle_note, provenance,
      status, version_group_id, version, supersedes_id, extraction_trigger, extraction_context_json,
      pattern_fingerprint, review_cadence_hint, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, NULL, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    prior.artifact_kind,
    title,
    body,
    input.durabilityScore ?? 0.65,
    (input.fleetingVsPrincipleNote ?? '').trim().slice(0, 5000),
    prior.provenance,
    prior.version_group_id,
    nextVersion,
    input.priorId,
    prior.extraction_trigger,
    fingerprintText(title, body),
    (input.reviewCadenceHint ?? '').trim().slice(0, 2000),
    ts,
    ts
  );

  recordGovernanceAudit({
    userId: input.userId,
    action: 'legacy_artifact_revise',
    entityType: 'legacy_artifact',
    entityId: id,
    payload: { priorId: input.priorId },
  });
  return id;
}

export function linkLegacyToEntity(input: {
  legacyId: string;
  entityType: string;
  entityId: string;
  linkRole?: string;
}): string {
  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO legacy_entity_links (id, legacy_id, entity_type, entity_id, link_role, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, input.legacyId, input.entityType, input.entityId, input.linkRole ?? 'supports', ts);
  return id;
}

export function listLegacyArtifacts(userId: string, opts?: { status?: string; limit?: number }) {
  const db = getDb();
  const limit = opts?.limit ?? 100;
  if (opts?.status) {
    legacyArtifactStatusSchema.parse(opts.status);
    return db
      .prepare(
        `SELECT * FROM legacy_artifacts WHERE user_id = ? AND status = ? AND archived_at IS NULL ORDER BY durability_score DESC, updated_at DESC LIMIT ?`
      )
      .all(userId, opts.status, limit) as Record<string, unknown>[];
  }
  return db
    .prepare(
      `SELECT * FROM legacy_artifacts WHERE user_id = ? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT ?`
    )
    .all(userId, limit) as Record<string, unknown>[];
}

export function setLegacyArtifactStatus(userId: string, artifactId: string, status: string): void {
  legacyArtifactStatusSchema.parse(status);
  const db = getDb();
  const ts = nowIso();
  const n = db
    .prepare(
      `UPDATE legacy_artifacts SET status = ?, archived_at = CASE WHEN ? = 'archived' THEN ? ELSE archived_at END, updated_at = ? WHERE id = ? AND user_id = ?`
    )
    .run(status, status, ts, ts, artifactId, userId).changes;
  if (!n) throw new Error('legacy_artifact_not_found');
}

export function formatLegacyArtifactsForPrompt(userId: string, limit = 14): string {
  const rows = listLegacyArtifacts(userId, { status: 'active', limit }) as {
    artifact_kind: string;
    title: string;
    body: string;
    durability_score: number;
  }[];
  if (rows.length === 0) return '(no active legacy artifacts — durable doctrine not yet codified)';
  return rows
    .map(
      (r) =>
        `### [${r.artifact_kind}] ${r.title} (durability=${r.durability_score.toFixed(2)})\n${r.body.slice(0, 1200)}${r.body.length > 1200 ? '…' : ''}`
    )
    .join('\n\n');
}
