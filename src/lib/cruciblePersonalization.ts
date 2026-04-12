// ─── Atlas Crucible — Personalization Engine ──────────────────────────────────
// Bridges the UserEvolutionProfile to the Crucible engine.
//
// Atlas reads the player behind the argument — archetype, cognitive style,
// known reasoning patterns, vocabulary level, and domain expertise — then
// calibrates its opposition accordingly. Like a chess engine that has studied
// its opponent's game history, Atlas enters each session already knowing their
// signature moves, overused frameworks, and blind spots.
//
// None of this is manipulative: every pattern Atlas targets is fed back to the
// user as explicit coaching. The goal is developmental friction, not defeat.
// ─────────────────────────────────────────────────────────────────────────────

import type { UserEvolutionProfile, CommunicationArchetype, CognitiveStyle } from '../types/evolutionTypes';
import type { CrucibleSession, CrucibleRound, WeaknessType } from './crucibleEngine';

// ── Core personalization container ────────────────────────────────────────────

/**
 * The full picture of how Atlas calibrates its opposition for a specific user.
 * Built once per session from the UserEvolutionProfile + prior Crucible history,
 * then injected into the system prompt as an Opponent Intelligence Briefing.
 */
export interface CruciblePersonalization {
  /** How Atlas shapes its opposition style to match this user's thinking mode */
  oppositionStyle: OppositionStyle;

  /**
   * Recurring reasoning patterns Atlas will pressure-test.
   * These are identified from past sessions and used to calibrate friction —
   * not to embarrass the user, but to surface habits they may not see.
   */
  knownWeaknesses: CognitiveTendency[];

  /** Structural argument patterns Atlas has seen this user deploy repeatedly */
  argumentPatterns: ArgumentPattern[];

  /** How hard Atlas should push this session */
  difficultyCalibration: DifficultyLevel;

  /** Moves Atlas anticipates based on archetype + session history */
  anticipatedMoves: AnticipatedMove[];

  /**
   * Per-domain expertise calibration.
   * Atlas adjusts vocabulary, assumed knowledge, and approach based on
   * whether this user is a domain expert or a curious novice.
   */
  domainCalibration: Record<string, DomainCalibration>;

  /** How Atlas will open its first opposition move */
  openingStrategy: string;

  /** Longitudinal profile of this user as a debater */
  debaterProfile: DebaterProfile;
}

// ── Opposition style ──────────────────────────────────────────────────────────

/**
 * Determines the angle of attack Atlas uses against this user.
 * Derived from their archetype and cognitive style flags.
 *
 * - 'socratic'     — philosopher archetype: dismantle via questions, expose hidden assumptions
 * - 'empirical'    — analyst archetype: demand evidence, attack unsupported claims relentlessly
 * - 'systemic'     — strategist / systems thinker: attack the framework, not just the argument
 * - 'adversarial'  — sovereign communicator: direct, no-quarter, expose contradictions immediately
 * - 'foundational' — first-principles reasoner: challenge axioms, rebuild from bedrock
 * - 'lateral'      — analogical / visionary thinker: unexpected comparisons to destabilise assumptions
 * - 'accelerating' — seeker archetype: keep raising the stakes, push further and further
 */
export type OppositionStyle =
  | 'socratic'
  | 'empirical'
  | 'systemic'
  | 'adversarial'
  | 'foundational'
  | 'lateral'
  | 'accelerating';

// ── Cognitive tendency ────────────────────────────────────────────────────────

/**
 * A reasoning habit Atlas has identified across multiple sessions.
 * Atlas uses these to calibrate friction — applying targeted pressure
 * to patterns the user overuses or relies on without scrutiny.
 */
export interface CognitiveTendency {
  /** Human-readable description of the pattern, e.g. "Appeals to authority without scrutinising credentials" */
  pattern: string;

  /** How often this pattern appears across sessions */
  frequency: 'occasional' | 'frequent' | 'consistent';

  /** How much this pattern damages argumentative quality */
  severity: 'minor' | 'moderate' | 'significant';

  /**
   * How Atlas will apply targeted pressure to this tendency.
   * Framed as developmental friction — what Atlas will do to surface the habit.
   */
  pressureStrategy: string;

  /** Unix timestamp (ms) when this tendency was first identified */
  detectedAt: number;
}

// ── Argument pattern ──────────────────────────────────────────────────────────

/**
 * A structural move the user makes repeatedly in debates.
 * Atlas tracks these to anticipate the shape of arguments before they arrive.
 */
export interface ArgumentPattern {
  patternType:
    | 'opening_move'
    | 'defense_when_pressured'
    | 'concession_style'
    | 'evidence_type'
    | 'rhetorical_device';

  /** Description of the pattern */
  description: string;

  /** 0–1: how frequently this pattern appears across all rounds */
  frequency: number;

  /** Atlas's prepared structural counter to this pattern */
  atlasCounter: string;
}

// ── Difficulty ────────────────────────────────────────────────────────────────

/**
 * How aggressively Atlas should oppose this user this session.
 * Calibrated from session history, improvement trend, and total sessions.
 *
 * - 'calibrating' — fewer than 2 sessions; Atlas is still building a read
 * - 'building'    — user is struggling; Atlas maintains pressure but creates room for growth
 * - 'challenging' — user is developing well; Atlas applies sustained pressure
 * - 'relentless'  — user is winning consistently and improving; Atlas raises its game
 * - 'maximum'     — 20+ sessions; no quarter; Atlas has studied this mind thoroughly
 */
export type DifficultyLevel = 'calibrating' | 'building' | 'challenging' | 'relentless' | 'maximum';

