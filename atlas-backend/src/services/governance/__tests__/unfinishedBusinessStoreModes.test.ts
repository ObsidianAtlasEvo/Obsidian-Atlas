/**
 * Store-mode dispatch tests for the unfinished_business cutover.
 *
 * The service module wires storeFlags.unfinishedBusiness() to the three
 * mode-dispatch helpers. These tests verify the contract end-to-end through
 * the public storeFlags surface so changes to defaults or env parsing are
 * caught here.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  shouldReadSupabase,
  shouldWriteSqlite,
  shouldWriteSupabase,
  storeFlags,
} from '../../../utils/storeFlags.js';

function withEnv<T>(name: string, value: string | undefined, fn: () => T): T {
  const prev = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[name];
    else process.env[name] = prev;
  }
}

test('UNFINISHED_BUSINESS_STORE defaults to sqlite when env is unset', () => {
  withEnv('UNFINISHED_BUSINESS_STORE', undefined, () => {
    const mode = storeFlags.unfinishedBusiness();
    assert.equal(mode, 'sqlite');
    assert.equal(shouldWriteSqlite(mode), true);
    assert.equal(shouldWriteSupabase(mode), false);
    assert.equal(shouldReadSupabase(mode), false);
  });
});

test('UNFINISHED_BUSINESS_STORE=dual writes both stores, reads SQLite', () => {
  withEnv('UNFINISHED_BUSINESS_STORE', 'dual', () => {
    const mode = storeFlags.unfinishedBusiness();
    assert.equal(mode, 'dual');
    assert.equal(shouldWriteSqlite(mode), true);
    assert.equal(shouldWriteSupabase(mode), true);
    assert.equal(shouldReadSupabase(mode), false);
  });
});

test('UNFINISHED_BUSINESS_STORE=supabase reads and writes Postgres only', () => {
  withEnv('UNFINISHED_BUSINESS_STORE', 'supabase', () => {
    const mode = storeFlags.unfinishedBusiness();
    assert.equal(mode, 'supabase');
    assert.equal(shouldWriteSupabase(mode), true);
    assert.equal(shouldReadSupabase(mode), true);
  });
});

test('invalid UNFINISHED_BUSINESS_STORE values fall back to sqlite (fail-safe)', () => {
  withEnv('UNFINISHED_BUSINESS_STORE', 'firestore', () => {
    assert.equal(storeFlags.unfinishedBusiness(), 'sqlite');
  });
});
