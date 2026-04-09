import { 
  ResonanceEdge, 
  ResonanceEdgeType, 
  ResonanceDomain 
} from "./types";

/**
 * Resonance Graph Manager.
 * This module manages the relationships between different resonant entities.
 */

export interface ResonanceGraph {
  nodes: Record<string, any>; // Nodes can be themes, projects, people, etc.
  edges: ResonanceEdge[];
}

/**
 * Adds or updates an edge in the resonance graph.
 */
export function updateResonanceEdge(
  graph: ResonanceGraph,
  fromNode: string,
  toNode: string,
  edgeType: ResonanceEdgeType,
  weight: number = 0.5
): ResonanceGraph {
  // Ensure nodes exist in the graph
  const updatedNodes = { ...graph.nodes };
  if (!updatedNodes[fromNode]) {
    updatedNodes[fromNode] = { id: fromNode, type: 'theme', label: fromNode, weight: 0.2 };
  }
  if (!updatedNodes[toNode]) {
    updatedNodes[toNode] = { id: toNode, type: 'theme', label: toNode, weight: 0.2 };
  }

  const existingEdgeIndex = graph.edges.findIndex(edge => 
    (edge.fromNode === fromNode && edge.toNode === toNode && edge.edgeType === edgeType) ||
    (edge.fromNode === toNode && edge.toNode === fromNode && edge.edgeType === edgeType)
  );

  if (existingEdgeIndex !== -1) {
    // Update existing edge
    const existingEdge = graph.edges[existingEdgeIndex];
    const updatedEdge: ResonanceEdge = {
      ...existingEdge,
      weight: (existingEdge.weight * 0.7) + (weight * 0.3),
      evidenceCount: existingEdge.evidenceCount + 1,
      confidence: Math.min(1, existingEdge.confidence + 0.05)
    };
    
    return {
      ...graph,
      nodes: updatedNodes,
      edges: [
        ...graph.edges.slice(0, existingEdgeIndex),
        updatedEdge,
        ...graph.edges.slice(existingEdgeIndex + 1)
      ]
    };
  } else {
    // Create new edge
    const newEdge: ResonanceEdge = {
      edgeId: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fromNode,
      toNode,
      edgeType,
      weight,
      confidence: 0.2,
      evidenceCount: 1
    };
    
    return {
      ...graph,
      nodes: updatedNodes,
      edges: [...graph.edges, newEdge]
    };
  }
}

/**
 * Clusters related themes into higher-order life domains.
 * This is the "Resonance Clustering" feature.
 */
export function clusterResonanceThemes(
  themes: string[],
  edges: ResonanceEdge[]
): Record<ResonanceDomain, string[]> {
  const clusters: Record<ResonanceDomain, string[]> = {
    [ResonanceDomain.GENERAL]: [],
    [ResonanceDomain.SELF_CONCEPT]: [],
    [ResonanceDomain.AMBITION]: [],
    [ResonanceDomain.WORK]: [],
    [ResonanceDomain.CREATIVITY]: [],
    [ResonanceDomain.RELATIONSHIPS]: [],
    [ResonanceDomain.AESTHETICS]: [],
    [ResonanceDomain.DISCIPLINE]: [],
    [ResonanceDomain.INSECURITY]: [],
    [ResonanceDomain.MEANING]: [],
    [ResonanceDomain.LOYALTY]: [],
    [ResonanceDomain.MASTERY]: [],
    [ResonanceDomain.HEALING]: [],
    [ResonanceDomain.IDENTITY_CONSTRUCTION]: [],
    [ResonanceDomain.TECHNICAL]: [],
    [ResonanceDomain.STRATEGIC]: [],
    [ResonanceDomain.WRITING]: [],
    [ResonanceDomain.IMPLEMENTATION]: [],
    [ResonanceDomain.REFLECTIVE]: [],
    [ResonanceDomain.FACTUAL]: [],
    [ResonanceDomain.ANALYTICAL]: []
  };

  // Simple clustering logic based on edge weights and types
  // In a real implementation, this would use a more sophisticated graph algorithm
  themes.forEach(theme => {
    // Determine the domain for each theme based on its edges
    // For now, we'll use a placeholder logic
    const domain = inferDomainFromTheme(theme);
    clusters[domain].push(theme);
  });

  return clusters;
}

/**
 * Placeholder for theme-to-domain inference.
 * In a real implementation, this would use an LLM or a semantic lookup.
 */
function inferDomainFromTheme(theme: string): ResonanceDomain {
  const t = theme.toLowerCase();
  if (t.includes("career") || t.includes("goal") || t.includes("success")) return ResonanceDomain.AMBITION;
  if (t.includes("art") || t.includes("design") || t.includes("writing")) return ResonanceDomain.CREATIVITY;
  if (t.includes("family") || t.includes("friend") || t.includes("love")) return ResonanceDomain.RELATIONSHIPS;
  if (t.includes("style") || t.includes("beauty") || t.includes("vibe")) return ResonanceDomain.AESTHETICS;
  if (t.includes("fear") || t.includes("doubt") || t.includes("anxiety")) return ResonanceDomain.INSECURITY;
  if (t.includes("who i am") || t.includes("self")) return ResonanceDomain.SELF_CONCEPT;
  
  return ResonanceDomain.MEANING; // Default
}

/**
 * Detects contradictions in the graph.
 * This is the "Resonance Contradiction Mapping" feature.
 */
export function detectGraphContradictions(
  edges: ResonanceEdge[]
): ResonanceEdge[] {
  return edges.filter(edge => edge.edgeType === ResonanceEdgeType.CONTRADICTION);
}
