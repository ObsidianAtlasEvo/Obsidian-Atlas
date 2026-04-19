/**
 * claimGovernanceService.ts — Phase 0.97: Claim submission & status transitions.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import {
  aggregateEvidenceScore,
  type EvidenceRow,
} from './evidenceHierarchyService.js';

export type ClaimStatus = 'proposed' | 'supported' | 'contested' | 'stale' | 'retired';

export interface ClaimRow {
  id: string;
  user_id: string;
  claim_text: string;
  status: ClaimStatus;
  confidence_score: number;
  evidence_score: number;
  claim_type: string | null;
  domain: string | null;
  claim_metadata: Record<string, unknown>;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClaimCreateInput {
  claim_text: string;
  status?: ClaimStatus;
  confidence_score?: number;
  evidence_score?: number;
  claim_type?: string;
  domain?: string;
  claim_metadata?: Record<string, unknown>;
  last_validated_at?: string;
}

export async function submitClaim(
  userId: string,
  data: ClaimCreateInput,
): Promise<ClaimRow | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const id = randomUUID();
    const now = new Date().toISOString();
    const body = {
      id,
      user_id: userId,
      claim_text: data.claim_text,
      status: data.status ?? 'proposed',
      confidence_score: data.confidence_score ?? 0.5,
      evidence_score: data.evidence_score ?? 0,
      claim_type: data.claim_type ?? null,
      domain: data.domain ?? null,
      claim_metadata: data.claim_metadata ?? {},
      last_validated_at: data.last_validated_at ?? null,
      created_at: now,
      updated_at: now,
    };
    const result = await supabaseRest<ClaimRow[]>(
      'POST',
      'truth_claims',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as ClaimRow;
    }
    return result.data[0] ?? (body as ClaimRow);
  } catch (err) {
    console.error('[claimGovernanceService] submitClaim error:', err);
    return null;
  }
}

export async function getClaims(userId: string): Promise<ClaimRow[]> {
  if (!env.memoryLayerEnabled) return [];
  try {
    const result = await supabaseRest<ClaimRow[]>(
      'GET',
      `truth_claims?user_id=eq.${encodeURIComponent(userId)}&order=updated_at.desc`,
    );
    if (!result.ok || !result.data) return [];
    return result.data;
  } catch (err) {
    console.error('[claimGovernanceService] getClaims error:', err);
    return [];
  }
}

/**
 * Pure: return the status a claim should transition to given its evidence.
 */
export function transitionClaimStatus(
  claim: ClaimRow,
  evidence: EvidenceRow[],
): ClaimStatus {
  if (claim.status === 'retired') return 'retired';
  const score = aggregateEvidenceScore(evidence);
  if (score > 0.7) return 'supported';
  if (score > 0.4) return 'proposed';
  if (score > 0) return 'contested';
  return 'stale';
}

/**
 * Pure: is the claim strong enough to drive operational behavior?
 */
export function computeOperationalEligibility(claim: ClaimRow): boolean {
  return (
    claim.status === 'supported' &&
    (claim.confidence_score ?? 0) > 0.6 &&
    (claim.evidence_score ?? 0) > 0.5
  );
}

/** Helper used by contextCuratorService wiring: load supported claims. */
export async function getClaimsForContext(userId: string): Promise<ClaimRow[]> {
  if (!env.memoryLayerEnabled) return [];
  try {
    const result = await supabaseRest<ClaimRow[]>(
      'GET',
      `truth_claims?user_id=eq.${encodeURIComponent(userId)}&order=updated_at.desc&limit=50`,
    );
    if (!result.ok || !result.data) return [];
    return result.data;
  } catch (err) {
    console.error('[claimGovernanceService] getClaimsForContext error:', err);
    return [];
  }
}
