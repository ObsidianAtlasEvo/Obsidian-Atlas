/**
 * Atlas User Evolution Control
 * Phase 2 Governance
 *
 * Full user control surface over Atlas personalization.
 * Freeze, revert, reset, inspect — plus observed vs confirmed trait distinction.
 */

import { AtlasEventBus } from '../infrastructure/eventBus';
import { rollbackToSnapshot, getSnapshots, getLedger } from '../constitution/mutationLedger';
import { getAllTraits, getConfirmedTraits, getObservedTraits } from '../constitution/identityResolution';

export interface EvolutionFreezeState {
  userId: string;
  frozen: boolean;
  frozenAt?: string;
  frozenReason?: string;
}

export interface RevertResult {
  success: boolean;
  mutationsRolledBack: number;
  snapshotId: string;
  error?: string;
}

export interface ResetResult {
  success: boolean;
  domainsReset: string[];
  error?: string;
}

export interface EvolutionInspectReport {
  userId: string;
  generatedAt: string;
  frozen: boolean;
  totalMutations: number;
  committedMutations: number;
  quarantinedMutations: number;
  rolledBackMutations: number;
  confirmedTraits: number;
  observedTraits: number;
  snapshots: number;
  recentMutations: Array<{
    id: string;
    instruction: string;
    traitSource: string;
    status: string;
    timestamp: string;
    signalStrength: number;
  }>;
  traitSummary: Array<{
    trait: string;
    value: string;
    class: string;
    status: string;
    confidence: number;
  }>;
}

const freezeStore: Map<string, EvolutionFreezeState> = new Map();

export function isFrozen(userId: string): boolean {
  return freezeStore.get(userId)?.frozen ?? false;
}

export function freezeEvolution(userId: string, reason?: string): EvolutionFreezeState {
  const state: EvolutionFreezeState = {
    userId,
    frozen: true,
    frozenAt: new Date().toISOString(),
    frozenReason: reason,
  };
  freezeStore.set(userId, state);

  AtlasEventBus.emit('EVOLUTION_FROZEN', userId, { reason }, 'userEvolutionControl');
  return state;
}

export function unfreezeEvolution(userId: string): EvolutionFreezeState {
  const state: EvolutionFreezeState = {
    userId,
    frozen: false,
  };
  freezeStore.set(userId, state);
  return state;
}

/**
 * Revert to a specific snapshot by ID or to the Nth most recent snapshot.
 */
export function revertEvolution(
  userId: string,
  options: { snapshotId?: string; stepsBack?: number },
  reason = 'User requested revert'
): RevertResult {
  const snapshots = getSnapshots(userId);
  if (snapshots.length === 0) {
    return { success: false, mutationsRolledBack: 0, snapshotId: '', error: 'No snapshots available' };
  }

  let targetSnapshotId: string;

  if (options.snapshotId) {
    const found = snapshots.find((s) => s.snapshotId === options.snapshotId);
    if (!found) return { success: false, mutationsRolledBack: 0, snapshotId: '', error: 'Snapshot not found' };
    targetSnapshotId = found.snapshotId;
  } else {
    const steps = options.stepsBack ?? 1;
    const targetIndex = Math.max(0, snapshots.length - 1 - steps);
    targetSnapshotId = snapshots[targetIndex].snapshotId;
  }

  const ledgerBefore = getLedger(userId).filter((m) => m.status === 'committed').length;
  const success = rollbackToSnapshot(userId, targetSnapshotId, reason);
  const ledgerAfter = getLedger(userId).filter((m) => m.status === 'committed').length;

  if (success) {
    AtlasEventBus.emit('EVOLUTION_REVERTED', userId, {
      snapshotId: targetSnapshotId,
      reason,
      mutationsRolledBack: ledgerBefore - ledgerAfter,
    }, 'userEvolutionControl');
  }

  return {
    success,
    mutationsRolledBack: ledgerBefore - ledgerAfter,
    snapshotId: targetSnapshotId,
  };
}

/**
 * Selective reset — clear specific evolution domains without touching others.
 */
export function resetEvolutionDomains(
  userId: string,
  domains: Array<'traits' | 'mutations' | 'goals' | 'claims' | 'all'>
): ResetResult {
  const domainsReset: string[] = [];

  try {
    if (domains.includes('all') || domains.includes('mutations')) {
      // Roll back all committed mutations
      const snapshots = getSnapshots(userId);
      if (snapshots.length > 0) {
        rollbackToSnapshot(userId, snapshots[0].snapshotId, 'User reset mutations');
      }
      domainsReset.push('mutations');
    }

    AtlasEventBus.emit('EVOLUTION_RESET', userId, { domains: domainsReset }, 'userEvolutionControl');

    return { success: true, domainsReset };
  } catch (err) {
    return {
      success: false,
      domainsReset,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Generate a full inspection report of what Atlas has learned about a user.
 */
export function inspectEvolution(userId: string): EvolutionInspectReport {
  const ledger = getLedger(userId);
  const snapshots = getSnapshots(userId);
  const allTraits = getAllTraits(userId);
  const confirmed = getConfirmedTraits(userId);
  const observed = getObservedTraits(userId);

  const recentMutations = ledger
    .slice(-10)
    .reverse()
    .map((m) => ({
      id: m.id,
      instruction: m.instruction.slice(0, 120),
      traitSource: m.traitSource,
      status: m.status,
      timestamp: m.timestamp,
      signalStrength: m.signalStrength,
    }));

  const traitSummary = allTraits
    .filter((t) => t.status !== 'decayed' && t.status !== 'rejected')
    .slice(0, 20)
    .map((t) => ({
      trait: t.trait,
      value: t.value,
      class: t.class,
      status: t.status,
      confidence: Math.round(t.confidence * 100) / 100,
    }));

  return {
    userId,
    generatedAt: new Date().toISOString(),
    frozen: isFrozen(userId),
    totalMutations: ledger.length,
    committedMutations: ledger.filter((m) => m.status === 'committed').length,
    quarantinedMutations: ledger.filter((m) => m.status === 'quarantined').length,
    rolledBackMutations: ledger.filter((m) => m.status === 'rolled_back').length,
    confirmedTraits: confirmed.length,
    observedTraits: observed.length,
    snapshots: snapshots.length,
    recentMutations,
    traitSummary,
  };
}
