/**
 * watcherFrameworkService.ts — Phase 0.985–0.99: Watcher event framework.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import type { LeverageCandidateRow } from './leverageEngineService.js';

export type WatcherEventClass =
  | 'stall'
  | 'staleness'
  | 'opportunity'
  | 'drift'
  | 'violation'
  | 'anomaly';
export type WatcherSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface WatcherEventRow {
  id: string;
  user_id: string;
  watcher_type: string;
  event_class: WatcherEventClass;
  severity: WatcherSeverity;
  description: string;
  resolved: boolean;
  watcher_metadata: Record<string, unknown>;
  detected_at: string;
  created_at: string;
}

export interface WatcherEventCreateInput {
  watcher_type: string;
  event_class: WatcherEventClass;
  severity?: WatcherSeverity;
  description: string;
  watcher_metadata?: Record<string, unknown>;
}

export async function logWatcherEvent(
  userId: string,
  data: WatcherEventCreateInput,
): Promise<WatcherEventRow | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const id = randomUUID();
    const now = new Date().toISOString();
    const body = {
      id,
      user_id: userId,
      watcher_type: data.watcher_type,
      event_class: data.event_class,
      severity: data.severity ?? 'medium',
      description: data.description,
      resolved: false,
      watcher_metadata: data.watcher_metadata ?? {},
      detected_at: now,
      created_at: now,
    };
    const result = await supabaseRest<WatcherEventRow[]>(
      'POST',
      'watcher_events',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as WatcherEventRow;
    }
    return result.data[0] ?? (body as WatcherEventRow);
  } catch (err) {
    console.error('[watcherFrameworkService] logWatcherEvent error:', err);
    return null;
  }
}

export async function getWatcherEvents(
  userId: string,
  resolved?: boolean,
): Promise<WatcherEventRow[]> {
  if (!env.memoryLayerEnabled) return [];
  try {
    const resolvedFilter =
      resolved === undefined ? '' : `&resolved=eq.${resolved ? 'true' : 'false'}`;
    const result = await supabaseRest<WatcherEventRow[]>(
      'GET',
      `watcher_events?user_id=eq.${encodeURIComponent(userId)}${resolvedFilter}&order=detected_at.desc`,
    );
    if (!result.ok || !result.data) return [];
    return result.data;
  } catch (err) {
    console.error('[watcherFrameworkService] getWatcherEvents error:', err);
    return [];
  }
}

export async function resolveWatcherEvent(
  userId: string,
  id: string,
): Promise<boolean> {
  if (!env.memoryLayerEnabled) return false;
  try {
    const result = await supabaseRest(
      'PATCH',
      `watcher_events?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`,
      { resolved: true },
    );
    return result.ok;
  } catch (err) {
    console.error('[watcherFrameworkService] resolveWatcherEvent error:', err);
    return false;
  }
}

/** Pure: filter leverage candidates above 0.75 as opportunities. */
export function detectOpportunities(
  candidates: LeverageCandidateRow[],
): LeverageCandidateRow[] {
  return candidates.filter((c) => (c.leverage_score ?? 0) > 0.75);
}
