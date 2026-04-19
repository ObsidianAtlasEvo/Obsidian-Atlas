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

  // Any logged-in user can read their own audit trail — "what did Atlas learn about me and when?"
  fastify.get('/memory/recent-runs', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;
    if (!process.env.SUPABASE_URL) {
      return reply.send({ runs: [] });
    }
    const res = await supabaseRest<Array<Record<string, unknown>>>(
      'GET',
      `memory_distiller_runs?user_id=eq.${encodeURIComponent(session.userId)}&order=started_at.desc&limit=10`,
    );
    if (!res.ok || !Array.isArray(res.data)) {
      return reply.send({ runs: [] });
    }
    return reply.send({ runs: res.data });
  });
}
