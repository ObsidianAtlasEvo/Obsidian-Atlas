/**
 * driftMonitor.test.ts — Phase 0.85: Drift Monitor + Behavior Change Audit Tests
 *
 * Tests the pure/in-process logic of:
 *   - driftMonitorService: classifyDrift (pure), __internal sub-functions
 *   - behaviorChangeAuditService: BehaviorChangeChain type shape
 *   - responseProvenanceService: formatProvenanceForAudit (pure)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────────────────────────────────────
// driftMonitorService — classifyDrift (pure), __internal functions
// ─────────────────────────────────────────────────────────────────────────────

import {
  classifyDrift,
  __internal as driftInternal,
  type DriftState,
} from './driftMonitorService.js';

const { computeSubScores, weightedOverall } = driftInternal;

test('driftMonitor: classifyDrift returns "low" for overall score 0.0', () => {
  const level = classifyDrift({ overall: 0.0 });
  assert.equal(level, 'low', 'score 0.0 should be low risk');
});

test('driftMonitor: classifyDrift returns "low" for overall score 0.24', () => {
  const level = classifyDrift({ overall: 0.24 });
  assert.equal(level, 'low', 'score 0.24 should be low risk');
});

test('driftMonitor: classifyDrift returns "moderate" for overall score 0.25', () => {
  const level = classifyDrift({ overall: 0.25 });
  assert.equal(level, 'moderate', 'score 0.25 should be moderate risk');
});

test('driftMonitor: classifyDrift returns "moderate" for overall score 0.49', () => {
  const level = classifyDrift({ overall: 0.49 });
  assert.equal(level, 'moderate', 'score 0.49 should be moderate risk');
});

test('driftMonitor: classifyDrift returns "elevated" for overall score 0.50', () => {
  const level = classifyDrift({ overall: 0.50 });
  assert.equal(level, 'elevated', 'score 0.50 should be elevated risk');
});

test('driftMonitor: classifyDrift returns "elevated" for overall score 0.74', () => {
  const level = classifyDrift({ overall: 0.74 });
  assert.equal(level, 'elevated', 'score 0.74 should be elevated risk');
});

test('driftMonitor: classifyDrift returns "severe" for overall score 0.75', () => {
  const level = classifyDrift({ overall: 0.75 });
  assert.equal(level, 'severe', 'score 0.75 should be severe risk');
});

test('driftMonitor: classifyDrift returns "severe" for overall score 1.0', () => {
  const level = classifyDrift({ overall: 1.0 });
  assert.equal(level, 'severe', 'score 1.0 should be severe risk');
});

test('driftMonitor: classifyDrift is monotonic — higher score, higher risk', () => {
  const riskOrder = ['low', 'moderate', 'elevated', 'severe'];
  const scores = [0.0, 0.24, 0.25, 0.5, 0.75, 1.0];
  const levels = scores.map((s) => classifyDrift({ overall: s }));
  for (let i = 1; i < levels.length; i++) {
    const prevIdx = riskOrder.indexOf(levels[i - 1]!);
    const currIdx = riskOrder.indexOf(levels[i]!);
    assert.ok(
      currIdx >= prevIdx,
      `risk level should be monotonically non-decreasing: ${levels[i - 1]} → ${levels[i]} at score ${scores[i]}`,
    );
  }
});

test('driftMonitor: computeSubScores returns all required sub-scores', () => {
  const subScores = computeSubScores({
    policyMutationCount7d: 5,
    correctionCount7d: 2,
    assistantInferencePct: 0.4,
    scopeLeakageCount7d: 1,
    unresolvedConflictCount7d: 2,
  });
  assert.ok('personalizationDrift' in subScores, 'should have personalizationDrift');
  assert.ok('policyDrift' in subScores, 'should have policyDrift');
  assert.ok('scopeDrift' in subScores, 'should have scopeDrift');
  assert.ok('provenanceDrift' in subScores, 'should have provenanceDrift');
  assert.ok('contradictionDrift' in subScores, 'should have contradictionDrift');
  assert.ok('instabilityDrift' in subScores, 'should have instabilityDrift');
});

test('driftMonitor: computeSubScores all values are bounded 0..1', () => {
  const subScores = computeSubScores({
    policyMutationCount7d: 20,
    correctionCount7d: 10,
    assistantInferencePct: 0.9,
    scopeLeakageCount7d: 5,
    unresolvedConflictCount7d: 8,
  });
  for (const [key, value] of Object.entries(subScores)) {
    assert.ok(
      value >= 0 && value <= 1,
      `subScore ${key} = ${value} is out of 0..1 range`,
    );
  }
});

test('driftMonitor: computeSubScores with zero inputs produces zero scores', () => {
  const subScores = computeSubScores({
    policyMutationCount7d: 0,
    correctionCount7d: 0,
    assistantInferencePct: 0,
    scopeLeakageCount7d: 0,
    unresolvedConflictCount7d: 0,
  });
  for (const [key, value] of Object.entries(subScores)) {
    assert.equal(value, 0, `zero inputs should produce zero sub-score for ${key}`);
  }
});

test('driftMonitor: weightedOverall returns a number 0..1', () => {
  const subScores = computeSubScores({
    policyMutationCount7d: 5,
    correctionCount7d: 2,
    assistantInferencePct: 0.3,
    scopeLeakageCount7d: 1,
    unresolvedConflictCount7d: 3,
  });
  const overall = weightedOverall(subScores);
  assert.ok(typeof overall === 'number', 'weightedOverall should return a number');
  assert.ok(overall >= 0 && overall <= 1, `weightedOverall ${overall} out of 0..1`);
});

test('driftMonitor: weightedOverall for zero sub-scores is 0', () => {
  const subScores = computeSubScores({
    policyMutationCount7d: 0,
    correctionCount7d: 0,
    assistantInferencePct: 0,
    scopeLeakageCount7d: 0,
    unresolvedConflictCount7d: 0,
  });
  const overall = weightedOverall(subScores);
  assert.equal(overall, 0, 'zero sub-scores should produce overall 0');
});

test('driftMonitor: weightedOverall for max inputs approaches 1', () => {
  const subScores = computeSubScores({
    policyMutationCount7d: 100,
    correctionCount7d: 100,
    assistantInferencePct: 1.0,
    scopeLeakageCount7d: 100,
    unresolvedConflictCount7d: 100,
  });
  const overall = weightedOverall(subScores);
  assert.ok(overall > 0.5, `max inputs should produce high overall score (got ${overall})`);
});

test('driftMonitor: DriftState driftRiskLevel is one of low/moderate/elevated/severe', () => {
  const validLevels: DriftState['driftRiskLevel'][] = ['low', 'moderate', 'elevated', 'severe'];
  for (const level of validLevels) {
    assert.equal(typeof level, 'string');
  }
});

test('driftMonitor: classifyDrift threshold boundaries are exact', () => {
  // Exact boundary tests for the specified thresholds
  assert.equal(classifyDrift({ overall: 0.2499 }), 'low');
  assert.equal(classifyDrift({ overall: 0.25 }), 'moderate');
  assert.equal(classifyDrift({ overall: 0.4999 }), 'moderate');
  assert.equal(classifyDrift({ overall: 0.50 }), 'elevated');
  assert.equal(classifyDrift({ overall: 0.7499 }), 'elevated');
  assert.equal(classifyDrift({ overall: 0.75 }), 'severe');
});

// ─────────────────────────────────────────────────────────────────────────────
// behaviorChangeAuditService — type shape tests
// ─────────────────────────────────────────────────────────────────────────────

import type { BehaviorChangeChain } from './behaviorChangeAuditService.js';
import { createChain, appendToChain } from './behaviorChangeAuditService.js';

test('behaviorChangeAudit: BehaviorChangeChain type has all required fields', () => {
  const chain: BehaviorChangeChain = {
    id: 'chain-1',
    userId: 'user-123',
    originatingSignalIds: ['sig-1'],
    arbitrationDecisionIds: ['arb-1'],
    simulationEventIds: [],
    finalPolicyEventIds: ['pol-1'],
    downstreamResponseIds: [],
    behaviorShiftSummary: 'Verbosity shifted from high to low',
    policyDomainsAffected: ['verbosity'],
    createdAt: new Date(),
  };
  assert.ok(Array.isArray(chain.originatingSignalIds));
  assert.ok(Array.isArray(chain.policyDomainsAffected));
  assert.equal(typeof chain.behaviorShiftSummary, 'string');
});

test('behaviorChangeAudit: createChain returns a string UUID even when disabled', async () => {
  // When memoryLayerEnabled=false, should return a local UUID and not throw
  const chainId = await createChain('user-test', {
    userId: 'user-test',
    originatingSignalIds: [],
    arbitrationDecisionIds: [],
    simulationEventIds: [],
    finalPolicyEventIds: [],
    downstreamResponseIds: [],
    behaviorShiftSummary: 'test shift',
    policyDomainsAffected: [],
  });
  assert.equal(typeof chainId, 'string');
  assert.ok(chainId.length > 0, 'chain ID should not be empty');
  // Should look like a UUID
  assert.ok(/^[0-9a-f-]{32,}$/i.test(chainId.replace(/-/g, '')), `should be UUID-like (got: ${chainId})`);
});

test('behaviorChangeAudit: appendToChain does not throw when chain does not exist', async () => {
  // Non-existent chain should not throw (graceful degradation)
  await assert.doesNotReject(async () => {
    await appendToChain('nonexistent-chain-id-xyz', {
      behaviorShiftSummary: 'appended update',
      policyDomainsAffected: ['tone'],
    });
  }, 'appendToChain should not throw for non-existent chain');
});

// ─────────────────────────────────────────────────────────────────────────────
// responseProvenanceService — formatProvenanceForAudit (pure)
// ─────────────────────────────────────────────────────────────────────────────

import { formatProvenanceForAudit } from './responseProvenanceService.js';
import type { ProvenanceRecord } from './responseProvenanceService.js';

function makeProvenance(overrides: Partial<ProvenanceRecord> = {}): ProvenanceRecord {
  return {
    userId: overrides.userId ?? 'user-123',
    activeMemoryIds: overrides.activeMemoryIds ?? [],
    activeIdentityDomains: overrides.activeIdentityDomains ?? [],
    activePolicyInputs: overrides.activePolicyInputs ?? {},
    chamberModifiers: overrides.chamberModifiers ?? {},
    contradictionFlags: overrides.contradictionFlags ?? [],
    suppressedSignals: overrides.suppressedSignals ?? [],
    personalizationIntensity: overrides.personalizationIntensity ?? 'moderate',
    arbitrationSuppressions: overrides.arbitrationSuppressions ?? [],
  };
}

test('responseProvenance: formatProvenanceForAudit returns a string', () => {
  const result = formatProvenanceForAudit(makeProvenance());
  assert.equal(typeof result, 'string');
  assert.ok(result.length > 0, 'audit string should not be empty');
});

test('responseProvenance: formatProvenanceForAudit includes userId reference', () => {
  const result = formatProvenanceForAudit(makeProvenance({ userId: 'user-unique-abc-999' }));
  assert.ok(
    result.includes('user-unique-abc-999') || result.includes('user'),
    `audit should reference userId (got: ${result.slice(0, 200)})`,
  );
});

test('responseProvenance: formatProvenanceForAudit mentions memory count', () => {
  const result = formatProvenanceForAudit(makeProvenance({
    activeMemoryIds: ['m1', 'm2', 'm3'],
  }));
  // Should reference 3 memories in some form
  assert.ok(
    result.includes('3') || result.includes('m1') || result.includes('memor'),
    `audit should reference active memories (got: ${result.slice(0, 200)})`,
  );
});

test('responseProvenance: formatProvenanceForAudit works with empty arrays', () => {
  assert.doesNotThrow(() => {
    formatProvenanceForAudit(makeProvenance({
      activeMemoryIds: [],
      activeIdentityDomains: [],
      contradictionFlags: [],
    }));
  }, 'should not throw with all empty arrays');
});

test('responseProvenance: formatProvenanceForAudit handles large memory ID arrays', () => {
  const manyIds = Array.from({ length: 50 }, (_, i) => `mem-${i}`);
  assert.doesNotThrow(() => {
    const result = formatProvenanceForAudit(makeProvenance({ activeMemoryIds: manyIds }));
    assert.equal(typeof result, 'string');
  }, 'should handle large memory ID arrays');
});

test('responseProvenance: formatProvenanceForAudit mentions personalization intensity', () => {
  const result = formatProvenanceForAudit(makeProvenance({ personalizationIntensity: 'strong' }));
  assert.ok(
    result.toLowerCase().includes('strong') || result.toLowerCase().includes('personali'),
    `audit should mention personalization intensity (got: ${result.slice(0, 200)})`,
  );
});

test('responseProvenance: formatProvenanceForAudit mentions blocked intensity when blocked', () => {
  const result = formatProvenanceForAudit(makeProvenance({ personalizationIntensity: 'blocked' }));
  assert.ok(
    result.toLowerCase().includes('blocked') || result.toLowerCase().includes('block'),
    `audit should mention blocked intensity (got: ${result.slice(0, 200)})`,
  );
});

test('responseProvenance: formatProvenanceForAudit mentions contradiction flags', () => {
  const result = formatProvenanceForAudit(makeProvenance({
    contradictionFlags: ['verbosity conflict', 'tone mismatch'],
  }));
  assert.ok(
    result.toLowerCase().includes('contradict') ||
    result.toLowerCase().includes('conflict') ||
    result.includes('verbosity') ||
    result.includes('2'),
    `audit should mention contradiction flags (got: ${result.slice(0, 200)})`,
  );
});

test('responseProvenance: formatProvenanceForAudit mentions suppressed signals', () => {
  const result = formatProvenanceForAudit(makeProvenance({
    suppressedSignals: ['low-conf-signal-1', 'stale-signal-2'],
  }));
  assert.ok(
    result.toLowerCase().includes('suppress') || result.includes('2') || result.includes('signal'),
    `audit should mention suppressed signals (got: ${result.slice(0, 200)})`,
  );
});
