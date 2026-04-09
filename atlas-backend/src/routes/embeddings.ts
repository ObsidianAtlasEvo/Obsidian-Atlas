import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  store_entry,
  search,
  remove,
  size,
} from '../services/embeddings.js';

// ── Request body types ─────────────────────────────────────────────────────

interface StoreBody {
  id: string;
  text: string;
  metadata?: Record<string, string>;
}

interface SearchBody {
  query: string;
  topK?: number;
  threshold?: number;
}

// ── Route registration ─────────────────────────────────────────────────────

export default async function embeddingsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /v1/embeddings/store
   * Embed text and persist it in the vector store.
   */
  app.post(
    '/v1/embeddings/store',
    {
      schema: {
        body: {
          type: 'object',
          required: ['id', 'text'],
          properties: {
            id: { type: 'string', minLength: 1 },
            text: { type: 'string', minLength: 1 },
            metadata: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, text, metadata = {} } = request.body as StoreBody;

      await store_entry(id, text, metadata);

      return reply.status(201).send({
        success: true,
        id,
        storeSize: size(),
      });
    },
  );

  /**
   * POST /v1/embeddings/search
   * Search the vector store by semantic similarity.
   */
  app.post(
    '/v1/embeddings/search',
    {
      schema: {
        body: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string', minLength: 1 },
            topK: { type: 'integer', minimum: 1, maximum: 50, default: 5 },
            threshold: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              default: 0.5,
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { query, topK = 5, threshold = 0.5 } = request.body as SearchBody;

      const results = await search(query, topK, threshold);

      return reply.status(200).send({
        results: results.map((r) => ({
          id: r.entry.id,
          text: r.entry.text,
          score: r.score,
          metadata: r.entry.metadata,
          timestamp: r.entry.timestamp,
        })),
        count: results.length,
      });
    },
  );

  /**
   * DELETE /v1/embeddings/:id
   * Remove an entry from the vector store.
   */
  app.delete(
    '/v1/embeddings/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const deleted = remove(id);

      if (!deleted) {
        return reply.status(404).send({
          error: `Entry with id "${id}" not found`,
        });
      }

      return reply.status(200).send({
        success: true,
        id,
        storeSize: size(),
      });
    },
  );

  /**
   * GET /v1/embeddings/stats
   * Return statistics about the vector store.
   */
  app.get('/v1/embeddings/stats', async (_request, reply: FastifyReply) => {
    return reply.status(200).send({
      size: size(),
      timestamp: new Date().toISOString(),
    });
  });
}
