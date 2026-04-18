/**
 * userPreferencesRoutes.ts — User preferences API (model selection, etc.)
 *
 * GET  /user/preferences  → { preferredModel, availableModels, tier }
 * PATCH /user/preferences → body: { preferredModel } → 200 or 400/403
 *
 * Auth: requires attachAtlasSession (same pattern as billingRoutes).
 * Supabase: reads/writes `preferred_model` on `atlas_evolution_profiles`.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Database } from 'better-sqlite3';
import {
  TIER_MODEL_ACCESS,
  getTierForUser,
  type SubscriptionTier,
} from '../services/intelligence/groundwork/v4/subscriptionSchema.js';
import { supabaseRest } from '../db/supabase.js';
import { RATE_LIMITS } from '../plugins/rateLimit.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AtlasEvolutionProfile {
  user_id: string;
  preferred_model?: string | null;
  [key: string]: unknown;
}

function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
): { userId: string; email: string } | null {
  const session = request.atlasSession;
  if (!session) {
    void reply.status(401).send({ error: 'unauthorized', message: 'Atlas session required' });
    return null;
  }
  return session;
}

async function getPreferredModel(userId: string): Promise<string | null> {
  const result = await supabaseRest<AtlasEvolutionProfile[]>(
    'GET',
    `atlas_evolution_profiles?user_id=eq.${encodeURIComponent(userId)}&select=preferred_model`,
  );
  if (!result.ok || !result.data || result.data.length === 0) return null;
  return result.data[0]?.preferred_model ?? null;
}

async function upsertPreferredModel(userId: string, model: string | null): Promise<boolean> {
  // Supabase UPSERT: POST with Prefer: resolution=merge-duplicates
  // Creates the row if user_id doesn't exist, updates preferred_model if it does.
  const result = await supabaseRest(
    'POST',
    'atlas_evolution_profiles',
    { user_id: userId, preferred_model: model },
    { Prefer: 'resolution=merge-duplicates,return=representation' },
  );

  return result.ok;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function registerUserPreferencesRoutes(
  fastify: FastifyInstance,
  db: Database,
): Promise<void> {
  // GET /user/preferences
  fastify.get('/user/preferences', {
    config: { rateLimit: RATE_LIMITS.readUser },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = requireSession(request, reply);
    if (!session) return;

    const sub = getTierForUser(session.userId, db, session.email);
    const tier = sub.tier as SubscriptionTier;
    const availableModels = TIER_MODEL_ACCESS[tier].modelIds;

    const preferredModel = await getPreferredModel(session.userId);

    return reply.send({
      preferredModel,
      availableModels,
      tier,
    });
  });

  // PATCH /user/preferences
  fastify.patch('/user/preferences', {
    config: { rateLimit: RATE_LIMITS.writeUser },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = requireSession(request, reply);
    if (!session) return;

    const body = request.body as { preferredModel?: string | null } | undefined;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'invalid_body', message: 'Request body required' });
    }

    const { preferredModel } = body;

    // Allow null/empty to clear preference
    if (preferredModel === null || preferredModel === undefined || preferredModel === '') {
      const ok = await upsertPreferredModel(session.userId, null);
      if (!ok) {
        return reply.status(500).send({ error: 'persistence_failed', message: 'Failed to update preferences' });
      }
      return reply.send({ preferredModel: null });
    }

    if (typeof preferredModel !== 'string') {
      return reply.status(400).send({ error: 'invalid_body', message: 'preferredModel must be a string or null' });
    }

    // Validate model against tier
    const sub = getTierForUser(session.userId, db, session.email);
    const tier = sub.tier as SubscriptionTier;
    const availableModels = TIER_MODEL_ACCESS[tier].modelIds;

    if (!availableModels.includes(preferredModel)) {
      return reply.status(403).send({
        error: 'model_not_in_tier',
        message: `Model "${preferredModel}" is not available for tier "${tier}"`,
        availableModels,
      });
    }

    const ok = await upsertPreferredModel(session.userId, preferredModel);
    if (!ok) {
      return reply.status(500).send({ error: 'persistence_failed', message: 'Failed to update preferences' });
    }

    return reply.send({ preferredModel });
  });
}
