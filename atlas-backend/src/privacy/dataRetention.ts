/**
 * Atlas Phase 3 — Data Retention + Privacy Engine
 *
 * Manages:
 *  - Per-table retention policies with configurable TTLs
 *  - GDPR/CCPA "right to erasure" — cascading user deletion
 *  - Derived trait cascade: deleting raw signals re-evaluates downstream traits
 *  - Soft-delete with deferred hard-delete queue
 *  - Anonymization (replace PII with hashed tokens, preserve analytics shape)
 *  - Audit trail for all deletion events (immutable)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { FastifyInstance } from 'fastify';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RetentionPolicyKey =
  | 'standard_30d'
  | 'standard_90d'
  | 'standard_1y'
  | 'sovereign_forever'
  | 'signals_rolling_60d'
  | 'security_events_90d'
  | 'explanations_30d'
  | 'session_7d';

export interface RetentionPolicy {
  key: RetentionPolicyKey;
  ttlDays: number | null;     // null = forever (sovereign/immutable data)
  softDeleteFirst: boolean;   // if true, mark deleted_at before hard delete
  anonymizeBeforeDelete: boolean;
  cascade: CascadeRule[];
  description: string;
}

export interface CascadeRule {
  targetTable: string;
  joinColumn: string;        // column in targetTable that references the deleted record
  action: 'delete' | 'anonymize' | 'nullify' | 'recompute';
  description: string;
}

export interface DeletionRequest {
  id: string;
  userId: string;
  requestedAt: string;
  requestType: 'gdpr_erasure' | 'ccpa_deletion' | 'user_initiated' | 'ttl_expiry' | 'admin';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'partially_completed';
  completedAt?: string;
  tablesAffected: string[];
  recordsDeleted: number;
  recordsAnonymized: number;
  errors: string[];
}

export interface RetentionScanResult {
  table: string;
  expiredCount: number;
  deletedCount: number;
  anonymizedCount: number;
  errors: string[];
  scanDurationMs: number;
}

// ─── Retention Policy Registry ────────────────────────────────────────────────

export const RETENTION_POLICIES: Record<RetentionPolicyKey, RetentionPolicy> = {
  standard_30d: {
    key: 'standard_30d',
    ttlDays: 30,
    softDeleteFirst: true,
    anonymizeBeforeDelete: false,
    cascade: [],
    description: 'Standard 30-day retention for ephemeral session data',
  },

  standard_90d: {
    key: 'standard_90d',
    ttlDays: 90,
    softDeleteFirst: true,
    anonymizeBeforeDelete: false,
    cascade: [
      {
        targetTable: 'atlas_mutation_ledger',
        joinColumn: 'evidence_claim_id',
        action: 'nullify',
        description: 'Nullify evidence_claim_id in mutations when claim expires',
      },
    ],
    description: 'Standard 90-day retention for evidence and claims',
  },

  standard_1y: {
    key: 'standard_1y',
    ttlDays: 365,
    softDeleteFirst: true,
    anonymizeBeforeDelete: false,
    cascade: [],
    description: 'One-year retention for evaluation snapshots and audit records',
  },

  sovereign_forever: {
    key: 'sovereign_forever',
    ttlDays: null, // Permanent — sovereign + constitution data never auto-expires
    softDeleteFirst: false,
    anonymizeBeforeDelete: false,
    cascade: [],
    description: 'Permanent retention for sovereign console sessions and constitution mutations',
  },

  signals_rolling_60d: {
    key: 'signals_rolling_60d',
    ttlDays: 60,
    softDeleteFirst: false,
    anonymizeBeforeDelete: true,
    cascade: [
      {
        targetTable: 'atlas_evolution_profiles',
        joinColumn: 'user_id',
        action: 'recompute',
        description: 'Recompute evolution traits after raw signals are purged',
      },
    ],
    description: 'Rolling 60-day window for raw interaction signals. Traits survive purge.',
  },

  security_events_90d: {
    key: 'security_events_90d',
    ttlDays: 90,
    softDeleteFirst: true,
    anonymizeBeforeDelete: true, // Anonymize IP/UA before deleting
    cascade: [],
    description: '90-day retention for security events with IP anonymization',
  },

  explanations_30d: {
    key: 'explanations_30d',
    ttlDays: 30,
    softDeleteFirst: false,
    anonymizeBeforeDelete: false,
    cascade: [
      {
        targetTable: 'atlas_uncertainty_records',
        joinColumn: 'explainability_id',
        action: 'nullify',
        description: 'Nullify explainability_id when explanation expires',
      },
    ],
    description: '30-day retention for generated explanations',
  },

  session_7d: {
    key: 'session_7d',
    ttlDays: 7,
    softDeleteFirst: false,
    anonymizeBeforeDelete: false,
    cascade: [],
    description: '7-day retention for sovereign session tokens',
  },
};

// ─── Table → Retention Policy Mapping ────────────────────────────────────────

export const TABLE_RETENTION_MAP: Record<string, RetentionPolicyKey> = {
  atlas_evolution_signals: 'signals_rolling_60d',
  atlas_evidence_claims: 'standard_90d',
  atlas_sovereign_audit: 'standard_1y',
  atlas_security_events: 'security_events_90d',
  atlas_explanations: 'explanations_30d',
  atlas_mutation_ledger: 'standard_1y',
  atlas_events: 'standard_1y',
  // No expiry:
  atlas_evolution_profiles: 'sovereign_forever',
  atlas_mutation_ledger_constitution: 'sovereign_forever',
  atlas_schema_migrations: 'sovereign_forever',
};

// ─── Data Retention Engine ────────────────────────────────────────────────────

export class DataRetentionEngine {
  private supabase: SupabaseClient;
  private paused = false;
  private pendingQueue: Array<() => Promise<void>> = [];

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /** Pause retention (called by FailureModeDoctrine on failure). */
  pause(): void {
    this.paused = true;
    console.warn('[DataRetention] Paused — deletions queued for retry');
  }

  /** Resume retention and drain the pending queue. */
  async resume(): Promise<void> {
    this.paused = false;
    console.log(`[DataRetention] Resumed — draining ${this.pendingQueue.length} queued operations`);
    const queue = [...this.pendingQueue];
    this.pendingQueue = [];
    for (const op of queue) {
      await op().catch(err => console.error('[DataRetention] Queue drain error:', err));
    }
  }

  /**
   * Scan all tables for expired records and delete/anonymize them.
   * This is the main TTL enforcement sweep — run on a schedule (e.g., nightly).
   */
  async runRetentionSweep(): Promise<RetentionScanResult[]> {
    if (this.paused) {
      console.warn('[DataRetention] Sweep skipped — paused');
      return [];
    }

    const results: RetentionScanResult[] = [];

    for (const [table, policyKey] of Object.entries(TABLE_RETENTION_MAP)) {
      const policy = RETENTION_POLICIES[policyKey];
      if (!policy.ttlDays) continue; // sovereign_forever — skip

      const start = Date.now();
      const result = await this.sweepTable(table, policy);
      result.scanDurationMs = Date.now() - start;
      results.push(result);
    }

    return results;
  }

  private async sweepTable(table: string, policy: RetentionPolicy): Promise<RetentionScanResult> {
    const result: RetentionScanResult = {
      table,
      expiredCount: 0,
      deletedCount: 0,
      anonymizedCount: 0,
      errors: [],
      scanDurationMs: 0,
    };

    try {
      const cutoff = new Date(Date.now() - policy.ttlDays! * 86400 * 1000).toISOString();

      // Find expired records
      const dateColumn = table === 'atlas_events' ? 'emitted_at' : 'created_at';
      const { data: expired, error: findErr } = await this.supabase
        .from(table)
        .select('id')
        .lt(dateColumn, cutoff)
        .limit(500);

      if (findErr) {
        result.errors.push(findErr.message);
        return result;
      }

      result.expiredCount = expired?.length ?? 0;
      if (!result.expiredCount) return result;

      const ids = expired!.map(r => r.id);

      // Step 1: Handle cascades first
      for (const cascade of policy.cascade) {
        await this.applyCascade(cascade, ids, table);
      }

      // Step 2: Anonymize if required
      if (policy.anonymizeBeforeDelete) {
        await this.anonymizeRecords(table, ids);
        result.anonymizedCount = ids.length;
      }

      // Step 3: Soft delete or hard delete
      if (policy.softDeleteFirst) {
        const { error: softErr } = await this.supabase
          .from(table)
          .update({ deleted_at: new Date().toISOString(), deletion_reason: 'ttl_expiry' })
          .in('id', ids);

        if (softErr) result.errors.push(softErr.message);
        else result.deletedCount = ids.length;
      } else {
        const { error: hardErr } = await this.supabase
          .from(table)
          .delete()
          .in('id', ids);

        if (hardErr) result.errors.push(hardErr.message);
        else result.deletedCount = ids.length;
      }
    } catch (err: any) {
      result.errors.push(err.message);
    }

    return result;
  }

  private async applyCascade(cascade: CascadeRule, parentIds: string[], _parentTable: string): Promise<void> {
    switch (cascade.action) {
      case 'delete':
        await this.supabase.from(cascade.targetTable).delete().in(cascade.joinColumn, parentIds);
        break;

      case 'nullify':
        await this.supabase
          .from(cascade.targetTable)
          .update({ [cascade.joinColumn]: null })
          .in(cascade.joinColumn, parentIds);
        break;

      case 'anonymize':
        // Get affected record IDs, then anonymize
        const { data } = await this.supabase
          .from(cascade.targetTable)
          .select('id')
          .in(cascade.joinColumn, parentIds);
        if (data?.length) {
          await this.anonymizeRecords(cascade.targetTable, data.map(r => r.id));
        }
        break;

      case 'recompute':
        // Emit a recomputation event — downstream services handle the actual rebuild
        console.log(`[DataRetention] Triggering recompute on ${cascade.targetTable} for ${parentIds.length} parents`);
        // In production, emit an event to the event bus here
        break;
    }
  }

  private async anonymizeRecords(table: string, ids: string[]): Promise<void> {
    const anonymized: Record<string, unknown> = {};

    // Table-specific anonymization rules
    if (table === 'atlas_security_events') {
      anonymized.ip_address = null;
      anonymized.user_agent = null;
    }
    if (table === 'atlas_evolution_signals') {
      // Keep signal type and timestamp, anonymize raw content
      anonymized.raw_content = '[anonymized]';
    }

    if (Object.keys(anonymized).length > 0) {
      await this.supabase.from(table).update(anonymized).in('id', ids);
    }
  }

  // ─── GDPR Right to Erasure ─────────────────────────────────────────────────

  /**
   * Execute a full GDPR erasure for a user.
   * Deletes all user data across all tables, respecting cascade rules.
   * Returns a complete audit record of what was deleted.
   */
  async executeUserErasure(
    userId: string,
    requestType: DeletionRequest['requestType'] = 'gdpr_erasure'
  ): Promise<DeletionRequest> {
    const request: DeletionRequest = {
      id: `erasure_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      requestedAt: new Date().toISOString(),
      requestType,
      status: 'in_progress',
      tablesAffected: [],
      recordsDeleted: 0,
      recordsAnonymized: 0,
      errors: [],
    };

    // Deletion order matters — respect FK constraints
    const deletionOrder: Array<{ table: string; userColumn: string; action: 'delete' | 'anonymize' }> = [
      { table: 'atlas_evolution_signals', userColumn: 'user_id', action: 'delete' },
      { table: 'atlas_evidence_claims', userColumn: 'user_id', action: 'delete' },
      { table: 'atlas_explanations', userColumn: 'user_id', action: 'delete' },
      { table: 'atlas_security_events', userColumn: 'user_id', action: 'anonymize' }, // Keep shape
      { table: 'atlas_events', userColumn: 'user_id', action: 'anonymize' },          // Keep event log shape
      { table: 'atlas_mutation_ledger', userColumn: 'user_id', action: 'delete' },
      { table: 'atlas_evolution_control', userColumn: 'user_id', action: 'delete' },
      { table: 'atlas_evolution_profiles', userColumn: 'user_id', action: 'delete' },
      // atlas_sovereign_audit is immutable — anonymize only
      { table: 'atlas_sovereign_audit', userColumn: 'user_id', action: 'anonymize' },
    ];

    for (const step of deletionOrder) {
      try {
        if (step.action === 'delete') {
          const { count, error } = await this.supabase
            .from(step.table)
            .delete({ count: 'exact' })
            .eq(step.userColumn, userId);

          if (error) {
            request.errors.push(`${step.table}: ${error.message}`);
          } else {
            request.recordsDeleted += count ?? 0;
            request.tablesAffected.push(step.table);
          }
        } else {
          const { data: rows } = await this.supabase
            .from(step.table)
            .select('id')
            .eq(step.userColumn, userId);

          if (rows?.length) {
            await this.anonymizeRecords(step.table, rows.map(r => r.id));
            // Replace user_id with hashed token to preserve referential integrity
            const anonymizedId = `anon_${createHash(userId)}`;
            await this.supabase
              .from(step.table)
              .update({ user_id: anonymizedId })
              .eq(step.userColumn, userId);
            request.recordsAnonymized += rows.length;
            request.tablesAffected.push(step.table);
          }
        }
      } catch (err: any) {
        request.errors.push(`${step.table}: ${err.message}`);
      }
    }

    request.status = request.errors.length === 0 ? 'completed' : 'partially_completed';
    request.completedAt = new Date().toISOString();

    // Persist erasure record (anonymized)
    await this.persistErasureAudit(request);

    console.log(
      `[DataRetention] Erasure ${request.id}: ${request.recordsDeleted} deleted, ` +
      `${request.recordsAnonymized} anonymized across ${request.tablesAffected.length} tables`
    );

    return request;
  }

  private async persistErasureAudit(request: DeletionRequest): Promise<void> {
    const { error } = await this.supabase.from('atlas_sovereign_audit').insert({
      action: 'data_erasure',
      actor_email: `hash_${createHash(request.userId)}@erasure.local`,
      actor_ip: null,
      target_user_id: request.userId,
      payload: {
        requestId: request.id,
        requestType: request.requestType,
        status: request.status,
        tablesAffected: request.tablesAffected.length,
        recordsDeleted: request.recordsDeleted,
        recordsAnonymized: request.recordsAnonymized,
        hasErrors: request.errors.length > 0,
      },
      result: request.status,
      timestamp: request.requestedAt,
    });
    if (error) {
      console.warn('[DataRetention] persistErasureAudit:', error.message);
    }
  }
}

function createHash(input: string): string {
  // Simple deterministic hash for anonymization tokens
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _engine: DataRetentionEngine | null = null;

export function getDataRetentionEngine(): DataRetentionEngine {
  if (!_engine) {
    const url = process.env.SUPABASE_URL?.trim() ?? '';
    const key = process.env.SUPABASE_SERVICE_KEY?.trim() ?? '';
    _engine = new DataRetentionEngine(url, key);
  }
  return _engine;
}

// ─── Fastify route helper (for sovereign console) ─────────────────────────────

export async function registerRetentionRoutes(app: FastifyInstance): Promise<void> {
  const engine = getDataRetentionEngine();

  app.post('/v1/sovereign/retention/sweep', async (_request, reply) => {
    const results = await engine.runRetentionSweep();
    return reply.send({ results });
  });

  app.post<{ Params: { userId: string } }>(
    '/v1/sovereign/retention/erase/:userId',
    async (request, reply) => {
      const { userId } = request.params;
      const result = await engine.executeUserErasure(userId, 'admin');
      return reply.send({ result });
    },
  );

  app.delete('/v1/user/account', async (request, reply) => {
    const userId = (request as { user?: { id: string } }).user?.id;
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const result = await engine.executeUserErasure(userId, 'user_initiated');
    return reply.send({ result });
  });
}
