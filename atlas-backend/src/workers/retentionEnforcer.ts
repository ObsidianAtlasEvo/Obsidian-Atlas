/**
 * retentionEnforcer.ts — Phase 0.99: Apply active retention_policies.
 *
 * Never throws. Env-gated. Writes platform_backup_audit row per policy run.
 */

import { randomUUID } from 'node:crypto';
import { supabaseRest } from '../db/supabase.js';
import {
  computeRetentionCutoff,
  buildAnonymizationPatch,
  formatRetentionAuditRow,
  isValidTableName,
  type RetentionPolicy,
  type RetentionStrategy,
} from './retentionStrategies.js';

export interface RetentionReport {
  skipped?: boolean;
  reason?: string;
  policiesRun: number;
  recordsAffected: number;
  errors: string[];
  perPolicy: Array<{ policy_id: string; table: string; strategy: RetentionStrategy; records: number; success: boolean }>;
}

function isEnabled(): boolean {
  const raw = process.env['RETENTION_ENFORCER_ENABLED'];
  if (!raw) return false;
  return raw === 'true' || raw === '1';
}

async function loadActivePolicies(): Promise<RetentionPolicy[]> {
  try {
    const res = await supabaseRest<RetentionPolicy[]>(
      'GET',
      'retention_policies?active=eq.true&order=created_at.asc',
    );
    if (!res.ok || !res.data) return [];
    return res.data;
  } catch (err) {
    console.error('[retentionEnforcer] loadActivePolicies error:', err);
    return [];
  }
}

async function fetchExpiredIds(
  table: string,
  userId: string,
  cutoffIso: string,
): Promise<string[]> {
  try {
    const res = await supabaseRest<Array<{ id: string }>>(
      'GET',
      `${encodeURIComponent(table)}?user_id=eq.${encodeURIComponent(userId)}&created_at=lt.${encodeURIComponent(cutoffIso)}&select=id&limit=500`,
    );
    if (!res.ok || !res.data) return [];
    return res.data.map((r) => r.id).filter((id): id is string => typeof id === 'string');
  } catch (err) {
    console.error(`[retentionEnforcer] fetchExpiredIds(${table}) error:`, err);
    return [];
  }
}

async function deleteIds(table: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  try {
    const idFilter = `in.(${ids.map(encodeURIComponent).join(',')})`;
    const res = await supabaseRest('DELETE', `${encodeURIComponent(table)}?id=${idFilter}`);
    return res.ok ? ids.length : 0;
  } catch (err) {
    console.error(`[retentionEnforcer] deleteIds(${table}) error:`, err);
    return 0;
  }
}

async function patchRowsByIds(
  table: string,
  ids: string[],
  patch: Record<string, unknown>,
): Promise<number> {
  if (ids.length === 0) return 0;
  try {
    const idFilter = `in.(${ids.map(encodeURIComponent).join(',')})`;
    const res = await supabaseRest('PATCH', `${encodeURIComponent(table)}?id=${idFilter}`, patch);
    return res.ok ? ids.length : 0;
  } catch (err) {
    console.error(`[retentionEnforcer] patchRowsByIds(${table}) error:`, err);
    return 0;
  }
}

async function writeAudit(
  policy: RetentionPolicy,
  recordsAffected: number,
  success: boolean,
): Promise<void> {
  try {
    const row = formatRetentionAuditRow(policy, recordsAffected, success, () => randomUUID());
    await supabaseRest('POST', 'platform_backup_audit', row);
  } catch (err) {
    console.error('[retentionEnforcer] writeAudit error:', err);
  }
}

async function applyPolicy(
  policy: RetentionPolicy,
): Promise<{ records: number; success: boolean; error?: string }> {
  const table = policy.resource_table;
  if (!isValidTableName(table)) {
    return { records: 0, success: false, error: `invalid_table:${table}` };
  }
  const cutoff = computeRetentionCutoff(policy.retention_days);
  const ids = await fetchExpiredIds(table, policy.user_id, cutoff.toISOString());
  if (ids.length === 0) {
    return { records: 0, success: true };
  }

  const strategy = policy.archive_strategy;
  let affected = 0;
  let success = true;
  try {
    if (strategy === 'delete') {
      affected = await deleteIds(table, ids);
    } else if (strategy === 'archive') {
      affected = await patchRowsByIds(table, ids, { archived_at: new Date().toISOString() });
    } else if (strategy === 'anonymize') {
      const piiFieldsRaw = (policy.policy_metadata ?? {})['pii_fields'];
      const piiFields = Array.isArray(piiFieldsRaw) ? (piiFieldsRaw as string[]) : [];
      if (piiFields.length === 0) {
        return { records: 0, success: false, error: 'no_pii_fields' };
      }
      const patch = buildAnonymizationPatch({}, piiFields);
      affected = await patchRowsByIds(table, ids, patch);
    } else if (strategy === 'tombstone') {
      affected = await patchRowsByIds(table, ids, {
        deleted_at: new Date().toISOString(),
        tombstoned: true,
      });
    } else {
      return { records: 0, success: false, error: `unknown_strategy:${String(strategy)}` };
    }
    if (affected !== ids.length) success = false;
  } catch (err) {
    console.error(`[retentionEnforcer] applyPolicy(${policy.id}) error:`, err);
    success = false;
  }
  return { records: affected, success };
}

export async function runRetentionEnforcer(): Promise<RetentionReport> {
  if (!isEnabled()) {
    return {
      skipped: true,
      reason: 'disabled',
      policiesRun: 0,
      recordsAffected: 0,
      errors: [],
      perPolicy: [],
    };
  }
  const report: RetentionReport = {
    policiesRun: 0,
    recordsAffected: 0,
    errors: [],
    perPolicy: [],
  };
  try {
    const policies = await loadActivePolicies();
    for (const policy of policies) {
      try {
        const outcome = await applyPolicy(policy);
        await writeAudit(policy, outcome.records, outcome.success);
        report.policiesRun++;
        report.recordsAffected += outcome.records;
        if (outcome.error) report.errors.push(`${policy.id}:${outcome.error}`);
        report.perPolicy.push({
          policy_id: policy.id,
          table: policy.resource_table,
          strategy: policy.archive_strategy,
          records: outcome.records,
          success: outcome.success && !outcome.error,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[retentionEnforcer] policy ${policy.id} failed:`, err);
        report.errors.push(`${policy.id}:${msg}`);
      }
    }
    return report;
  } catch (err) {
    console.error('[retentionEnforcer] runRetentionEnforcer error:', err);
    report.errors.push('enforcer_crashed');
    return report;
  }
}
