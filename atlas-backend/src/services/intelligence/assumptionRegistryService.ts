/**
 * assumptionRegistryService.ts — Phase 0.97: Assumption registry & fragility.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';

export type AssumptionStatus = 'active' | 'challenged' | 'invalidated' | 'confirmed';

export interface AssumptionRow {
  id: string;
  user_id: string;
  assumption_text: string;
  fragility_score: number;
  impact_if_false: string | null;
  domain: string | null;
  status: AssumptionStatus;
  assumption_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AssumptionCreateInput {
  assumption_text: string;
  fragility_score?: number;
  impact_if_false?: string;
  domain?: string;
  status?: AssumptionStatus;
  assumption_metadata?: Record<string, unknown>;
}

export async function registerAssumption(
  userId: string,
  data: AssumptionCreateInput,
): Promise<AssumptionRow | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const id = randomUUID();
    const now = new Date().toISOString();
    const body = {
      id,
      user_id: userId,
      assumption_text: data.assumption_text,
      fragility_score: data.fragility_score ?? 0.5,
      impact_if_false: data.impact_if_false ?? null,
      domain: data.domain ?? null,
      status: data.status ?? 'active',
      assumption_metadata: data.assumption_metadata ?? {},
      created_at: now,
      updated_at: now,
    };
    const result = await supabaseRest<AssumptionRow[]>(
      'POST',
      'assumptions',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as AssumptionRow;
    }
    return result.data[0] ?? (body as AssumptionRow);
  } catch (err) {
    console.error('[assumptionRegistryService] registerAssumption error:', err);
    return null;
  }
}

export async function getAssumptions(userId: string): Promise<AssumptionRow[]> {
  if (!env.memoryLayerEnabled) return [];
  try {
    const result = await supabaseRest<AssumptionRow[]>(
      'GET',
      `assumptions?user_id=eq.${encodeURIComponent(userId)}&order=fragility_score.desc`,
    );
    if (!result.ok || !result.data) return [];
    return result.data;
  } catch (err) {
    console.error('[assumptionRegistryService] getAssumptions error:', err);
    return [];
  }
}

/** Pure: fragility score by status. */
export function computeAssumptionFragility(assumption: AssumptionRow): number {
  switch (assumption.status) {
    case 'active':
      return 0.7;
    case 'challenged':
      return 0.9;
    case 'invalidated':
      return 1.0;
    case 'confirmed':
      return 0.2;
    default:
      return 0.5;
  }
}

/**
 * Pure: operational impact scales with the length of the impact_if_false
 * narrative (heuristic). Clamped 0..1.
 */
export function computeOperationalImpact(assumption: AssumptionRow): number {
  const text = assumption.impact_if_false ?? '';
  const score = text.length / 200;
  return Math.max(0, Math.min(1, score));
}
