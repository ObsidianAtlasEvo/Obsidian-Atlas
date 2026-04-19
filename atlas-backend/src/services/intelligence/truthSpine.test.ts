/**
 * truthSpine.test.ts — Phase 0.97 pure-function tests.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAuthorityTier,
  computeCorroborationBonus,
  computeEvidenceWeight,
  aggregateEvidenceScore,
  type EvidenceRow,
} from './evidenceHierarchyService.js';
import {
  transitionClaimStatus,
  computeOperationalEligibility,
  type ClaimRow,
} from './claimGovernanceService.js';
import {
  computeStalenessScore,
  computeDecayedConfidence,
  computeConfidenceTier,
  buildRevalidationQueue,
} from './truthDecayService.js';
import {
  computeAssumptionFragility,
  computeOperationalImpact,
  type AssumptionRow,
} from './assumptionRegistryService.js';
import {
  detectContradictionClusters,
  type ContradictionRow,
} from './contradictionTensionService.js';
import {
  deconstructNarrative,
  computeDistortionRisk,
} from './narrativeDeconstructionService.js';
import {
  formatEpistemicStatus,
  buildEpistemicStatusBlock,
  formatStatusForContext,
} from './epistemicStatusFormatter.js';
import { classifyDrift } from './realityDriftMonitorService.js';

const makeClaim = (overrides: Partial<ClaimRow> = {}): ClaimRow => ({
  id: '123e4567-e89b-42d3-a456-426614174100',
  user_id: '123e4567-e89b-42d3-a456-426614174101',
  claim_text: 'the sky is blue',
  status: 'proposed',
  confidence_score: 0.5,
  evidence_score: 0,
  claim_type: null,
  domain: null,
  claim_metadata: {},
  last_validated_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const makeAssumption = (overrides: Partial<AssumptionRow> = {}): AssumptionRow => ({
  id: '123e4567-e89b-42d3-a456-426614174200',
  user_id: '123e4567-e89b-42d3-a456-426614174101',
  assumption_text: 'users want dark mode',
  fragility_score: 0.5,
  impact_if_false: null,
  domain: null,
  status: 'active',
  assumption_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

// ── computeAuthorityTier (11 evidence types) ─────────────────────────────────
const TIER_SAMPLES: Array<[string, number]> = [
  ['meta_analytic', 1],
  ['experimental', 1],
  ['expert_consensus', 1],
  ['empirical', 2],
  ['statistical', 2],
  ['documentary', 2],
  ['inferential', 3],
  ['analogical', 3],
  ['testimonial', 3],
  ['contextual', 4],
  ['theoretical', 4],
];
for (const [type, tier] of TIER_SAMPLES) {
  test(`computeAuthorityTier: ${type} -> tier ${tier}`, () => {
    assert.equal(computeAuthorityTier(type), tier);
  });
}
test('computeAuthorityTier: unknown type defaults to 3', () => {
  assert.equal(computeAuthorityTier('mystery_type'), 3);
});

// ── computeCorroborationBonus (3 tests) ──────────────────────────────────────
test('computeCorroborationBonus: 0 => 0', () => {
  assert.equal(computeCorroborationBonus(0), 0);
});
test('computeCorroborationBonus: 3 => 0.15', () => {
  assert.equal(computeCorroborationBonus(3), 0.15);
});
test('computeCorroborationBonus: 100 capped at 0.3', () => {
  assert.equal(computeCorroborationBonus(100), 0.3);
});

// ── computeEvidenceWeight (3 tests) ──────────────────────────────────────────
test('computeEvidenceWeight: tier 1 meta_analytic high', () => {
  const w = computeEvidenceWeight('meta_analytic', 1);
  assert.ok(w > 0.5);
});
test('computeEvidenceWeight: tier 4 low', () => {
  const w = computeEvidenceWeight('contextual', 4);
  assert.ok(w < 0.3);
});
test('computeEvidenceWeight: clamps to [0,1]', () => {
  const w = computeEvidenceWeight('unknown', 1);
  assert.ok(w >= 0 && w <= 1);
});

// ── aggregateEvidenceScore (3 tests) ────────────────────────────────────────
test('aggregateEvidenceScore: empty returns 0', () => {
  assert.equal(aggregateEvidenceScore([]), 0);
});
test('aggregateEvidenceScore: strong tier 1 scores high', () => {
  const ev: EvidenceRow[] = [{ evidence_type: 'meta_analytic', authority_tier: 1 }];
  const s = aggregateEvidenceScore(ev);
  assert.ok(s > 0.6);
});
test('aggregateEvidenceScore: multiple tier 1 > single tier 1', () => {
  const solo = aggregateEvidenceScore([
    { evidence_type: 'experimental', authority_tier: 1 },
  ]);
  const many = aggregateEvidenceScore([
    { evidence_type: 'experimental', authority_tier: 1 },
    { evidence_type: 'empirical', authority_tier: 2 },
    { evidence_type: 'experimental', authority_tier: 1 },
  ]);
  assert.ok(many >= solo);
});

// ── transitionClaimStatus (5 tests) ──────────────────────────────────────────
test('transitionClaimStatus: high evidence => supported', () => {
  const c = makeClaim();
  const ev: EvidenceRow[] = [
    { evidence_type: 'meta_analytic', authority_tier: 1 },
    { evidence_type: 'experimental', authority_tier: 1 },
    { evidence_type: 'empirical', authority_tier: 2 },
  ];
  const next = transitionClaimStatus(c, ev);
  assert.equal(next, 'supported');
});
test('transitionClaimStatus: moderate evidence => proposed', () => {
  const c = makeClaim();
  const ev: EvidenceRow[] = [
    { evidence_type: 'analogical', authority_tier: 3 },
  ];
  const next = transitionClaimStatus(c, ev);
  assert.ok(['proposed', 'contested'].includes(next));
});
test('transitionClaimStatus: no evidence => stale', () => {
  const c = makeClaim();
  assert.equal(transitionClaimStatus(c, []), 'stale');
});
test('transitionClaimStatus: retired stays retired', () => {
  const c = makeClaim({ status: 'retired' });
  assert.equal(transitionClaimStatus(c, []), 'retired');
});
test('transitionClaimStatus: low evidence => contested or stale', () => {
  const c = makeClaim();
  const ev: EvidenceRow[] = [
    { evidence_type: 'contextual', authority_tier: 4, weight: 0.05 },
  ];
  const next = transitionClaimStatus(c, ev);
  assert.ok(['contested', 'stale', 'proposed'].includes(next));
});

// ── computeOperationalEligibility (3 tests) ──────────────────────────────────
test('computeOperationalEligibility: supported + high scores => true', () => {
  const c = makeClaim({ status: 'supported', confidence_score: 0.8, evidence_score: 0.7 });
  assert.equal(computeOperationalEligibility(c), true);
});
test('computeOperationalEligibility: not supported => false', () => {
  const c = makeClaim({ status: 'proposed', confidence_score: 0.9, evidence_score: 0.9 });
  assert.equal(computeOperationalEligibility(c), false);
});
test('computeOperationalEligibility: low confidence => false', () => {
  const c = makeClaim({ status: 'supported', confidence_score: 0.3, evidence_score: 0.9 });
  assert.equal(computeOperationalEligibility(c), false);
});

// ── computeConfidenceTier (5 tests) ──────────────────────────────────────────
test('computeConfidenceTier: 0.9 => high', () => {
  assert.equal(computeConfidenceTier(0.9), 'high');
});
test('computeConfidenceTier: 0.7 => strong', () => {
  assert.equal(computeConfidenceTier(0.7), 'strong');
});
test('computeConfidenceTier: 0.5 => moderate', () => {
  assert.equal(computeConfidenceTier(0.5), 'moderate');
});
test('computeConfidenceTier: 0.25 => weak', () => {
  assert.equal(computeConfidenceTier(0.25), 'weak');
});
test('computeConfidenceTier: 0.05 => negligible', () => {
  assert.equal(computeConfidenceTier(0.05), 'negligible');
});

// ── computeStalenessScore (5 tests, per claim type) ──────────────────────────
test('computeStalenessScore: null last_validated_at => 1', () => {
  assert.equal(computeStalenessScore(makeClaim()), 1);
});
test('computeStalenessScore: fresh validation => near 0', () => {
  const c = makeClaim({ last_validated_at: new Date().toISOString() });
  assert.ok(computeStalenessScore(c) < 0.1);
});
test('computeStalenessScore: article 90d threshold', () => {
  const past = new Date(Date.now() - 45 * 86400 * 1000).toISOString();
  const c = makeClaim({ claim_type: 'article', last_validated_at: past });
  assert.ok(computeStalenessScore(c) >= 0.4 && computeStalenessScore(c) <= 0.6);
});
test('computeStalenessScore: project 30d threshold (shorter)', () => {
  const past = new Date(Date.now() - 45 * 86400 * 1000).toISOString();
  const c = makeClaim({ claim_type: 'project', last_validated_at: past });
  assert.equal(computeStalenessScore(c), 1);
});
test('computeStalenessScore: insight 60d threshold', () => {
  const past = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
  const c = makeClaim({ claim_type: 'insight', last_validated_at: past });
  assert.ok(computeStalenessScore(c) < 0.6);
});

// ── computeDecayedConfidence (2 tests) ───────────────────────────────────────
test('computeDecayedConfidence: 0 staleness returns original', () => {
  const c = makeClaim({ confidence_score: 0.8 });
  assert.equal(computeDecayedConfidence(c, 0), 0.8);
});
test('computeDecayedConfidence: full staleness halves it', () => {
  const c = makeClaim({ confidence_score: 0.8 });
  assert.equal(computeDecayedConfidence(c, 1), 0.4);
});

// ── computeAssumptionFragility (4 tests) ─────────────────────────────────────
test('computeAssumptionFragility: invalidated => 1.0', () => {
  assert.equal(computeAssumptionFragility(makeAssumption({ status: 'invalidated' })), 1);
});
test('computeAssumptionFragility: confirmed => 0.2', () => {
  assert.equal(computeAssumptionFragility(makeAssumption({ status: 'confirmed' })), 0.2);
});
test('computeAssumptionFragility: active => 0.7', () => {
  assert.equal(computeAssumptionFragility(makeAssumption({ status: 'active' })), 0.7);
});
test('computeAssumptionFragility: challenged => 0.9', () => {
  assert.equal(computeAssumptionFragility(makeAssumption({ status: 'challenged' })), 0.9);
});

// ── computeOperationalImpact (2 tests) ───────────────────────────────────────
test('computeOperationalImpact: long impact_if_false higher', () => {
  const a1 = makeAssumption({ impact_if_false: 'a'.repeat(200) });
  const a2 = makeAssumption({ impact_if_false: 'b' });
  assert.ok(computeOperationalImpact(a1) > computeOperationalImpact(a2));
});
test('computeOperationalImpact: clamps to [0,1]', () => {
  const a = makeAssumption({ impact_if_false: 'x'.repeat(9999) });
  assert.equal(computeOperationalImpact(a), 1);
});

// ── detectContradictionClusters (3 tests) ────────────────────────────────────
const makeCt = (a: string): ContradictionRow => ({
  id: '123e4567-e89b-42d3-a456-42661417030' + (Math.floor(Math.random() * 10)),
  user_id: 'u',
  claim_a_id: a,
  claim_b_id: 'other',
  tension_score: 0.5,
  resolution_status: 'unresolved',
  contradiction_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});
test('detectContradictionClusters: empty => empty', () => {
  assert.deepEqual(detectContradictionClusters([]), []);
});
test('detectContradictionClusters: singletons not clustered', () => {
  assert.deepEqual(detectContradictionClusters([makeCt('a'), makeCt('b')]), []);
});
test('detectContradictionClusters: duplicates clustered', () => {
  const cluster = detectContradictionClusters([makeCt('a'), makeCt('a'), makeCt('b')]);
  assert.equal(cluster.length, 1);
  assert.equal(cluster[0]!.length, 2);
});

// ── deconstructNarrative (4 tests) ───────────────────────────────────────────
test('deconstructNarrative: empty text => empty arrays', () => {
  const out = deconstructNarrative('');
  assert.equal(out.claims.length, 0);
  assert.equal(out.assumptions.length, 0);
  assert.equal(out.framingDevices.length, 0);
});
test('deconstructNarrative: detects claims with "is"', () => {
  const out = deconstructNarrative('The sky is blue.');
  assert.ok(out.claims.length >= 1);
});
test('deconstructNarrative: detects framing device "always"', () => {
  const out = deconstructNarrative('Users always want speed.');
  assert.ok(out.framingDevices.length >= 1);
});
test('deconstructNarrative: detects assumption "because"', () => {
  const out = deconstructNarrative('We ship because users need it.');
  assert.ok(out.assumptions.length >= 1);
});

// ── computeDistortionRisk (2 tests) ──────────────────────────────────────────
test('computeDistortionRisk: zero devices => 0', () => {
  assert.equal(computeDistortionRisk({ framingDevices: [], assumptions: [] }), 0);
});
test('computeDistortionRisk: many devices saturates at 1', () => {
  const fd = Array.from({ length: 20 }, (_, i) => `d${i}`);
  assert.equal(computeDistortionRisk({ framingDevices: fd, assumptions: [] }), 1);
});

// ── formatEpistemicStatus (6 tests) ──────────────────────────────────────────
test('formatEpistemicStatus: retired', () => {
  assert.equal(formatEpistemicStatus(makeClaim({ status: 'retired' })), 'RETIRED');
});
test('formatEpistemicStatus: stale', () => {
  assert.equal(formatEpistemicStatus(makeClaim({ status: 'stale' })), 'STALE');
});
test('formatEpistemicStatus: contested => CONTRADICTED', () => {
  assert.equal(formatEpistemicStatus(makeClaim({ status: 'contested' })), 'CONTRADICTED');
});
test('formatEpistemicStatus: supported + high conf => VERIFIED', () => {
  assert.equal(
    formatEpistemicStatus(makeClaim({ status: 'supported', confidence_score: 0.9 })),
    'VERIFIED',
  );
});
test('formatEpistemicStatus: supported + moderate conf => STRONG', () => {
  assert.equal(
    formatEpistemicStatus(makeClaim({ status: 'supported', confidence_score: 0.7 })),
    'STRONG',
  );
});
test('formatEpistemicStatus: proposed => TENTATIVE', () => {
  assert.equal(formatEpistemicStatus(makeClaim({ status: 'proposed' })), 'TENTATIVE');
});

// ── buildEpistemicStatusBlock (2 tests) ──────────────────────────────────────
test('buildEpistemicStatusBlock: empty list yields zero counts', () => {
  const s = buildEpistemicStatusBlock([]);
  assert.match(s, /verified:0/);
});
test('buildEpistemicStatusBlock: counts claims', () => {
  const claims = [
    makeClaim({ status: 'supported', confidence_score: 0.9 }),
    makeClaim({ status: 'contested' }),
  ];
  const s = buildEpistemicStatusBlock(claims);
  assert.match(s, /verified:1/);
  assert.match(s, /contradicted:1/);
});

// ── formatStatusForContext (2 tests) ─────────────────────────────────────────
test('formatStatusForContext: no claims message', () => {
  assert.match(formatStatusForContext([]), /no active claims/);
});
test('formatStatusForContext: counts claims', () => {
  const c = [makeClaim({ status: 'supported' })];
  assert.match(formatStatusForContext(c), /supported:1/);
});

// ── buildRevalidationQueue (2 tests) ─────────────────────────────────────────
test('buildRevalidationQueue: fresh claims excluded', () => {
  const c = makeClaim({ last_validated_at: new Date().toISOString() });
  assert.deepEqual(buildRevalidationQueue([c]), []);
});
test('buildRevalidationQueue: null last_validated_at included', () => {
  const c = makeClaim({ last_validated_at: null });
  assert.equal(buildRevalidationQueue([c]).length, 1);
});

// ── classifyDrift (7 classes) ────────────────────────────────────────────────
test('classifyDrift: identity keyword => self_model', () => {
  assert.equal(classifyDrift('my identity has shifted'), 'self_model');
});
test('classifyDrift: assumption keyword => assumption', () => {
  assert.equal(classifyDrift('I assumed X was true'), 'assumption');
});
test('classifyDrift: project keyword => project', () => {
  assert.equal(classifyDrift('the project timeline changed'), 'project');
});
test('classifyDrift: strategic keyword => strategic', () => {
  assert.equal(classifyDrift('our strategy shifted'), 'strategic');
});
test('classifyDrift: narrative keyword => narrative', () => {
  assert.equal(classifyDrift('the story i tell myself'), 'narrative');
});
test('classifyDrift: confidence keyword => confidence', () => {
  assert.equal(classifyDrift('I am no longer sure'), 'confidence');
});
test('classifyDrift: default => epistemic', () => {
  assert.equal(classifyDrift('something happened'), 'epistemic');
});
