import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clampConfidence,
  mapSqliteToTruthClaim,
  normalizeStatus,
  type SqliteTruthEntryRow,
} from '../truthLedgerService.js';
import { deterministicUuid } from '../../../utils/uuidMapping.js';

function withEnv<T>(
  name: string,
  value: string | undefined,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const prev = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  const restore = () => {
    if (prev === undefined) delete process.env[name];
    else process.env[name] = prev;
  };
  try {
    const out = fn();
    if (out instanceof Promise) return out.finally(restore);
    restore();
    return out;
  } catch (err) {
    restore();
    throw err;
  }
}

const baseRow: SqliteTruthEntryRow = {
  id: 'sqlite-truth-1',
  user_id: '00000000-0000-4000-8000-000000000001',
  statement: 'The release ships Friday.',
  status: 'supported',
  confidence: 0.82,
  evidence_json: '{"sources":["spec.md","meeting-notes"]}',
  superseded_by_id: null,
  constitution_ref: null,
  created_at: '2026-04-01T12:00:00.000Z',
  updated_at: '2026-04-02T08:30:00.000Z',
};

test('normalizeStatus passes through known values', () => {
  for (const s of ['proposed', 'supported', 'contested', 'stale', 'retired']) {
    assert.equal(normalizeStatus(s), s);
  }
});

test('normalizeStatus maps unknowns to proposed', () => {
  assert.equal(normalizeStatus('verified'), 'proposed');
  assert.equal(normalizeStatus('superseded'), 'proposed');
  assert.equal(normalizeStatus(null), 'proposed');
  assert.equal(normalizeStatus(undefined), 'proposed');
  assert.equal(normalizeStatus(''), 'proposed');
});

test('clampConfidence clamps into [0, 1]', () => {
  assert.equal(clampConfidence(-0.5), 0);
  assert.equal(clampConfidence(0), 0);
  assert.equal(clampConfidence(0.5), 0.5);
  assert.equal(clampConfidence(1), 1);
  assert.equal(clampConfidence(1.7), 1);
});

test('clampConfidence defaults non-numeric inputs to 0.5', () => {
  assert.equal(clampConfidence(null), 0.5);
  assert.equal(clampConfidence(undefined), 0.5);
  assert.equal(clampConfidence(Number.NaN), 0.5);
});

test('mapSqliteToTruthClaim emits the canonical truth_claims payload', () => {
  const payload = mapSqliteToTruthClaim(baseRow);
  assert.equal(payload.id, deterministicUuid('truth_entries', baseRow.id));
  assert.equal(payload.user_id, baseRow.user_id);
  assert.equal(payload.claim_text, baseRow.statement);
  assert.equal(payload.status, 'supported');
  assert.equal(payload.confidence_score, 0.82);
  assert.equal(payload.evidence_score, 0);
  assert.equal(payload.claim_type, null);
  assert.equal(payload.domain, null);
  assert.equal(payload.created_at, baseRow.created_at);
  assert.equal(payload.updated_at, baseRow.updated_at);
});

test('mapSqliteToTruthClaim folds evidence into claim_metadata.evidence', () => {
  const payload = mapSqliteToTruthClaim(baseRow);
  const meta = payload.claim_metadata as Record<string, unknown>;
  assert.deepEqual(meta.evidence, { sources: ['spec.md', 'meeting-notes'] });
});

test('mapSqliteToTruthClaim handles non-JSON evidence by storing the raw string', () => {
  const payload = mapSqliteToTruthClaim({ ...baseRow, evidence_json: 'not-json' });
  const meta = payload.claim_metadata as Record<string, unknown>;
  assert.equal(meta.evidence, 'not-json');
});

test('mapSqliteToTruthClaim coerces unknown status to proposed', () => {
  const payload = mapSqliteToTruthClaim({ ...baseRow, status: 'superseded' });
  assert.equal(payload.status, 'proposed');
});

test('mapSqliteToTruthClaim clamps out-of-range confidence', () => {
  const high = mapSqliteToTruthClaim({ ...baseRow, confidence: 1.42 });
  assert.equal(high.confidence_score, 1);
  const low = mapSqliteToTruthClaim({ ...baseRow, confidence: -0.1 });
  assert.equal(low.confidence_score, 0);
});

test('mapSqliteToTruthClaim maps superseded_by_id via deterministic UUID', () => {
  const payload = mapSqliteToTruthClaim({ ...baseRow, superseded_by_id: 'other-row' });
  const meta = payload.claim_metadata as Record<string, unknown>;
  assert.equal(meta.superseded_by_id, deterministicUuid('truth_entries', 'other-row'));
});

test('mapSqliteToTruthClaim stashes constitution_ref under claim_metadata', () => {
  const payload = mapSqliteToTruthClaim({ ...baseRow, constitution_ref: 'clause-7' });
  const meta = payload.claim_metadata as Record<string, unknown>;
  assert.equal(meta.constitution_ref, 'clause-7');
});

test('mapSqliteToTruthClaim is reproducible — same input yields the same UUID', () => {
  const a = mapSqliteToTruthClaim(baseRow);
  const b = mapSqliteToTruthClaim(baseRow);
  assert.equal(a.id, b.id);
});

test('listTruthEntriesSync throws in supabase mode (must use the async API)', async () => {
  const mod = await import('../truthLedgerService.js');
  await withEnv('TRUTH_STORE', 'supabase', () => {
    assert.throws(
      () => mod.listTruthEntriesSync('user-1', 5),
      /TRUTH_STORE=supabase requires the async API/,
    );
  });
});

test('listTruthEntriesAsync reads from Supabase in supabase mode (returns [] when REST unconfigured)', async () => {
  const mod = await import('../truthLedgerService.js');
  // SUPABASE_URL is unset in the test environment, so supabaseRest returns
  // { ok: false } and the service yields [].
  await withEnv('TRUTH_STORE', 'supabase', async () => {
    const rows = await mod.listTruthEntriesAsync('user-1', 5);
    assert.deepEqual(rows, []);
  });
});
