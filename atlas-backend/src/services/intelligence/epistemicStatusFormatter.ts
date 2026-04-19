/**
 * epistemicStatusFormatter.ts — Phase 0.97: Pure epistemic status formatting.
 *
 * NOT to be confused with the existing epistemicBoundaryService; this file
 * produces compact status labels & blocks for injection into system context.
 */

import type { ClaimRow } from './claimGovernanceService.js';

export type EpistemicStatusLabel =
  | 'VERIFIED'
  | 'STRONG'
  | 'TENTATIVE'
  | 'CONTRADICTED'
  | 'STALE'
  | 'RETIRED';

/** Pure: single-claim status label. */
export function formatEpistemicStatus(claim: ClaimRow): EpistemicStatusLabel {
  if (claim.status === 'retired') return 'RETIRED';
  if (claim.status === 'stale') return 'STALE';
  if (claim.status === 'contested') return 'CONTRADICTED';
  if (claim.status === 'supported') {
    if ((claim.confidence_score ?? 0) >= 0.85) return 'VERIFIED';
    return 'STRONG';
  }
  return 'TENTATIVE';
}

/** Pure: multi-claim status block for context injection. */
export function buildEpistemicStatusBlock(claims: ClaimRow[]): string {
  const counts: Record<EpistemicStatusLabel, number> = {
    VERIFIED: 0,
    STRONG: 0,
    TENTATIVE: 0,
    CONTRADICTED: 0,
    STALE: 0,
    RETIRED: 0,
  };
  for (const c of claims) {
    counts[formatEpistemicStatus(c)] += 1;
  }
  const lines = [
    `verified:${counts.VERIFIED} strong:${counts.STRONG} tentative:${counts.TENTATIVE}`,
    `contradicted:${counts.CONTRADICTED} stale:${counts.STALE} retired:${counts.RETIRED}`,
  ];
  return lines.join(' | ');
}

/** Pure: compact one-line summary for system prompt injection. */
export function formatStatusForContext(claims: ClaimRow[]): string {
  if (claims.length === 0) return 'no active claims';
  const supported = claims.filter((c) => c.status === 'supported').length;
  const contested = claims.filter((c) => c.status === 'contested').length;
  const stale = claims.filter((c) => c.status === 'stale').length;
  return `claims: ${claims.length} total | supported:${supported} contested:${contested} stale:${stale}`;
}
