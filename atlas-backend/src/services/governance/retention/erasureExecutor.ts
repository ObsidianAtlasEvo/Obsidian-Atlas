/**
 * Erasure Executor — Phase 4 §5
 *
 * GDPR/CCPA right-to-erasure implementation. Handles user data
 * deletion requests with a 72-hour SLA. Generates SHA-256
 * certificates of erasure completion.
 */

import { createHash, randomUUID } from 'node:crypto';
import { getDb } from '../../../db/sqlite.js';
import { logRetentionEvent } from './retentionAuditTrail.js';

export interface ErasureRequest {
  requestId?: string;
  userId: string;
  email: string;
  requestedAt?: Date;
  reason?: 'GDPR' | 'CCPA' | 'USER_REQUEST';
}

export interface ErasureCertificate {
  requestId: string;
  userId: string;
  completedAt: Date;
  tablesErased: string[];
  sha256: string;
}

export interface ErasureStatus {
  requestId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  completedAt?: Date;
  certificate?: ErasureCertificate;
}

interface ErasureRow {
  id: string;
  user_id: string;
  email: string;
  reason: string;
  status: string;
  requested_at: string;
  completed_at: string | null;
  certificate_json: string | null;
}

/** Tables containing user PII eligible for erasure. */
const PII_TABLES: { table: string; userColumn: string }[] = [
  { table: 'memories', userColumn: 'user_id' },
  { table: 'traces', userColumn: 'user_id' },
  { table: 'policy_profiles', userColumn: 'user_id' },
  { table: 'constitution_clauses', userColumn: 'user_id' },
  { table: 'epistemic_claims', userColumn: 'user_id' },
  { table: 'epistemic_evidence', userColumn: 'user_id' },
  { table: 'decision_ledger', userColumn: 'user_id' },
  { table: 'cognitive_governance_audit', userColumn: 'user_id' },
  { table: 'evolution_timeline_events', userColumn: 'user_id' },
  { table: 'cognitive_twin_traits', userColumn: 'user_id' },
  { table: 'adversarial_chamber_sessions', userColumn: 'user_id' },
  { table: 'atlas_sovereign_audit', userColumn: 'user_id' },
  { table: 'atlas_evolution_signals', userColumn: 'user_id' },
];

function generateCertificateHash(cert: {
  requestId: string;
  userId: string;
  tablesErased: string[];
  completedAt: Date;
}): string {
  const payload = JSON.stringify({
    requestId: cert.requestId,
    userId: cert.userId,
    tablesErased: cert.tablesErased,
    completedAt: cert.completedAt,
  });
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Initiate an erasure request. SLA: 72 hours.
 */
export async function requestErasure(request: ErasureRequest): Promise<ErasureCertificate> {
  const db = getDb();
  const requestId = request.requestId ?? randomUUID();
  const requestedAt = request.requestedAt ?? new Date();
  const reason = request.reason ?? 'USER_REQUEST';

  db.prepare(
    `INSERT INTO atlas_erasure_requests (id, user_id, email, reason, status, requested_at)
     VALUES (?, ?, ?, ?, 'PENDING', ?)`
  ).run(requestId, request.userId, request.email, reason, requestedAt.toISOString());

  await logRetentionEvent({
    type: 'ERASURE',
    userId: request.userId,
    actorId: request.email,
    detail: `Erasure requested (${reason}): ${requestId}`,
  });

  return executeErasure(requestId);
}

/**
 * Execute the actual erasure for a given request ID. Deletes or nullifies
 * all PII across relevant tables and generates a SHA-256 certificate.
 */
export async function executeErasure(requestId: string): Promise<ErasureCertificate> {
  const db = getDb();

  const row = db.prepare(
    `SELECT * FROM atlas_erasure_requests WHERE id = ?`
  ).get(requestId) as ErasureRow | undefined;

  if (!row) {
    throw new Error(`Erasure request ${requestId} not found`);
  }

  if (row.status === 'COMPLETED' && row.certificate_json) {
    const cert = JSON.parse(row.certificate_json) as ErasureCertificate & { completedAt: string };
    return { ...cert, completedAt: new Date(cert.completedAt) };
  }

  // Mark as in-progress
  db.prepare(
    `UPDATE atlas_erasure_requests SET status = 'IN_PROGRESS' WHERE id = ?`
  ).run(requestId);

  const tablesErased: string[] = [];

  for (const { table, userColumn } of PII_TABLES) {
    try {
      // Check if table exists
      const exists = db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
      ).get(table);
      if (!exists) continue;

      const result = db.prepare(
        `DELETE FROM ${table} WHERE ${userColumn} = ?`
      ).run(row.user_id);

      if (result.changes > 0) {
        tablesErased.push(table);
      }
    } catch {
      // Table may not exist in all deployments; continue
    }
  }

  const completedAt = new Date();
  const certificate: ErasureCertificate = {
    requestId,
    userId: row.user_id,
    completedAt,
    tablesErased,
    sha256: generateCertificateHash({ requestId, userId: row.user_id, tablesErased, completedAt }),
  };

  db.prepare(
    `UPDATE atlas_erasure_requests SET status = 'COMPLETED', completed_at = ?, certificate_json = ? WHERE id = ?`
  ).run(completedAt.toISOString(), JSON.stringify(certificate), requestId);

  await logRetentionEvent({
    type: 'ERASURE',
    userId: row.user_id,
    actorId: 'system:erasure-executor',
    detail: `Erasure completed: ${tablesErased.length} tables erased, cert=${certificate.sha256.slice(0, 16)}…`,
  });

  return certificate;
}

/**
 * Get the current status of an erasure request.
 */
export async function getErasureStatus(requestId: string): Promise<ErasureStatus> {
  const db = getDb();

  const row = db.prepare(
    `SELECT * FROM atlas_erasure_requests WHERE id = ?`
  ).get(requestId) as ErasureRow | undefined;

  if (!row) {
    throw new Error(`Erasure request ${requestId} not found`);
  }

  const status: ErasureStatus = {
    requestId: row.id,
    status: row.status as ErasureStatus['status'],
  };

  if (row.completed_at) {
    status.completedAt = new Date(row.completed_at);
  }

  if (row.certificate_json) {
    const raw = JSON.parse(row.certificate_json) as ErasureCertificate & { completedAt: string };
    status.certificate = { ...raw, completedAt: new Date(raw.completedAt) };
  }

  return status;
}
