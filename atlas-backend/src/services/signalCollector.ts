// ============================================================
// Obsidian Atlas — Signal Collector Service
// Passive, silent signal capture from every user interaction.
// Signals are buffered in memory; the EvolutionEngine handles
// persistence and profile mutation downstream.
// ============================================================

import { randomUUID } from 'node:crypto';
import type { CollectedSignalKind, EvolutionSignal } from '../types/evolutionTypes.js';

// ---- Domain term dictionaries -----------------------------------------------

const DOMAIN_TERM_MAP: Record<string, string[]> = {
  philosophy: [
    'epistemology', 'ontology', 'metaphysics', 'phenomenology', 'dialectic',
    'teleology', 'hermeneutics', 'axiology', 'solipsism', 'empiricism',
    'rationalism', 'determinism', 'nihilism', 'existentialism', 'pragmatism',
    'stoicism', 'hegelian', 'kantian', 'cartesian', 'platonic',
  ],
  technology: [
    'algorithm', 'recursion', 'abstraction', 'polymorphism', 'concurrency',
    'latency', 'throughput', 'idempotent', 'heuristic', 'entropy',
    'infrastructure', 'microservice', 'containerisation', 'orchestration',
    'distributed', 'asynchronous', 'serialisation', 'immutable', 'referential',
    'functional', 'declarative', 'imperative',
  ],
  science: [
    'hypothesis', 'empirical', 'falsifiable', 'stochastic', 'deterministic',
    'quantum', 'entropy', 'thermodynamic', 'biochemical', 'neurological',
    'cortical', 'genome', 'phenotype', 'genotype', 'topology', 'manifold',
    'eigenvalue', 'derivative', 'integral', 'gradient',
  ],
  economics: [
    'marginal', 'elasticity', 'equilibrium', 'externality', 'arbitrage',
    'liquidity', 'volatility', 'derivative', 'leverage', 'monetisation',
    'keynesian', 'austrian', 'neoliberal', 'mercantile', 'deficit',
    'inflationary', 'deflationary', 'fiscal', 'monetary',
  ],
  psychology: [
    'cognitive', 'behavioural', 'metacognition', 'schema', 'heuristic',
    'confirmation bias', 'cognitive dissonance', 'intrinsic', 'extrinsic',
    'attachment', 'autonomy', 'dopaminergic', 'amygdala', 'prefrontal',
    'affect', 'resilience', 'neuroplasticity',
  ],
  history: [
    'hegemony', 'imperialism', 'colonialism', 'feudal', 'renaissance',
    'enlightenment', 'reformation', 'industrial', 'revolution', 'empire',
    'sovereignty', 'diplomacy', 'geopolitical', 'historiography',
  ],
  literature: [
    'narrative', 'motif', 'archetype', 'allegory', 'metaphor', 'irony',
    'protagonist', 'antagonist', 'denouement', 'leitmotif', 'intertextuality',
    'postmodern', 'modernist', 'structuralist', 'semiotics',
  ],
  mythology: [
    'mythological', 'archetypal', 'cosmogony', 'pantheon', 'chthonic',
    'eschatology', 'theogony', 'syncretism', 'apotheosis', 'liminal',
  ],
};

const DOMAIN_KEYS = Object.keys(DOMAIN_TERM_MAP);

// ---- Sentiment word lists ----------------------------------------------------

const POSITIVE_WORDS = new Set([
  'great', 'excellent', 'perfect', 'brilliant', 'love', 'amazing', 'fantastic',
  'wonderful', 'outstanding', 'superb', 'impressive', 'insightful', 'helpful',
  'clear', 'exactly', 'yes', 'good', 'nice', 'appreciate', 'thanks', 'thank',
  'precisely', 'nailed', 'correct', 'right', 'genius', 'elegant',
]);

const NEGATIVE_WORDS = new Set([
  'wrong', 'incorrect', 'bad', 'terrible', 'useless', 'awful', 'horrible',
  'confusing', 'unclear', 'missed', 'disappointed', 'frustrating', 'annoying',
  'irrelevant', 'off', 'no', 'not', 'never', 'disagree', 'false', 'broken',
  'poor', 'lacking', 'shallow', 'generic', 'boring',
]);

// ---- Metadata type for capture methods --------------------------------------

export interface MessageMetadata {
  /** Format already detected by the caller (optional) */
  formatHint?: 'prose' | 'bullets' | 'numbered' | 'table' | 'code';
  /** Any topic tags inferred at call-site */
  topicHints?: string[];
}

// ---- Helpers ----------------------------------------------------------------

