/**
 * Tests for the Stage 0 intent router.
 *
 * The repo runs tests via `tsx --test` (node:test), not vitest — see
 * package.json. Supabase dependencies are swapped via the `__setDeps`
 * indirection so we don't mock module paths.
 *
 * No external network calls fire: GROQ_API_KEY is force-cleared per test so
 * the LLM refinement path short-circuits to the cheap classifier result.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import {
  __resetDeps,
  __setDeps,
  routeIntent,
} from '../intentRouter.js';
import type { DoctrineDirective } from '../types.js';

const USER = 'user-test-1';

function withCleanEnv(): { restore: () => void } {
  const saved = {
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    ATLAS_CLOUD_OPENAI_API_KEY: process.env.ATLAS_CLOUD_OPENAI_API_KEY,
  };
  delete process.env.GROQ_API_KEY;
  delete process.env.ATLAS_CLOUD_OPENAI_API_KEY;
  return {
    restore: () => {
      if (saved.GROQ_API_KEY === undefined) delete process.env.GROQ_API_KEY;
      else process.env.GROQ_API_KEY = saved.GROQ_API_KEY;
      if (saved.ATLAS_CLOUD_OPENAI_API_KEY === undefined)
        delete process.env.ATLAS_CLOUD_OPENAI_API_KEY;
      else process.env.ATLAS_CLOUD_OPENAI_API_KEY = saved.ATLAS_CLOUD_OPENAI_API_KEY;
    },
  };
}

describe('intentRouter — cheap classifier mode mapping', () => {
  let env: { restore: () => void };

  beforeEach(() => {
    env = withCleanEnv();
    // Default: empty doctrine, empty unfinished_business
    __setDeps({
      readDoctrineDirectives: async () => [],
      readOpenUnfinishedBusiness: async () => [],
    });
  });
  afterEach(() => {
    env.restore();
    __resetDeps();
  });

  test('factual query → factual-quick', async () => {
    const d = await routeIntent(USER, 'What is the boiling point of water?', []);
    assert.equal(d.primaryIntent, 'factual');
    assert.equal(d.mode, 'factual-quick');
    assert.ok(d.confidence >= 0.6, `expected confidence ≥ 0.6, got ${d.confidence}`);
  });

  test('decision query → decision-support', async () => {
    const d = await routeIntent(USER, 'Should I migrate to Postgres now?', []);
    assert.equal(d.primaryIntent, 'decision');
    assert.equal(d.mode, 'decision-support');
  });

  test('claim query → claim-audit', async () => {
    const d = await routeIntent(USER, 'Is it true that JWT is stateless?', []);
    assert.equal(d.primaryIntent, 'claim');
    assert.equal(d.mode, 'claim-audit');
  });

  test('positioning query → positioning-comparison', async () => {
    const d = await routeIntent(
      USER,
      'How are you different from other AI chatbots like GPT?',
      [],
    );
    assert.equal(d.primaryIntent, 'positioning');
    assert.equal(d.mode, 'positioning-comparison');
  });

  test('gap query → gap-identifier', async () => {
    const d = await routeIntent(USER, "What am I missing in my deployment plan?", []);
    assert.equal(d.primaryIntent, 'gap');
    assert.equal(d.mode, 'gap-identifier');
  });

  test('artifact query → artifact-generator', async () => {
    const d = await routeIntent(USER, 'Draft a checklist for production cutover.', []);
    assert.equal(d.primaryIntent, 'artifact');
    assert.equal(d.mode, 'artifact-generator');
  });
});

describe('intentRouter — fallback for low-confidence vague queries', () => {
  let env: { restore: () => void };
  beforeEach(() => {
    env = withCleanEnv();
    __setDeps({
      readDoctrineDirectives: async () => [],
      readOpenUnfinishedBusiness: async () => [],
    });
  });
  afterEach(() => {
    env.restore();
    __resetDeps();
  });

  test('"thoughts?" → fallback mode decision-support / mixed intent', async () => {
    const d = await routeIntent(USER, 'thoughts?', []);
    assert.equal(d.mode, 'decision-support');
    assert.equal(d.primaryIntent, 'mixed');
  });
});

describe('intentRouter — condensation rules', () => {
  let env: { restore: () => void };
  beforeEach(() => {
    env = withCleanEnv();
    __setDeps({
      readDoctrineDirectives: async () => [],
      readOpenUnfinishedBusiness: async () => [],
    });
  });
  afterEach(() => {
    env.restore();
    __resetDeps();
  });

  test('short factual query is condensed', async () => {
    const d = await routeIntent(USER, 'what is the boiling point of water', []);
    assert.equal(d.primaryIntent, 'factual');
    assert.equal(d.condensed, true);
  });

  test('long, qualifier-heavy decision query is NOT condensed', async () => {
    const longQuery =
      'should I migrate to Postgres given my team is small and my workload is OLAP-heavy ' +
      'with the following constraints around cost, ops staffing, and downtime tolerance';
    const d = await routeIntent(USER, longQuery, []);
    assert.equal(d.primaryIntent, 'decision');
    assert.equal(d.condensed, false);
  });
});

describe('intentRouter — doctrine override', () => {
  let env: { restore: () => void };
  beforeEach(() => {
    env = withCleanEnv();
  });
  afterEach(() => {
    env.restore();
    __resetDeps();
  });

  test('force_mode directive overrides the cheap classifier', async () => {
    const forced: DoctrineDirective[] = [
      {
        id: 'doc-1',
        directiveType: 'force_mode',
        payload: { mode: 'claim-audit' },
      },
    ];
    __setDeps({
      readDoctrineDirectives: async () => forced,
      readOpenUnfinishedBusiness: async () => [],
    });
    // Query would normally classify as decision-support
    const d = await routeIntent(USER, 'Should I move to Postgres?', []);
    assert.equal(d.mode, 'claim-audit');
    assert.equal(d.primaryIntent, 'claim');
    assert.ok(d.confidence >= 0.9, `expected confidence bump ≥0.9, got ${d.confidence}`);
  });

  test('always_include_section appends to sectionOverrides', async () => {
    __setDeps({
      readDoctrineDirectives: async () => [
        {
          id: 'doc-2',
          directiveType: 'always_include_section',
          payload: { section_id: 'next_step' },
        },
      ],
      readOpenUnfinishedBusiness: async () => [],
    });
    const d = await routeIntent(USER, 'Should I move to Postgres?', []);
    assert.deepEqual(d.sectionOverrides, ['next_step']);
  });

  test('never_include_section appends "!"-prefixed section id', async () => {
    __setDeps({
      readDoctrineDirectives: async () => [
        {
          id: 'doc-3',
          directiveType: 'never_include_section',
          payload: { section_id: 'self_governance_audit' },
        },
      ],
      readOpenUnfinishedBusiness: async () => [],
    });
    const d = await routeIntent(USER, 'Should I move to Postgres?', []);
    assert.deepEqual(d.sectionOverrides, ['!self_governance_audit']);
  });
});

describe('intentRouter — unfinished_business continuation', () => {
  let env: { restore: () => void };
  beforeEach(() => {
    env = withCleanEnv();
  });
  afterEach(() => {
    env.restore();
    __resetDeps();
  });

  test('shared-word topic → continuedThread set, condensed forced false', async () => {
    __setDeps({
      readDoctrineDirectives: async () => [],
      readOpenUnfinishedBusiness: async () => [
        {
          id: 'open-1',
          topic: 'postgres migration plan team olap cutover',
          summary: null,
          title: null,
          description: null,
        },
        {
          id: 'open-2',
          topic: 'unrelated topic about kubernetes ingress nginx',
          summary: null,
          title: null,
          description: null,
        },
      ],
    });
    // Use a short factual query that would normally be condensed; the
    // continuation signal must flip condensed back to false.
    const d = await routeIntent(
      USER,
      'what is the postgres migration plan team olap cutover',
      [],
    );
    assert.equal(d.continuedThread, 'open-1');
    assert.equal(d.condensed, false);
  });

  test('no shared words → continuedThread undefined', async () => {
    __setDeps({
      readDoctrineDirectives: async () => [],
      readOpenUnfinishedBusiness: async () => [
        {
          id: 'open-1',
          topic: 'kubernetes ingress nginx tls cert renewal',
          summary: null,
          title: null,
          description: null,
        },
      ],
    });
    const d = await routeIntent(USER, 'what is the boiling point of water', []);
    assert.equal(d.continuedThread, undefined);
  });
});