// ── Anticipated move ──────────────────────────────────────────────────────────

/**
 * A move Atlas predicts this user will make, based on archetype and past patterns.
 * Atlas enters each round with these prepared — not to be unfair, but to ensure
 * that no argument lands without being genuinely tested.
 */
export interface AnticipatedMove {
  /** Description of the predicted move, e.g. "Will appeal to subjective experience when the premise is challenged" */
  scenario: string;

  /** 0–1: estimated probability this move appears this session */
  probability: number;

  /** The counter Atlas has staged and ready */
  preparedCounter: string;
}

// ── Domain calibration ────────────────────────────────────────────────────────

/**
 * How Atlas adjusts its approach for a specific domain based on the user's
 * demonstrated expertise level in that area.
 */
export interface DomainCalibration {
  domain: string;

  /** 0–1: derived from the user's domainInterests score */
  userExpertise: number;

  /**
   * - 'educate_while_opposing' — user is a novice; Atlas applies pressure but explains the terrain
   * - 'peer_level_combat'      — user has genuine expertise; Atlas treats them as an equal
   * - 'exploit_gaps'           — user has partial knowledge; Atlas targets the seams
   */
  atlasApproach: 'educate_while_opposing' | 'peer_level_combat' | 'target_knowledge_gaps';

  /** 0–1: how technical Atlas should be in this domain (matched to user vocabulary level) */
  vocabularyMatch: number;
}

// ── Debater profile ───────────────────────────────────────────────────────────

/**
 * Atlas's longitudinal file on this user as a debater.
 * Built from all prior Crucible sessions — the accumulated read.
 */
export interface DebaterProfile {
  totalCrucibleSessions: number;
  avgRoundsPerSession: number;

  /** Average verdictScore across all completed sessions (0–1) */
  avgVerdictScore: number;

  /** 0–1: how often they formally concede rather than letting the session end */
  concessionRate: number;

  /** positive = improving over time; negative = regressing or plateauing */
  improvementTrend: number;

  strongestDomain: string;
  weakestDomain: string;

  /** Their most commonly deployed argument structure */
  signatureMove: string;

  /**
   * The counter-strategy that has historically proven most effective against this user.
   * Atlas defaults to this when the user falls back on familiar patterns.
   */
  mostEffectiveCounterAgainstThem: string;
}

// ── CruciblePersonalizer ──────────────────────────────────────────────────────

/**
 * Constructs a full CruciblePersonalization from a UserEvolutionProfile
 * and all prior Crucible sessions. Called once per session start.
 *
 * This is the "pregame analysis" phase — Atlas studying its opponent before
 * the debate begins.
 */
export class CruciblePersonalizer {
  // ── Public entry point ─────────────────────────────────────────────────────

  /**
   * Build the complete personalization object for this session.
   * Pass the current thesis so anticipated moves can be thesis-aware.
   */
  buildPersonalization(
    profile: UserEvolutionProfile,
    sessionHistory: CrucibleSession[],
    currentThesis = ''
  ): CruciblePersonalization {
    const oppositionStyle = this.deriveOppositionStyle(profile);
    const knownWeaknesses = this.extractCognitiveTendencies(sessionHistory, profile);
    const argumentPatterns = this.extractArgumentPatterns(sessionHistory);
    const difficultyCalibration = this.calibrateDifficulty(profile, sessionHistory);
    const domainCalibration = this.buildDomainCalibration(profile);
    const debaterProfile = this.buildDebaterProfile(sessionHistory);

    // Build a partial personalization to inform downstream derivations
    const partial: Partial<CruciblePersonalization> = {
      oppositionStyle,
      knownWeaknesses,
      argumentPatterns,
      difficultyCalibration,
      domainCalibration,
      debaterProfile,
    };

    const anticipatedMoves = this.anticipateMoves(profile, partial, currentThesis);
    const openingStrategy = this.deriveOpeningStrategy(profile, partial);

    return {
      oppositionStyle,
      knownWeaknesses,
      argumentPatterns,
      difficultyCalibration,
      anticipatedMoves,
      domainCalibration,
      openingStrategy,
      debaterProfile,
    };
  }

  // ── Opposition style derivation ────────────────────────────────────────────

  /**
   * Maps archetype → opposition style.
   * When cognitive style flags are present, they take precedence over archetype
   * for the more specialised styles (foundational, lateral, systemic).
   */
  private deriveOppositionStyle(profile: UserEvolutionProfile): OppositionStyle {
    const cs: CognitiveStyle = profile.cognitiveStyle;

    // Cognitive style flags take priority — they are more granular than archetype
    if (cs.firstPrinciplesReasoner) return 'foundational';
    if (cs.systemsThinker) return 'systemic';
    if (cs.analogicalThinker) return 'lateral';
    if (cs.sovereignCommunicator) return 'adversarial';
    if (cs.socraticDisposition) return 'socratic';

    // Fall through to archetype mapping
    const archetype: CommunicationArchetype = profile.archetype;

    switch (archetype) {
      case 'philosopher': return 'socratic';
      case 'analyst':     return 'empirical';
      case 'strategist':  return 'systemic';
      case 'visionary':   return 'lateral';
      case 'pragmatist':  return 'accelerating'; // push them past the concrete
      case 'scholar':     return 'empirical';
      case 'engineer':    return 'foundational';
      case 'storyteller': return 'lateral';      // destabilise via unexpected angles
      case 'unknown':
      default:            return 'socratic';     // safest default: expose assumptions
    }
  }

