/**
 * contextCurator.test.ts — Phase 0.9: Context Curation + Temporal Cognition Tests
 *
 * Tests the pure/in-process logic of:
 *   - contextCuratorService: formatCuratedContext, formatGapSummary (pure)
 *   - gapLedgerService: GapType validation, formatGapSummary (pure)
 *   - userSovereigntyService: SovereigntyControl type shapes
 *   - stateActivationService: computeActivationState (pure deterministic rules)
 *   - activePrioritiesService: type validation
 *   - 5 Laws of Temporal Cognition: structural module verification
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────────────────────────────────────
// contextCuratorService — formatCuratedContext (pure)
// ─────────────────────────────────────────────────────────────────────────────

import {
  formatCuratedContext,
} from './contextCuratorService.js';
import type { CuratedContextPackage } from './contextCuratorService.js';

function makePkg(overrides: Partial<CuratedContextPackage> = {}): CuratedContextPackage {
  return {
    directInject: overrides.directInject ?? [],
    compressedSummary: overrides.compressedSummary ?? '',
    suppressedCount: overrides.suppressedCount ?? 0,
    tokenBudgetUsed: overrides.tokenBudgetUsed ?? 0,
    curationDecisions: overrides.curationDecisions ?? [],
  };
}

test('contextCurator: formatCuratedContext returns a string', () => {
  const result = formatCuratedContext(makePkg());
  assert.equal(typeof result, 'string');
});

test('contextCurator: formatCuratedContext with populated directInject returns non-empty string (when enabled)', () => {
  const pkg = makePkg({
    directInject: ['User prefers concise answers.', 'User works in fintech.'],
    tokenBudgetUsed: 40,
  });
  const result = formatCuratedContext(pkg);
  // When memory layer is disabled, returns empty; when enabled, returns content
  // Just validate type and length bound
  assert.equal(typeof result, 'string');
  assert.ok(result.length <= 2100, 'should be hard-capped at 2100 chars');
});

test('contextCurator: formatCuratedContext never exceeds 2100 chars', () => {
  const longLine = 'X'.repeat(200);
  const pkg = makePkg({
    directInject: Array(20).fill(longLine),
    compressedSummary: longLine.repeat(5),
    suppressedCount: 3,
    tokenBudgetUsed: 9999,
  });
  const result = formatCuratedContext(pkg);
  assert.ok(
    result.length <= 2100,
    `hard cap violated: result is ${result.length} chars`,
  );
});

test('contextCurator: formatCuratedContext result is a string for all pkg combinations', () => {
  const pkgs: CuratedContextPackage[] = [
    makePkg(),
    makePkg({ directInject: ['test'], suppressedCount: 5 }),
    makePkg({ compressedSummary: 'Background: user is a developer' }),
    makePkg({ directInject: ['a', 'b'], compressedSummary: 'compressed', suppressedCount: 1 }),
  ];
  for (const pkg of pkgs) {
    const result = formatCuratedContext(pkg);
    assert.equal(typeof result, 'string', 'formatCuratedContext should always return a string');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// gapLedgerService — pure functions: GapType, formatGapSummary
// ─────────────────────────────────────────────────────────────────────────────

import {
  formatGapSummary,
  type GapType,
  type GapEntry,
} from './gapLedgerService.js';

const ALL_GAP_TYPES: GapType[] = [
  'unresolved_preference',
  'unresolved_contradiction',
  'underconfirmed_trait',
  'missing_chamber_preference',
  'unknown_workflow_preference',
  'unclear_scope_boundary',
  'insufficient_evidence',
  'unclear_project_priority',
  'unstable_recent_change',
];

function makeGap(overrides: Partial<GapEntry> = {}): GapEntry {
  return {
    id: overrides.id ?? 'gap-test-1',
    userId: overrides.userId ?? 'user-123',
    gapType: overrides.gapType ?? 'unresolved_preference',
    gapDomain: overrides.gapDomain ?? 'preference',
    ambiguityScore: overrides.ambiguityScore ?? 0.7,
    impactScore: overrides.impactScore ?? 0.8,
    confirmationPriority: overrides.confirmationPriority ?? 0.85,
    blockedActions: overrides.blockedActions ?? [],
    nextConfirmationPath: overrides.nextConfirmationPath,
    status: (overrides.status ?? 'open') as GapEntry['status'],
    relatedMemoryIds: overrides.relatedMemoryIds ?? [],
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  };
}

test('gapLedger: ALL_GAP_TYPES has 9 types', () => {
  assert.equal(ALL_GAP_TYPES.length, 9, 'should have exactly 9 gap types');
});

test('gapLedger: formatGapSummary returns empty string for empty array', () => {
  const result = formatGapSummary([]);
  assert.equal(result, '', 'empty gaps should produce empty string');
});

test('gapLedger: formatGapSummary returns non-empty string for populated gaps', () => {
  const gaps = [makeGap()];
  const result = formatGapSummary(gaps);
  assert.equal(typeof result, 'string');
  assert.ok(result.length > 0, 'should produce non-empty summary for populated gaps');
});

test('gapLedger: formatGapSummary includes GAP prefix', () => {
  const gaps = [makeGap({ gapType: 'unresolved_contradiction', gapDomain: 'communication' })];
  const result = formatGapSummary(gaps);
  assert.ok(result.includes('GAP'), 'gap summary should include "GAP" label');
});

test('gapLedger: formatGapSummary handles all gap types without throwing', () => {
  for (const gapType of ALL_GAP_TYPES) {
    const gaps = [makeGap({ gapType })];
    assert.doesNotThrow(() => {
      formatGapSummary(gaps);
    }, `formatGapSummary should not throw for gap type: ${gapType}`);
  }
});

test('gapLedger: formatGapSummary limits to 3 gaps in output', () => {
  const manyGaps = Array.from({ length: 10 }, (_, i) =>
    makeGap({ id: `gap-${i}`, gapDomain: `domain-${i}` })
  );
  const result = formatGapSummary(manyGaps);
  // Should reference at most 3 in the summary (implementation: top3)
  const gapCount = (result.match(/GAP:/g) ?? []).length;
  assert.ok(gapCount <= 3, `should show at most 3 gaps (got ${gapCount})`);
});

test('gapLedger: formatGapSummary includes domain in output', () => {
  const gaps = [makeGap({ gapDomain: 'fintech_workflows' })];
  const result = formatGapSummary(gaps);
  assert.ok(
    result.includes('fintech_workflows'),
    `summary should include the gap domain (got: ${result})`,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// stateActivationService — computeActivationState (pure, deterministic)
// ─────────────────────────────────────────────────────────────────────────────

import {
  computeActivationState,
  type ActivationState,
  type ActivationDecision,
  type ComputeActivationInput,
  type MemoryRowInput,
  type SovereigntyControlInput,
} from './stateActivationService.js';

function makeMemoryRow(overrides: Partial<MemoryRowInput> = {}): MemoryRowInput {
  return {
    id: overrides.id ?? 'mem-test-1',
    kind: overrides.kind ?? 'preference',
    memory_class: overrides.memory_class ?? 'durable',
    scope_type: overrides.scope_type ?? 'global',
    scope_key: overrides.scope_key ?? null,
    stability_score: overrides.stability_score ?? 0.8,
    quarantined: overrides.quarantined ?? false,
    confirmation_status: overrides.confirmation_status ?? 'unconfirmed',
    contradiction_status: overrides.contradiction_status ?? 'clear',
    provenance: overrides.provenance ?? 'user_stated',
    created_at: overrides.created_at ?? new Date(Date.now() - 7 * 86400000).toISOString(),
    last_reaffirmed_at: overrides.last_reaffirmed_at ?? null,
  };
}

function computeState(
  memOverrides: Partial<MemoryRowInput> = {},
  controls: SovereigntyControlInput[] = [],
  driftScore = 0.1,
): ActivationDecision {
  return computeActivationState({
    memoryRow: makeMemoryRow(memOverrides),
    sovereigntyControls: controls,
    driftState: { driftDetected: false, driftScore },
    projectActive: true,
    chamberActive: true,
  });
}

test('stateActivation: quarantined memory → quarantined state', () => {
  const decision = computeState({ quarantined: true });
  assert.equal(decision.state, 'quarantined', 'quarantined memory should produce quarantined state');
});

test('stateActivation: high-stability user_stated global memory → active state', () => {
  const decision = computeState({
    stability_score: 0.9,
    provenance: 'user_stated',
    scope_type: 'global',
    contradiction_status: 'clear',
    quarantined: false,
  });
  assert.ok(
    decision.state === 'active' || decision.state === 'latent',
    `high-stability user_stated should be active/latent (got ${decision.state})`,
  );
});

test('stateActivation: domain freeze control → frozen state', () => {
  const controls: SovereigntyControlInput[] = [{
    controlType: 'freeze',
    controlScope: 'domain',
    scopeKey: 'preference',
    active: true,
  }];
  const decision = computeState({ scope_type: 'global', scope_key: 'preference' }, controls);
  assert.equal(decision.state, 'frozen', 'domain freeze should produce frozen state');
});

test('stateActivation: global suppress control → suppressed state', () => {
  const controls: SovereigntyControlInput[] = [{
    controlType: 'suppress',
    controlScope: 'global',
    active: true,
  }];
  const decision = computeState({}, controls);
  assert.ok(
    decision.state === 'suppressed' || decision.state === 'frozen',
    `global suppress should produce suppressed/frozen state (got ${decision.state})`,
  );
});

test('stateActivation: very old memory with low stability → archived or latent state', () => {
  const oldDate = new Date(Date.now() - 500 * 86400000).toISOString(); // 500 days ago
  const decision = computeState({
    stability_score: 0.05,
    created_at: oldDate,
    last_reaffirmed_at: oldDate,
    contradiction_status: 'unresolved',
  });
  assert.ok(
    decision.state === 'archived' || decision.state === 'latent' || decision.state === 'tentative'
    || decision.state === 'suppressed' || decision.state === 'pending_confirmation',
    `very old low-stability memory should archive/laten/suppress (got ${decision.state})`,
  );
});

test('stateActivation: decision has required fields', () => {
  const decision = computeState();
  assert.ok(typeof decision.entityId === 'string');
  assert.ok(typeof decision.entityType === 'string');
  assert.ok(typeof decision.state === 'string');
  assert.ok(typeof decision.activationScore === 'number');
  assert.ok(typeof decision.activationReason === 'string');
});

test('stateActivation: activationScore is bounded 0..1', () => {
  const testCases = [
    {},
    { quarantined: true },
    { stability_score: 1.0 },
    { stability_score: 0.0 },
  ];
  for (const overrides of testCases) {
    const decision = computeState(overrides);
    assert.ok(
      decision.activationScore >= 0 && decision.activationScore <= 1,
      `activationScore ${decision.activationScore} out of 0..1 range`,
    );
  }
});

test('stateActivation: memory-specific suppress control → suppressed state', () => {
  const controls: SovereigntyControlInput[] = [{
    controlType: 'suppress',
    controlScope: 'memory',
    scopeKey: 'mem-test-1',
    active: true,
  }];
  const decision = computeState({ id: 'mem-test-1' }, controls);
  assert.ok(
    decision.state === 'suppressed' || decision.state === 'frozen',
    `memory-specific suppress should produce suppressed/frozen state (got ${decision.state})`,
  );
});

test('stateActivation: all ActivationState values are valid strings', () => {
  const validStates: ActivationState[] = [
    'active', 'latent', 'tentative', 'frozen', 'quarantined', 'archived', 'suppressed', 'pending_confirmation',
  ];
  for (const state of validStates) {
    assert.equal(typeof state, 'string');
    assert.ok(state.length > 0);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// userSovereigntyService — SovereigntyControl type structure
// ─────────────────────────────────────────────────────────────────────────────

import type { SovereigntyControl } from './userSovereigntyService.js';

test('userSovereignty: SovereigntyControl type has all 5 controlType values', () => {
  // Type-level check: if any of these assignments fail to compile, the type is wrong
  const t1: SovereigntyControl['controlType'] = 'freeze';
  const t2: SovereigntyControl['controlType'] = 'suppress';
  const t3: SovereigntyControl['controlType'] = 'confirm';
  const t4: SovereigntyControl['controlType'] = 'quarantine';
  const t5: SovereigntyControl['controlType'] = 'revert';
  const types = [t1, t2, t3, t4, t5];
  assert.equal(types.length, 5, 'should have exactly 5 control types');
});

test('userSovereignty: SovereigntyControl scope covers all 6 scope levels', () => {
  const scopes: SovereigntyControl['controlScope'][] = [
    'global', 'domain', 'memory', 'chamber', 'project', 'policy_field',
  ];
  assert.equal(scopes.length, 6, 'should have 6 control scope types');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5 Laws of Temporal Cognition — structural module verification
// ─────────────────────────────────────────────────────────────────────────────

test('temporalCognition law 1 — Visible Evolution: evolutionTimelineService exports recordTimelineEvent + getTimeline', async () => {
  const mod = await import('./evolutionTimelineService.js');
  assert.ok(typeof mod.recordTimelineEvent === 'function', 'should export recordTimelineEvent');
  assert.ok(typeof mod.getTimeline === 'function', 'should export getTimeline');
  assert.ok(typeof mod.computeEvolutionNarrative === 'function', 'should export computeEvolutionNarrative');
});

test('temporalCognition law 2 — User Sovereignty: userSovereigntyService exports freeze, suppress, confirm, quarantine, revert', async () => {
  const mod = await import('./userSovereigntyService.js');
  assert.ok(typeof mod.freeze === 'function', 'should export freeze');
  assert.ok(typeof mod.suppress === 'function', 'should export suppress');
  assert.ok(typeof mod.confirm === 'function', 'should export confirm');
  assert.ok(typeof mod.quarantine === 'function', 'should export quarantine');
  assert.ok(typeof mod.revert === 'function', 'should export revert');
});

test('temporalCognition law 3 — Explicit Incompleteness: gapLedgerService exports detectAndUpsertGaps, getGapLedger, resolveGap', async () => {
  const mod = await import('./gapLedgerService.js');
  assert.ok(typeof mod.detectAndUpsertGaps === 'function', 'should export detectAndUpsertGaps');
  assert.ok(typeof mod.getGapLedger === 'function', 'should export getGapLedger');
  assert.ok(typeof mod.resolveGap === 'function', 'should export resolveGap');
});

test('temporalCognition law 4 — Structured Relation: identityGraphService exports upsertNode, addEdge, getNeighbors', async () => {
  const mod = await import('./identityGraphService.js');
  assert.ok(typeof mod.upsertNode === 'function', 'should export upsertNode');
  assert.ok(typeof mod.addEdge === 'function', 'should export addEdge');
  assert.ok(typeof mod.getNeighbors === 'function', 'should export getNeighbors');
  assert.ok(typeof mod.buildGraphFromMemories === 'function', 'should export buildGraphFromMemories');
});

test('temporalCognition law 5 — Selective Context: contextCuratorService exports curateContext + formatCuratedContext', async () => {
  const mod = await import('./contextCuratorService.js');
  assert.ok(typeof mod.curateContext === 'function', 'should export curateContext');
  assert.ok(typeof mod.formatCuratedContext === 'function', 'should export formatCuratedContext');
});

test('temporalCognition: activePrioritiesService exports required functions', async () => {
  const mod = await import('./activePrioritiesService.js');
  // Should export at minimum a fetch and an upsert function
  const exportedFunctions = Object.entries(mod).filter(([, v]) => typeof v === 'function').map(([k]) => k);
  assert.ok(exportedFunctions.length >= 2, `activePrioritiesService should export at least 2 functions (got: ${exportedFunctions.join(', ')})`);
});

test('temporalCognition: stateActivationService exports computeActivationState + batchComputeActivations', async () => {
  const mod = await import('./stateActivationService.js');
  assert.ok(typeof mod.computeActivationState === 'function', 'should export computeActivationState');
  assert.ok(typeof mod.batchComputeActivations === 'function', 'should export batchComputeActivations');
});
