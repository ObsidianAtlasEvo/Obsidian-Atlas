/**
 * outcomeFeedbackService.ts — Phase 0.95: Outcome feedback loop.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';

export interface OutcomeFeedbackRow {
  id: string;
  user_id: string;
  workstream_id: string | null;
  proposed_outcome: string | null;
  actual_outcome: string | null;
  delta_score: number;
  feedback_at: string;
  notes: string | null;
}

export interface OutcomeFeedbackCreateInput {
  workstream_id?: string;
  proposed_outcome?: string;
  actual_outcome?: string;
  delta_score?: number;
  notes?: string;
}

export async function recordOutcomeFeedback(
  userId: string,
  data: OutcomeFeedbackCreateInput,
): Promise<OutcomeFeedbackRow | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const id = randomUUID();
    const now = new Date().toISOString();
    const body = {
      id,
      user_id: userId,
      workstream_id: data.workstream_id ?? null,
      proposed_outcome: data.proposed_outcome ?? null,
      actual_outcome: data.actual_outcome ?? null,
      delta_score: data.delta_score ?? 0,
      feedback_at: now,
      notes: data.notes ?? null,
    };
    const result = await supabaseRest<OutcomeFeedbackRow[]>(
      'POST',
      'outcome_feedback',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as OutcomeFeedbackRow;
    }
    return result.data[0] ?? (body as OutcomeFeedbackRow);
  } catch (err) {
    console.error('[outcomeFeedbackService] recordOutcomeFeedback error:', err);
    return null;
  }
}

export async function getOutcomeFeedback(
  userId: string,
  workstreamId?: string,
): Promise<OutcomeFeedbackRow[]> {
  if (!env.memoryLayerEnabled) return [];
  try {
    const wsFilter = workstreamId
      ? `&workstream_id=eq.${encodeURIComponent(workstreamId)}`
      : '';
    const result = await supabaseRest<OutcomeFeedbackRow[]>(
      'GET',
      `outcome_feedback?user_id=eq.${encodeURIComponent(userId)}${wsFilter}&order=feedback_at.desc`,
    );
    if (!result.ok || !result.data) return [];
    return result.data;
  } catch (err) {
    console.error('[outcomeFeedbackService] getOutcomeFeedback error:', err);
    return [];
  }
}

/**
 * Pure heuristic: compare proposed vs actual outcome text.
 * Returns delta in range -1..1.
 */
export function computeOutcomeDelta(proposed: string, actual: string): number {
  if (!proposed || !actual) return 0;
  const p = proposed.toLowerCase().trim();
  const a = actual.toLowerCase().trim();
  if (a.includes(p)) return 0.8;
  if (a.length > p.length) return 0.2;
  return -0.4;
}
