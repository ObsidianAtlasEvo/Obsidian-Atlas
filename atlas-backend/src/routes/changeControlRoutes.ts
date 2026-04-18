/**
 * Change Control Routes
 * CRUD for governance change proposals — migrated from Firestore to SQLite.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../db/sqlite.js';

const createChangeSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(4000),
  impact: z.string().min(1).max(2000),
  proposedBy: z.string().optional(),
});

const updateChangeSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'deployed']).optional(),
  notes: z.string().max(4000).optional(),
});

export function registerChangeControlRoutes(app: FastifyInstance): void {
  /** GET /v1/governance/changes — list changes, optional ?status= filter */
  app.get('/v1/governance/changes', async (request, reply) => {
    const { status } = request.query as { status?: string };
    const db = getDb();

    if (status) {
      const rows = db
        .prepare('SELECT * FROM governance_changes WHERE status = ? ORDER BY createdAt DESC')
        .all(status);
      return reply.send({ changes: rows });
    }

    const rows = db
      .prepare('SELECT * FROM governance_changes ORDER BY createdAt DESC')
      .all();
    return reply.send({ changes: rows });
  });

  /** POST /v1/governance/changes — propose a new change */
  app.post('/v1/governance/changes', async (request, reply) => {
    const parsed = createChangeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }

    const { title, description, impact, proposedBy } = parsed.data;
    const db = getDb();
    const id = crypto.randomUUID();
    const now = Date.now();

    db.prepare(
      `INSERT INTO governance_changes (id, title, description, impact, proposedBy, status, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'pending', NULL, ?, ?)`
    ).run(id, title, description, impact, proposedBy ?? 'system', now, now);

    const row = db.prepare('SELECT * FROM governance_changes WHERE id = ?').get(id);
    return reply.status(201).send(row);
  });

  /** PATCH /v1/governance/changes/:id — update status/notes */
  app.patch('/v1/governance/changes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateChangeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM governance_changes WHERE id = ?').get(id);
    if (!existing) {
      return reply.status(404).send({ error: 'not_found', message: 'Change not found' });
    }

    const { status, notes } = parsed.data;
    const now = Date.now();
    const sets: string[] = ['updatedAt = ?'];
    const values: unknown[] = [now];

    if (status !== undefined) {
      sets.push('status = ?');
      values.push(status);
    }
    if (notes !== undefined) {
      sets.push('notes = ?');
      values.push(notes);
    }

    values.push(id);
    db.prepare(`UPDATE governance_changes SET ${sets.join(', ')} WHERE id = ?`).run(...values);

    const row = db.prepare('SELECT * FROM governance_changes WHERE id = ?').get(id);
    return reply.send(row);
  });

  /** DELETE /v1/governance/changes/:id — delete a change */
  app.delete('/v1/governance/changes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const existing = db.prepare('SELECT id FROM governance_changes WHERE id = ?').get(id);
    if (!existing) {
      return reply.status(404).send({ error: 'not_found', message: 'Change not found' });
    }

    db.prepare('DELETE FROM governance_changes WHERE id = ?').run(id);
    return reply.status(204).send();
  });
}
