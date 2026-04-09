/**
 * Drift Detection Engine
 *
 * Heuristic analysis of user behavior patterns to detect misalignment between
 * stated values/goals and actual interaction patterns. Fast, non-LLM-based.
 * Target latency: <10ms.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type DriftType = 'value-drift' | 'goal-drift' | 'behavioral-drift';
export type DriftSeverity = 'low' | 'medium' | 'high';

export interface DriftSignal {
  type: DriftType;
  description: string;
  severity: DriftSeverity;
  evidence: string[];
  detectedAt: string;
}

export interface DriftAnalysisContext {
  currentValues: string[];
  currentGoals: string[];
  recentActions: string[];
  recentQuestions: string[];
  doctrine: string[];
  timeframeDays: number;
}

// ── Keyword dictionaries ───────────────────────────────────────────────────

/** Topics that signal avoidance / procrastination */
const AVOIDANCE_SIGNALS = [
  'distracted', 'procrastinat', 'avoiding', 'keep putting off', 'haven\'t done',
  'haven\'t started', 'can\'t focus', 'lost track', 'forgot', 'slipping',
  'not making progress', 'falling behind', 'overwhelmed', 'scattered',
];

/** Topics that signal reactive/shallow thinking */
const SHALLOW_SIGNALS = [
  'quick fix', 'shortcut', 'just tell me', 'tldr', 'summary only',
  'don\'t need details', 'what\'s the answer', 'simple answer', 'just the answer',
];

/** Topics that signal external blame / locus externalization */
const EXTERNALIZATION_SIGNALS = [
  'it\'s their fault', 'they won\'t let me', 'because of them', 'not my fault',
  'they\'re the problem', 'out of my control', 'nothing i can do', 'blocked by',
  'waiting on them',
];

/** Topics that signal values-aligned behavior */
const VALUES_ALIGNED_SIGNALS = [
  'growth', 'learning', 'deliberate', 'intentional', 'deep work',
  'accountability', 'commitment', 'reflection', 'strategy', 'long-term',
];

/** Topics that signal goal-focused attention */
const GOAL_FOCUSED_SIGNALS = [
  'progress', 'milestone', 'objective', 'goal', 'target', 'deadline',
  'priority', 'focus', 'plan', 'roadmap', 'measure', 'outcome',
];

/** Urgent/reactive behavioral signals */
const REACTIVE_SIGNALS = [
  'urgent', 'asap', 'immediately', 'crisis', 'fire', 'firefight',
  'emergency', 'drop everything', 'right now', 'panic', 'last minute',
];

// ── Helpers ────────────────────────────────────────────────────────────────

function countMatches(texts: string[], keywords: string[]): string[] {
  const matches: string[] = [];
  const combinedText = texts.join(' ').toLowerCase();
  for (const kw of keywords) {
    if (combinedText.includes(kw)) {
      matches.push(kw);
    }
  }
  return matches;
}

function severityFromCount(count: number, total: number): DriftSeverity {
  if (total === 0) return 'low';
  const ratio = count / total;
  if (ratio >= 0.5 || count >= 5) return 'high';
  if (ratio >= 0.25 || count >= 3) return 'medium';
  return 'low';
}

/** Check if value terms appear in stated values */
function extractValueTerms(values: string[]): string[] {
  return values
    .join(' ')
    .toLowerCase()
    .split(/[\s,;.]+/)
    .filter((w) => w.length > 3);
}

/** Check if goal terms appear in stated goals */
function extractGoalTerms(goals: string[]): string[] {
  return goals
    .join(' ')
    .toLowerCase()
    .split(/[\s,;.]+/)
    .filter((w) => w.length > 3);
}

// ── Value Drift Analysis ───────────────────────────────────────────────────

function detectValueDrift(ctx: DriftAnalysisContext): DriftSignal | null {
  const allText = [...ctx.recentQuestions, ...ctx.recentActions];
  if (allText.length < 2) return null;

  const valueTerms = extractValueTerms(ctx.currentValues);
  const doctrineTerms = extractValueTerms(ctx.doctrine);
  const allValueTerms = [...new Set([...valueTerms, ...doctrineTerms, ...VALUES_ALIGNED_SIGNALS])];

  // Count how many recent interactions touch on stated values
  const aligned = countMatches(allText, allValueTerms);
  const avoidanceMatches = countMatches(allText, AVOIDANCE_SIGNALS);
  const externalMatches = countMatches(allText, EXTERNALIZATION_SIGNALS);

  const driftEvidence: string[] = [];

  if (avoidanceMatches.length >= 2) {
    driftEvidence.push(`Avoidance patterns detected: ${avoidanceMatches.slice(0, 3).join(', ')}`);
  }
  if (externalMatches.length >= 2) {
    driftEvidence.push(`Externalization patterns detected: ${externalMatches.slice(0, 3).join(', ')}`);
  }
  if (aligned.length === 0 && allText.length >= 5) {
    driftEvidence.push('Recent interactions show no alignment with stated values');
  }

  if (driftEvidence.length === 0) return null;

  const severity = severityFromCount(
    avoidanceMatches.length + externalMatches.length,
    allText.length,
  );

  return {
    type: 'value-drift',
    description:
      'Recent behavior patterns appear misaligned with stated values and principles.',
    severity,
    evidence: driftEvidence,
    detectedAt: new Date().toISOString(),
  };
}

