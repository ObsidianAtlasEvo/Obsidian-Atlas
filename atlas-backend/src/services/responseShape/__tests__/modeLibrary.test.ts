/**
 * Tests for modeLibrary — the six canonical response shapes.
 *
 * Uses `node:test` (matching the rest of the atlas-backend test suite —
 * `package.json` test script is `tsx --test`). The objective referenced
 * `npx vitest run`; the deviation is documented in the PR body.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MODE_LIBRARY,
  buildModeSystemPrompt,
  resolveSections,
  type ModeDefinition,
} from '../modeLibrary.js';
import type { ModeId, RouterDecision } from '../types.js';

const ALL_MODE_IDS: ModeId[] = [
  'factual-quick',
  'decision-support',
  'claim-audit',
  'positioning-comparison',
  'gap-identifier',
  'artifact-generator',
];

function dec(partial: Partial<RouterDecision> & { mode: ModeId }): RouterDecision {
  // Default primaryIntent to the IntentClass that matches the mode; tests can
  // override via `partial`. ModeId→IntentClass map mirrors intentRouter.ts.
  const modeToIntent: Record<ModeId, RouterDecision['primaryIntent']> = {
    'factual-quick': 'factual',
    'decision-support': 'decision',
    'claim-audit': 'claim',
    'positioning-comparison': 'positioning',
    'gap-identifier': 'gap',
    'artifact-generator': 'artifact',
  };
  return {
    primaryIntent: modeToIntent[partial.mode],
    confidence: 0.9,
    condensed: false,
    reasonTrace: 'test-fixture',
    ...partial,
  };
}

test('MODE_LIBRARY has all 6 modes with required fields populated', () => {
  for (const id of ALL_MODE_IDS) {
    const m = MODE_LIBRARY[id] as ModeDefinition | undefined;
    assert.ok(m, `missing mode: ${id}`);
    assert.equal(m!.id, id);
    assert.ok(m!.displayName.length > 0, `${id}.displayName empty`);
    assert.ok(m!.description.length > 0, `${id}.description empty`);
    assert.ok(Array.isArray(m!.sections) && m!.sections.length > 0, `${id}.sections empty`);
    assert.equal(typeof m!.personalizationKnobs.allowExemplars, 'boolean');
    assert.equal(typeof m!.personalizationKnobs.allowConfidenceRescale, 'boolean');
    assert.equal(typeof m!.gapDetectorHints.allowGapAppend, 'boolean');
  }
  assert.equal(Object.keys(MODE_LIBRARY).length, 6);
});

test('resolveSections on full decision-support returns 5 sections in canonical order', () => {
  const sections = resolveSections(dec({ mode: 'decision-support' }));
  assert.deepEqual(
    sections.map((s) => s.id),
    ['recommendation', 'why', 'tradeoffs', 'flip_conditions', 'next_step'],
  );
});

test('resolveSections on condensed decision-support returns only condensed sections', () => {
  const sections = resolveSections(dec({ mode: 'decision-support', condensed: true }));
  assert.deepEqual(
    sections.map((s) => s.id),
    ['recommendation', 'tradeoffs'],
  );
  for (const s of sections) assert.equal(s.condensed, true);
});

test('resolveSections appends a custom section via override', () => {
  const sections = resolveSections(
    dec({ mode: 'decision-support', sectionOverrides: ['custom_section'] }),
  );
  assert.equal(sections[sections.length - 1]!.id, 'custom_section');
  assert.equal(sections[sections.length - 1]!.label, 'custom_section');
  assert.equal(sections[sections.length - 1]!.required, false);
  // Append, not replace: original 5 sections preserved + 1 appended.
  assert.equal(sections.length, 6);
});

test('resolveSections does not duplicate a section that is already present', () => {
  const sections = resolveSections(
    dec({ mode: 'decision-support', sectionOverrides: ['why'] }),
  );
  // `why` is already canonical; should not be duplicated.
  assert.equal(sections.filter((s) => s.id === 'why').length, 1);
});

test("resolveSections with '!flip_conditions' removes the optional section", () => {
  const sections = resolveSections(
    dec({ mode: 'decision-support', sectionOverrides: ['!flip_conditions'] }),
  );
  assert.equal(sections.find((s) => s.id === 'flip_conditions'), undefined);
  // Other sections preserved.
  assert.equal(sections.length, 4);
});

test("resolveSections with '!recommendation' retains the required section and warns", () => {
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };
  try {
    const sections = resolveSections(
      dec({ mode: 'decision-support', sectionOverrides: ['!recommendation'] }),
    );
    assert.ok(
      sections.some((s) => s.id === 'recommendation'),
      'required section must remain present',
    );
    assert.ok(
      warnings.some((w) => w.includes('recommendation') && w.includes('required')),
      `expected a warning about required section; got: ${JSON.stringify(warnings)}`,
    );
  } finally {
    console.warn = origWarn;
  }
});

test('buildModeSystemPrompt for full decision-support contains every section label', () => {
  const decision = dec({ mode: 'decision-support' });
  const sections = resolveSections(decision);
  const prompt = buildModeSystemPrompt(decision, sections);
  for (const s of sections) {
    assert.ok(
      prompt.includes(s.label),
      `expected prompt to include section label "${s.label}"`,
    );
  }
  assert.ok(prompt.includes('[FULL]'), 'expected [FULL] marker');
  assert.ok(prompt.includes('Decision Support'), 'expected displayName');
});

test('buildModeSystemPrompt for condensed decision-support contains the condensed labels and [CONDENSED]', () => {
  const decision = dec({ mode: 'decision-support', condensed: true });
  const sections = resolveSections(decision);
  const prompt = buildModeSystemPrompt(decision, sections);
  for (const s of sections) {
    assert.ok(prompt.includes(s.label), `expected condensed prompt to include "${s.label}"`);
  }
  assert.ok(prompt.includes('[CONDENSED]'), 'expected [CONDENSED] marker');
  // Sections dropped from the condensed view should not appear as numbered headers.
  assert.ok(!prompt.includes('Next step'), 'next_step is full-only');
});

test('buildModeSystemPrompt for artifact-generator omits the empty-label artifact section from the numbered list', () => {
  const decision = dec({ mode: 'artifact-generator' });
  const sections = resolveSections(decision);
  const prompt = buildModeSystemPrompt(decision, sections);
  // The first numbered entry must not be the empty-labelled "artifact" section.
  // It should be "How to use" (1.) — the first labelled, full-mode entry.
  assert.ok(
    /1\. How to use/.test(prompt),
    `expected first numbered entry to be "How to use"; got prompt:\n${prompt}`,
  );
  // And "artifact" should not appear as a header line.
  assert.ok(!/^\d+\.\s*artifact\s*$/m.test(prompt), 'empty-label section must not be numbered');
});
