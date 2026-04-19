/**
 * operationalSovereignty.test.ts — Phase 0.95 pure-function tests.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWorkstreamHealth,
  formatWorkstreamSummary,
  type WorkstreamRow,
} from './workstreamStateService.js';
import { computeFrontHealth, type FrontRow } from './frontModelService.js';
import {
  detectStalls,
  formatContinuitySummary,
  type ChainRow,
} from './executionContinuityService.js';
import { detectImpliedCommitments } from './commitmentTrackerService.js';
import {
  computeLeverageScore,
  detectFalseFronts,
  identifyBottleneck,
} from './leverageEngineService.js';
import { computeOutcomeDelta } from './outcomeFeedbackService.js';
import {
  formatDirectiveSummary,
  type DirectiveState,
} from './directiveCenterService.js';
import {
  getChamberActionCriteria,
  getChamberSuccessMetrics,
  formatOperationalContext,
} from './chamberOperationalFormatter.js';

const makeWs = (overrides: Partial<WorkstreamRow> = {}): WorkstreamRow => ({
  id: '123e4567-e89b-42d3-a456-426614174000',
  user_id: '123e4567-e89b-42d3-a456-426614174001',
  name: 'ws',
  description: null,
  status: 'active',
  phase: null,
  health_score: 0.5,
  workstream_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const makeFront = (overrides: Partial<FrontRow> = {}): FrontRow => ({
  id: '123e4567-e89b-42d3-a456-426614174010',
  user_id: '123e4567-e89b-42d3-a456-426614174001',
  name: 'front',
  description: null,
  status: 'open',
  front_type: null,
  arena: null,
  priority: 5,
  front_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const makeChain = (overrides: Partial<ChainRow> = {}): ChainRow => ({
  id: '123e4567-e89b-42d3-a456-426614174020',
  user_id: '123e4567-e89b-42d3-a456-426614174001',
  workstream_id: null,
  name: 'chain',
  status: 'active',
  last_action_at: new Date().toISOString(),
  chain_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

// ── computeWorkstreamHealth (5 tests) ────────────────────────────────────────
test('computeWorkstreamHealth: empty arrays returns 0.5', () => {
  assert.equal(computeWorkstreamHealth([], []), 0.5);
});
test('computeWorkstreamHealth: all active chains & fulfilled commitments returns 1', () => {
  const chains = [
    { id: 'a', status: 'active' as const, last_action_at: null },
    { id: 'b', status: 'complete' as const, last_action_at: null },
  ];
  const commitments = [{ id: 'c', status: 'fulfilled' as const }];
  assert.equal(computeWorkstreamHealth(chains, commitments), 1);
});
test('computeWorkstreamHealth: all stalled chains yields < 0.5', () => {
  const chains = [{ id: 'a', status: 'stalled' as const, last_action_at: null }];
  const out = computeWorkstreamHealth(chains, []);
  assert.ok(out < 0.5);
});
test('computeWorkstreamHealth: clamps to [0,1]', () => {
  const out = computeWorkstreamHealth([], []);
  assert.ok(out >= 0 && out <= 1);
});
test('computeWorkstreamHealth: 0.6 chain weight dominates commitment weight', () => {
  const chains = [{ id: 'a', status: 'active' as const, last_action_at: null }];
  const commitments = [{ id: 'c', status: 'broken' as const }];
  const out = computeWorkstreamHealth(chains, commitments);
  assert.ok(out > 0.5);
});

// ── formatWorkstreamSummary (2 tests) ────────────────────────────────────────
test('formatWorkstreamSummary: includes name and status', () => {
  const ws = makeWs({ name: 'Alpha', status: 'paused' });
  const s = formatWorkstreamSummary(ws);
  assert.match(s, /Alpha/);
  assert.match(s, /paused/);
});
test('formatWorkstreamSummary: includes phase bracket when set', () => {
  const ws = makeWs({ phase: 'discovery' });
  const s = formatWorkstreamSummary(ws);
  assert.match(s, /discovery/);
});

// ── detectStalls (5 tests) ───────────────────────────────────────────────────
test('detectStalls: no chains returns []', () => {
  assert.deepEqual(detectStalls([]), []);
});
test('detectStalls: chain last acted long ago is stalled', () => {
  const ago = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const chains = [makeChain({ last_action_at: ago })];
  assert.equal(detectStalls(chains).length, 1);
});
test('detectStalls: recently active chain is not stalled', () => {
  const chains = [makeChain()];
  assert.equal(detectStalls(chains).length, 0);
});
test('detectStalls: completed chain is not stalled', () => {
  const old = new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString();
  const chains = [makeChain({ status: 'complete', last_action_at: old })];
  assert.equal(detectStalls(chains).length, 0);
});
test('detectStalls: null last_action_at treated as stalled', () => {
  const chains = [makeChain({ last_action_at: null })];
  assert.equal(detectStalls(chains).length, 1);
});

// ── formatContinuitySummary (2 tests) ────────────────────────────────────────
test('formatContinuitySummary: mentions active count', () => {
  const chains = [makeChain(), makeChain({ status: 'stalled' })];
  const s = formatContinuitySummary(chains);
  assert.match(s, /active/);
  assert.match(s, /stalled/);
});
test('formatContinuitySummary: empty chains produces zero counts', () => {
  const s = formatContinuitySummary([]);
  assert.match(s, /0 active/);
});

// ── detectImpliedCommitments (4 tests) ───────────────────────────────────────
test('detectImpliedCommitments: detects "will" clause', () => {
  const out = detectImpliedCommitments('I will send the report tomorrow.');
  assert.equal(out.length, 1);
});
test('detectImpliedCommitments: detects "plan to"', () => {
  const out = detectImpliedCommitments('I plan to finish by Friday.');
  assert.equal(out.length, 1);
});
test('detectImpliedCommitments: empty text returns []', () => {
  assert.deepEqual(detectImpliedCommitments(''), []);
});
test('detectImpliedCommitments: no keywords returns []', () => {
  const out = detectImpliedCommitments('This is a neutral statement.');
  assert.deepEqual(out, []);
});

// ── computeOutcomeDelta (4 tests) ─────────────────────────────────────────────
test('computeOutcomeDelta: actual includes proposed returns 0.8', () => {
  assert.equal(computeOutcomeDelta('ship v1', 'ship v1 done'), 0.8);
});
test('computeOutcomeDelta: actual longer than proposed returns 0.2', () => {
  assert.equal(computeOutcomeDelta('short', 'this is a much longer actual outcome'), 0.2);
});
test('computeOutcomeDelta: actual shorter and disjoint returns -0.4', () => {
  assert.equal(computeOutcomeDelta('ambitious plan details', 'failed'), -0.4);
});
test('computeOutcomeDelta: empty input returns 0', () => {
  assert.equal(computeOutcomeDelta('', 'x'), 0);
});

// ── computeLeverageScore (3 tests) ────────────────────────────────────────────
test('computeLeverageScore: high reach & urgency with low effort gives high score', () => {
  const s = computeLeverageScore({ reach: 1, effort: 0.1, urgency: 1 });
  assert.ok(s >= 0.9);
});
test('computeLeverageScore: low reach & high effort gives low score', () => {
  const s = computeLeverageScore({ reach: 0, effort: 1, urgency: 0 });
  assert.ok(s < 0.2);
});
test('computeLeverageScore: clamps to [0,1]', () => {
  const s = computeLeverageScore({ reach: 10, effort: 0.01, urgency: 10 });
  assert.ok(s >= 0 && s <= 1);
});

// ── detectFalseFronts (3 tests) ──────────────────────────────────────────────
test('detectFalseFronts: open front with no active workstream = false front', () => {
  const f = makeFront({ name: 'Growth' });
  const out = detectFalseFronts([f], []);
  assert.equal(out.length, 1);
});
test('detectFalseFronts: frozen front not flagged', () => {
  const f = makeFront({ status: 'frozen' });
  assert.equal(detectFalseFronts([f], []).length, 0);
});
test('detectFalseFronts: matching active workstream prevents false-flag', () => {
  const f = makeFront({ name: 'growth arena' });
  const w = makeWs({ name: 'growth project' });
  assert.equal(detectFalseFronts([f], [w]).length, 0);
});

// ── identifyBottleneck (3 tests) ─────────────────────────────────────────────
test('identifyBottleneck: no stalled chains returns null', () => {
  const chains = [makeChain()];
  assert.equal(identifyBottleneck(chains), null);
});
test('identifyBottleneck: picks oldest stalled chain', () => {
  const old = new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString();
  const newer = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
  const chains = [
    makeChain({ id: 'a', status: 'stalled', last_action_at: newer }),
    makeChain({ id: 'b', status: 'stalled', last_action_at: old }),
  ];
  assert.equal(identifyBottleneck(chains)?.id, 'b');
});
test('identifyBottleneck: includes blocked chains', () => {
  const chains = [makeChain({ status: 'blocked' })];
  assert.ok(identifyBottleneck(chains) !== null);
});

// ── computeFrontHealth (4 tests) ─────────────────────────────────────────────
test('computeFrontHealth: won returns 1', () => {
  assert.equal(computeFrontHealth(makeFront({ status: 'won' }), []), 1);
});
test('computeFrontHealth: lost returns 0', () => {
  assert.equal(computeFrontHealth(makeFront({ status: 'lost' }), []), 0);
});
test('computeFrontHealth: frozen returns 0.3', () => {
  assert.equal(computeFrontHealth(makeFront({ status: 'frozen' }), []), 0.3);
});
test('computeFrontHealth: open + no active workstream returns 0.2', () => {
  assert.equal(computeFrontHealth(makeFront({ status: 'open' }), []), 0.2);
});

// ── formatDirectiveSummary (1 test) ──────────────────────────────────────────
test('formatDirectiveSummary: returns concise counts', () => {
  const state: DirectiveState = {
    fronts: [makeFront()],
    workstreams: [makeWs()],
    chains: [makeChain()],
    decisions: [],
    openCommitments: [],
  };
  const s = formatDirectiveSummary(state);
  assert.match(s, /active workstreams:/);
});

// ── getChamberActionCriteria (5 chambers × 1 = 5 tests) ──────────────────────
for (const chamber of [
  'directive_center',
  'crucible',
  'reality_engine',
  'mirrorforge',
  'default',
]) {
  test(`getChamberActionCriteria: ${chamber} returns non-empty list`, () => {
    const out = getChamberActionCriteria(chamber);
    assert.ok(Array.isArray(out));
    assert.ok(out.length > 0);
  });
}

// ── getChamberSuccessMetrics (5 chambers × 1 = 5 tests) ──────────────────────
for (const chamber of [
  'directive_center',
  'crucible',
  'reality_engine',
  'mirrorforge',
  'default',
]) {
  test(`getChamberSuccessMetrics: ${chamber} returns non-empty list`, () => {
    const out = getChamberSuccessMetrics(chamber);
    assert.ok(Array.isArray(out));
    assert.ok(out.length > 0);
  });
}

// ── formatOperationalContext (2 tests) ───────────────────────────────────────
test('formatOperationalContext: includes chamber name', () => {
  const state: DirectiveState = {
    fronts: [],
    workstreams: [],
    chains: [],
    decisions: [],
    openCommitments: [],
  };
  const s = formatOperationalContext('crucible', state);
  assert.match(s, /crucible/);
});
test('formatOperationalContext: unknown chamber falls back to default', () => {
  const state: DirectiveState = {
    fronts: [],
    workstreams: [],
    chains: [],
    decisions: [],
    openCommitments: [],
  };
  const s = formatOperationalContext('unknown_chamber', state);
  assert.match(s, /unknown_chamber/);
  assert.match(s, /action_criteria/);
});
