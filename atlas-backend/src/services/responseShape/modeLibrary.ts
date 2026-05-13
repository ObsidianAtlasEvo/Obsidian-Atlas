/**
 * modeLibrary — the six canonical response shapes (spec § 2).
 *
 * Pure data + pure helpers. No I/O, no Supabase, no LLM calls. Consumed by
 * the synthesizer to drive section ordering and the mode-specific system
 * prompt fragment.
 */

import type { ModeId, RouterDecision, SectionId } from './types.js';

export interface ModeSection {
  id: SectionId;
  /** Human-readable header used in the response. Empty string ⇒ render content without a header. */
  label: string;
  /** If true, cannot be removed via a `!section` override. */
  required: boolean;
  /** Included when the mode is rendered condensed. */
  condensed: boolean;
}

export interface ModeDefinition {
  id: ModeId;
  displayName: string;
  /** 1–2 sentences; used in the synthesis system prompt. */
  description: string;
  /** Canonical, ordered. */
  sections: ModeSection[];
  personalizationKnobs: {
    allowExemplars: boolean;
    allowConfidenceRescale: boolean;
  };
  gapDetectorHints: {
    allowGapAppend: boolean;
    /** Confidence below which a gap line should be appended. */
    appendThreshold?: number;
  };
}

export const MODE_LIBRARY: Record<ModeId, ModeDefinition> = {
  'factual-quick': {
    id: 'factual-quick',
    displayName: 'Quick Answer',
    description:
      'Direct factual response. Single answer, optional one-line context. No multi-section structure.',
    sections: [
      { id: 'answer', label: 'Answer', required: true, condensed: true },
      { id: 'context', label: 'Context', required: false, condensed: false },
    ],
    personalizationKnobs: { allowExemplars: false, allowConfidenceRescale: true },
    gapDetectorHints: { allowGapAppend: false, appendThreshold: 0.7 },
  },

  'decision-support': {
    id: 'decision-support',
    displayName: 'Decision Support',
    description:
      'Help the user make a specific choice. Lead with the recommendation; surface the trade-offs that matter; name what would flip the call.',
    sections: [
      { id: 'recommendation', label: 'Recommendation', required: true, condensed: true },
      { id: 'why', label: 'Why', required: true, condensed: false },
      { id: 'tradeoffs', label: 'Trade-offs', required: true, condensed: true },
      { id: 'flip_conditions', label: 'What would change the call', required: false, condensed: false },
      { id: 'next_step', label: 'Next step', required: false, condensed: false },
    ],
    personalizationKnobs: { allowExemplars: true, allowConfidenceRescale: true },
    gapDetectorHints: { allowGapAppend: true },
  },

  'claim-audit': {
    id: 'claim-audit',
    displayName: 'Claim Audit',
    description:
      'Evaluate whether a stated claim is true. Verdict-first; show evidence on both sides; state confidence and where the verdict could fail.',
    sections: [
      { id: 'verdict', label: 'Verdict', required: true, condensed: true },
      { id: 'evidence_for', label: 'Evidence for', required: true, condensed: false },
      { id: 'evidence_against', label: 'Evidence against', required: true, condensed: false },
      { id: 'confidence', label: 'Confidence', required: true, condensed: true },
      { id: 'failure_modes', label: 'Where this verdict could fail', required: false, condensed: false },
    ],
    personalizationKnobs: { allowExemplars: false, allowConfidenceRescale: true },
    gapDetectorHints: { allowGapAppend: true },
  },

  'positioning-comparison': {
    id: 'positioning-comparison',
    displayName: 'Positioning',
    description:
      "Answer a question about how Atlas (or the user's system) compares to alternatives. State the operational difference, then demonstrate it; name honest limits.",
    sections: [
      { id: 'operational_difference', label: 'Operational difference', required: true, condensed: true },
      { id: 'demonstration', label: 'Demonstration', required: true, condensed: true },
      { id: 'where_it_shows_up', label: 'Where it shows up in practice', required: false, condensed: false },
      { id: 'honest_limits', label: 'Honest limits', required: true, condensed: false },
    ],
    personalizationKnobs: { allowExemplars: true, allowConfidenceRescale: false },
    gapDetectorHints: { allowGapAppend: true },
  },

  'gap-identifier': {
    id: 'gap-identifier',
    displayName: 'Gap Identifier',
    description:
      "Surface a missing piece in the user's system. Name the gap; show evidence it's real; describe what it blocks; propose the smallest test to close it.",
    sections: [
      { id: 'gap', label: 'The gap', required: true, condensed: true },
      { id: 'evidence', label: 'Evidence the gap is real', required: true, condensed: false },
      { id: 'what_it_blocks', label: 'What it blocks', required: true, condensed: false },
      { id: 'smallest_test', label: 'Smallest test to close it', required: true, condensed: true },
    ],
    personalizationKnobs: { allowExemplars: true, allowConfidenceRescale: true },
    gapDetectorHints: { allowGapAppend: true },
  },

  'artifact-generator': {
    id: 'artifact-generator',
    displayName: 'Artifact',
    description:
      'The user asked for a usable thing. Produce the artifact itself as the primary output; keep framing minimal.',
    sections: [
      { id: 'artifact', label: '', required: true, condensed: true },
      { id: 'how_to_use', label: 'How to use', required: false, condensed: false },
      { id: 'what_to_adapt', label: 'What to adapt', required: false, condensed: false },
    ],
    personalizationKnobs: { allowExemplars: false, allowConfidenceRescale: false },
    gapDetectorHints: { allowGapAppend: false },
  },
};

