/**
 * evidenceArbitrationService.ts — Phase 0.85: Evidence Arbitration
 *
 * Evaluates signal quality and produces structured evidence profiles that gate
 * every downstream adaptation decision. No signal becomes trusted until its
 * evidence profile has been computed and the operational trust level established.
 *
 * Governing principle: Evidence quality is a first-class citizen — not an
 * afterthought applied post-hoc to an already-made decision.
 */

import { randomUUID } from 'node:crypto';
import { supabaseRest } from '../../db/supabase.js';
import { env } from '../../config/env.js';
import type {
  MemoryProvenance,
  MemoryClass,
  MemoryScopeType,
} from './memoryGovernance.js';
import { isInitiallyPolicyEligible } from './memoryGovernance.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type EvidenceType =
  | 'user_stated_truth'
  | 'user_preference'
  | 'repeated_behavioral'
  | 'assistant_inference'
  | 'system_derived'
  | 'retrieved_factual'
  | 'contradicted'
  | 'low_confidence';

export interface EvidenceProfile {
  id?: string;
  userId: string;
  memoryId?: string;
  evidenceType: EvidenceType;
  evidenceDirectness: 'direct' | 'inferred' | 'pattern';
  evidenceStrength: number;               // 0..1
  evidenceRecurrence: number;
  evidenceStability: number;              // 0..1
  evidenceConfirmationStatus: 'unconfirmed' | 'confirmed' | 'contradicted';
  evidenceOperationalWeight: number;      // 0..1
  operationalTrustLevel: 'blocked' | 'low' | 'moderate' | 'high';
  policyEligibilityRecommendation: 'apply' | 'stage' | 'reject';
  identityEligibilityRecommendation: 'durable' | 'contextual' | 'tentative' | 'blocked';
  personalizationIntensityCap: 'blocked' | 'light' | 'moderate' | 'strong';
}

export interface EvidenceComputeInput {
  provenance: MemoryProvenance;
  memoryClass: MemoryClass;
  stabilityScore: number;
  recurrenceCount: number;
  contradictionStatus: string;
  confirmationStatus: string;
  scopeType: MemoryScopeType;
  importance: number;
  confidence: number;
}

// ── Pure computation ──────────────────────────────────────────────────────────

/**
 * Deterministically compute an evidence profile from raw signal attributes.
 * No I/O. All scoring rules are encoded here as the canonical arbiter.
 */
