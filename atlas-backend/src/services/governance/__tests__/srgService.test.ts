import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import {
  listRecentSrgDecisionsAsync,
  listRecentSrgDecisionsSync,
  listStaleDraftSrgDecisionsAsync,
  listStaleDraftSrgDecisionsSync,
} from '../srgService.js';

const PREV: Record<string, string | undefined> = {};

function setEnv(name: string, value: string | undefined): void {
  if (!(name in PREV)) PREV[name] = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  // Ensure Supabase REST returns a no-config (ok:false) result during tests
  setEnv('SUPABASE_URL', undefined);
  setEnv('SUPABASE_SERVICE_ROLE_KEY', undefined);
  setEnv('SUPABASE_SERVICE_KEY', undefined);
});

afterEach(() => {
  for (const k of Object.keys(PREV)) {
    const v = PREV[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  for (const k of Object.keys(PREV)) delete PREV[k];
});

test('listRecentSrgDecisionsSync returns [] when SQLite is uninitialized (sqlite mode)', () => {
  setEnv('SRG_STORE', 'sqlite');
  const rows = listRecentSrgDecisionsSync('user-1', 5);
  assert.deepEqual(rows, []);
});

test('listRecentSrgDecisionsSync returns [] in dual mode without throwing', () => {
  setEnv('SRG_STORE', 'dual');
  const rows = listRecentSrgDecisionsSync('user-1', 5);
  assert.deepEqual(rows, []);
});

test('listRecentSrgDecisionsSync throws in supabase mode (must use async)', () => {
  setEnv('SRG_STORE', 'supabase');
  assert.throws(() => listRecentSrgDecisionsSync('user-1', 5), /requires the async API/);
});

test('listStaleDraftSrgDecisionsSync returns [] when SQLite is uninitialized', () => {
  setEnv('SRG_STORE', 'sqlite');
  const rows = listStaleDraftSrgDecisionsSync('user-1', '2026-01-01T00:00:00Z', 3);
  assert.deepEqual(rows, []);
});

test('listStaleDraftSrgDecisionsSync throws in supabase mode', () => {
  setEnv('SRG_STORE', 'supabase');
  assert.throws(
    () => listStaleDraftSrgDecisionsSync('user-1', '2026-01-01T00:00:00Z', 3),
    /requires the async API/,
  );
});

test('listRecentSrgDecisionsAsync returns [] in supabase mode when supabase env is missing', async () => {
  setEnv('SRG_STORE', 'supabase');
  const rows = await listRecentSrgDecisionsAsync('user-1', 5);
  assert.deepEqual(rows, []);
});

test('listStaleDraftSrgDecisionsAsync returns [] in supabase mode when supabase env is missing', async () => {
  setEnv('SRG_STORE', 'supabase');
  const rows = await listStaleDraftSrgDecisionsAsync(
    'user-1',
    '2026-01-01T00:00:00Z',
    3,
  );
  assert.deepEqual(rows, []);
});

test('listRecentSrgDecisionsAsync falls back to sqlite path in dual mode (no throw)', async () => {
  setEnv('SRG_STORE', 'dual');
  const rows = await listRecentSrgDecisionsAsync('user-1', 5);
  assert.deepEqual(rows, []);
});

test('listRecentSrgDecisionsAsync uses the sqlite path when flag is unset (default = sqlite)', async () => {
  setEnv('SRG_STORE', undefined);
  const rows = await listRecentSrgDecisionsAsync('user-1', 5);
  assert.deepEqual(rows, []);
});
