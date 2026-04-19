/**
 * policySimulationService.ts — Phase 0.85: Policy Simulation Sandbox
 *
 * Every policy mutation candidate must pass through this simulation pipeline
 * before being applied live. The simulation is a 7-step evaluation that
 * gates the mutation on evidence quality, contradiction burden, scope
 * compatibility, correction precedence, drift risk, and behavioral delta.
 *
 * Live application is gated on simulatePolicyMutation returning outcome='apply'.
 * The caller (typically policyAutoWriter.ts) must check shouldApplyLive before
 * calling applyPolicyPatch.
 *
 * Governing principle: No adaptation should become trusted until Atlas can
 * explain the evidence, simulate the effect, and detect the drift risk.
 */

import { randomUUID } from 'node:crypto';
import { supabaseRest } from '../../db/supabase.js';
import { env } from '../../config/env.js';
import { computeEvidenceProfile } from './evidenceArbitrationService.js';
import type { EvidenceProfile } from './evidenceArbitrationService.js';
import { getDriftState } from './driftMonitorService.js';
import type { DriftState } from './driftMonitorService.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SimulationInput {
  userId: string;
  policyField: string;
  currentValue: unknown;
  proposedValue: unknown;
  evidenceChain: EvidenceProfile[];
  contradictionBurden: number;   // 0..1
  correctionHistory?: string[];  // recent correction signals opposing this field
}

export interface SimulationResult {
  id: string;
  outcome: 'apply' | 'stage' | 'reject';
  reason: string;
  riskLevel: 'low' | 'moderate' | 'elevated' | 'severe';
  behavioralDeltaEstimate: Record<string, unknown>;
  rollbackAnchorId?: string;
  shouldApplyLive: boolean;
}

// ── Hard rejection checkers ───────────────────────────────────────────────────

function isAssistantInferredOnly(chain: EvidenceProfile[]): boolean {
  return (
    chain.length > 0 &&
    chain.every((p) => p.evidenceType === 'assistant_inference')
  );
}

function hasWeakEvidence(chain: EvidenceProfile[]): boolean {
  if (chain.length === 0) return true;
  const avgStrength = chain.reduce((s, p) => s + p.evidenceStrength, 0) / chain.length;
  return avgStrength < 0.3;
}

function hasNonGlobalScope(chain: EvidenceProfile[]): boolean {
  // If we have evidence profiles and none suggest global scope (no field on profile,
  // but we can check trust level as proxy — non-global tends to produce lower trust)
  // We check for 'tentative' identity eligibility as a proxy for non-global evidence.
  return chain.some(
    (p) =>
      p.identityEligibilityRecommendation === 'tentative' ||
      p.identityEligibilityRecommendation === 'blocked',
  );
}

function correctionOpposes(
  correctionHistory: string[],
  policyField: string,
): boolean {
  // A correction is considered to oppose if it references the same policy field
  return correctionHistory.some((c) => c.toLowerCase().includes(policyField.toLowerCase()));
}

// ── Behavioral delta estimation ───────────────────────────────────────────────

/**
 * Estimate the behavioral impact magnitude of a field value change.
 * Returns a 0..1 delta and categorized impact descriptor.
 */
