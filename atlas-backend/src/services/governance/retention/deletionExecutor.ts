/**
 * Deletion Executor — Phase 4 §5
 *
 * Scheduled daily data retention sweep (03:00 UTC). Deletes rows past
 * their retention window while respecting legal holds:
 * - atlas_sovereign_audit: rows older than 2 years
 * - atlas_schema_migrations: successful rows older than 1 year (filtered by
 *   completed_at, matching the column the governance/migration runner writes)
 * - atlas_evolution_signals: rows older than 90 days
 *
 * Idempotent by date — skips if a run already exists for the target date.
 */

import { randomUUID } from 'node:crypto';
import { getDb } from '../../../db/sqlite.js';
import { hasHold } from './legalHoldRegistry.js';
import { logRetentionEvent } from './retentionAuditTrail.js';

export interface TableDeletionResult {
  table: string;
  deleted: number;
  held: number;
  errors: string[];
}

export interface DeletionReport {
  date: string;
  tables: TableDeletionResult[];
  totalDeleted: number;
}

interface RetentionRule {
  table: string;
  dateColumn: string;
  idColumn: string;
  maxAgeDays: number;
  statusFilter?: { column: string; value: string };
}

const RETENTION_RULES: RetentionRule[] = [
  {
    table: 'atlas_sovereign_audit',
    dateColumn: 'created_at',
    idColumn: 'id',
    maxAgeDays: 730, // 2 years
  },
  {
    // Align with governance/migration runner: it writes status='success' and
    // populates completed_at (not applied_at). applied_at is kept nullable on
    // atlas_schema_migrations for legacy rows only — never written by the runner.
    table: 'atlas_schema_migrations',
    dateColumn: 'completed_at',
    idColumn: 'id',
    maxAgeDays: 365, // 1 year
    statusFilter: { column: 'status', value: 'success' },
  },
  {
    table: 'atlas_evolution_signals',
    dateColumn: 'created_at',
    idColumn: 'id',
    maxAgeDays: 90,
  },
];

let scheduledInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Schedule daily deletion at 03:00 UTC using setInterval-based approximation.
 */
export function scheduleDailyDeletion(): void {
  if (scheduledInterval) return;

  const runIfDue = (): void => {
    const now = new Date();
    if (now.getUTCHours() === 3 && now.getUTCMinutes() === 0) {
      void runDeletion(now);
    }
  };

  // Check every 60 seconds whether it's 03:00 UTC
  scheduledInterval = setInterval(runIfDue, 60_000);
}

/**
 * Run the deletion sweep for a given date. Idempotent — skips if already
 * executed for this date (checks `atlas_deletion_runs`).
 */
export async function runDeletion(date: Date): Promise<DeletionReport> {
  const db = getDb();
  const dateKey = date.toISOString().slice(0, 10); // YYYY-MM-DD

  // Idempotency check
  const existing = db.prepare(
    `SELECT report_json FROM atlas_deletion_runs WHERE run_date = ?`
  ).get(dateKey) as { report_json: string } | undefined;

  if (existing) {
    return JSON.parse(existing.report_json) as DeletionReport;
  }

  const tables: TableDeletionResult[] = [];
  let totalDeleted = 0;

  for (const rule of RETENTION_RULES) {
    const result = await deleteForRule(rule, date);
    tables.push(result);
    totalDeleted += result.deleted;
  }

  const report: DeletionReport = { date: dateKey, tables, totalDeleted };

  db.prepare(
    `INSERT INTO atlas_deletion_runs (id, run_date, report_json, created_at) VALUES (?, ?, ?, ?)`
  ).run(randomUUID(), dateKey, JSON.stringify(report), new Date().toISOString());

  await logRetentionEvent({
    type: 'DELETION',
    actorId: 'system:retention-executor',
    detail: `Daily retention sweep: ${totalDeleted} rows deleted across ${tables.length} tables`,
  });

  return report;
}

async function deleteForRule(rule: RetentionRule, referenceDate: Date): Promise<TableDeletionResult> {
  const db = getDb();
  const cutoff = new Date(referenceDate.getTime() - rule.maxAgeDays * 24 * 60 * 60 * 1000);
  const cutoffIso = cutoff.toISOString();

  let deleted = 0;
  let held = 0;
  const errors: string[] = [];

  try {
    // Build WHERE clause
    const conditions = [`${rule.dateColumn} < ?`];
    const params: unknown[] = [cutoffIso];

    if (rule.statusFilter) {
      conditions.push(`${rule.statusFilter.column} = ?`);
      params.push(rule.statusFilter.value);
    }

    const where = conditions.join(' AND ');
    const candidates = db.prepare(
      `SELECT ${rule.idColumn} AS id FROM ${rule.table} WHERE ${where}`
    ).all(...params) as { id: string }[];

    for (const candidate of candidates) {
      try {
        const isHeld = await hasHold(rule.table, candidate.id);
        if (isHeld) {
          held++;
          continue;
        }
        db.prepare(`DELETE FROM ${rule.table} WHERE ${rule.idColumn} = ?`).run(candidate.id);
        deleted++;
      } catch (err) {
        errors.push(`Failed to delete ${rule.table}/${candidate.id}: ${String(err)}`);
      }
    }
  } catch (err) {
    errors.push(`Failed to query ${rule.table}: ${String(err)}`);
  }

  return { table: rule.table, deleted, held, errors };
}

/**
 * Get the last deletion run report (if any) and the next scheduled time.
 */
export function getRetentionStatus(): { lastRun: DeletionReport | null; nextRunUtc: string } {
  const db = getDb();
  const last = db.prepare(
    `SELECT report_json FROM atlas_deletion_runs ORDER BY run_date DESC LIMIT 1`
  ).get() as { report_json: string } | undefined;

  const now = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + (now.getUTCHours() >= 3 ? 1 : 0),
    3, 0, 0
  ));

  return {
    lastRun: last ? (JSON.parse(last.report_json) as DeletionReport) : null,
    nextRunUtc: next.toISOString(),
  };
}
