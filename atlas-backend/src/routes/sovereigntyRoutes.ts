import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getDeepResearchQuotaSnapshot,
  setUserTavilyByok,
} from '../services/intelligence/quotaManager.js';
import { supabaseRest } from '../db/supabase.js';

const quotaBodySchema = z.object({
  userId: z.string().min(1),
});

const byokBodySchema = z.object({
  userId: z.string().min(1),
  /** Set to `null` or empty string to clear BYOK. */
  tavilyApiKey: z.union([z.string(), z.null()]),
});

// ── Constitutional principles ───────────────────────────────────────────────

const principleCreateSchema = z.object({
  principle_text: z.string().min(1).max(2000),
});

const principleUpdateSchema = z.object({
  principle_text: z.string().min(1).max(2000).optional(),
  active: z.boolean().optional(),
});

const transparencyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

interface PrincipleRow {
  id: string;
  user_id: string;
  principle_text: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface TransparencyRow {
  id: string;
  session_id: string;
  response_id: string | null;
  passed: boolean;
  principles_checked: number;
  compliance_score: number | null;
  violations: unknown;
  created_at: string;
}

export function registerSovereigntyRoutes(app: FastifyInstance): void {
  app.post('/v1/sovereignty/deep-research-quota', async (request, reply) => {
    const parsed = quotaBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const snap = getDeepResearchQuotaSnapshot(parsed.data.userId);
    return reply.send({
      hasByok: snap.hasByok,
      unlimited: snap.unlimited,
      usedToday: snap.usedToday,
      limit: snap.limit,
      resetsUtcMidnight: snap.resetsUtcMidnight,
    });
  });

  app.put('/v1/sovereignty/tavily-byok', async (request, reply) => {
    const parsed = byokBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const raw = parsed.data.tavilyApiKey;
    setUserTavilyByok(parsed.data.userId, raw === null ? null : raw);
    return reply.send({ ok: true });
  });

  // ── Constitutional principles CRUD ──────────────────────────────────────

  app.get('/v1/sovereignty/principles', async (request, reply) => {
    const auth = request.atlasAuthUser;
    if (!auth?.supabaseId) {
      return reply.status(401).send({ error: 'unauthenticated' });
    }
    const userId = auth.supabaseId;

    const result = await supabaseRest<PrincipleRow[]>(
      'GET',
      `user_constitutional_principles?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,principle_text,active,created_at,updated_at&order=created_at.desc`,
    );
    if (!result.ok) return reply.status(500).send({ error: 'fetch_failed' });
    return reply.send({ principles: result.data ?? [] });
  });

  app.post('/v1/sovereignty/principles', async (request, reply) => {
    const auth = request.atlasAuthUser;
    if (!auth?.supabaseId) {
      return reply.status(401).send({ error: 'unauthenticated' });
    }
    const parsed = principleCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const result = await supabaseRest<PrincipleRow[]>(
      'POST',
      'user_constitutional_principles',
      [{
        user_id: auth.supabaseId,
        principle_text: parsed.data.principle_text,
        active: true,
      }],
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return reply.status(500).send({ error: 'create_failed' });
    }
    return reply.status(201).send({ principle: result.data[0] });
  });

  app.patch<{ Params: { id: string } }>('/v1/sovereignty/principles/:id', async (request, reply) => {
    const auth = request.atlasAuthUser;
    if (!auth?.supabaseId) {
      return reply.status(401).send({ error: 'unauthenticated' });
    }
    const parsed = principleUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    if (parsed.data.principle_text === undefined && parsed.data.active === undefined) {
      return reply.status(400).send({ error: 'no_fields_to_update' });
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.principle_text !== undefined) patch.principle_text = parsed.data.principle_text;
    if (parsed.data.active !== undefined) patch.active = parsed.data.active;

    const id = request.params.id;
    const result = await supabaseRest<PrincipleRow[]>(
      'PATCH',
      `user_constitutional_principles?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(auth.supabaseId)}`,
      patch,
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return reply.status(404).send({ error: 'not_found' });
    }
    return reply.send({ principle: result.data[0] });
  });

  app.delete<{ Params: { id: string } }>('/v1/sovereignty/principles/:id', async (request, reply) => {
    const auth = request.atlasAuthUser;
    if (!auth?.supabaseId) {
      return reply.status(401).send({ error: 'unauthenticated' });
    }
    const id = request.params.id;
    const result = await supabaseRest(
      'DELETE',
      `user_constitutional_principles?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(auth.supabaseId)}`,
    );
    if (!result.ok) return reply.status(500).send({ error: 'delete_failed' });
    return reply.send({ ok: true });
  });

  app.get('/v1/sovereignty/transparency-log', async (request, reply) => {
    const auth = request.atlasAuthUser;
    if (!auth?.supabaseId) {
      return reply.status(401).send({ error: 'unauthenticated' });
    }
    const parsed = transparencyQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const { limit, offset } = parsed.data;

    const result = await supabaseRest<TransparencyRow[]>(
      'GET',
      `behavior_transparency_log?user_id=eq.${encodeURIComponent(auth.supabaseId)}&select=id,session_id,response_id,passed,principles_checked,compliance_score,violations,created_at&order=created_at.desc&limit=${limit}&offset=${offset}`,
    );
    if (!result.ok) return reply.status(500).send({ error: 'fetch_failed' });
    return reply.send({ entries: result.data ?? [], limit, offset });
  });
}
