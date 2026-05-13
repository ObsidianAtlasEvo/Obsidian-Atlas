/**
 * P4-A3 unit tests — store-mode gating + event-type mapping for the
 * SQLite→Supabase route in governance/evolutionTimelineService.
 *
 * These tests focus on:
 *   - the pure event-type mapper (`mapEventTypeToSupabase`)
 *   - the store-flag contract observed by `recordEvolutionEvent` via
 *     `storeFlags.evolutionTimeline()` (verified through the helpers in
 *     `utils/storeFlags.js` rather than by stubbing the DB).
 *
 * Direct DB write paths are exercised by integration tests; here we lock in
 * the behavior new to A3 — the mapping table and the store-mode predicates.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  shouldReadSupabase,
  shouldWriteSqlite,
  shouldWriteSupabase,
} from '../../../utils/storeFlags.js';
import { mapEventTypeToSupabase } from '../evolutionTimelineService.js';

test('mapEventTypeToSupabase covers every legacy enum value', () => {
  const cases: Array<[string, string]> = [
    ['belief_shift',                  'clarified'],
    ['standard_change',               'clarified'],
    ['self_concept_change',           'clarified'],
    ['goal_created',                  'added'],
    ['goal_abandoned',                'deactivated'],
    ['goal_completed',                'strengthened'],
    ['goal_drift',                    'weakened'],
    ['recurring_failure_pattern',     'contradicted'],
    ['growth_claim',                  'strengthened'],
    ['developmental_improvement',     'strengthened'],
    ['unresolved_internal_conflict',  'contradicted'],
    ['major_inflection',              'widened'],
    ['cross_domain_tension',          'contradicted'],
    ['development_phase',             'clarified'],
    ['constitutional_amendment_echo', 'corrected'],
    ['decision_outcome_echo',         'clarified'],
  ];
  for (const [legacy, expected] of cases) {
    assert.equal(mapEventTypeToSupabase(legacy), expected, `legacy=${legacy}`);
  }
});

test('mapEventTypeToSupabase defaults unknown values to "added" and warns', () => {
  const prev = console.warn;
  const warned: string[] = [];
  console.warn = (msg: unknown) => {
    if (typeof msg === 'string') warned.push(msg);
  };
  try {
    assert.equal(mapEventTypeToSupabase('does_not_exist'), 'added');
    assert.ok(
      warned.some((m) => m.includes('does_not_exist')),
      'expected an unmapped-type warning',
    );
  } finally {
    console.warn = prev;
  }
});

test('mapEventTypeToSupabase only emits the 12 allowed Postgres values', () => {
  const allowed = new Set([
    'added', 'clarified', 'narrowed', 'widened',
    'strengthened', 'weakened', 'corrected', 'contradicted',
    'demoted', 'frozen', 'reverted', 'deactivated',
  ]);
  const inputs = [
    'belief_shift', 'standard_change', 'self_concept_change', 'goal_created',
    'goal_abandoned', 'goal_completed', 'goal_drift', 'recurring_failure_pattern',
    'growth_claim', 'developmental_improvement', 'unresolved_internal_conflict',
    'major_inflection', 'cross_domain_tension', 'development_phase',
    'constitutional_amendment_echo', 'decision_outcome_echo',
    'something_totally_unexpected',
  ];
  for (const input of inputs) {
    assert.ok(allowed.has(mapEventTypeToSupabase(input)), `out of range for ${input}`);
  }
});

// ── store-flag contract (the recordEvolutionEvent dispatch routes on these) ──

test('sqlite mode writes SQLite only', () => {
  assert.equal(shouldWriteSqlite('sqlite'), true);
  assert.equal(shouldWriteSupabase('sqlite'), false);
  assert.equal(shouldReadSupabase('sqlite'), false);
});

test('dual mode writes both stores and reads from SQLite', () => {
  assert.equal(shouldWriteSqlite('dual'), true);
  assert.equal(shouldWriteSupabase('dual'), true);
  assert.equal(shouldReadSupabase('dual'), false);
});

test('supabase mode writes Supabase only and reads from Supabase', () => {
  assert.equal(shouldWriteSqlite('supabase'), false);
  assert.equal(shouldWriteSupabase('supabase'), true);
  assert.equal(shouldReadSupabase('supabase'), true);
});
