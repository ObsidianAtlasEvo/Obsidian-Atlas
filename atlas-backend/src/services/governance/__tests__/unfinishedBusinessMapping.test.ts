import assert from 'node:assert/strict';
import test from 'node:test';

import { deterministicUuid } from '../../../utils/uuidMapping.js';
import {
  mapStatusFromPostgres,
  mapStatusToPostgres,
  postgresRowToSqlite,
  sqliteRowToPostgres,
} from '../unfinishedBusinessMapping.js';
import type { UnfinishedRow } from '../unfinishedBusinessService.js';

const FIXED_USER_ID = '00000000-0000-4000-8000-000000000abc';

function makeSqliteRow(overrides: Partial<UnfinishedRow> = {}): UnfinishedRow {
  return {
    id: 'sqlite-1',
    user_id: FIXED_USER_ID,
    kind: 'commitment',
    title: 'title',
    description: 'desc',
    significance_score: 0.7,
    recurrence_score: 0.2,
    urgency_score: 0.5,
    identity_relevance_score: 0.4,
    composite_score: 0.51,
    surfaced_count: 0,
    last_surfaced_at: null,
    status: 'open',
    decision_id: null,
    constitution_version_group_id: null,
    linked_claim_ids_json: '[]',
    pattern_fingerprint: 'fp',
    created_at: '2026-05-13T00:00:00.000Z',
    updated_at: '2026-05-13T00:00:00.000Z',
    resolved_at: null,
    resolution_note: null,
    ...overrides,
  };
}

test('mapStatusToPostgres maps the four SQLite states', () => {
  assert.equal(mapStatusToPostgres('open'), 'open');
  assert.equal(mapStatusToPostgres('deferred'), 'snoozed');
  assert.equal(mapStatusToPostgres('resolved'), 'resolved');
  assert.equal(mapStatusToPostgres('archived'), 'dropped');
});

test('mapStatusToPostgres defaults unknown values to open', () => {
  assert.equal(mapStatusToPostgres('garbage'), 'open');
});

test('mapStatusFromPostgres is the inverse of mapStatusToPostgres', () => {
  for (const s of ['open', 'deferred', 'resolved', 'archived']) {
    assert.equal(mapStatusFromPostgres(mapStatusToPostgres(s)), s);
  }
});

test('sqliteRowToPostgres rewrites the id via the deterministic namespace', () => {
  const row = makeSqliteRow({ id: 'row-A' });
  const pg = sqliteRowToPostgres(row);
  assert.equal(pg.id, deterministicUuid('unfinished_business_items', 'row-A'));
});

test('sqliteRowToPostgres rewrites decision_id under the srg_decisions namespace', () => {
  const pg = sqliteRowToPostgres(makeSqliteRow({ decision_id: 'dec-1' }));
  assert.equal(pg.decision_id, deterministicUuid('srg_decisions', 'dec-1'));
});

test('sqliteRowToPostgres preserves null decision_id', () => {
  const pg = sqliteRowToPostgres(makeSqliteRow({ decision_id: null }));
  assert.equal(pg.decision_id, null);
});

test('sqliteRowToPostgres parses linked_claim_ids_json into a jsonb array', () => {
  const pg = sqliteRowToPostgres(makeSqliteRow({ linked_claim_ids_json: '["a","b"]' }));
  assert.deepEqual(pg.linked_claim_ids, ['a', 'b']);
});

test('sqliteRowToPostgres tolerates corrupt linked_claim_ids_json', () => {
  const pg = sqliteRowToPostgres(makeSqliteRow({ linked_claim_ids_json: 'not-json' }));
  assert.deepEqual(pg.linked_claim_ids, []);
});

test('sqliteRowToPostgres maps SQLite deferred → Postgres snoozed', () => {
  const pg = sqliteRowToPostgres(makeSqliteRow({ status: 'deferred' }));
  assert.equal(pg.status, 'snoozed');
});

test('postgresRowToSqlite restores the SQLite status enum', () => {
  const pg = sqliteRowToPostgres(makeSqliteRow({ status: 'archived' }));
  const back = postgresRowToSqlite(pg, 'sqlite-1');
  assert.equal(back.status, 'archived');
  assert.equal(back.id, 'sqlite-1');
});

test('postgresRowToSqlite re-serializes linked_claim_ids as JSON text', () => {
  const pg = sqliteRowToPostgres(makeSqliteRow({ linked_claim_ids_json: '["x"]' }));
  const back = postgresRowToSqlite(pg);
  assert.equal(back.linked_claim_ids_json, '["x"]');
});
