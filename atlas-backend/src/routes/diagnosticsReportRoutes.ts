/**
 * Diagnostics Report Routes
 * POST   /v1/diagnostics/report       — persist a scan/error/stress/persona report
 * PATCH  /v1/diagnostics/report/:id   — update status (mark-fixed)
 * DELETE /v1/diagnostics/reports       — archive/clear session reports
 * GET    /v1/diagnostics/reports       — list persisted reports for a session
 *
 * Sovereign-gated to creator email. All data stored in SQLite.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/sqlite.js';
import { SOVEREIGN_CREATOR_EMAIL } from '../config/sovereignCreator.js';

const CREATOR_EMAIL = SOVEREIGN_CREATOR_EMAIL;

function isCreator(email?: string): boolean {
  return email?.trim().toLowerCase() === CREATOR_EMAIL;
}

export function registerDiagnosticsReportRoutes(app: FastifyInstance): void {
  const db = getDb();

  // Idempotent table creation
  db.exec(`
    CREATE TABLE IF NOT EXISTS atlas_diagnostics (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL,
      user_email  TEXT,
      type        TEXT NOT NULL,
      payload     TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'open',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_atlas_diagnostics_session ON atlas_diagnostics(session_id);
  `);

  // POST /v1/diagnostics/report — persist a report
  const postSchema = z.object({
    sessionId: z.string().min(1),
    type: z.enum(['scan', 'error', 'stress', 'persona']),
    payload: z.record(z.string(), z.unknown()),
    userEmail: z.string().email().optional(),
    timestamp: z.string().optional(),
  });

  app.post('/v1/diagnostics/report', async (request, reply) => {
    const parsed = postSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }

    const { sessionId, type, payload, userEmail } = parsed.data;
    if (!isCreator(userEmail)) {
      return reply.status(403).send({ error: 'Forbidden: Sovereign Creator access required' });
    }

    const id = randomUUID();
    const now = Date.now();
    db.prepare(
      `INSERT INTO atlas_diagnostics (id, session_id, user_email, type, payload, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`,
    ).run(id, sessionId, userEmail ?? null, type, JSON.stringify(payload), now, now);

    return reply.send({ ok: true, id });
  });

  // PATCH /v1/diagnostics/report/:id — update status
  const patchSchema = z.object({
    status: z.enum(['fixed', 'archived']),
    userEmail: z.string().email().optional(),
  });

  app.patch('/v1/diagnostics/report/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }

    const { status, userEmail } = parsed.data;
    if (!isCreator(userEmail)) {
      return reply.status(403).send({ error: 'Forbidden: Sovereign Creator access required' });
    }

    const now = Date.now();
    const result = db.prepare(
      `UPDATE atlas_diagnostics SET status = ?, updated_at = ? WHERE id = ?`,
    ).run(status, now, id);

    if (result.changes === 0) {
      return reply.status(404).send({ error: 'Report not found' });
    }

    return reply.send({ ok: true });
  });

  // DELETE /v1/diagnostics/reports — archive/clear session reports
  app.delete('/v1/diagnostics/reports', async (request, reply) => {
    const { sessionId, userEmail } = request.query as { sessionId?: string; userEmail?: string };
    if (!sessionId) {
      return reply.status(400).send({ error: 'sessionId query parameter required' });
    }
    if (!isCreator(userEmail)) {
      return reply.status(403).send({ error: 'Forbidden: Sovereign Creator access required' });
    }

    db.prepare(`UPDATE atlas_diagnostics SET status = 'archived', updated_at = ? WHERE session_id = ?`).run(
      Date.now(),
      sessionId,
    );

    return reply.send({ ok: true });
  });

  // GET /v1/diagnostics/reports — list reports for a session
  app.get('/v1/diagnostics/reports', async (request, reply) => {
    const { sessionId, userEmail, limit } = request.query as {
      sessionId?: string;
      userEmail?: string;
      limit?: string;
    };
    if (!sessionId) {
      return reply.status(400).send({ error: 'sessionId query parameter required' });
    }
    if (!isCreator(userEmail)) {
      return reply.status(403).send({ error: 'Forbidden: Sovereign Creator access required' });
    }

    const maxRows = Math.min(Number(limit) || 100, 500);
    const rows = db
      .prepare(
        `SELECT id, session_id, user_email, type, payload, status, created_at, updated_at
         FROM atlas_diagnostics
         WHERE session_id = ? AND status != 'archived'
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(sessionId, maxRows) as Array<{
      id: string;
      session_id: string;
      user_email: string | null;
      type: string;
      payload: string;
      status: string;
      created_at: number;
      updated_at: number;
    }>;

    const reports = rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      type: r.type,
      payload: JSON.parse(r.payload),
      status: r.status,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    }));

    return reply.send({ reports, total: reports.length });
  });
}
