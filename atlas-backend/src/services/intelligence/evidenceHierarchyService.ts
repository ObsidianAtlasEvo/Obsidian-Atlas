/**
 * evidenceHierarchyService.ts — Phase 0.97: Pure evidence tier & weighting.
 */

export interface EvidenceRow {
  id?: string;
  evidence_type: string;
  authority_tier?: number;
  weight?: number;
}

const TIER_1 = new Set(['meta_analytic', 'experimental', 'expert_consensus']);
const TIER_2 = new Set(['empirical', 'statistical', 'documentary']);
const TIER_3 = new Set(['inferential', 'analogical', 'testimonial']);
const TIER_4 = new Set(['contextual', 'theoretical']);

const TIER_SCORES: Record<number, number> = {
  1: 0.95,
  2: 0.75,
  3: 0.5,
  4: 0.25,
};

/** Pure: map evidence type to authority tier (1=highest, 4=lowest). */
export function computeAuthorityTier(evidenceType: string): number {
  if (TIER_1.has(evidenceType)) return 1;
  if (TIER_2.has(evidenceType)) return 2;
  if (TIER_3.has(evidenceType)) return 3;
  if (TIER_4.has(evidenceType)) return 4;
  return 3;
}

/** Pure: bonus for corroborating evidence. Caps at 0.3. */
export function computeCorroborationBonus(count: number): number {
  return Number(Math.min(Math.max(count, 0) * 0.05, 0.3).toFixed(4));
}

/** Pure: compute evidence weight from type & tier. Clamped 0..1. */
export function computeEvidenceWeight(type: string, tier: number): number {
  const tierScore = TIER_SCORES[tier] ?? 0.5;
  let typeBonus = 0;
  if (TIER_1.has(type)) typeBonus = 0.15;
  else if (TIER_2.has(type)) typeBonus = 0.1;
  else if (TIER_3.has(type)) typeBonus = 0.05;
  else typeBonus = 0;
  const combined = (tierScore + typeBonus) / 2;
  return Math.max(0, Math.min(1, combined));
}

/**
 * Pure: aggregate evidence into a single weighted-mean score (0..1).
 * Each piece's weight contributes to a weighted average of its authority_tier score.
 */
export function aggregateEvidenceScore(evidence: EvidenceRow[]): number {
  if (evidence.length === 0) return 0;
  let totalWeight = 0;
  let weighted = 0;
  for (const e of evidence) {
    const tier = e.authority_tier ?? computeAuthorityTier(e.evidence_type);
    const tierScore = TIER_SCORES[tier] ?? 0.5;
    const weight = e.weight ?? computeEvidenceWeight(e.evidence_type, tier);
    weighted += tierScore * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return 0;
  const base = weighted / totalWeight;
  const bonus = computeCorroborationBonus(evidence.length);
  return Math.max(0, Math.min(1, base + bonus));
}