// ── Goal Drift Analysis ────────────────────────────────────────────────────

function detectGoalDrift(ctx: DriftAnalysisContext): DriftSignal | null {
  if (ctx.currentGoals.length === 0) return null;

  const allText = [...ctx.recentQuestions, ...ctx.recentActions];
  if (allText.length < 3) return null;

  const goalTerms = extractGoalTerms(ctx.currentGoals);
  const goalHits = countMatches(allText, [...goalTerms, ...GOAL_FOCUSED_SIGNALS]);
  const reactiveHits = countMatches(allText, REACTIVE_SIGNALS);
  const shallowHits = countMatches(allText, SHALLOW_SIGNALS);

  const driftEvidence: string[] = [];

  const goalCoverageRatio = goalHits.length / Math.max(allText.length, 1);

  if (goalCoverageRatio < 0.15 && allText.length >= 5) {
    driftEvidence.push(
      `Only ${(goalCoverageRatio * 100).toFixed(0)}% of recent activity aligns with stated goals`,
    );
  }

  if (reactiveHits.length >= 3) {
    driftEvidence.push(
      `Reactive/urgent framing appearing frequently: ${reactiveHits.slice(0, 3).join(', ')}`,
    );
  }

  if (shallowHits.length >= 2) {
    driftEvidence.push(
      `Surface-level engagement patterns detected: ${shallowHits.slice(0, 2).join(', ')}`,
    );
  }

  // Check if goal terms are totally absent from recent questions
  const goalTermsInQuestions = countMatches(ctx.recentQuestions, goalTerms);
  if (goalTermsInQuestions.length === 0 && ctx.recentQuestions.length >= 4) {
    driftEvidence.push('Stated goals absent from recent conversation topics');
  }

  if (driftEvidence.length === 0) return null;

  const severity = severityFromCount(
    driftEvidence.length * 2,
    ctx.recentQuestions.length + 1,
  );

  return {
    type: 'goal-drift',
    description:
      'Attention and effort appear to be diverging from stated goals.',
    severity,
    evidence: driftEvidence,
    detectedAt: new Date().toISOString(),
  };
}

// ── Behavioral Drift Analysis ──────────────────────────────────────────────

function detectBehavioralDrift(ctx: DriftAnalysisContext): DriftSignal | null {
  const questions = ctx.recentQuestions;
  if (questions.length < 4) return null;

  const driftEvidence: string[] = [];

  // Compute average question length as a depth proxy
  const avgLen =
    questions.reduce((s, q) => s + q.length, 0) / questions.length;

  // Detect monotone question depth (all very short = shallow engagement)
  if (avgLen < 40 && questions.length >= 5) {
    driftEvidence.push(
      `Average question depth has dropped (avg ${avgLen.toFixed(0)} chars) — possible disengagement`,
    );
  }

  // Detect topic fragmentation (many unrelated topics = scattered focus)
  const uniqueFirstWords = new Set(
    questions.map((q) => q.trim().toLowerCase().split(/\s+/)[0] ?? ''),
  );
  const fragmentationRatio = uniqueFirstWords.size / questions.length;
  if (fragmentationRatio > 0.9 && questions.length >= 6) {
    driftEvidence.push(
      'High topic fragmentation — attention may be scattered across many unrelated areas',
    );
  }

  // Detect reactive spiral: many urgent questions in a row
  const recentReactive = countMatches(questions.slice(-5), REACTIVE_SIGNALS);
  if (recentReactive.length >= 3) {
    driftEvidence.push(
      `Reactive engagement spike detected (${recentReactive.length} urgency signals in last 5 questions)`,
    );
  }

  // Detect timeframe compression (if many questions about today/now/immediately)
  const shortTermPatterns = ['today', 'tonight', 'right now', 'asap', 'immediately', 'this week'];
  const shortTermHits = countMatches(questions.slice(-6), shortTermPatterns);
  if (shortTermHits.length >= 3 && ctx.timeframeDays > 7) {
    driftEvidence.push(
      'Attention compressing to very short timeframes despite longer-term goals',
    );
  }

  if (driftEvidence.length === 0) return null;

  const severity = severityFromCount(driftEvidence.length, 3);

  return {
    type: 'behavioral-drift',
    description:
      'Shifts in interaction patterns suggest a change in engagement depth or focus quality.',
    severity,
    evidence: driftEvidence,
    detectedAt: new Date().toISOString(),
  };
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Analyze context for drift signals.
 * Returns an array of detected drift signals (empty if no drift found).
 */
export function analyzeDrift(ctx: DriftAnalysisContext): DriftSignal[] {
  const signals: DriftSignal[] = [];

  const valueDrift = detectValueDrift(ctx);
  if (valueDrift) signals.push(valueDrift);

  const goalDrift = detectGoalDrift(ctx);
  if (goalDrift) signals.push(goalDrift);

  const behavioralDrift = detectBehavioralDrift(ctx);
  if (behavioralDrift) signals.push(behavioralDrift);

  return signals;
}
