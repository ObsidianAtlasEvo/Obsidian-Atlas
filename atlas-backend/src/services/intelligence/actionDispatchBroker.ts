/**
 * actionDispatchBroker.ts — Phase 0.985: Idempotent dispatch broker.
 *
 * - Looks up the action contract; returns cached result if already executed
 * - Retries transient failures up to 3 times with exponential backoff
 * - Handles multi-step partial failure (remaining steps cancelled)
 * - Normalizes every dispatch result into a consistent shape
 * - Writes a platform_backup_audit row per attempt
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import type { ActionContractRow } from './actionContractService.js';
import { _fetchContract } from './actionExecutorService.js';

export interface StepResult {
  index: number;
  name: string;
  status: 'succeeded' | 'failed' | 'cancelled';
  detail?: string;
}

export interface DispatchResult {
  success: boolean;
  contractId: string;
  executedAt: string;
  steps: StepResult[];
  errors: string[];
  attempts: number;
  cached?: boolean;
}

export interface DispatchOptions {
  /** Optional injected dispatcher for a single step (tests can inject success/failure).
   *  Resolves a detail string on success; throws Error on failure. */
  dispatchStep?: (contract: ActionContractRow, step: { index: number; name: string; payload: unknown }) => Promise<string>;
  /** Override backoff for tests (defaults to [500, 1000, 2000]). */
  backoffMsLadder?: number[];
}

const DEFAULT_BACKOFF = [500, 1000, 2000];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractSteps(contract: ActionContractRow): Array<{ index: number; name: string; payload: unknown }> {
  const raw = (contract.payload as Record<string, unknown>)?.['steps'];
  if (!Array.isArray(raw) || raw.length === 0) {
    return [{ index: 0, name: contract.action_type, payload: contract.payload }];
  }
  return raw.map((step, i) => {
    if (step && typeof step === 'object') {
      const s = step as Record<string, unknown>;
      return {
        index: i,
        name: typeof s['name'] === 'string' ? (s['name'] as string) : `${contract.action_type}#${i}`,
        payload: s,
      };
    }
    return { index: i, name: `${contract.action_type}#${i}`, payload: step };
  });
}

async function writeDispatchAudit(
  userId: string,
  contractId: string,
  attempt: number,
  status: 'started' | 'completed' | 'failed',
  meta: Record<string, unknown>,
): Promise<void> {
  if (!env.memoryLayerEnabled) return;
  try {
    const now = new Date().toISOString();
    const body = {
      id: randomUUID(),
      user_id: userId,
      operation: 'export',
      resource_scope: `action_contract:${contractId}`,
      status,
      initiated_by: 'action_dispatch_broker',
      destination: `attempt:${attempt}`,
      backup_metadata: { kind: 'action_dispatch', contract_id: contractId, attempt, ...meta },
      started_at: now,
      completed_at: status !== 'started' ? now : null,
      created_at: now,
    };
    await supabaseRest('POST', 'platform_backup_audit', body);
  } catch (err) {
    console.error('[actionDispatchBroker] writeDispatchAudit error:', err);
  }
}

async function patchStatus(
  userId: string,
  contractId: string,
  status: 'executing' | 'completed' | 'failed',
  extra: Record<string, unknown> = {},
): Promise<void> {
  if (!env.memoryLayerEnabled) return;
  try {
    const patch: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
      ...extra,
    };
    if (status === 'completed' || status === 'failed') {
      patch['executed_at'] = new Date().toISOString();
    }
    await supabaseRest(
      'PATCH',
      `action_contracts?id=eq.${encodeURIComponent(contractId)}&user_id=eq.${encodeURIComponent(userId)}`,
      patch,
    );
  } catch (err) {
    console.error('[actionDispatchBroker] patchStatus error:', err);
  }
}

/** Normalize a dispatch result. Pure. */
export function normalizeDispatchResult(
  contractId: string,
  attempts: number,
  steps: StepResult[],
  errors: string[],
  cached = false,
): DispatchResult {
  const success = errors.length === 0 && steps.every((s) => s.status === 'succeeded');
  return {
    success,
    contractId,
    executedAt: new Date().toISOString(),
    steps,
    errors,
    attempts,
    cached,
  };
}

export async function dispatchContract(
  userId: string,
  contractId: string,
  options: DispatchOptions = {},
): Promise<DispatchResult> {
  const contract = await _fetchContract(userId, contractId);
  if (!contract) {
    return normalizeDispatchResult(contractId, 0, [], ['contract_not_found']);
  }

  // Idempotency: already executed => return cached result
  if (contract.status === 'completed') {
    const cachedMeta = (contract.contract_metadata as Record<string, unknown>)?.['last_dispatch'];
    if (cachedMeta && typeof cachedMeta === 'object') {
      const cached = cachedMeta as Partial<DispatchResult>;
      return {
        success: cached.success ?? true,
        contractId,
        executedAt: contract.executed_at ?? new Date().toISOString(),
        steps: Array.isArray(cached.steps) ? cached.steps : [],
        errors: Array.isArray(cached.errors) ? cached.errors : [],
        attempts: typeof cached.attempts === 'number' ? cached.attempts : 1,
        cached: true,
      };
    }
    return normalizeDispatchResult(contractId, 1, [], [], true);
  }

  if (contract.status === 'rejected' || contract.status === 'failed') {
    return normalizeDispatchResult(contractId, 0, [], [`contract_in_terminal_state:${contract.status}`]);
  }

  const steps = extractSteps(contract);
  const results: StepResult[] = [];
  const errors: string[] = [];
  const backoff = options.backoffMsLadder ?? DEFAULT_BACKOFF;
  let attempts = 0;
  let overallFailed = false;

  await patchStatus(userId, contractId, 'executing');

  for (const step of steps) {
    let stepDone = false;
    let lastErr = '';
    for (let attempt = 0; attempt < 3 && !stepDone; attempt++) {
      attempts++;
      await writeDispatchAudit(userId, contractId, attempts, 'started', {
        step_index: step.index,
        step_name: step.name,
      });
      try {
        const detail = options.dispatchStep
          ? await options.dispatchStep(contract, step)
          : `dispatched:${step.name}`;
        results.push({ index: step.index, name: step.name, status: 'succeeded', detail });
        stepDone = true;
        await writeDispatchAudit(userId, contractId, attempts, 'completed', {
          step_index: step.index,
          step_name: step.name,
        });
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
        await writeDispatchAudit(userId, contractId, attempts, 'failed', {
          step_index: step.index,
          step_name: step.name,
          error: lastErr,
        });
        if (attempt < 2) {
          await delay(backoff[attempt] ?? 0);
        }
      }
    }
    if (!stepDone) {
      results.push({ index: step.index, name: step.name, status: 'failed', detail: lastErr });
      errors.push(`step_${step.index}_failed:${lastErr}`);
      overallFailed = true;
      break;
    }
  }

  // If we failed mid-way, mark all remaining un-run steps as cancelled
  if (overallFailed) {
    const lastIndex = results[results.length - 1]?.index ?? -1;
    for (const step of steps) {
      if (step.index > lastIndex) {
        results.push({ index: step.index, name: step.name, status: 'cancelled' });
      }
    }
  }

  const normalized = normalizeDispatchResult(contractId, attempts, results, errors);

  await patchStatus(
    userId,
    contractId,
    normalized.success ? 'completed' : 'failed',
    {
      contract_metadata: {
        ...(contract.contract_metadata as Record<string, unknown>),
        last_dispatch: normalized,
      },
    },
  );

  return normalized;
}
