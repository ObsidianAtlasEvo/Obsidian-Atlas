// =============================================================================
// Obsidian Atlas — Overseer Admin/Debug Routes
//
// Fastify plugin registered at prefix /api/overseer.
//
// Routes:
//   GET  /api/overseer/training/:userId   → OverseerTrainingSummary
//   GET  /api/overseer/thresholds/:userId → OverseerThresholds
//   GET  /api/overseer/history/:userId    → last 20 OverseerTrainingRecords
//   POST /api/overseer/test               → run the full overseer pipeline
//
// Usage
// -----
// Register via:
//
//   import overseerRoutes from './overseer/overseerRoutes.js';
//
//   fastify.register(overseerRoutes, {
//     prefix: '/api/overseer',
//     overseer: myAtlasOverseer,
//     trainer:  myOverseerTrainer,
//     getAdaptationState: (userId) => evolutionEngine.getAdaptationState(userId),
//     atlasSystemPrompt: systemPromptString,   // optional
//   });
//
// The plugin is self-contained — it does not depend on Fastify decorators.
// All dependencies are passed via the options object.
// =============================================================================

import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyRequest,
  FastifyReply,
} from 'fastify';

import {
  AtlasOverseer,
  type OverseerInput,
  type OverseerOutput,
} from '../services/atlasOverseer.js';

import {
  OverseerTrainer,
  type OverseerTrainingSummary,
  type OverseerThresholds,
  type OverseerTrainingRecord,
} from '../services/overseerTrainer.js';

import { type AtlasAdaptationState } from '../types/evolutionTypes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Plugin options
// ─────────────────────────────────────────────────────────────────────────────

export interface OverseerPluginOptions {
  /** AtlasOverseer instance. Required. */
  overseer: AtlasOverseer;

  /** OverseerTrainer instance. Required. */
  trainer: OverseerTrainer;

  /**
   * Async resolver for a user's AtlasAdaptationState.
   * Typically delegates to EvolutionEngine.getAdaptationState(userId).
   * If omitted, adaptation state is always null in /test calls.
   */
  getAdaptationState?: (userId: string) => Promise<AtlasAdaptationState | null>;

