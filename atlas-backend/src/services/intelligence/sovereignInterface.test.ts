/**
 * sovereignInterface.test.ts — Phase 0.98 pure-function tests.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTransparencyRecord,
  formatTransparencyPanel,
} from './behaviorTransparencyService.js';
import {
  describeSovereigntyAction,
  validateControlAction,
} from './sovereigntyControlsUIService.js';
import {
  getChamberLayout,
  getInformationHierarchy,
  getActionAffordances,
} from './chamberInterfaceService.js';
import {
  getDesignTokens,
  getPanelTier,
  getMotionClass,
  getChamberTheme,
} from './interfaceDesignSystemService.js';
import {
  formatHomeSummary,
  type HomeSurfaceState,
} from './homeSurfaceService.js';

// ── buildTransparencyRecord (3 tests) ────────────────────────────────────────
test('buildTransparencyRecord: minimal inputs', () => {
  const r = buildTransparencyRecord('trigger', 'reasoning');
  assert.equal(r.trigger_event, 'trigger');
  assert.equal(r.reasoning_summary, 'reasoning');
  assert.equal(r.policy_applied, null);
});
test('buildTransparencyRecord: with policy', () => {
  const r = buildTransparencyRecord('t', 'r', 'policy_x');
  assert.equal(r.policy_applied, 'policy_x');
});
test('buildTransparencyRecord: with confidence', () => {
  const r = buildTransparencyRecord('t', 'r', 'p', 'high');
  assert.equal(r.confidence_level, 'high');
});

// ── formatTransparencyPanel (3 tests) ────────────────────────────────────────
test('formatTransparencyPanel: includes trigger', () => {
  const r = buildTransparencyRecord('user_question', 'reasoning');
  assert.match(formatTransparencyPanel(r), /user_question/);
});
test('formatTransparencyPanel: hides policy when null', () => {
  const r = buildTransparencyRecord('t', 'r');
  assert.doesNotMatch(formatTransparencyPanel(r), /policy=/);
});
test('formatTransparencyPanel: shows confidence', () => {
  const r = buildTransparencyRecord('t', 'r', 'p', 'low');
  assert.match(formatTransparencyPanel(r), /confidence=low/);
});

// ── describeSovereigntyAction (6 actions + unknown) ──────────────────────────
for (const a of [
  'freeze',
  'revert',
  'suppress',
  'confirm',
  'quarantine',
  'inspect',
]) {
  test(`describeSovereigntyAction: ${a} has description`, () => {
    const s = describeSovereigntyAction(a);
    assert.ok(s.length > 5);
  });
}
test('describeSovereigntyAction: unknown action yields hint', () => {
  const s = describeSovereigntyAction('fly');
  assert.match(s, /Unknown/);
});

// ── validateControlAction (valid & invalid combos) ───────────────────────────
test('validateControlAction: freeze/policy valid', () => {
  assert.equal(validateControlAction('freeze', 'policy'), true);
});
test('validateControlAction: freeze/memory valid', () => {
  assert.equal(validateControlAction('freeze', 'memory'), true);
});
test('validateControlAction: revert/identity valid', () => {
  assert.equal(validateControlAction('revert', 'identity'), true);
});
test('validateControlAction: freeze/response invalid', () => {
  assert.equal(validateControlAction('freeze', 'response'), false);
});
test('validateControlAction: suppress/response valid', () => {
  assert.equal(validateControlAction('suppress', 'response'), true);
});
test('validateControlAction: suppress/policy invalid', () => {
  assert.equal(validateControlAction('suppress', 'policy'), false);
});
test('validateControlAction: quarantine/anything valid', () => {
  assert.equal(validateControlAction('quarantine', 'policy'), true);
  assert.equal(validateControlAction('quarantine', 'response'), true);
});
test('validateControlAction: inspect/anything valid', () => {
  assert.equal(validateControlAction('inspect', 'policy'), true);
  assert.equal(validateControlAction('inspect', 'memory'), true);
});
test('validateControlAction: unknown action invalid', () => {
  assert.equal(validateControlAction('teleport', 'policy'), false);
});

// ── getChamberLayout (4 known chambers + default) ────────────────────────────
for (const c of ['directive_center', 'crucible', 'reality_engine', 'mirrorforge']) {
  test(`getChamberLayout: ${c}`, () => {
    const l = getChamberLayout(c);
    assert.equal(l.chamber, c);
    assert.ok(l.panels.length > 0);
  });
}
test('getChamberLayout: unknown falls back to default', () => {
  const l = getChamberLayout('nowhere');
  assert.equal(l.chamber, 'default');
});

// ── getInformationHierarchy (4 chambers + default) ───────────────────────────
for (const c of ['directive_center', 'crucible', 'reality_engine', 'mirrorforge']) {
  test(`getInformationHierarchy: ${c}`, () => {
    const h = getInformationHierarchy(c);
    assert.ok(h.length > 0);
  });
}
test('getInformationHierarchy: unknown falls back', () => {
  const h = getInformationHierarchy('elsewhere');
  assert.ok(h.length > 0);
});

// ── getActionAffordances (4 chambers + default) ──────────────────────────────
for (const c of ['directive_center', 'crucible', 'reality_engine', 'mirrorforge']) {
  test(`getActionAffordances: ${c}`, () => {
    const a = getActionAffordances(c);
    assert.ok(a.length > 0);
  });
}
test('getActionAffordances: unknown falls back', () => {
  const a = getActionAffordances('elsewhere');
  assert.ok(a.length > 0);
});

// ── getDesignTokens (3 tests) ────────────────────────────────────────────────
test('getDesignTokens: primary is Vanta gold', () => {
  const t = getDesignTokens();
  assert.equal(t.primary, '#C9A84C');
});
test('getDesignTokens: text color present', () => {
  const t = getDesignTokens();
  assert.equal(t.text, '#F5F5F5');
});
test('getDesignTokens: returns fresh copy each call', () => {
  const a = getDesignTokens();
  const b = getDesignTokens();
  assert.notEqual(a, b);
});

// ── getPanelTier (5 tests) ───────────────────────────────────────────────────
test('getPanelTier: tier1 => sovereign class', () => {
  assert.equal(getPanelTier('tier1'), 'panel-sovereign');
});
test('getPanelTier: tier2 => primary', () => {
  assert.equal(getPanelTier('tier2'), 'panel-primary');
});
test('getPanelTier: tier3 => secondary', () => {
  assert.equal(getPanelTier('tier3'), 'panel-secondary');
});
test('getPanelTier: tier4 => ambient', () => {
  assert.equal(getPanelTier('tier4'), 'panel-ambient');
});
test('getPanelTier: unknown => default', () => {
  assert.equal(getPanelTier('tier99'), 'panel-default');
});

// ── getMotionClass (5 tests) ─────────────────────────────────────────────────
for (const t of ['enter', 'exit', 'pulse', 'fade', 'slide']) {
  test(`getMotionClass: ${t}`, () => {
    const c = getMotionClass(t);
    assert.ok(c.startsWith('motion-'));
    assert.notEqual(c, 'motion-none');
  });
}

// ── getChamberTheme (4 tests) ────────────────────────────────────────────────
test('getChamberTheme: crucible overrides primary', () => {
  const t = getChamberTheme('crucible');
  assert.ok(t.primary);
});
test('getChamberTheme: directive_center has accent', () => {
  const t = getChamberTheme('directive_center');
  assert.ok(t.accent);
});
test('getChamberTheme: unknown returns empty object', () => {
  const t = getChamberTheme('nowhere');
  assert.deepEqual(t, {});
});
test('getChamberTheme: returns fresh copy', () => {
  const a = getChamberTheme('mirrorforge');
  const b = getChamberTheme('mirrorforge');
  assert.notEqual(a, b);
});

// ── formatHomeSummary (3 tests) ──────────────────────────────────────────────
test('formatHomeSummary: null state fallback', () => {
  assert.match(formatHomeSummary(null), /home surface unavailable/);
});
test('formatHomeSummary: uses today_summary when present', () => {
  const s: HomeSurfaceState = {
    id: '123e4567-e89b-42d3-a456-426614174500',
    user_id: '123e4567-e89b-42d3-a456-426614174501',
    today_summary: 'mine summary',
    active_workstream_count: 3,
    open_commitment_count: 0,
    unresolved_contradiction_count: 0,
    drift_alert_count: 0,
    surface_metadata: {},
    generated_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
  };
  assert.match(formatHomeSummary(s), /mine summary/);
});
test('formatHomeSummary: missing today_summary falls back to counts', () => {
  const s: HomeSurfaceState = {
    id: '123e4567-e89b-42d3-a456-426614174500',
    user_id: '123e4567-e89b-42d3-a456-426614174501',
    today_summary: null,
    active_workstream_count: 2,
    open_commitment_count: 1,
    unresolved_contradiction_count: 4,
    drift_alert_count: 5,
    surface_metadata: {},
    generated_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
  };
  const out = formatHomeSummary(s);
  assert.match(out, /ws:2/);
  assert.match(out, /commits:1/);
});
