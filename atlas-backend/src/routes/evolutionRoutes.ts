/**
 * evolutionRoutes.ts
 *
 * Fastify route plugin for the Obsidian Atlas evolution system.
 *
 * Register at prefix: /api/evolution
 *
 *   GET    /api/evolution/profile/:userId     — full profile (admin/debug)
 *   GET    /api/evolution/stats/:userId       — lightweight stats
 *   POST   /api/evolution/rebuild/:userId     — force rebuild
 *   DELETE /api/evolution/profile/:userId     — GDPR erasure
 *   GET    /api/evolution/adaptation/:userId  — AtlasAdaptationState (prompt layer)
 *
 * Auth
 * ────
 * All routes perform a simple check: the authenticated userId (from cookie or
 * query param) must match the :userId path param. In production this should be
 * replaced with proper JWT / session verification.
 *
 * TODO (production): Replace the userId cookie / query-param auth check with
 * a verified JWT claim extracted by a Fastify authentication plugin (e.g.
 * @fastify/jwt or a custom preHandler). The current check prevents the most
 * obvious IDOR attacks but is not cryptographically secure.
 */

import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { EvolutionEngine } from '../services/evolutionEngine.js';
import { EvolutionRepository } from '../db/evolutionRepository.js';

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface EvolutionRoutesOptions {
  /**
   * A fully initialised EvolutionEngine instance (shared with the rest of
   * the server — do not create a new one here).
   */
  engine: EvolutionEngine;
  /**
   * A fully initialised EvolutionRepository instance for direct DB queries
   * that don't need the engine (stats, delete, etc.).
   */
  repository: EvolutionRepository;
}

// ---------------------------------------------------------------------------
// Request param / query shapes
// ---------------------------------------------------------------------------

interface UserIdParams {
  userId: string;
}

interface AuthQuery {
  /**
   * The authenticated user's ID passed as a query param.
   * In production this comes from a verified JWT — see TODO above.
   */
  userId?: string;
}

// CodeQL: consume() must run in a separate preHandler registered via fastify.route({ preHandler, handler })
// — shorthand fastify.get/post only models the last handler, so same-function consume does not guard the route.
const evolutionProfileLimiter = new RateLimiterMemory({ points: 100, duration: 60 });
const evolutionStatsLimiter = new RateLimiterMemory({ points: 60, duration: 60 });
const evolutionRebuildLimiter = new RateLimiterMemory({ points: 5, duration: 60 });
const evolutionDeleteLimiter = new RateLimiterMemory({ points: 10, duration: 60 });
const evolutionAdaptationLimiter = new RateLimiterMemory({ points: 60, duration: 60 });

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

