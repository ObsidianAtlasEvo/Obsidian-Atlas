/**
 * Atlas Mutation Ledger
 * Phase 2 Governance
 *
 * Append-only record of every mutation committed to Atlas's system prompt.
 * Supports rollback to any prior state and quarantine detection.
 */

import { validateMutation, ValidationResult } from './mutationConstitution';

export type MutationStatus = 'committed' | 'rolled_back' | 'quarantined' | 'pending_approval';

export interface MutationRecord {
  id: string;
  userId: string;
  timestamp: string;
  instruction: string;
  traitSource: string;
  signalStrength: number; // 0–1
  status: MutationStatus;
  validationResult: ValidationResult;
  previousSnapshotId: string | null;
  rollbackReason?: string;
  quarantineReason?: string;
}

export interface LedgerSnapshot {
  snapshotId: string;
  userId: string;
  timestamp: string;
  promptHash: string;
  committedMutationIds: string[];
}

// In-memory store — production should back this with IndexedDB via stateVersionManager
const ledgerStore: Map<string, MutationRecord[]> = new Map();
const snapshotStore: Map<string, LedgerSnapshot[]> = new Map();

function getUserLedger(userId: string): MutationRecord[] {
  if (!ledgerStore.has(userId)) ledgerStore.set(userId, []);
  return ledgerStore.get(userId)!;
}

function getUserSnapshots(userId: string): LedgerSnapshot[] {
  if (!snapshotStore.has(userId)) snapshotStore.set(userId, []);
  return snapshotStore.get(userId)!;
}

/**
 * Attempt to commit a new mutation.
 * Validates against the constitution first; blocks or quarantines on violation.
 */
export function commitMutation(
  userId: string,
  instruction: string,
  traitSource: string,
  signalStrength: number
): MutationRecord {
  const validation = validateMutation(instruction);
  const id = `mut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const snapshots = getUserSnapshots(userId);
  const lastSnapshot = snapshots[snapshots.length - 1] ?? null;

  let status: MutationStatus = 'committed';
  let quarantineReason: string | undefined;

  if (!validation.valid) {
    const hasBlock = validation.violations.some((v) => v.action === 'BLOCK');
    const hasQuarantine = validation.violations.some((v) => v.action === 'QUARANTINE');
    const hasApproval = validation.violations.some((v) => v.action === 'REQUIRE_APPROVAL');

    if (hasBlock) {
      status = 'quarantined';
      quarantineReason = `BLOCK: ${validation.violations.filter((v) => v.action === 'BLOCK').map((v) => v.articleTitle).join(', ')}`;
    } else if (hasQuarantine) {
      status = 'quarantined';
      quarantineReason = `QUARANTINE: ${validation.violations.map((v) => v.articleTitle).join(', ')}`;
    } else if (hasApproval) {
      status = 'pending_approval';
    }
  }

  const record: MutationRecord = {
    id,
    userId,
    timestamp: new Date().toISOString(),
    instruction,
    traitSource,
    signalStrength,
    status,
    validationResult: validation,
    previousSnapshotId: lastSnapshot?.snapshotId ?? null,
    quarantineReason,
  };

  getUserLedger(userId).push(record);
  return record;
}

/**
 * Roll back all mutations after a given snapshot ID, marking them as rolled_back.
 */
export function rollbackToSnapshot(userId: string, snapshotId: string, reason: string): boolean {
  const snapshots = getUserSnapshots(userId);
  const targetIndex = snapshots.findIndex((s) => s.snapshotId === snapshotId);
  if (targetIndex === -1) return false;

  const targetSnapshot = snapshots[targetIndex];
  const ledger = getUserLedger(userId);

  for (const record of ledger) {
    if (
      record.status === 'committed' &&
      record.timestamp > targetSnapshot.timestamp
    ) {
      record.status = 'rolled_back';
      record.rollbackReason = reason;
    }
  }

  // Trim snapshots after target
  snapshotStore.set(userId, snapshots.slice(0, targetIndex + 1));
  return true;
}

/**
 * Take a snapshot of current committed mutation state.
 */
export function takeSnapshot(userId: string, promptHash: string): LedgerSnapshot {
  const ledger = getUserLedger(userId);
  const committedIds = ledger
    .filter((r) => r.status === 'committed')
    .map((r) => r.id);

  const snapshot: LedgerSnapshot = {
    snapshotId: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    timestamp: new Date().toISOString(),
    promptHash,
    committedMutationIds: committedIds,
  };

  getUserSnapshots(userId).push(snapshot);
  return snapshot;
}

export function getLedger(userId: string): MutationRecord[] {
  return [...getUserLedger(userId)];
}

export function getSnapshots(userId: string): LedgerSnapshot[] {
  return [...getUserSnapshots(userId)];
}

export function getQuarantinedMutations(userId: string): MutationRecord[] {
  return getUserLedger(userId).filter((r) => r.status === 'quarantined');
}

/**
 * Detect if recent mutations show degradation patterns (rapid quarantine rate).
 */
export function detectQuarantineSpike(userId: string, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = getUserLedger(userId).filter(
    (r) => now - new Date(r.timestamp).getTime() < windowMs
  );
  if (recent.length < 3) return false;
  const quarantineRate = recent.filter((r) => r.status === 'quarantined').length / recent.length;
  return quarantineRate > 0.5;
}