  // ── Cognitive tendency extraction ──────────────────────────────────────────

  /**
   * Scans all past Crucible rounds for weakness frequency patterns.
   * Converts statistical regularities into named cognitive tendencies
   * that Atlas will apply targeted pressure to this session.
   */
  private extractCognitiveTendencies(
    sessionHistory: CrucibleSession[],
    _profile: UserEvolutionProfile
  ): CognitiveTendency[] {
    if (sessionHistory.length === 0) return [];

    // Collect all rounds across all sessions
    const allRounds: CrucibleRound[] = sessionHistory.flatMap((s) => s.rounds);
    if (allRounds.length === 0) return [];

    const total = allRounds.length;

    // Count how many rounds contain each weakness type
    const weaknessCounts: Partial<Record<WeaknessType, number>> = {};
    for (const round of allRounds) {
      const seenInRound = new Set<WeaknessType>();
      for (const w of round.atlasResponse.weaknesses) {
        if (!seenInRound.has(w.type)) {
          weaknessCounts[w.type] = (weaknessCounts[w.type] ?? 0) + 1;
          seenInRound.add(w.type);
        }
      }
    }

    const rate = (type: WeaknessType): number =>
      (weaknessCounts[type] ?? 0) / total;

    const now = Date.now();
    const tendencies: CognitiveTendency[] = [];

    // ── Appeal to authority ──────────────────────────────────────────────────
    if (rate('appeal_to_authority') > 0.30) {
      tendencies.push({
        pattern: 'Appeals to authority without scrutinising credentials or relevance of expertise',
        frequency: rate('appeal_to_authority') > 0.50 ? 'consistent' : 'frequent',
        severity: 'moderate',
        pressureStrategy:
          'Atlas will demand credential scrutiny up front and pre-empt authority appeals by questioning the scope of claimed expertise before the user can invoke it.',
        detectedAt: now,
      });
    }

    // ── Circular reasoning ───────────────────────────────────────────────────
    if (rate('circular_reasoning') > 0.20) {
      tendencies.push({
        pattern: 'Circular reasoning — conclusion smuggled into the premises',
        frequency: rate('circular_reasoning') > 0.40 ? 'consistent' : 'frequent',
        severity: 'significant',
        pressureStrategy:
          'Atlas will isolate and name the circularity immediately, demanding an independent ground for each premise before allowing the argument to proceed.',
        detectedAt: now,
      });
    }

    // ── Overgeneralisation ───────────────────────────────────────────────────
    if (rate('overgeneralization') > 0.25) {
      tendencies.push({
        pattern: 'Overgeneralisation — extrapolating from limited cases to universal claims',
        frequency: rate('overgeneralization') > 0.45 ? 'consistent' : 'frequent',
        severity: 'moderate',
        pressureStrategy:
          'Atlas will immediately introduce counterexamples and demand the user specify the domain of their claim before the argument can be assessed.',
        detectedAt: now,
      });
    }

    // ── Unsupported claims ───────────────────────────────────────────────────
    if (rate('unsupported_claim') > 0.40) {
      tendencies.push({
        pattern: 'Assertion without evidential grounding — treating confidence as a substitute for evidence',
        frequency: rate('unsupported_claim') > 0.60 ? 'consistent' : 'frequent',
        severity: 'significant',
        pressureStrategy:
          'Atlas will flatly refuse to engage with the substance of any claim until an evidential basis is provided, applying this consistently from round one.',
        detectedAt: now,
      });
    }

    // ── False dichotomy ──────────────────────────────────────────────────────
    if (rate('false_dichotomy') > 0.20) {
      tendencies.push({
        pattern: 'Binary framing — collapsing a multi-option problem into two choices',
        frequency: rate('false_dichotomy') > 0.35 ? 'consistent' : 'frequent',
        severity: 'moderate',
        pressureStrategy:
          'Atlas will enumerate the excluded middle and force the user to defend their framing as exhaustive before proceeding to substance.',
        detectedAt: now,
      });
    }

    // ── False premise ────────────────────────────────────────────────────────
    if (rate('false_premise') > 0.20) {
      tendencies.push({
        pattern: 'Building arguments on unexamined premises — the foundation is assumed, not argued',
        frequency: rate('false_premise') > 0.40 ? 'consistent' : 'frequent',
        severity: 'significant',
        pressureStrategy:
          'Atlas will attack foundation-first: surface the hidden premise, demand its defence, and refuse to engage with the superstructure until the base is secure.',
        detectedAt: now,
      });
    }

    // ── Definitional ambiguity ───────────────────────────────────────────────
    if (rate('definitional_ambiguity') > 0.25) {
      tendencies.push({
        pattern: 'Definitional drift — using key terms without committing to precise definitions',
        frequency: rate('definitional_ambiguity') > 0.45 ? 'consistent' : 'frequent',
        severity: 'moderate',
        pressureStrategy:
          'Atlas will demand definitional precision before engaging with any argument, and call out when the user shifts meanings mid-debate.',
        detectedAt: now,
      });
    }

    // ── Evidence gap ─────────────────────────────────────────────────────────
    if (rate('evidence_gap') > 0.35) {
      tendencies.push({
        pattern: 'Systematic evidence gaps — arguments lack specific empirical grounding',
        frequency: rate('evidence_gap') > 0.55 ? 'consistent' : 'frequent',
        severity: 'moderate',
        pressureStrategy:
          'Atlas will press for specific evidence (studies, data, named cases) at every step, refusing to accept directional gestures as substantiation.',
        detectedAt: now,
      });
    }

    // ── Internal contradiction ───────────────────────────────────────────────
    if (rate('internal_contradiction') > 0.15) {
      tendencies.push({
        pattern: 'Inconsistency across rounds — later arguments contradict earlier positions',
        frequency: rate('internal_contradiction') > 0.30 ? 'frequent' : 'occasional',
        severity: 'significant',
        pressureStrategy:
          'Atlas will maintain a running record of stated positions and explicitly cite round numbers when contradictions appear, forcing the user to reconcile or concede.',
        detectedAt: now,
      });
    }

    return tendencies;
  }

