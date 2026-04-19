/**
 * cognitionMapUIService.ts — Phase 0.98: Cognition map generation.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import { getClaims } from './claimGovernanceService.js';
import { getContradictions } from './contradictionTensionService.js';
import { getFronts } from './frontModelService.js';
import { getWorkstreams } from './workstreamStateService.js';
import { getChains } from './executionContinuityService.js';

export interface CognitionNode {
  id: string;
  label: string;
  type: string;
  weight: number;
}

export interface CognitionEdge {
  source: string;
  target: string;
  relation: string;
}

export interface CognitionMap {
  id: string;
  user_id: string;
  map_type: string;
  nodes: CognitionNode[];
  edges: CognitionEdge[];
  map_metadata: Record<string, unknown>;
  generated_at: string;
  created_at: string;
}

export async function buildCognitionMap(
  userId: string,
  mapType: string,
): Promise<CognitionMap | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const nodes: CognitionNode[] = [];
    const edges: CognitionEdge[] = [];

    if (mapType === 'truth' || mapType === 'all') {
      const claims = await getClaims(userId);
      const contradictions = await getContradictions(userId);
      for (const c of claims) {
        nodes.push({
          id: c.id,
          label: c.claim_text.slice(0, 80),
          type: 'claim',
          weight: c.confidence_score ?? 0.5,
        });
      }
      for (const ct of contradictions) {
        if (ct.claim_a_id && ct.claim_b_id) {
          edges.push({
            source: ct.claim_a_id,
            target: ct.claim_b_id,
            relation: 'contradicts',
          });
        }
      }
    }

    if (mapType === 'operational' || mapType === 'all') {
      const [fronts, workstreams, chains] = await Promise.all([
        getFronts(userId),
        getWorkstreams(userId),
        getChains(userId),
      ]);
      for (const f of fronts) {
        nodes.push({ id: f.id, label: f.name, type: 'front', weight: (f.priority ?? 5) / 10 });
      }
      for (const w of workstreams) {
        nodes.push({
          id: w.id,
          label: w.name,
          type: 'workstream',
          weight: w.health_score ?? 0.5,
        });
      }
      for (const ch of chains) {
        nodes.push({
          id: ch.id,
          label: ch.name,
          type: 'chain',
          weight: ch.status === 'active' ? 1 : 0.3,
        });
        if (ch.workstream_id) {
          edges.push({
            source: ch.workstream_id,
            target: ch.id,
            relation: 'contains',
          });
        }
      }
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const body = {
      id,
      user_id: userId,
      map_type: mapType,
      nodes,
      edges,
      map_metadata: { node_count: nodes.length, edge_count: edges.length },
      generated_at: now,
      created_at: now,
    };
    const result = await supabaseRest<CognitionMap[]>(
      'POST',
      'cognition_maps',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as CognitionMap;
    }
    return result.data[0] ?? (body as CognitionMap);
  } catch (err) {
    console.error('[cognitionMapUIService] buildCognitionMap error:', err);
    return null;
  }
}

export async function getLatestMap(
  userId: string,
  mapType: string,
): Promise<CognitionMap | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const result = await supabaseRest<CognitionMap[]>(
      'GET',
      `cognition_maps?user_id=eq.${encodeURIComponent(userId)}&map_type=eq.${encodeURIComponent(mapType)}&order=generated_at.desc&limit=1`,
    );
    if (!result.ok || !result.data || result.data.length === 0) return null;
    return result.data[0] ?? null;
  } catch (err) {
    console.error('[cognitionMapUIService] getLatestMap error:', err);
    return null;
  }
}
