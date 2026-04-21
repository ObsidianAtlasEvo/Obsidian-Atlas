/**
 * keyPoolAdminRoutes.ts
 * Obsidian Atlas — Key Pool Admin API
 *
 * Sovereign-only endpoints for managing the provider key pool at runtime.
 * All operations require the verified email to match SOVEREIGN_CREATOR_EMAIL.
 *
 * Routes:
 *   POST   /v1/admin/key-pool/keys        — add a new key to the pool
 *   GET    /v1/admin/key-pool/keys        — list all keys (masked, no plaintext)
 *   DELETE /v1/admin/key-pool/keys/:id   — deactivate a key
 *   GET    /v1/admin/key-pool/health      — pool health summary per provider
 *   POST   /v1/admin/key-pool/cache/invalidate — force cache refresh
 *   GET    /v1/admin/key-pool/events      — recent rotation/failure events
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { SOVEREIGN_CREATOR_EMAIL } from '../services/intelligence/sovereignCreatorDirective.js';
import {
  addKeyToPool,
  deactivateKey,
  listKeys,
  invalidatePoolCache,
  type ProviderName,
} from '../services/inference/keyPoolService.js';

const PROVIDERS: ProviderName[] = ['groq', 'openai', 'openrouter', 'gemini'];

function isSovereign(request: FastifyRequest): boolean {
  const email = request.atlasVerifiedEmail;
  return !!email && email.toLowerCase() === SOVEREIGN_CREATOR_EMAIL.toLowerCase();
}

function sovereignGuard(request: FastifyRequest, reply: { code: (n: number) => { send: (b: unknown) => void } }): boolean {
  if (!isSovereign(request)) {
    reply.code(403).send({ error: 'Sovereign access required' });
    return false;
  }
  return true;
}

export function registerKeyPoolAdminRoutes(app: FastifyInstance): void {

  // ── POST /v1/admin/key-pool/keys ─────────────────────────────────────────
  // Add a new key to the pool. Key is encrypted before storage.
  app.post('/v1/admin/key-pool/keys', async (request, reply) => {
    if (!sovereignGuard(request, reply)) return;

    const schema = z.object({
      provider: z.enum(['groq', 'openai', 'openrouter', 'gemini']),
      label: z.string().min(1).max(64),
      apiKey: z.string().min(8).max(512),
      priority: z.number().int().min(1).max(999).optional(),
      notes: z.string().max(512).optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.issues });
    }

    const { provider, label, apiKey, priority, notes } = parsed.data;
    const result = await addKeyToPool({
      provider,
      label,
      apiKey,
      priority,
      addedBy: request.atlasVerifiedEmail ?? 'sovereign',
      notes,
    });

    if (!result.success) {
      return reply.code(500).send({ error: result.error ?? 'Failed to add key' });
    }

    return reply.code(201).send({
      ok: true,
      id: result.id,
      message: `Key "${label}" added to ${provider} pool. Available immediately.`,
    });
  });

  // ── GET /v1/admin/key-pool/keys ──────────────────────────────────────────
  // List all keys. API key values are NEVER returned — only metadata.
  app.get('/v1/admin/key-pool/keys', async (request, reply) => {
    if (!sovereignGuard(request, reply)) return;

    const query = (request.query as Record<string, string>);
    const provider = PROVIDERS.includes(query['provider'] as ProviderName)
      ? (query['provider'] as ProviderName)
      : undefined;

    const keys = await listKeys(provider);

    // Also include env key status (whether configured, not the value)
    const envStatus: Record<string, boolean> = {
      groq: !!(process.env['GROQ_API_KEY'] || process.env['ATLAS_CLOUD_OPENAI_API_KEY']),
      openai: !!process.env['OPENAI_API_KEY'],
      openrouter: !!process.env['OPENROUTER_API_KEY'],
      gemini: !!process.env['GEMINI_API_KEY'],
    };

    return reply.send({
      ok: true,
      envKeys: envStatus,
      poolKeys: keys,
      total: keys.length,
    });
  });

  // ── DELETE /v1/admin/key-pool/keys/:id ──────────────────────────────────
  app.delete('/v1/admin/key-pool/keys/:id', async (request, reply) => {
    if (!sovereignGuard(request, reply)) return;

    const params = request.params as { id: string };
    const query = request.query as { provider: string };
    const provider = query['provider'] as ProviderName;

    if (!params.id || !PROVIDERS.includes(provider)) {
      return reply.code(400).send({ error: 'id and valid provider query param required' });
    }

    await deactivateKey(params.id, provider);
    return reply.send({ ok: true, message: `Key ${params.id} deactivated` });
  });

  // ── GET /v1/admin/key-pool/health ────────────────────────────────────────
  // Per-provider health summary: total keys, available, in cooldown
  app.get('/v1/admin/key-pool/health', async (request, reply) => {
    if (!sovereignGuard(request, reply)) return;

    const allKeys = await listKeys();
    const now = new Date().toISOString();

    const summary = PROVIDERS.map((provider) => {
      const providerKeys = allKeys.filter((k) => k.provider === provider);
      const active = providerKeys.filter((k) => k.isActive);
      const inCooldown = active.filter(
        (k) => k.cooldownUntil && new Date(k.cooldownUntil) > new Date(),
      );
      const available = active.length - inCooldown.length;
      const envConfigured = !!(
        provider === 'groq'
          ? process.env['GROQ_API_KEY'] || process.env['ATLAS_CLOUD_OPENAI_API_KEY']
          : provider === 'openai'
          ? process.env['OPENAI_API_KEY']
          : provider === 'openrouter'
          ? process.env['OPENROUTER_API_KEY']
          : process.env['GEMINI_API_KEY']
      );

      return {
        provider,
        envKeyConfigured: envConfigured,
        poolKeys: {
          total: providerKeys.length,
          active: active.length,
          available: available + (envConfigured ? 1 : 0), // env key always available if configured
          inCooldown: inCooldown.length,
        },
        status: (envConfigured || available > 0) ? 'healthy' : 'no_keys',
      };
    });

    return reply.send({ ok: true, checkedAt: now, providers: summary });
  });

  // ── POST /v1/admin/key-pool/cache/invalidate ────────────────────────────
  app.post('/v1/admin/key-pool/cache/invalidate', async (request, reply) => {
    if (!sovereignGuard(request, reply)) return;

    for (const p of PROVIDERS) {
      invalidatePoolCache(p);
    }
    return reply.send({ ok: true, message: 'Key pool cache invalidated for all providers' });
  });

  // ── GET /v1/admin/key-pool/events ───────────────────────────────────────
  // Recent key rotation / failure events
  app.get('/v1/admin/key-pool/events', async (request, reply) => {
    if (!sovereignGuard(request, reply)) return;

    const url = process.env['SUPABASE_URL'];
    const key = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? process.env['SUPABASE_SERVICE_KEY'];
    if (!url || !key) {
      return reply.code(503).send({ error: 'Supabase not configured' });
    }

    try {
      const res = await fetch(
        `${url}/rest/v1/provider_key_events?order=created_at.desc&limit=100`,
        {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(4_000),
        },
      );
      if (!res.ok) {
        return reply.code(502).send({ error: 'Failed to fetch events' });
      }
      const events = await res.json();
      return reply.send({ ok: true, events });
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
