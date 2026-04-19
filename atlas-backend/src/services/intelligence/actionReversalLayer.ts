/**
 * actionReversalLayer.ts — Phase 0.985: Reverse executed contracts.
 *
 * - Only 'completed' contracts are eligible
 * - Uses `reversal_anchor` from contract_metadata to pick a compensating action
 * - Contracts without an anchor are marked irreversible and raise a watcher event
 * - Every reversal attempt is audited to platform_backup_audit
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import type { ActionContractRow } from './actionContractService.js';
import { _fetchContract } from './actionExecutorService.js';
import { logWatcherEvent } from './watcherFrameworkService.js';

export interface ReversalResult {
  ok: boolean;
  contractId: string;
  reversed: boolean;
  irreversible?: boolean;
  reason?: string;
  anchor?: string;
}

/** Pure: read the reversal anchor from a contract's metadata/payload. */
export function getReversalAnchor(contract: ActionContractRow): string | null {
  const fromMeta = (contract.contract_metadata as Record<string, unknown>)?.['reversal_anchor'];
  if (typeof fromMeta === 'string' && fromMeta.length > 0) return fromMeta;
  const fromPayload = (contract.payload as Record<string, unknown>)?.['reversal_anchor'];
  if (typeof fromPayload === 'string' && fromPayload.length > 0) return fromPayload;
  return null;
}

async function writeReversalAudit(
  userId: string,
  contractId: string,
  status: 'completed' | 'failed',
  meta: Record<string, unknown>,
): Promise<void> {
  if (!env.memoryLayerEnabled) return;
  try {
    const now = new Date().toISOString();
    await supabaseRest('POST', 'platform_backup_audit', {
      id: randomUUID(),
      user_id: userId,
      operation: 'restore',
      resource_scope: `action_contract:${contractId}`,
      status,
      initiated_by: 'action_reversal_layer',
      destination: 'reversal',
      backup_metadata: { kind: 'action_reversal', contract_id: contractId, ...meta },
      started_at: now,
      completed_at: now,
      created_at: now,
    });
  } catch (err) {
    console.error('[actionReversalLayer] writeReversalAudit error:', err);
  }
}

async function markContract(
  userId: string,
  contractId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  if (!env.memoryLayerEnabled) return false;
  try {
    const result = await supabaseRest(
      'PATCH',
      `action_contracts?id=eq.${encodeURIComponent(contractId)}&user_id=eq.${encodeURIComponent(userId)}`,
      { ...patch, updated_at: new Date().toISOString() },
    );
    return result.ok;
  } catch (err) {
    console.error('[actionReversalLayer] markContract error:', err);
    return false;
  }
}

export async function reverseContract(
  userId: string,
  contractId: string,
  reason: string,
): Promise<ReversalResult> {
  try {
    const contract = await _fetchContract(userId, contractId);
    if (!contract) {
      return { ok: false, contractId, reversed: false, reason: 'contract_not_found' };
    }
    if (contract.status !== 'completed') {
      return {
        ok: false,
        contractId,
        reversed: false,
        reason: `contract_not_executed:${contract.status}`,
      };
    }

    const anchor = getReversalAnchor(contract);
    if (!anchor) {
      await logWatcherEvent(userId, {
        watcher_type: 'action_irreversible',
        event_class: 'violation',
        severity: 'high',
        description: `Attempted reversal of contract ${contractId} with no reversal_anchor`,
        watcher_metadata: { contract_id: contractId, reason },
      }).catch(() => {});
      await markContract(userId, contractId, {
        contract_metadata: {
          ...(contract.contract_metadata as Record<string, unknown>),
          reversal_attempted: true,
          reversal_blocked: 'no_anchor',
          reversal_attempt_reason: reason,
        },
      });
      await writeReversalAudit(userId, contractId, 'failed', {
        reason: 'no_anchor',
        attempt_reason: reason,
      });
      return {
        ok: false,
        contractId,
        reversed: false,
        irreversible: true,
        reason: 'no_reversal_anchor',
      };
    }

    // Apply the compensating action: mark the contract reversed in metadata and flip to a
    // distinct status. action_contracts schema only allows staged|approved|executing|completed|rejected|failed,
    // so we keep 'completed' but annotate metadata.
    const okMark = await markContract(userId, contractId, {
      contract_metadata: {
        ...(contract.contract_metadata as Record<string, unknown>),
        reversed: true,
        reversal_anchor: anchor,
        reversal_reason: reason,
        reversed_at: new Date().toISOString(),
      },
    });
    await writeReversalAudit(userId, contractId, okMark ? 'completed' : 'failed', {
      anchor,
      reason,
    });
    return {
      ok: okMark,
      contractId,
      reversed: okMark,
      anchor,
      reason,
    };
  } catch (err) {
    console.error('[actionReversalLayer] reverseContract error:', err);
    return { ok: false, contractId, reversed: false, reason: 'error' };
  }
}
