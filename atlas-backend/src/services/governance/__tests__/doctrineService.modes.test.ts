/**
 * doctrineService mode-routing tests.
 *
 * The service module imports a singleton SQLite handle eagerly; a full
 * end-to-end test would require setting SQLITE_PATH to a temp file before
 * any import in the suite. Instead, we lock down the contract observable
 * from outside: that `storeFlags.doctrine()` returns the expected mode per
 * env var, and that the three boolean predicates the service uses
 * (`shouldWriteSqlite`, `shouldWriteSupabase`, `shouldReadSupabase`) follow
 * the three-state cutover contract.
 *
 * Full integration coverage lives in the staged dual-write rollout itself
 * (mode=dual in staging), which is the only environment that exercises
 * both stores together.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  shouldReadSupabase,
  shouldWriteSqlite,
  shouldWriteSupabase,
  storeFlags,
} from '../../../utils/storeFlags.js';

function withEnv<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env.DOCTRINE_STORE;
  if (value === undefined) delete process.env.DOCTRINE_STORE;
  else process.env.DOCTRINE_STORE = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.DOCTRINE_STORE;
    else process.env.DOCTRINE_STORE = prev;
  }
}

test('doctrine mode=sqlite — writes only SQLite, reads only SQLite', () => {
  withEnv('sqlite', () => {
    const mode = storeFlags.doctrine();
    assert.equal(mode, 'sqlite');
    assert.equal(shouldWriteSqlite(mode), true);
    assert.equal(shouldWriteSupabase(mode), false);
    assert.equal(shouldReadSupabase(mode), false);
  });
});

test('doctrine mode=dual — writes both, reads SQLite', () => {
  withEnv('dual', () => {
    const mode = storeFlags.doctrine();
    assert.equal(mode, 'dual');
    assert.equal(shouldWriteSqlite(mode), true);
    assert.equal(shouldWriteSupabase(mode), true);
    assert.equal(shouldReadSupabase(mode), false);
  });
});

test('doctrine mode=supabase — writes Supabase only, reads Supabase', () => {
  withEnv('supabase', () => {
    const mode = storeFlags.doctrine();
    assert.equal(mode, 'supabase');
    assert.equal(shouldWriteSqlite(mode), false);
    assert.equal(shouldWriteSupabase(mode), true);
    assert.equal(shouldReadSupabase(mode), true);
  });
});

test('doctrine default (env unset) is sqlite — safe rollout default', () => {
  withEnv(undefined, () => {
    assert.equal(storeFlags.doctrine(), 'sqlite');
  });
});
