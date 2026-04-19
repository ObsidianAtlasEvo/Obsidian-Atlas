/**
 * identityGraphService.ts — Phase 0.9: Temporal Cognition Stack
 *
 * Relational graph across memories, identity domains, projects, gaps,
 * corrections, and policies. Implements the Law of Structured Relation.
 *
 * Design invariants:
 * - Non-throwing: all errors caught, safe defaults returned.
 * - Feature-flagged: all Supabase calls gated on env.MEMORY_LAYER_ENABLED.
 * - buildGraphFromMemories() is designed for background runs, NOT the hot path.
 * - Upsert semantics on nodes (unique per user_id, node_type, entity_id).
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type NodeType =
  | 'memory'
  | 'identity_signal'
  | 'identity_domain'
  | 'project'
  | 'chamber'
  | 'correction_event'
  | 'contradiction_event'
  | 'policy_change'
  | 'gap';

export type EdgeType =
  | 'supports'
  | 'refines'
  | 'contradicts'
  | 'supersedes'
  | 'corrected_by'
  | 'derived_from'
  | 'scoped_to'
  | 'influences'
  | 'activated_by'
  | 'suppressed_by'
  | 'unresolved_with';

export interface GraphNode {
  id: string;
  userId: string;
  nodeType: NodeType;
  entityId: string;
  label: string;
  payload: Record<string, unknown>;
  graphScope: string;
  graphStatus: 'active' | 'latent' | 'archived';
  createdAt: Date;
}

export interface GraphEdge {
  id: string;
  userId: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: EdgeType;
  edgeWeight: number;
  relationConfidence: number;
  createdAt: Date;
}

interface RawNodeRow {
  id: string;
  user_id: string;
  node_type: string;
  entity_id: string;
  label: string;
  payload: Record<string, unknown>;
  graph_scope: string;
  graph_status: string;
  created_at: string;
}

interface RawEdgeRow {
  id: string;
  user_id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type: string;
  edge_weight: number;
  relation_confidence: number;
  created_at: string;
}

// ── Mappers ──────────────────────────────────────────────────────────────────

function rowToNode(row: RawNodeRow): GraphNode {
  return {
    id: row.id,
    userId: row.user_id,
    nodeType: row.node_type as NodeType,
    entityId: row.entity_id,
    label: row.label,
    payload: row.payload ?? {},
    graphScope: row.graph_scope ?? 'global',
    graphStatus: row.graph_status as GraphNode['graphStatus'],
    createdAt: new Date(row.created_at),
  };
}

function rowToEdge(row: RawEdgeRow): GraphEdge {
  return {
    id: row.id,
    userId: row.user_id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    edgeType: row.edge_type as EdgeType,
    edgeWeight: row.edge_weight ?? 0.5,
    relationConfidence: row.relation_confidence ?? 0.5,
    createdAt: new Date(row.created_at),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Upsert a graph node. Unique per (user_id, node_type, entity_id).
 * Returns the node ID (existing or new).
 */
export async function upsertNode(
  input: Omit<GraphNode, 'id' | 'createdAt'>,
): Promise<string> {
  if (!env.memoryLayerEnabled) return '';

  try {
    // Check for existing node
    const existing = await getNodeByEntity(input.userId, input.nodeType, input.entityId);
    if (existing) {
      // Update label and payload
      await supabaseRest(
        'PATCH',
        `identity_graph_nodes?id=eq.${encodeURIComponent(existing.id)}`,
        {
          label: input.label,
          payload: input.payload,
          graph_status: input.graphStatus,
          graph_scope: input.graphScope,
        },
      );
      return existing.id;
    }

    const id = randomUUID();
    const result = await supabaseRest<RawNodeRow[]>('POST', 'identity_graph_nodes', {
      id,
      user_id: input.userId,
      node_type: input.nodeType,
      entity_id: input.entityId,
      label: input.label,
      payload: input.payload ?? {},
      graph_scope: input.graphScope ?? 'global',
      graph_status: input.graphStatus ?? 'active',
    });

    if (!result.ok) {
      console.warn('[identityGraph] upsertNode failed:', result.status);
      return '';
    }
    return id;
  } catch (err) {
    console.error('[identityGraph] upsertNode error:', err);
    return '';
  }
}

/**
 * Add an edge between two graph nodes.
 * Returns the new edge ID.
 */