export function computeEvidenceProfile(
  input: EvidenceComputeInput,
  userId: string = '',
  memoryId?: string,
): EvidenceProfile {
  const {
    provenance,
    memoryClass,
    stabilityScore,
    recurrenceCount,
    contradictionStatus,
    confirmationStatus,
    scopeType,
    importance,
    confidence,
  } = input;

  const isContradicted =
    contradictionStatus === 'contradicted' ||
    contradictionStatus === 'unresolved' ||
    confirmationStatus === 'contradicted' ||
    memoryClass === 'anomaly';

  const isAssistantInferred = provenance === 'assistant_inferred';
  const isUserStated =
    provenance === 'user_stated' || provenance === 'corrected_by_user';
  const isUserConfirmed = provenance === 'user_confirmed';
  const isSystemDerived = provenance === 'system_derived';
  const isExplicit = isUserStated || isUserConfirmed;

  // ── Derive evidence type ──────────────────────────────────────────────────
  let evidenceType: EvidenceType;
  if (isContradicted) {
    evidenceType = 'contradicted';
  } else if (isAssistantInferred) {
    evidenceType = 'assistant_inference';
  } else if (isUserStated && isExplicit) {
    evidenceType =
      recurrenceCount >= 3 ? 'repeated_behavioral' : 'user_stated_truth';
  } else if (isUserConfirmed) {
    evidenceType = 'user_preference';
  } else if (isSystemDerived) {
    evidenceType = 'system_derived';
  } else if (confidence < 0.4) {
    evidenceType = 'low_confidence';
  } else {
    evidenceType = 'assistant_inference';
  }

  // ── Derive directness ─────────────────────────────────────────────────────
  let evidenceDirectness: EvidenceProfile['evidenceDirectness'];
  if (isUserStated) {
    evidenceDirectness = 'direct';
  } else if (isUserConfirmed || isSystemDerived) {
    evidenceDirectness = 'inferred';
  } else {
    evidenceDirectness = recurrenceCount >= 3 ? 'pattern' : 'inferred';
  }

  // ── Compute raw strength ──────────────────────────────────────────────────
  let evidenceStrength: number;
  if (isContradicted) {
    evidenceStrength = 0.0;
  } else if (isAssistantInferred) {
    evidenceStrength = Math.min(confidence * 0.4, 0.35);
  } else if (isUserStated && confirmationStatus === 'confirmed') {
    evidenceStrength = Math.min(0.5 + stabilityScore * 0.3 + Math.min(recurrenceCount, 5) * 0.04, 1.0);
  } else if (isUserStated) {
    evidenceStrength = Math.min(0.4 + stabilityScore * 0.2, 0.75);
  } else if (isUserConfirmed) {
    evidenceStrength = Math.min(0.45 + stabilityScore * 0.25, 0.80);
  } else {
    evidenceStrength = Math.min(confidence * 0.5, 0.5);
  }

  // ── Compute stability ─────────────────────────────────────────────────────
  const evidenceStability = Math.max(0.0, Math.min(stabilityScore, 1.0));

  // ── Compute operational weight ────────────────────────────────────────────
  let evidenceOperationalWeight: number;
  if (isContradicted) {
    evidenceOperationalWeight = 0.0;
  } else if (isAssistantInferred) {
    evidenceOperationalWeight = Math.min(evidenceStrength * 0.3, 0.2);
  } else {
    const recurrenceBonus = Math.min((recurrenceCount - 1) * 0.05, 0.2);
    evidenceOperationalWeight = Math.min(
      evidenceStrength * 0.7 + recurrenceBonus,
      1.0,
    );
  }

  // ── Trust level ──────────────────────────────────────────────────────────
  // CRITICAL RULE: assistant_inferred NEVER exceeds 'low'.
  // CRITICAL RULE: contradicted → 'blocked'.
  let operationalTrustLevel: EvidenceProfile['operationalTrustLevel'];
  if (isContradicted) {
    operationalTrustLevel = 'blocked';
  } else if (isAssistantInferred) {
    operationalTrustLevel = 'low'; // HARD CAP
  } else if (
    isExplicit &&
    confirmationStatus === 'confirmed' &&
    stabilityScore >= 0.7 &&
    recurrenceCount >= 2
  ) {
    operationalTrustLevel = 'high';
  } else if (isExplicit && stabilityScore >= 0.5) {
    operationalTrustLevel = 'moderate';
  } else if (isUserConfirmed) {
    operationalTrustLevel = 'moderate';
  } else {
    operationalTrustLevel = 'low';
  }

  // ── Policy eligibility recommendation ────────────────────────────────────
  let policyEligibilityRecommendation: EvidenceProfile['policyEligibilityRecommendation'];
  if (isContradicted || isAssistantInferred || operationalTrustLevel === 'blocked') {
    policyEligibilityRecommendation = 'reject';
  } else if (operationalTrustLevel === 'high') {
    policyEligibilityRecommendation = 'apply';
  } else if (operationalTrustLevel === 'moderate') {
    policyEligibilityRecommendation = 'stage';
  } else {
    policyEligibilityRecommendation = 'reject';
  }

  // ── Identity eligibility recommendation ──────────────────────────────────
  let identityEligibilityRecommendation: EvidenceProfile['identityEligibilityRecommendation'];
  if (isContradicted || isAssistantInferred) {
    identityEligibilityRecommendation = 'blocked';
  } else if (operationalTrustLevel === 'high' && scopeType === 'global') {
    identityEligibilityRecommendation = 'durable';
  } else if (operationalTrustLevel === 'moderate') {
    identityEligibilityRecommendation =
      scopeType === 'global' ? 'contextual' : 'tentative';
  } else {
    identityEligibilityRecommendation = 'tentative';
  }

  // ── Personalization intensity cap ─────────────────────────────────────────
  // Rules (precedence in order):
  //   1. contradicted → blocked
  //   2. session scope → light max
  //   3. assistant_inferred → blocked (not worth even light)
  //   4. recurrence==1 + not explicit → light
  //   5. confirmed + stable → strong
  //   6. moderate trust → moderate
  //   7. default → light
  let personalizationIntensityCap: EvidenceProfile['personalizationIntensityCap'];
  if (isContradicted) {
    personalizationIntensityCap = 'blocked';
  } else if (isAssistantInferred) {
    personalizationIntensityCap = 'blocked';
  } else if (scopeType === 'session') {
    personalizationIntensityCap = 'light';
  } else if (recurrenceCount === 1 && !isExplicit) {
    personalizationIntensityCap = 'light';
  } else if (
    operationalTrustLevel === 'high' &&
    confirmationStatus === 'confirmed' &&
    stabilityScore >= 0.7
  ) {
    personalizationIntensityCap = 'strong';
  } else if (operationalTrustLevel === 'moderate') {
    personalizationIntensityCap = 'moderate';
  } else {
    personalizationIntensityCap = 'light';
  }

  // ── Confirmation status normalization ─────────────────────────────────────
  let evidenceConfirmationStatus: EvidenceProfile['evidenceConfirmationStatus'];
  if (isContradicted) {
    evidenceConfirmationStatus = 'contradicted';
  } else if (confirmationStatus === 'confirmed') {
    evidenceConfirmationStatus = 'confirmed';
  } else {
    evidenceConfirmationStatus = 'unconfirmed';
  }

  return {
    userId,
    memoryId,
    evidenceType,
    evidenceDirectness,
    evidenceStrength,
    evidenceRecurrence: recurrenceCount,
    evidenceStability,
    evidenceConfirmationStatus,
    evidenceOperationalWeight,
    operationalTrustLevel,
    policyEligibilityRecommendation,
    identityEligibilityRecommendation,
    personalizationIntensityCap,
  };
}

