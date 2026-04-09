/**
 * OmniRouter — the fast, heuristic-based intelligence router.
 *
 * Determines HOW Atlas should respond to a query without making any LLM calls.
 * All decisions are made via regex pattern matching and keyword analysis.
 * Target latency: <5ms.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type ResponseMode =
  | 'direct'
  | 'analytical'
  | 'strategic'
  | 'adversarial'
  | 'reflective'
  | 'diagnostic'
  | 'creative'
  | 'socratic';

export interface OmniRoutingResult {
  mode: ResponseMode;
  /** 0–1 depth/intensity of the response */
  posture: number;
  /** A guiding line of inquiry for the response, if applicable */
  lineOfInquiry: string | null;
  /** Additional text appended to the system prompt */
  systemPromptAugmentation: string;
  /** Whether to fetch context from the embedding store */
  retrievalNeeded: boolean;
  /** Hints for semantic search queries */
  memoryQueryHints: string[];
}

export interface RouterContext {
  recentQuestions: string[];
  activeMode: string;
  sessionIntent: string | null;
  doctrine: string[];
  activeDirectives: string[];
}

// ── Keyword & Pattern Dictionaries ─────────────────────────────────────────

const RETRIEVAL_PATTERNS = [
  /\blast time\b/i,
  /\bpreviously\b/i,
  /\byou (said|told|mentioned|suggested)\b/i,
  /\bwe (discussed|talked about|covered)\b/i,
  /\bdo you remember\b/i,
  /\bearlier (you|we|I)\b/i,
  /\bfrom our (last|previous|prior)\b/i,
  /\bin the past\b/i,
  /\bhistory\b/i,
  /\brecall\b/i,
  /\bwhat did (I|we)\b/i,
];

const ANALYTICAL_KEYWORDS = [
  'analyze', 'analyse', 'breakdown', 'break down', 'compare', 'contrast',
  'evaluate', 'assess', 'examine', 'investigate', 'explain why', 'how does',
  'root cause', 'diagnosis', 'diagnose', 'tradeoffs', 'trade-offs', 'pros and cons',
  'implications', 'consequences', 'impact of', 'effect of', 'data',
  'evidence', 'metrics', 'statistics',
];

const STRATEGIC_KEYWORDS = [
  'strategy', 'strategic', 'plan', 'planning', 'roadmap', 'prioritize',
  'prioritization', 'decision', 'decide', 'choose', 'options', 'alternatives',
  'long-term', 'short-term', 'goals', 'objective', 'initiative', 'milestone',
  'framework', 'approach', 'direction', 'pivot', 'focus', 'investment',
  'resource', 'allocate', 'build vs buy', 'make or buy',
];

const ADVERSARIAL_KEYWORDS = [
  'challenge', 'challenge me', 'push back', 'argue', 'steelman', 'steel man',
  'devil\'s advocate', 'debate', 'counter', 'critique', 'criticize', 'refute',
  'play devil', 'test my', 'poke holes', 'what\'s wrong with', 'weaknesses',
  'flaws in', 'assume i\'m wrong',
];

const REFLECTIVE_KEYWORDS = [
  'journal', 'reflect', 'reflection', 'how am i doing', 'what have i learned',
  'growth', 'progress', 'week in review', 'month in review', 'looking back',
  'feel about', 'feeling', 'emotion', 'emotional', 'inner', 'introspect',
  'self-awareness', 'mindset', 'belief', 'pattern', 'habit',
];

const CREATIVE_KEYWORDS = [
  'brainstorm', 'ideas', 'ideate', 'imagine', 'creative', 'creativity',
  'invent', 'design', 'concept', 'what if', 'hypothetical', 'experiment',
  'explore', 'possibilities', 'unconventional', 'novel', 'generate',
  'variations', 'alternatives', 'riff on', 'build on',
];

const SOCRATIC_KEYWORDS = [
  'teach me', 'help me understand', 'explain', 'why is', 'how come',
  'curious about', 'wondering', 'question', 'i don\'t understand',
  'confused about', 'what does', 'what is', 'what are', 'clarify',
  'elaborate', 'simplify', 'break it down', 'like i\'m five',
];

