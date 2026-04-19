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

/**
 * Run a single watcher sweep for a user — reads workstream/chain/contradiction/claim
 * state via existing services and logs a watcher_event per detection.
 *
 * Real background agency: this is called from chronos on a low-frequency tick.
 * Idempotency: same (user,event_class,watcher_type) within 2h is suppressed.
 * Never throws.
 */
export async function runScheduledWatcherSweep(userId: string): Promise<{
  detected: number;
  suppressed: number;
}> {
  if (!env.memoryLayerEnabled || !userId) return { detected: 0, suppressed: 0 };
  try {
    const { detectStalls, getChains } = await import('./executionContinuityService.js');
    const { getContradictions } = await import('./contradictionTensionService.js');
    const { getOpenCommitments } = await import('./commitmentTrackerService.js');
    const { getAssumptions } = await import('./assumptionRegistryService.js');

    const [chains, contradictions, commitments, assumptions] = await Promise.all([
      getChains(userId),
      getContradictions(userId),
      getOpenCommitments(userId),
      getAssumptions(userId),
    ]);

    const stalls = detectStalls(chains);
    const unresolved = contradictions.filter((c) => c.resolution_status === 'unresolved');
    // Fragile assumptions: high fragility + active status → revalidate
    const staleAssumptions = assumptions
      .filter((a) => a.status === 'active' && (a.fragility_score ?? 0) >= 0.7);

    const now = Date.now();
    const recent = await getRecentEventFingerprints(userId, now - 2 * 60 * 60_000);

    let detected = 0;
    let suppressed = 0;

    const candidates: Array<{ fingerprint: string; input: WatcherEventCreateInput }> = [];
    for (const s of stalls.slice(0, 10)) {
      candidates.push({
        fingerprint: `stall:${s.id}`,
        input: {
          watcher_type: 'execution_continuity',
          event_class: 'stall',
          severity: 'medium',
          description: `Chain ${s.id} has stalled`,
          watcher_metadata: { chain_id: s.id },
        },
      });
    }
    for (const c of unresolved.slice(0, 10)) {
      candidates.push({
        fingerprint: `contradiction:${c.id}`,
        input: {
          watcher_type: 'truth_spine',
          event_class: 'violation',
          severity: 'high',
          description: `Unresolved contradiction ${c.id}`,
          watcher_metadata: { contradiction_id: c.id },
        },
      });
    }
    for (const a of staleAssumptions.slice(0, 10)) {
      candidates.push({
        fingerprint: `stale_assumption:${a.id}`,
        input: {
          watcher_type: 'assumption_registry',
          event_class: 'staleness',
          severity: 'low',
          description: `Assumption ${a.id} needs revalidation`,
          watcher_metadata: { assumption_id: a.id },
        },
      });
    }
    if (commitments.length > 20) {
      candidates.push({
        fingerprint: `commitment_backlog:${commitments.length}`,
        input: {
          watcher_type: 'commitment_tracker',
          event_class: 'anomaly',
          severity: 'medium',
          description: `Open commitment backlog: ${commitments.length}`,
          watcher_metadata: { open_count: commitments.length },
        },
      });
    }

    for (const c of candidates) {
      if (recent.has(c.fingerprint)) {
        suppressed += 1;
        continue;
      }
      const row = await logWatcherEvent(userId, c.input);
      if (row) detected += 1;
    }

    return { detected, suppressed };
  } catch (err) {
    console.error('[watcherFrameworkService] runScheduledWatcherSweep error:', err);
    return { detected: 0, suppressed: 0 };
  }
}

async function getRecentEventFingerprints(
  userId: string,
  sinceEpochMs: number,
): Promise<Set<string>> {
  const set = new Set<string>();
  try {
    const sinceIso = new Date(sinceEpochMs).toISOString();
    const result = await supabaseRest<WatcherEventRow[]>(
      'GET',
      `watcher_events?user_id=eq.${encodeURIComponent(userId)}&detected_at=gte.${encodeURIComponent(sinceIso)}&select=watcher_metadata,event_class,watcher_type`,
    );
    if (!result.ok || !result.data) return set;
    for (const r of result.data) {
      const meta = r.watcher_metadata ?? {};
      const key =
        (meta.chain_id as string | undefined) ??
        (meta.contradiction_id as string | undefined) ??
        (meta.assumption_id as string | undefined);
      if (key) set.add(`${r.event_class === 'violation' ? 'contradiction' : r.event_class === 'staleness' ? 'stale_assumption' : 'stall'}:${key}`);
      if ((meta.open_count as number | undefined) !== undefined) {
        set.add(`commitment_backlog:${meta.open_count}`);
      }
    }
  } catch {
    // Never throw from a suppression check — return empty set, allow duplication
  }
  return set;
}