// ── Async persistence ─────────────────────────────────────────────────────────

/**
 * Compute and persist an evidence profile to evidence_profiles.
 * Upserts on (user_id, memory_id) when memoryId is present; otherwise inserts.
 */
export async function arbitrateAndPersist(
  userId: string,
  memoryId: string,
  input: EvidenceComputeInput,
): Promise<EvidenceProfile> {
  const profile = computeEvidenceProfile(input, userId, memoryId);

  if (!env.memoryLayerEnabled) {
    return profile;
  }

  const dbRow = {
    id: randomUUID(),
    user_id: userId,
    memory_id: memoryId || null,
    evidence_type: profile.evidenceType,
    evidence_directness: profile.evidenceDirectness,
    evidence_strength: profile.evidenceStrength,
    evidence_recurrence: profile.evidenceRecurrence,
    evidence_stability: profile.evidenceStability,
    evidence_confirmation_status: profile.evidenceConfirmationStatus,
    evidence_operational_weight: profile.evidenceOperationalWeight,
    operational_trust_level: profile.operationalTrustLevel,
    policy_eligibility_recommendation: profile.policyEligibilityRecommendation,
    identity_eligibility_recommendation: profile.identityEligibilityRecommendation,
    personalization_intensity_cap: profile.personalizationIntensityCap,
  };

  try {
    let result;
    if (memoryId) {
      // Attempt upsert by memory_id
      result = await supabaseRest<Array<Record<string, unknown>>>(
        'POST',
        'evidence_profiles',
        dbRow,
        { Prefer: 'return=representation,resolution=merge-duplicates' },
      );
    } else {
      result = await supabaseRest<Array<Record<string, unknown>>>(
        'POST',
        'evidence_profiles',
        dbRow,
      );
    }

    if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
      profile.id = result.data[0]?.id as string | undefined;
    }
  } catch (err) {
    // Non-blocking — governance layer must never crash the call path
    console.error('[evidenceArbitration] persist error:', err);
  }

  return profile;
}

// ── Internal exports for tests ────────────────────────────────────────────────

export const __internal = {
  computeEvidenceProfile,
};
