import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
import { provenanceSchema } from '../../types/cognitiveSovereignty.js';
import { recordGovernanceAudit } from './governanceAudit.js';

function nowIso(): string {
  return new Date().toISOString();
}

export function recordDistortionObservation(input: {
  userId: string;
  patternLabel: string;
  description: string;
  provenance: string;
  confidence?: number;
  sourceChamberSessionId?: string | null;
  linkedClaimId?: string | null;
}): string {
  provenanceSchema.parse(input.provenance);
  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO cognitive_distortion_observations (
      id, user_id, pattern_label, description, provenance, confidence, source_chamber_session_id, linked_claim_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.patternLabel.trim().slice(0, 200),
    input.description.trim().slice(0, 10_000),
    input.provenance,
    input.confidence ?? 0.5,
    input.sourceChamberSessionId ?? null,
    input.linkedClaimId ?? null,
    ts
  );
  recordGovernanceAudit({
    userId: input.userId,
    action: 'distortion_observation_record',
    entityType: 'cognitive_distortion_observation',
    entityId: id,
  });
  return id;
}

export function listActiveDistortionObservations(userId: string, limit = 24) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM cognitive_distortion_observations WHERE user_id = ? AND archived_at IS NULL ORDER BY created_at DESC LIMIT ?`
    )
    .all(userId, limit) as Record<string, unknown>[];
}

export function formatDistortionObservationsForPrompt(userId: string, limit = 10): string {
  const rows = listActiveDistortionObservations(userId, limit) as {
    pattern_label: string;
    description: string;
    confidence: number;
    provenance: string;
  }[];
  if (rows.length === 0) return '(no recorded distortion observations)';
  return rows
    .map(
      (r) =>
        `- [${r.pattern_label}] (${r.provenance}, conf=${r.confidence.toFixed(2)}) ${r.description.slice(0, 400)}${r.description.length > 400 ? '…' : ''}`
    )
    .join('\n');
}