export async function addEdge(
  input: Omit<GraphEdge, 'id' | 'createdAt'>,
): Promise<string> {
  if (!env.memoryLayerEnabled) return '';

  try {
    const id = randomUUID();
    const result = await supabaseRest<RawEdgeRow[]>('POST', 'identity_graph_edges', {
      id,
      user_id: input.userId,
      source_node_id: input.sourceNodeId,
      target_node_id: input.targetNodeId,
      edge_type: input.edgeType,
      edge_weight: Math.max(0, Math.min(1, input.edgeWeight)),
      relation_confidence: Math.max(0, Math.min(1, input.relationConfidence)),
    });

    if (!result.ok) {
      console.warn('[identityGraph] addEdge failed:', result.status);
      return '';
    }
    return id;
  } catch (err) {
    console.error('[identityGraph] addEdge error:', err);
    return '';
  }
}

/**
 * Get neighboring nodes for a given node, optionally filtered by edge type.
 */
export async function getNeighbors(
  nodeId: string,
  edgeType?: EdgeType,
): Promise<{ node: GraphNode; edge: GraphEdge }[]> {
  if (!env.memoryLayerEnabled) return [];

  try {
    const parts = [
      `source_node_id=eq.${encodeURIComponent(nodeId)}`,
    ];
    if (edgeType) parts.push(`edge_type=eq.${encodeURIComponent(edgeType)}`);

    const edgesResult = await supabaseRest<RawEdgeRow[]>(
      'GET',
      `identity_graph_edges?${parts.join('&')}`,
    );

    if (!edgesResult.ok || !edgesResult.data || edgesResult.data.length === 0) return [];

    const edges = edgesResult.data.map(rowToEdge);
    const targetIds = edges.map((e) => e.targetNodeId);

    // Batch fetch target nodes
    const nodesResult = await supabaseRest<RawNodeRow[]>(
      'GET',
      `identity_graph_nodes?id=in.(${targetIds.map((id) => encodeURIComponent(id)).join(',')})`,
    );

    if (!nodesResult.ok || !nodesResult.data) return [];

    const nodeMap = new Map(nodesResult.data.map((r) => [r.id, rowToNode(r)]));

    return edges
      .filter((e) => nodeMap.has(e.targetNodeId))
      .map((e) => ({ node: nodeMap.get(e.targetNodeId)!, edge: e }));
  } catch (err) {
    console.error('[identityGraph] getNeighbors error:', err);
    return [];
  }
}

/**
 * Get a graph node by its entity reference.
 */
export async function getNodeByEntity(
  userId: string,
  nodeType: NodeType,
  entityId: string,
): Promise<GraphNode | null> {
  if (!env.memoryLayerEnabled) return null;

  try {
    const qs = [
      `user_id=eq.${encodeURIComponent(userId)}`,
      `node_type=eq.${encodeURIComponent(nodeType)}`,
      `entity_id=eq.${encodeURIComponent(entityId)}`,
      `limit=1`,
    ].join('&');

    const result = await supabaseRest<RawNodeRow[]>('GET', `identity_graph_nodes?${qs}`);
    if (!result.ok || !result.data || result.data.length === 0) return null;
    return rowToNode(result.data[0]!);
  } catch (err) {
    console.error('[identityGraph] getNodeByEntity error:', err);
    return null;
  }
}

/**
 * Trace the ancestry of a node by following 'derived_from' and 'corrected_by'
 * edges up to the specified depth (default 3).
 */
export async function traceAncestry(
  nodeId: string,
  depth = 3,
): Promise<GraphNode[]> {
  if (!env.memoryLayerEnabled) return [];

  const visited = new Set<string>();
  const ancestry: GraphNode[] = [];

  async function trace(currentId: string, remainingDepth: number): Promise<void> {
    if (remainingDepth <= 0 || visited.has(currentId)) return;
    visited.add(currentId);

    try {
      const qs = [
        `source_node_id=eq.${encodeURIComponent(currentId)}`,
        `edge_type=in.(derived_from,corrected_by)`,
      ].join('&');

      const edgesResult = await supabaseRest<RawEdgeRow[]>('GET', `identity_graph_edges?${qs}`);
      if (!edgesResult.ok || !edgesResult.data) return;

      for (const edge of edgesResult.data) {
        const nodeResult = await supabaseRest<RawNodeRow[]>(
          'GET',
          `identity_graph_nodes?id=eq.${encodeURIComponent(edge.target_node_id)}&limit=1`,
        );
        if (nodeResult.ok && nodeResult.data && nodeResult.data.length > 0) {
          const node = rowToNode(nodeResult.data[0]!);
          ancestry.push(node);
          await trace(node.id, remainingDepth - 1);
        }
      }
    } catch (err) {
      console.error('[identityGraph] traceAncestry inner error:', err);
    }
  }

  try {
    await trace(nodeId, depth);
  } catch (err) {
    console.error('[identityGraph] traceAncestry error:', err);
  }

  return ancestry;
}

