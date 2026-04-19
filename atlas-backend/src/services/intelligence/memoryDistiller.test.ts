/**
 * memoryDistiller tests — focus on the pure bits we can exercise without
 * Supabase: the JSON-output parser, the prompt builder, and schema guardrails.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __internal } from './memoryDistiller.js';

const { parseDistillerJson, distillerOutputSchema, buildDistillerUser } = __internal;

test('parseDistillerJson accepts a clean JSON object with memories + policy_hint', () => {
  const raw = JSON.stringify({
    memories: [
      { kind: 'preference', content: 'Prefers concise, no-hedge answers.', importance: 0.85 },
      { kind: 'fact',       content: 'Works in the Pacific Time zone.',     importance: 0.6 },
    ],
    policy_hint: {
      verbosity: 'low',
      tone: 'direct',
      confidence: 0.82,
      evidence: ['"stop hedging, just give me the answer"'],
    },
  });

  const out = parseDistillerJson(raw);
  assert.ok(out, 'should parse');
  assert.equal(out.memories.length, 2);
  assert.equal(out.memories[0]?.kind, 'preference');
  assert.equal(out.policy_hint?.verbosity, 'low');
  assert.equal(out.policy_hint?.confidence, 0.82);
});

test('parseDistillerJson strips markdown code fences', () => {
  const raw = '```json\n{"memories": [], "policy_hint": null}\n```';
  const out = parseDistillerJson(raw);
  assert.ok(out);
  assert.equal(out.memories.length, 0);
  assert.equal(out.policy_hint, null);
});

test('parseDistillerJson recovers from leading/trailing prose', () => {
  const raw = 'Here is the JSON you asked for:\n{"memories": [{"kind":"goal","content":"Ship Phase 0.5 by Friday.","importance":0.9}]}\nThanks!';
  const out = parseDistillerJson(raw);
  assert.ok(out);
  assert.equal(out.memories[0]?.kind, 'goal');
});

test('parseDistillerJson rejects invalid kind values', () => {
  const raw = JSON.stringify({
    memories: [{ kind: 'random', content: 'oops', importance: 0.5 }],
  });
  const out = parseDistillerJson(raw);
  assert.equal(out, null);
});

test('parseDistillerJson rejects importance outside 0..1', () => {
  const raw = JSON.stringify({
    memories: [{ kind: 'fact', content: 'x', importance: 2.5 }],
  });
  const out = parseDistillerJson(raw);
  assert.equal(out, null);
});

test('parseDistillerJson rejects outright malformed JSON', () => {
  const raw = 'not json at all, lol';
  const out = parseDistillerJson(raw);
  assert.equal(out, null);
});

test('distillerOutputSchema allows policy_hint to be omitted', () => {
  const parsed = distillerOutputSchema.safeParse({ memories: [] });
  assert.ok(parsed.success);
});

test('buildDistillerUser includes existing memories section when present', () => {
  const user = buildDistillerUser('[user] hi\n[assistant] hello', [
    'Prefers bullet points.',
    'Lives in Portland.',
  ]);
  assert.ok(user.includes('RECENT_CONVERSATION'));
  assert.ok(user.includes('EXISTING_DURABLE_MEMORIES'));
  assert.ok(user.includes('Prefers bullet points.'));
});

test('buildDistillerUser omits existing section when empty', () => {
  const user = buildDistillerUser('[user] hi', []);
  assert.ok(user.includes('RECENT_CONVERSATION'));
  assert.ok(!user.includes('EXISTING_DURABLE_MEMORIES'));
});

test('distillerOutputSchema enforces truthFirstStrictnessDelta bounds', () => {
  const parsed = distillerOutputSchema.safeParse({
    memories: [],
    policy_hint: { truthFirstStrictnessDelta: 0.3, confidence: 0.9 },
  });
  assert.equal(parsed.success, false, 'delta > 0.15 must be rejected');
});
