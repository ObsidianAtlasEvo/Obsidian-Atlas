/**
 * actionContractService.ts — Phase 0.985–0.99: Action contracts (federated action gateway).
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';

export type ActionStatus =
  | 'staged'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'rejected'
  | 'failed';
export type ActionRisk = 'low' | 'medium' | 'high' | 'critical';
export type ActionReversibility =
  | 'reversible'
  | 'partially_reversible'
  | 'irreversible';

export interface ActionContractRow {
  id: string;
  user_id: string;
  action_type: string;
  target: string;
  payload: Record<string, unknown>;
  status: ActionStatus;
  risk_class: ActionRisk;
  reversibility: ActionReversibility;
  contract_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  executed_at: string | null;
}

export interface ActionContractCreateInput {
  action_type: string;
  target: string;
  payload?: Record<string, unknown>;
  status?: ActionStatus;
  risk_class?: ActionRisk;
  reversibility?: ActionReversibility;
  contract_metadata?: Record<string, unknown>;
}

export async function createActionContract(
  userId: string,
  data: ActionContractCreateInput,
): Promise<ActionContractRow | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const id = randomUUID();
    const now = new Date().toISOString();
    const reversibility = data.reversibility ?? 'reversible';
    const risk = data.risk_class ?? computeRiskClass(reversibility, data.target);
    const body = {
      id,
      user_id: userId,
      action_type: data.action_type,
      target: data.target,
      payload: data.payload ?? {},
      status: data.status ?? 'staged',
      risk_class: risk,
      reversibility,
      contract_metadata: data.contract_metadata ?? {},
      created_at: now,
      updated_at: now,
      executed_at: null,
    };
    const result = await supabaseRest<ActionContractRow[]>(
      'POST',
      'action_contracts',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as ActionContractRow;
    }
    return result.data[0] ?? (body as ActionContractRow);
  } catch (err) {
    console.error('[actionContractService] createActionContract error:', err);
    return null;
  }
}

export async function getActionContracts(
  userId: string,
  status?: ActionStatus,
): Promise<ActionContractRow[]> {
  if (!env.memoryLayerEnabled) return [];
  try {
    const statusFilter = status ? `&status=eq.${encodeURIComponent(status)}` : '';
    const result = await supabaseRest<ActionContractRow[]>(
      'GET',
      `action_contracts?user_id=eq.${encodeURIComponent(userId)}${statusFilter}&order=created_at.desc`,
    );
    if (!result.ok || !result.data) return [];
    return result.data;
  } catch (err) {
    console.error('[actionContractService] getActionContracts error:', err);
    return [];
  }
}

export async function approveContract(
  userId: string,
  id: string,
): Promise<boolean> {
  if (!env.memoryLayerEnabled) return false;
  try {
    const result = await supabaseRest(
      'PATCH',
      `action_contracts?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`,
      { status: 'approved', updated_at: new Date().toISOString() },
    );
    return result.ok;
  } catch (err) {
    console.error('[actionContractService] approveContract error:', err);
    return false;
  }
}

export async function rejectContract(
  userId: string,
  id: string,
): Promise<boolean> {
  if (!env.memoryLayerEnabled) return false;
  try {
    const result = await supabaseRest(
      'PATCH',
      `action_contracts?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`,
      { status: 'rejected', updated_at: new Date().toISOString() },
    );
    return result.ok;
  } catch (err) {
    console.error('[actionContractService] rejectContract error:', err);
    return false;
  }
}

/** Pure: compute risk class from reversibility + target nature. */
export function computeRiskClass(
  reversibility: string,
  target: string,
): ActionRisk {
  const external = /\bexternal|remote|public|api|webhook/i.test(target);
  if (reversibility === 'irreversible' && external) return 'critical';
  if (reversibility === 'irreversible') return 'high';
  if (reversibility === 'partially_reversible') return 'medium';
  return 'low';
}

/** Pure: format contract summary. */
export function formatActionSummary(contract: ActionContractRow): string {
  return `${contract.action_type}→${contract.target} [${contract.status}] risk:${contract.risk_class} reversibility:${contract.reversibility}`;
}