/**
 * Build or refresh the identity graph from current memories and identity signals.
 * Designed for background runs after distiller completes — NOT in the hot path.
 */
export async function buildGraphFromMemories(userId: string): Promise<void> {
  if (!env.memoryLayerEnabled) return;

  try {
    // Load recent memories
    const memoriesResult = await supabaseRest<Array<{
      id: string;
      content: string;
      kind: string;
      scope_type?: string | null;
      scope_key?: string | null;
      superseded_by?: string | null;
      memory_class?: string | null;
    }>>(
      'GET',
      `user_memories?user_id=eq.${encodeURIComponent(userId)}&select=id,content,kind,scope_type,scope_key,superseded_by,memory_class&order=created_at.desc&limit=200`,
    );

    const memories = memoriesResult.ok && memoriesResult.data ? memoriesResult.data : [];

    // Load identity signals
    const signalsResult = await supabaseRest<Array<{
      id: string;
      domain: string;
      signal_text: string;
      source_memory_id?: string | null;
      superseded_by?: string | null;
      correction_ref?: string | null;
    }>>(
      'GET',
      `identity_signals?user_id=eq.${encodeURIComponent(userId)}&select=id,domain,signal_text,source_memory_id,superseded_by,correction_ref&limit=500`,
    );

    const signals = signalsResult.ok && signalsResult.data ? signalsResult.data : [];

    // Upsert memory nodes
    const memoryNodeIds = new Map<string, string>();
    for (const mem of memories) {
      const nodeId = await upsertNode({
        userId,
        nodeType: 'memory',
        entityId: mem.id,
        label: mem.content.slice(0, 80),
        payload: { kind: mem.kind, scope_type: mem.scope_type, memory_class: mem.memory_class },
        graphScope: mem.scope_type ?? 'global',
        graphStatus: mem.memory_class === 'anomaly' ? 'archived' : 'active',
      });
      if (nodeId) memoryNodeIds.set(mem.id, nodeId);
    }

    // Upsert identity signal nodes and wire edges
    for (const sig of signals) {
      const sigNodeId = await upsertNode({
        userId,
        nodeType: 'identity_signal',
        entityId: sig.id,
        label: sig.signal_text.slice(0, 80),
        payload: { domain: sig.domain },
        graphScope: 'global',
        graphStatus: 'active',
      });

      if (!sigNodeId) continue;

      // Edge: signal derived_from source memory
      if (sig.source_memory_id) {
        const memNodeId = memoryNodeIds.get(sig.source_memory_id);
        if (memNodeId) {
          await addEdge({
            userId,
            sourceNodeId: sigNodeId,
            targetNodeId: memNodeId,
            edgeType: 'derived_from',
            edgeWeight: 0.8,
            relationConfidence: 0.9,
          });
        }
      }

      // Edge: signal supersedes prior signal
      if (sig.superseded_by) {
        const priorNode = await getNodeByEntity(userId, 'identity_signal', sig.superseded_by);
        if (priorNode) {
          await addEdge({
            userId,
            sourceNodeId: sigNodeId,
            targetNodeId: priorNode.id,
            edgeType: 'supersedes',
            edgeWeight: 0.9,
            relationConfidence: 0.85,
          });
        }
      }
    }

    // Wire superseded memory edges
    for (const mem of memories) {
      if (mem.superseded_by) {
        const sourceNodeId = memoryNodeIds.get(mem.id);
        const targetNodeId = memoryNodeIds.get(mem.superseded_by);
        if (sourceNodeId && targetNodeId) {
          await addEdge({
            userId,
            sourceNodeId,
            targetNodeId,
            edgeType: 'supersedes',
            edgeWeight: 0.85,
            relationConfidence: 0.9,
          });
        }
      }
    }
  } catch (err) {
    console.error('[identityGraph] buildGraphFromMemories error:', err);
  }
}