  /**
   * Atlas system prompt injected into /test pipeline calls.
   * Defaults to a minimal stub if not provided.
   */
  atlasSystemPrompt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route param / body types
// ─────────────────────────────────────────────────────────────────────────────

interface UserIdParams {
  userId: string;
}

interface TestBody {
  userId: string;
  query: string;
  rawSynthesis: string;
  /** Optional inline override — skips the getAdaptationState lookup when set. */
  adaptationState?: AtlasAdaptationState;
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON Schema definitions
// ─────────────────────────────────────────────────────────────────────────────

const paramsSchema = {
  type: 'object',
  required: ['userId'],
  properties: {
    userId: { type: 'string', minLength: 1 },
  },
} as const;

const testBodySchema = {
  type: 'object',
  required: ['userId', 'query', 'rawSynthesis'],
  properties: {
    userId: { type: 'string', minLength: 1 },
    query: { type: 'string', minLength: 1 },
    rawSynthesis: { type: 'string', minLength: 1 },
    adaptationState: { type: 'object', nullable: true },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Plugin implementation
// ─────────────────────────────────────────────────────────────────────────────

const overseerRoutes: FastifyPluginAsync<OverseerPluginOptions> = async (
  fastify: FastifyInstance,
  options: OverseerPluginOptions,
): Promise<void> => {

  const { overseer, trainer } = options;

  const resolveAdaptationState: (userId: string) => Promise<AtlasAdaptationState | null> =
    options.getAdaptationState ?? ((_id) => Promise.resolve(null));

  const atlasSystemPrompt: string =
    options.atlasSystemPrompt ??
    'You are Atlas — a sovereign personal intelligence. Be precise, direct, and intellectually serious.';

  // ── GET /training/:userId ─────────────────────────────────────────────────

  fastify.get<{ Params: UserIdParams }>(
    '/training/:userId',
    { schema: { params: paramsSchema } },
    async (
      request: FastifyRequest<{ Params: UserIdParams }>,
      reply: FastifyReply,
    ): Promise<void> => {
      const { userId } = request.params;

      try {
        const summary: OverseerTrainingSummary = trainer.getTrainingSummary(userId);
        await reply.status(200).send(summary);
      } catch (err) {
        request.log.error(
          { err, userId },
          '[overseerRoutes] GET /training error',
        );
        await reply.status(500).send({
          error: 'Failed to retrieve training summary',
          userId,
        });
      }
    },
  );

  // ── GET /thresholds/:userId ───────────────────────────────────────────────

  fastify.get<{ Params: UserIdParams }>(
    '/thresholds/:userId',
    { schema: { params: paramsSchema } },
    async (
      request: FastifyRequest<{ Params: UserIdParams }>,
      reply: FastifyReply,
    ): Promise<void> => {
      const { userId } = request.params;

      try {
        const thresholds: OverseerThresholds = trainer.getAdaptedThresholds(userId);
        await reply.status(200).send(thresholds);
      } catch (err) {
        request.log.error(
          { err, userId },
          '[overseerRoutes] GET /thresholds error',
        );
        await reply.status(500).send({
          error: 'Failed to retrieve adapted thresholds',
          userId,
        });
      }
    },
  );

  // ── GET /history/:userId ──────────────────────────────────────────────────

  fastify.get<{ Params: UserIdParams }>(
    '/history/:userId',
    { schema: { params: paramsSchema } },
    async (
      request: FastifyRequest<{ Params: UserIdParams }>,
      reply: FastifyReply,
    ): Promise<void> => {
      const { userId } = request.params;

      try {
        // The records Map is private on OverseerTrainer, which is correct for
        // production code. This admin/debug route accesses it via a deliberate
        // type cast — it should never be exposed in a user-facing endpoint.
        const internal = trainer as unknown as {
          records: Map<string, OverseerTrainingRecord[]>;
        };
        const all: OverseerTrainingRecord[] = internal.records.get(userId) ?? [];

        // Return the 20 most recent records, newest first
        const recent = all.slice(-20).reverse();

        await reply.status(200).send({
          userId,
          count: recent.length,
          records: recent,
        });
      } catch (err) {
        request.log.error(
          { err, userId },
          '[overseerRoutes] GET /history error',
        );
        await reply.status(500).send({
          error: 'Failed to retrieve training history',
          userId,
        });
      }
    },
  );

  // ── POST /test ────────────────────────────────────────────────────────────

  fastify.post<{ Body: TestBody }>(
    '/test',
    { schema: { body: testBodySchema } },
    async (
      request: FastifyRequest<{ Body: TestBody }>,
      reply: FastifyReply,
    ): Promise<void> => {
      const { userId, query, rawSynthesis, adaptationState: inlineState } = request.body;

      try {
        // Resolve adaptation state: inline override > live lookup > null
        const adaptationState: AtlasAdaptationState | null =
          inlineState ?? (await resolveAdaptationState(userId));

        // Build a minimal OverseerInput that exercises the full pipeline
        const input: OverseerInput = {
          userId,
          sessionId: `overseer-test-${Date.now()}`,
          originalQuery: query,
          rawSynthesis,
          // Provide the raw synthesis as a single synthetic model response so
          // the consistency scorer has something to work with
          modelResponses: [
            {
              model: 'test-passthrough',
              provider: 'test',
              content: rawSynthesis,
              durationMs: 0,
              status: 'success',
            },
          ],
          queryMode: 'analytical',
          adaptationState,
          atlasSystemPrompt,
        };

        const output: OverseerOutput = await overseer.evaluate(input);
        await reply.status(200).send(output);

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        request.log.error(
          { err, userId, queryPreview: query.slice(0, 100) },
          '[overseerRoutes] POST /test error',
        );
        await reply.status(500).send({
          error: 'Overseer test pipeline failed',
          message,
          userId,
        });
      }
    },
  );
};

export default overseerRoutes;
