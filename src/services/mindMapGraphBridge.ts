// Atlas-Audit: [EXEC-MAP] Verified — Bridges Mind Cartography API graph into Atlas Graph Entity model (single cognitive map substrate when API available).
import type { Entity, EntityType, Relationship } from '../types';
import { MOCK_ENTITIES } from '../constants';
import { atlasApiUrl, atlasHttpEnabled } from '../lib/atlasApi';

type MindNodeRow = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  node_kind: string;
  importance: number;
  volatility: number;
  category: string;
  updated_at: string;
};

type MindEdgeRow = {
  source_id: string;
  target_id: string;
  weight: number;
  edge_type: string;
  updated_at: string;
};

function mapKind(kind: string): EntityType {
  const x = kind.toLowerCase();
  if (x.includes('person')) return 'person';
  if (x.includes('decision')) return 'decision';
  if (x.includes('pattern')) return 'pattern';
  if (x.includes('doctrine')) return 'doctrine';
  if (x.includes('question')) return 'question';
  if (x.includes('claim')) return 'claim';
  if (x.includes('scenario')) return 'scenario';
  return 'concept';
}

function mindMapToEntities(nodes: MindNodeRow[], edges: MindEdgeRow[]): Entity[] {
  const relBySource = new Map<string, Relationship[]>();
  for (const e of edges) {
    const rel: Relationship = {
      targetId: e.target_id,
      strength: Math.min(1, Math.max(0.15, Number(e.weight) || 0.5)),
      recency: e.updated_at || new Date().toISOString(),
      type: e.edge_type || 'relevance',
    };
    const list = relBySource.get(e.source_id) ?? [];
    list.push(rel);
    relBySource.set(e.source_id, list);
  }

  return nodes.map((n) => ({
    id: n.id,
    type: mapKind(n.node_kind),
    title: n.title,
    description: (n.description || n.subtitle || '').trim() || '—',
    metadata: { nodeKind: n.node_kind, category: n.category },
    tension: {
      truth: Math.min(1, 0.35 + (Number(n.importance) || 5) * 0.06),
      weight: Math.min(1, (Number(n.importance) || 5) / 10),
      timing: 0.55,
      tension: Math.min(1, (Number(n.volatility) || 3) / 10),
    },
    tags: n.category ? [n.category] : [],
    relationships: relBySource.get(n.id) ?? [],
    createdAt: n.updated_at,
    updatedAt: n.updated_at,
    memoryStatus: 'active' as const,
  }));
}

export async function fetchMindMapGraphEntities(userId: string): Promise<{
  entities: Entity[];
  live: boolean;
}> {
  if (!atlasHttpEnabled()) {
    return { entities: MOCK_ENTITIES, live: false };
  }
  try {
    const res = await fetch(
      atlasApiUrl('/v1/cognitive/mind-map/graph') + '?userId=' + encodeURIComponent(userId),
      { credentials: 'include' }
    );
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as { nodes: MindNodeRow[]; edges: MindEdgeRow[] };
    const entities = mindMapToEntities(data.nodes || [], data.edges || []);
    if (entities.length === 0) {
      return { entities: MOCK_ENTITIES, live: false };
    }
    return { entities, live: true };
  } catch {
    return { entities: MOCK_ENTITIES, live: false };
  }
}
