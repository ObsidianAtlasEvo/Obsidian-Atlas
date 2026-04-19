/**
 * truthEvidenceLedgerService.ts — Phase 0.97: Evidence ledger for claims.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import { computeAuthorityTier, computeEvidenceWeight } from './evidenceHierarchyService.js';

export interface ClaimEvidenceRow {
  id: string;
  user_id: string;
  claim_id: string | null;
  evidence_text: string;
  evidence_type: string;
  authority_tier: number;
  weight: number;
  source_url: string | null;
  evidence_metadata: Record<string, unknown>;
  created_at: string;
}

export interface EvidenceCreateInput {
  claim_id?: string;
  evidence_text: string;
  evidence_type: string;
  authority_tier?: number;
  weight?: number;
  source_url?: string;
  evidence_metadata?: Record<string, unknown>;
}

export async function addEvidence(
  userId: string,
  data: EvidenceCreateInput,
): Promise<ClaimEvidenceRow | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const id = randomUUID();
    const tier = data.authority_tier ?? computeAuthorityTier(data.evidence_type);
    const weight = data.weight ?? computeEvidenceWeight(data.evidence_type, tier);
    const now = new Date().toISOString();
    const body = {
      id,
      user_id: userId,
      claim_id: data.claim_id ?? null,
      evidence_text: data.evidence_text,
      evidence_type: data.evidence_type,
      authority_tier: tier,
      weight,
      source_url: data.source_url ?? null,
      evidence_metadata: data.evidence_metadata ?? {},
      created_at: now,
    };
    const result = await supabaseRest<ClaimEvidenceRow[]>(
      'POST',
      'claim_evidence',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as ClaimEvidenceRow;
    }
    return result.data[0] ?? (body as ClaimEvidenceRow);
  } catch (err) {
    console.error('[truthEvidenceLedgerService] addEvidence error:', err);
    return null;
  }
}

export async function getEvidenceForClaim(
  userId: string,
  claimId: string,
): Promise<ClaimEvidenceRow[]> {
  if (!env.memoryLayerEnabled) return [];
  try {
    const result = await supabaseRest<ClaimEvidenceRow[]>(
      'GET',
      `claim_evidence?user_id=eq.${encodeURIComponent(userId)}&claim_id=eq.${encodeURIComponent(claimId)}&order=authority_tier.asc`,
    );
    if (!result.ok || !result.data) return [];
    return result.data;
  } catch (err) {
    console.error('[truthEvidenceLedgerService] getEvidenceForClaim error:', err);
    return [];
  }
}
