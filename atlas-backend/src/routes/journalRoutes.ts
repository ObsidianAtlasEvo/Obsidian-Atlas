import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  getJournalEntry,
  listJournalEntries,
} from '../services/governance/journalService.js';
import { RATE_LIMITS } from '../plugins/rateLimit.js';

const userIdQuery = z.object({
  userId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const entryIdParam = z.string().min(1);

const createBody = z.object({
  id: z.string().min(1).optional(),
  user_id: z.string().min(1),
  title: z.string().max(1000).default(''),
  content: z.string().max(100_000).default(''),
  mood: z.string().max(100).optional().nullable(),
  tags: z.string().max(10_000).default('[]'),
  assistance_mode: z.string().max(100).optional().nullable(),
  analysis: z.string().max(100_000).optional().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

const updateBody = z.object({
  userId: z.string().min(1),
  title: z.string().max(1000).optional(),
  content: z.string().max(100_000).optional(),
  mood: z.string().max(100).optional().nullable(),
  tags: z.string().max(10_000).optional(),
  assistance_mode: z.string().max(100).optional().nullable(),
  analysis: z.string().max(100_000).optional().nullable(),
});

const deleteBody = z.object({
  userId: z.string().min(1),
});

export function registerJournalRoutes(app: FastifyInstance): void {
  // List entries
  app.get('/v1/cognitive/journal/entries', {
    config: { rateLimit: RATE_LIMITS.readUser },
  }, async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const entries = listJournalEntries(parsed.data.userId, parsed.data.limit ?? 100);
    return reply.send({ entries });
  });

  // Get single entry
  app.get('/v1/cognitive/journal/entries/:id', {
    config: { rateLimit: RATE_LIMITS.readUser },
  }, async (request, reply) => {
    const id = entryIdParam.safeParse((request.params as { id?: string }).id);
    const q = z.object({ userId: z.string().min(1) }).safeParse(request.query);
    if (!id.success || !q.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    const entry = getJournalEntry(id.data, q.data.userId);
    if (!entry) return reply.status(404).send({ error: 'not_found' });
    return reply.send({ entry });
  });

  // Create entry
  app.post('/v1/cognitive/journal/entries', {
    config: { rateLimit: RATE_LIMITS.writeUser },
  }, async (request, reply) => {
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const entry = createJournalEntry(parsed.data as Parameters<typeof createJournalEntry>[0]);
    return reply.status(201).send({ entry });
  });

  // Update entry
  app.put('/v1/cognitive/journal/entries/:id', {
    config: { rateLimit: RATE_LIMITS.writeUser },
  }, async (request, reply) => {
    const id = entryIdParam.safeParse((request.params as { id?: string }).id);
    const parsed = updateBody.safeParse(request.body);
    if (!id.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      const { userId, ...updates } = parsed.data;
      const entry = updateJournalEntry(id.data, userId, updates);
      return reply.send({ entry });
    } catch {
      return reply.status(404).send({ error: 'journal_entry_not_found' });
    }
  });

  // Delete entry
  app.delete('/v1/cognitive/journal/entries/:id', {
    config: { rateLimit: RATE_LIMITS.writeUser },
  }, async (request, reply) => {
    const id = entryIdParam.safeParse((request.params as { id?: string }).id);
    const parsed = deleteBody.safeParse(request.body ?? request.query);
    if (!id.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      deleteJournalEntry(id.data, parsed.data.userId);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: 'journal_entry_not_found' });
    }
  });
}
