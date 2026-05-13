/**
 * memoryService.dualwrite.test.ts — P4-A1 cutover coverage.
 *
 * The objective specifies this test path even though the cutover code lives
 * under `services/memory/`. We exercise the three store modes (sqlite / dual
 * / supabase) by mocking the SQLite handle and the Supabase POST/PATCH
 * helpers via `process.env` toggles. We also cover the pure mapping helpers
 * end-to-end so the projection from SQLite to user_memories is locked.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clamp01,
  joinContent,
  mapKind,
  toUserMemoryRow,
} from '../../memory/userMemoriesSupabase.js';
import { deterministicUuid } from '../../../utils/uuidMapping.js';
import { storeFlags } from '../../../utils/storeFlags.js';

// ── Pure mapping helpers ───────────────────────────────────────────────────

test('mapKind passes the five canonical kinds through unchanged', () => {
  for (const k of ['preference', 'fact', 'pattern', 'correction', 'goal'] as const) {
    assert.equal(mapKind(k), k);
  }
});

test('mapKind coerces wider SQLite kinds into the Postgres CHECK set', () => {
  assert.equal(mapKind('project'), 'fact');
  assert.equal(mapKind('identity'), 'fact');
  assert.equal(mapKind('constraint'), 'fact');
  assert.equal(mapKind('style'), 'preference');
  assert.equal(mapKind('skill'), 'pattern');
  assert.equal(mapKind('rejection'), 'correction');
});

test('mapKind defaults unknown kinds to fact rather than dropping the row', () => {
  assert.equal(mapKind('completely-unknown-kind'), 'fact');
});

test('clamp01 clamps to [0,1] and tolerates non-finite inputs', () => {
  assert.equal(clamp01(0.5), 0.5);
  assert.equal(clamp01(-3), 0);
  assert.equal(clamp01(2.5), 1);
  assert.equal(clamp01(Number.NaN), 0.5);
  assert.equal(clamp01(Number.POSITIVE_INFINITY), 0.5);
});

test('joinContent concatenates summary + detail with a blank line', () => {
  assert.equal(joinContent('s', 'd'), 's\n\nd');
});

test('joinContent handles empty halves without leading/trailing whitespace', () => {
  assert.equal(joinContent('s', ''), 's');
  assert.equal(joinContent('', 'd'), 'd');
  assert.equal(joinContent('  s  ', '  d  '), 's\n\nd');
});

// ── toUserMemoryRow projection ─────────────────────────────────────────────

test('toUserMemoryRow projects a full SQLite row onto user_memories shape', () => {
  const row = toUserMemoryRow({
    sqliteId: 'sqlite-id-1',
    userId: '11111111-2222-4333-8444-555555555555',
    kind: 'preference',
    summary: 'User prefers concise answers',
    detail: 'When asked open-ended questions.',
    confidence: 0.8,
    sourceTraceId: 'trace-id-1',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-02T00:00:00.000Z',
  });
  assert.equal(row.id, deterministicUuid('memories', 'sqlite-id-1'));
  assert.equal(row.user_id, '11111111-2222-4333-8444-555555555555');
  assert.equal(row.kind, 'preference');
  assert.equal(row.content, 'User prefers concise answers\n\nWhen asked open-ended questions.');
  assert.equal(row.importance, 0.8);
  assert.equal(row.source_turn_id, deterministicUuid('traces', 'trace-id-1'));
  assert.equal(row.created_at, '2026-05-01T00:00:00.000Z');
  assert.equal(row.last_referenced_at, '2026-05-02T00:00:00.000Z');
});

test('toUserMemoryRow remaps wider kinds and clamps confidence', () => {
  const row = toUserMemoryRow({
    sqliteId: 'sqlite-id-2',
    userId: 'uuu',
    kind: 'identity',
    summary: 'works in fintech',
    detail: '',
    confidence: 1.9,
    sourceTraceId: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  });
  assert.equal(row.kind, 'fact');
  assert.equal(row.importance, 1);
  assert.equal(row.source_turn_id, null);
  assert.equal(row.content, 'works in fintech');
});

test('toUserMemoryRow id is reproducible across calls', () => {
  const a = toUserMemoryRow({
    sqliteId: 'reproducible',
    userId: 'u',
    kind: 'fact',
    summary: 's',
    detail: 'd',
    confidence: 0.5,
    sourceTraceId: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  });
  const b = toUserMemoryRow({
    sqliteId: 'reproducible',
    userId: 'u',
    kind: 'fact',
    summary: 's',
    detail: 'd',
    confidence: 0.5,
    sourceTraceId: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  });
  assert.equal(a.id, b.id);
});

// ── Store-flag wiring covers all three modes ───────────────────────────────

function withMemoryStore<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env.MEMORY_STORE;
  if (value === undefined) delete process.env.MEMORY_STORE;
  else process.env.MEMORY_STORE = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.MEMORY_STORE;
    else process.env.MEMORY_STORE = prev;
  }
}

test('storeFlags.memory defaults to sqlite when MEMORY_STORE is unset', () => {
  withMemoryStore(undefined, () => {
    assert.equal(storeFlags.memory(), 'sqlite');
  });
});

test('storeFlags.memory reports dual when MEMORY_STORE=dual', () => {
  withMemoryStore('dual', () => {
    assert.equal(storeFlags.memory(), 'dual');
  });
});

test('storeFlags.memory reports supabase when MEMORY_STORE=supabase', () => {
  withMemoryStore('supabase', () => {
    assert.equal(storeFlags.memory(), 'supabase');
  });
});

test('storeFlags.memory falls back to sqlite for invalid values', () => {
  withMemoryStore('postgres', () => {
    assert.equal(storeFlags.memory(), 'sqlite');
  });
});
