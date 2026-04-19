/**
 * contradictionTensionService.ts — Phase 0.97: Claim contradictions & clusters.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';

export type ContradictionResolutionStatus =
  | 'unresolved'
  | 'acknowledged'
  | 'resolved'
  | 'false_positive';

export interface ContradictionRow {
  id: string;
  user_id: string;
  claim_a_id: string | null;
  claim_b_id: string | null;
  tension_score: number;
  resolution_status: ContradictionResolutionStatus;
  contradiction_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ContradictionCreateInput {
  claim_a_id?: string;
  claim_b_id?: string;
  tension_score?: number;
  resolution_status?: ContradictionResolutionStatus;
  contradiction_metadata?: Record<string, unknown>;
}

export async function recordContradiction(
  userId: string,
  data: ContradictionCreateInput,
): Promise<ContradictionRow | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const id = randomUUID();
    const now = new Date().toISOString();
    const body = {
      id,
      user_id: userId,
      claim_a_id: data.claim_a_id ?? null,
      claim_b_id: data.claim_b_id ?? null,
      tension_score: data.tension_score ?? 0.5,
      resolution_status: data.resolution_status ?? 'unresolved',
      contradiction_metadata: data.contradiction_metadata ?? {},
      created_at: now,
      updated_at: now,
    };
    const result = await supabaseRest<ContradictionRow[]>(
      'POST',
      'claim_contradictions',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as ContradictionRow;
    }
    return result.data[0] ?? (body as ContradictionRow);
  } catch (err) {
    console.error('[contradictionTensionService] recordContradiction error:', err);
    return null;
  }
}

export async function getContradictions(
  userId: string,
): Promise<ContradictionRow[]> {
  if (!env.memoryLayerEnabled) return [];
  try {
    const result = await supabaseRest<ContradictionRow[]>(
      'GET',
      `claim_contradictions?user_id=eq.${encodeURIComponent(userId)}&order=tension_score.desc`,
    );
    if (!result.ok || !result.data) return [];
    return result.data;
  } catch (err) {
    console.error('[contradictionTensionService] getContradictions error:', err);
    return [];
  }
}

/**
 * Pure: group contradictions by claim_a_id; return only clusters of >1 member.
 */
export function detectContradictionClusters(
  contradictions: ContradictionRow[],
): ContradictionRow[][] {
  const buckets = new Map<string, ContradictionRow[]>();
  for (const c of contradictions) {
    const key = c.claim_a_id ?? 'unknown';
    const existing = buckets.get(key) ?? [];
    existing.push(c);
    buckets.set(key, existing);
  }
  return [...buckets.values()].filter((arr) => arr.length > 1);
}

/** Pure: tension severity label from tension_score. */
export function computeTensionSeverity(
  c: ContradictionRow,
): 'low' | 'medium' | 'high' | 'critical' {
  const score = c.tension_score ?? 0;
  if (score > 0.8) return 'critical';
  if (score > 0.6) return 'high';
  if (score > 0.4) return 'medium';
  return 'low';
}
