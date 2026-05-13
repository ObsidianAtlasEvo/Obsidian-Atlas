/**
 * Tests for Stage 5 — gapDetector.
 *
 * Repo uses `tsx --test` (node:test); see package.json.
 * Supabase + Groq are swapped via the `__setDeps` indirection so we don't
 * mock module paths.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import {
  __resetDeps,
  __setDeps,
  detectAndAppend,
  type GapDetectorInput,
} from '../gapDetector.js';
import type { RouterDecision } from '../types.js';

const USER = 'user-test-1';

function decision(
  mode: RouterDecision['mode'],
  overrides: Partial<RouterDecision> = {},
): RouterDecision {
  return {
    primaryIntent:
      mode === 'factual-quick'
        ? 'factual'
        : mode === 'decision-support'
          ? 'decision'
          : mode === 'claim-audit'
            ? 'claim'
            : mode === 'positioning-comparison'
              ? 'positioning'
              : mode === 'gap-identifier'
                ? 'gap'
                : 'artifact',
    mode,
    condensed: false,
    confidence: 0.8,
    reasonTrace: 'test',
    ...overrides,
  };
}

function inputOf(overrides: Partial<GapDetectorInput>): GapDetectorInput {
  return {
    userId: USER,
    query: 'placeholder query',
    decision: decision('decision-support'),
    finalResponse: 'placeholder response',
    ...overrides,
  };
}

beforeEach(() => {
  __setDeps({
    fetchUnfinishedRow: async () => null,
    touchUnfinishedRow: async () => true,
    insertUnfinishedRow: async () => ({ ok: true, id: 'new-id-stub' }),
    llmNextStep: async () => 'STUB next step',
  });
});

afterEach(() => {
  __resetDeps();
});

describe('Rule 1 — continuation marker', () => {
  test('fires when decision.continuedThread is set; uses topic; touches row', async () => {
    let fetched: string | undefined;
    let touched: string | undefined;
    __setDeps({
      fetchUnfinishedRow: async (id) => {
        fetched = id;
        return { topic: 'async migration plan' };
      },
      touchUnfinishedRow: async (id) => {
        touched = id;
        return true;
      },
      insertUnfinishedRow: async () => ({ ok: false }),
      llmNextStep: async () => 'should not be called',
    });
    const out = await detectAndAppend(
      inputOf({
        decision: decision('decision-support', { continuedThread: 'ub-123' }),
        finalResponse: 'Body text here.',
      }),
    );
    assert.equal(fetched, 'ub-123');
    assert.equal(touched, 'ub-123');
    assert.equal(out.appendedLine, '> Continues: async migration plan');
    assert.equal(out.augmentedResponse, 'Body text here.\n\n> Continues: async migration plan');
    assert.equal(out.unfinishedBusinessIdTouched, 'ub-123');
    assert.equal(out.unfinishedBusinessIdCreated, undefined);
  });

  test('topic truncated to 120 chars', async () => {
    const long = 'a'.repeat(300);
    __setDeps({
      fetchUnfinishedRow: async () => ({ topic: long }),
      touchUnfinishedRow: async () => true,
      insertUnfinishedRow: async () => ({ ok: false }),
      llmNextStep: async () => null,
    });
    const out = await detectAndAppend(
      inputOf({
        decision: decision('decision-support', { continuedThread: 'ub-xx' }),
      }),
    );
    assert.ok(out.appendedLine!.startsWith('> Continues: '));
    const topic = out.appendedLine!.slice('> Continues: '.length);
    assert.equal(topic.length, 120);
  });
});

describe('Rule 2 — new gap detection', () => {
  test('fires for claim-audit on "insufficient evidence" trigger', async () => {
    const inserted: Array<Record<string, unknown>> = [];
    __setDeps({
      fetchUnfinishedRow: async () => null,
      touchUnfinishedRow: async () => false,
      insertUnfinishedRow: async (row) => {
        inserted.push(row);
        return { ok: true, id: 'created-id-7' };
      },
      llmNextStep: async () => 'Schedule a 30-min audit of source X.',
    });
    const out = await detectAndAppend(
      inputOf({
        query: 'Is the 2023 paper still cited?',
        decision: decision('claim-audit'),
        finalResponse:
          'There is insufficient evidence in current databases. Need cross-check.',
      }),
    );
    assert.equal(out.appendedLine, '> Next: Schedule a 30-min audit of source X.');
    assert.ok(out.augmentedResponse.endsWith('\n\n> Next: Schedule a 30-min audit of source X.'));
    assert.equal(out.unfinishedBusinessIdCreated, 'created-id-7');
    assert.equal(inserted.length, 1);
    const row = inserted[0]!;
    assert.equal(row.user_id, USER);
    assert.equal(row.status, 'open');
    assert.equal(row.pattern_fingerprint, 'response_shape_gap_detector');
    assert.equal(row.kind, 'recurring_insight');
    // title (mapped from `topic`) capped at 100 chars
    assert.ok(typeof row.title === 'string');
    assert.ok((row.title as string).length <= 100);
    // description carries the nextStep so callers can render it
    assert.equal(row.description, 'Schedule a 30-min audit of source X.');
  });

  test('factual-quick SKIPS even with claim-audit-style trigger phrase', async () => {
    let llmCalls = 0;
    __setDeps({
      fetchUnfinishedRow: async () => null,
      touchUnfinishedRow: async () => false,
      insertUnfinishedRow: async () => ({ ok: false }),
      llmNextStep: async () => {
        llmCalls += 1;
        return 'should not be called';
      },
    });
    const out = await detectAndAppend(
      inputOf({
        decision: decision('factual-quick'),
        // contains "insufficient evidence" — but factual-quick uses its OWN
        // low-confidence pattern bank, so this should NOT trigger.
        finalResponse: 'The capital is Lima. There is insufficient evidence otherwise.',
      }),
    );
    assert.equal(out.appendedLine, undefined);
    assert.equal(out.augmentedResponse, 'The capital is Lima. There is insufficient evidence otherwise.');
    assert.equal(llmCalls, 0);
  });

  test('factual-quick FIRES when a low-confidence hedge word matches', async () => {
    __setDeps({
      fetchUnfinishedRow: async () => null,
      touchUnfinishedRow: async () => false,
      insertUnfinishedRow: async () => ({ ok: true, id: 'fq-1' }),
      llmNextStep: async () => 'Look up the official census figure.',
    });
    const out = await detectAndAppend(
      inputOf({
        decision: decision('factual-quick'),
        finalResponse: 'It is approximately 8.5 million as of 2024.',
      }),
    );
    assert.equal(out.appendedLine, '> Next: Look up the official census figure.');
    assert.equal(out.unfinishedBusinessIdCreated, 'fq-1');
  });

  test('artifact-generator SKIPS (allowGapAppend=false, no appendThreshold)', async () => {
    let llmCalls = 0;
    __setDeps({
      fetchUnfinishedRow: async () => null,
      touchUnfinishedRow: async () => false,
      insertUnfinishedRow: async () => ({ ok: false }),
      llmNextStep: async () => {
        llmCalls += 1;
        return 'should never be called';
      },
    });
    const out = await detectAndAppend(
      inputOf({
        decision: decision('artifact-generator'),
        finalResponse: '# Checklist\n\n- Step 1\n- Step 2\n\n(depends on later review)',
      }),
    );
    assert.equal(out.appendedLine, undefined);
    assert.equal(llmCalls, 0);
  });

  test('gap-identifier treats response as the gap (always candidate)', async () => {
    __setDeps({
      fetchUnfinishedRow: async () => null,
      touchUnfinishedRow: async () => false,
      insertUnfinishedRow: async () => ({ ok: true, id: 'gi-1' }),
      llmNextStep: async () => 'Run one calibration interview with the affected team.',
    });
    const out = await detectAndAppend(
      inputOf({
        decision: decision('gap-identifier'),
        finalResponse: 'You are missing a calibration step in the rollout plan.',
      }),
    );
    assert.equal(out.appendedLine, '> Next: Run one calibration interview with the affected team.');
    assert.equal(out.unfinishedBusinessIdCreated, 'gi-1');
  });
});

describe('Graceful degradation', () => {
  test('insert throws → line still appended, no unfinishedBusinessIdCreated', async () => {
    __setDeps({
      fetchUnfinishedRow: async () => null,
      touchUnfinishedRow: async () => false,
      insertUnfinishedRow: async () => {
        throw new Error('supabase 500');
      },
      llmNextStep: async () => 'Concrete next step.',
    });
    const out = await detectAndAppend(
      inputOf({
        decision: decision('claim-audit'),
        finalResponse: 'The claim is inconclusive at this time.',
      }),
    );
    assert.equal(out.appendedLine, '> Next: Concrete next step.');
    assert.equal(out.unfinishedBusinessIdCreated, undefined);
  });

  test('Groq throws → no append, no insert, original response returned', async () => {
    let inserts = 0;
    __setDeps({
      fetchUnfinishedRow: async () => null,
      touchUnfinishedRow: async () => false,
      insertUnfinishedRow: async () => {
        inserts += 1;
        return { ok: false };
      },
      llmNextStep: async () => {
        throw new Error('groq timeout');
      },
    });
    const original = 'The claim is inconclusive at this time.';
    const out = await detectAndAppend(
      inputOf({
        decision: decision('claim-audit'),
        finalResponse: original,
      }),
    );
    assert.equal(out.appendedLine, undefined);
    assert.equal(out.augmentedResponse, original);
    assert.equal(inserts, 0);
  });

  test('Groq returns null → no append, no insert', async () => {
    let inserts = 0;
    __setDeps({
      fetchUnfinishedRow: async () => null,
      touchUnfinishedRow: async () => false,
      insertUnfinishedRow: async () => {
        inserts += 1;
        return { ok: false };
      },
      llmNextStep: async () => null,
    });
    const original = 'The claim is inconclusive at this time.';
    const out = await detectAndAppend(
      inputOf({
        decision: decision('claim-audit'),
        finalResponse: original,
      }),
    );
    assert.equal(out.appendedLine, undefined);
    assert.equal(out.augmentedResponse, original);
    assert.equal(inserts, 0);
  });

  test('Rule 1 row fetch fails → no append, but row still best-effort touched', async () => {
    let touched = false;
    __setDeps({
      fetchUnfinishedRow: async () => null, // simulate "not found / failed"
      touchUnfinishedRow: async () => {
        touched = true;
        return true;
      },
      insertUnfinishedRow: async () => ({ ok: false }),
      llmNextStep: async () => 'should never run',
    });
    const out = await detectAndAppend(
      inputOf({
        decision: decision('decision-support', { continuedThread: 'ub-z' }),
        finalResponse: 'Body.',
      }),
    );
    assert.equal(out.appendedLine, undefined);
    assert.equal(out.augmentedResponse, 'Body.');
    assert.equal(out.unfinishedBusinessIdTouched, 'ub-z');
    assert.equal(touched, true);
  });
});

describe('No-double-fire and audit-block protection', () => {
  test('Rule 1 winning prevents Rule 2 from evaluating', async () => {
    let llmCalls = 0;
    let inserts = 0;
    __setDeps({
      fetchUnfinishedRow: async () => ({ topic: 'existing thread' }),
      touchUnfinishedRow: async () => true,
      insertUnfinishedRow: async () => {
        inserts += 1;
        return { ok: false };
      },
      llmNextStep: async () => {
        llmCalls += 1;
        return 'should never be called';
      },
    });
    const out = await detectAndAppend(
      inputOf({
        // response would have matched Rule 2 (claim-audit + insufficient evidence)
        decision: decision('claim-audit', { continuedThread: 'ub-9' }),
        finalResponse: 'There is insufficient evidence right now.',
      }),
    );
    assert.equal(out.appendedLine, '> Continues: existing thread');
    assert.equal(out.unfinishedBusinessIdTouched, 'ub-9');
    assert.equal(out.unfinishedBusinessIdCreated, undefined);
    assert.equal(llmCalls, 0);
    assert.equal(inserts, 0);
  });

  test('audit-block protection: detector never emits "Self-Governance Audit" content', async () => {
    // No-op style assertion: even if the upstream response contains an audit
    // phrase, the detector's appended line stays free of audit language.
    __setDeps({
      fetchUnfinishedRow: async () => null,
      touchUnfinishedRow: async () => false,
      insertUnfinishedRow: async () => ({ ok: true, id: 'x' }),
      llmNextStep: async () => 'Ask one stakeholder for the missing constraint.',
    });
    const polluted =
      'The decision hinges on cost. (Intellectual Self-Governance Audit: nothing to declare.)';
    const out = await detectAndAppend(
      inputOf({
        decision: decision('decision-support'),
        finalResponse: polluted,
      }),
    );
    assert.equal(out.appendedLine, '> Next: Ask one stakeholder for the missing constraint.');
    assert.ok(!out.appendedLine!.toLowerCase().includes('audit'));
    assert.ok(!out.appendedLine!.toLowerCase().includes('framing-bias'));
    // The detector preserves upstream content verbatim — it does not strip
    // audit phrases (that is synthesis-prompt's job per spec § 6).
    assert.ok(out.augmentedResponse.startsWith(polluted));
  });
});

describe('Rule 3 — default no-op', () => {
  test('no continuation + no trigger pattern → response unchanged', async () => {
    let llmCalls = 0;
    __setDeps({
      fetchUnfinishedRow: async () => null,
      touchUnfinishedRow: async () => false,
      insertUnfinishedRow: async () => ({ ok: false }),
      llmNextStep: async () => {
        llmCalls += 1;
        return 'unused';
      },
    });
    const out = await detectAndAppend(
      inputOf({
        decision: decision('decision-support'),
        finalResponse: 'Recommendation: go with option A. Top trade-off: cost vs latency.',
      }),
    );
    assert.equal(out.appendedLine, undefined);
    assert.equal(out.augmentedResponse, 'Recommendation: go with option A. Top trade-off: cost vs latency.');
    assert.equal(out.unfinishedBusinessIdCreated, undefined);
    assert.equal(out.unfinishedBusinessIdTouched, undefined);
    assert.equal(llmCalls, 0);
  });
});
