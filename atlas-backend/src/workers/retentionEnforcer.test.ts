/**
 * retentionEnforcer.test.ts — Phase 0.99 tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeRetentionCutoff,
  buildAnonymizationPatch,
  formatRetentionAuditRow,
  isValidTableName,
  type RetentionPolicy,
} from './retentionStrategies.js';
import { runRetentionEnforcer } from './retentionEnforcer.js';

const TEST_POLICY_ID = '123e4567-e89b-42d3-a456-426614174020';
const TEST_USER_ID = '123e4567-e89b-42d3-a456-426614174021';

const makePolicy = (overrides: Partial<RetentionPolicy> = {}): RetentionPolicy => ({
  id: TEST_POLICY_ID,
  user_id: TEST_USER_ID,
  resource_table: 'user_memories',
  retention_days: 30,
  archive_strategy: 'delete',
  policy_metadata: {},
  active: true,
  ...overrides,
});

// ─── computeRetentionCutoff ──────────────────────────────────────────────────

test('computeRetentionCutoff: 30 days => 30 days ago', () => {
  const now = 1_700_000_000_000;
  const cutoff = computeRetentionCutoff(30, now);
  assert.equal(cutoff.getTime(), now - 30 * 24 * 60 * 60 * 1000);
});

test('computeRetentionCutoff: 0 days => now', () => {
  const now = 1_700_000_000_000;
  assert.equal(computeRetentionCutoff(0, now).getTime(), now);
});

test('computeRetentionCutoff: negative coerced to 0', () => {
  const now = 1_700_000_000_000;
  assert.equal(computeRetentionCutoff(-5, now).getTime(), now);
});

// ─── buildAnonymizationPatch ──────────────────────────────────────────────────

test('buildAnonymizationPatch: redacts listed PII fields only', () => {
  const patch = buildAnonymizationPatch({ email: 'x@y.z', name: 'Alice', age: 42 }, ['email', 'name']);
  assert.equal(patch['email'], '[REDACTED]');
  assert.equal(patch['name'], '[REDACTED]');
  assert.equal(patch['age'], undefined);
  assert.ok(typeof patch['anonymized_at'] === 'string');
});

test('buildAnonymizationPatch: missing fields not added', () => {
  const patch = buildAnonymizationPatch({ age: 42 }, ['email']);
  assert.equal(patch['email'], undefined);
});

// ─── formatRetentionAuditRow ──────────────────────────────────────────────────

test('formatRetentionAuditRow: delete strategy => operation=delete_all', () => {
  const row = formatRetentionAuditRow(makePolicy({ archive_strategy: 'delete' }), 5, true, () => TEST_POLICY_ID);
  assert.equal(row.operation, 'delete_all');
  assert.equal(row.status, 'completed');
  assert.equal(row.row_count, 5);
});

test('formatRetentionAuditRow: archive strategy => operation=backup', () => {
  const row = formatRetentionAuditRow(makePolicy({ archive_strategy: 'archive' }), 3, true, () => TEST_POLICY_ID);
  assert.equal(row.operation, 'backup');
});

test('formatRetentionAuditRow: failure => status=failed', () => {
  const row = formatRetentionAuditRow(makePolicy(), 0, false, () => TEST_POLICY_ID);
  assert.equal(row.status, 'failed');
});

// ─── isValidTableName ─────────────────────────────────────────────────────────

test('isValidTableName: rejects SQL-ish garbage', () => {
  assert.equal(isValidTableName(''), false);
  assert.equal(isValidTableName("users; drop table x--"), false);
  assert.equal(isValidTableName('123startsdigit'), false);
});

test('isValidTableName: accepts standard names', () => {
  assert.equal(isValidTableName('user_memories'), true);
  assert.equal(isValidTableName('A'), true);
});

// ─── runRetentionEnforcer (env-gated) ─────────────────────────────────────────

test('runRetentionEnforcer: disabled env flag => skipped', async () => {
  delete process.env['RETENTION_ENFORCER_ENABLED'];
  const r = await runRetentionEnforcer();
  assert.equal(r.skipped, true);
  assert.equal(r.reason, 'disabled');
  assert.equal(r.policiesRun, 0);
});

test('runRetentionEnforcer: enabled w/o supabase => runs but no policies', async () => {
  process.env['RETENTION_ENFORCER_ENABLED'] = 'true';
  try {
    const r = await runRetentionEnforcer();
    assert.equal(r.skipped, undefined);
    assert.equal(r.policiesRun, 0);
    assert.deepEqual(r.errors, []);
  } finally {
    delete process.env['RETENTION_ENFORCER_ENABLED'];
  }
});
