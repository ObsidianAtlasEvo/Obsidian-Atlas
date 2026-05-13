import assert from 'node:assert/strict';
import test from 'node:test';

import { deterministicUuid } from '../uuidMapping.js';
import {
  mapSemanticClaimRow,
  parseBackfillArgs,
  type SqliteSemanticClaimRow,
} from '../semanticBackfillMapping.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function baseRow(overrides: Partial<SqliteSemanticClaimRow> = {}): SqliteSemanticClaimRow {
  return {
    id: 'sqlite-claim-1',
    user_id: '00000000-0000-0000-0000-000000000001',
    claim: 'tends to front-load planning before execution is confirmed',
    domain: 'planning',
    confidence: 0.82,
    evidence_memory_ids: JSON.stringify(['mem-1', 'mem-2', 'mem-3']),
    evidence_count: 3,
    times_surfaced: 1,
    last_surfaced_at: '2026-04-30T12:00:00.000Z',
    invalidated_at: null,
    created_at: '2026-04-29T12:00:00.000Z',
    updated_at: '2026-04-30T12:00:00.000Z',
    ...overrides,
  };
}

test('parseBackfillArgs defaults to non-dry-run with batch=500', () => {
  const opts = parseBackfillArgs([]);
  assert.equal(opts.dryRun, false);
  assert.equal(opts.batchSize, 500);
});

test('parseBackfillArgs recognises --dry-run and --batch=N', () => {
  const opts = parseBackfillArgs(['--dry-run', '--batch=42']);
  assert.equal(opts.dryRun, true);
  assert.equal(opts.batchSize, 42);
});

test('parseBackfillArgs ignores non-positive batch values', () => {
  const opts = parseBackfillArgs(['--batch=0']);
  assert.equal(opts.batchSize, 500);
});

test('mapSemanticClaimRow uuid-maps the row id deterministically', () => {
  const out = mapSemanticClaimRow(baseRow());
  assert.match(out.id, UUID_RE);
  assert.equal(out.id, deterministicUuid('semantic_claims', 'sqlite-claim-1'));
});

test('mapSemanticClaimRow remaps each evidence memory id to its memories-namespace uuid', () => {
  const out = mapSemanticClaimRow(baseRow());
  assert.deepEqual(out.evidence_memory_ids, [
    deterministicUuid('memories', 'mem-1'),
    deterministicUuid('memories', 'mem-2'),
    deterministicUuid('memories', 'mem-3'),
  ]);
  assert.equal(out.evidence_count, 3);
});

test('mapSemanticClaimRow converts evidence_memory_ids TEXT JSON to a jsonb-ready array', () => {
  const out = mapSemanticClaimRow(baseRow());
  assert.equal(Array.isArray(out.evidence_memory_ids), true);
});

test('mapSemanticClaimRow tolerates malformed JSON by emitting an empty array', () => {
  const out = mapSemanticClaimRow(baseRow({ evidence_memory_ids: 'not-json' }));
  assert.deepEqual(out.evidence_memory_ids, []);
});

test('mapSemanticClaimRow tolerates non-array JSON payloads', () => {
  const out = mapSemanticClaimRow(
    baseRow({ evidence_memory_ids: JSON.stringify({ unexpected: 'shape' }) }),
  );
  assert.deepEqual(out.evidence_memory_ids, []);
});

test('mapSemanticClaimRow clamps confidence into [0, 1]', () => {
  assert.equal(mapSemanticClaimRow(baseRow({ confidence: -0.4 })).confidence, 0);
  assert.equal(mapSemanticClaimRow(baseRow({ confidence: 1.7 })).confidence, 1);
  assert.equal(mapSemanticClaimRow(baseRow({ confidence: 0.55 })).confidence, 0.55);
});

test('mapSemanticClaimRow passes through scalar columns unchanged', () => {
  const row = baseRow({ domain: 'execution', times_surfaced: 4 });
  const out = mapSemanticClaimRow(row);
  assert.equal(out.user_id, row.user_id);
  assert.equal(out.claim, row.claim);
  assert.equal(out.domain, 'execution');
  assert.equal(out.times_surfaced, 4);
  assert.equal(out.last_surfaced_at, row.last_surfaced_at);
  assert.equal(out.invalidated_at, null);
  assert.equal(out.created_at, row.created_at);
  assert.equal(out.updated_at, row.updated_at);
});

test('mapSemanticClaimRow filters non-string entries inside evidence_memory_ids', () => {
  const out = mapSemanticClaimRow(
    baseRow({ evidence_memory_ids: JSON.stringify(['mem-1', null, 7, 'mem-2']) }),
  );
  assert.deepEqual(out.evidence_memory_ids, [
    deterministicUuid('memories', 'mem-1'),
    deterministicUuid('memories', 'mem-2'),
  ]);
});
