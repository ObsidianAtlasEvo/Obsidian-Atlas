import assert from 'node:assert/strict';
import test from 'node:test';

import type { PolicyProfile } from '../../types/atlas.js';

import { formatPolicyProfileBlock } from './primeDirective.js';

function makePolicyProfile(overrides: Partial<PolicyProfile> = {}): PolicyProfile {
  return {
    userId: 'user-1',
    verbosity: 'medium',
    tone: 'analytical',
    structurePreference: 'balanced',
    truthFirstStrictness: 0.72,
    writingStyleEnabled: false,
    preferredComputeDepth: 'Light',
    latencyTolerance: 'Low',
    updatedAt: '2026-04-17T00:00:00.000Z',
    ...overrides,
  };
}

test('formatPolicyProfileBlock emits a not-yet-learned banner for the untouched default profile', () => {
  const text = formatPolicyProfileBlock(makePolicyProfile());

  assert.match(text, /not yet learned/i);
});

test('formatPolicyProfileBlock renders stored preferences when the profile differs from defaults', () => {
  const text = formatPolicyProfileBlock(
    makePolicyProfile({
      verbosity: 'high',
      tone: 'direct',
      structurePreference: 'structured',
      truthFirstStrictness: 0.91,
      writingStyleEnabled: true,
      preferredComputeDepth: 'Heavy',
      latencyTolerance: 'High',
    }),
  );

  assert.match(text, /verbosity: high/);
  assert.match(text, /tone: direct/);
  assert.doesNotMatch(text, /not yet learned/i);
});
