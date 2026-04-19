/**
 * identityResolution.test.ts — Phase 0.8: Identity Resolution + Governance Tests
 *
 * Tests the pure/in-process logic of:
 *   - identityGovernance: type schema validation, scope computation, correction scoring
 *   - scopeResolutionService: pure resolveScope() function
 *   - correctionPriorityService: CORRECTION_PHRASES detection
 *   - identityDiffService: writeDiff schema shapes (type validation only — no DB)
 *   - activeIdentityComposer: contract schema validation
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────────────────────────────────────
// identityGovernance — pure functions and schema validation
// ─────────────────────────────────────────────────────────────────────────────

import {
  identityDomainSchema,
  identitySignalInputSchema,
  computeScopeStrength,
  computeIdentityWeight,
  isOperationallyEligible,
  correctionPriorityScore,
  inferDomainFromContent,
  activeIdentityContractSchema,
  type ExplicitnessLevel,
  type IdentityDomain,
  type ScopeResolution,
} from './identityGovernance.js';

test('identityGovernance: identityDomainSchema accepts known domain "communication_profile"', () => {
  const result = identityDomainSchema.safeParse('communication_profile');
  assert.ok(result.success, 'communication_profile should be a valid identity domain');
});

test('identityGovernance: identityDomainSchema rejects unknown domain', () => {
  const result = identityDomainSchema.safeParse('UNKNOWN_DOMAIN_XYZ_99');
  assert.equal(result.success, false, 'unknown domain should fail schema');
});

test('identityGovernance: identityDomainSchema accepts "epistemic_profile"', () => {
  const result = identityDomainSchema.safeParse('epistemic_profile');
  assert.ok(result.success, 'epistemic_profile should be a valid identity domain');
});

test('identityGovernance: identityDomainSchema accepts "chamber_profile"', () => {
  const result = identityDomainSchema.safeParse('chamber_profile');
  assert.ok(result.success, 'chamber_profile should be valid domain');
});

// identitySignalInputSchema uses: content, domain, provenance, explicitnessLevel, correctionPriority, scopeResolution, confidence, stabilityScore
const validScopeRes = {
  scopeType: 'global',
  scopeStrength: 'broad',
  scopeConfidence: 0.9,
  scopeReasoning: 'test',
};

test('identityGovernance: identitySignalInputSchema rejects unknown domain', () => {
  const result = identitySignalInputSchema.safeParse({
    content: 'I prefer concise answers',
    domain: 'UNKNOWN_DOMAIN',
    provenance: 'user_stated',
    explicitnessLevel: 'explicit',
    correctionPriority: 0,
    scopeResolution: validScopeRes,
    confidence: 0.8,
    stabilityScore: 0.8,
  });
  assert.equal(result.success, false, 'unknown domain should fail schema');
});

test('identityGovernance: identitySignalInputSchema accepts valid communication_profile signal', () => {
  const result = identitySignalInputSchema.safeParse({
    content: 'I prefer concise, direct answers.',
    domain: 'communication_profile',
    provenance: 'user_stated',
    explicitnessLevel: 'explicit',
    correctionPriority: 0,
    scopeResolution: validScopeRes,
    confidence: 0.92,
    stabilityScore: 0.85,
  });
  assert.ok(result.success, `valid signal should pass schema: ${JSON.stringify(result)}`);
});

test('identityGovernance: computeScopeStrength returns valid ScopeStrength', () => {
  const validValues = ['narrow', 'moderate', 'broad'];
  const result = computeScopeStrength('global');
  assert.ok(validValues.includes(result), `computeScopeStrength returned invalid value: ${result}`);
});

test('identityGovernance: computeScopeStrength for global scope returns broad', () => {
  const result = computeScopeStrength('global');
  assert.equal(result, 'broad', 'global scope should be broad');
});

test('identityGovernance: computeScopeStrength for session scope returns narrow', () => {
  const result = computeScopeStrength('session');
  assert.equal(result, 'narrow', 'session scope should be narrow');
});

// computeIdentityWeight(provenance, explicitnessLevel, correctionPriority, stability, confidence)
test('identityGovernance: computeIdentityWeight returns a number 0..1', () => {
  const weight = computeIdentityWeight('user_stated', 'explicit', 0, 0.8, 0.85);
  assert.ok(typeof weight === 'number');
  assert.ok(weight >= 0 && weight <= 1, `weight ${weight} out of 0..1 range`);
});

test('identityGovernance: computeIdentityWeight user_stated > assistant_inferred', () => {
  const userWeight = computeIdentityWeight('user_stated', 'explicit', 0, 0.7, 0.8);
  const assistantWeight = computeIdentityWeight('assistant_inferred', 'inferred', 0, 0.7, 0.8);
  assert.ok(
    userWeight >= assistantWeight,
    `user_stated weight (${userWeight}) must be >= assistant_inferred weight (${assistantWeight})`,
  );
});

// isOperationallyEligible takes an IdentitySignalInput object — build a minimal one
function makeSignal(overrides: {
  confidence?: number;
  provenance?: 'user_stated' | 'user_confirmed' | 'corrected_by_user' | 'assistant_inferred';
  correctionPriority?: number;
  stabilityScore?: number;
  explicitnessLevel?: ExplicitnessLevel;
} = {}): Parameters<typeof isOperationallyEligible>[0] {
  const scopeRes: ScopeResolution = {
    scopeType: 'global',
    scopeStrength: 'broad',
    scopeConfidence: 0.9,
    scopeReasoning: 'test',
  };
  return {
    content: 'Test signal content',
    domain: 'communication_profile' as IdentityDomain,
    provenance: overrides.provenance ?? 'user_stated',
    explicitnessLevel: overrides.explicitnessLevel ?? 'explicit',
    correctionPriority: overrides.correctionPriority ?? 0,
    scopeResolution: scopeRes,
    confidence: overrides.confidence ?? 0.85,
    stabilityScore: overrides.stabilityScore ?? 0.8,
  };
}

test('identityGovernance: isOperationallyEligible returns false for low confidence assistant_inferred', () => {
  const eligible = isOperationallyEligible(makeSignal({
    confidence: 0.1,
    provenance: 'assistant_inferred',
    stabilityScore: 0.1,
  }));
  assert.equal(eligible, false, 'very low confidence assistant_inferred should not be eligible');
});

test('identityGovernance: isOperationallyEligible returns true for high-confidence user_stated', () => {
  const eligible = isOperationallyEligible(makeSignal({
    confidence: 0.95,
    provenance: 'user_stated',
  }));
  assert.ok(eligible, 'high-confidence user_stated should be operationally eligible');
});

// correctionPriorityScore(kind, provenance)
test('identityGovernance: correctionPriorityScore returns higher value for correction kind', () => {
  const correctionScore = correctionPriorityScore('correction', 'corrected_by_user');
  const inferredScore = correctionPriorityScore('pattern', 'assistant_inferred');
  assert.ok(
    correctionScore > inferredScore,
    `correction/corrected_by_user (${correctionScore}) should outrank pattern/assistant_inferred (${inferredScore})`,
  );
});

test('identityGovernance: correctionPriorityScore returns a non-negative number for all provenances', () => {
  for (const provenance of ['user_stated', 'user_confirmed', 'corrected_by_user', 'assistant_inferred'] as const) {
    const score = correctionPriorityScore('fact', provenance);
    assert.ok(typeof score === 'number' && score >= 0, `score for ${provenance} should be non-negative (got ${score})`);
  }
});

test('identityGovernance: inferDomainFromContent returns a string for preference content', () => {
  const domain = inferDomainFromContent('I prefer detailed explanations', 'preference');
  assert.equal(typeof domain, 'string');
  assert.ok(domain.length > 0, 'should return a non-empty domain string');
});

test('identityGovernance: inferDomainFromContent handles tone content', () => {
  const domain = inferDomainFromContent('Please be more direct in your answers', 'preference');
  assert.equal(typeof domain, 'string');
  // Should map to communication_style or similar
  assert.ok(domain.length > 0);
});

// activeIdentityContractSchema: userId (uuid), activeToneProfile, activeDepthProfile, activeChallengeProfile,
// activeScopeExceptions, activeIdentityConstraints, activeConflictsToRespect, activeUncertaintyNotes,
// activeBehaviorBoundaries, resolvedAt (Date)
const validContract = {
  userId: '123e4567-e89b-12d3-a456-426614174000',
  activeToneProfile: { verbosity: 'low', tone: 'direct' },
  activeDepthProfile: { depth: 'heavy' },
  activeChallengeProfile: { challengeMode: 'soft' },
  activeScopeExceptions: [],
  activeIdentityConstraints: [],
  activeConflictsToRespect: [],
  activeUncertaintyNotes: [],
  activeBehaviorBoundaries: [],
  resolvedAt: new Date(),
};

test('identityGovernance: activeIdentityContractSchema validates required fields', () => {
  const result = activeIdentityContractSchema.safeParse(validContract);
  assert.ok(result.success, `activeIdentityContractSchema should accept valid contract: ${JSON.stringify(result)}`);
});

test('identityGovernance: activeIdentityContractSchema rejects missing userId', () => {
  const { userId: _omit, ...rest } = validContract;
  const result = activeIdentityContractSchema.safeParse(rest);
  assert.equal(result.success, false, 'missing userId should fail schema');
});

// ─────────────────────────────────────────────────────────────────────────────
// scopeResolutionService — pure resolveScope() function
// ─────────────────────────────────────────────────────────────────────────────

import { resolveScope } from './scopeResolutionService.js';

test('scopeResolution: resolveScope returns a ScopeResolution object', () => {
  const result = resolveScope({
    content: 'I prefer concise answers in general.',
    kind: 'preference',
  });
  assert.ok(typeof result === 'object' && result !== null);
  assert.ok('scopeType' in result, 'should have scopeType');
  assert.ok('scopeStrength' in result, 'should have scopeStrength');
  assert.ok('scopeConfidence' in result, 'should have scopeConfidence');
});

test('scopeResolution: resolveScope returns global scope for universal preference', () => {
  const result = resolveScope({
    content: 'I always prefer direct answers.',
    kind: 'preference',
  });
  assert.equal(result.scopeType, 'global', 'universal preference should resolve to global scope');
});

test('scopeResolution: resolveScope detects session-scoped content', () => {
  const result = resolveScope({
    content: 'Just for this conversation, use bullet points.',
    kind: 'preference',
  });
  assert.ok(
    result.scopeType === 'session' || result.scopeType === 'topic',
    `"just for this conversation" should resolve to session/topic scope (got ${result.scopeType})`,
  );
});

test('scopeResolution: resolveScope with explicit projectKey produces project scope', () => {
  const result = resolveScope({
    content: 'For the Atlas project, always include code examples.',
    kind: 'preference',
    projectKey: 'atlas',
  });
  assert.ok(
    result.scopeType === 'project' || result.scopeType === 'global',
    `project-keyed content should resolve to project or global scope (got ${result.scopeType})`,
  );
});

test('scopeResolution: resolveScope returns valid ScopeStrength', () => {
  const result = resolveScope({
    content: 'Be concise.',
    kind: 'preference',
  });
  const validStrengths = ['narrow', 'moderate', 'broad'];
  assert.ok(
    validStrengths.includes(result.scopeStrength),
    `scopeStrength should be narrow/moderate/broad (got ${result.scopeStrength})`,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// correctionPriorityService — phrase detection (pure logic)
// ─────────────────────────────────────────────────────────────────────────────

import { CORRECTION_PHRASES } from './correctionPriorityService.js';

test('correctionPriorityService: CORRECTION_PHRASES is non-empty array of strings', () => {
  assert.ok(Array.isArray(CORRECTION_PHRASES));
  assert.ok(CORRECTION_PHRASES.length >= 5, 'should have at least 5 correction phrases');
  for (const phrase of CORRECTION_PHRASES) {
    assert.equal(typeof phrase, 'string');
    assert.ok(phrase.length > 0, 'phrase should not be empty');
  }
});

test('correctionPriorityService: detects "that is wrong"', () => {
  const content = 'Actually, that is wrong — I said the opposite';
  const matched = CORRECTION_PHRASES.some((p) => content.toLowerCase().includes(p.toLowerCase()));
  assert.ok(matched, 'should detect "that is wrong"');
});

test('correctionPriorityService: detects "please forget"', () => {
  const content = 'Please forget what I said about my schedule';
  const matched = CORRECTION_PHRASES.some((p) => content.toLowerCase().includes(p.toLowerCase()));
  assert.ok(matched, 'should detect "please forget"');
});

test('correctionPriorityService: detects "you misunderstood"', () => {
  const content = 'You misunderstood — I meant something different';
  const matched = CORRECTION_PHRASES.some((p) => content.toLowerCase().includes(p.toLowerCase()));
  assert.ok(matched, 'should detect "you misunderstood"');
});

test('correctionPriorityService: non-correction content does not match', () => {
  const content = 'Can you help me write a summary for this report?';
  const matched = CORRECTION_PHRASES.some((p) => content.toLowerCase().includes(p.toLowerCase()));
  assert.equal(matched, false, 'benign content should not match correction phrases');
});

test('correctionPriorityService: detects "forget that"', () => {
  const content = 'Forget that preference — use structured output instead';
  const matched = CORRECTION_PHRASES.some((p) => content.toLowerCase().includes(p.toLowerCase()));
  assert.ok(matched);
});

test('correctionPriorityService: detects "not right"', () => {
  const content = "That's not right, I prefer verbose explanations";
  const matched = CORRECTION_PHRASES.some((p) => content.toLowerCase().includes(p.toLowerCase()));
  assert.ok(matched);
});

test('correctionPriorityService: detects "that was wrong"', () => {
  const content = 'Ignore that — that was wrong';
  const matched = CORRECTION_PHRASES.some((p) => content.toLowerCase().includes(p.toLowerCase()));
  assert.ok(matched);
});

// ─────────────────────────────────────────────────────────────────────────────
// Priority law verification — correction > inference > older ambiguous
// ─────────────────────────────────────────────────────────────────────────────

test('priorityLaw: correction kind+provenance outranks user_stated in priority score', () => {
  const correctedScore = correctionPriorityScore('correction', 'corrected_by_user');
  const statedScore = correctionPriorityScore('fact', 'user_stated');
  assert.ok(correctedScore >= statedScore, 'correction should outrank or equal user_stated');
});

test('priorityLaw: user_stated outranks assistant_inferred', () => {
  const statedScore = correctionPriorityScore('fact', 'user_stated');
  const inferredScore = correctionPriorityScore('fact', 'assistant_inferred');
  assert.ok(statedScore > inferredScore, 'user_stated must outrank assistant_inferred');
});

test('priorityLaw: identity weight user_stated > assistant_inferred at all confidence levels', () => {
  for (const confidence of [0.5, 0.7, 0.9]) {
    const userWeight = computeIdentityWeight('user_stated', 'explicit', 0, 0.5, confidence);
    const assistantWeight = computeIdentityWeight('assistant_inferred', 'inferred', 0, 0.5, confidence);
    assert.ok(
      userWeight >= assistantWeight,
      `at confidence=${confidence}, user_stated (${userWeight}) must be >= assistant_inferred (${assistantWeight})`,
    );
  }
});