/**
 * Resolve the final ordered section list for a router decision.
 *
 * Order of operations:
 *   1. Start from the canonical sections for `decision.mode`.
 *   2. If `decision.condensed`, drop sections with `condensed === false`.
 *   3. Apply `decision.sectionOverrides`:
 *        - "section_id"   → append `{ id, label: id, required: false, condensed: true }`
 *                            if not already present
 *        - "!section_id"  → if present and not required, remove; if required, keep
 *                            and warn (cannot strip required sections via override)
 *   4. Preserve original ordering for retained sections; appended sections are
 *      placed at the end in override order.
 */
export function resolveSections(decision: RouterDecision): ModeSection[] {
  const mode = MODE_LIBRARY[decision.mode];
  if (!mode) {
    throw new Error(`Unknown response mode: ${decision.mode}`);
  }

  let sections: ModeSection[] = mode.sections.slice();
  if (decision.condensed) {
    sections = sections.filter((s) => s.condensed);
  }

  const overrides = decision.sectionOverrides ?? [];
  for (const raw of overrides) {
    if (raw.startsWith('!')) {
      const id = raw.slice(1);
      const idx = sections.findIndex((s) => s.id === id);
      if (idx < 0) continue;
      if (sections[idx]!.required) {
        console.warn(
          `[modeLibrary] cannot strip required section '${id}' from mode '${decision.mode}' via override`,
        );
        continue;
      }
      sections.splice(idx, 1);
    } else {
      const id = raw;
      if (sections.some((s) => s.id === id)) continue;
      sections.push({ id, label: id, required: false, condensed: true });
    }
  }

  return sections;
}

/**
 * Build the synthesis system-prompt fragment for a mode + resolved section
 * list. The output is a single string suitable for prepending to the
 * synthesizer's system prompt.
 */
export function buildModeSystemPrompt(
  decision: RouterDecision,
  sections: ModeSection[],
): string {
  const mode = MODE_LIBRARY[decision.mode];
  if (!mode) {
    throw new Error(`Unknown response mode: ${decision.mode}`);
  }

  const headerLine = `RESPONSE MODE: ${mode.displayName} — ${mode.description}`;
  const formLine = decision.condensed ? '[CONDENSED]' : '[FULL]';

  // Numbered list of sections by label; sections with an empty label are
  // rendered as "no header" content and intentionally omitted from the numbered
  // structure block (they are still produced, just without a heading).
  const labelled = sections.filter((s) => s.label.length > 0);
  const numbered = labelled.map((s, i) => `${i + 1}. ${s.label}`).join('\n');

  return [
    headerLine,
    formLine,
    '',
    'Required structure (preserve in order, use the labels exactly):',
    numbered,
    '',
    'Rules:',
    '- Do NOT add sections beyond this list.',
    '- Do NOT add a "Self-Governance Audit", "Framing-bias call-out", or "Intellectual Honesty" section.',
    '- Sections without a listed label are rendered without a header (raw content only).',
    '- Stay in this mode; do not switch shapes mid-response.',
  ].join('\n');
}