function newSignalId(): string {
  return randomUUID();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// =============================================================================
// SignalCollector
// =============================================================================

export class SignalCollector {
  /**
   * In-memory buffer: userId → buffered signals.
   * The EvolutionEngine drains and persists this buffer.
   */
  private buffer: Map<string, EvolutionSignal[]> = new Map();

  // --------------------------------------------------------------------------
  // Public API — capture methods
  // --------------------------------------------------------------------------

  /**
   * Capture signals from a message the user just sent.
   * Runs synchronously and silently — never throws to the caller.
   */
  captureUserMessage(
    userId: string,
    sessionId: string,
    content: string,
    metadata: MessageMetadata = {},
  ): void {
    try {
      const topics = this.extractTopics(content, metadata.topicHints);
      const vocabularyLevel = this.extractVocabularySignal(content);
      const sentimentScore = this.extractSentiment(content);
      const formatType = metadata.formatHint ?? this.detectFormatPreference(content);

      // Core message signal
      this.push(userId, {
        signalType: 'message_sent',
        sessionId,
        weight: 0.6,
        payload: {
          content,
          topics,
          vocabularyLevel,
          sentimentScore,
          messageLength: content.length,
          rawText: content,
        },
      });

      // Vocabulary sub-signal
      this.push(userId, {
        signalType: 'vocabulary_sample',
        sessionId,
        weight: 0.5,
        payload: { vocabularyLevel, rawText: content },
      });

      // Domain cluster signals — one per detected domain
      const detectedDomains = this.detectDomains(content);
      for (const domain of detectedDomains) {
        this.push(userId, {
          signalType: 'domain_cluster',
          sessionId,
          weight: 0.7,
          payload: { domain, domainTag: domain, topics, rawText: content },
        });
      }

      // Format preference signal (if detectable)
      if (formatType !== null) {
        this.push(userId, {
          signalType: 'format_preference',
          sessionId,
          weight: 0.4,
          payload: { formatType, rawText: content },
        });
      }

      // Depth signals
      const depthSignal = this.detectDepthSignal(content);
      if (depthSignal === 'depth_request' || depthSignal === 'simplify_request') {
        this.push(userId, {
          signalType: depthSignal,
          sessionId,
          weight: 0.8,
          payload: { rawText: content },
        });
      }

      // Correction pattern
      if (this.detectCorrectionPattern(content)) {
        this.push(userId, {
          signalType: 'correction_issued',
          sessionId,
          weight: 0.9,
          payload: { rawText: content },
        });
      }

      // Praise
      if (this.detectPraise(content)) {
        this.push(userId, {
          signalType: 'praise_issued',
          sessionId,
          weight: 0.85,
          payload: { sentimentScore, rawText: content },
        });
      }

      // Sentiment shift (strong negative or positive)
      if (Math.abs(sentimentScore) > 0.6) {
        this.push(userId, {
          signalType: 'sentiment_shift',
          sessionId,
          weight: clamp(Math.abs(sentimentScore), 0, 1),
          payload: { sentimentScore, rawText: content },
        });
      }
    } catch {
      // Silent — evolution must never break the chat flow
    }
  }

  /**
   * Capture signals from an Atlas response just delivered to the user.
   */
  captureAtlasResponse(
    userId: string,
    sessionId: string,
    content: string,
    metadata: MessageMetadata = {},
  ): void {
    try {
      const topics = this.extractTopics(content, metadata.topicHints);
      const formatType = metadata.formatHint ?? this.detectResponseFormat(content);

      this.push(userId, {
        signalType: 'response_received',
        sessionId,
        weight: 0.3, // Atlas responses are weaker signals than user messages
        payload: {
          topics,
          responseLength: content.length,
          formatType: formatType ?? undefined,
          rawText: content,
        },
      });
    } catch {
      // Silent
    }
  }

  /**
   * Capture a regeneration event — the user asked for a new response.
   * Strong dissatisfaction signal.
   */
  captureRegenerationEvent(userId: string, sessionId: string): void {
    try {
      this.push(userId, {
        signalType: 'response_regenerated',
        sessionId,
        weight: 0.95,
        payload: {},
      });
    } catch {
      // Silent
    }
  }

  /**
   * Capture the end of a session.
   */
  captureSessionEnd(
    userId: string,
    sessionId: string,
    durationMs: number,
    messageCount: number,
  ): void {
    try {
      const isLong = durationMs > 10 * 60 * 1000; // > 10 minutes
      const wasAbandoned = messageCount <= 1;

      this.push(userId, {
        signalType: 'session_length',
        sessionId,
        weight: isLong ? 0.7 : wasAbandoned ? 0.8 : 0.4,
        payload: {
          durationMs,
          // messageLength repurposed here to carry message count
          messageLength: messageCount,
        },
      });
    } catch {
      // Silent
    }
  }

  /**
   * Capture an explicit correction the user issued.
   */
  captureCorrection(
    userId: string,
    sessionId: string,
    original: string,
    correction: string,
  ): void {
    try {
      const domain = this.detectDomains(correction + ' ' + original)[0] ?? 'general';

      this.push(userId, {
        signalType: 'correction_issued',
        sessionId,
        weight: 1.0,
        payload: {
          content: correction,
          domainTag: domain,
          rawText: `[original] ${original} [correction] ${correction}`,
        },
      });
    } catch {
      // Silent
    }
  }

  /**
   * Return all unprocessed signals for a given user.
   * Does NOT mutate the buffer — call markProcessed() afterwards.
   */
  getPendingSignals(userId: string): EvolutionSignal[] {
    const signals = this.buffer.get(userId) ?? [];
    return signals.filter((s) => !s.processed);
  }

  /**
   * Mark a batch of signals as processed so the engine won't re-consume them.
   */
  markProcessed(signalIds: string[]): void {
    const idSet = new Set(signalIds);

    for (const signals of this.buffer.values()) {
      for (const signal of signals) {
        if (idSet.has(signal.id)) {
          signal.processed = true;
        }
      }
    }

    // Prune fully-processed signals older than 24 h to avoid unbounded growth
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [userId, signals] of this.buffer.entries()) {
      const trimmed = signals.filter(
      (s) => !s.processed || s.timestamp.getTime() > cutoff,
    );
      this.buffer.set(userId, trimmed);
    }
  }

  // --------------------------------------------------------------------------
  // Internal analysis methods (accessible for testing / engine extension)
  // --------------------------------------------------------------------------

  /**
   * Estimate vocabulary complexity on a 1–10 scale.
   *
   * Heuristics:
   *  - Average word length (longer → higher)
   *  - Proportion of long words (>= 8 chars)
   *  - Presence of domain-specific terminology
   *  - Clause complexity (subordinating conjunctions, semicolons, em-dashes)
   */
  extractVocabularySignal(text: string): number {
    const words = this.tokenize(text);
    if (words.length === 0) return 1;

    // Average word length → score 0-5
    const avgLen = words.reduce((sum, w) => sum + w.length, 0) / words.length;
    const avgLenScore = clamp((avgLen - 3) / 1.2, 0, 5);

    // Long word ratio → score 0-3
    const longWords = words.filter((w) => w.length >= 8).length;
    const longWordScore = clamp((longWords / words.length) * 10, 0, 3);

    // Domain term bonus → score 0-2
    const lowerText = text.toLowerCase();
    let domainBonus = 0;
    outer: for (const terms of Object.values(DOMAIN_TERM_MAP)) {
      for (const term of terms) {
        if (lowerText.includes(term)) {
          domainBonus += 0.3;
          if (domainBonus >= 2) break outer;
        }
      }
    }
    domainBonus = clamp(domainBonus, 0, 2);

    const raw = avgLenScore + longWordScore + domainBonus;
    return clamp(Math.round(raw), 1, 10);
  }

  /**
   * Simple keyword/domain extraction — returns an array of topic strings.
   */
  extractTopics(text: string, hints: string[] = []): string[] {
    const topics = new Set<string>(hints);
    const lowerText = text.toLowerCase();

    // Domain detection via term matching
    for (const domain of DOMAIN_KEYS) {
      const terms = DOMAIN_TERM_MAP[domain];
      for (const term of terms) {
        if (lowerText.includes(term)) {
          topics.add(domain);
          break;
        }
      }
    }

    // Capitalised proper nouns as lightweight topic hints
    const properNounRe = /\b[A-Z][a-z]{2,}\b/g;
    const properNouns = text.match(properNounRe) ?? [];
    for (const noun of properNouns.slice(0, 5)) {
      topics.add(noun.toLowerCase());
    }

    // Question-word clustering
    if (/\b(why|how|what|when|where|who)\b/i.test(text)) {
      topics.add('inquiry');
    }

    return Array.from(topics);
  }

  /**
   * Simple bag-of-words sentiment scorer.
   * Returns a value in [-1.0, 1.0].
   */
  extractSentiment(text: string): number {
    const words = this.tokenize(text);
    if (words.length === 0) return 0;

    let score = 0;
    let count = 0;

    for (const word of words) {
      if (POSITIVE_WORDS.has(word)) { score += 1; count++; }
      else if (NEGATIVE_WORDS.has(word)) { score -= 1; count++; }
    }

    if (count === 0) return 0;

    // Normalise by total word count then scale
    const raw = score / words.length;
    return clamp(raw * 5, -1.0, 1.0);
  }

  /**
   * Detect whether the user's text suggests a format preference.
   * Returns the inferred format type or null.
   */
  detectFormatPreference(
    text: string,
  ): 'prose' | 'bullets' | 'numbered' | 'table' | 'code' | null {
    const lower = text.toLowerCase();

    if (/\b(bullet|bullets|list it out|bullet points?)\b/.test(lower)) return 'bullets';
    if (/\b(numbered list|step by step|step-by-step|number(ed)? (them|the|each))\b/.test(lower)) return 'numbered';
    if (/\b(table|tabular|columns?|rows?|comparison table)\b/.test(lower)) return 'table';
    if (/\b(code|snippet|show me the code|write (a |the )?function|example in)\b/.test(lower)) return 'code';
    if (/\b(prose|paragraph|explain in (full|detail|words)|narrative)\b/.test(lower)) return 'prose';

    return null;
  }

  /**
   * Detect if the user is requesting more depth or simplification.
   * Returns 'depth_request', 'simplify_request', or null.
   */
  detectDepthSignal(
    text: string,
  ): 'depth_request' | 'simplify_request' | null {
    const lower = text.toLowerCase();

    const depthPatterns: RegExp[] = [
      /\b(tell me more|go deeper|more detail|elaborate|expand on|dig deeper|in depth|exhaustive|thorough|comprehensive|explain further|more nuance|more context)\b/,
      /\b(i want (more|the full|all( of)?|everything))\b/,
      /\bwhy (exactly|specifically|does)\b/,
    ];

    const simplifyPatterns: RegExp[] = [
      /\b(simplify|simpler|dumb (it )?down|eli5|explain (like|as if)|keep it (short|brief|simple|basic)|too (complex|complicated|technical|advanced))\b/,
      /\b(i don'?t (understand|follow|get it)|what does .* mean)\b/,
      /\bshorten\b/,
    ];

    for (const re of depthPatterns) {
      if (re.test(lower)) return 'depth_request';
    }
    for (const re of simplifyPatterns) {
      if (re.test(lower)) return 'simplify_request';
    }

    return null;
  }

  /**
   * Detect if the user is correcting Atlas.
   * Returns true when a correction pattern is found.
   */
  detectCorrectionPattern(text: string): boolean {
    const lower = text.toLowerCase().trim();

    const patterns: RegExp[] = [
      /^(actually|no,|no —|nope|that'?s (wrong|incorrect|not right|not accurate))/,
      /\b(you('re| are) (wrong|incorrect|mistaken|off))\b/,
      /\b(that'?s (not|incorrect|wrong|inaccurate))\b/,
      /\b(i (said|meant|was saying)|what i (meant|said|asked))\b/,
      /\b(you missed|you (got|have|made) (it |a |the )?(wrong|mistake|error))\b/,
      /\bcorrect(ion)? is\b/,
    ];

    return patterns.some((re) => re.test(lower));
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Detect the format of an Atlas response (for response_received signals).
   */
  private detectResponseFormat(
    content: string,
  ): 'prose' | 'bullets' | 'numbered' | 'table' | 'code' | null {
    if (/```/.test(content)) return 'code';
    if (/^\s*[-*•]\s/m.test(content)) return 'bullets';
    if (/^\s*\d+\.\s/m.test(content)) return 'numbered';
    if (/^\|.+\|/m.test(content)) return 'table';
    if (content.length > 200 && !/[-*•]/.test(content)) return 'prose';
    return null;
  }

  /**
   * Detect whether the user is expressing praise / satisfaction.
   */
  private detectPraise(text: string): boolean {
    const lower = text.toLowerCase();
    return /\b(perfect|exactly|that'?s (great|good|what i (needed|wanted))|thank(s| you)|appreciate|brilliant|nailed it|spot on|love (this|that|it)|fantastic|excellent|outstanding|well done|great (work|job|answer|response))\b/.test(lower);
  }

  /**
   * Detect domains present in a text block (returns array of domain keys).
   */
  private detectDomains(text: string): string[] {
    const lowerText = text.toLowerCase();
    const found: string[] = [];

    for (const domain of DOMAIN_KEYS) {
      const terms = DOMAIN_TERM_MAP[domain];
      for (const term of terms) {
        if (lowerText.includes(term)) {
          found.push(domain);
          break;
        }
      }
    }

    return found;
  }

  /**
   * Lowercase-tokenise text into individual words, stripping punctuation.
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z\s'-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1);
  }

  /**
   * Push a new signal into the user's buffer.
   */
  private push(
    userId: string,
    fields: {
      signalType: CollectedSignalKind;
      sessionId: string;
      weight: number;
      payload: Record<string, unknown>;
    },
  ): void {
    if (!this.buffer.has(userId)) {
      this.buffer.set(userId, []);
    }

    const flat = { ...fields.payload };
    const signal: EvolutionSignal = {
      id: newSignalId(),
      userId,
      sessionId: fields.sessionId,
      type: fields.signalType,
      timestamp: new Date(),
      weight: clamp(fields.weight, 0, 1),
      processed: false,
      payload: fields.payload,
      ...(flat as Partial<EvolutionSignal>),
    };

    this.buffer.get(userId)!.push(signal);
  }
}
