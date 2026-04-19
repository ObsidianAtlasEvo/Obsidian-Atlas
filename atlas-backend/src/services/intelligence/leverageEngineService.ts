/**
 * leverageEngineService.ts — Phase 0.95: Leverage scoring & bottleneck detection.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import type { FrontRow } from './frontModelService.js';
import type { WorkstreamRow } from './workstreamStateService.js';
import type { ChainRow } from './executionContinuityService.js';

export interface LeverageCandidateRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  leverage_score: number;
  bottleneck: boolean;
  false_front: boolean;
  candidate_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface LeverageCandidateCreateInput {
  name: string;
  description?: string;
  leverage_score?: number;
  bottleneck?: boolean;
  false_front?: boolean;
  candidate_metadata?: Record<string, unknown>;
}

export async function recordLeverageCandidate(
  userId: string,
  data: LeverageCandidateCreateInput,
): Promise<LeverageCandidateRow | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const id = randomUUID();
    const now = new Date().toISOString();
    const body = {
      id,
      user_id: userId,
      name: data.name,
      description: data.description ?? null,
      leverage_score: data.leverage_score ?? 0.5,
      bottleneck: data.bottleneck ?? false,
      false_front: data.false_front ?? false,
      candidate_metadata: data.candidate_metadata ?? {},
      created_at: now,
      updated_at: now,
    };
    const result = await supabaseRest<LeverageCandidateRow[]>(
      'POST',
      'leverage_candidates',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as LeverageCandidateRow;
    }
    return result.data[0] ?? (body as LeverageCandidateRow);
  } catch (err) {
    console.error('[leverageEngineService] recordLeverageCandidate error:', err);
    return null;
  }
}

export async function getLeverageCandidates(
  userId: string,
): Promise<LeverageCandidateRow[]> {
  if (!env.memoryLayerEnabled) return [];
  try {
    const result = await supabaseRest<LeverageCandidateRow[]>(
      'GET',
      `leverage_candidates?user_id=eq.${encodeURIComponent(userId)}&order=leverage_score.desc`,
    );
    if (!result.ok || !result.data) return [];
    return result.data;
  } catch (err) {
    console.error('[leverageEngineService] getLeverageCandidates error:', err);
    return [];
  }
}

/**
 * Pure: compute leverage score from reach × urgency / effort.
 * All inputs should be in range 0..1. Effort is clamped from below at 0.1.
 */
export function computeLeverageScore(candidate: {
  reach: number;
  effort: number;
  urgency: number;
}): number {
  const numerator = candidate.reach * 0.4 + candidate.urgency * 0.35;
  const denom = Math.max(candidate.effort, 0.1);
  const score = numerator / denom;
  return Math.max(0, Math.min(1, score));
}

/** Pure: false fronts are open fronts with no active workstreams. */
export function detectFalseFronts(
  fronts: FrontRow[],
  workstreams: WorkstreamRow[],
): FrontRow[] {
  const activeWs = workstreams.filter((w) => w.status === 'active');
  return fronts.filter((f) => {
    if (f.status !== 'open') return false;
    if (activeWs.length === 0) return true;
    // Heuristic: no active workstream shares a text token with this front
    const frontTokens = `${f.name} ${f.arena ?? ''} ${f.front_type ?? ''}`
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const hasMatch = activeWs.some((w) => {
      const wsText = `${w.name} ${w.phase ?? ''}`.toLowerCase();
      return frontTokens.some((t) => t.length > 3 && wsText.includes(t));
    });
    return !hasMatch;
  });
}

/**
 * Pure: identify the most stalled chain as the system-wide bottleneck.
 * Returns null if no stalled chains.
 */
export function identifyBottleneck(chains: ChainRow[]): ChainRow | null {
  const stalled = chains.filter(
    (c) => c.status === 'stalled' || c.status === 'blocked',
  );
  if (stalled.length === 0) return null;
  stalled.sort((a, b) => {
    const aMs = a.last_action_at ? new Date(a.last_action_at).getTime() : 0;
    const bMs = b.last_action_at ? new Date(b.last_action_at).getTime() : 0;
    return aMs - bMs;
  });
  return stalled[0] ?? null;
}
