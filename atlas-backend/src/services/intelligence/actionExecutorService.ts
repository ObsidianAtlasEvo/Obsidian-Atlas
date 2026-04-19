/**
 * actionExecutorService.ts — Phase 0.985: Governed action executor.
 *
 * 4-tier approval flow: auto | user_confirm | multi_step | blocked.
 * Approves, rejects, escalates, and auto-approves action contracts.
 * Wraps PATCH writes in safe try/catch; never throws.
 */

import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import type { ActionContractRow } from './actionContractService.js';
import { logGovernanceEvent } from './auditGovernanceService.js';
import { logWatcherEvent } from './watcherFrameworkService.js';

export type RiskTier = 'auto' | 'user_confirm' | 'multi_step' | 'blocked';

export interface ApprovalResult {
  ok: boolean;
  contractId: string;
  status: string;
  tier?: RiskTier;
  reason?: string;
}

/**
 * Pure: classify a contract into one of the 4 governance tiers.
 * - auto: low-risk read/observe, reversible, not external
 * - user_confirm: single write, reversible, scoped
 * - multi_step: multi-system / high-impact / high risk
 * - blocked: irreversible destroy, critical risk, or policy violation
 */
export function classifyRisk(contract: ActionContractRow): RiskTier {
  const external = /\bexternal|remote|public|api|webhook/i.test(contract.target);
  const readLike = /^(read|observe|list|get|fetch|inspect|query)/i.test(contract.action_type);
  const destructive = /^(delete|destroy|wipe|purge|truncate|drop)/i.test(contract.action_type);

  if (contract.risk_class === 'critical') return 'blocked';
  if (contract.reversibility === 'irreversible' && (destructive || external)) return 'blocked';
  if (contract.reversibility === 'irreversible') return 'multi_step';
  if (contract.risk_class === 'high') return 'multi_step';
  const steps = Array.isArray((contract.payload as Record<string, unknown>)?.['steps'])
    ? ((contract.payload as Record<string, unknown>)['steps'] as unknown[]).length
    : 0;
  if (steps > 1) return 'multi_step';
  if (readLike && contract.risk_class === 'low' && contract.reversibility === 'reversible') {
    return 'auto';
  }
  return 'user_confirm';
}

async function patchContract(
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
    console.error('[actionExecutorService] patchContract error:', err);
    return false;
  }
}

async function fetchContract(
  userId: string,
  contractId: string,
): Promise<ActionContractRow | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const result = await supabaseRest<ActionContractRow[]>(
      'GET',
      `action_contracts?id=eq.${encodeURIComponent(contractId)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    );
    if (!result.ok || !result.data || result.data.length === 0) return null;
    return result.data[0] ?? null;
  } catch (err) {
    console.error('[actionExecutorService] fetchContract error:', err);
    return null;
  }
}

export async function approveActionContract(
  userId: string,
  contractId: string,
  tier?: RiskTier,
  approverId?: string,
): Promise<ApprovalResult> {
  try {
    const ok = await patchContract(userId, contractId, { status: 'approved' });
    await logGovernanceEvent(userId, 'approval', {
      actor: approverId ?? 'user',
      target: 'action_contract',
      after_state: { status: 'approved', tier: tier ?? null },
      audit_metadata: { contract_id: contractId, tier: tier ?? null },
    }).catch(() => {});
    return { ok, contractId, status: ok ? 'approved' : 'unchanged', tier };
  } catch (err) {
    console.error('[actionExecutorService] approveActionContract error:', err);
    return { ok: false, contractId, status: 'error' };
  }
}

export async function rejectActionContract(
  userId: string,
  contractId: string,
  reason: string,
): Promise<ApprovalResult> {
  try {
    const ok = await patchContract(userId, contractId, {
      status: 'rejected',
      contract_metadata: { rejected_reason: reason },
    });
    await logGovernanceEvent(userId, 'approval', {
      actor: 'user',
      target: 'action_contract',
      after_state: { status: 'rejected' },
      audit_metadata: { contract_id: contractId, reason },
    }).catch(() => {});
    return { ok, contractId, status: ok ? 'rejected' : 'unchanged', reason };
  } catch (err) {
    console.error('[actionExecutorService] rejectActionContract error:', err);
    return { ok: false, contractId, status: 'error' };
  }
}

export async function escalateActionContract(
  userId: string,
  contractId: string,
  reason: string,
): Promise<ApprovalResult> {
  try {
    // Mark as failed (schema has no 'escalated' — use failed + metadata) and open a watcher event.
    const ok = await patchContract(userId, contractId, {
      status: 'failed',
      contract_metadata: { escalated: true, escalation_reason: reason },
    });
    await logWatcherEvent(userId, {
      watcher_type: 'action_escalation',
      event_class: 'violation',
      severity: 'high',
      description: `Action contract escalated: ${reason}`,
      watcher_metadata: { contract_id: contractId, reason },
    }).catch(() => {});
    return { ok, contractId, status: 'escalated', reason };
  } catch (err) {
    console.error('[actionExecutorService] escalateActionContract error:', err);
    return { ok: false, contractId, status: 'error' };
  }
}

export async function autoApproveIfEligible(
  userId: string,
  contract: ActionContractRow,
): Promise<ApprovalResult> {
  const tier = classifyRisk(contract);
  if (tier !== 'auto') {
    return { ok: false, contractId: contract.id, status: contract.status, tier };
  }
  return approveActionContract(userId, contract.id, 'auto', 'auto_approver');
}

export { fetchContract as _fetchContract };
