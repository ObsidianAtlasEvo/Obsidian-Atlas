/**
 * truthSurfaceService.ts — Phase 0.98: Truth observatory surface.
 */

import { env } from '../../config/env.js';
import { getClaims, type ClaimRow } from './claimGovernanceService.js';
import {
  getContradictions,
  type ContradictionRow,
} from './contradictionTensionService.js';
import {
  getDriftEvents,
  type DriftEventRow,
} from './realityDriftMonitorService.js';

export interface TruthObservatory {
  claims: ClaimRow[];
  contradictions: ContradictionRow[];
  driftEvents: DriftEventRow[];
  supportedCount: number;
  staleCount: number;
  unresolvedContradictionCount: number;
}

export async function buildTruthObservatory(
  userId: string,
): Promise<TruthObservatory> {
  const empty: TruthObservatory = {
    claims: [],
    contradictions: [],
    driftEvents: [],
    supportedCount: 0,
    staleCount: 0,
    unresolvedContradictionCount: 0,
  };
  if (!env.memoryLayerEnabled) return empty;
  try {
    const [claims, contradictions, driftEvents] = await Promise.all([
      getClaims(userId),
      getContradictions(userId),
      getDriftEvents(userId),
    ]);
    return {
      claims,
      contradictions,
      driftEvents,
      supportedCount: claims.filter((c) => c.status === 'supported').length,
      staleCount: claims.filter((c) => c.status === 'stale').length,
      unresolvedContradictionCount: contradictions.filter(
        (c) => c.resolution_status === 'unresolved',
      ).length,
    };
  } catch (err) {
    console.error('[truthSurfaceService] buildTruthObservatory error:', err);
    return empty;
  }
}

/** Pure: formatted truth summary string. */
export function formatTruthSummary(obs: TruthObservatory): string {
  return (
    `claims:${obs.claims.length} supported:${obs.supportedCount} stale:${obs.staleCount} ` +
    `unresolved_contradictions:${obs.unresolvedContradictionCount} drift_events:${obs.driftEvents.length}`
  );
}