function estimateBehavioralDelta(
  policyField: string,
  currentValue: unknown,
  proposedValue: unknown,
): { delta: number; category: string; description: string } {
  // Numeric fields: use absolute difference
  if (typeof currentValue === 'number' && typeof proposedValue === 'number') {
    const rawDelta = Math.abs(proposedValue - currentValue);
    const clamped = Math.min(rawDelta, 1.0);
    return {
      delta: clamped,
      category: clamped > 0.3 ? 'significant' : clamped > 0.1 ? 'moderate' : 'minor',
      description: `${policyField}: numeric delta ${rawDelta.toFixed(3)}`,
    };
  }

  // String fields: same = no delta, different = estimated by field sensitivity
  if (typeof currentValue === 'string' && typeof proposedValue === 'string') {
    if (currentValue === proposedValue) {
      return { delta: 0.0, category: 'none', description: `${policyField}: no change` };
    }

    // High-sensitivity fields
    const highSensitivity = ['truthFirstStrictness', 'tone', 'verbosity'];
    const mediumSensitivity = ['structurePreference', 'preferredComputeDepth'];

    if (highSensitivity.includes(policyField)) {
      return {
        delta: 0.5,
        category: 'significant',
        description: `${policyField}: high-sensitivity field changed "${currentValue}" → "${proposedValue}"`,
      };
    }
    if (mediumSensitivity.includes(policyField)) {
      return {
        delta: 0.3,
        category: 'moderate',
        description: `${policyField}: medium-sensitivity field changed "${currentValue}" → "${proposedValue}"`,
      };
    }
    return {
      delta: 0.2,
      category: 'minor',
      description: `${policyField}: field changed "${currentValue}" → "${proposedValue}"`,
    };
  }

  // Fallback for other types
  const same = JSON.stringify(currentValue) === JSON.stringify(proposedValue);
  return {
    delta: same ? 0.0 : 0.4,
    category: same ? 'none' : 'unknown',
    description: `${policyField}: value changed (type: ${typeof proposedValue})`,
  };
}

// ── 7-step simulation pipeline ────────────────────────────────────────────────

export async function simulatePolicyMutation(
  input: SimulationInput,
): Promise<SimulationResult> {
  const {
    userId,
    policyField,
    currentValue,
    proposedValue,
    evidenceChain,
    contradictionBurden,
    correctionHistory = [],
  } = input;

  const rejectionReasons: string[] = [];
  let stageReasons: string[] = [];

  // ── Step 1: Evidence review ────────────────────────────────────────────────
  if (isAssistantInferredOnly(evidenceChain)) {
    rejectionReasons.push('Evidence chain is entirely assistant-inferred — no user-backed signal.');
  }
  if (hasWeakEvidence(evidenceChain)) {
    rejectionReasons.push('Average evidence strength below minimum threshold (0.30).');
  }
  const avgPolicyEligible = evidenceChain.filter(
    (p) => p.policyEligibilityRecommendation === 'apply' || p.policyEligibilityRecommendation === 'stage',
  ).length;
  if (evidenceChain.length > 0 && avgPolicyEligible === 0) {
    rejectionReasons.push('No evidence profiles recommend policy eligibility (apply or stage).');
  }

  // ── Step 2: Contradiction review ──────────────────────────────────────────
  if (contradictionBurden > 0.6) {
    rejectionReasons.push(
      `Contradiction burden ${contradictionBurden.toFixed(2)} exceeds threshold (0.60) — unresolved conflict present.`,
    );
  } else if (contradictionBurden > 0.35) {
    stageReasons.push(
      `Contradiction burden ${contradictionBurden.toFixed(2)} warrants staging for observation before apply.`,
    );
  }

  // ── Step 3: Scope compatibility ───────────────────────────────────────────
  if (hasNonGlobalScope(evidenceChain)) {
    stageReasons.push('Evidence includes non-global scope signals — stage for validation before global policy write.');
  }

  // ── Step 4: Correction precedence ────────────────────────────────────────
  if (correctionOpposes(correctionHistory, policyField)) {
    rejectionReasons.push(
      `Recent user correction opposes the proposed ${policyField} change — correction takes precedence.`,
    );
  }

  // ── Step 5: Drift risk review ─────────────────────────────────────────────
  let driftState: DriftState | null = null;
  try {
    driftState = await getDriftState(userId);
  } catch (err) {
    console.error('[policySimulation] drift state unavailable:', err);
  }

  const driftRisk = driftState?.driftRiskLevel ?? 'low';
  if (driftState?.mutationSuppressed) {
    rejectionReasons.push(
      `Mutation suppressed: drift risk level '${driftRisk}' exceeds safe threshold.`,
    );
  } else if (driftRisk === 'moderate') {
    stageReasons.push(`Drift risk level 'moderate' warrants staging before live application.`);
  }

  // ── Step 6: Behavioral delta estimation ───────────────────────────────────
  const delta = estimateBehavioralDelta(policyField, currentValue, proposedValue);
  const behavioralDeltaEstimate: Record<string, unknown> = {
    delta: delta.delta,
    category: delta.category,
    description: delta.description,
    fieldSensitivity: delta.delta > 0.4 ? 'high' : delta.delta > 0.2 ? 'medium' : 'low',
  };

  if (delta.delta > 0.5) {
    stageReasons.push(
      `High behavioral delta (${delta.delta.toFixed(2)}) — recommend staging before live apply.`,
    );
  }

  // ── Step 7: Final decision ────────────────────────────────────────────────
  let outcome: SimulationResult['outcome'];
  let reason: string;

  if (rejectionReasons.length > 0) {
    outcome = 'reject';
    reason = rejectionReasons.join(' | ');
  } else if (stageReasons.length > 0) {
    outcome = 'stage';
    reason = stageReasons.join(' | ');
  } else {
    outcome = 'apply';
    reason = 'All simulation gates passed — mutation approved for live application.';
  }

  // Risk level is the drift level (or elevated if behavioral delta is high)
  const riskLevel: SimulationResult['riskLevel'] =
    driftRisk === 'severe' || driftRisk === 'elevated'
      ? driftRisk
      : delta.delta > 0.5
      ? 'moderate'
      : (driftRisk as SimulationResult['riskLevel']);

  const result: SimulationResult = {
    id: randomUUID(),
    outcome,
    reason,
    riskLevel,
    behavioralDeltaEstimate,
    shouldApplyLive: outcome === 'apply',
  };

  // Persist simulation record
  const persistedId = await persistSimulation(userId, input, result).catch((err) => {
    console.error('[policySimulation] persist error:', err);
    return result.id;
  });

  return { ...result, id: persistedId };
}

