/**
 * Wave 3E — End-to-end integration test for the cutover overseer pipeline.
 *
 * Runs `applyOverseerLens` once per mode against a fixture user. All Supabase
 * reads and Groq calls are injected through the wave modules' `__setDeps`
 * helpers so the test is fully hermetic — no network, no DB.
 *
 * Test runner: node:test via tsx --test (per atlas-backend package.json).
 */

// Side-effect import: primes process.env.GROQ_API_KEY before env.js / overseer
// import. ESM hoists imports, so an inline assignment here would run too late.
import './_e2eEnvSetup.js';

import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';

import {
  __setDeps as routerSetDeps,
  __resetDeps as routerResetDeps,
} from '../intentRouter.js';
import {
  __setDeps as personalizationSetDeps,
  __resetDeps as personalizationResetDeps,
} from '../personalizationLayer.js';
import {
  __setDeps as gapSetDeps,
  __resetDeps as gapResetDeps,
} from '../gapDetector.js';
import { applyOverseerLens } from '../../governance/overseerService.js';
import type { ModeId } from '../types.js';

const FIXTURE_USER = 'fixture-user-1';

function savedGroqEnv(): { restore: () => void } {
  const saved = {
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    ATLAS_CLOUD_OPENAI_API_KEY: process.env.ATLAS_CLOUD_OPENAI_API_KEY,
    ATLAS_SHAPE_V2_DISABLE: process.env.ATLAS_SHAPE_V2_DISABLE,
  };
  return {
    restore: () => {
      if (saved.GROQ_API_KEY === undefined) delete process.env.GROQ_API_KEY;
      else process.env.GROQ_API_KEY = saved.GROQ_API_KEY;
      if (saved.ATLAS_CLOUD_OPENAI_API_KEY === undefined)
        delete process.env.ATLAS_CLOUD_OPENAI_API_KEY;
      else process.env.ATLAS_CLOUD_OPENAI_API_KEY = saved.ATLAS_CLOUD_OPENAI_API_KEY;
      if (saved.ATLAS_SHAPE_V2_DISABLE === undefined) delete process.env.ATLAS_SHAPE_V2_DISABLE;
      else process.env.ATLAS_SHAPE_V2_DISABLE = saved.ATLAS_SHAPE_V2_DISABLE;
    },
  };
}

interface Fixture {
  mode: ModeId;
  query: string;
  /** Whether we expect a `> Next:` line appended for this mode in the fixture. */
  expectGapAppend: boolean;
  /** Trigger phrase planted in the upstream raw response so Stage 5 patterns fire. */
  rawAppendTrigger: string;
}

const FIXTURES: Fixture[] = [
  { mode: 'factual-quick', query: 'what is the boiling point of water', expectGapAppend: false, rawAppendTrigger: '' },
  { mode: 'decision-support', query: 'should I migrate to Postgres', expectGapAppend: true, rawAppendTrigger: 'this depends on your workload mix' },
  { mode: 'claim-audit', query: 'is it true that JWT is stateless', expectGapAppend: true, rawAppendTrigger: 'on current sources this is inconclusive' },
  { mode: 'positioning-comparison', query: 'how are you different from gpt', expectGapAppend: true, rawAppendTrigger: 'I cannot yet do native audio streaming' },
  { mode: 'gap-identifier', query: "what am I missing in my deployment plan", expectGapAppend: true, rawAppendTrigger: '' },
  { mode: 'artifact-generator', query: 'draft a checklist for production cutover', expectGapAppend: false, rawAppendTrigger: '' },
];

function setupHermeticDeps(): void {
  // Router: doctrine and unfinished_business empty so cheap classifier wins.
  routerSetDeps({
    readDoctrineDirectives: async () => [],
    readOpenUnfinishedBusiness: async () => [],
  });

  // Personalization: deterministic non-default identity signals so
  // `tone_register` fires; one exemplar so `memory_exemplars` fires.
  personalizationSetDeps({
    readMemoryExemplars: async () => [
      { content: 'User shipped a payments service refactor last quarter.', importance: 0.9, created_at: '2026-01-01T00:00:00Z' },
    ],
    readIdentitySignals: async () => [
      { domain: 'communication_profile', signal_content: JSON.stringify({ verbosity: 'low', tone: 'direct', structure: 'minimal' }) },
      { domain: 'chamber_profile', signal_content: JSON.stringify({ vocab_level: 'expert' }) },
    ],
    readDoctrineDirectives: async () => [],
    readGovernanceEvents: async () => [],
    readAdaptationEvents: async () => [],
    // Echo the synthesized answer so we can assert structure markers survived.
    callGroq: async (_system, user) => {
      const idx = user.indexOf('ANSWER TO TRANSLATE:');
      if (idx < 0) return user;
      return user.slice(idx + 'ANSWER TO TRANSLATE:'.length).trim();
    },
  });

  // Gap detector: cheap deterministic next-step generator; no Supabase writes.
  gapSetDeps({
    fetchUnfinishedRow: async () => null,
    touchUnfinishedRow: async () => true,
    insertUnfinishedRow: async () => ({ ok: true, id: 'ub-new-1' }),
    llmNextStep: async () => 'Sketch the two-week migration timeline and identify the riskiest constraint.',
  });
}

function teardownDeps(): void {
  routerResetDeps();
  personalizationResetDeps();
  gapResetDeps();
}

let env: { restore: () => void };

beforeEach(() => {
  env = savedGroqEnv();
  // Ensure Groq env is set so the overseer doesn't take the "Groq unavailable" branch.
  // The actual calls are mocked by the personalization/gap deps + the test
  // monkey-patches global.fetch for the synthesis/fillGaps groqCall.
  process.env.GROQ_API_KEY = 'test-key';
  delete process.env.ATLAS_SHAPE_V2_DISABLE;
  setupHermeticDeps();
});

