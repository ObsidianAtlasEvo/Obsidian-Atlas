/**
 * Policy Enforcement Runtime
 * Phase 4 Governance — Section 1: Policy Precedence Engine
 *
 * Central mutation interceptor. Every mutation flows through enforcePolicy()
 * which checks it against active policy layers in precedence order and
 * returns an allow/deny decision with a full audit trail.
 */

import {
  PolicyLayer,
  ActivePolicy,
  PolicyRule,
  resolveConflict,
} from './precedenceConflictResolver.ts';
import { isLocked } from './layerLockGuard.ts';
import { record as auditRecord } from './precedenceAuditTrail.ts';

// ── Types ───────────────────────────────────────────────────────────────────

/** A mutation that must pass through policy enforcement. */
export interface PolicyMutation {
  id: string;
  layer: PolicyLayer;
  action: string;
  target: string;
  actorId: string;
  timestamp: Date;
}

/** The result of evaluating a mutation against active policies. */
export interface EnforcementResult {
  allowed: boolean;
  reason: string;
  appliedLayer: PolicyLayer;
  auditId: string;
}

// ── Active policy registry (in-memory) ──────────────────────────────────────

const activePolicies: ActivePolicy[] = [];

/**
 * Register an active policy for enforcement consideration.
 */
export function registerPolicy(policy: ActivePolicy): void {
  activePolicies.push(policy);
}

/**
 * Remove an active policy by ID.
 */
export function unregisterPolicy(policyId: string): boolean {
  const idx = activePolicies.findIndex((p) => p.id === policyId);
  if (idx === -1) return false;
  activePolicies.splice(idx, 1);
  return true;
}

/**
 * Get a snapshot of all currently registered policies.
 */
export function getActivePolicies(): ActivePolicy[] {
  return [...activePolicies];
}

// ── Core enforcement ────────────────────────────────────────────────────────

/**
 * Enforce policy on a single mutation.
 *
 * Evaluation order:
 *   1. Check if the mutation's target layer is locked
 *   2. Gather matching active policies
 *   3. Resolve conflicts via PrecedenceConflictResolver
 *   4. Record the decision to the audit trail
 */
export async function enforcePolicy(mutation: PolicyMutation): Promise<EnforcementResult> {
  // Step 1 — Layer lock check
  if (isLocked(mutation.layer)) {
    const auditId = await auditRecord({
      mutationId: mutation.id,
      layer: mutation.layer,
      action: mutation.action,
      actorId: mutation.actorId,
      allowed: false,
      reason: `Layer ${PolicyLayer[mutation.layer]} is locked`,
      appliedLayer: mutation.layer,
      timestamp: new Date(),
    });

    return {
      allowed: false,
      reason: `Layer ${PolicyLayer[mutation.layer]} is locked`,
      appliedLayer: mutation.layer,
      auditId,
    };
  }

  // Step 2 — Gather matching policies
  const matching = activePolicies.filter(
    (p) => p.layer <= mutation.layer // policies at or above the mutation layer apply
  );

  // No matching policies → allow by default
  if (matching.length === 0) {
    const auditId = await auditRecord({
      mutationId: mutation.id,
      layer: mutation.layer,
      action: mutation.action,
      actorId: mutation.actorId,
      allowed: true,
      reason: 'No active policies matched — default allow',
      appliedLayer: mutation.layer,
      timestamp: new Date(),
    });

    return {
      allowed: true,
      reason: 'No active policies matched — default allow',
      appliedLayer: mutation.layer,
      auditId,
    };
  }

  // Step 3 — Resolve conflicts
  const winner = resolveConflict(matching);
  const allowed = winner.rule.effect === 'ALLOW';
  const reason = allowed
    ? `Allowed by policy ${winner.id} (${PolicyLayer[winner.layer]}): ${winner.rule.description}`
    : `Denied by policy ${winner.id} (${PolicyLayer[winner.layer]}): ${winner.rule.description}`;

  // Step 4 — Audit
  const auditId = await auditRecord({
    mutationId: mutation.id,
    layer: mutation.layer,
    action: mutation.action,
    actorId: mutation.actorId,
    allowed,
    reason,
    appliedLayer: winner.layer,
    timestamp: new Date(),
  });

  return { allowed, reason, appliedLayer: winner.layer, auditId };
}

/**
 * Enforce policy on a batch of mutations.
 * Each mutation is evaluated independently.
 */
export async function enforceBatch(mutations: PolicyMutation[]): Promise<EnforcementResult[]> {
  return Promise.all(mutations.map(enforcePolicy));
}

// ── Re-exports for convenience ──────────────────────────────────────────────

export { PolicyLayer } from './precedenceConflictResolver.ts';
export type { PolicyRule, ActivePolicy } from './precedenceConflictResolver.ts';
