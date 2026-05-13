import assert from 'node:assert/strict';
import test from 'node:test';

import { deterministicUuid } from '../../../utils/uuidMapping.js';
import {
  toPostgresPayload,
  topologicalSortDoctrine,
  type SqliteDoctrineRow,
} from '../doctrineMigrationHelpers.js';

function row(over: Partial<SqliteDoctrineRow>): SqliteDoctrineRow {
  return {
    id: over.id ?? 'a',
    user_id: over.user_id ?? 'u1',
    layer: over.layer ?? 'core',
    title: over.title ?? 't',
    body: over.body ?? 'b',
    priority: over.priority ?? 0,
    immutable: over.immutable ?? 0,
    origin: over.origin ?? 'user',
    version_group_id: over.version_group_id ?? over.id ?? 'a',
    version: over.version ?? 1,
    supersedes_doctrine_id: over.supersedes_doctrine_id ?? null,
    archived_at: over.archived_at ?? null,
    created_at: over.created_at ?? '2026-01-01T00:00:00Z',
    updated_at: over.updated_at ?? '2026-01-01T00:00:00Z',
  };
}

test('topologicalSortDoctrine emits parents before children', () => {
  const rows = [
    row({ id: 'c', supersedes_doctrine_id: 'b' }),
    row({ id: 'a', supersedes_doctrine_id: null }),
    row({ id: 'b', supersedes_doctrine_id: 'a' }),
  ];
  const { ordered, cycles } = topologicalSortDoctrine(rows);
  assert.equal(cycles.length, 0);
  assert.deepEqual(
    ordered.map((r) => r.id),
    ['a', 'b', 'c'],
  );
});

test('topologicalSortDoctrine handles roots with no supersedes link', () => {
  const rows = [
    row({ id: 'x', supersedes_doctrine_id: null }),
    row({ id: 'y', supersedes_doctrine_id: null }),
  ];
  const { ordered, cycles } = topologicalSortDoctrine(rows);
  assert.equal(cycles.length, 0);
  assert.equal(ordered.length, 2);
});

test('topologicalSortDoctrine reports cycle members and omits them from ordered', () => {
  const rows = [
    row({ id: 'a', supersedes_doctrine_id: 'b' }),
    row({ id: 'b', supersedes_doctrine_id: 'a' }),
    row({ id: 'c', supersedes_doctrine_id: null }),
  ];
  const { ordered, cycles } = topologicalSortDoctrine(rows);
  assert.equal(cycles.length, 2);
  assert.deepEqual(cycles.map((r) => r.id).sort(), ['a', 'b']);
  assert.deepEqual(ordered.map((r) => r.id), ['c']);
});

test('topologicalSortDoctrine treats dangling parent ids as roots', () => {
  const rows = [row({ id: 'r', supersedes_doctrine_id: 'ghost' })];
  const { ordered, cycles } = topologicalSortDoctrine(rows);
  assert.equal(cycles.length, 0);
  assert.deepEqual(ordered.map((r) => r.id), ['r']);
});

test('toPostgresPayload maps SQLite ids to deterministic uuids', () => {
  const r = row({
    id: 'doc-1',
    version_group_id: 'group-1',
    supersedes_doctrine_id: 'doc-0',
  });
  const out = toPostgresPayload(r);
  assert.equal(out.id, deterministicUuid('doctrine_nodes', 'doc-1'));
  assert.equal(out.version_group_id, deterministicUuid('doctrine_nodes', 'group-1'));
  assert.equal(
    out.supersedes_doctrine_id,
    deterministicUuid('doctrine_nodes', 'doc-0'),
  );
});

test('toPostgresPayload converts immutable integer flag to boolean', () => {
  assert.equal(toPostgresPayload(row({ immutable: 1 })).immutable, true);
  assert.equal(toPostgresPayload(row({ immutable: 0 })).immutable, false);
});

test('toPostgresPayload leaves null supersedes_doctrine_id as null', () => {
  const out = toPostgresPayload(row({ supersedes_doctrine_id: null }));
  assert.equal(out.supersedes_doctrine_id, null);
});
