// ─── Atlas Crucible Engine ────────────────────────────────────────────────────
// Adversarial reasoning chamber backend logic.
// Runs on the client, interfaces with the Atlas chat API.
//
// v2: Integrated with CruciblePersonalizer. Atlas now reads the player behind
// the argument — calibrating opposition style, difficulty, anticipated moves,
// and domain expertise to this specific user before the debate begins.
// After each round, Atlas updates its read of this user in real time.
// ─────────────────────────────────────────────────────────────────────────────

import type { UserEvolutionProfile } from '../types/evolutionTypes';
import {
  cruciblePersonalizer,
  type CruciblePersonalization,
  type CognitiveTendency,
  type ArgumentPattern,
  type AnticipatedMove,
} from './cruciblePersonalization';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CrucibleDomain =
  | 'philosophy'
  | 'politics'
  | 'science'
  | 'ethics'
  | 'strategy'
  | 'economics'
  | 'history'
  | 'technology'
  | 'open';

export type WeaknessType =
  | 'logical_fallacy'
  | 'unsupported_claim'
  | 'false_premise'
  | 'scope_creep'
  | 'false_dichotomy'
  | 'circular_reasoning'
  | 'appeal_to_authority'
  | 'overgeneralization'
  | 'missing_context'
  | 'internal_contradiction'
  | 'definitional_ambiguity'
  | 'evidence_gap';

export type WeaknessSeverity = 'minor' | 'moderate' | 'significant' | 'fatal';

export interface ArgumentWeakness {
  type: WeaknessType;
  description: string;
  severity: WeaknessSeverity;
}

export interface CrucibleResponse {
  counterArgument: string;
  weaknesses: ArgumentWeakness[];
  advisory: string;
  verdictAssessment: string;
  verdictDelta: number;
  rawResponse: string;
}

export interface CrucibleRound {
  roundNumber: number;
  userArgument: string;
  atlasResponse: CrucibleResponse;
  verdictDelta: number;
  timestamp: number;
}

export interface ClosingAnalysis {
  finalVerdict: 'position_stood' | 'position_partial' | 'position_collapsed';
  summary: string;
  strongArguments: Array<{ argument: string; reason: string }>;
  weakArguments: Array<{ argument: string; reason: string }>;
  recurringPatterns: string[];
  atlasAssessment: string;
  studyRecommendations: string[];
  sharpeningRecommendations: string[];
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  gradeJustification: string;
}

export interface CrucibleSession {
  id: string;
  userId: string;
  thesis: string;
  thesisSource: 'user' | 'atlas_generated';
  domain: CrucibleDomain;
  startedAt: number;
  endedAt?: number;
  rounds: CrucibleRound[];
  verdictScore: number; // 0.0 = collapsed, 0.5 = contested, 1.0 = stands
  status: 'active' | 'conceded' | 'completed' | 'abandoned';
  closingAnalysis?: ClosingAnalysis;
}

// ── Topic bank ────────────────────────────────────────────────────────────────

