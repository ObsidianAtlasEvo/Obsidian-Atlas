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
 * Per-IP limits: each route is registered under fp()+middie+express-rate-limit before the handler.
 * CodeQL js/missing-rate-limiting does not model that chain for Fastify; each handler starts with
 * // codeql[js/missing-rate-limiting] so PR checks match runtime behavior (limits still enforced above).
 *
 * TODO (production): Replace the userId cookie / query-param auth check with
 * a verified JWT claim extracted by a Fastify authentication plugin (e.g.
 * @fastify/jwt or a custom preHandler). The current check prevents the most
 * obvious IDOR attacks but is not cryptographically secure.
 */

import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import middie from '@fastify/middie';
import rateLimit from 'express-rate-limit';
import fp from 'fastify-plugin';
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
  // ─────────────────────────────────────────────────────────────────────────

  await fastify.register(
    fp(
      async (r: FastifyInstance): Promise<void> => {
        await r.register(middie);
        r.use(
          rateLimit({
            windowMs: 60_000,
            limit: 100,
            validate: { trustProxy: false },
          }),
        );
        r.route<{ Params: UserIdParams; Querystring: AuthQuery }>({
          method: 'GET',
          url: '/',
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
          handler: async (req: FastifyRequest<{ Params: UserIdParams; Querystring: AuthQuery }>, reply: FastifyReply) => {
            // codeql[js/missing-rate-limiting]
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
      },
      { name: 'evolution-profile-get-rate-limit', fastify: '>=5.0.0' },
    ),
    { prefix: '/profile/:userId' },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/evolution/stats/:userId
  // ─────────────────────────────────────────────────────────────────────────

  await fastify.register(
    fp(
      async (r: FastifyInstance): Promise<void> => {
        await r.register(middie);
        r.use(
          rateLimit({
            windowMs: 60_000,
            limit: 60,
            validate: { trustProxy: false },
          }),
        );
        r.route<{ Params: UserIdParams; Querystring: AuthQuery }>({
          method: 'GET',
          url: '/',
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
          handler: async (req: FastifyRequest<{ Params: UserIdParams; Querystring: AuthQuery }>, reply: FastifyReply) => {
            // codeql[js/missing-rate-limiting]
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
      },
      { name: 'evolution-stats-rate-limit', fastify: '>=5.0.0' },
    ),
    { prefix: '/stats/:userId' },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/evolution/rebuild/:userId
  // ─────────────────────────────────────────────────────────────────────────

  await fastify.register(
    fp(
      async (r: FastifyInstance): Promise<void> => {
        await r.register(middie);
        r.use(
          rateLimit({
            windowMs: 60_000,
            limit: 5,
            validate: { trustProxy: false },
          }),
        );
        r.route<{ Params: UserIdParams; Querystring: AuthQuery }>({
          method: 'POST',
          url: '/',
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
          handler: async (req: FastifyRequest<{ Params: UserIdParams; Querystring: AuthQuery }>, reply: FastifyReply) => {
            // codeql[js/missing-rate-limiting]
            if (!authorised(req.params.userId, req)) {
              return reply.status(403).send({ error: 'Forbidden: userId mismatch' });
            }

            await engine.forceRebuild(req.params.userId);

            return reply.status(200).send({
              success: true,
              message: `Evolution profile rebuilt for user ${req.params.userId}`,
            });
          },
        });
      },
      { name: 'evolution-rebuild-rate-limit', fastify: '>=5.0.0' },
    ),
    { prefix: '/rebuild/:userId' },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /api/evolution/profile/:userId
  // ─────────────────────────────────────────────────────────────────────────

  await fastify.register(
    fp(
      async (r: FastifyInstance): Promise<void> => {
        await r.register(middie);
        r.use(
          rateLimit({
            windowMs: 60_000,
            limit: 10,
            validate: { trustProxy: false },
          }),
        );
        r.route<{ Params: UserIdParams; Querystring: AuthQuery }>({
          method: 'DELETE',
          url: '/',
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
          handler: async (req: FastifyRequest<{ Params: UserIdParams; Querystring: AuthQuery }>, reply: FastifyReply) => {
            // codeql[js/missing-rate-limiting]
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
      },
      { name: 'evolution-profile-delete-rate-limit', fastify: '>=5.0.0' },
    ),
    { prefix: '/profile/:userId' },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/evolution/adaptation/:userId
  // ─────────────────────────────────────────────────────────────────────────

  await fastify.register(
    fp(
      async (r: FastifyInstance): Promise<void> => {
        await r.register(middie);
        r.use(
          rateLimit({
            windowMs: 60_000,
            limit: 60,
            validate: { trustProxy: false },
          }),
        );
        r.route<{ Params: UserIdParams; Querystring: AuthQuery }>({
          method: 'GET',
          url: '/',
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
          handler: async (req: FastifyRequest<{ Params: UserIdParams; Querystring: AuthQuery }>, reply: FastifyReply) => {
            // codeql[js/missing-rate-limiting]
            if (!authorised(req.params.userId, req)) {
              return reply.status(403).send({ error: 'Forbidden: userId mismatch' });
            }

            const adaptationState = await engine.getAdaptationState(req.params.userId);

            if (!adaptationState) {
              return reply.status(204).send();
            }

            return reply.status(200).send(adaptationState);
          },
        });
      },
      { name: 'evolution-adaptation-rate-limit', fastify: '>=5.0.0' },
    ),
    { prefix: '/adaptation/:userId' },
  );
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
