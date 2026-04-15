import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createDoctrineNode,
  updateDoctrineNode,
  archiveDoctrineNode,
  getDoctrineNode,
  listDoctrineNodes,
} from '../services/governance/doctrineService.js';
import { RATE_LIMITS } from '../plugins/rateLimit.js';

const userIdQuery = z.object({
  userId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const nodeIdParam = z.string().min(1);

const createBody = z.object({
  id: z.string().min(1).optional(),
  userId: z.string().min(1),
  layer: z.string().min(1).max(100),
  title: z.string().min(1).max(1000),
  body: z.string().min(1).max(50_000),
  priority: z.number().int().optional(),
  immutable: z.boolean().optional(),
  origin: z.string().max(50).optional(),
  versionGroupId: z.string().max(64).optional(),
});

const updateBody = z.object({
  userId: z.string().min(1),
  title: z.string().min(1).max(1000).optional(),
  body: z.string().min(1).max(50_000).optional(),
  layer: z.string().min(1).max(100).optional(),
  priority: z.number().int().optional(),
});

const deleteBody = z.object({
  userId: z.string().min(1),
});

export function registerDoctrineRoutes(app: FastifyInstance): void {
  // List active nodes
  app.get('/v1/cognitive/doctrine/nodes', {
    config: { rateLimit: RATE_LIMITS.readUser },
  }, async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const nodes = listDoctrineNodes(parsed.data.userId, parsed.data.limit ?? 100);
    return reply.send({ nodes });
  });

  // Get single node
  app.get('/v1/cognitive/doctrine/nodes/:id', {
    config: { rateLimit: RATE_LIMITS.readUser },
  }, async (request, reply) => {
    const id = nodeIdParam.safeParse((request.params as { id?: string }).id);
    const q = z.object({ userId: z.string().min(1) }).safeParse(request.query);
    if (!id.success || !q.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    const node = getDoctrineNode(id.data, q.data.userId);
    if (!node) return reply.status(404).send({ error: 'not_found' });
    return reply.send({ node });
  });

  // Create node
  app.post('/v1/cognitive/doctrine/nodes', {
    config: { rateLimit: RATE_LIMITS.writeUser },
  }, async (request, reply) => {
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const node = createDoctrineNode(parsed.data);
    return reply.status(201).send({ node });
  });

  // Update node
  app.put('/v1/cognitive/doctrine/nodes/:id', {
    config: { rateLimit: RATE_LIMITS.writeUser },
  }, async (request, reply) => {
    const id = nodeIdParam.safeParse((request.params as { id?: string }).id);
    const parsed = updateBody.safeParse(request.body);
    if (!id.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      const { userId, ...updates } = parsed.data;
      const node = updateDoctrineNode(id.data, userId, updates);
      return reply.send({ node });
    } catch {
      return reply.status(404).send({ error: 'doctrine_node_not_found' });
    }
  });

  // Archive node (soft delete)
  app.delete('/v1/cognitive/doctrine/nodes/:id', {
    config: { rateLimit: RATE_LIMITS.writeUser },
  }, async (request, reply) => {
    const id = nodeIdParam.safeParse((request.params as { id?: string }).id);
    const parsed = deleteBody.safeParse(request.body ?? request.query);
    if (!id.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    try {
      archiveDoctrineNode(id.data, parsed.data.userId);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: 'doctrine_node_not_found' });
    }
  });
}
