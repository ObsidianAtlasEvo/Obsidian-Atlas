/**
 * realityContactReviewService.ts — Phase 0.97: Aggregate reality review.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import { getClaims } from './claimGovernanceService.js';
import { getContradictions } from './contradictionTensionService.js';
import { getDriftEvents } from './realityDriftMonitorService.js';
import { computeStalenessScore } from './truthDecayService.js';

export interface TruthReview {
  id: string;
  user_id: string;
  summary: string;
  stale_claim_count: number;
  contradiction_count: number;
  drift_event_count: number;
  review_metadata: Record<string, unknown>;
  reviewed_at: string;
  created_at: string;
}

export async function generateReview(userId: string): Promise<TruthReview | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const [claims, contradictions, drift] = await Promise.all([
      getClaims(userId),
      getContradictions(userId),
      getDriftEvents(userId),
    ]);
    const staleCount = claims.filter((c) => computeStalenessScore(c) > 0.7).length;
    const unresolved = contradictions.filter(
      (c) => c.resolution_status === 'unresolved',
    ).length;
    const driftCount = drift.length;
    const summary = `stale:${staleCount} unresolved_contradictions:${unresolved} drift_events:${driftCount}`;
    const id = randomUUID();
    const now = new Date().toISOString();
    const body = {
      id,
      user_id: userId,
      summary,
      stale_claim_count: staleCount,
      contradiction_count: unresolved,
      drift_event_count: driftCount,
      review_metadata: {
        total_claims: claims.length,
        total_contradictions: contradictions.length,
      },
      reviewed_at: now,
      created_at: now,
    };
    const result = await supabaseRest<TruthReview[]>(
      'POST',
      'truth_reviews',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as TruthReview;
    }
    return result.data[0] ?? (body as TruthReview);
  } catch (err) {
    console.error('[realityContactReviewService] generateReview error:', err);
    return null;
  }
}
