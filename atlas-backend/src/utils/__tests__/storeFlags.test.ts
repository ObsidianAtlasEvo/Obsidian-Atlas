import assert from 'node:assert/strict';
import test from 'node:test';

import {
  shouldReadSupabase,
  shouldWriteSqlite,
  shouldWriteSupabase,
  storeFlags,
  type StoreMode,
} from '../storeFlags.js';

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

test('storeFlags.memory defaults to sqlite when env is unset', () => {
  withEnv('MEMORY_STORE', undefined, () => {
    assert.equal(storeFlags.memory(), 'sqlite');
  });
});

test('storeFlags reads each migrating table family from its env var', () => {
  withEnv('TRUTH_STORE', 'dual', () => {
    assert.equal(storeFlags.truth(), 'dual');
  });
  withEnv('DOCTRINE_STORE', 'supabase', () => {
    assert.equal(storeFlags.doctrine(), 'supabase');
  });
  withEnv('EVOLUTION_TIMELINE_STORE', 'dual', () => {
    assert.equal(storeFlags.evolutionTimeline(), 'dual');
  });
  withEnv('SEMANTIC_CLAIMS_STORE', 'supabase', () => {
    assert.equal(storeFlags.semanticClaims(), 'supabase');
  });
  withEnv('SRG_STORE', 'dual', () => {
    assert.equal(storeFlags.srg(), 'dual');
  });
  withEnv('UNFINISHED_BUSINESS_STORE', 'supabase', () => {
    assert.equal(storeFlags.unfinishedBusiness(), 'supabase');
  });
  withEnv('ADAPTATION_STORE', 'dual', () => {
    assert.equal(storeFlags.adaptation(), 'dual');
  });
});

test('storeFlags falls back to sqlite for invalid values', () => {
  withEnv('MEMORY_STORE', 'firestore', () => {
    assert.equal(storeFlags.memory(), 'sqlite');
  });
});

test('storeFlags accepts mixed-case env values', () => {
  withEnv('MEMORY_STORE', 'DUAL', () => {
    assert.equal(storeFlags.memory(), 'dual');
  });
});

test('shouldWriteSqlite is true for sqlite and dual only', () => {
  const cases: Array<[StoreMode, boolean]> = [
    ['sqlite', true],
    ['dual', true],
    ['supabase', false],
  ];
  for (const [mode, expected] of cases) {
    assert.equal(shouldWriteSqlite(mode), expected, `mode=${mode}`);
  }
});

test('shouldWriteSupabase is true for dual and supabase only', () => {
  const cases: Array<[StoreMode, boolean]> = [
    ['sqlite', false],
    ['dual', true],
    ['supabase', true],
  ];
  for (const [mode, expected] of cases) {
    assert.equal(shouldWriteSupabase(mode), expected, `mode=${mode}`);
  }
});

test('shouldReadSupabase is true only when the cutover is complete', () => {
  assert.equal(shouldReadSupabase('sqlite'), false);
  assert.equal(shouldReadSupabase('dual'), false);
  assert.equal(shouldReadSupabase('supabase'), true);
});