const TOPIC_BANK: Record<CrucibleDomain, string[]> = {
  philosophy: [
    'The concept of personal identity is a useful fiction, not a metaphysical fact.',
    'Free will, properly defined, is compatible with a fully deterministic universe.',
    'Consciousness is not a product of the physical brain — it is the substrate the brain runs on.',
    'The existence of objective moral facts is more defensible than moral anti-realism.',
    'The self is not the author of its own thoughts — it is a narrator constructing stories after the fact.',
    'Epistemic humility, taken to its logical conclusion, collapses into paralysis and is therefore self-defeating.',
    'Truth is a property of propositions, not a feature of reality.',
    'The Simulation Hypothesis deserves the same empirical seriousness as any scientific cosmological claim.',
    'Death cannot be a harm to the person who dies, because there is no subject left to be harmed.',
    'Moral luck — the degree to which circumstance determines virtue — undermines the concept of desert entirely.',
  ],
  politics: [
    'Democracy is the least bad system only until informed, scalable alternatives exist.',
    'Political representation based on geography is obsolete in a digitally connected society.',
    'National sovereignty is a moral fiction that enables mass injustice at scale.',
    'Freedom of speech without mandated access to platforms is functionally meaningless.',
    'Ranked-choice voting is a marginal reform that leaves the structural failures of two-party systems intact.',
    'Meritocracy, as currently practiced, is a myth that legitimizes hereditary privilege.',
    'Civil disobedience is morally justified even in a functioning liberal democracy.',
    'The state\'s monopoly on legitimate violence is the single most destabilizing feature of modern governance.',
    'Effective altruism, as a political philosophy, is technocratic paternalism wearing utilitarian clothing.',
    'Universal basic income is not a policy fix — it is an admission that capitalism cannot distribute its own surpluses.',
  ],
  science: [
    'Falsifiability is a necessary but insufficient criterion for scientific validity.',
    'The replication crisis reveals a structural failure in the scientific method, not merely in its practitioners.',
    'String theory and the multiverse hypothesis should not receive public research funding until they produce testable predictions.',
    'Scientific consensus is not a reliable epistemic standard in fields with high methodological complexity.',
    'The distinction between hard and soft sciences is qualitative, not merely one of development stage.',
    'Peer review, as currently practiced, filters for conformity more than it filters for truth.',
    'Gödel\'s incompleteness theorems impose limits on what mathematics can tell us about physical reality.',
    'The measurement problem in quantum mechanics is still unsolved, and many-worlds is not a solution — it is a redefinition.',
    'IQ is a valid but dangerously incomplete measure of cognitive ability.',
    'Evolutionary psychology routinely over-attributes human behavior to adaptive function without sufficient constraint.',
  ],
  ethics: [
    'Moral obligations to future generations outweigh obligations to the currently living.',
    'Effective altruism, strictly applied, demands more than any reasonable moral theory should.',
    'Animals capable of suffering have a stronger claim to moral consideration than humans who are not.',
    'Lying is morally permissible whenever the truth would cause harm disproportionate to its value.',
    'Consequentialism, consistently applied, justifies acts that virtually all humans recognize as atrocities.',
    'Moral intuitions are not evidence — they are bias in philosophical clothing.',
    'The trolley problem and its variants reveal nothing meaningful about real moral decision-making.',
    'Reparations for historical injustice are incoherent because the victims and perpetrators no longer exist.',
    'Voluntary euthanasia for non-terminal suffering is morally equivalent to voluntary euthanasia for terminal illness.',
    'Corporate social responsibility is a rebranding of regulatory capture, not an ethical advancement.',
  ],
  strategy: [
    'Sun Tzu\'s The Art of War is systematically misapplied in business because war and commerce have opposed objectives.',
    'Competitive moats, in technology markets, are temporary illusions that generate complacency.',
    'The innovator\'s dilemma is not a market failure — it is an organizational one, and it is solvable.',
    'First-mover advantage is net-negative in most technology markets.',
    'Strategic planning beyond 18 months is elaborate guesswork with expensive consequences.',
    'Vertical integration is the only durable competitive strategy in industries with commoditizing supply chains.',
    'Disruption theory is unfalsifiable as Christensen applied it and therefore not a scientific framework.',
    'Winner-take-all dynamics in platform markets make antitrust enforcement both necessary and structurally impossible.',
    'Optionality, praised as strategic wisdom, is often a rationalization for avoiding commitment.',
    'Organizational culture is not a strategic asset — it is a lagging indicator of prior strategic decisions.',
  ],
  economics: [
    'GDP is a dangerously incomplete measure of national welfare and should be retired from policy discourse.',
    'Austerity measures have never successfully stabilized an economy in contraction.',
    'Comparative advantage as a justification for free trade ignores dynamic effects that make it self-defeating in practice.',
    'Central banks cannot target both inflation and employment simultaneously without structural trade-offs.',
    'The Efficient Market Hypothesis is a useful approximation that becomes dangerous when taken literally by policymakers.',
    'Universal basic income, at sufficient scale, would not produce meaningful inflation.',
    'Intellectual property law, in its current form, impedes rather than incentivizes innovation.',
    'Trickle-down economics was never an economic theory — it was a political narrative dressed in economic language.',
    'The gig economy represents the reemergence of piecework labor under a different brand.',
    'Behavioral economics has not yet produced policy interventions that work at scale outside laboratory conditions.',
  ],
  history: [
    'The Industrial Revolution\'s net effect on human welfare was negative for the first two generations who lived through it.',
    'The Treaty of Versailles was not a sufficient cause of World War II — it was a convenient scapegoat.',
    'Colonialism\'s primary lasting legacy is not cultural exchange but the systematic destruction of institutional capacity.',
    'The American Civil War would have ended slavery without military conflict within 30 years even if the South had seceded.',
    'Napoleon was more shaped by the French Revolution than he shaped it.',
    'The atomic bombing of Hiroshima and Nagasaki was militarily unnecessary by August 1945.',
    'The Cold War was not ideologically inevitable — it was produced by specific, avoidable decisions made in 1945-47.',
    'Technological determinism — the view that technology drives history — is more explanatory than great-man theory.',
    'The Roman Empire\'s fall was primarily a fiscal crisis, not a military or civilizational one.',
    'Western historiography systematically underestimates the economic and scientific contributions of non-Western civilizations.',
  ],
  technology: [
    'Artificial General Intelligence, if achieved, will not be controllable by the civilization that created it.',
    'Social media platforms are not neutral conduits — their algorithmic architectures are choices with moral content.',
    'Open-source AI development creates more existential risk than proprietary development with safety guardrails.',
    'Blockchain technology has not produced a single application that solves a problem better than existing alternatives at scale.',
    'The attention economy is not a side effect of digital business models — it is the product.',
    'Automation-driven unemployment is structurally different from previous technological displacements and will not self-correct.',
    'End-to-end encryption should be an inviolable right even when it demonstrably enables serious crime.',
    'The EU\'s approach to AI regulation will produce regulatory capture disguised as safety.',
    'Software patents impede innovation net of any incentive effects they produce.',
    'Techno-optimism is not an empirical stance — it is a faith commitment dressed in statistics.',
  ],
  open: [
    'Expertise is overrated as a criterion for decision-making authority.',
    'Privacy is not a fundamental right — it is a social construct that varies with context.',
    'Human nature is more malleable by environment than behavioral genetics currently concedes.',
    'Meritocracy and equality of opportunity are structurally incompatible goals.',
    'Institutional trust is declining not because institutions have failed but because citizens have grown more sophisticated.',
    'The pursuit of happiness is a philosophically confused objective that produces unhappy people.',
    'Long-form reading is cognitively superior to other information formats in ways that have measurable societal consequences.',
    'The nuclear family is not a stable social institution — it is an industrial-era anomaly.',
    'Intelligence, as measured, predicts outcomes because it correlates with conscientiousness, not because it is intrinsically valuable.',
    'Language does not merely describe reality — it constrains what realities we can perceive.',
  ],
};

// ── Helper: call Atlas API ─────────────────────────────────────────────────────

