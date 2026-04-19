/**
 * homeSurfaceService.ts — Phase 0.98: Home surface state snapshots.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import { getWorkstreams } from './workstreamStateService.js';
import { getOpenCommitments } from './commitmentTrackerService.js';
import { getContradictions } from './contradictionTensionService.js';
import { getDriftEvents } from './realityDriftMonitorService.js';

export interface HomeSurfaceState {
  id: string;
  user_id: string;
  today_summary: string | null;
  active_workstream_count: number;
  open_commitment_count: number;
  unresolved_contradiction_count: number;
  drift_alert_count: number;
  surface_metadata: Record<string, unknown>;
  generated_at: string;
  created_at: string;
}

export async function buildHomeSurface(userId: string): Promise<HomeSurfaceState | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const [workstreams, commitments, contradictions, drift] = await Promise.all([
      getWorkstreams(userId),
      getOpenCommitments(userId),
      getContradictions(userId),
      getDriftEvents(userId),
    ]);
    const active = workstreams.filter((w) => w.status === 'active').length;
    const unresolved = contradictions.filter(
      (c) => c.resolution_status === 'unresolved',
    ).length;
    const driftAlerts = drift.filter(
      (d) => d.severity === 'high' || d.severity === 'critical',
    ).length;
    const todaySummary =
      `${active} active workstreams, ${commitments.length} open commitments, ` +
      `${unresolved} unresolved contradictions, ${driftAlerts} drift alerts`;
    const id = randomUUID();
    const now = new Date().toISOString();
    const body = {
      id,
      user_id: userId,
      today_summary: todaySummary,
      active_workstream_count: active,
      open_commitment_count: commitments.length,
      unresolved_contradiction_count: unresolved,
      drift_alert_count: driftAlerts,
      surface_metadata: {},
      generated_at: now,
      created_at: now,
    };
    const result = await supabaseRest<HomeSurfaceState[]>(
      'POST',
      'home_surface_state',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as HomeSurfaceState;
    }
    return result.data[0] ?? (body as HomeSurfaceState);
  } catch (err) {
    console.error('[homeSurfaceService] buildHomeSurface error:', err);
    return null;
  }
}

export async function getLatestHomeSurface(
  userId: string,
): Promise<HomeSurfaceState | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const result = await supabaseRest<HomeSurfaceState[]>(
      'GET',
      `home_surface_state?user_id=eq.${encodeURIComponent(userId)}&order=generated_at.desc&limit=1`,
    );
    if (!result.ok || !result.data || result.data.length === 0) return null;
    return result.data[0] ?? null;
  } catch (err) {
    console.error('[homeSurfaceService] getLatestHomeSurface error:', err);
    return null;
  }
}

/** Pure: one-line home summary. */
export function formatHomeSummary(state: HomeSurfaceState | null): string {
  if (!state) return 'home surface unavailable';
  return (
    state.today_summary ??
    `ws:${state.active_workstream_count} commits:${state.open_commitment_count} ` +
      `contradictions:${state.unresolved_contradiction_count} drift:${state.drift_alert_count}`
  );
}
