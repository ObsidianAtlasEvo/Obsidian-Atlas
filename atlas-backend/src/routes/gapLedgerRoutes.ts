/**
 * Gap Ledger Routes
 * CRUD endpoints for governance gaps — migrated from Firestore to SQLite.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/sqlite.js';

const createGapSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(4000),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  status: z
    .enum(['identified', 'suspected', 'investigating', 'repair_proposed', 'repaired', 'failed_repair'])
    .optional()
    .default('identified'),
});

const updateGapSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().min(1).max(4000).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z
    .enum(['identified', 'suspected', 'investigating', 'repair_proposed', 'repaired', 'failed_repair'])
    .optional(),
  notes: z.string().max(4000).nullable().optional(),
});

interface GapRow {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

function rowToGap(row: GapRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    severity: row.severity,
    status: row.status,
    notes: row.notes,
    detectedAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function registerGapLedgerRoutes(app: FastifyInstance): void {
  // GET /v1/governance/gaps — list all gaps, optional ?status= filter
  app.get('/v1/governance/gaps', async (request, reply) => {
    const { status } = request.query as { status?: string };
    const db = getDb();

    try {
      let rows: GapRow[];
      if (status) {
        rows = db
          .prepare('SELECT * FROM governance_gaps WHERE status = ? ORDER BY created_at DESC')
          .all(status) as GapRow[];
      } else {
        rows = db
          .prepare('SELECT * FROM governance_gaps ORDER BY created_at DESC')
          .all() as GapRow[];
      }
      return reply.send(rows.map(rowToGap));
    } catch (err) {
      request.log.error(err, 'GET /v1/governance/gaps failed');
      return reply.status(500).send({ error: 'internal_error', message: 'Failed to list gaps' });
    }
  });

  // POST /v1/governance/gaps — create a new gap
  app.post('/v1/governance/gaps', async (request, reply) => {
    const parsed = createGapSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }

    const { title, description, severity, status } = parsed.data;
    const id = randomUUID();
    const now = Date.now();
    const db = getDb();

    try {
      db.prepare(
        `INSERT INTO governance_gaps (id, title, description, severity, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, title, description, severity, status, now, now);

      const row = db.prepare('SELECT * FROM governance_gaps WHERE id = ?').get(id) as GapRow;
      return reply.status(201).send(rowToGap(row));
    } catch (err) {
      request.log.error(err, 'POST /v1/governance/gaps failed');
      return reply.status(500).send({ error: 'internal_error', message: 'Failed to create gap' });
    }
  });

  // PATCH /v1/governance/gaps/:id — update a gap
  app.patch('/v1/governance/gaps/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateGapSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }

    const db = getDb();
    const existing = db.prepare('SELECT * FROM governance_gaps WHERE id = ?').get(id) as GapRow | undefined;
    if (!existing) {
      return reply.status(404).send({ error: 'not_found', message: 'Gap not found' });
    }

    const updates = parsed.data;
    const setClauses: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.title !== undefined) { setClauses.push('title = ?'); values.push(updates.title); }
    if (updates.description !== undefined) { setClauses.push('description = ?'); values.push(updates.description); }
    if (updates.severity !== undefined) { setClauses.push('severity = ?'); values.push(updates.severity); }
    if (updates.status !== undefined) { setClauses.push('status = ?'); values.push(updates.status); }
    if (updates.notes !== undefined) { setClauses.push('notes = ?'); values.push(updates.notes ?? null); }

    if (setClauses.length === 0) {
      return reply.send(rowToGap(existing));
    }

    setClauses.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    try {
      db.prepare(`UPDATE governance_gaps SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
      const row = db.prepare('SELECT * FROM governance_gaps WHERE id = ?').get(id) as GapRow;
      return reply.send(rowToGap(row));
    } catch (err) {
      request.log.error(err, 'PATCH /v1/governance/gaps/:id failed');
      return reply.status(500).send({ error: 'internal_error', message: 'Failed to update gap' });
    }
  });

  // DELETE /v1/governance/gaps/:id — delete a gap
  app.delete('/v1/governance/gaps/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    try {
      const result = db.prepare('DELETE FROM governance_gaps WHERE id = ?').run(id);
      if (result.changes === 0) {
        return reply.status(404).send({ error: 'not_found', message: 'Gap not found' });
      }
      return reply.status(204).send();
    } catch (err) {
      request.log.error(err, 'DELETE /v1/governance/gaps/:id failed');
      return reply.status(500).send({ error: 'internal_error', message: 'Failed to delete gap' });
    }
  });
}
