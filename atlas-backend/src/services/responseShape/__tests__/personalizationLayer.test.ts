/**
 * Tests for the Stage 3 personalization layer.
 *
 * Runs under node:test (atlas-backend uses `tsx --test`, not vitest).
 * Channel readers and the Groq client are swapped via `__setDeps` so no
 * network calls fire and the test stays hermetic.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import {
  __resetDeps,
  __setDeps,
  loadPersonalizationContext,
  translate,
} from '../personalizationLayer.js';
import type { DoctrineDirective, RouterDecision } from '../types.js';

const USER = 'user-test-1';

function baseDecision(overrides: Partial<RouterDecision> = {}): RouterDecision {
  return {
    primaryIntent: 'decision',
    mode: 'decision-support',
    condensed: false,
    confidence: 0.8,
    reasonTrace: 'test',
    ...overrides,
  };
}

function silenceWarn(): () => void {
  const orig = console.warn;
  console.warn = () => {};
  return () => {
    console.warn = orig;
  };
}

describe('loadPersonalizationContext', () => {
  afterEach(() => __resetDeps());

  test('all four channels succeed → populated context', async () => {
    __setDeps({
      readMemoryExemplars: async () => [
        { content: 'I shipped the Postgres migration last quarter', importance: 0.9 },
        { content: 'Team is 3 engineers, no SRE coverage', importance: 0.85 },
        { content: 'Cost ceiling is $500/mo for infra', importance: 0.8 },
      ],
      readIdentitySignals: async () => [
        { domain: 'communication_profile', signal_content: 'prefers direct concise responses' },
        { domain: 'chamber_profile', signal_content: 'expert in distributed systems' },
      ],
      readDoctrineDirectives: async () => [
        {
          id: 'doc-1',
          directiveType: 'always_include_section',
          payload: { section_id: 'next_step' },
        },
      ],
      readGovernanceEvents: async () =>
        Array.from({ length: 5 }, () => ({
          event_type: 'corrected' as const,
          payload: { confidence_direction: 'over_confident' },
        })),
      readAdaptationEvents: async () => [],
    });

    const ctx = await loadPersonalizationContext(USER, baseDecision());
    assert.equal(ctx.memoryExemplars.length, 3);
    assert.equal(ctx.tone, 'direct');
    assert.equal(ctx.verbosity, 'low');
    assert.equal(ctx.vocabLevel, 'expert');
    assert.equal(ctx.doctrineDirectives.length, 1);
    assert.ok(ctx.confidenceCalibration > 0, `expected positive calibration, got ${ctx.confidenceCalibration}`);
  });

  test('all four channels reject → default context, no throw', async () => {
    const restoreWarn = silenceWarn();
    try {
      __setDeps({
        readMemoryExemplars: async () => {
          throw new Error('boom-1');
        },
        readIdentitySignals: async () => {
          throw new Error('boom-2');
        },
        readDoctrineDirectives: async () => {
          throw new Error('boom-3');
        },
        readGovernanceEvents: async () => {
          throw new Error('boom-4');
        },
        readAdaptationEvents: async () => {
          throw new Error('boom-5');
        },
      });
      const ctx = await loadPersonalizationContext(USER, baseDecision());
      assert.equal(ctx.verbosity, 'medium');
      assert.equal(ctx.tone, 'analytical');
      assert.equal(ctx.structurePreference, 'balanced');
      assert.equal(ctx.vocabLevel, 'intermediate');
      assert.deepEqual(ctx.memoryExemplars, []);
      assert.deepEqual(ctx.doctrineDirectives, []);
      assert.equal(ctx.confidenceCalibration, 0);
    } finally {
      restoreWarn();
    }
  });

  test('factual-quick mode does NOT fetch memory exemplars (knob disabled)', async () => {
    let exemplarReadCount = 0;
    __setDeps({
      readMemoryExemplars: async () => {
        exemplarReadCount += 1;
        return [{ content: 'should not appear', importance: 1 }];
      },
      readIdentitySignals: async () => [],
      readDoctrineDirectives: async () => [],
      readGovernanceEvents: async () => [],
      readAdaptationEvents: async () => [],
    });
    const ctx = await loadPersonalizationContext(USER, baseDecision({ mode: 'factual-quick' }));
    assert.equal(exemplarReadCount, 0, 'memory exemplar reader should be skipped for factual-quick');
    assert.deepEqual(ctx.memoryExemplars, []);
  });

  test('mode with allowExemplars=true does fetch exemplars', async () => {
    let exemplarReadCount = 0;
    __setDeps({
      readMemoryExemplars: async () => {
        exemplarReadCount += 1;
        return [{ content: 'an exemplar', importance: 0.9 }];
      },
      readIdentitySignals: async () => [],
      readDoctrineDirectives: async () => [],
      readGovernanceEvents: async () => [],
      readAdaptationEvents: async () => [],
    });
    await loadPersonalizationContext(USER, baseDecision({ mode: 'decision-support' }));
    assert.equal(exemplarReadCount, 1);
  });

  test('exemplar content over 200 chars is truncated', async () => {
    const long = 'x'.repeat(500);
    __setDeps({
      readMemoryExemplars: async () => [{ content: long, importance: 1 }],
      readIdentitySignals: async () => [],
      readDoctrineDirectives: async () => [],
      readGovernanceEvents: async () => [],
      readAdaptationEvents: async () => [],
    });
    const ctx = await loadPersonalizationContext(USER, baseDecision());
    assert.equal(ctx.memoryExemplars.length, 1);
    // 200 chars + the trailing ellipsis character
    assert.equal(ctx.memoryExemplars[0]!.length, 201);
    assert.ok(ctx.memoryExemplars[0]!.endsWith('…'));
  });
});

describe('translate', () => {
  afterEach(() => __resetDeps());

  test('empty exemplars + all defaults → personalizationApplied does NOT list memory_exemplars', async () => {
    __setDeps({
      readMemoryExemplars: async () => [],
      readIdentitySignals: async () => [],
      readDoctrineDirectives: async () => [],
      readGovernanceEvents: async () => [],
      readAdaptationEvents: async () => [],
      callGroq: async () => 'translated body',
    });
    const result = await translate({
      userId: USER,
      query: 'should I deploy on Friday?',
      decision: baseDecision(),
      synthesizedAnswer: 'no',
    });
    assert.equal(result.translated, 'translated body');
    assert.ok(!result.personalizationApplied.includes('memory_exemplars'));
  });

  test('three exemplars → personalizationApplied lists memory_exemplars', async () => {
    __setDeps({
      readMemoryExemplars: async () => [
        { content: 'a', importance: 0.9 },
        { content: 'b', importance: 0.85 },
        { content: 'c', importance: 0.8 },
      ],
      readIdentitySignals: async () => [],
      readDoctrineDirectives: async () => [],
      readGovernanceEvents: async () => [],
      readAdaptationEvents: async () => [],
      callGroq: async () => 'translated body with exemplars',
    });
    const result = await translate({
      userId: USER,
      query: 'should I deploy on Friday?',
      decision: baseDecision(),
      synthesizedAnswer: 'no',
    });
    assert.ok(result.personalizationApplied.includes('memory_exemplars'));
  });

  test('non-default doctrine directives → personalizationApplied lists doctrine_sections', async () => {
    const directives: DoctrineDirective[] = [
      {
        id: 'd-1',
        directiveType: 'never_include_section',
        payload: { section_id: 'self_governance_audit' },
      },
    ];
    __setDeps({
      readMemoryExemplars: async () => [],
      readIdentitySignals: async () => [],
      readDoctrineDirectives: async () => directives,
      readGovernanceEvents: async () => [],
      readAdaptationEvents: async () => [],
      callGroq: async () => 'translated body',
    });
    const result = await translate({
      userId: USER,
      query: 'q',
      decision: baseDecision(),
      synthesizedAnswer: 'a',
    });
    assert.ok(result.personalizationApplied.includes('doctrine_sections'));
  });

  test('confidence_calibration only fires when mode allows rescale AND ≥3 events', async () => {
    // positioning-comparison has allowConfidenceRescale=false → must NOT fire even with events
    __setDeps({
      readMemoryExemplars: async () => [],
      readIdentitySignals: async () => [],
      readDoctrineDirectives: async () => [],
      readGovernanceEvents: async () =>
        Array.from({ length: 5 }, () => ({
          event_type: 'corrected' as const,
          payload: { confidence_direction: 'over_confident' },
        })),
      readAdaptationEvents: async () => [],
      callGroq: async () => 'body',
    });
    const noRescale = await translate({
      userId: USER,
      query: 'q',
      decision: baseDecision({ mode: 'positioning-comparison', primaryIntent: 'positioning' }),
      synthesizedAnswer: 'a',
    });
    assert.ok(!noRescale.personalizationApplied.includes('confidence_calibration'));

    // decision-support has allowConfidenceRescale=true → must fire
    const yesRescale = await translate({
      userId: USER,
      query: 'q',
      decision: baseDecision(),
      synthesizedAnswer: 'a',
    });
    assert.ok(yesRescale.personalizationApplied.includes('confidence_calibration'));
  });

  test('confidence_calibration does NOT fire with <3 relevant events even when mode allows', async () => {
    __setDeps({
      readMemoryExemplars: async () => [],
      readIdentitySignals: async () => [],
      readDoctrineDirectives: async () => [],
      readGovernanceEvents: async () => [
        { event_type: 'corrected', payload: { confidence_direction: 'over_confident' } },
      ],
      readAdaptationEvents: async () => [],
      callGroq: async () => 'body',
    });
    const result = await translate({
      userId: USER,
      query: 'q',
      decision: baseDecision(),
      synthesizedAnswer: 'a',
    });
    assert.ok(!result.personalizationApplied.includes('confidence_calibration'));
  });

  test('graceful degrade — Groq client throws → returns synthesizedAnswer untouched', async () => {
    const restoreWarn = silenceWarn();
    try {
      __setDeps({
        readMemoryExemplars: async () => [],
        readIdentitySignals: async () => [],
        readDoctrineDirectives: async () => [],
        readGovernanceEvents: async () => [],
        readAdaptationEvents: async () => [],
        callGroq: async () => {
          throw new Error('groq down');
        },
      });
      const result = await translate({
        userId: USER,
        query: 'q',
        decision: baseDecision(),
        synthesizedAnswer: 'the original synth body',
      });
      assert.equal(result.translated, 'the original synth body');
      assert.deepEqual(result.personalizationApplied, []);
    } finally {
      restoreWarn();
    }
  });

  test('graceful degrade — Groq returns null → returns synthesizedAnswer untouched', async () => {
    __setDeps({
      readMemoryExemplars: async () => [],
      readIdentitySignals: async () => [],
      readDoctrineDirectives: async () => [],
      readGovernanceEvents: async () => [],
      readAdaptationEvents: async () => [],
      callGroq: async () => null,
    });
    const result = await translate({
      userId: USER,
      query: 'q',
      decision: baseDecision(),
      synthesizedAnswer: 'untouched body',
    });
    assert.equal(result.translated, 'untouched body');
    assert.deepEqual(result.personalizationApplied, []);
  });
});

describe('performance smoke', () => {
  afterEach(() => __resetDeps());

  test('loadPersonalizationContext with 100ms readers completes well under 600ms', async () => {
    const slow = <T>(value: T) =>
      new Promise<T>((resolve) => setTimeout(() => resolve(value), 100));
    __setDeps({
      readMemoryExemplars: () => slow([{ content: 'x', importance: 0.5 }]),
      readIdentitySignals: () => slow([]),
      readDoctrineDirectives: () => slow([]),
      readGovernanceEvents: () => slow([]),
      readAdaptationEvents: () => slow([]),
    });
    const t0 = Date.now();
    await loadPersonalizationContext(USER, baseDecision());
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 600, `expected < 600ms wall clock, got ${elapsed}ms`);
  });

  test('loadPersonalizationContext enforces 400ms budget when readers hang', async () => {
    const restoreWarn = silenceWarn();
    try {
      const hang = <T>() => new Promise<T>(() => {});
      __setDeps({
        readMemoryExemplars: () => hang<{ content?: string | null }[]>(),
        readIdentitySignals: () => hang<{ domain?: string | null }[]>(),
        readDoctrineDirectives: () => hang<DoctrineDirective[]>(),
        readGovernanceEvents: () => hang<{ event_type?: string | null }[]>(),
        readAdaptationEvents: () => hang<{ adaptation_type?: string | null }[]>(),
      });
      const t0 = Date.now();
      const ctx = await loadPersonalizationContext(USER, baseDecision());
      const elapsed = Date.now() - t0;
      // Should hit the 400ms race fallback, not hang forever.
      assert.ok(elapsed < 800, `expected timeout fallback under 800ms, got ${elapsed}ms`);
      assert.equal(ctx.verbosity, 'medium');
    } finally {
      restoreWarn();
    }
  });
});
