import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
import type {
  ClaimType,
  ContradictionStatus,
  EpistemicState,
  EvidenceSourceClass,
  LinkRole,
  Provenance,
} from '../../types/cognitiveSovereignty.js';
import {
  claimTypeSchema,
  contradictionStatusSchema,
  epistemicStateSchema,
  evidenceSourceClassSchema,
  linkRoleSchema,
  provenanceSchema,
} from '../../types/cognitiveSovereignty.js';
import { recordGovernanceAudit } from './governanceAudit.js';

export interface EpistemicClaimRow {
  id: string;
  user_id: string;
  statement: string;
  claim_type: string;
  epistemic_state: string;
  confidence: number;
  provenance: string;
  constitution_clause_id: string | null;
  superseded_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface EpistemicEvidenceRow {
  id: string;
  user_id: string;
  source_class: string;
  source_ref: string | null;
  excerpt: string;
  retrieved_at: string | null;
  support_strength: number;
  verified_at: string | null;
  created_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createClaim(input: {
  userId: string;
  statement: string;
  claimType: ClaimType;
  epistemicState: EpistemicState;
  confidence: number;
  provenance: Provenance;
  constitutionClauseId?: string | null;
}): EpistemicClaimRow {
  claimTypeSchema.parse(input.claimType);
  epistemicStateSchema.parse(input.epistemicState);
  provenanceSchema.parse(input.provenance);
  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO epistemic_claims (
      id, user_id, statement, claim_type, epistemic_state, confidence, provenance,
      constitution_clause_id, superseded_by_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
  ).run(
    id,
    input.userId,
    input.statement.trim(),
    input.claimType,
    input.epistemicState,
    Math.max(0, Math.min(1, input.confidence)),
    input.provenance,
    input.constitutionClauseId ?? null,
    ts,
    ts
  );
  recordGovernanceAudit({
    userId: input.userId,
    action: 'epistemic_claim_create',
    entityType: 'epistemic_claim',
    entityId: id,
  });
  return db.prepare(`SELECT * FROM epistemic_claims WHERE id = ?`).get(id) as EpistemicClaimRow;
}

export function supersedeClaim(userId: string, claimId: string, newStatement: string): EpistemicClaimRow {
  const db = getDb();
  const old = db
    .prepare(`SELECT * FROM epistemic_claims WHERE user_id = ? AND id = ?`)
    .get(userId, claimId) as EpistemicClaimRow | undefined;
  if (!old) throw new Error('claim_not_found');

  const newId = randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO epistemic_claims (
      id, user_id, statement, claim_type, epistemic_state, confidence, provenance,
      constitution_clause_id, superseded_by_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
  ).run(
    newId,
    userId,
    newStatement.trim(),
    old.claim_type,
    old.epistemic_state,
    old.confidence,
    old.provenance,
    old.constitution_clause_id,
    ts,
    ts
  );
  db.prepare(`UPDATE epistemic_claims SET superseded_by_id = ?, updated_at = ? WHERE id = ?`).run(
    newId,
    ts,
    claimId
  );
  recordGovernanceAudit({
    userId,
    action: 'epistemic_claim_supersede',
    entityType: 'epistemic_claim',
    entityId: newId,
    payload: { priorId: claimId },
  });
  return db.prepare(`SELECT * FROM epistemic_claims WHERE id = ?`).get(newId) as EpistemicClaimRow;
}

export function createEvidence(input: {
  userId: string;
  sourceClass: EvidenceSourceClass;
  excerpt: string;
  sourceRef?: string | null;
  retrievedAt?: string | null;
  supportStrength?: number;
}): EpistemicEvidenceRow {
  evidenceSourceClassSchema.parse(input.sourceClass);
  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  const str = input.supportStrength ?? 0.5;
  db.prepare(
    `INSERT INTO epistemic_evidence (
      id, user_id, source_class, source_ref, excerpt, retrieved_at, support_strength, verified_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`
  ).run(
    id,
    input.userId,
    input.sourceClass,
    input.sourceRef ?? null,
    input.excerpt.trim(),
    input.retrievedAt ?? null,
    Math.max(0, Math.min(1, str)),
    ts
  );
  recordGovernanceAudit({
    userId: input.userId,
    action: 'epistemic_evidence_create',
    entityType: 'epistemic_evidence',
    entityId: id,
  });
  return db.prepare(`SELECT * FROM epistemic_evidence WHERE id = ?`).get(id) as EpistemicEvidenceRow;
}

export function linkClaimToEvidence(input: {
  claimId: string;
  evidenceId: string;
  linkRole: LinkRole;
  strength?: number;
}): void {
  linkRoleSchema.parse(input.linkRole);
  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO claim_evidence_links (id, claim_id, evidence_id, link_role, strength, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.claimId,
    input.evidenceId,
    input.linkRole,
    Math.max(0, Math.min(1, input.strength ?? 0.5)),
    ts
  );
  recomputeClaimEpistemics(input.claimId);
}

export function registerContradiction(input: {
  userId: string;
  claimAId: string;
  claimBId: string;
  contradictionStrength?: number;
}): string {
  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO claim_contradictions (
      id, user_id, claim_a_id, claim_b_id, contradiction_strength, status, resolution_note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'open', NULL, ?, ?)`
  ).run(
    id,
    input.userId,
    input.claimAId,
    input.claimBId,
    Math.max(0, Math.min(1, input.contradictionStrength ?? 0.6)),
    ts,
    ts
  );
  db.prepare(
    `UPDATE epistemic_claims SET epistemic_state = 'contested', updated_at = ? WHERE id IN (?, ?) AND superseded_by_id IS NULL`
  ).run(ts, input.claimAId, input.claimBId);
  recordGovernanceAudit({
    userId: input.userId,
    action: 'claim_contradiction_register',
    entityType: 'claim_contradiction',
    entityId: id,
  });
  return id;
}

export function resolveContradiction(
  userId: string,
  contradictionId: string,
  status: ContradictionStatus,
  resolutionNote: string
): void {
  contradictionStatusSchema.parse(status);
  const db = getDb();
  const ts = nowIso();
  const row = db
    .prepare(`SELECT * FROM claim_contradictions WHERE id = ? AND user_id = ?`)
    .get(contradictionId, userId) as { id: string } | undefined;
  if (!row) throw new Error('contradiction_not_found');
  db.prepare(
    `UPDATE claim_contradictions SET status = ?, resolution_note = ?, updated_at = ? WHERE id = ?`
  ).run(status, resolutionNote.trim(), ts, contradictionId);
  recordGovernanceAudit({
    userId,
    action: 'claim_contradiction_resolve',
    entityType: 'claim_contradiction',
    entityId: contradictionId,
    payload: { status },
  });
}

/** Recompute epistemic_state + confidence from evidence links (deterministic). */
export function recomputeClaimEpistemics(claimId: string): void {
  const db = getDb();
  const links = db
    .prepare(
      `SELECT l.link_role, l.strength, e.support_strength
       FROM claim_evidence_links l
       JOIN epistemic_evidence e ON e.id = l.evidence_id
       WHERE l.claim_id = ?`
    )
    .all(claimId) as { link_role: string; strength: number; support_strength: number }[];

  if (links.length === 0) return;

  let supportScore = 0;
  let contraScore = 0;
  for (const L of links) {
    const w = L.strength * L.support_strength;
    if (L.link_role === 'supports') supportScore += w;
    if (L.link_role === 'contradicts') contraScore += w;
  }

  const claim = db.prepare(`SELECT * FROM epistemic_claims WHERE id = ?`).get(claimId) as
    | EpistemicClaimRow
    | undefined;
  if (!claim || claim.superseded_by_id) return;

  let state: EpistemicState = claim.epistemic_state as EpistemicState;
  let confidence = claim.confidence;

  if (contraScore > supportScore + 0.2) {
    state = 'contested';
    confidence = Math.max(0.15, confidence * 0.6);
  } else if (supportScore >= 1.2) {
    state = 'strongly_supported';
    confidence = Math.min(0.95, 0.45 + supportScore * 0.15);
  } else if (supportScore >= 0.45) {
    state = 'partially_supported';
    confidence = Math.min(0.85, 0.35 + supportScore * 0.2);
  } else {
    state = 'weakly_grounded';
    confidence = Math.max(0.2, confidence * 0.75);
  }

  epistemicStateSchema.parse(state);
  const ts = nowIso();
  db.prepare(`UPDATE epistemic_claims SET epistemic_state = ?, confidence = ?, updated_at = ? WHERE id = ?`).run(
    state,
    confidence,
    ts,
    claimId
  );
}

export function listActiveClaims(userId: string, limit = 100): EpistemicClaimRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM epistemic_claims
       WHERE user_id = ? AND superseded_by_id IS NULL
       ORDER BY updated_at DESC
       LIMIT ?`
    )
    .all(userId, limit) as EpistemicClaimRow[];
}

export function listOpenContradictions(userId: string): unknown[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM claim_contradictions WHERE user_id = ? AND status = 'open' ORDER BY created_at DESC`)
    .all(userId);
}

export function formatTruthLedgerForPrompt(userId: string, limit = 24): string {
  const claims = listActiveClaims(userId, limit);
  if (claims.length === 0) return '(no epistemic_claims on file — legacy truth_entries may still apply)';
  return claims
    .map(
      (c) =>
        `- [${c.epistemic_state} conf=${c.confidence.toFixed(2)} provenance=${c.provenance}] ${c.statement.slice(0, 500)} (claim_id=${c.id})`
    )
    .join('\n');
}
