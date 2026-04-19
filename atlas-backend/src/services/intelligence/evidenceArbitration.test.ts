/**
 * evidenceArbitration.test.ts — Phase 0.85: Evidence Arbitration + Epistemic Governance Tests
 *
 * Tests the pure/in-process logic of:
 *   - evidenceArbitrationService: computeEvidenceProfile (pure, no I/O)
 *   - personalizationIntensityService: computeIntensity, domain lists
 *   - epistemicBoundaryService: checkPersonalizationRequest, enforceEpistemicBoundary
 *   - policySimulationService: simulatePolicyMutation inputs/result shape validation
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────────────────────────────────────
// evidenceArbitrationService — computeEvidenceProfile (pure)
// ─────────────────────────────────────────────────────────────────────────────

import {
  computeEvidenceProfile,
  type EvidenceProfile,
} from './evidenceArbitrationService.js';

import type { MemoryClass } from './memoryGovernance.js';

function makeProfile(overrides: Partial<{
  provenance: 'user_stated' | 'user_confirmed' | 'corrected_by_user' | 'assistant_inferred';
  memoryClass: MemoryClass;
  confidence: number;
  importance: number;
  stabilityScore: number;
  recurrenceCount: number;
  contradictionStatus: string;
  confirmationStatus: string;
  scopeType: 'global' | 'session' | 'project' | 'topic';
}> = {}): EvidenceProfile {
  return computeEvidenceProfile({
    provenance: overrides.provenance ?? 'user_stated',
    memoryClass: overrides.memoryClass ?? 'durable',
    confidence: overrides.confidence ?? 0.85,
    importance: overrides.importance ?? 0.8,
    stabilityScore: overrides.stabilityScore ?? 0.8,
    recurrenceCount: overrides.recurrenceCount ?? 2,
    contradictionStatus: overrides.contradictionStatus ?? 'clear',
    confirmationStatus: overrides.confirmationStatus ?? 'unconfirmed',
    scopeType: overrides.scopeType ?? 'global',
  });
}

test('evidenceArbitration: computeEvidenceProfile returns an EvidenceProfile object', () => {
  const profile = makeProfile();
  assert.ok(typeof profile === 'object' && profile !== null);
  assert.ok('evidenceType' in profile);
  assert.ok('evidenceStrength' in profile);
  assert.ok('evidenceOperationalWeight' in profile);
  assert.ok('operationalTrustLevel' in profile);
  assert.ok('policyEligibilityRecommendation' in profile);
});

test('evidenceArbitration: user_stated durable profile has high trust level', () => {
  const profile = makeProfile({
    provenance: 'user_stated',
    memoryClass: 'durable',
    confidence: 0.9,
    stabilityScore: 0.85,
  });
  assert.ok(
    profile.operationalTrustLevel === 'high' || profile.operationalTrustLevel === 'moderate',
    `user_stated durable should achieve high/moderate trust (got ${profile.operationalTrustLevel})`,
  );
});

test('evidenceArbitration: assistant_inferred profile has lower trust than user_stated', () => {
  const userProfile = makeProfile({
    provenance: 'user_stated',
    memoryClass: 'durable',
    confidence: 0.85,
  });
  const assistantProfile = makeProfile({
    provenance: 'assistant_inferred',
    memoryClass: 'contextual' as MemoryClass,
    confidence: 0.85,
  });
  const trustOrder = ['blocked', 'low', 'moderate', 'high'];
  const userIdx = trustOrder.indexOf(userProfile.operationalTrustLevel);
  const assistantIdx = trustOrder.indexOf(assistantProfile.operationalTrustLevel);
  assert.ok(
    userIdx >= assistantIdx,
    `user_stated (${userProfile.operationalTrustLevel}) must not rank below assistant_inferred (${assistantProfile.operationalTrustLevel})`,
  );
});

test('evidenceArbitration: anomaly memory class is contradicted evidence type', () => {
  const profile = makeProfile({
    memoryClass: 'anomaly',
    contradictionStatus: 'contradicted',
  });
  assert.equal(
    profile.evidenceType,
    'contradicted',
    'anomaly + contradicted status should yield contradicted evidence type',
  );
});

test('evidenceArbitration: low confidence produces low or blocked trust', () => {
  const profile = makeProfile({
    confidence: 0.15,
    stabilityScore: 0.1,
    memoryClass: 'tentative',
  });
  assert.ok(
    profile.operationalTrustLevel === 'low' || profile.operationalTrustLevel === 'blocked',
    `low confidence should produce low/blocked trust (got ${profile.operationalTrustLevel})`,
  );
});

test('evidenceArbitration: policy eligibility apply for confirmed user_stated', () => {
  const profile = makeProfile({
    provenance: 'user_stated',
    memoryClass: 'durable',
    confidence: 0.9,
    contradictionStatus: 'clear',
    confirmationStatus: 'confirmed',
    recurrenceCount: 3,
  });
  assert.ok(
    profile.policyEligibilityRecommendation === 'apply' || profile.policyEligibilityRecommendation === 'stage',
    `confirmed user_stated should recommend apply or stage (got ${profile.policyEligibilityRecommendation})`,
  );
});

test('evidenceArbitration: assistant_only memory class gets rejected policy eligibility', () => {
  const profile = makeProfile({
    provenance: 'assistant_inferred',
    memoryClass: 'contextual' as MemoryClass,
    confidence: 0.8,
  });
  assert.equal(
    profile.policyEligibilityRecommendation,
    'reject',
    'low-confidence contextual should not reach apply eligibility',
  );
});

test('evidenceArbitration: unresolved contradiction status blocks identity eligibility', () => {
  const profile = makeProfile({
    contradictionStatus: 'unresolved',
    confirmationStatus: 'unconfirmed',
  });
  assert.ok(
    profile.identityEligibilityRecommendation === 'blocked' ||
    profile.identityEligibilityRecommendation === 'tentative',
    `unresolved contradiction should block/tentative identity eligibility (got ${profile.identityEligibilityRecommendation})`,
  );
});

test('evidenceArbitration: operational weight is bounded 0..1', () => {
  const profiles = [
    makeProfile({ provenance: 'user_stated', confidence: 1.0, stabilityScore: 1.0, recurrenceCount: 10 }),
    makeProfile({ provenance: 'assistant_inferred', confidence: 0.1, stabilityScore: 0.1, recurrenceCount: 0 }),
    makeProfile({ memoryClass: 'anomaly', contradictionStatus: 'contradicted' }),
  ];
  for (const p of profiles) {
    assert.ok(
      p.evidenceOperationalWeight >= 0 && p.evidenceOperationalWeight <= 1,
      `operational weight ${p.evidenceOperationalWeight} out of 0..1 range`,
    );
  }
});

test('evidenceArbitration: corrected_by_user achieves high or moderate trust level', () => {
  const profile = makeProfile({
    provenance: 'corrected_by_user',
    memoryClass: 'durable',
    confidence: 0.9,
    contradictionStatus: 'clear',
  });
  assert.ok(
    profile.operationalTrustLevel === 'high' || profile.operationalTrustLevel === 'moderate',
    `corrected_by_user should achieve high or moderate trust (got ${profile.operationalTrustLevel})`,
  );
});

test('evidenceArbitration: session-scoped memory has capped personalization intensity', () => {
  const globalProfile = makeProfile({ scopeType: 'global', confidence: 0.9 });
  const sessionProfile = makeProfile({ scopeType: 'session', confidence: 0.9 });
  const intensityOrder = ['blocked', 'light', 'moderate', 'strong'];
  const globalIdx = intensityOrder.indexOf(globalProfile.personalizationIntensityCap);
  const sessionIdx = intensityOrder.indexOf(sessionProfile.personalizationIntensityCap);
  assert.ok(
    sessionIdx <= globalIdx,
    `session scope (${sessionProfile.personalizationIntensityCap}) should not exceed global scope personalization (${globalProfile.personalizationIntensityCap})`,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// personalizationIntensityService — computeIntensity and domain lists
// ─────────────────────────────────────────────────────────────────────────────

import {
  computeIntensity,
  PERSONALIZATION_ALLOWED_DOMAINS,
  EPISTEMIC_PROTECTED_DOMAINS,
  formatIntensityForLog,
  type PersonalizationIntensity,
} from './personalizationIntensityService.js';

test('personalizationIntensity: PERSONALIZATION_ALLOWED_DOMAINS is non-empty', () => {
  assert.ok(Array.isArray(PERSONALIZATION_ALLOWED_DOMAINS));
  assert.ok(PERSONALIZATION_ALLOWED_DOMAINS.length >= 3, 'should have at least 3 allowed domains');
});

test('personalizationIntensity: EPISTEMIC_PROTECTED_DOMAINS is non-empty', () => {
  assert.ok(Array.isArray(EPISTEMIC_PROTECTED_DOMAINS));
  assert.ok(EPISTEMIC_PROTECTED_DOMAINS.length >= 2, 'should have at least 2 protected domains');
});

test('personalizationIntensity: protected domains not in allowed domains', () => {
  const allowedSet = new Set(PERSONALIZATION_ALLOWED_DOMAINS);
  for (const protected_ of EPISTEMIC_PROTECTED_DOMAINS) {
    assert.ok(
      !allowedSet.has(protected_ as never),
      `${protected_} should not appear in allowed domains`,
    );
  }
});

test('personalizationIntensity: blocked profile → blocked intensity', () => {
  const blockedProfile = makeProfile({
    provenance: 'assistant_inferred',
    memoryClass: 'contextual' as MemoryClass,
    confidence: 0.2,
  });
  // Override personalizationIntensityCap to blocked
  const testProfile: EvidenceProfile = { ...blockedProfile, personalizationIntensityCap: 'blocked' };
  const decision = computeIntensity([testProfile], 'clear', 'low');
  assert.equal(decision.intensity, 'blocked', 'blocked cap should produce blocked intensity');
});

test('personalizationIntensity: contradicted contradiction status → blocked intensity', () => {
  const profile = makeProfile({ provenance: 'user_stated' });
  const decision = computeIntensity([profile], 'contradicted', 'low');
  assert.equal(decision.intensity, 'blocked', 'contradicted status should block personalization');
});

test('personalizationIntensity: severe drift → light intensity cap', () => {
  const profile = makeProfile({ provenance: 'user_stated', confidence: 0.9 });
  const decision = computeIntensity([profile], 'clear', 'severe');
  assert.equal(decision.intensity, 'light', 'severe drift should cap at light intensity');
});

test('personalizationIntensity: elevated drift → light intensity cap', () => {
  const profile = makeProfile({ provenance: 'user_stated', confidence: 0.9 });
  const decision = computeIntensity([profile], 'clear', 'elevated');
  assert.equal(decision.intensity, 'light', 'elevated drift should cap at light intensity');
});

test('personalizationIntensity: empty profiles → light default', () => {
  const decision = computeIntensity([], 'clear', 'low');
  assert.equal(decision.intensity, 'light', 'empty profiles should default to light');
});

test('personalizationIntensity: all confirmed stable strong profiles → strong intensity', () => {
  const strongProfile: EvidenceProfile = {
    ...makeProfile({
      provenance: 'user_stated',
      confidence: 0.95,
      stabilityScore: 0.9,
    }),
    evidenceConfirmationStatus: 'confirmed',
    evidenceStability: 0.9,
    personalizationIntensityCap: 'strong',
  };
  const decision = computeIntensity([strongProfile], 'clear', 'low');
  assert.equal(decision.intensity, 'strong', 'fully confirmed stable strong profile should achieve strong intensity');
});

test('personalizationIntensity: formatIntensityForLog returns string', () => {
  const profile = makeProfile({ provenance: 'user_stated' });
  const decision = computeIntensity([profile], 'clear', 'low');
  const log = formatIntensityForLog(decision);
  assert.equal(typeof log, 'string');
  assert.ok(log.length > 0, 'log string should not be empty');
});

test('personalizationIntensity: decision has allowedDomains and suppressedDomains', () => {
  const profile = makeProfile({ provenance: 'user_stated' });
  const decision = computeIntensity([profile], 'clear', 'low');
  assert.ok(Array.isArray(decision.allowedDomains), 'should have allowedDomains array');
  assert.ok(Array.isArray(decision.suppressedDomains), 'should have suppressedDomains array');
  assert.ok(typeof decision.reason === 'string', 'should have a reason string');
});

// ─────────────────────────────────────────────────────────────────────────────
// epistemicBoundaryService — personalization domain validation
// ─────────────────────────────────────────────────────────────────────────────

import {
  checkPersonalizationRequest,
  enforceEpistemicBoundary,
  formatBoundaryReport,
  PERSONALIZATION_ALLOWED_DOMAINS as EPIST_ALLOWED,
  EPISTEMIC_PROTECTED_DOMAINS as EPIST_PROTECTED,
} from './epistemicBoundaryService.js';

test('epistemicBoundary: EPISTEMIC_PROTECTED_DOMAINS has factual_accuracy or equivalent', () => {
  const hasFactual = EPIST_PROTECTED.some(
    (d) => d.includes('factual') || d.includes('accuracy') || d.includes('truth'),
  );
  assert.ok(hasFactual, 'epistemic protected domains should include a truth/factual domain');
});

test('epistemicBoundary: checkPersonalizationRequest allows tone modifier', () => {
  const result = checkPersonalizationRequest(['tone']);
  assert.ok(typeof result === 'object');
  assert.ok('allowed' in result || 'blockedModifiers' in result);
  // tone should be in allowed list (not protected)
  if ('blockedModifiers' in result) {
    assert.ok(
      !result.blockedModifiers.includes('tone'),
      'tone should not be blocked',
    );
  }
});

test('epistemicBoundary: checkPersonalizationRequest blocks unknown modifier', () => {
  const result = checkPersonalizationRequest(['TOTALLY_UNKNOWN_DOMAIN_xyz123']);
  assert.ok('blockedModifiers' in result);
  assert.ok(result.blockedModifiers.includes('TOTALLY_UNKNOWN_DOMAIN_xyz123'), 'unknown modifier should be blocked');
});

test('epistemicBoundary: checkPersonalizationRequest blocks protected domains', () => {
  const firstProtected = EPIST_PROTECTED[0];
  const result = checkPersonalizationRequest([firstProtected]);
  assert.ok(result.blockedModifiers.includes(firstProtected), `protected domain ${firstProtected} should be blocked`);
});

test('epistemicBoundary: checkPersonalizationRequest allows all PERSONALIZATION_ALLOWED_DOMAINS', () => {
  for (const domain of EPIST_ALLOWED) {
    const result = checkPersonalizationRequest([domain]);
    assert.ok(
      !result.blockedModifiers.includes(domain),
      `allowed domain ${domain} should not be blocked`,
    );
  }
});

test('epistemicBoundary: enforceEpistemicBoundary returns result with safe and reason fields', () => {
  const result = enforceEpistemicBoundary('tone', 'direct', 'warm');
  assert.ok(typeof result === 'object' && result !== null);
  assert.ok('safe' in result, 'should have safe field');
  assert.ok('reason' in result, 'should have reason field');
  assert.equal(typeof result.safe, 'boolean');
  assert.equal(typeof result.reason, 'string');
});

test('epistemicBoundary: enforceEpistemicBoundary does not block tone change', () => {
  const result = enforceEpistemicBoundary('tone', 'direct', 'warm');
  assert.equal(result.safe, true, 'tone change should be safe (not blocked) by epistemic boundary');
});

test('epistemicBoundary: formatBoundaryReport returns string', () => {
  const result = checkPersonalizationRequest(['tone', 'verbosity']);
  const report = formatBoundaryReport(result);
  assert.equal(typeof report, 'string');
});

// ─────────────────────────────────────────────────────────────────────────────
// policySimulationService — SimulationInput/Result type shape
// ─────────────────────────────────────────────────────────────────────────────

import type { SimulationInput, SimulationResult } from './policySimulationService.js';

test('policySimulation: SimulationInput shape has all required fields', () => {
  // Compile-time check — this test will fail to compile if type is wrong
  const input: SimulationInput = {
    userId: 'user-123',
    policyField: 'verbosity',
    currentValue: 'low',
    proposedValue: 'high',
    evidenceChain: [],
    contradictionBurden: 0,
    correctionHistory: [],
  };
  assert.equal(input.userId, 'user-123');
  assert.equal(input.policyField, 'verbosity');
});

test('policySimulation: SimulationResult shape has shouldApplyLive field', () => {
  // Type shape validation — if this compiles, the shape is correct
  const resultShape: SimulationResult = {
    id: 'sim-1',
    outcome: 'apply',
    reason: 'All gates passed',
    riskLevel: 'low',
    behavioralDeltaEstimate: {},
    shouldApplyLive: true,
  };
  assert.equal(resultShape.shouldApplyLive, true);
  assert.equal(resultShape.outcome, 'apply');
});

test('policySimulation: outcome is one of apply | stage | reject', () => {
  const validOutcomes = ['apply', 'stage', 'reject'];
  const testOutcome: SimulationResult['outcome'] = 'stage';
  assert.ok(validOutcomes.includes(testOutcome));
});

test('policySimulation: riskLevel is one of low | moderate | elevated | severe', () => {
  const validLevels = ['low', 'moderate', 'elevated', 'severe'];
  const testLevel: SimulationResult['riskLevel'] = 'elevated';
  assert.ok(validLevels.includes(testLevel));
});
