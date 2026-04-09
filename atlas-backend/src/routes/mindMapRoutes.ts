import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  archiveMindMapNode,
  computeMindMapInsights,
  createMindMapSnapshot,
  createUserMindMapNode,
  ensureMindMapSeed,
  getMindMapSnapshot,
  listMindMapEdges,
  listMindMapNodes,
  listMindMapSnapshots,
  patchMindMapNode,
  syncMindMapFromGovernance,
} from '../services/governance/mindMapService.js';

const userIdQuery = z.object({ userId: z.string().min(1) });

export function registerMindMapRoutes(app: FastifyInstance): void {
  app.get('/v1/cognitive/mind-map/graph', async (request, reply) => {
    const parsed = userIdQuery
      .extend({ sync: z.enum(['0', '1']).optional(), includeArchived: z.enum(['0', '1']).optional() })
      .safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    const { userId, sync, includeArchived } = parsed.data;
    ensureMindMapSeed(userId);
    if (sync === '1') {
      syncMindMapFromGovernance(userId);
    }
    const inc = includeArchived === '1';
    const nodes = listMindMapNodes(userId, inc);
    const edges = listMindMapEdges(userId, inc);
    const insights = computeMindMapInsights(userId);
    return reply.send({ nodes, edges, insights });
  });

  app.post('/v1/cognitive/mind-map/seed', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    ensureMindMapSeed(parsed.data.userId);
    return reply.send({ ok: true });
  });

  app.post('/v1/cognitive/mind-map/sync', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    const result = syncMindMapFromGovernance(parsed.data.userId);
    const nodes = listMindMapNodes(parsed.data.userId);
    const edges = listMindMapEdges(parsed.data.userId);
    const insights = computeMindMapInsights(parsed.data.userId);
    return reply.send({ ...result, nodes, edges, insights });
  });

  app.get('/v1/cognitive/mind-map/insights', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    ensureMindMapSeed(parsed.data.userId);
    return reply.send({ insights: computeMindMapInsights(parsed.data.userId) });
  });

  app.post('/v1/cognitive/mind-map/snapshots', async (request, reply) => {
    const parsed = z
      .object({ userId: z.string().min(1), label: z.string().max(200).optional() })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    ensureMindMapSeed(parsed.data.userId);
    const id = createMindMapSnapshot(parsed.data.userId, parsed.data.label);
    return reply.status(201).send({ snapshotId: id });
  });

  app.get('/v1/cognitive/mind-map/snapshots', async (request, reply) => {
    const parsed = userIdQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    return reply.send({ snapshots: listMindMapSnapshots(parsed.data.userId) });
  });

  app.get('/v1/cognitive/mind-map/snapshots/:id', async (request, reply) => {
    const id = z.string().min(1).safeParse((request.params as { id?: string }).id);
    const parsed = userIdQuery.safeParse(request.query);
    if (!id.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    const snap = getMindMapSnapshot(parsed.data.userId, id.data);
    if (!snap) return reply.status(404).send({ error: 'not_found' });
    return reply.send(snap);
  });

  app.patch('/v1/cognitive/mind-map/nodes/:nodeId', async (request, reply) => {
    const nodeId = z.string().min(1).safeParse((request.params as { nodeId?: string }).nodeId);
    const parsed = z
      .object({
        userId: z.string().min(1),
        title: z.string().max(500).optional(),
        subtitle: z.string().max(500).nullable().optional(),
        description: z.string().max(8000).nullable().optional(),
        pinned: z.number().int().min(0).max(1).optional(),
        archived: z.number().int().min(0).max(1).optional(),
        userConfirmed: z.number().int().min(0).max(1).nullable().optional(),
        status: z.string().max(64).optional(),
        layoutX: z.number().optional(),
        layoutY: z.number().optional(),
      })
      .safeParse(request.body);
    if (!nodeId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    const ok = patchMindMapNode(parsed.data.userId, nodeId.data, {
      title: parsed.data.title,
      subtitle: parsed.data.subtitle,
      description: parsed.data.description,
      pinned: parsed.data.pinned,
      archived: parsed.data.archived,
      userConfirmed: parsed.data.userConfirmed,
      status: parsed.data.status,
      layoutX: parsed.data.layoutX,
      layoutY: parsed.data.layoutY,
    });
    if (!ok) return reply.status(404).send({ error: 'not_found' });
    return reply.send({ ok: true });
  });

  app.post('/v1/cognitive/mind-map/nodes', async (request, reply) => {
    const parsed = z
      .object({
        userId: z.string().min(1),
        nodeKind: z.string().min(1).max(64),
        category: z.string().min(1).max(64),
        title: z.string().min(1).max(500),
        subtitle: z.string().max(500).optional(),
        description: z.string().max(8000).optional(),
        clusterKey: z.string().max(120).optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    const id = createUserMindMapNode(parsed.data);
    return reply.status(201).send({ nodeId: id });
  });

  app.delete('/v1/cognitive/mind-map/nodes/:nodeId', async (request, reply) => {
    const nodeId = z.string().min(1).safeParse((request.params as { nodeId?: string }).nodeId);
    const parsed = userIdQuery.safeParse(request.query);
    if (!nodeId.success || !parsed.success) {
      return reply.status(400).send({ error: 'validation_error' });
    }
    const ok = archiveMindMapNode(parsed.data.userId, nodeId.data);
    if (!ok) return reply.status(400).send({ error: 'cannot_archive' });
    return reply.send({ ok: true });
  });
}
