/**
 * Atlas Governance — Enforcement Module
 * Phase 4 Governance — Section 1: Policy Precedence Engine
 *
 * Barrel export for the policy enforcement subsystem.
 */

// ── Conflict Resolver ───────────────────────────────────────────────────────
export { resolveConflict } from './precedenceConflictResolver.ts';
export type { PolicyRule, ActivePolicy } from './precedenceConflictResolver.ts';
export { PolicyLayer } from './precedenceConflictResolver.ts';

// ── Layer Lock Guard ────────────────────────────────────────────────────────
export { isLocked, unlock, lock, getLockedLayers } from './layerLockGuard.ts';
export type { UnlockResult } from './layerLockGuard.ts';

// ── Audit Trail ─────────────────────────────────────────────────────────────
export { record, query } from './precedenceAuditTrail.ts';
export type { AuditEntry, AuditFilter } from './precedenceAuditTrail.ts';

// ── Enforcement Runtime ─────────────────────────────────────────────────────
export {
  enforcePolicy,
  enforceBatch,
  registerPolicy,
  unregisterPolicy,
  getActivePolicies,
} from './policyEnforcementRuntime.ts';
export type { PolicyMutation, EnforcementResult } from './policyEnforcementRuntime.ts';