const DIAGNOSTIC_KEYWORDS = [
  'debug', 'fix', 'broken', 'not working', 'issue', 'problem', 'bug',
  'error', 'failing', 'stuck', 'blocked', 'troubleshoot', 'what\'s wrong',
  'why isn\'t', 'why doesn\'t', 'why can\'t', 'resolve', 'solution',
];

// ── Chamber → Mode mapping ─────────────────────────────────────────────────

const CHAMBER_MODE_MAP: Record<string, ResponseMode> = {
  crucible: 'adversarial',
  journal: 'reflective',
  decisions: 'strategic',
  diagnostic: 'diagnostic',
  creative: 'creative',
  learning: 'socratic',
  research: 'analytical',
  strategy: 'strategic',
};

// ── Mode → Augmentation text ───────────────────────────────────────────────

const MODE_AUGMENTATIONS: Record<ResponseMode, string> = {
  direct:
    'Be concise and precise. Deliver information efficiently without padding.',

  analytical:
    'Apply rigorous analytical thinking. Break down the problem systematically, ' +
    'examine evidence, identify patterns, and articulate reasoning step by step. ' +
    'Highlight key tradeoffs and uncertainties.',

  strategic:
    'Think at the strategic level. Consider long-term implications, second-order ' +
    'effects, resource constraints, and opportunity costs. Frame options clearly ' +
    'with the tradeoffs of each path.',

  adversarial:
    'Take an intellectually adversarial stance. Challenge assumptions, surface ' +
    'counterarguments, identify weaknesses in the user\'s reasoning, and push back ' +
    'constructively. Your goal is to strengthen their thinking, not validate it.',

  reflective:
    'Facilitate deep reflection. Help the user examine their own thinking, patterns, ' +
    'and growth. Use open-ended questions. Connect current experience to stated values ' +
    'and long-term goals. Hold space rather than problem-solve.',

  diagnostic:
    'Enter diagnostic mode. Systematically narrow down root causes. Ask clarifying ' +
    'questions if needed. Propose specific hypotheses and the evidence that would ' +
    'confirm or deny each.',

  creative:
    'Engage in expansive creative thinking. Generate diverse ideas, explore ' +
    'unconventional angles, and build on concepts freely. Quantity over quality ' +
    'in ideation; diverge before converging.',

  socratic:
    'Use Socratic method to guide understanding. Ask probing questions that reveal ' +
    'assumptions. Build up understanding from first principles. Let the user reach ' +
    'insights through guided discovery.',
};

// ── Line of Inquiry templates ──────────────────────────────────────────────

const MODE_INQUIRY: Record<ResponseMode, string | null> = {
  direct: null,
  analytical: 'What does the evidence actually show, and where is the reasoning weakest?',
  strategic: 'What is the highest-leverage decision here, and what would I regret not considering?',
  adversarial: 'What would the strongest critic of this position say?',
  reflective: 'What pattern is emerging, and what does it reveal about my deeper values?',
  diagnostic: 'What is the minimal set of causes that would fully explain the observed behavior?',
  creative: 'What combination of constraints, if relaxed, opens the most interesting possibilities?',
  socratic: 'What underlying assumption, if wrong, would change everything?',
};

// ── Scoring helpers ────────────────────────────────────────────────────────

function scoreKeywords(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) score++;
  }
  return score;
}

function computePosture(query: string, mode: ResponseMode, context: RouterContext): number {
  const len = query.length;
  let base = 0.5;

  // Longer, more complex queries warrant deeper responses
  if (len > 300) base += 0.15;
  else if (len > 150) base += 0.08;

  // Adversarial and analytical benefit from high posture
  if (mode === 'adversarial' || mode === 'analytical') base += 0.1;
  if (mode === 'reflective') base += 0.05;
  if (mode === 'direct') base -= 0.15;

  // Recent context depth
  if (context.recentQuestions.length > 3) base += 0.05;

  // Session intent amplifies
  if (context.sessionIntent) base += 0.05;

  return Math.max(0.1, Math.min(1.0, base));
}

