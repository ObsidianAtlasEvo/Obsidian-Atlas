/**
 * directiveUISurfaceService.ts — Phase 0.98: Directive UI surface state snapshots.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import { getFronts } from './frontModelService.js';
import { getChains } from './executionContinuityService.js';
import { getDecisions } from './decisionLedgerService.js';

export interface DirectiveSurfaceState {
  id: string;
  user_id: string;
  surface_summary: string | null;
  active_directive_count: number;
  blocked_chain_count: number;
  pending_decision_count: number;
  surface_metadata: Record<string, unknown>;
  generated_at: string;
  created_at: string;
}

export async function buildDirectiveSurface(
  userId: string,
): Promise<DirectiveSurfaceState | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const [fronts, chains, decisions] = await Promise.all([
      getFronts(userId),
      getChains(userId),
      getDecisions(userId),
    ]);
    const activeDirectives = fronts.filter((f) => f.status === 'open').length;
    const blockedChains = chains.filter(
      (c) => c.status === 'blocked' || c.status === 'stalled',
    ).length;
    const pendingDecisions = decisions.filter((d) => !d.chosen_option).length;
    const summary = `active:${activeDirectives} blocked:${blockedChains} pending:${pendingDecisions}`;
    const id = randomUUID();
    const now = new Date().toISOString();
    const body = {
      id,
      user_id: userId,
      surface_summary: summary,
      active_directive_count: activeDirectives,
      blocked_chain_count: blockedChains,
      pending_decision_count: pendingDecisions,
      surface_metadata: {},
      generated_at: now,
      created_at: now,
    };
    const result = await supabaseRest<DirectiveSurfaceState[]>(
      'POST',
      'directive_surface_state',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as DirectiveSurfaceState;
    }
    return result.data[0] ?? (body as DirectiveSurfaceState);
  } catch (err) {
    console.error('[directiveUISurfaceService] buildDirectiveSurface error:', err);
    return null;
  }
}

export async function getLatestDirectiveSurface(
  userId: string,
): Promise<DirectiveSurfaceState | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const result = await supabaseRest<DirectiveSurfaceState[]>(
      'GET',
      `directive_surface_state?user_id=eq.${encodeURIComponent(userId)}&order=generated_at.desc&limit=1`,
    );
    if (!result.ok || !result.data || result.data.length === 0) return null;
    return result.data[0] ?? null;
  } catch (err) {
    console.error('[directiveUISurfaceService] getLatestDirectiveSurface error:', err);
    return null;
  }
}
