import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getDb } from '../db/sqlite.js';
import { attachAtlasSession, getAuthenticatedUser } from '../services/auth/authProvider.js';
import { isSovereignOwnerEmail } from '../services/intelligence/router.js';

const userIdQ = z.object({ userId: z.string().min(1) });

function nowIso(): string {
  return new Date().toISOString();
}

export function insertGovernanceAuditLog(input: {
  userId: string;
  action: string;
  actor: string;
  type?: string;
  severity?: string;
  details?: unknown;
}): string {
  const db = getDb();
  const id = randomUUID();
  const created = nowIso();
  db.prepare(
    `INSERT INTO governance_audit_logs (id, user_id, action, actor, type, severity, details_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.action,
    input.actor,
    input.type ?? 'governance',
    input.severity ?? 'medium',
    JSON.stringify(input.details ?? {}),
    created
  );
  return id;
}

export function registerGovernanceConsoleRoutes(app: FastifyInstance): void {
  const db = () => getDb();

  // ── Gaps ──────────────────────────────────────────────────────────────────
  app.get('/v1/governance/gaps', (request, reply) => {
    const parsed = userIdQ.extend({ status: z.string().optional() }).safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const { userId, status } = parsed.data;
    let rows: Record<string, unknown>[];
    if (status) {
      rows = db()
        .prepare(
          `SELECT id, user_id as userId, title, description, severity, status, type, notes, detected_at as detectedAt, repaired_at as repairedAt, created_at as createdAt, updated_at as updatedAt
           FROM governance_gaps WHERE user_id = ? AND status = ? ORDER BY datetime(detected_at) DESC`
        )
        .all(userId, status) as Record<string, unknown>[];
    } else {
      rows = db()
        .prepare(
          `SELECT id, user_id as userId, title, description, severity, status, type, notes, detected_at as detectedAt, repaired_at as repairedAt, created_at as createdAt, updated_at as updatedAt
           FROM governance_gaps WHERE user_id = ? ORDER BY datetime(detected_at) DESC`
        )
        .all(userId) as Record<string, unknown>[];
    }
    return reply.send({ gaps: rows });
  });

  const gapCreate = z.object({
    userId: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    severity: z.string().min(1),
    status: z.string().optional(),
    type: z.string().optional(),
  });

  app.post('/v1/governance/gaps', (request, reply) => {
    const parsed = gapCreate.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const b = parsed.data;
    const id = randomUUID();
    const t = nowIso();
    const status = b.status ?? 'identified';
    const type = b.type ?? 'structural_gap';
    db().prepare(
      `INSERT INTO governance_gaps (id, user_id, title, description, severity, status, type, detected_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, b.userId, b.title, b.description, b.severity, status, type, t, t, t);
    insertGovernanceAuditLog({
      userId: b.userId,
      action: 'gap_created',
      actor: 'console',
      severity: 'low',
      details: { gapId: id, title: b.title },
    });
    return reply.status(201).send({ id, status: 'created' });
  });

  const gapPatch = z.object({
    status: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    severity: z.string().optional(),
    notes: z.string().optional(),
    repairedAt: z.string().optional(),
  });

  app.patch('/v1/governance/gaps/:id', (request, reply) => {
    const id = z.string().min(1).safeParse((request.params as { id?: string }).id);
    const parsed = gapPatch.safeParse(request.body);
    if (!id.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    const row = db().prepare(`SELECT user_id FROM governance_gaps WHERE id = ?`).get(id.data) as
      | { user_id: string }
      | undefined;
    if (!row) return reply.status(404).send({ error: 'not_found' });
    const b = parsed.data;
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (b.status !== undefined) {
      sets.push('status = ?');
      vals.push(b.status);
    }
    if (b.title !== undefined) {
      sets.push('title = ?');
      vals.push(b.title);
    }
    if (b.description !== undefined) {
      sets.push('description = ?');
      vals.push(b.description);
    }
    if (b.severity !== undefined) {
      sets.push('severity = ?');
      vals.push(b.severity);
    }
    if (b.notes !== undefined) {
      sets.push('notes = ?');
      vals.push(b.notes);
    }
    if (b.repairedAt !== undefined) {
      sets.push('repaired_at = ?');
      vals.push(b.repairedAt);
    }
    if (sets.length === 0) return reply.status(400).send({ error: 'no_updates' });
    sets.push('updated_at = ?');
    vals.push(nowIso());
    vals.push(id.data);
    db().prepare(`UPDATE governance_gaps SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    insertGovernanceAuditLog({
      userId: row.user_id,
      action: 'gap_updated',
      actor: 'console',
      details: { gapId: id.data, ...b },
    });
    return reply.send({ ok: true });
  });

  app.delete('/v1/governance/gaps/:id', (request, reply) => {
    const id = z.string().min(1).safeParse((request.params as { id?: string }).id);
    if (!id.success) return reply.status(400).send({ error: 'validation_error' });
    const row = db().prepare(`SELECT user_id FROM governance_gaps WHERE id = ?`).get(id.data) as
      | { user_id: string }
      | undefined;
    if (!row) return reply.status(404).send({ error: 'not_found' });
    db().prepare(`DELETE FROM governance_gaps WHERE id = ?`).run(id.data);
    insertGovernanceAuditLog({
      userId: row.user_id,
      action: 'gap_deleted',
      actor: 'console',
      severity: 'high',
      details: { gapId: id.data },
    });
    return reply.send({ ok: true });
  });

  // ── Change control ────────────────────────────────────────────────────────
  app.get('/v1/governance/changes', (request, reply) => {
    const parsed = userIdQ.extend({ status: z.string().optional() }).safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const { userId, status } = parsed.data;
    let rows: Record<string, unknown>[];
    if (status) {
      rows = db()
        .prepare(
          `SELECT id, user_id as userId, title, description, impact, class, proposed_by as proposedBy, approved_by as approvedBy,
                  status, notes, created_at as createdAt, updated_at as updatedAt
           FROM governance_changes WHERE user_id = ? AND status = ? ORDER BY datetime(created_at) DESC`
        )
        .all(userId, status) as Record<string, unknown>[];
    } else {
      rows = db()
        .prepare(
          `SELECT id, user_id as userId, title, description, impact, class, proposed_by as proposedBy, approved_by as approvedBy,
                  status, notes, created_at as createdAt, updated_at as updatedAt
           FROM governance_changes WHERE user_id = ? ORDER BY datetime(created_at) DESC`
        )
        .all(userId) as Record<string, unknown>[];
    }
    return reply.send({ changes: rows });
  });

  const changeCreate = z.object({
    userId: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    impact: z.string().optional(),
    proposedBy: z.string().optional(),
    class: z.number().int().min(0).max(4).optional(),
    status: z.string().optional(),
  });

  app.post('/v1/governance/changes', (request, reply) => {
    const parsed = changeCreate.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const b = parsed.data;
    const id = randomUUID();
    const t = nowIso();
    const status = b.status ?? 'proposed';
    const cls = b.class ?? 2;
    db().prepare(
      `INSERT INTO governance_changes (id, user_id, title, description, impact, class, proposed_by, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      b.userId,
      b.title,
      b.description,
      b.impact ?? '',
      cls,
      b.proposedBy ?? 'system',
      status,
      t,
      t
    );
    insertGovernanceAuditLog({
      userId: b.userId,
      action: 'change_proposed',
      actor: b.proposedBy ?? 'system',
      details: { changeId: id, title: b.title },
    });
    return reply.status(201).send({ id, status: 'created' });
  });

  const changePatch = z.object({
    status: z.string().optional(),
    notes: z.string().optional(),
    approvedBy: z.string().optional(),
  });

  app.patch('/v1/governance/changes/:id', (request, reply) => {
    const id = z.string().min(1).safeParse((request.params as { id?: string }).id);
    const parsed = changePatch.safeParse(request.body);
    if (!id.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    const row = db().prepare(`SELECT user_id FROM governance_changes WHERE id = ?`).get(id.data) as
      | { user_id: string }
      | undefined;
    if (!row) return reply.status(404).send({ error: 'not_found' });
    const b = parsed.data;
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (b.status !== undefined) {
      sets.push('status = ?');
      vals.push(b.status);
    }
    if (b.notes !== undefined) {
      sets.push('notes = ?');
      vals.push(b.notes);
    }
    if (b.approvedBy !== undefined) {
      sets.push('approved_by = ?');
      vals.push(b.approvedBy);
    }
    if (sets.length === 0) return reply.status(400).send({ error: 'no_updates' });
    sets.push('updated_at = ?');
    vals.push(nowIso());
    vals.push(id.data);
    db().prepare(`UPDATE governance_changes SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    insertGovernanceAuditLog({
      userId: row.user_id,
      action: 'change_updated',
      actor: b.approvedBy ?? 'console',
      details: { changeId: id.data, ...b },
    });
    return reply.send({ ok: true });
  });

  app.delete('/v1/governance/changes/:id', (request, reply) => {
    const id = z.string().min(1).safeParse((request.params as { id?: string }).id);
    if (!id.success) return reply.status(400).send({ error: 'validation_error' });
    const row = db().prepare(`SELECT user_id FROM governance_changes WHERE id = ?`).get(id.data) as
      | { user_id: string }
      | undefined;
    if (!row) return reply.status(404).send({ error: 'not_found' });
    db().prepare(`DELETE FROM governance_changes WHERE id = ?`).run(id.data);
    insertGovernanceAuditLog({
      userId: row.user_id,
      action: 'change_deleted',
      actor: 'console',
      severity: 'high',
      details: { changeId: id.data },
    });
    return reply.send({ ok: true });
  });

  // ── Audit logs ────────────────────────────────────────────────────────────
  app.get('/v1/governance/audit-logs', (request, reply) => {
    const parsed = userIdQ
      .extend({
        limit: z.coerce.number().int().min(1).max(500).optional(),
        type: z.string().optional(),
        severity: z.string().optional(),
      })
      .safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const { userId, limit: lim = 100, type, severity } = parsed.data;
    let sql = `SELECT id, user_id as userId, action, actor, type, severity, details_json as detailsJson, created_at as timestamp
               FROM governance_audit_logs WHERE user_id = ?`;
    const params: unknown[] = [userId];
    if (type) {
      sql += ` AND type = ?`;
      params.push(type);
    }
    if (severity) {
      sql += ` AND severity = ?`;
      params.push(severity);
    }
    sql += ` ORDER BY datetime(created_at) DESC LIMIT ?`;
    params.push(lim);
    const rows = db().prepare(sql).all(...params) as { detailsJson: string }[];
    const logs = rows.map((r) => ({
      ...r,
      metadata: (() => {
        try {
          return JSON.parse(r.detailsJson || '{}');
        } catch {
          return {};
        }
      })(),
    }));
    return reply.send({ logs });
  });

  const auditPost = z.object({
    userId: z.string().min(1),
    action: z.string().min(1),
    actor: z.string().min(1),
    details: z.record(z.unknown()).optional(),
    type: z.string().optional(),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  });

  app.post('/v1/governance/audit-logs', (request, reply) => {
    const parsed = auditPost.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const b = parsed.data;
    const id = insertGovernanceAuditLog({
      userId: b.userId,
      action: b.action,
      actor: b.actor,
      type: b.type,
      severity: b.severity,
      details: b.details,
    });
    return reply.status(201).send({ id, status: 'saved' });
  });

  // ── Emergency (creator-only POST) ─────────────────────────────────────────
  app.get('/v1/governance/emergency/status', (request, reply) => {
    const parsed = userIdQ.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const row = db()
      .prepare(
        `SELECT active, activated_at as activatedAt, reason, lifted_at as liftedAt FROM governance_emergency_state WHERE user_id = ?`
      )
      .get(parsed.data.userId) as
      | { active: number; activatedAt: string | null; reason: string | null; liftedAt: string | null }
      | undefined;
    if (!row) {
      return reply.send({ active: false });
    }
    return reply.send({
      active: row.active === 1,
      activatedAt: row.activatedAt ?? undefined,
      reason: row.reason ?? undefined,
      liftedAt: row.liftedAt ?? undefined,
    });
  });

  const emergencyBody = z.object({
    userId: z.string().min(1),
    action: z.enum(['activate', 'deactivate']),
    reason: z.string().min(1),
  });

  app.post('/v1/governance/emergency', async (request, reply) => {
    await attachAtlasSession(request as FastifyRequest);
    const user = await getAuthenticatedUser(request as FastifyRequest);
    const email = user?.email ?? null;
    if (!isSovereignOwnerEmail(email)) {
      return reply.status(403).send({ error: 'forbidden', message: 'Sovereign creator only' });
    }
    const parsed = emergencyBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const { userId, action, reason } = parsed.data;
    const t = nowIso();
    const exists = db().prepare(`SELECT 1 FROM governance_emergency_state WHERE user_id = ?`).get(userId);
    if (action === 'activate') {
      if (exists) {
        db()
          .prepare(
            `UPDATE governance_emergency_state SET active = 1, activated_at = ?, reason = ?, lifted_at = NULL, updated_at = ? WHERE user_id = ?`
          )
          .run(t, reason, t, userId);
      } else {
        db()
          .prepare(
            `INSERT INTO governance_emergency_state (user_id, active, activated_at, reason, lifted_at, updated_at) VALUES (?, 1, ?, ?, NULL, ?)`
          )
          .run(userId, t, reason, t);
      }
    } else {
      if (exists) {
        db()
          .prepare(
            `UPDATE governance_emergency_state SET active = 0, lifted_at = ?, updated_at = ? WHERE user_id = ?`
          )
          .run(t, t, userId);
      } else {
        db()
          .prepare(
            `INSERT INTO governance_emergency_state (user_id, active, activated_at, reason, lifted_at, updated_at) VALUES (?, 0, NULL, NULL, ?, ?)`
          )
          .run(userId, t, t);
      }
    }
    insertGovernanceAuditLog({
      userId,
      action: `emergency_${action}`,
      actor: email ?? 'sovereign',
      severity: 'critical',
      details: { reason },
    });
    return reply.send({ status: 'ok', action, timestamp: t });
  });

  // ── Diagnostics (BugHunter / console) ─────────────────────────────────────
  const diagPost = z.object({
    userId: z.string().min(1),
    sessionId: z.string().min(1),
    type: z.enum(['scan', 'error', 'stress', 'persona']),
    payload: z.record(z.unknown()),
    timestamp: z.string().min(1),
  });

  app.post('/v1/diagnostics/report', (request, reply) => {
    const parsed = diagPost.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const b = parsed.data;
    const id = randomUUID();
    const created = nowIso();
    db()
      .prepare(
        `INSERT INTO diagnostics_reports (id, user_id, session_id, type, payload_json, timestamp, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`
      )
      .run(id, b.userId, b.sessionId, b.type, JSON.stringify(b.payload), b.timestamp, created);
    return reply.status(201).send({ id, status: 'saved' });
  });

  app.get('/v1/diagnostics/reports', (request, reply) => {
    const parsed = z
      .object({
        userId: z.string().min(1),
        sessionId: z.string().optional(),
        type: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      })
      .safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const { userId, sessionId, type, limit: lim = 50 } = parsed.data;
    let sql = `SELECT id, user_id as userId, session_id as sessionId, type, payload_json as payloadJson, timestamp, status, created_at as createdAt
               FROM diagnostics_reports WHERE user_id = ?`;
    const params: unknown[] = [userId];
    if (sessionId) {
      sql += ` AND session_id = ?`;
      params.push(sessionId);
    }
    if (type) {
      sql += ` AND type = ?`;
      params.push(type);
    }
    sql += ` ORDER BY datetime(created_at) DESC LIMIT ?`;
    params.push(lim);
    const rows = db().prepare(sql).all(...params) as { payloadJson: string }[];
    const reports = rows.map((r) => ({
      ...r,
      payload: JSON.parse(r.payloadJson || '{}') as Record<string, unknown>,
    }));
    return reply.send({ reports });
  });

  app.patch('/v1/diagnostics/reports/:id', (request, reply) => {
    const id = z.string().min(1).safeParse((request.params as { id?: string }).id);
    const parsed = z
      .object({ status: z.enum(['fixed', 'open', 'archived']), userId: z.string().min(1) })
      .safeParse(request.body);
    if (!id.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    const r = db().prepare(`SELECT user_id FROM diagnostics_reports WHERE id = ?`).get(id.data) as
      | { user_id: string }
      | undefined;
    if (!r || r.user_id !== parsed.data.userId) {
      return reply.status(404).send({ error: 'not_found' });
    }
    db().prepare(`UPDATE diagnostics_reports SET status = ? WHERE id = ?`).run(parsed.data.status, id.data);
    return reply.send({ ok: true });
  });

  app.delete('/v1/diagnostics/reports/session/:sessionId', (request, reply) => {
    const sessionId = z.string().min(1).safeParse((request.params as { sessionId?: string }).sessionId);
    const parsed = userIdQ.safeParse(request.query);
    if (!sessionId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    db()
      .prepare(`DELETE FROM diagnostics_reports WHERE session_id = ? AND user_id = ?`)
      .run(sessionId.data, parsed.data.userId);
    return reply.send({ ok: true });
  });
}