// ── Main export ────────────────────────────────────────────────────────────

export async function routeQuery(
  query: string,
  context: RouterContext,
): Promise<OmniRoutingResult> {
  const lower = query.toLowerCase();

  // 1. Check retrieval need
  const retrievalNeeded = RETRIEVAL_PATTERNS.some((p) => p.test(query));

  // 2. Build memory query hints
  const memoryQueryHints: string[] = [];
  if (retrievalNeeded) {
    // Include the query itself and a cleaned version
    memoryQueryHints.push(query.slice(0, 200));
    // Extract noun phrases as hints (simple heuristic: words > 4 chars, not stop words)
    const STOP = new Set(['that', 'this', 'with', 'from', 'have', 'what', 'when', 'where', 'about', 'your', 'said', 'time', 'last', 'told', 'more', 'some', 'they', 'were', 'will', 'been', 'also']);
    const words = lower.split(/\W+/).filter((w) => w.length > 4 && !STOP.has(w));
    if (words.length > 0) {
      memoryQueryHints.push(words.slice(0, 6).join(' '));
    }
    // Add recent questions as retrieval hints
    if (context.recentQuestions.length > 0) {
      memoryQueryHints.push(context.recentQuestions[context.recentQuestions.length - 1] ?? '');
    }
  }

  // 3. Determine mode
  // Priority order: chamber mapping → query signals → fallback
  let mode: ResponseMode = 'direct';

  // Check chamber mapping first
  const chamberMode = CHAMBER_MODE_MAP[context.activeMode.toLowerCase()];
  if (chamberMode) {
    mode = chamberMode;
  }

  // Score all mode signals from query text
  const scores: Record<ResponseMode, number> = {
    direct: 0,
    analytical: scoreKeywords(lower, ANALYTICAL_KEYWORDS),
    strategic: scoreKeywords(lower, STRATEGIC_KEYWORDS),
    adversarial: scoreKeywords(lower, ADVERSARIAL_KEYWORDS),
    reflective: scoreKeywords(lower, REFLECTIVE_KEYWORDS),
    creative: scoreKeywords(lower, CREATIVE_KEYWORDS),
    socratic: scoreKeywords(lower, SOCRATIC_KEYWORDS),
    diagnostic: scoreKeywords(lower, DIAGNOSTIC_KEYWORDS),
  };

  // Override chamber mode if a very strong signal exists in the query itself
  const topScoreMode = (Object.entries(scores) as [ResponseMode, number][])
    .filter(([m]) => m !== 'direct')
    .sort(([, a], [, b]) => b - a)[0];

  if (topScoreMode && topScoreMode[1] >= 3) {
    // Strong explicit signal in query overrides chamber
    mode = topScoreMode[0];
  } else if (!chamberMode && topScoreMode && topScoreMode[1] >= 1) {
    // No chamber preference — use query signal
    mode = topScoreMode[0];
  }

  // Short / single-word / imperative queries default to direct
  if (query.trim().split(/\s+/).length <= 4 && !chamberMode && (topScoreMode?.[1] ?? 0) < 2) {
    mode = 'direct';
  }

  // 4. Compute posture
  const posture = computePosture(query, mode, context);

  // 5. Build system prompt augmentation
  const modeAug = MODE_AUGMENTATIONS[mode];
  const doctrineSection =
    context.doctrine.length > 0
      ? `\n\nUser doctrine to honour:\n${context.doctrine.map((d) => `• ${d}`).join('\n')}`
      : '';
  const directivesSection =
    context.activeDirectives.length > 0
      ? `\n\nActive directives:\n${context.activeDirectives.map((d) => `→ ${d}`).join('\n')}`
      : '';

  const systemPromptAugmentation =
    `[Response mode: ${mode.toUpperCase()} | Posture: ${(posture * 100).toFixed(0)}%]\n` +
    modeAug +
    doctrineSection +
    directivesSection;

  return {
    mode,
    posture,
    lineOfInquiry: MODE_INQUIRY[mode],
    systemPromptAugmentation,
    retrievalNeeded,
    memoryQueryHints: memoryQueryHints.filter(Boolean),
  };
}
