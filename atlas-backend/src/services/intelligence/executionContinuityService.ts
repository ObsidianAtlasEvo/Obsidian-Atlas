/**
 * executionContinuityService.ts — Phase 0.95: Execution chain continuity.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';

export interface ChainRow {
  id: string;
  user_id: string;
  workstream_id: string | null;
  name: string;
  status: 'active' | 'stalled' | 'blocked' | 'complete';
  last_action_at: string | null;
  chain_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ChainCreateInput {
  workstream_id?: string;
  name: string;
  status?: 'active' | 'stalled' | 'blocked' | 'complete';
  last_action_at?: string;
  chain_metadata?: Record<string, unknown>;
}

export async function createChain(
  userId: string,
  data: ChainCreateInput,
): Promise<ChainRow | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const id = randomUUID();
    const now = new Date().toISOString();
    const body = {
      id,
      user_id: userId,
      workstream_id: data.workstream_id ?? null,
      name: data.name,
      status: data.status ?? 'active',
      last_action_at: data.last_action_at ?? now,
      chain_metadata: data.chain_metadata ?? {},
      created_at: now,
      updated_at: now,
    };
    const result = await supabaseRest<ChainRow[]>(
      'POST',
      'execution_chains',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as ChainRow;
    }
    return result.data[0] ?? (body as ChainRow);
  } catch (err) {
    console.error('[executionContinuityService] createChain error:', err);
    return null;
  }
}

export async function getChains(
  userId: string,
  workstreamId?: string,
): Promise<ChainRow[]> {
  if (!env.memoryLayerEnabled) return [];
  try {
    const wsFilter = workstreamId
      ? `&workstream_id=eq.${encodeURIComponent(workstreamId)}`
      : '';
    const result = await supabaseRest<ChainRow[]>(
      'GET',
      `execution_chains?user_id=eq.${encodeURIComponent(userId)}${wsFilter}&order=last_action_at.desc.nullslast`,
    );
    if (!result.ok || !result.data) return [];
    return result.data;
  } catch (err) {
    console.error('[executionContinuityService] getChains error:', err);
    return [];
  }
}

export async function updateChainStatus(
  userId: string,
  chainId: string,
  status: 'active' | 'stalled' | 'blocked' | 'complete',
): Promise<boolean> {
  if (!env.memoryLayerEnabled) return false;
  try {
    const result = await supabaseRest(
      'PATCH',
      `execution_chains?id=eq.${encodeURIComponent(chainId)}&user_id=eq.${encodeURIComponent(userId)}`,
      { status, updated_at: new Date().toISOString() },
    );
    return result.ok;
  } catch (err) {
    console.error('[executionContinuityService] updateChainStatus error:', err);
    return false;
  }
}

/**
 * Pure: detect stalled chains (no activity > thresholdHours).
 * Default threshold is 48 hours.
 */
export function detectStalls(
  chains: ChainRow[],
  thresholdHours: number = 48,
): ChainRow[] {
  const now = Date.now();
  const thresholdMs = thresholdHours * 60 * 60 * 1000;
  return chains.filter((c) => {
    if (c.status === 'complete' || c.status === 'blocked') return false;
    if (!c.last_action_at) return true;
    const last = new Date(c.last_action_at).getTime();
    if (Number.isNaN(last)) return true;
    return now - last > thresholdMs;
  });
}

/** Pure: format a concise continuity summary. */
export function formatContinuitySummary(chains: ChainRow[]): string {
  const active = chains.filter((c) => c.status === 'active').length;
  const stalled = chains.filter((c) => c.status === 'stalled').length;
  const blocked = chains.filter((c) => c.status === 'blocked').length;
  const complete = chains.filter((c) => c.status === 'complete').length;
  return `chains: ${active} active, ${stalled} stalled, ${blocked} blocked, ${complete} complete`;
}
