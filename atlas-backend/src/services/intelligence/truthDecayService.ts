/**
 * truthDecayService.ts — Phase 0.97: Staleness and confidence decay over time.
 */

import type { ClaimRow } from './claimGovernanceService.js';

const THRESHOLDS: Record<string, number> = {
  article: 90,
  project: 30,
  insight: 60,
};
const DEFAULT_THRESHOLD_DAYS = 45;

/**
 * Pure: days since last_validated_at divided by a type-specific
 * threshold, clamped to 0..1.
 */
export function computeStalenessScore(
  claim: ClaimRow,
  nowMs: number = Date.now(),
): number {
  if (!claim.last_validated_at) return 1;
  const last = new Date(claim.last_validated_at).getTime();
  if (Number.isNaN(last)) return 1;
  const days = (nowMs - last) / (24 * 60 * 60 * 1000);
  const threshold = THRESHOLDS[claim.claim_type ?? ''] ?? DEFAULT_THRESHOLD_DAYS;
  return Math.max(0, Math.min(1, days / threshold));
}

/** Pure: discount confidence by staleness. */
export function computeDecayedConfidence(
  claim: ClaimRow,
  staleness: number,
): number {
  const base = claim.confidence_score ?? 0;
  const discount = 1 - staleness * 0.5;
  return Math.max(0, Math.min(1, base * discount));
}

/** Pure: categorize a confidence score into a tier label. */
export function computeConfidenceTier(
  score: number,
): 'high' | 'strong' | 'moderate' | 'weak' | 'negligible' {
  if (score >= 0.8) return 'high';
  if (score >= 0.6) return 'strong';
  if (score >= 0.4) return 'moderate';
  if (score >= 0.2) return 'weak';
  return 'negligible';
}

/**
 * Pure: return claims with staleness > 0.7, sorted by staleness desc.
 */
export function buildRevalidationQueue(
  claims: ClaimRow[],
  nowMs: number = Date.now(),
): ClaimRow[] {
  return claims
    .map((c) => ({ claim: c, staleness: computeStalenessScore(c, nowMs) }))
    .filter((x) => x.staleness > 0.7)
    .sort((a, b) => b.staleness - a.staleness)
    .map((x) => x.claim);
}
