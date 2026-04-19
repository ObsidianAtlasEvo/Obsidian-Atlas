/**
 * memoryDistillerRoutes.ts — operator endpoints for the Phase 0.5 distiller.
 *
 *   POST /admin/memory-distiller/tick          run a batch now (sovereign-owner only)
 *   POST /admin/memory-distiller/user/:userId  run for a specific user (sovereign-owner only)
 *   GET  /memory/recent-runs                   caller sees their own last N audit rows
 *
 * Sovereign-owner check reuses the existing isSovereignOwner() helper so the
 * creator can tick the scheduler manually without standing up a whole RBAC.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { isSovereignOwner } from '../services/intelligence/groundwork/v4/subscriptionSchema.js';
import {
  distillUserMemories,
} from '../services/intelligence/memoryDistiller.js';
import { applyPolicyPatch } from '../services/intelligence/policyAutoWriter.js';
import { runDistillerTick } from '../services/autonomy/memoryDistillerScheduler.js';
import { supabaseRest } from '../db/supabase.js';
import { env } from '../config/env.js';

function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
): { userId: string; email: string } | null {
  const session = request.atlasSession;
  if (!session) {
    void reply.status(401).send({ error: 'unauthorized' });
    return null;
  }
  return session;
}

export async function registerMemoryDistillerRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/admin/memory-distiller/tick', {
    config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;
    if (!isSovereignOwner(session.userId, session.email)) {
      return reply.status(403).send({ error: 'forbidden' });
    }
    if (!env.memoryDistillerEnabled) {
      return reply.status(503).send({ error: 'distiller-disabled' });
    }
    const summary = await runDistillerTick();
    return reply.send({ ok: true, summary });
  });

  fastify.post<{ Params: { userId: string } }>(
    '/admin/memory-distiller/user/:userId',
    {
      config: { rateLimit: { max: 12, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const session = requireSession(request, reply);
      if (!session) return;
      if (!isSovereignOwner(session.userId, session.email)) {
        return reply.status(403).send({ error: 'forbidden' });
      }
      if (!env.memoryDistillerEnabled) {
        return reply.status(503).send({ error: 'distiller-disabled' });
      }
      const userId = request.params.userId.trim();
      if (!userId) return reply.status(400).send({ error: 'missing-user-id' });

      const result = await distillUserMemories(userId);
      let policyApplied: Awaited<ReturnType<typeof applyPolicyPatch>> = null;
      if (result.policyPatch) {
        policyApplied = await applyPolicyPatch(userId, result.policyPatch);
      }
      return reply.send({ ok: true, result, policyApplied });
    },
  );

  // Any logged-in user can read their own audit trail.
  fastify.get('/memory/recent-runs', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;
    if (!process.env.SUPABASE_URL) return reply.send({ runs: [] });
    const res = await supabaseRest<Array<Record<string, unknown>>>(
      'GET',
      `memory_distiller_runs?user_id=eq.${encodeURIComponent(session.userId)}&order=started_at.desc&limit=10`,
    );
    if (!res.ok || !Array.isArray(res.data)) return reply.send({ runs: [] });
    return reply.send({ runs: res.data });
  });

  // Phase 0.75 — governance inspection endpoints (sovereign-owner only).

  // GET /v1/admin/memory/quarantined — inspect quarantined memories for a user.
  fastify.get<{ Querystring: { userId?: string } }>(
    '/admin/memory/quarantined',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const session = requireSession(request, reply);
      if (!session) return;
      if (!isSovereignOwner(session.userId, session.email)) return reply.status(403).send({ error: 'forbidden' });
      if (!process.env.SUPABASE_URL) return reply.send({ memories: [] });
      const targetUserId = (request.query as { userId?: string }).userId ?? session.userId;
      const res = await supabaseRest<Array<Record<string, unknown>>>(
        'GET',
        `user_memories?user_id=eq.${encodeURIComponent(targetUserId)}&quarantined=eq.true&superseded_by=is.null&order=created_at.desc&limit=30`,
      );
      return reply.send({ memories: res.ok && Array.isArray(res.data) ? res.data : [] });
    },
  );

  // GET /v1/admin/memory/conflicted — inspect unresolved contradictions.
  fastify.get<{ Querystring: { userId?: string } }>(
    '/admin/memory/conflicted',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const session = requireSession(request, reply);
      if (!session) return;
      if (!isSovereignOwner(session.userId, session.email)) return reply.status(403).send({ error: 'forbidden' });
      if (!process.env.SUPABASE_URL) return reply.send({ memories: [] });
      const targetUserId = (request.query as { userId?: string }).userId ?? session.userId;
      const res = await supabaseRest<Array<Record<string, unknown>>>(
        'POST',
        'rpc/atlas_conflicted_memories',
        { p_user_id: targetUserId, p_limit: 30 },
      );
      return reply.send({ memories: res.ok && Array.isArray(res.data) ? res.data : [] });
    },
  );

  // GET /v1/admin/memory/policy-eligible — see what memories can write policy.
  fastify.get<{ Querystring: { userId?: string } }>(
    '/admin/memory/policy-eligible',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const session = requireSession(request, reply);
      if (!session) return;
      if (!isSovereignOwner(session.userId, session.email)) return reply.status(403).send({ error: 'forbidden' });
      if (!process.env.SUPABASE_URL) return reply.send({ memories: [] });
      const targetUserId = (request.query as { userId?: string }).userId ?? session.userId;
      const res = await supabaseRest<Array<Record<string, unknown>>>(
        'POST',
        'rpc/atlas_policy_eligible_memories',
        { p_user_id: targetUserId, p_limit: 20 },
      );
      return reply.send({ memories: res.ok && Array.isArray(res.data) ? res.data : [] });
    },
  );

  // GET /v1/admin/memory/governance-events — recent governance event trail.
  fastify.get<{ Querystring: { userId?: string } }>(
    '/admin/memory/governance-events',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const session = requireSession(request, reply);
      if (!session) return;
      if (!isSovereignOwner(session.userId, session.email)) return reply.status(403).send({ error: 'forbidden' });
      if (!process.env.SUPABASE_URL) return reply.send({ events: [] });
      const targetUserId = (request.query as { userId?: string }).userId ?? session.userId;
      const res = await supabaseRest<Array<Record<string, unknown>>>(
        'GET',
        `memory_governance_events?user_id=eq.${encodeURIComponent(targetUserId)}&order=created_at.desc&limit=50`,
      );
      return reply.send({ events: res.ok && Array.isArray(res.data) ? res.data : [] });
    },
  );

  // GET /v1/memory/governance-events — user reads their own governance trail.
  fastify.get(
    '/memory/governance-events',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const session = requireSession(request, reply);
      if (!session) return;
      if (!process.env.SUPABASE_URL) return reply.send({ events: [] });
      const res = await supabaseRest<Array<Record<string, unknown>>>(
        'GET',
        `memory_governance_events?user_id=eq.${encodeURIComponent(session.userId)}&order=created_at.desc&limit=30`,
      );
      return reply.send({ events: res.ok && Array.isArray(res.data) ? res.data : [] });
    },
  );

  // POST /v1/admin/memory/decay/:userId — trigger decay sweep for a user.
  fastify.post<{ Params: { userId: string } }>(
    '/admin/memory/decay/:userId',
    { config: { rateLimit: { max: 4, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const session = requireSession(request, reply);
      if (!session) return;
      if (!isSovereignOwner(session.userId, session.email)) return reply.status(403).send({ error: 'forbidden' });
      if (!process.env.SUPABASE_URL) return reply.status(503).send({ error: 'supabase-not-configured' });
      const userId = request.params.userId.trim();
      if (!userId) return reply.status(400).send({ error: 'missing-user-id' });
      const res = await supabaseRest<Array<{ atlas_apply_memory_decay: number }>>(  
        'POST',
        'rpc/atlas_apply_memory_decay',
        { p_user_id: userId },
      );
      const decayedCount = res.ok && Array.isArray(res.data) ? (res.data[0]?.atlas_apply_memory_decay ?? 0) : 0;
      return reply.send({ ok: true, decayedCount });
    },
  );
}