  // ── Argument pattern extraction ────────────────────────────────────────────

  /**
   * Identifies structural argument patterns across all sessions.
   * These are the shapes of arguments, not just their content:
   * how does this user open? How do they respond to pressure? What evidence types do they favour?
   */
  private extractArgumentPatterns(sessionHistory: CrucibleSession[]): ArgumentPattern[] {
    if (sessionHistory.length === 0) return [];

    const allRounds: CrucibleRound[] = sessionHistory.flatMap((s) => s.rounds);
    if (allRounds.length === 0) return [];

    const total = allRounds.length;
    const patterns: ArgumentPattern[] = [];

    // ── Opening move: does the user typically lead with definitions? ──────────
    const definitionOpeners = allRounds.filter(
      (r) =>
        r.roundNumber === 1 &&
        /\bdefin(e|ition)\b|by which i mean|let'?s (first |start by )/i.test(r.userArgument)
    );
    if (definitionOpeners.length / Math.max(sessionHistory.length, 1) > 0.4) {
      patterns.push({
        patternType: 'opening_move',
        description: 'Opens by establishing definitions before making substantive claims',
        frequency: definitionOpeners.length / Math.max(sessionHistory.length, 1),
        atlasCounter:
          'Accept proposed definitions conditionally, then show how the argument fails even under the user\'s own preferred terms.',
      });
    }

    // ── Opening move: does the user lead with a historical or empirical anchor? ─
    const historicalOpeners = allRounds.filter(
      (r) =>
        r.roundNumber === 1 &&
        /\bhistor(y|ical|ically)\b|\bdata (show|suggest|indicate)\b|\bstudy|studies|research\b/i.test(
          r.userArgument
        )
    );
    if (historicalOpeners.length / Math.max(sessionHistory.length, 1) > 0.35) {
      patterns.push({
        patternType: 'opening_move',
        description: 'Opens with empirical or historical anchors before philosophical argument',
        frequency: historicalOpeners.length / Math.max(sessionHistory.length, 1),
        atlasCounter:
          'Immediately challenge the representativeness and scope of cited evidence, then show how the philosophical claim requires more than empirical illustration.',
      });
    }

    // ── Defense under pressure: does the user pivot to analogies when pressed? ─
    const pressureRounds = allRounds.filter((r) => r.roundNumber > 1);
    const analogyDefense = pressureRounds.filter((r) =>
      /\bit'?s? (like|similar to|analogous to)\b|\bjust as\b|\bthink of it (as|like)\b/i.test(
        r.userArgument
      )
    );
    if (analogyDefense.length / Math.max(pressureRounds.length, 1) > 0.30) {
      patterns.push({
        patternType: 'defense_when_pressured',
        description: 'Pivots to analogical reasoning when the primary argument is under pressure',
        frequency: analogyDefense.length / Math.max(pressureRounds.length, 1),
        atlasCounter:
          'Accept the analogy, then immediately show where it breaks — the disanalogy is always more interesting than the similarity.',
      });
    }

    // ── Defense under pressure: retreats to qualifications ───────────────────
    const qualificationDefense = pressureRounds.filter((r) =>
      /\bsometimes\b|\bin (some|many) cases\b|\bit depends\b|\bnot always\b/i.test(r.userArgument)
    );
    if (qualificationDefense.length / Math.max(pressureRounds.length, 1) > 0.35) {
      patterns.push({
        patternType: 'defense_when_pressured',
        description: 'Retreats into heavy qualification when the original claim is challenged',
        frequency: qualificationDefense.length / Math.max(pressureRounds.length, 1),
        atlasCounter:
          'Pin the qualified claim and show that it is either trivially true (no longer worth defending) or requires a stronger version that has already been refuted.',
      });
    }

    // ── Concession style: quick concession or reluctant ───────────────────────
    const concededSessions = sessionHistory.filter((s) => s.status === 'conceded');
    if (concededSessions.length > 0) {
      const avgRoundsBeforeConcession =
        concededSessions.reduce((acc, s) => acc + s.rounds.length, 0) /
        concededSessions.length;
      if (avgRoundsBeforeConcession < 3) {
        patterns.push({
          patternType: 'concession_style',
          description: 'Concedes quickly (avg < 3 rounds) — exits debates before exhausting available positions',
          frequency: concededSessions.length / Math.max(sessionHistory.length, 1),
          atlasCounter:
            'Apply maximum pressure in round 1 to test whether the quick concession pattern holds, or whether early pressure produces deeper argument.',
        });
      }
    }

    // ── Evidence type: does the user prefer philosophical / intuition-based argument? ─
    const intuitionEvidence = allRounds.filter((r) =>
      /\bi (feel|believe|sense|think)\b|\bintuitively\b|\bit seems\b|\bmost people would\b/i.test(
        r.userArgument
      )
    );
    if (intuitionEvidence.length / Math.max(total, 1) > 0.35) {
      patterns.push({
        patternType: 'evidence_type',
        description: 'Relies heavily on intuition and first-person belief as epistemic anchors',
        frequency: intuitionEvidence.length / Math.max(total, 1),
        atlasCounter:
          'Challenge the epistemic status of intuition directly: demand that intuitive claims be given a grounding beyond personal conviction, or shown to track something real.',
      });
    }

