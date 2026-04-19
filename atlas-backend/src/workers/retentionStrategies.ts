/**
 * retentionStrategies.ts — Phase 0.99: Pure helpers for the retention enforcer.
 */

export type RetentionStrategy = 'delete' | 'archive' | 'anonymize' | 'tombstone';

export interface RetentionPolicy {
  id: string;
  user_id: string;
  resource_table: string;
  retention_days: number;
  archive_strategy: RetentionStrategy;
  policy_metadata: Record<string, unknown>;
  active: boolean;
}

export interface RetentionAuditRow {
  id: string;
  user_id: string;
  operation: 'export' | 'backup' | 'restore' | 'delete_all';
  resource_scope: string;
  row_count: number;
  status: 'completed' | 'failed';
  initiated_by: string;
  backup_metadata: Record<string, unknown>;
  started_at: string;
  completed_at: string;
  created_at: string;
}

/** Pure: compute the cutoff timestamp for a retention window. */
export function computeRetentionCutoff(
  maxAgeDays: number,
  nowMs: number = Date.now(),
): Date {
  const clampedDays = Number.isFinite(maxAgeDays) && maxAgeDays >= 0 ? maxAgeDays : 0;
  return new Date(nowMs - clampedDays * 24 * 60 * 60 * 1000);
}

/** Pure: build an anonymization patch — overwrite listed PII fields with `[REDACTED]`, preserve others. */
export function buildAnonymizationPatch(
  row: Record<string, unknown>,
  piiFields: string[],
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of piiFields) {
    if (field in row) patch[field] = '[REDACTED]';
  }
  patch['anonymized_at'] = new Date().toISOString();
  return patch;
}

/** Pure: format one audit row describing a retention policy execution. */
export function formatRetentionAuditRow(
  policy: RetentionPolicy,
  recordsAffected: number,
  success: boolean,
  idGenerator: () => string = () =>
    '00000000-0000-4000-a000-000000000000',
): RetentionAuditRow {
  const now = new Date().toISOString();
  return {
    id: idGenerator(),
    user_id: policy.user_id,
    operation: policy.archive_strategy === 'delete' ? 'delete_all' : 'backup',
    resource_scope: policy.resource_table,
    row_count: recordsAffected,
    status: success ? 'completed' : 'failed',
    initiated_by: 'retention_enforcer',
    backup_metadata: {
      kind: 'retention_enforcement',
      policy_id: policy.id,
      strategy: policy.archive_strategy,
      retention_days: policy.retention_days,
      policy_metadata: policy.policy_metadata ?? {},
    },
    started_at: now,
    completed_at: now,
    created_at: now,
  };
}

/** Pure: should the enforcer touch this table? Guards against invalid identifiers. */
export function isValidTableName(name: string): boolean {
  return /^[a-z_][a-z0-9_]{0,62}$/i.test(name);
}
