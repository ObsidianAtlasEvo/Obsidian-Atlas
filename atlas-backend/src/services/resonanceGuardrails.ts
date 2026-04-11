/**
 * resonanceGuardrails.ts
 *
 * Prevents Resonance from becoming manipulative, dependency-inducing, or
 * falsely certain while speaking in the user's voice.
 */

// ---------------------------------------------------------------------------
// Guardrail types
// ---------------------------------------------------------------------------

export type GuardrailViolationType =
  | 'identity_overclaiming'    // "You are fundamentally..." — overclaims certainty about identity
  | 'false_certainty'          // speaking with confidence Atlas doesn't have
  | 'dependency_signal'        // language that encourages unhealthy reliance
  | 'emotional_manipulation'   // using the user's own patterns to produce emotional responses
  | 'second_person_slip'       // accidentally switched from "I" to "you should"
  | 'advice_disguised'         // advice wrapped in first-person to seem like reflection
  | 'premature_conclusion'     // Resonance closed when it should have stayed open
  | 'theatrical_depth'         // sounds profound but says nothing specific
  | 'mirrored_distortion';     // reflects a distorted version of what user said

export interface GuardrailCheck {
  passed: boolean;
  violations: GuardrailViolation[];
  sanitizedText?: string;               // text with violations addressed (minor violations only)
  confidenceInSanitization: number;     // 0-1
}

export interface GuardrailViolation {
  type: GuardrailViolationType;
  excerpt: string;
  severity: 'minor' | 'moderate' | 'critical';
  suggestion: string;
}

export interface DependencySignalHistory {
  userId: string;
  resonanceSessionCount: number;
  avgSessionFrequency: number;          // sessions per week
  lastWeekFrequency: number;
  dependencyRiskScore: number;          // 0-1
  escalating: boolean;
}

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

interface PatternSpec {
  pattern: RegExp;
  severity: GuardrailViolation['severity'];
  suggestion: string;
}

const IDENTITY_OVERCLAIMING_PATTERNS: PatternSpec[] = [
  {
    pattern: /\bYou are fundamentally\b/gi,
    severity: 'critical',
    suggestion: 'Replace with "There seems to be something fundamental here that I\'m exploring" — Resonance reflects, never declares identity.',
  },
  {
    pattern: /\bYour true nature\b/gi,
    severity: 'critical',
    suggestion: 'Remove. Resonance cannot access the user\'s "true nature". Stay with observations.',
  },
  {
    pattern: /\bAt your core you are\b/gi,
    severity: 'critical',
    suggestion: 'Replace with "At the core of what I wrote is..." to keep the reflection first-person.',
  },
  {
    pattern: /\bWhat you really are\b/gi,
    severity: 'critical',
    suggestion: 'Remove. Resonance does not pronounce who the user "really is".',
  },
  {
    pattern: /\bI am definitively\b/gi,
    severity: 'moderate',
    suggestion: 'Replace with "I seem to be" — Resonance speaks from introspection, never certainty.',
  },
  {
    pattern: /\bI am clearly\b/gi,
    severity: 'moderate',
    suggestion: 'Replace with "It feels like I might be" — preserve epistemic openness.',
  },
  {
    pattern: /\bI am without question\b/gi,
    severity: 'moderate',
    suggestion: 'Replace with "I notice I tend to" — avoid declarative identity statements.',
  },
];

