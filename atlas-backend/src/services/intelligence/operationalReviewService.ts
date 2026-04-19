/**
 * operationalReviewService.ts — Phase 0.95: Aggregated operational review.
 */

import { env } from '../../config/env.js';
import { composeDirectiveState, type DirectiveState } from './directiveCenterService.js';
import { detectStalls } from './executionContinuityService.js';
import { getLeverageCandidates } from './leverageEngineService.js';
import { getOutcomeFeedback } from './outcomeFeedbackService.js';

export interface OperationalReview {
  state: DirectiveState;
  stalledChainCount: number;
  topLeverageCandidateNames: string[];
  recentOutcomeDelta: number;
  summary: string;
}

export async function generateOperationalReview(
  userId: string,
): Promise<OperationalReview> {
  const empty: OperationalReview = {
    state: {
      fronts: [],
      workstreams: [],
      chains: [],
      decisions: [],
      openCommitments: [],
    },
    stalledChainCount: 0,
    topLeverageCandidateNames: [],
    recentOutcomeDelta: 0,
    summary: 'operational review unavailable',
  };
  if (!env.memoryLayerEnabled) return empty;
  try {
    const state = await composeDirectiveState(userId);
    const stalled = detectStalls(state.chains);
    const candidates = await getLeverageCandidates(userId);
    const topLeverage = candidates.slice(0, 3).map((c) => c.name);
    const feedback = await getOutcomeFeedback(userId);
    const recentDelta = feedback.length > 0
      ? feedback.slice(0, 5).reduce((sum, f) => sum + (f.delta_score ?? 0), 0) /
        Math.min(feedback.length, 5)
      : 0;
    const summary = `workstreams:${state.workstreams.length} fronts:${state.fronts.length} stalled:${stalled.length} leverage:${topLeverage.length} avgΔ:${recentDelta.toFixed(2)}`;
    return {
      state,
      stalledChainCount: stalled.length,
      topLeverageCandidateNames: topLeverage,
      recentOutcomeDelta: recentDelta,
      summary,
    };
  } catch (err) {
    console.error('[operationalReviewService] generateOperationalReview error:', err);
    return empty;
  }
}
