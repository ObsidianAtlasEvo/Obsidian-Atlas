import assert from 'node:assert/strict';
import test from 'node:test';

import { deterministicUuid } from '../uuidMapping.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test('deterministicUuid produces a valid UUID for a registered table', () => {
  const id = deterministicUuid('memories', 'sqlite-row-123');
  assert.match(id, UUID_RE);
});

test('deterministicUuid is reproducible across calls', () => {
  const a = deterministicUuid('truth_entries', 'row-abc');
  const b = deterministicUuid('truth_entries', 'row-abc');
  assert.equal(a, b);
});

test('deterministicUuid namespaces differ across tables for the same sqlite id', () => {
  const a = deterministicUuid('memories', 'shared-id');
  const b = deterministicUuid('truth_entries', 'shared-id');
  assert.notEqual(a, b);
});

test('deterministicUuid distinguishes different sqlite ids in the same table', () => {
  const a = deterministicUuid('memories', 'id-1');
  const b = deterministicUuid('memories', 'id-2');
  assert.notEqual(a, b);
});

test('deterministicUuid throws on unregistered table', () => {
  assert.throws(
    () => deterministicUuid('nonexistent_table', 'whatever'),
    /No UUID namespace registered for table nonexistent_table/,
  );
});

test('deterministicUuid registers all eight P4 migrating tables', () => {
  const tables = [
    'memories',
    'truth_entries',
    'evolution_timeline_events',
    'srg_decisions',
    'semantic_claims',
    'doctrine_nodes',
    'unfinished_business_items',
    'adaptation_events',
  ];
  for (const t of tables) {
    assert.match(deterministicUuid(t, 'probe'), UUID_RE, `table=${t}`);
  }
});