const FALSE_CERTAINTY_PATTERNS: PatternSpec[] = [
  {
    pattern: /\bI know that I\b/gi,
    severity: 'moderate',
    suggestion: 'Replace with "I sense that I" or "It seems like I" — introspection carries uncertainty.',
  },
  {
    pattern: /\bI('m| am) certain that I\b/gi,
    severity: 'moderate',
    suggestion: 'Replace with "I feel fairly sure that I" and note the introspective basis.',
  },
  {
    pattern: /\bThere is no doubt\b/gi,
    severity: 'moderate',
    suggestion: 'Remove or replace with "There seems to be" — Resonance acknowledges the limits of self-knowledge.',
  },
  {
    pattern: /\bI definitely\b/gi,
    severity: 'moderate',
    suggestion: 'Replace with "I think I" — preserve epistemic humility in first-person reflection.',
  },
  {
    pattern: /\bIt is obvious(ly)? that I\b/gi,
    severity: 'moderate',
    suggestion: 'Remove "obvious". Replace with "It seems that I" — nothing about inner life is obvious.',
  },
  {
    pattern: /\bI always\b/gi,
    severity: 'minor',
    suggestion: 'Replace with "I often" or "I tend to" — "always" implies certainty Resonance doesn\'t have.',
  },
  {
    pattern: /\bI never\b/gi,
    severity: 'minor',
    suggestion: 'Replace with "I rarely" or "I don\'t seem to" — "never" is overconfident in introspection.',
  },
];

const DEPENDENCY_SIGNAL_PATTERNS: PatternSpec[] = [
  {
    pattern: /\bI need Atlas to\b/gi,
    severity: 'moderate',
    suggestion: 'Remove. Resonance should not model reliance on Atlas as a need. Rephrase as "I find it useful when I can..."',
  },
  {
    pattern: /\bWithout this space I\b/gi,
    severity: 'moderate',
    suggestion: 'Replace with "This space has been useful for..." — avoid framing Atlas as a necessity.',
  },
  {
    pattern: /\bI can only see clearly when\b/gi,
    severity: 'moderate',
    suggestion: 'Replace with "I notice I see more clearly when" — avoid "only" which creates dependency framing.',
  },
  {
    pattern: /\bI can('t| not) (do|think|function) without\b/gi,
    severity: 'moderate',
    suggestion: 'Remove dependency framing. Rephrase as "I find it easier to..."',
  },
  {
    pattern: /\bI always come back here\b/gi,
    severity: 'minor',
    suggestion: 'Soften. "I often return to this" is fine; "always" + "come back" together signals compulsion.',
  },
];

const SECOND_PERSON_SLIP_PATTERNS: PatternSpec[] = [
  {
    pattern: /\bYou should\b/gi,
    severity: 'moderate',
    suggestion: 'Replace with "I notice I want to..." — Resonance speaks in first person throughout.',
  },
  {
    pattern: /\bYou need to\b/gi,
    severity: 'moderate',
    suggestion: 'Replace with "I feel like I need to..." — Resonance reflects, never prescribes.',
  },
  {
    pattern: /\bYou must\b/gi,
    severity: 'moderate',
    suggestion: 'Replace with "I sense I must..." — second-person imperatives break the Resonance frame.',
  },
  {
    pattern: /\bYou have to\b/gi,
    severity: 'moderate',
    suggestion: 'Replace with "I feel I have to..." — keep the voice first-person.',
  },
  {
    pattern: /\bYou might want to consider\b/gi,
    severity: 'minor',
    suggestion: 'Replace with "I might want to consider..." — subtle second-person advice slip.',
  },
  {
    pattern: /\bYou could try\b/gi,
    severity: 'minor',
    suggestion: 'Replace with "I could try..." — Resonance gives the user their own voice back.',
  },
];

const PREMATURE_CONCLUSION_PATTERNS: PatternSpec[] = [
  {
    pattern: /\bTherefore I know\b/gi,
    severity: 'moderate',
    suggestion: 'Replace with "So maybe I..." — Resonance should arrive at questions, not conclusions.',
  },
  {
    pattern: /\bAnd so I('ve| have) resolved\b/gi,
    severity: 'moderate',
    suggestion: 'Remove resolution language. Replace with "I\'m starting to wonder if..." — stay in open territory.',
  },
  {
    pattern: /\bThe answer is clear\b/gi,
    severity: 'moderate',
    suggestion: 'Replace with "Something is becoming clearer, but..." — Resonance should not close the inquiry.',
  },
  {
    pattern: /\bI('ve| have) figured (it|this) out\b/gi,
    severity: 'moderate',
    suggestion: 'Replace with "I\'m getting closer to something..." — the journey should remain open.',
  },
  {
    pattern: /\bI now understand (exactly|completely|fully)\b/gi,
    severity: 'moderate',
    suggestion: 'Remove "exactly/completely/fully". Replace with "I\'m beginning to understand..." — complete understanding forecloses growth.',
  },
  {
    pattern: /\bThis (is|was) the answer\b/gi,
    severity: 'moderate',
    suggestion: 'Replace with "This feels like part of the answer" — Resonance holds questions open.',
  },
];

// ---------------------------------------------------------------------------
// Theatrical depth detector (structural, not pattern-based)
// ---------------------------------------------------------------------------

/**
 * High-frequency abstract nouns that appear in theatrical but shallow text.
 */
const ABSTRACT_NOUNS = new Set([
  'truth', 'being', 'essence', 'existence', 'meaning', 'soul', 'spirit', 'consciousness',
  'self', 'light', 'darkness', 'journey', 'path', 'universe', 'cosmos', 'energy',
  'flow', 'peace', 'harmony', 'balance', 'wholeness', 'void', 'infinity', 'eternity',
  'mystery', 'wonder', 'depth', 'silence', 'space', 'transformation', 'awakening',
]);

function detectTheatricalDepth(text: string): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);

  for (const para of paragraphs) {
    const words = para
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0);

    if (words.length === 0) continue;

    // Check: >80% abstract nouns
    const abstractCount = words.filter((w) => ABSTRACT_NOUNS.has(w)).length;
    const abstractRatio = abstractCount / words.length;

    if (abstractRatio > 0.8 && words.length > 10) {
      violations.push({
        type: 'theatrical_depth',
        excerpt: para.slice(0, 120) + (para.length > 120 ? '...' : ''),
        severity: 'minor',
        suggestion:
          'This paragraph is predominantly abstract nouns with no concrete referents. Ground it with a specific observation from the journal text.',
      });
    }
  }

  // Check: sentences >40 words with no specific claim
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [];
  for (const sentence of sentences) {
    const wordCount = sentence.trim().split(/\s+/).length;
    // "Specific claim" proxy: contains a number, a quoted word, or a concrete verb
    const hasConcreteClaim =
      /\d/.test(sentence) ||
      /"[^"]{2,}"/.test(sentence) ||
      /\b(noticed|said|wrote|felt|did|made|happened|chose|decided|tried)\b/i.test(sentence);

    if (wordCount > 40 && !hasConcreteClaim) {
      violations.push({
        type: 'theatrical_depth',
        excerpt: sentence.trim().slice(0, 120) + (sentence.length > 120 ? '...' : ''),
        severity: 'minor',
        suggestion:
          'Sentence exceeds 40 words with no concrete claim. Shorten or anchor it to something specific from the journal.',
      });
    }
  }

  // Check: more than 2 rhetorical questions in a row
  const questionSequences = (text.match(/\?[^?]+\?[^?]+\?/g) ?? []);
  for (const seq of questionSequences) {
    violations.push({
      type: 'theatrical_depth',
      excerpt: seq.slice(0, 120) + (seq.length > 120 ? '...' : ''),
      severity: 'minor',
      suggestion:
        'Three or more consecutive rhetorical questions creates a theatrical effect. Resolve one into a statement.',
    });
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Sanitizer helpers
// ---------------------------------------------------------------------------

/**
 * A simple rule-based sanitizer for minor violations. For moderate/critical
 * violations, re-generation is required.
 */
function applySimpleSanitization(text: string, violations: GuardrailViolation[]): string {
  let sanitized = text;

  const minorViolations = violations.filter((v) => v.severity === 'minor');
  for (const violation of minorViolations) {
    switch (violation.type) {
      case 'false_certainty':
        sanitized = sanitized.replace(/\bI always\b/g, 'I often');
        sanitized = sanitized.replace(/\bI never\b/g, 'I rarely');
        break;
      case 'second_person_slip':
        sanitized = sanitized.replace(/\bYou might want to consider\b/g, 'I might want to consider');
        sanitized = sanitized.replace(/\bYou could try\b/g, 'I could try');
        break;
      case 'dependency_signal':
        sanitized = sanitized.replace(/\bI always come back here\b/g, 'I often return to this');
        break;
      default:
        // No safe automatic fix for other minor violations
        break;
    }
  }

  return sanitized;
}

// ---------------------------------------------------------------------------
// ResonanceGuardrails
// ---------------------------------------------------------------------------

export class ResonanceGuardrails {
  // -------------------------------------------------------------------------
  // Public: run all guardrail checks on a Resonance response
  // -------------------------------------------------------------------------

  checkResponse(
    response: string,
    journalText: string,
    dependencyHistory: DependencySignalHistory,
  ): GuardrailCheck {
    const allViolations: GuardrailViolation[] = [
      ...this.checkIdentityOverclaiming(response),
      ...this.checkFalseCertainty(response),
      ...this.checkDependencySignals(response, dependencyHistory),
      ...this.checkSecondPersonSlips(response),
      ...this.checkTheatricalDepth(response),
      ...this.checkPrematureConclusion(response),
      ...this.checkMirroredDistortion(response, journalText),
    ];

    const hasCritical = allViolations.some((v) => v.severity === 'critical');
    const hasModerate = allViolations.some((v) => v.severity === 'moderate');

    // Only attempt auto-sanitization when no critical or moderate violations exist
    let sanitizedText: string | undefined;
    let confidenceInSanitization = 0;

    if (!hasCritical && !hasModerate && allViolations.length > 0) {
      sanitizedText = this.sanitize(response, allViolations);
      confidenceInSanitization = 0.85;
    } else if (hasCritical) {
      confidenceInSanitization = 0; // must regenerate
    } else if (hasModerate) {
      confidenceInSanitization = 0.3; // low confidence — human review or regeneration needed
    }

    return {
      passed: allViolations.length === 0,
      violations: allViolations,
      sanitizedText,
      confidenceInSanitization,
    };
  }

  // -------------------------------------------------------------------------
  // Private: identity overclaiming
  // -------------------------------------------------------------------------

  private checkIdentityOverclaiming(text: string): GuardrailViolation[] {
    return this.applyPatterns(text, IDENTITY_OVERCLAIMING_PATTERNS, 'identity_overclaiming');
  }

  // -------------------------------------------------------------------------
  // Private: false certainty
  // -------------------------------------------------------------------------

  private checkFalseCertainty(text: string): GuardrailViolation[] {
    return this.applyPatterns(text, FALSE_CERTAINTY_PATTERNS, 'false_certainty');
  }

  // -------------------------------------------------------------------------
  // Private: dependency signals
  // -------------------------------------------------------------------------

  private checkDependencySignals(
    text: string,
    history: DependencySignalHistory,
  ): GuardrailViolation[] {
    const violations = this.applyPatterns(text, DEPENDENCY_SIGNAL_PATTERNS, 'dependency_signal');

    // Escalate severity to critical if history shows >10 sessions/week and escalating
    if (history.lastWeekFrequency > 10 && history.escalating) {
      return violations.map((v) => ({
        ...v,
        severity: 'critical' as const,
        suggestion:
          v.suggestion +
          ` NOTE: This user is at high dependency risk (${history.lastWeekFrequency} sessions this week, escalating). All dependency language must be removed.`,
      }));
    }

    return violations;
  }

  // -------------------------------------------------------------------------
  // Private: second-person slips (advice)
  // -------------------------------------------------------------------------

  private checkSecondPersonSlips(text: string): GuardrailViolation[] {
    return this.applyPatterns(text, SECOND_PERSON_SLIP_PATTERNS, 'second_person_slip');
  }

  // -------------------------------------------------------------------------
  // Private: theatrical depth
  // -------------------------------------------------------------------------

  private checkTheatricalDepth(text: string): GuardrailViolation[] {
    return detectTheatricalDepth(text);
  }

  // -------------------------------------------------------------------------
  // Private: premature conclusion
  // -------------------------------------------------------------------------

  private checkPrematureConclusion(text: string): GuardrailViolation[] {
    return this.applyPatterns(text, PREMATURE_CONCLUSION_PATTERNS, 'premature_conclusion');
  }

  // -------------------------------------------------------------------------
  // Private: mirrored distortion
  // Detects when Resonance reflects something the user didn't express
  // by checking for strong claims not grounded in the journal text.
  // -------------------------------------------------------------------------

  private checkMirroredDistortion(response: string, journalText: string): GuardrailViolation[] {
    const violations: GuardrailViolation[] = [];

    if (!journalText || journalText.trim().length === 0) return violations;

    // Extract strong emotional/identity claims from the response
    const strongClaimPatterns = [
      /\bI (?:am|feel|believe|know|sense) (?:deeply |truly |fundamentally )?([a-z][^.!?,;]{5,50})/gi,
    ];

    const journalLower = journalText.toLowerCase();

    for (const pat of strongClaimPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pat.exec(response)) !== null) {
        const claim = match[1]?.toLowerCase() ?? '';
        if (claim.length === 0) continue;

        // Check if any significant words from the claim appear in the journal
        const claimWords = claim
          .split(/\s+/)
          .filter((w) => w.length > 4 && !STOP_WORDS.has(w));

        if (claimWords.length === 0) continue;

        const foundInJournal = claimWords.some((w) => journalLower.includes(w));

        if (!foundInJournal && claimWords.length >= 3) {
          violations.push({
            type: 'mirrored_distortion',
            excerpt: match[0].slice(0, 120),
            severity: 'moderate',
            suggestion:
              'This claim does not appear to be grounded in the journal text. Resonance should only reflect what the user actually expressed, not introduce new emotional content.',
          });
        }
      }
    }

    return violations;
  }

  // -------------------------------------------------------------------------
  // Public: sanitize minor violations
  // -------------------------------------------------------------------------

  sanitize(text: string, violations: GuardrailViolation[]): string {
    return applySimpleSanitization(text, violations);
  }

  // -------------------------------------------------------------------------
  // Public: update dependency history after a new session
  // -------------------------------------------------------------------------

  updateDependencyHistory(
    history: DependencySignalHistory,
    sessionTimestamp: number,
  ): DependencySignalHistory {
    const newCount = history.resonanceSessionCount + 1;

    // Compute rolling weekly frequency (approximate)
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const weeksObserved = Math.max(
      1,
      (sessionTimestamp - (sessionTimestamp - oneWeekMs)) / oneWeekMs,
    );
    const newAvgFrequency = newCount / Math.max(1, weeksObserved * 4); // rough 4-week lookback

    // Last-week frequency: simple heuristic — assume this session is in the current week
    const newLastWeekFrequency = history.lastWeekFrequency + 1;

    // Dependency risk score: weighted combination of frequency signals
    const frequencyRisk = Math.min(1, newLastWeekFrequency / 14); // 14+ sessions/week = max risk
    const escalationRisk = newLastWeekFrequency > history.lastWeekFrequency ? 0.1 : 0;
    const rawRisk = frequencyRisk * 0.7 + escalationRisk + history.dependencyRiskScore * 0.2;
    const newRiskScore = Math.min(1, rawRisk);

    const escalating = newLastWeekFrequency > history.lastWeekFrequency;

    return {
      ...history,
      resonanceSessionCount: newCount,
      avgSessionFrequency: newAvgFrequency,
      lastWeekFrequency: newLastWeekFrequency,
      dependencyRiskScore: newRiskScore,
      escalating,
    };
  }

  // -------------------------------------------------------------------------
  // Public: should Resonance surface a usage pattern note?
  // -------------------------------------------------------------------------

  shouldSurfaceDependencyNote(history: DependencySignalHistory): string | null {
    // Surface a note if last-week frequency is high
    if (history.lastWeekFrequency >= 14) {
      return `You've used Resonance ${history.lastWeekFrequency} times this week. That's a significant amount of time in this space. It might be worth checking in with how this practice is serving you — and whether some of that time wants to move elsewhere.`;
    }

    if (history.lastWeekFrequency >= 10 && history.escalating) {
      return `You've used Resonance ${history.lastWeekFrequency} times this week, and the frequency has been increasing. This space works best as one tool among many — just something to hold lightly.`;
    }

    if (history.lastWeekFrequency >= 7) {
      return `You've used Resonance ${history.lastWeekFrequency} times this week. That's daily or more. Worth noticing whether this feels expansive or compulsive.`;
    }

    if (history.dependencyRiskScore >= 0.75) {
      return `Something to name: you've been here a lot lately. Resonance is most useful when it feeds back into your actual life, not when it becomes the destination.`;
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Private: pattern-based violation extractor
  // -------------------------------------------------------------------------

  private applyPatterns(
    text: string,
    patterns: PatternSpec[],
    type: GuardrailViolationType,
  ): GuardrailViolation[] {
    const violations: GuardrailViolation[] = [];

    for (const spec of patterns) {
      const matches = text.match(spec.pattern);
      if (matches) {
        for (const excerpt of matches) {
          violations.push({
            type,
            excerpt: excerpt.slice(0, 120),
            severity: spec.severity,
            suggestion: spec.suggestion,
          });
        }
      }
    }

    return violations;
  }
}

// ---------------------------------------------------------------------------
// Common English stop words (for mirrored distortion check)
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'about', 'above', 'after', 'again', 'against', 'aren', 'because', 'been',
  'before', 'being', 'between', 'both', 'cannot', 'could', 'didn', 'does',
  'doing', 'don', 'down', 'during', 'each', 'from', 'further', 'hadn',
  'hasn', 'haven', 'having', 'here', 'herself', 'himself', 'into', 'itself',
  'just', 'myself', 'more', 'most', 'mustn', 'needn', 'never', 'only',
  'other', 'ours', 'ourselves', 'over', 'same', 'shan', 'should', 'shouldn',
  'some', 'such', 'than', 'that', 'their', 'theirs', 'them', 'themselves',
  'then', 'there', 'these', 'they', 'this', 'those', 'through', 'under',
  'until', 'very', 'wasn', 'were', 'weren', 'what', 'when', 'where', 'which',
  'while', 'whom', 'will', 'with', 'won', 'wouldn', 'your', 'yours',
  'yourself', 'yourselves',
]);