// ── Persistence ───────────────────────────────────────────────────────────────

export async function persistSimulation(
  userId: string,
  input: SimulationInput,
  result: SimulationResult,
): Promise<string> {
  if (!env.memoryLayerEnabled) return result.id;

  const id = randomUUID();
  const row = {
    id,
    user_id: userId,
    policy_field: input.policyField,
    before_value: input.currentValue,
    after_value: input.proposedValue,
    evidence_chain: input.evidenceChain.map((p) => p.id).filter(Boolean),
    confidence:
      input.evidenceChain.length > 0
        ? input.evidenceChain.reduce((s, p) => s + p.evidenceStrength, 0) /
          input.evidenceChain.length
        : 0.0,
    contradiction_burden: input.contradictionBurden,
    drift_risk_level: result.riskLevel,
    simulation_outcome: result.outcome,
    simulation_reason: result.reason,
    behavioral_delta_estimate: result.behavioralDeltaEstimate,
    rollback_anchor_id: result.rollbackAnchorId ?? null,
    applied_at: result.outcome === 'apply' ? new Date().toISOString() : null,
  };

  try {
    const res = await supabaseRest<Array<Record<string, unknown>>>(
      'POST',
      'policy_simulations',
      row,
    );
    if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
      return (res.data[0]?.['id'] as string) ?? id;
    }
  } catch (err) {
    console.error('[policySimulation] persistSimulation error:', err);
  }

  return id;
}

/**
 * Convenience function used by other services to get drift state without
 * importing driftMonitorService directly — allows graceful degradation.
 */
export async function getDriftStateForSimulation(
  userId: string,
): Promise<{ riskLevel: string; mutationSuppressed: boolean }> {
  try {
    const state = await getDriftState(userId);
    return {
      riskLevel: state.driftRiskLevel,
      mutationSuppressed: state.mutationSuppressed,
    };
  } catch {
    return { riskLevel: 'low', mutationSuppressed: false };
  }
}