const evolutionRoutes: FastifyPluginAsync<EvolutionRoutesOptions> = async (
  fastify: FastifyInstance,
  opts: EvolutionRoutesOptions,
) => {
  const { engine, repository } = opts;

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/evolution/profile/:userId
  // Returns the full UserEvolutionProfile for debugging and admin tooling.
  // ─────────────────────────────────────────────────────────────────────────

  fastify.route<{ Params: UserIdParams; Querystring: AuthQuery }>({
    method: 'GET',
    url: '/profile/:userId',
    schema: {
      params: {
        type: 'object',
        required: ['userId'],
        properties: { userId: { type: 'string', minLength: 1 } },
      },
      querystring: {
        type: 'object',
        properties: { userId: { type: 'string' } },
      },
      response: {
        200: { type: 'object', additionalProperties: true },
        403: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: async (request, reply) => {
      try {
        await evolutionProfileLimiter.consume(request.ip);
      } catch {
        return reply.status(429).send({ error: 'Too many requests' });
      }
    },
    handler: async (req: FastifyRequest<{ Params: UserIdParams; Querystring: AuthQuery }>, reply: FastifyReply) => {
      if (!authorised(req.params.userId, req)) {
        return reply.status(403).send({ error: 'Forbidden: userId mismatch' });
      }

      const profile = await repository.getProfile(req.params.userId);

      if (!profile) {
        return reply.status(404).send({ error: 'No evolution profile found for this user' });
      }

      return reply.status(200).send(profile);
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/evolution/stats/:userId
  // Lightweight endpoint — returns only version, confidence, totalSignals.
  // ─────────────────────────────────────────────────────────────────────────

  fastify.route<{ Params: UserIdParams; Querystring: AuthQuery }>({
    method: 'GET',
    url: '/stats/:userId',
    schema: {
      params: {
        type: 'object',
        required: ['userId'],
        properties: { userId: { type: 'string', minLength: 1 } },
      },
      querystring: {
        type: 'object',
        properties: { userId: { type: 'string' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            version:      { type: 'integer' },
            confidence:   { type: 'number' },
            totalSignals: { type: 'integer' },
          },
        },
        403: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: async (request, reply) => {
      try {
        await evolutionStatsLimiter.consume(request.ip);
      } catch {
        return reply.status(429).send({ error: 'Too many requests' });
      }
    },
    handler: async (req: FastifyRequest<{ Params: UserIdParams; Querystring: AuthQuery }>, reply: FastifyReply) => {
      if (!authorised(req.params.userId, req)) {
        return reply.status(403).send({ error: 'Forbidden: userId mismatch' });
      }

      const stats = await repository.getProfileStats(req.params.userId);

      if (!stats) {
        return reply.status(404).send({ error: 'No evolution profile found for this user' });
      }

      return reply.status(200).send(stats);
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/evolution/rebuild/:userId
  // Forces a full profile rebuild from scratch (clears cache, reprocesses all
  // stored signals). Useful for admin overrides and integration tests.
  // ─────────────────────────────────────────────────────────────────────────

  fastify.route<{ Params: UserIdParams; Querystring: AuthQuery }>({
    method: 'POST',
    url: '/rebuild/:userId',
    schema: {
      params: {
        type: 'object',
        required: ['userId'],
        properties: { userId: { type: 'string', minLength: 1 } },
      },
      querystring: {
        type: 'object',
        properties: { userId: { type: 'string' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        403: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: async (request, reply) => {
      try {
        await evolutionRebuildLimiter.consume(request.ip);
      } catch {
        return reply.status(429).send({ error: 'Too many requests' });
      }
    },
    handler: async (req: FastifyRequest<{ Params: UserIdParams; Querystring: AuthQuery }>, reply: FastifyReply) => {
      if (!authorised(req.params.userId, req)) {
        return reply.status(403).send({ error: 'Forbidden: userId mismatch' });
      }

      // forceRebuild is async but we await it so the caller gets a definitive
      // success/failure signal (unlike the fire-and-forget onInteraction path).
      await engine.forceRebuild(req.params.userId);

      return reply.status(200).send({
        success: true,
        message: `Evolution profile rebuilt for user ${req.params.userId}`,
      });
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /api/evolution/profile/:userId
  // Permanently deletes all evolution data for a user.
  // Satisfies GDPR Article 17 "right to erasure".
  // ─────────────────────────────────────────────────────────────────────────

  fastify.route<{ Params: UserIdParams; Querystring: AuthQuery }>({
    method: 'DELETE',
    url: '/profile/:userId',
    schema: {
      params: {
        type: 'object',
        required: ['userId'],
        properties: { userId: { type: 'string', minLength: 1 } },
      },
      querystring: {
        type: 'object',
        properties: { userId: { type: 'string' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        403: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: async (request, reply) => {
      try {
        await evolutionDeleteLimiter.consume(request.ip);
      } catch {
        return reply.status(429).send({ error: 'Too many requests' });
      }
    },
    handler: async (req: FastifyRequest<{ Params: UserIdParams; Querystring: AuthQuery }>, reply: FastifyReply) => {
      if (!authorised(req.params.userId, req)) {
        return reply.status(403).send({ error: 'Forbidden: userId mismatch' });
      }

      await repository.deleteUserData(req.params.userId);

      return reply.status(200).send({
        success: true,
        message: `All evolution data deleted for user ${req.params.userId}`,
      });
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/evolution/adaptation/:userId
  // Returns the AtlasAdaptationState for a user — consumed by the frontend
  // and by atlasPrompt.ts to inject personalisation into the system prompt.
  // ─────────────────────────────────────────────────────────────────────────

  fastify.route<{ Params: UserIdParams; Querystring: AuthQuery }>({
    method: 'GET',
    url: '/adaptation/:userId',
    schema: {
      params: {
        type: 'object',
        required: ['userId'],
        properties: { userId: { type: 'string', minLength: 1 } },
      },
      querystring: {
        type: 'object',
        properties: { userId: { type: 'string' } },
      },
      response: {
        200: { type: 'object', additionalProperties: true },
        204: { type: 'null', description: 'Not enough data yet — no adaptation state available' },
        403: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preHandler: async (request, reply) => {
      try {
        await evolutionAdaptationLimiter.consume(request.ip);
      } catch {
        return reply.status(429).send({ error: 'Too many requests' });
      }
    },
    handler: async (req: FastifyRequest<{ Params: UserIdParams; Querystring: AuthQuery }>, reply: FastifyReply) => {
      if (!authorised(req.params.userId, req)) {
        return reply.status(403).send({ error: 'Forbidden: userId mismatch' });
      }

      const adaptationState = await engine.getAdaptationState(req.params.userId);

      if (!adaptationState) {
        // Not enough signal data yet — return 204 so callers can treat as
        // "use defaults" without treating it as an error.
        return reply.status(204).send();
      }

      return reply.status(200).send(adaptationState);
    },
  });
};

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

/**
 * Naive auth check: the caller must pass a `userId` query param (or cookie)
 * matching the target :userId path param.
 *
 * TODO (production): Replace this with a proper JWT / session validation
 * preHandler. This guard prevents obvious IDOR attacks in development but
 * is not sufficient for a production system.
 */
function authorised(
  targetUserId: string,
  req: FastifyRequest<{ Querystring: AuthQuery }>,
): boolean {
  // Prefer cookie over query param when both are present.
  const cookieUserId = (req.cookies as Record<string, string | undefined> | undefined)?.['userId'];
  const callerUserId = cookieUserId ?? req.query.userId;

  if (!callerUserId) return false;

  return callerUserId === targetUserId;
}

// ---------------------------------------------------------------------------
// Export as a fastify-plugin so it does not create an isolated Fastify scope,
// allowing it to share the parent server's decorators and hooks.
// ---------------------------------------------------------------------------

export default fp(evolutionRoutes, {
  name: 'evolution-routes',
  fastify: '>=5.0.0',
});
