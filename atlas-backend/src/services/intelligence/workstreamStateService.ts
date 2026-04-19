/**
 * workstreamStateService.ts — Phase 0.95: Workstream state management.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';

export interface WorkstreamRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: 'active' | 'paused' | 'stalled' | 'closed';
  phase: string | null;
  health_score: number;
  workstream_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WorkstreamCreateInput {
  name: string;
  description?: string;
  status?: 'active' | 'paused' | 'stalled' | 'closed';
  phase?: string;
  health_score?: number;
  workstream_metadata?: Record<string, unknown>;
}

export interface ChainRow {
  id: string;
  status: 'active' | 'stalled' | 'blocked' | 'complete';
  last_action_at: string | null;
}

export interface CommitmentRow {
  id: string;
  status: 'open' | 'fulfilled' | 'broken' | 'deferred';
}

export async function createWorkstream(
  userId: string,
  data: WorkstreamCreateInput,
): Promise<WorkstreamRow | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const id = randomUUID();
    const now = new Date().toISOString();
    const body = {
      id,
      user_id: userId,
      name: data.name,
      description: data.description ?? null,
      status: data.status ?? 'active',
      phase: data.phase ?? null,
      health_score: data.health_score ?? 0.5,
      workstream_metadata: data.workstream_metadata ?? {},
      created_at: now,
      updated_at: now,
    };
    const result = await supabaseRest<WorkstreamRow[]>(
      'POST',
      'workstreams',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as WorkstreamRow;
    }
    return result.data[0] ?? (body as WorkstreamRow);
  } catch (err) {
    console.error('[workstreamStateService] createWorkstream error:', err);
    return null;
  }
}

export async function getWorkstreams(userId: string): Promise<WorkstreamRow[]> {
  if (!env.memoryLayerEnabled) return [];
  try {
    const result = await supabaseRest<WorkstreamRow[]>(
      'GET',
      `workstreams?user_id=eq.${encodeURIComponent(userId)}&order=updated_at.desc`,
    );
    if (!result.ok || !result.data) return [];
    return result.data;
  } catch (err) {
    console.error('[workstreamStateService] getWorkstreams error:', err);
    return [];
  }
}

export async function updateWorkstreamStatus(
  userId: string,
  id: string,
  status: 'active' | 'paused' | 'stalled' | 'closed',
): Promise<boolean> {
  if (!env.memoryLayerEnabled) return false;
  try {
    const result = await supabaseRest(
      'PATCH',
      `workstreams?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`,
      { status, updated_at: new Date().toISOString() },
    );
    return result.ok;
  } catch (err) {
    console.error('[workstreamStateService] updateWorkstreamStatus error:', err);
    return false;
  }
}

/**
 * Pure: compute a workstream health score based on active chain ratio
 * and commitment fulfillment. Returns 0..1.
 */
export function computeWorkstreamHealth(
  chains: ChainRow[],
  commitments: CommitmentRow[],
): number {
  const chainScore = chains.length === 0
    ? 0.5
    : chains.filter((c) => c.status === 'active' || c.status === 'complete').length / chains.length;
  const commitScore = commitments.length === 0
    ? 0.5
    : commitments.filter((c) => c.status === 'fulfilled').length / commitments.length;
  const combined = chainScore * 0.6 + commitScore * 0.4;
  return Math.max(0, Math.min(1, combined));
}

/** Pure: format a workstream summary string for display. */
export function formatWorkstreamSummary(ws: WorkstreamRow): string {
  const health = Math.round((ws.health_score ?? 0) * 100);
  const phase = ws.phase ? ` [${ws.phase}]` : '';
  return `${ws.name}${phase} — status:${ws.status} health:${health}%`;
}