    // ── Rhetorical device: does the user use rhetorical questions to make claims? ─
    const rhetoricalQuestions = allRounds.filter((r) => {
      const questionCount = (r.userArgument.match(/\?/g) ?? []).length;
      return questionCount >= 2;
    });
    if (rhetoricalQuestions.length / Math.max(total, 1) > 0.25) {
      patterns.push({
        patternType: 'rhetorical_device',
        description: 'Uses rhetorical questions as assertions — making claims without defending them',
        frequency: rhetoricalQuestions.length / Math.max(total, 1),
        atlasCounter:
          'Answer every rhetorical question literally and directly, converting it from a point-scoring device into an actual proposition that must be defended.',
      });
    }

    return patterns;
  }

  // ── Difficulty calibration ─────────────────────────────────────────────────

  /**
   * Determines how aggressively Atlas should oppose this user.
   * Based on session count, average verdict score, and improvement trend.
   */
  private calibrateDifficulty(
    _profile: UserEvolutionProfile,
    sessionHistory: CrucibleSession[]
  ): DifficultyLevel {
    const completed = sessionHistory.filter(
      (s) => s.status === 'completed' || s.status === 'conceded'
    );

    // Not enough history — Atlas is still building a read
    if (completed.length < 2) return 'calibrating';

    // Long-term practitioner — no adjustment; maximum resistance
    if (completed.length >= 20) return 'maximum';

    const avgVerdict =
      completed.reduce((acc, s) => acc + s.verdictScore, 0) / completed.length;

    // Compute improvement trend: compare first half vs second half of sessions
    const mid = Math.floor(completed.length / 2);
    const firstHalf = completed.slice(0, mid);
    const secondHalf = completed.slice(mid);
    const firstAvg = firstHalf.reduce((a, s) => a + s.verdictScore, 0) / Math.max(firstHalf.length, 1);
    const secondAvg = secondHalf.reduce((a, s) => a + s.verdictScore, 0) / Math.max(secondHalf.length, 1);
    const trend = secondAvg - firstAvg;

    // Winning consistently AND improving → relentless
    if (avgVerdict > 0.70 && trend > 0) return 'relentless';

    // High average, even without trend
    if (avgVerdict > 0.70) return 'relentless';

    // Solid performance range
    if (avgVerdict >= 0.50) return 'challenging';

    // Struggling — Atlas maintains pressure but creates room for growth
    return 'building';
  }

  // ── Move anticipation ──────────────────────────────────────────────────────

  /**
   * Predicts the moves this user is likely to make this session.
   * Based on their archetype, known argument patterns, and the current thesis.
   * Atlas uses these to enter each round already prepared.
   */
  private anticipateMoves(
    profile: UserEvolutionProfile,
    personalization: Partial<CruciblePersonalization>,
    currentThesis: string
  ): AnticipatedMove[] {
    const moves: AnticipatedMove[] = [];
    const archetype = profile.archetype;
    const thesis = currentThesis.toLowerCase();

    // ── Archetype-based predictions ──────────────────────────────────────────

    switch (archetype) {
      case 'philosopher':
        moves.push({
          scenario:
            'Will make an ontological or conceptual argument — defending or attacking the definition of key terms rather than the empirical claim',
          probability: 0.80,
          preparedCounter:
            'Accept the ontological framing, then show that the conceptual argument entails consequences the user has not considered and may not want to defend.',
        });
        moves.push({
          scenario:
            'Will appeal to lived experience or phenomenological data as irreducible evidence',
          probability: 0.65,
          preparedCounter:
            'Acknowledge subjective experience as data, then challenge whether it generalises and whether it is being interpreted correctly rather than simply felt.',
        });
        moves.push({
          scenario:
            'Will pivot to questioning the definitions of key terms mid-debate when the main argument is under pressure',
          probability: 0.55,
          preparedCounter:
            'Call the pivot explicitly, noting the round number of the original definition, and demand either a return to the original terms or an acknowledgement that the argument has shifted.',
        });
        break;

      case 'analyst':
        moves.push({
          scenario:
            'Will cite statistics, studies, or quantitative data as the primary mode of support',
          probability: 0.85,
          preparedCounter:
            'Challenge the studies on methodology, sample size, or replicability — then show that the philosophical claim requires more than statistical correlation to be established.',
        });
        moves.push({
          scenario:
            'Will demand Atlas provide its own evidence and use the absence of counter-evidence as de facto proof of their position',
          probability: 0.70,
          preparedCounter:
            'Distinguish between burden of proof and evidence — Atlas\'s role here is to pressure-test the argument, not to construct one. The absence of Atlas\'s evidence is not evidence for the user\'s position.',
        });
        moves.push({
          scenario:
            'Will attempt to quantify or operationalise philosophical or ethical claims that resist measurement',
          probability: 0.60,
          preparedCounter:
            'Accept the operationalisation, then show what is lost in the translation and whether the operationalised version is still the claim being debated.',
        });
        break;

      case 'strategist':
        moves.push({
          scenario:
            'Will attack Atlas\'s framing of the debate directly, attempting to redefine the terms of engagement',
          probability: 0.75,
          preparedCounter:
            'Concede that framing matters, then demonstrate that even under the user\'s preferred framing the original objection survives.',
        });
        moves.push({
          scenario:
            'Will reject the premise of the thesis outright and attempt to redefine what is being debated',
          probability: 0.65,
          preparedCounter:
            'Grant the premise challenge provisionally, then show that the debate is still substantive under the user\'s alternative framing.',
        });
        moves.push({
          scenario:
            'Will invoke systems-level consequences as trump cards against fine-grained arguments',
          probability: 0.60,
          preparedCounter:
            'Demand that system-level predictions be grounded in specific mechanisms — the move from "this affects the system" to a determinate outcome requires argument, not assertion.',
        });
        break;

      case 'pragmatist':
        moves.push({
          scenario:
            'Will reduce abstract or philosophical arguments to concrete, measurable outcomes and dismiss anything that resists that reduction',
          probability: 0.80,
          preparedCounter:
            'Accept the pragmatist frame, then show that the concrete outcomes the user cares about depend on getting the abstract question right.',
        });
        moves.push({
          scenario:
            'Will dismiss principled counterarguments as academic or impractical',
          probability: 0.70,
          preparedCounter:
            'Show a historical case where dismissing the principled argument as "impractical" produced the worse practical outcome.',
        });
        break;

      case 'visionary':
        moves.push({
          scenario:
            'Will use extended analogies or metaphors to carry argumentative weight',
          probability: 0.75,
          preparedCounter:
            'Engage the analogy fully, then identify precisely where it breaks and what that disanalogy reveals about the original claim.',
        });
        moves.push({
          scenario:
            'Will make projective, future-oriented claims that are difficult to falsify in the present',
          probability: 0.70,
          preparedCounter:
            'Challenge the epistemic status of the prediction and demand the mechanism — not just the outcome — be defended.',
        });
        break;

      case 'scholar':
        moves.push({
          scenario:
            'Will invoke the existing scholarly literature and established consensus as the primary authority',
          probability: 0.80,
          preparedCounter:
            'Challenge whether scholarly consensus in this field is well-grounded (replication crisis, methodological issues) or whether the user is citing consensus because it is convenient rather than decisive.',
        });
        moves.push({
          scenario:
            'Will appeal to experts by name or institutional authority to settle factual disputes',
          probability: 0.65,
          preparedCounter:
            'Accept the expert citation, then raise a second expert who disagrees and force the user to arbitrate — expertise does not resolve the dispute, it relocates it.',
        });
        break;

      case 'engineer':
        moves.push({
          scenario:
            'Will attempt to decompose the problem into components and argue each in isolation',
          probability: 0.75,
          preparedCounter:
            'Allow the decomposition, then show that the components interact in ways that undermine the conclusion even if each component argument holds.',
        });
        moves.push({
          scenario:
            'Will invoke technical precision or implementation constraints to dismiss philosophical objections',
          probability: 0.65,
          preparedCounter:
            'Show that the technical constraint is itself a normative choice and that the philosophical objection survives even at the implementation level.',
        });
        break;

      case 'storyteller':
        moves.push({
          scenario:
            'Will use narrative examples or case studies as the primary form of evidence',
          probability: 0.80,
          preparedCounter:
            'Accept the case, then demand it be shown as representative rather than exceptional — one vivid story does not establish a general claim.',
        });
        moves.push({
          scenario:
            'Will make emotional resonance an implicit criterion for truth',
          probability: 0.65,
          preparedCounter:
            'Separate the affective power of the argument from its epistemic validity — Atlas will respond to the logic, not the affect.',
        });
        break;

      default:
        moves.push({
          scenario:
            'Will likely open with the most intuitive version of their position before defending its more challenging implications',
          probability: 0.65,
          preparedCounter:
            'Accept the intuitive version and immediately move to the challenging implications, forcing the user to defend the full position from the start.',
        });
    }

    // ── Thesis-specific predictions ───────────────────────────────────────────

    if (thesis.includes('free will') || thesis.includes('determinism')) {
      moves.push({
        scenario:
          'Will distinguish compatibilist from hard-determinist free will and use that distinction to escape the dilemma',
        probability: 0.60,
        preparedCounter:
          'Grant the compatibilist definition, then show the distinction still doesn\'t address the strongest version of the objection — the one that doesn\'t depend on definitional resolution.',
      });
    }

    if (thesis.includes('moral') || thesis.includes('ethics') || thesis.includes('ought')) {
      moves.push({
        scenario:
          'Will ground moral claims in intuition and treat widespread intuitive agreement as moral evidence',
        probability: 0.65,
        preparedCounter:
          'Challenge whether moral intuitions track moral facts or merely cultural conditioning — widely shared intuitions have been spectacularly wrong before.',
      });
    }

    if (thesis.includes('democracy') || thesis.includes('governance') || thesis.includes('political')) {
      moves.push({
        scenario:
          'Will invoke the pragmatic "least bad option" defence to avoid engaging with principled objections',
        probability: 0.70,
        preparedCounter:
          'Accept the comparative frame and show that the principled objection holds even on a least-bad comparison — the alternatives may be worse but the objection still identifies a real failure.',
      });
    }

    // Apply known argument patterns to refine probability estimates
    const openingPatterns = personalization.argumentPatterns?.filter(
      (p) => p.patternType === 'opening_move'
    ) ?? [];
    if (openingPatterns.length > 0) {
      moves.push({
        scenario: `Will deploy their signature opening move: ${openingPatterns[0].description}`,
        probability: Math.min(openingPatterns[0].frequency + 0.2, 0.95),
        preparedCounter: openingPatterns[0].atlasCounter,
      });
    }

    return moves.slice(0, 8); // Cap at 8 anticipated moves per session
  }

  // ── Domain calibration ─────────────────────────────────────────────────────

  /**
   * Builds a calibration map for each domain the user has engaged with.
   * Determines whether Atlas should educate, match peer-level, or probe gaps.
   */
  private buildDomainCalibration(
    profile: UserEvolutionProfile
  ): Record<string, DomainCalibration> {
    const calibration: Record<string, DomainCalibration> = {};
    const vocabLevel = profile.communicationProfile.vocabularyLevel / 10; // normalise 1–10 → 0–1

    for (const domain of profile.domainInterests) {
      const expertise = domain.score;

      let atlasApproach: DomainCalibration['atlasApproach'];
      if (expertise >= 0.75) {
        atlasApproach = 'peer_level_combat';
      } else if (expertise >= 0.40) {
        atlasApproach = 'target_knowledge_gaps';
      } else {
        atlasApproach = 'educate_while_opposing';
      }

      // Vocabulary match: blend domain expertise with overall vocabulary level
      const vocabularyMatch = Math.min(1, (expertise * 0.6 + vocabLevel * 0.4));

      calibration[domain.name] = {
        domain: domain.name,
        userExpertise: expertise,
        atlasApproach,
        vocabularyMatch,
      };
    }

    return calibration;
  }

  // ── Opening strategy ───────────────────────────────────────────────────────

  /**
   * Generates a specific instruction for how Atlas should open its opposition.
   * Takes into account opposition style, known tendencies, and domain calibration.
   */
  private deriveOpeningStrategy(
    profile: UserEvolutionProfile,
    personalization: Partial<CruciblePersonalization>
  ): string {
    const style = personalization.oppositionStyle ?? 'socratic';
    const weaknesses = personalization.knownWeaknesses ?? [];
    const archetype = profile.archetype;

    // If we have known tendencies, open by targeting the most severe one immediately
    const topTendency = weaknesses
      .filter((t) => t.severity !== 'minor')
      .sort((a, b) => {
        const severityRank = { significant: 2, moderate: 1, minor: 0 };
        return severityRank[b.severity] - severityRank[a.severity];
      })[0];

    const tendencyClause = topTendency
      ? ` Open by immediately applying pressure to their known tendency: ${topTendency.pattern}.`
      : '';

    switch (style) {
      case 'socratic':
        return (
          `Begin with a precisely targeted question that exposes the deepest hidden assumption in the thesis — ` +
          `do not state the objection directly; force the user to discover it through their own answer.` +
          tendencyClause
        );

      case 'empirical':
        return (
          `Open by demanding the evidential baseline: what specific data, studies, or cases does the user ` +
          `have to ground the thesis? Refuse to engage with the philosophical argument until the empirical ` +
          `floor is established.` + tendencyClause
        );

      case 'systemic':
        return (
          `Open by attacking the framework, not the argument: identify the conceptual model the thesis ` +
          `relies on and show that it fails to account for a systemic interaction the user has not considered.` +
          tendencyClause
        );

      case 'adversarial':
        return (
          `Open with a direct, maximum-pressure refutation: identify the single most fatal weakness in the ` +
          `thesis as stated and state it without softening. Force the user to defend their position from ` +
          `the strongest possible objection immediately.` + tendencyClause
        );

      case 'foundational':
        return (
          `Begin by identifying the axiomatic assumption the thesis cannot function without, ` +
          `then challenge that assumption directly. The superstructure of the argument is irrelevant ` +
          `until the foundation is secured.` + tendencyClause
        );

      case 'lateral':
        return (
          `Open with an unexpected analogy that reframes the thesis — one that reveals an implication ` +
          `the user has not considered. The goal is to destabilise the intuitive comfort of the position ` +
          `before the argument begins.` + tendencyClause
        );

      case 'accelerating':
        return (
          `Accept the thesis provisionally in round one, then immediately push to the next level: ` +
          `"Assume you are correct — what follows? What are you now committed to?" ` +
          `Keep raising the stakes until the user's framework shows strain.` + tendencyClause
        );

      default:
        return (
          `Identify the central assumption and apply maximum pressure to it from round one.` +
          tendencyClause
        );
    }
  }

  // ── Debater profile ────────────────────────────────────────────────────────

  /**
   * Builds a longitudinal profile of this user as a Crucible debater.
   * This is Atlas's accumulated read — the intelligence file on how this
   * specific mind performs under adversarial pressure.
   */
  private buildDebaterProfile(sessionHistory: CrucibleSession[]): DebaterProfile {
    if (sessionHistory.length === 0) {
      return {
        totalCrucibleSessions: 0,
        avgRoundsPerSession: 0,
        avgVerdictScore: 0.5,
        concessionRate: 0,
        improvementTrend: 0,
        strongestDomain: 'unknown',
        weakestDomain: 'unknown',
        signatureMove: 'unknown — insufficient session history',
        mostEffectiveCounterAgainstThem: 'unknown — insufficient session history',
      };
    }

    const completed = sessionHistory.filter(
      (s) => s.status === 'completed' || s.status === 'conceded'
    );

    const totalSessions = sessionHistory.length;
    const avgRounds =
      sessionHistory.reduce((acc, s) => acc + s.rounds.length, 0) /
      Math.max(totalSessions, 1);
    const avgVerdictScore =
      completed.length > 0
        ? completed.reduce((acc, s) => acc + s.verdictScore, 0) / completed.length
        : 0.5;
    const concessionRate =
      sessionHistory.filter((s) => s.status === 'conceded').length /
      Math.max(totalSessions, 1);

    // Improvement trend: later sessions vs earlier sessions
    let improvementTrend = 0;
    if (completed.length >= 4) {
      const half = Math.floor(completed.length / 2);
      const early = completed.slice(0, half);
      const late = completed.slice(half);
      const earlyAvg = early.reduce((a, s) => a + s.verdictScore, 0) / early.length;
      const lateAvg = late.reduce((a, s) => a + s.verdictScore, 0) / late.length;
      improvementTrend = lateAvg - earlyAvg;
    }

    // Domain performance: best and worst verdict score by domain
    const domainScores: Record<string, { total: number; count: number }> = {};
    for (const session of completed) {
      if (!domainScores[session.domain]) {
        domainScores[session.domain] = { total: 0, count: 0 };
      }
      domainScores[session.domain].total += session.verdictScore;
      domainScores[session.domain].count += 1;
    }

    const domainAverages = Object.entries(domainScores).map(([domain, { total, count }]) => ({
      domain,
      avg: total / count,
    }));

    const sorted = domainAverages.sort((a, b) => b.avg - a.avg);
    const strongestDomain = sorted[0]?.domain ?? 'unknown';
    const weakestDomain = sorted[sorted.length - 1]?.domain ?? 'unknown';

    // Signature move: the most common argument opening pattern across sessions
    const allRounds = sessionHistory.flatMap((s) => s.rounds);
    const round1Arguments = allRounds.filter((r) => r.roundNumber === 1);

    let signatureMove = 'Opens with a direct statement of position';
    if (round1Arguments.length > 0) {
      const hasDefinitionOpening = round1Arguments.filter((r) =>
        /\bdefin(e|ition)\b/i.test(r.userArgument)
      ).length / round1Arguments.length;
      const hasEmpiricalOpening = round1Arguments.filter((r) =>
        /\bdata|study|research|evidence\b/i.test(r.userArgument)
      ).length / round1Arguments.length;
      const hasPhilosophicalOpening = round1Arguments.filter((r) =>
        /\bif we (accept|assume|grant)\b|\bconsider\b|\bfundamentally\b/i.test(r.userArgument)
      ).length / round1Arguments.length;

      if (hasDefinitionOpening > 0.4) signatureMove = 'Opens by establishing precise definitions before arguing';
      else if (hasEmpiricalOpening > 0.4) signatureMove = 'Opens with empirical evidence or data as the primary anchor';
      else if (hasPhilosophicalOpening > 0.4) signatureMove = 'Opens with a philosophical framing or conditional premise';
    }

    // Most effective counter: the weakness type most correlated with low verdict scores
    // i.e. when Atlas named this weakness, the user's verdict score tended to drop
    let mostEffectiveCounterAgainstThem = 'Demanding evidential grounding for unsupported claims';
    const weaknessEffectiveness: Record<string, { verdictImpact: number; count: number }> = {};

    for (const session of sessionHistory) {
      for (const round of session.rounds) {
        for (const weakness of round.atlasResponse.weaknesses) {
          if (!weaknessEffectiveness[weakness.type]) {
            weaknessEffectiveness[weakness.type] = { verdictImpact: 0, count: 0 };
          }
          // Negative delta means the user's position weakened — that's the counter working
          weaknessEffectiveness[weakness.type].verdictImpact += -round.verdictDelta;
          weaknessEffectiveness[weakness.type].count += 1;
        }
      }
    }

    const effectivenessRanked = Object.entries(weaknessEffectiveness)
      .map(([type, { verdictImpact, count }]) => ({
        type,
        avgImpact: verdictImpact / count,
      }))
      .sort((a, b) => b.avgImpact - a.avgImpact);

    if (effectivenessRanked.length > 0) {
      const topCounter = effectivenessRanked[0].type as WeaknessType;
      const counterDescriptions: Partial<Record<WeaknessType, string>> = {
        appeal_to_authority:
          'Demanding credential scrutiny and pre-empting authority appeals',
        circular_reasoning:
          'Isolating and naming circularity, then demanding independent premise grounding',
        overgeneralization:
          'Introducing immediate counterexamples and demanding scope specification',
        unsupported_claim:
          'Flatly refusing to engage until a specific evidential basis is provided',
        false_dichotomy:
          'Enumerating the excluded middle and demanding exhaustive framing',
        false_premise:
          'Attacking the foundation first and refusing to engage the superstructure',
        definitional_ambiguity:
          'Demanding definitional precision before engaging and calling out term-shifting',
        evidence_gap:
          'Pressing for specific data and refusing to accept directional gestures',
        internal_contradiction:
          'Citing the round number of the contradiction and forcing reconciliation',
        logical_fallacy:
          'Naming the fallacy precisely and redirecting to the substantive argument',
        missing_context:
          'Demanding the missing context before the claim can be assessed',
        scope_creep:
          'Pinning the original claim and calling out when the scope expands',
      };
      mostEffectiveCounterAgainstThem =
        counterDescriptions[topCounter] ?? `Targeting ${topCounter.replace(/_/g, ' ')}`;
    }

    return {
      totalCrucibleSessions: totalSessions,
      avgRoundsPerSession: Number(avgRounds.toFixed(1)),
      avgVerdictScore: Number(avgVerdictScore.toFixed(2)),
      concessionRate: Number(concessionRate.toFixed(2)),
      improvementTrend: Number(improvementTrend.toFixed(3)),
      strongestDomain,
      weakestDomain,
      signatureMove,
      mostEffectiveCounterAgainstThem,
    };
  }
}

// ── Singleton export ───────────────────────────────────────────────────────────
export const cruciblePersonalizer = new CruciblePersonalizer();
