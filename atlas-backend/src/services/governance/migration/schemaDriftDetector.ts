/**
 * Schema Drift Detector — compares expected schema (from migration chain
 * definitions) against the actual database table structure. Reports drift
 * severity and blocks boot on CRITICAL mismatches.
 */

import { getDb } from '../../../db/sqlite.js';

/* ───────── Types ───────── */

export type DriftType = 'MISSING_TABLE' | 'MISSING_COLUMN' | 'TYPE_MISMATCH' | 'EXTRA_COLUMN';

export interface DriftedEntity {
  table: string;
  expected: string;
  actual: string;
  type: DriftType;
}

export interface DriftReport {
  drifted: DriftedEntity[];
  severity: 'OK' | 'WARN' | 'CRITICAL';
}

/* ───────── Error class ───────── */

export class SchemaDriftError extends Error {
  constructor(public readonly report: DriftReport) {
    super(
      `CRITICAL schema drift detected: ${report.drifted.length} issue(s) — ${report.drifted.map((d) => `${d.type}(${d.table})`).join(', ')}`,
    );
    this.name = 'SchemaDriftError';
  }
}

/* ───────── Expected schema definition ───────── */

/**
 * Minimal expected columns for the `atlas_schema_migrations` table.
 * This is the source of truth the drift detector validates against.
 */
const EXPECTED_TABLES: Record<string, Record<string, string>> = {
  atlas_schema_migrations: {
    id: 'TEXT',
    domain: 'TEXT',
    version: 'TEXT',
    status: 'TEXT',
    started_at: 'TEXT',
    completed_at: 'TEXT',
    error: 'TEXT',
    checkpoint_id: 'TEXT',
    lock_id: 'TEXT',
    lock_acquired_at: 'TEXT',
    lock_expires_at: 'TEXT',
  },
};

/* ───────── Helpers ───────── */

interface PragmaColumn {
  name: string;
  type: string;
}

function getTableColumns(tableName: string): PragmaColumn[] | null {
  const db = getDb();
  const exists = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).get(tableName) as { name: string } | undefined;

  if (!exists) return null;

  return db.prepare(`PRAGMA table_info(${tableName})`).all() as PragmaColumn[];
}

/* ───────── Public API ───────── */

/**
 * Compare expected schema against actual database structure.
 * Reads the `atlas_schema_migrations` table for expected migration state.
 */
export async function detectDrift(): Promise<DriftReport> {
  const drifted: DriftedEntity[] = [];

  for (const [tableName, expectedCols] of Object.entries(EXPECTED_TABLES)) {
    const actualCols = getTableColumns(tableName);

    if (actualCols === null) {
      drifted.push({
        table: tableName,
        expected: 'table exists',
        actual: 'table missing',
        type: 'MISSING_TABLE',
      });
      continue;
    }

    const actualMap = new Map(actualCols.map((c) => [c.name, c.type.toUpperCase()]));
    const expectedNames = new Set(Object.keys(expectedCols));

    // Check for missing columns and type mismatches
    for (const [colName, expectedType] of Object.entries(expectedCols)) {
      const actualType = actualMap.get(colName);
      if (actualType === undefined) {
        drifted.push({
          table: tableName,
          expected: `column "${colName}" (${expectedType})`,
          actual: 'column missing',
          type: 'MISSING_COLUMN',
        });
      } else if (actualType !== expectedType.toUpperCase()) {
        drifted.push({
          table: tableName,
          expected: `${colName}: ${expectedType}`,
          actual: `${colName}: ${actualType}`,
          type: 'TYPE_MISMATCH',
        });
      }
    }

    // Check for extra columns
    for (const [colName] of actualMap) {
      if (!expectedNames.has(colName)) {
        drifted.push({
          table: tableName,
          expected: 'not present',
          actual: `extra column "${colName}"`,
          type: 'EXTRA_COLUMN',
        });
      }
    }
  }

  const severity = getSeverity({ drifted, severity: 'OK' });
  const report: DriftReport = { drifted, severity };

  if (severity === 'CRITICAL') {
    console.error('[SchemaDriftDetector] CRITICAL drift detected:', JSON.stringify(report, null, 2));
    throw new SchemaDriftError(report);
  }

  return report;
}

/**
 * Determine severity from a drift report.
 * - CRITICAL: any table missing or column type mismatch
 * - WARN: extra columns found
 * - OK: no drift
 */
export function getSeverity(drift: DriftReport): 'OK' | 'WARN' | 'CRITICAL' {
  if (drift.drifted.length === 0) return 'OK';

  const hasCritical = drift.drifted.some(
    (d) => d.type === 'MISSING_TABLE' || d.type === 'TYPE_MISMATCH' || d.type === 'MISSING_COLUMN',
  );
  if (hasCritical) return 'CRITICAL';

  const hasWarn = drift.drifted.some((d) => d.type === 'EXTRA_COLUMN');
  if (hasWarn) return 'WARN';

  return 'OK';
}
