/**
 * Atlas Concept Hygiene
 * Phase 2 Governance
 *
 * Alias merging, duplicate concept collapse, false-edge pruning,
 * temporal weighting, and confidence on graph relationships.
 */

export interface ConceptNode {
  id: string;
  userId: string;
  label: string;
  aliases: string[]; // merged names
  domain: string;
  confidence: number; // 0–1
  weight: number; // temporal decay applied
  createdAt: string;
  lastReinforcedAt: string;
  mergedFromIds: string[]; // IDs of nodes this was merged from
}

export interface ConceptEdge {
  id: string;
  userId: string;
  sourceId: string;
  targetId: string;
  relationshipType: string;
  confidence: number; // 0–1
  evidenceCount: number; // how many messages supported this edge
  falseEdgePruned: boolean;
  createdAt: string;
  lastSeenAt: string;
}

const nodeStore: Map<string, ConceptNode[]> = new Map();
const edgeStore: Map<string, ConceptEdge[]> = new Map();

// Minimum evidence count to keep an edge
const MIN_EDGE_EVIDENCE = 2;

// Temporal decay rate per day for node weight
const NODE_DECAY_RATE = 0.02;

// Similarity threshold for alias merging (string-based — production uses embeddings)
const ALIAS_SIMILARITY_THRESHOLD = 0.75;

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function getUserNodes(userId: string): ConceptNode[] {
  if (!nodeStore.has(userId)) nodeStore.set(userId, []);
  return nodeStore.get(userId)!;
}

function getUserEdges(userId: string): ConceptEdge[] {
  if (!edgeStore.has(userId)) edgeStore.set(userId, []);
  return edgeStore.get(userId)!;
}

/**
 * Simple string similarity (Jaccard on tokens).
 */
function stringSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/**
 * Add or reinforce a concept node. Merges with similar existing nodes.
 */
export function upsertConcept(
  userId: string,
  label: string,
  domain: string,
  confidence: number
): ConceptNode {
  const nodes = getUserNodes(userId);

  // Check for alias/duplicate
  const similar = nodes.find(
    (n) =>
      !n.mergedFromIds.length &&
      (stringSimilarity(n.label, label) >= ALIAS_SIMILARITY_THRESHOLD ||
       n.aliases.some((a) => stringSimilarity(a, label) >= ALIAS_SIMILARITY_THRESHOLD))
  );

  if (similar) {
    // Merge alias
    if (!similar.aliases.includes(label) && similar.label !== label) {
      similar.aliases.push(label);
    }
    similar.confidence = Math.min(1, similar.confidence + confidence * 0.1); // reinforce
    similar.weight = Math.min(1, similar.weight + 0.05);
    similar.lastReinforcedAt = new Date().toISOString();
    return similar;
  }

  // New node
  const node: ConceptNode = {
    id: `node-${uid()}`,
    userId,
    label,
    aliases: [],
    domain,
    confidence: Math.min(1, Math.max(0, confidence)),
    weight: 0.5,
    createdAt: new Date().toISOString(),
    lastReinforcedAt: new Date().toISOString(),
    mergedFromIds: [],
  };

  nodes.push(node);
  return node;
}

/**
 * Merge two nodes explicitly (e.g. "AI" and "Artificial Intelligence").
 */
export function mergeNodes(userId: string, primaryId: string, secondaryId: string): boolean {
  const nodes = getUserNodes(userId);
  const primary = nodes.find((n) => n.id === primaryId);
  const secondary = nodes.find((n) => n.id === secondaryId);
  if (!primary || !secondary) return false;

  primary.aliases.push(secondary.label, ...secondary.aliases);
  primary.mergedFromIds.push(secondaryId, ...secondary.mergedFromIds);
  primary.confidence = Math.min(1, (primary.confidence + secondary.confidence) / 2);
  primary.weight = Math.max(primary.weight, secondary.weight);

  // Reroute edges from secondary to primary
  const edges = getUserEdges(userId);
  for (const edge of edges) {
    if (edge.sourceId === secondaryId) edge.sourceId = primaryId;
    if (edge.targetId === secondaryId) edge.targetId = primaryId;
  }

  // Remove secondary
  const idx = nodes.indexOf(secondary);
  if (idx !== -1) nodes.splice(idx, 1);

  return true;
}

/**
 * Add or reinforce a relationship edge.
 */
export function upsertEdge(
  userId: string,
  sourceId: string,
  targetId: string,
  relationshipType: string,
  confidence: number
): ConceptEdge {
  const edges = getUserEdges(userId);

  const existing = edges.find(
    (e) => e.sourceId === sourceId && e.targetId === targetId && e.relationshipType === relationshipType
  );

  if (existing) {
    existing.evidenceCount++;
    existing.confidence = Math.min(1, existing.confidence + 0.05);
    existing.lastSeenAt = new Date().toISOString();
    existing.falseEdgePruned = false;
    return existing;
  }

  const edge: ConceptEdge = {
    id: `edge-${uid()}`,
    userId,
    sourceId,
    targetId,
    relationshipType,
    confidence: Math.min(1, Math.max(0, confidence)),
    evidenceCount: 1,
    falseEdgePruned: false,
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };

  edges.push(edge);
  return edge;
}

/**
 * Prune false edges — edges with insufficient evidence or stale last-seen date.
 */
export function pruneFalseEdges(userId: string, staleDays = 30): number {
  const edges = getUserEdges(userId);
  const cutoff = new Date(Date.now() - staleDays * 86400000).toISOString();
  let pruned = 0;

  for (const edge of edges) {
    if (!edge.falseEdgePruned && (edge.evidenceCount < MIN_EDGE_EVIDENCE || edge.lastSeenAt < cutoff)) {
      edge.falseEdgePruned = true;
      pruned++;
    }
  }

  return pruned;
}

/**
 * Apply temporal decay to node weights.
 */
export function applyTemporalDecay(userId: string): void {
  const nodes = getUserNodes(userId);
  const now = Date.now();

  for (const node of nodes) {
    const ageDays = (now - new Date(node.lastReinforcedAt).getTime()) / 86400000;
    node.weight = Math.max(0.05, node.weight - NODE_DECAY_RATE * ageDays);
  }
}

export function getActiveNodes(userId: string): ConceptNode[] {
  return getUserNodes(userId).filter((n) => n.weight > 0.1 && !n.mergedFromIds.length);
}

export function getActiveEdges(userId: string): ConceptEdge[] {
  return getUserEdges(userId).filter((e) => !e.falseEdgePruned);
}

export function getGraphStats(userId: string): { nodes: number; edges: number; aliases: number; prunedEdges: number } {
  const nodes = getUserNodes(userId);
  const edges = getUserEdges(userId);
  return {
    nodes: nodes.filter((n) => !n.mergedFromIds.length).length,
    edges: edges.filter((e) => !e.falseEdgePruned).length,
    aliases: nodes.reduce((s, n) => s + n.aliases.length, 0),
    prunedEdges: edges.filter((e) => e.falseEdgePruned).length,
  };
}