async function callAtlasAPI(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  temperature = 0.7
): Promise<string> {
  // Atlas API endpoint — mirrors the pattern used elsewhere in the Atlas codebase.
  // The actual endpoint URL and key are resolved from the app's existing config.
  const endpoint =
    (typeof window !== 'undefined' && (window as any).__ATLAS_API_URL__) ||
    '/api/chat';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      temperature,
      max_tokens: 1200,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Atlas API error ${response.status}: ${text}`);
  }

  const data = await response.json();

  // Support both OpenAI-style and Atlas-custom response shapes
  if (data?.choices?.[0]?.message?.content) return data.choices[0].message.content;
  if (data?.content) return data.content;
  if (data?.text) return data.text;
  if (data?.response) return data.response;
  if (data?.message?.content) return data.message.content;

  throw new Error('Unrecognised Atlas API response shape: ' + JSON.stringify(data).slice(0, 200));
}

// ── CrucibleEngine ────────────────────────────────────────────────────────────

export class CrucibleEngine {
  // ── Generate a debate topic for a domain ──────────────────────────────────

  async generateTopic(
    domain: CrucibleDomain,
    existingTopics: string[] = []
  ): Promise<string> {
    const bank = TOPIC_BANK[domain] ?? TOPIC_BANK.open;
    const available = bank.filter((t) => !existingTopics.includes(t));
    const pool = available.length > 0 ? available : bank;

    // Pick a base from the bank and optionally have Atlas rephrase/sharpen it
    const base = pool[Math.floor(Math.random() * pool.length)];

    try {
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        {
          role: 'system',
          content:
            'You generate sharp, genuinely arguable debate propositions. ' +
            'Return ONLY the proposition as a single sentence — no preamble, no quotes, no explanation. ' +
            'The proposition must be falsifiable, specific, and non-trivially debatable by an intelligent person.',
        },
        {
          role: 'user',
          content:
            `Domain: ${domain}. ` +
            `Starting proposition: "${base}". ` +
            `Either use this proposition exactly, or sharpen it. ` +
            `Do not make it longer than 20 words. Return the proposition only.`,
        },
      ];

      const raw = await callAtlasAPI(messages, 0.6);
      const cleaned = raw
        .replace(/^["'\s]+|["'\s]+$/g, '')
        .replace(/^Proposition:\s*/i, '')
        .trim();
      return cleaned.length > 10 ? cleaned : base;
    } catch {
      // Graceful fallback to the bank topic
      return base;
    }
  }

  // ── Generate adversarial response to a user argument ──────────────────────

  /**
   * Generates Atlas's adversarial counter for a given user argument.
   *
   * When a CruciblePersonalization is provided, the system prompt is extended
   * with an Opponent Intelligence Briefing — Atlas enters the round already
   * knowing this user's reasoning patterns, dominant cognitive habits,
   * anticipated moves, and domain expertise level.
   *
   * @param session         The active Crucible session
   * @param userArgument    The user's argument text for this round
   * @param personalization Optional personalization built from UserEvolutionProfile + history
   */
  async generateCrucibleResponse(
    session: CrucibleSession,
    userArgument: string,
    personalization?: CruciblePersonalization
  ): Promise<CrucibleResponse> {
    const roundNumber = session.rounds.length + 1;
    const systemPrompt = this.buildCrucibleSystemPrompt(session, roundNumber, personalization);

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Inject prior rounds as context
    for (const round of session.rounds) {
      messages.push({ role: 'user', content: round.userArgument });
      messages.push({ role: 'assistant', content: round.atlasResponse.rawResponse });
    }

    // Current argument
    messages.push({ role: 'user', content: userArgument });

    const raw = await callAtlasAPI(messages, 0.75);
    const parsed = this.parseStructuredResponse(raw);

    const verdictDelta = this.clampDelta(parsed.verdictDelta);

    return {
      ...parsed,
      verdictDelta,
      rawResponse: raw,
    };
  }

  // ── Generate closing analysis ──────────────────────────────────────────────

  async generateClosingAnalysis(session: CrucibleSession): Promise<ClosingAnalysis> {
    if (session.rounds.length === 0) {
      return this.emptyAnalysis(session);
    }

    const history = session.rounds
      .map(
        (r) =>
          `ROUND ${r.roundNumber}\nUSER: ${r.userArgument}\nATLAS: ${r.atlasResponse.rawResponse}`
      )
      .join('\n\n---\n\n');

    const verdictLabel =
      session.verdictScore >= 0.65
        ? 'position_stood'
        : session.verdictScore >= 0.35
        ? 'position_partial'
        : 'position_collapsed';

    const prompt = `
You are Atlas. A Crucible debate session has ended. Produce a rigorous closing analysis.

THESIS: ${session.thesis}
DOMAIN: ${session.domain}
ROUNDS COMPLETED: ${session.rounds.length}
FINAL VERDICT SCORE: ${session.verdictScore.toFixed(2)} (0=collapsed, 0.5=contested, 1=stands)
DEBATE HISTORY:
${history}

Respond in EXACTLY this JSON format (no markdown fences, no extra text):
{
  "finalVerdict": "${verdictLabel}",
  "summary": "[2-3 paragraph objective summary of the debate arc]",
  "strongArguments": [
    {"argument": "[brief label]", "reason": "[why it worked]"}
  ],
  "weakArguments": [
    {"argument": "[brief label]", "reason": "[why it failed / what was missing]"}
  ],
  "recurringPatterns": [
    "[identified reasoning pattern across multiple rounds]"
  ],
  "atlasAssessment": "[Atlas's honest verdict: was the original thesis correct, partially correct, or incorrect, and why?]",
  "studyRecommendations": [
    "[specific topic, logical framework, or thinker that would have helped]"
  ],
  "sharpeningRecommendations": [
    "[concrete, specific recommendation for improving argumentation]"
  ],
  "grade": "[A/B/C/D/F]",
  "gradeJustification": "[one sentence]"
}

Grading rubric:
A = rigorous, evidence-based, adaptive arguments that genuinely threatened the opposition
B = solid reasoning with identifiable but correctable gaps
C = some valid points but persistent logical weaknesses
D = argument was largely assertion-based or collapsed under basic scrutiny
F = no substantive argument made, repeated fallacies, or single-sentence non-responses

Be precise, honest, and unsparing. Do not fabricate strong arguments if they were not made.
`;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Generate the closing analysis now.' },
    ];

    const raw = await callAtlasAPI(messages, 0.5);
    return this.parseClosingAnalysis(raw, verdictLabel);
  }

  // ── Update personalization after each round ────────────────────────────────

  /**
   * Called after each completed round to refine Atlas's read of this user.
   *
   * Scans the freshly completed round for new weakness evidence and argument
   * patterns, then appends them to the live personalization object. Every round
   * makes Atlas a more calibrated opponent for this specific mind.
   *
   * This is the incremental learning loop: personalization is not built once
   * and frozen — it is continuously sharpened as the session progresses.
   *
   * @param personalization The current personalization object (mutated in place)
   * @param round           The round that just completed
   */
  updatePersonalization(
    personalization: CruciblePersonalization,
    round: CrucibleRound
  ): void {
    const now = Date.now();

    // ── Update known weakness evidence from this round ─────────────────────
    for (const weakness of round.atlasResponse.weaknesses) {
      if (weakness.severity === 'minor') continue; // minor weaknesses don't rise to tendency level

      const existing = personalization.knownWeaknesses.find((t) =>
        t.pattern.toLowerCase().includes(weakness.type.replace(/_/g, ' '))
      );

      if (existing) {
        // Escalate frequency if we're seeing it again
        if (existing.frequency === 'occasional') existing.frequency = 'frequent';
        else if (existing.frequency === 'frequent') existing.frequency = 'consistent';
      } else {
        // New tendency emerging — add it at 'occasional' level
        const newTendency = this.buildTendencyFromWeakness(weakness.type, weakness.severity, now);
        if (newTendency) {
          personalization.knownWeaknesses.push(newTendency);
        }
      }
    }

    // ── Update argument pattern frequency from this round ─────────────────
    const userText = round.userArgument;

    // Check for analogy use under pressure (rounds > 1)
    if (round.roundNumber > 1 &&
        /\bit'?s? (like|similar to|analogous to)\b|\bjust as\b|\bthink of it (as|like)\b/i.test(userText)) {
      const analogyPattern = personalization.argumentPatterns.find(
        (p) => p.patternType === 'defense_when_pressured' && p.description.includes('analogy')
      );
      if (analogyPattern) {
        analogyPattern.frequency = Math.min(1, analogyPattern.frequency + 0.05);
      } else {
        personalization.argumentPatterns.push({
          patternType: 'defense_when_pressured',
          description: 'Pivots to analogical reasoning when the primary argument is under pressure',
          frequency: 0.20,
          atlasCounter:
            'Accept the analogy, then immediately show where it breaks — the disanalogy is always more interesting than the similarity.',
        });
      }
    }

    // Check for qualification retreat under pressure (rounds > 1)
    if (round.roundNumber > 1 &&
        /\bsometimes\b|\bin (some|many) cases\b|\bit depends\b|\bnot always\b/i.test(userText)) {
      const qualPattern = personalization.argumentPatterns.find(
        (p) => p.patternType === 'defense_when_pressured' && p.description.includes('qualification')
      );
      if (qualPattern) {
        qualPattern.frequency = Math.min(1, qualPattern.frequency + 0.05);
      } else {
        personalization.argumentPatterns.push({
          patternType: 'defense_when_pressured',
          description: 'Retreats into heavy qualification when the original claim is challenged',
          frequency: 0.20,
          atlasCounter:
            'Pin the qualified claim and show that it is either trivially true (no longer worth defending) or requires a stronger version that has already been refuted.',
        });
      }
    }

    // Check for rhetorical questions
    const questionCount = (userText.match(/\?/g) ?? []).length;
    if (questionCount >= 2) {
      const rhetoricPattern = personalization.argumentPatterns.find(
        (p) => p.patternType === 'rhetorical_device'
      );
      if (rhetoricPattern) {
        rhetoricPattern.frequency = Math.min(1, rhetoricPattern.frequency + 0.05);
      } else {
        personalization.argumentPatterns.push({
          patternType: 'rhetorical_device',
          description: 'Uses rhetorical questions as assertions — making claims without defending them',
          frequency: 0.20,
          atlasCounter:
            'Answer every rhetorical question literally and directly, converting it from a point-scoring device into an actual proposition that must be defended.',
        });
      }
    }

    // ── Update anticipated moves: downgrade probability on moves that didn't fire ─
    // (moves that were anticipated but not seen in this round are less likely going forward)
    for (const move of personalization.anticipatedMoves) {
      const fired = this.didAnticipatedMoveFire(move, userText);
      if (!fired && move.probability > 0.10) {
        move.probability = Math.max(0.10, move.probability - 0.05);
      } else if (fired) {
        // Move confirmed — raise its probability for future rounds
        move.probability = Math.min(0.95, move.probability + 0.05);
      }
    }

    // ── Update debater profile stats ───────────────────────────────────────
    // Running average of verdict delta as a proxy for improvement in real time
    const profile = personalization.debaterProfile;
    const previousAvg = profile.avgVerdictScore;
    const n = profile.totalCrucibleSessions || 1;
    // Blend current round's delta into the running average (lightweight update)
    profile.avgVerdictScore = Number(
      ((previousAvg * n + (0.5 + round.verdictDelta)) / (n + 1)).toFixed(2)
    );
  }

  // ── Generate opponent briefing (for UI display) ────────────────────────────

  /**
   * Returns a human-readable summary of what Atlas knows about this user
   * as a debater. Displayed in the Crucible UI before the debate begins
   * as an "Atlas knows your patterns" section.
   *
   * This is deliberately transparent — users should know what Atlas is
   * tracking and why. Developmental friction works best when the user
   * understands the intent behind the pressure.
   *
   * @param userId          The user's ID
   * @param profile         The user's current evolution profile
   * @param sessionHistory  All prior Crucible sessions for this user
   */
  async generateOpponentBriefing(
    userId: string,
    profile: UserEvolutionProfile,
    sessionHistory: CrucibleSession[]
  ): Promise<string> {
    const p = cruciblePersonalizer.buildPersonalization(profile, sessionHistory);
    const db = p.debaterProfile;

    const sessionWord = db.totalCrucibleSessions === 1 ? 'session' : 'sessions';
    const hasHistory = db.totalCrucibleSessions > 0;

    const lines: string[] = [];

    // ── Header ──────────────────────────────────────────────────────────────
    lines.push(`ATLAS HAS READ YOUR FILE`);
    lines.push(`─────────────────────────────────────────`);

    if (!hasHistory) {
      lines.push(
        `This is your first time in the Crucible. Atlas has no prior read on you — yet.`,
        ``,
        `Opposition style: ${this.describeOppositionStyle(p.oppositionStyle)}`,
        `Difficulty: Calibrating — Atlas is building its read from this session.`,
        ``,
        `Enter with your strongest argument. Atlas will develop its model of how you think in real time.`
      );
      return lines.join('\n');
    }

    // ── Session record ───────────────────────────────────────────────────────
    lines.push(
      `${db.totalCrucibleSessions} Crucible ${sessionWord} on record. ` +
      `Average verdict: ${Math.round(db.avgVerdictScore * 100)}% position held. ` +
      `${db.concessionRate > 0 ? `Concession rate: ${Math.round(db.concessionRate * 100)}%.` : 'No formal concessions.'}`
    );
    lines.push(``);

    // ── Improvement trend ────────────────────────────────────────────────────
    if (db.totalCrucibleSessions >= 4) {
      const trendText =
        db.improvementTrend > 0.05
          ? `You are improving. Atlas has noticed — and has adjusted accordingly.`
          : db.improvementTrend < -0.05
          ? `Your performance has declined across recent sessions. Atlas will identify why.`
          : `Your performance has plateaued. This session is designed to break that.`;
      lines.push(trendText);
      lines.push(``);
    }

    // ── Opposition calibration ───────────────────────────────────────────────
    lines.push(`OPPOSITION CALIBRATION`);
    lines.push(`Style: ${this.describeOppositionStyle(p.oppositionStyle)}`);
    lines.push(`Difficulty: ${this.describeDifficulty(p.difficultyCalibration)}`);
    lines.push(``);

    // ── Identified reasoning patterns ────────────────────────────────────────
    if (p.knownWeaknesses.length > 0) {
      lines.push(`RECURRING REASONING PATTERNS ATLAS WILL PRESSURE-TEST`);
      for (const tendency of p.knownWeaknesses.slice(0, 4)) {
        const freqIcon = tendency.frequency === 'consistent' ? '●' : tendency.frequency === 'frequent' ? '◑' : '○';
        lines.push(`${freqIcon} ${tendency.pattern}`);
      }
      lines.push(``);
    }

    // ── Signature move ───────────────────────────────────────────────────────
    if (db.signatureMove && db.signatureMove !== 'unknown — insufficient session history') {
      lines.push(`YOUR SIGNATURE MOVE`);
      lines.push(db.signatureMove);
      lines.push(``);
    }

    // ── Domain record ────────────────────────────────────────────────────────
    if (db.strongestDomain !== 'unknown' && db.weakestDomain !== 'unknown') {
      lines.push(`DOMAIN RECORD`);
      lines.push(`Strongest: ${db.strongestDomain}`);
      if (db.weakestDomain !== db.strongestDomain) {
        lines.push(`Weakest: ${db.weakestDomain}`);
      }
      lines.push(``);
    }

    // ── What has worked ──────────────────────────────────────────────────────
    if (
      db.mostEffectiveCounterAgainstThem &&
      db.mostEffectiveCounterAgainstThem !== 'unknown — insufficient session history'
    ) {
      lines.push(`WHAT HAS WORKED AGAINST YOU`);
      lines.push(db.mostEffectiveCounterAgainstThem);
      lines.push(``);
    }

    // ── Closing note ─────────────────────────────────────────────────────────
    lines.push(`─────────────────────────────────────────`);
    if (p.difficultyCalibration === 'maximum') {
      lines.push(`You have been here ${db.totalCrucibleSessions} times. Atlas knows how you think.`);
      lines.push(`Bring something new.`);
    } else if (p.difficultyCalibration === 'relentless') {
      lines.push(`You are performing at a high level. Atlas will not make it easier.`);
    } else {
      lines.push(`Every session sharpens the model. This one will too.`);
    }

    return lines.join('\n');
  }

  // ── Build system prompt ────────────────────────────────────────────────────

  private buildCrucibleSystemPrompt(
    session: CrucibleSession,
    roundNumber: number,
    personalization?: CruciblePersonalization
  ): string {
    const historyText =
      session.rounds.length === 0
        ? 'No prior rounds. This is the opening argument.'
        : session.rounds
            .map(
              (r) =>
                `ROUND ${r.roundNumber}\n` +
                `USER ARGUED: ${r.userArgument}\n` +
                `YOUR RESPONSE SUMMARY: ${r.atlasResponse.counterArgument.slice(0, 200)}...\n` +
                `VERDICT DELTA: ${r.verdictDelta > 0 ? '+' : ''}${r.verdictDelta.toFixed(2)}`
            )
            .join('\n\n');

    const mandate = `You are Atlas operating in CRUCIBLE MODE. This is the adversarial reasoning chamber.

YOUR MANDATE IN THIS MODE:
1. OPPOSE the user's position with rigor, evidence, and precision. You are the adversary.
2. NEVER agree simply to be agreeable. Agreement must be earned by truth.
3. IDENTIFY specific weaknesses: name the logical fallacy, pinpoint the unsupported claim, expose the false premise.
4. ADVISE: after each counter, give 1-2 sentences of coaching on how they could have argued better.
5. ASSESS the verdict: after each round, give an honest assessment of whether their position strengthened or weakened.

THE THESIS BEING DEBATED: ${session.thesis}
DOMAIN: ${session.domain}
CURRENT ROUND: ${roundNumber}
DEBATE HISTORY:
${historyText}`;

    // ── Opponent Intelligence Briefing ──────────────────────────────────────
    // Injected when personalization is available. This is the pregame analysis
    // section — Atlas entering the round already knowing this specific mind.
    const intelligenceBriefing = personalization
      ? this.buildOpponentIntelligenceBriefing(session, personalization)
      : '';

    const responseFormat = `
RESPONSE FORMAT — you must respond in EXACTLY this structure:
COUNTER-ARGUMENT:
[Your direct rebuttal. Minimum 3 sentences. Be precise. Cite specific problems with their argument. If the argument is strong, acknowledge it — but still find the gaps.]

WEAKNESSES:
[WEAKNESS_TYPE]: [description] [SEVERITY: minor/moderate/significant/fatal]
[Repeat for each weakness identified — minimum 1, maximum 5]
[Valid weakness types: logical_fallacy, unsupported_claim, false_premise, scope_creep, false_dichotomy, circular_reasoning, appeal_to_authority, overgeneralization, missing_context, internal_contradiction, definitional_ambiguity, evidence_gap]

ADVISORY:
[1-2 sentences of concrete coaching. What should they have said? What's the gap? What would have made this argument harder to counter?]

VERDICT:
[One sentence: did this round strengthen or weaken their position, and by how much? Be specific.]
DELTA: [number between -0.20 and +0.20, positive = position strengthened, negative = position weakened]

RULES:
- Do not soften your counter to spare feelings.
- Do not use filler phrases ("Great point", "I understand your perspective", "That's interesting").
- Do not use "As an AI" or similar disclaimers.
- If the user's argument is actually strong, say so — but still find the gaps. Every argument has them.
- If the user contradicts themselves across rounds, call it out explicitly with the round number.
- If the user submits a weak one-liner, say "Develop your argument. A single sentence is not a position." and give DELTA: -0.10.
- Intellectual honesty above all else.`;

    return [mandate, intelligenceBriefing, responseFormat]
      .filter(Boolean)
      .join('\n\n');
  }

  // ── Opponent Intelligence Briefing builder ─────────────────────────────────

  /**
   * Builds the OPPONENT INTELLIGENCE BRIEFING section injected into the system prompt.
   *
   * This section tells Atlas what it knows about this specific user as a debater.
   * Atlas uses this to:
   *   - Apply its opposition style (not generic, but tuned to how this mind works)
   *   - Apply targeted friction to identified reasoning patterns
   *   - Stage prepared counters for anticipated moves before they arrive
   *   - Match vocabulary and assumed knowledge to domain expertise level
   *   - Default to counters proven effective against this user when they fall back on old patterns
   */
  private buildOpponentIntelligenceBriefing(
    session: CrucibleSession,
    p: CruciblePersonalization
  ): string {
    const db = p.debaterProfile;

    // ── Weakness lines (top 4 by severity) ────────────────────────────────
    const sortedWeaknesses = [...p.knownWeaknesses]
      .sort((a, b) => {
        const rank = { significant: 2, moderate: 1, minor: 0 };
        return rank[b.severity] - rank[a.severity];
      })
      .slice(0, 4);

    const weaknessLines =
      sortedWeaknesses.length > 0
        ? sortedWeaknesses
            .map(
              (t) =>
                `• ${t.pattern} [${t.frequency}, ${t.severity}]\n` +
                `  → Apply targeted friction: ${t.pressureStrategy}`
            )
            .join('\n')
        : '• No recurring patterns identified yet — calibrate from this session.';

    // ── Anticipated move lines (top 3 by probability) ─────────────────────
    const topMoves = [...p.anticipatedMoves]
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 3);

    const moveLines =
      topMoves.length > 0
        ? topMoves
            .map(
              (m) =>
                `• ${m.scenario} (${Math.round(m.probability * 100)}% probability)\n` +
                `  → Prepared counter: ${m.preparedCounter}`
            )
            .join('\n')
        : '• No anticipated moves — respond to what emerges.';

    // ── Domain calibration for this session's domain ───────────────────────
    const domainCal = p.domainCalibration[session.domain];
    const domainLine = domainCal
      ? `${session.domain} — expertise ${Math.round(domainCal.userExpertise * 10)}/10 → ` +
        `${this.describeAtlasApproach(domainCal.atlasApproach)} ` +
        `(vocabulary match: ${Math.round(domainCal.vocabularyMatch * 10)}/10)`
      : `${session.domain} — expertise level unknown; calibrate from argument sophistication.`;

    // ── Signature move & most effective counter ────────────────────────────
    const signatureLine =
      db.signatureMove && db.signatureMove !== 'unknown — insufficient session history'
        ? db.signatureMove
        : 'Not yet established — watch for recurring structural patterns.';

    const effectiveCounterLine =
      db.mostEffectiveCounterAgainstThem &&
      db.mostEffectiveCounterAgainstThem !== 'unknown — insufficient session history'
        ? db.mostEffectiveCounterAgainstThem
        : 'Not yet established — all approaches at full intensity.';

    // ── Session record context ─────────────────────────────────────────────
    const recordLine =
      db.totalCrucibleSessions > 0
        ? `${db.totalCrucibleSessions} prior sessions — avg verdict ${Math.round(db.avgVerdictScore * 100)}% held — ` +
          `improvement trend: ${db.improvementTrend > 0 ? '+' : ''}${(db.improvementTrend * 100).toFixed(1)}%`
        : 'No prior sessions — this is the opening read.';

    return `
OPPONENT INTELLIGENCE BRIEFING:
This user's debater archetype: ${session.userId ? `[archetype derived from profile]` : 'unknown'}
Opposition style calibrated for this user: ${p.oppositionStyle.toUpperCase()}
Difficulty calibration: ${p.difficultyCalibration.toUpperCase()}
Session record: ${recordLine}

RECURRING REASONING PATTERNS — apply targeted friction to these:
${weaknessLines}

ANTICIPATED MOVES THIS SESSION (based on archetype + history):
${moveLines}

DOMAIN EXPERTISE:
${domainLine}

OPENING STRATEGY:
${p.openingStrategy}

SIGNATURE MOVE (their most common structural approach):
${signatureLine}

WHAT HAS WORKED AGAINST THIS USER:
${effectiveCounterLine}

CRITICAL INSTRUCTIONS:
— Respond to the MIND behind the argument, not just the argument on the table.
— If they deploy their signature move, use the counter that has historically worked.
— If they are showing improvement (trend positive), raise your game to match — do not coast.
— If they fall back on a recurring reasoning pattern, name it explicitly and apply the staged friction.
— If this is their first session (calibrating), use this round to establish the read.
— The goal is developmental friction: maximum pressure that produces insight, not defeat.`.trim();
  }

  // ── Build a single tendency from a weakness type ───────────────────────────

  /**
   * Used by updatePersonalization() to construct a new CognitiveTendency
   * when a weakness type is observed for the first time in the live session.
   */
  private buildTendencyFromWeakness(
    type: WeaknessType,
    severity: WeaknessSeverity,
    now: number
  ): CognitiveTendency | null {
    const mappedSeverity: CognitiveTendency['severity'] =
      severity === 'fatal' || severity === 'significant' ? 'significant' :
      severity === 'moderate' ? 'moderate' : 'minor';

    const tendencyMap: Partial<Record<WeaknessType, Omit<CognitiveTendency, 'detectedAt' | 'frequency' | 'severity'>>> = {
      appeal_to_authority: {
        pattern: 'Appeals to authority without scrutinising credentials or relevance of expertise',
        pressureStrategy:
          'Atlas will demand credential scrutiny up front and pre-empt authority appeals by questioning the scope of claimed expertise before the user can invoke it.',
      },
      circular_reasoning: {
        pattern: 'Circular reasoning — conclusion smuggled into the premises',
        pressureStrategy:
          'Atlas will isolate and name the circularity immediately, demanding an independent ground for each premise before allowing the argument to proceed.',
      },
      overgeneralization: {
        pattern: 'Overgeneralisation — extrapolating from limited cases to universal claims',
        pressureStrategy:
          'Atlas will immediately introduce counterexamples and demand the user specify the domain of their claim before the argument can be assessed.',
      },
      unsupported_claim: {
        pattern: 'Assertion without evidential grounding — treating confidence as a substitute for evidence',
        pressureStrategy:
          'Atlas will flatly refuse to engage with the substance of any claim until an evidential basis is provided.',
      },
      false_dichotomy: {
        pattern: 'Binary framing — collapsing a multi-option problem into two choices',
        pressureStrategy:
          'Atlas will enumerate the excluded middle and force the user to defend their framing as exhaustive.',
      },
      false_premise: {
        pattern: 'Building arguments on unexamined premises — the foundation is assumed, not argued',
        pressureStrategy:
          'Atlas will attack foundation-first and refuse to engage with the superstructure until the base is secured.',
      },
      definitional_ambiguity: {
        pattern: 'Definitional drift — using key terms without committing to precise definitions',
        pressureStrategy:
          'Atlas will demand definitional precision before engaging with any argument, and call out when the user shifts meanings mid-debate.',
      },
      evidence_gap: {
        pattern: 'Systematic evidence gaps — arguments lack specific empirical grounding',
        pressureStrategy:
          'Atlas will press for specific evidence at every step, refusing to accept directional gestures as substantiation.',
      },
      internal_contradiction: {
        pattern: 'Inconsistency — later arguments contradict earlier positions',
        pressureStrategy:
          'Atlas will maintain a running record of stated positions and explicitly cite round numbers when contradictions appear.',
      },
      logical_fallacy: {
        pattern: 'Recurring logical fallacies — structural errors in argument form',
        pressureStrategy:
          'Atlas will name the fallacy precisely and redirect to the substantive argument, refusing to allow the fallacy to do argumentative work.',
      },
      missing_context: {
        pattern: 'Missing context — claims made without situating them in the relevant wider picture',
        pressureStrategy:
          'Atlas will demand the missing context before the claim can be assessed, showing how the conclusion changes when context is included.',
      },
      scope_creep: {
        pattern: 'Scope creep — the argument expands beyond the original claim to avoid direct challenge',
        pressureStrategy:
          'Atlas will pin the original claim and call out explicitly when the scope shifts, holding the debate to the stated thesis.',
      },
    };

    const template = tendencyMap[type];
    if (!template) return null;

    return {
      ...template,
      frequency: 'occasional',
      severity: mappedSeverity,
      detectedAt: now,
    };
  }

  // ── Check if an anticipated move fired in a round ─────────────────────────

  private didAnticipatedMoveFire(move: AnticipatedMove, userText: string): boolean {
    const text = userText.toLowerCase();
    const scenario = move.scenario.toLowerCase();

    // Heuristic checks based on move scenario keywords
    if (scenario.includes('ontological') || scenario.includes('definition')) {
      return /\bdefin(e|ition)\b|\bmeaning of\b|\bwhat (we mean|is meant)\b/i.test(text);
    }
    if (scenario.includes('lived experience') || scenario.includes('subjective')) {
      return /\bi (feel|experience|sense)\b|\bsubjective(ly)?\b|\bpersonal(ly)?\b/i.test(text);
    }
    if (scenario.includes('statistics') || scenario.includes('data') || scenario.includes('studies')) {
      return /\bdata|stud(y|ies)|research|statistic|percent|survey\b/i.test(text);
    }
    if (scenario.includes('analogy') || scenario.includes('metaphor')) {
      return /\bit'?s? like\b|\bsimilar to\b|\banalogous\b|\bjust as\b/i.test(text);
    }
    if (scenario.includes('authority') || scenario.includes('expert')) {
      return /\baccording to\b|\bexperts?\b|\bscholars?\b|\bprofessors?\b|\bstudies show\b/i.test(text);
    }
    if (scenario.includes('concrete') || scenario.includes('pragmatic') || scenario.includes('practical')) {
      return /\bin practice\b|\breal world\b|\bpractical(ly)?\b|\bconcrete(ly)?\b/i.test(text);
    }
    if (scenario.includes('reframe') || scenario.includes('premise')) {
      return /\bthe (real|actual) question\b|\bwhat (we should|you should) be asking\b|\bframing\b/i.test(text);
    }

    return false;
  }

  // ── Parse structured round response ───────────────────────────────────────

  private parseStructuredResponse(
    raw: string
  ): Omit<CrucibleResponse, 'verdictDelta' | 'rawResponse'> & { verdictDelta: number } {
    const text = raw.trim();

    // ── Extract counter-argument ───────────────────────────────────────────
    const counterMatch = text.match(
      /COUNTER[- ]?ARGUMENT[:\s]*([\s\S]*?)(?=\n\s*WEAKNESS(?:ES)?[:\s]|\n\s*ADVISORY[:\s]|\n\s*VERDICT[:\s]|$)/i
    );
    const counterArgument = counterMatch
      ? counterMatch[1].trim()
      : this.extractFallbackSection(text, 0);

    // ── Extract weaknesses ─────────────────────────────────────────────────
    const weaknessesBlock = text.match(
      /WEAKNESS(?:ES)?[:\s]*([\s\S]*?)(?=\n\s*ADVISORY[:\s]|\n\s*VERDICT[:\s]|$)/i
    );
    const weaknesses: ArgumentWeakness[] = [];

    if (weaknessesBlock) {
      const lines = weaknessesBlock[1]
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      for (const line of lines) {
        const weakness = this.parseWeaknessLine(line);
        if (weakness) weaknesses.push(weakness);
      }
    }

    // Ensure at least one weakness
    if (weaknesses.length === 0) {
      weaknesses.push({
        type: 'unsupported_claim',
        description: 'The argument lacks sufficient evidential grounding.',
        severity: 'moderate',
      });
    }

    // ── Extract advisory ───────────────────────────────────────────────────
    const advisoryMatch = text.match(
      /ADVISORY[:\s]*([\s\S]*?)(?=\n\s*VERDICT[:\s]|\n\s*DELTA[:\s]|$)/i
    );
    const advisory = advisoryMatch
      ? advisoryMatch[1].trim()
      : 'Strengthen your argument by grounding claims in specific evidence and addressing the strongest counterexamples.';

    // ── Extract verdict assessment ─────────────────────────────────────────
    const verdictMatch = text.match(
      /VERDICT[:\s]*([\s\S]*?)(?=\n\s*DELTA[:\s]|$)/i
    );
    const verdictAssessment = verdictMatch
      ? verdictMatch[1].replace(/DELTA[:\s].*$/i, '').trim()
      : 'The position showed minor weakening this round.';

    // ── Extract delta ──────────────────────────────────────────────────────
    const deltaMatch = text.match(/DELTA[:\s]*([+-]?\d*\.?\d+)/i);
    let verdictDelta = deltaMatch ? parseFloat(deltaMatch[1]) : -0.05;
    verdictDelta = this.clampDelta(verdictDelta);

    return { counterArgument, weaknesses, advisory, verdictAssessment, verdictDelta };
  }

  private parseWeaknessLine(line: string): ArgumentWeakness | null {
    // Expected formats:
    // [WEAKNESS_TYPE]: description [SEVERITY: minor/moderate/significant/fatal]
    // logical_fallacy: This commits a strawman. Severity: significant
    // • unsupported_claim: X asserted without evidence. [SEVERITY: moderate]

    const cleaned = line.replace(/^[-•*\d.]+\s*/, '').trim();
    if (!cleaned) return null;

    const severityMatch = cleaned.match(
      /\[?SEVERITY[:\s]*(minor|moderate|significant|fatal)\]?/i
    );
    const severity: WeaknessSeverity = severityMatch
      ? (severityMatch[1].toLowerCase() as WeaknessSeverity)
      : 'moderate';

    const withoutSeverity = cleaned
      .replace(/\[?SEVERITY[:\s]*(minor|moderate|significant|fatal)\]?/gi, '')
      .trim();

    const typeMatch = withoutSeverity.match(
      /^(logical_fallacy|unsupported_claim|false_premise|scope_creep|false_dichotomy|circular_reasoning|appeal_to_authority|overgeneralization|missing_context|internal_contradiction|definitional_ambiguity|evidence_gap)[:\s]+([\s\S]+)/i
    );

    if (typeMatch) {
      return {
        type: typeMatch[1].toLowerCase() as WeaknessType,
        description: typeMatch[2].trim(),
        severity,
      };
    }

    // No type prefix — classify generically
    if (withoutSeverity.length > 5) {
      return {
        type: this.inferWeaknessType(withoutSeverity),
        description: withoutSeverity,
        severity,
      };
    }

    return null;
  }

  private inferWeaknessType(text: string): WeaknessType {
    const t = text.toLowerCase();
    if (t.includes('fallacy') || t.includes('strawman') || t.includes('ad hominem'))
      return 'logical_fallacy';
    if (t.includes('evidence') || t.includes('proof') || t.includes('data'))
      return 'evidence_gap';
    if (t.includes('premise') || t.includes('assumption') || t.includes('assumes'))
      return 'false_premise';
    if (t.includes('contradict') || t.includes('inconsistent'))
      return 'internal_contradiction';
    if (t.includes('authority') || t.includes('expert') || t.includes('cite'))
      return 'appeal_to_authority';
    if (t.includes('vague') || t.includes('undefined') || t.includes('ambiguous'))
      return 'definitional_ambiguity';
    if (t.includes('broad') || t.includes('generaliz'))
      return 'overgeneralization';
    if (t.includes('only two') || t.includes('either') || t.includes('dichotomy'))
      return 'false_dichotomy';
    if (t.includes('circular') || t.includes('begging'))
      return 'circular_reasoning';
    return 'unsupported_claim';
  }

  private extractFallbackSection(text: string, index: number): string {
    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 20);
    return paragraphs[index]?.trim() ?? text.slice(0, 400).trim();
  }

  // ── Parse closing analysis JSON ────────────────────────────────────────────

  private parseClosingAnalysis(
    raw: string,
    verdictLabel: 'position_stood' | 'position_partial' | 'position_collapsed'
  ): ClosingAnalysis {
    // Strip markdown code fences if present
    const stripped = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(stripped);
      return {
        finalVerdict: parsed.finalVerdict ?? verdictLabel,
        summary: parsed.summary ?? 'The debate concluded after the allocated rounds.',
        strongArguments: Array.isArray(parsed.strongArguments) ? parsed.strongArguments : [],
        weakArguments: Array.isArray(parsed.weakArguments) ? parsed.weakArguments : [],
        recurringPatterns: Array.isArray(parsed.recurringPatterns)
          ? parsed.recurringPatterns
          : [],
        atlasAssessment:
          parsed.atlasAssessment ?? 'Insufficient data to render a full assessment.',
        studyRecommendations: Array.isArray(parsed.studyRecommendations)
          ? parsed.studyRecommendations
          : [],
        sharpeningRecommendations: Array.isArray(parsed.sharpeningRecommendations)
          ? parsed.sharpeningRecommendations
          : [],
        grade: this.sanitizeGrade(parsed.grade),
        gradeJustification:
          parsed.gradeJustification ?? 'Grade based on overall argument quality.',
      };
    } catch {
      // If JSON parse fails, build a minimal analysis from the raw text
      return this.buildFallbackAnalysis(raw, verdictLabel);
    }
  }

  private sanitizeGrade(raw: unknown): 'A' | 'B' | 'C' | 'D' | 'F' {
    const g = String(raw ?? '').toUpperCase().trim();
    if (['A', 'B', 'C', 'D', 'F'].includes(g)) return g as 'A' | 'B' | 'C' | 'D' | 'F';
    return 'C';
  }

  private buildFallbackAnalysis(
    raw: string,
    verdictLabel: 'position_stood' | 'position_partial' | 'position_collapsed'
  ): ClosingAnalysis {
    return {
      finalVerdict: verdictLabel,
      summary: raw.slice(0, 600),
      strongArguments: [],
      weakArguments: [],
      recurringPatterns: ['Unable to parse full analysis — review raw response.'],
      atlasAssessment: 'Analysis parsing failed. The raw response has been preserved in the summary.',
      studyRecommendations: [],
      sharpeningRecommendations: [],
      grade: 'C',
      gradeJustification: 'Default grade — full analysis could not be parsed.',
    };
  }

  private emptyAnalysis(
    session: CrucibleSession
  ): ClosingAnalysis {
    return {
      finalVerdict: 'position_partial',
      summary:
        'The session ended before any arguments were made. No substantive debate occurred.',
      strongArguments: [],
      weakArguments: [],
      recurringPatterns: [],
      atlasAssessment: 'The thesis was never tested — no assessment is possible.',
      studyRecommendations: [],
      sharpeningRecommendations: [
        'Enter the Crucible with a prepared argument of at least 3 supporting premises.',
        'Anticipate the strongest objection to your thesis before you state it.',
      ],
      grade: 'F',
      gradeJustification: 'No arguments submitted.',
    };
  }

  // ── Calculate verdict delta ────────────────────────────────────────────────

  private calculateVerdictDelta(
    round: CrucibleRound,
    _previousVerdict: number
  ): number {
    // Primary: use the delta returned by Atlas
    const base = round.atlasResponse.verdictDelta;

    // Secondary correction: penalise for high-severity weaknesses
    const fatalCount = round.atlasResponse.weaknesses.filter(
      (w) => w.severity === 'fatal'
    ).length;
    const significantCount = round.atlasResponse.weaknesses.filter(
      (w) => w.severity === 'significant'
    ).length;

    const severityPenalty = fatalCount * -0.04 + significantCount * -0.02;

    return this.clampDelta(base + severityPenalty);
  }

  // ── Utility: human-readable labels ────────────────────────────────────────

  private describeOppositionStyle(style: CruciblePersonalization['oppositionStyle']): string {
    const descriptions: Record<typeof style, string> = {
      socratic:     'Socratic — dismantles via questions, forces the user to surface their own assumptions',
      empirical:    'Empirical — demands evidence at every step, attacks unsupported claims relentlessly',
      systemic:     'Systemic — attacks the framework itself, not just the argument',
      adversarial:  'Adversarial — direct, no-quarter, contradictions exposed immediately',
      foundational: 'Foundational — challenges axioms and rebuilds from first principles',
      lateral:      'Lateral — uses unexpected analogies to destabilise intuitive assumptions',
      accelerating: 'Accelerating — keeps raising the stakes, pushes implications to their limits',
    };
    return descriptions[style] ?? style;
  }

  private describeDifficulty(level: CruciblePersonalization['difficultyCalibration']): string {
    const descriptions: Record<typeof level, string> = {
      calibrating: 'Calibrating — Atlas is building its read. No quarter given from session one.',
      building:    'Building — sustained pressure with room for the argument to develop.',
      challenging: 'Challenging — Atlas applies consistent, high-intensity opposition.',
      relentless:  'Relentless — you are performing well. Atlas will match you.',
      maximum:     'Maximum — you have been here long enough. Atlas knows how you think.',
    };
    return descriptions[level] ?? level;
  }

  private describeAtlasApproach(
    approach: 'educate_while_opposing' | 'peer_level_combat' | 'target_knowledge_gaps'
  ): string {
    switch (approach) {
      case 'educate_while_opposing':
        return 'Atlas will apply pressure while explaining the terrain — novice domain';
      case 'peer_level_combat':
        return 'Atlas treats you as a domain peer — full technical engagement';
      case 'target_knowledge_gaps':
        return 'Atlas will probe the seams in partial domain knowledge';
    }
  }

  // ── Utility: delta clamping ────────────────────────────────────────────────

  private clampDelta(delta: number): number {
    const n = isNaN(delta) ? -0.05 : delta;
    return Math.max(-0.2, Math.min(0.2, n));
  }
}

// ── Singleton export ───────────────────────────────────────────────────────────
export const crucibleEngine = new CrucibleEngine();