afterEach(() => {
  teardownDeps();
  restoreFetch();
  env.restore();
});

// ---------------------------------------------------------------------------
// global.fetch stub — covers groqCall inside overseerService (synthesis +
// fillGaps). Returns a single-string OpenAI-shaped response we control.
// ---------------------------------------------------------------------------
let _originalFetch: typeof global.fetch | undefined;
function patchFetch(routeContent: (system: string, user: string) => string): void {
  _originalFetch = global.fetch;
  global.fetch = (async (
    _input: unknown,
    init?: { body?: string },
  ): Promise<Response> => {
    let system = '';
    let user = '';
    try {
      const parsed = JSON.parse(String(init?.body ?? '{}')) as {
        messages?: Array<{ role: string; content: string }>;
      };
      system = parsed.messages?.find((m) => m.role === 'system')?.content ?? '';
      user = parsed.messages?.find((m) => m.role === 'user')?.content ?? '';
    } catch {
      /* shape unknown */
    }
    const content = routeContent(system, user);
    return new Response(
      JSON.stringify({ choices: [{ message: { content } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof global.fetch;
}

function restoreFetch(): void {
  if (_originalFetch) {
    global.fetch = _originalFetch;
    _originalFetch = undefined;
  }
}

// ---------------------------------------------------------------------------
// One test per mode — the cutover acceptance grid.
// ---------------------------------------------------------------------------

for (const f of FIXTURES) {
  test(`runs end-to-end for mode=${f.mode}`, async () => {
    // For fillGaps: extract the synthesized text it was given and round-trip it
    // back through SUPPLEMENTED_ANSWER so structure survives. We also splice in
    // the rawAppendTrigger so Stage 5 patterns match where expected.
    patchFetch((system, user) => {
      const isFillGaps = /completeness auditor/i.test(system);
      // fillGaps user content is `USER QUERY: …\n\nCURRENT ANSWER:\n${synth}`
      const currentAnswerIdx = user.indexOf('CURRENT ANSWER:');
      if (isFillGaps && currentAnswerIdx >= 0) {
        const synth = user.slice(currentAnswerIdx + 'CURRENT ANSWER:'.length).trim();
        const augmented = f.rawAppendTrigger ? `${synth}\n\n${f.rawAppendTrigger}` : synth;
        return `GAPS_FOUND: none\nSUPPLEMENTED_ANSWER:\n${augmented}`;
      }
      // Synthesis is single-model-passthrough in the no-modelOutputs path, so
      // groqCall would not normally be invoked there. Any other call: echo.
      return user;
    });

    const rawResponse = `Initial answer body for ${f.mode}.`;
    const result = await applyOverseerLens(FIXTURE_USER, rawResponse, {
      query: f.query,
      mode: f.mode,
      userId: FIXTURE_USER,
      modelOutputs: [],
    });

    assert.ok(result, 'expected an OverseerResult');
    assert.ok(result.routerDecision, 'expected routerDecision to be populated');
    assert.equal(
      result.routerDecision!.mode,
      f.mode,
      `router should pick ${f.mode} for query "${f.query}"`,
    );

    // Stage 5: gap append behaviour matches expectation for this mode.
    if (f.expectGapAppend) {
      assert.match(
        result.response,
        /\n\n> (Next|Continues): /,
        `mode ${f.mode} should have an appended > Next/Continues line`,
      );
    } else {
      assert.doesNotMatch(
        result.response,
        /\n\n> Next: /,
        `mode ${f.mode} must NOT have a > Next: line`,
      );
    }

    // Personalization fired at least once when channels return data.
    assert.ok(
      result.personalizationApplied.length > 0,
      `mode ${f.mode}: expected at least one personalization channel to fire`,
    );

    // Removed-content guard: no Self-Governance/Audit-style block ever
    // emitted by the integrated pipeline (these are only ever in
    // modeLibrary's negative-instruction prompt).
    assert.doesNotMatch(result.response, /Self-Governance Audit/i);
    assert.doesNotMatch(result.response, /Intellectual Self-Governance/i);
    assert.doesNotMatch(result.response, /Framing-bias call-out/i);
  });
}

test('kill switch: ATLAS_SHAPE_V2_DISABLE=1 routes through legacy path', async () => {
  process.env.ATLAS_SHAPE_V2_DISABLE = '1';
  patchFetch((system, user) => {
    if (/completeness auditor/i.test(system)) {
      const idx = user.indexOf('CURRENT ANSWER:');
      const synth = idx >= 0 ? user.slice(idx + 'CURRENT ANSWER:'.length).trim() : '';
      return `GAPS_FOUND: none\nSUPPLEMENTED_ANSWER:\n${synth}`;
    }
    if (/user-lens translator/i.test(system)) {
      const idx = user.indexOf('ANSWER TO TRANSLATE:');
      return idx >= 0 ? user.slice(idx + 'ANSWER TO TRANSLATE:'.length).trim() : 'translated';
    }
    return 'legacy';
  });

  const result = await applyOverseerLens(FIXTURE_USER, 'legacy raw answer', {
    query: 'anything',
    mode: 'fast',
    userId: FIXTURE_USER,
    modelOutputs: [],
  });

  assert.equal(result.routerDecision, null, 'legacy path must not produce a routerDecision');
  assert.deepEqual(result.personalizationApplied, []);
  assert.deepEqual(result.gapDetectorOutcome, {});
  assert.match(result.synthesisNotes, /legacy-v1/);
});
