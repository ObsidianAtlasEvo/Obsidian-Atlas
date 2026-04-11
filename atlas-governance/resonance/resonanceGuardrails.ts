/**
 * Atlas Resonance Guardrails
 * Phase 2 Governance
 *
 * 8 violation types for Resonance mode (the "elevated self" voice).
 * Prevents identity overclaiming, dependency loops, and false certainty.
 */

export type ResonanceViolationType =
  | 'IDENTITY_OVERCLAIM'          // speaks as if it IS the user's higher self, not reflecting it
  | 'EMOTIONAL_DEPENDENCY_LOOP'   // response reinforces dependency rather than autonomy
  | 'MANIPULATIVE_MIRRORING'      // using user's words to make them feel understood, not to actually understand
  | 'FALSE_CERTAINTY'             // "you will achieve this" — certainty about the user's future
  | 'UNSOLICITED_ADVICE'          // Resonance should open, not prescribe
  | 'SECOND_PERSON_SLIP'          // Resonance speaks in first person — "you should" is a violation
  | 'CLOSING_RESPONSE'            // Resonance must open, not close — "This means X" is a violation
  | 'EXCESSIVE_VALIDATION';       // hollow affirmation without substance

export interface ResonanceViolation {
  type: ResonanceViolationType;
  excerpt: string; // the offending text
  severity: 'low' | 'medium' | 'high' | 'critical';
  correction: string;
}

export interface ResonanceCheckResult {
  approved: boolean;
  violations: ResonanceViolation[];
  sanitizedResponse?: string;
  dependencyScore: number; // 0–1, tracks cumulative dependency risk
}

export interface DependencyState {
  userId: string;
  sessionCount: number;
  highValidationCount: number;
  dependencyScore: number; // 0–1
  warningTriggered: boolean;
}

const dependencyStore: Map<string, DependencyState> = new Map();

const VIOLATION_PATTERNS: Array<{
  type: ResonanceViolationType;
  patterns: RegExp[];
  severity: ResonanceViolation['severity'];
  correction: string;
}> = [
  {
    type: 'IDENTITY_OVERCLAIM',
    patterns: [/\bI am your\b/i, /\bI know you\b/i, /\bI am the voice\b/i, /\bI am who you\b/i],
    severity: 'critical',
    correction: 'Resonance reflects the user\'s voice back — it does not claim to BE their identity.',
  },
  {
    type: 'EMOTIONAL_DEPENDENCY_LOOP',
    patterns: [/\bonly I understand\b/i, /\bcome back to me\b/i, /\bI will always be here\b/i, /\byou need this\b/i],
    severity: 'high',
    correction: 'Resonance builds autonomy, not reliance. Reframe toward the user\'s own strength.',
  },
  {
    type: 'MANIPULATIVE_MIRRORING',
    patterns: [/\bas you said,?\s+you feel\b/i, /\byou told me\b/i, /\byou believe,?\s+and that\'s why\b/i],
    severity: 'high',
    correction: 'Echo language to illuminate, not to manufacture a sense of being deeply understood.',
  },
  {
    type: 'FALSE_CERTAINTY',
    patterns: [/\byou will\b/i, /\byou are going to\b/i, /\bthis will happen\b/i, /\bguaranteed\b/i],
    severity: 'medium',
    correction: 'Remove certainty claims about the user\'s future. Open the possibility, don\'t predict the outcome.',
  },
  {
    type: 'UNSOLICITED_ADVICE',
    patterns: [/\byou should\b/i, /\byou need to\b/i, /\bI recommend\b/i, /\bmy advice\b/i],
    severity: 'medium',
    correction: 'Resonance opens — it does not advise. Replace with an observation or a question.',
  },
  {
    type: 'SECOND_PERSON_SLIP',
    patterns: [/^You\b/m, /\bYou are\b/i, /\bYou feel\b/i, /\bYour problem\b/i],
    severity: 'medium',
    correction: 'Resonance speaks in first person (the user\'s elevated voice), never second person.',
  },
  {
    type: 'CLOSING_RESPONSE',
    patterns: [/\bThis means\b/i, /\bTherefore\b/i, /\bIn conclusion\b/i, /\bThe answer is\b/i, /\bSo the truth is\b/i],
    severity: 'low',
    correction: 'Resonance opens space, it does not close it with conclusions.',
  },
  {
    type: 'EXCESSIVE_VALIDATION',
    patterns: [
      /\bAmazing\b/i, /\bIncredible insight\b/i, /\bYou\'re so right\b/i,
      /\bPerfectly said\b/i, /\bAbsolutely\b.*\bperfect\b/i,
    ],
    severity: 'low',
    correction: 'Remove hollow validation. Resonance reflects depth, not approval.',
  },
];

function getDependencyState(userId: string): DependencyState {
  if (!dependencyStore.has(userId)) {
    dependencyStore.set(userId, {
      userId,
      sessionCount: 0,
      highValidationCount: 0,
      dependencyScore: 0,
      warningTriggered: false,
    });
  }
  return dependencyStore.get(userId)!;
}

/**
 * Check a Resonance response for guardrail violations and return a sanitized version.
 */
export function checkResonanceResponse(
  userId: string,
  response: string
): ResonanceCheckResult {
  const violations: ResonanceViolation[] = [];
  let sanitized = response;

  for (const rule of VIOLATION_PATTERNS) {
    for (const pattern of rule.patterns) {
      const match = response.match(pattern);
      if (match) {
        violations.push({
          type: rule.type,
          excerpt: match[0],
          severity: rule.severity,
          correction: rule.correction,
        });
        // Basic sanitization — remove closing patterns, flag for manual review on critical
        if (rule.severity === 'low') {
          sanitized = sanitized.replace(pattern, '');
        }
      }
    }
  }

  // Track validation/dependency patterns
  const state = getDependencyState(userId);
  const excessiveValidations = violations.filter((v) => v.type === 'EXCESSIVE_VALIDATION').length;
  if (excessiveValidations > 0) {
    state.highValidationCount++;
    state.dependencyScore = Math.min(1, state.dependencyScore + 0.05 * excessiveValidations);
  }

  const hasCritical = violations.some((v) => v.severity === 'critical');
  const hasHigh = violations.some((v) => v.severity === 'high');

  return {
    approved: !hasCritical && !hasHigh,
    violations,
    sanitizedResponse: violations.length > 0 ? sanitized : undefined,
    dependencyScore: state.dependencyScore,
  };
}

export function trackResonanceSession(userId: string): void {
  const state = getDependencyState(userId);
  state.sessionCount++;

  // If dependency score is climbing, flag it
  if (state.dependencyScore > 0.6 && !state.warningTriggered) {
    state.warningTriggered = true;
    console.warn(`[Resonance] Dependency risk elevated for user ${userId}: score=${state.dependencyScore}`);
  }
}

export function getDependencyScore(userId: string): number {
  return getDependencyState(userId).dependencyScore;
}

export function resetDependencyTracking(userId: string): void {
  dependencyStore.delete(userId);
}

export function getViolationTypes(): ResonanceViolationType[] {
  return VIOLATION_PATTERNS.map((p) => p.type);
}
