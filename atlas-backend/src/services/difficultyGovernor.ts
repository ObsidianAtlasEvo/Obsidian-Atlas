/**
 * difficultyGovernor.ts
 *
 * Controls when Atlas should pressure-test, relent, switch modes, or stop
 * repeating the same approach — making Crucible genuinely developmental
 * rather than just impressively hard.
 */

// ---------------------------------------------------------------------------
// External type references (mirrored for isolation)
// ---------------------------------------------------------------------------

export interface CrucibleRound {
  roundNumber: number;
  userArgument: string;
  atlasResponse: string;
  verdictScore: number;          // 0-1, how strong the user's argument was judged
  primaryWeakness: string;       // e.g. "circular_reasoning", "false_analogy", etc.
  weaknessCount: number;         // total weaknesses Atlas found this round
  argumentType: string;          // e.g. "inductive", "deductive", "appeal_to_authority"
  userSignals: string[];         // detected signals: "frustration", "withdrawal", "breakthrough"
}

export interface CrucibleSession {
  sessionId: string;
  userId: string;
  rounds: CrucibleRound[];
  avgVerdictScore: number;
  trendDirection: 'improving' | 'stable' | 'declining';
  totalSessionCount: number;     // lifetime session count for this user
  priorSessionArgTypes: string[];// argument types seen in previous sessions
  userPreferences: {
    requestedHarder?: boolean;   // user said "push harder", "don't go easy"
    requestedEasier?: boolean;
  };
}

export interface CruciblePersonalization {
  userId: string;
  avgVerdictScore: number;        // across all prior sessions
  sessionCount: number;
  dominantWeaknessTypes: string[];// weaknesses that appear most often
  breakthroughHistory: Array<{ round: number; sessionId: string; verdictDelta: number }>;
}

// ---------------------------------------------------------------------------
// Governor types
// ---------------------------------------------------------------------------

export type CrucibleMode =
  | 'calibrating'    // early sessions, learning the user
  | 'building'       // user is struggling — constructive opposition
  | 'challenging'    // user is holding their own — raise stakes
  | 'relentless'     // user is strong — no mercy
  | 'switch'         // current mode isn't working — change tactics
  | 'relent'         // user is genuinely overwhelmed — ease off
  | 'consolidate';   // user made a breakthrough — let them solidify it

export interface DifficultyState {
  currentMode: CrucibleMode;
  currentDifficulty: number;     // 0-1
  roundsInCurrentMode: number;
  lastModeChange: number;        // timestamp
  pressureHistory: PressureRecord[];
  switchSignals: SwitchSignal[];
}

export interface PressureRecord {
  round: number;
  mode: CrucibleMode;
  verdictDelta: number;
  userSignals: string[];         // detected signals (frustration, breakthrough, repetition)
}

export interface SwitchSignal {
  type:
    | 'frustration_detected'
    | 'same_weakness_3x'
    | 'breakthrough'
    | 'overwhelmed'
    | 'stagnant'
    | 'improving_fast';
  detectedAt: number;            // timestamp
  round: number;
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const STAGNATION_VERDICT_THRESHOLD = 0.05;   // verdict hasn't moved > this in N rounds
const STAGNATION_ROUNDS = 3;
const REPEAT_WEAKNESS_ROUNDS = 3;             // same weakness for this many consecutive rounds
const OVERWHELM_ROUNDS = 3;                   // 3 consecutive rounds with >4 weaknesses
const OVERWHELM_WEAKNESS_COUNT = 4;
const RELENT_MIN_VERDICT = 0.2;              // verdict below this → being routed
const WITHDRAWAL_LENGTH_DROP = 0.5;          // argument length dropped >50%
const BREAKTHROUGH_VERDICT_DELTA = 0.15;     // verdict jumped this much in one round
const RELENTLESS_MIN_SESSIONS = 5;
const RELENTLESS_MIN_AVG_VERDICT = 0.6;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

function averageArgLength(rounds: CrucibleRound[]): number {
  if (rounds.length === 0) return 0;
  return rounds.reduce((sum, r) => sum + r.userArgument.split(/\s+/).length, 0) / rounds.length;
}

function recentRounds(session: CrucibleSession, n: number): CrucibleRound[] {
  return session.rounds.slice(-n);
}

function verdictDeltaInRound(session: CrucibleSession, roundIndex: number): number {
  const rounds = session.rounds;
  if (roundIndex === 0 || rounds.length < 2) return 0;
  const prev = rounds[roundIndex - 1].verdictScore;
  const curr = rounds[roundIndex].verdictScore;
  return curr - prev;
}

// ---------------------------------------------------------------------------
// DifficultyGovernor
// ---------------------------------------------------------------------------

export class DifficultyGovernor {
  // -------------------------------------------------------------------------
  // Public: assess what mode Atlas should enter next round
  // -------------------------------------------------------------------------

  assessNextMode(
    session: CrucibleSession,
    currentState: DifficultyState,
    personalization: CruciblePersonalization,
  ): { mode: CrucibleMode; rationale: string; adjustments: string[] } {
    const signals = this.detectSwitchSignals(session);
    const adjustments: string[] = [];

    // Priority order: relent > consolidate > switch > relentless > challenging > building > calibrating

    // 1. RELENT — user is overwhelmed or being routed
    const overwhelmedSignal = signals.find((s) => s.type === 'overwhelmed');
    const routedByLowVerdict = last(session.rounds)?.verdictScore !== undefined &&
      last(session.rounds)!.verdictScore < RELENT_MIN_VERDICT;

    const avgLen = averageArgLength(session.rounds.slice(0, -1));
    const lastLen = last(session.rounds)?.userArgument.split(/\s+/).length ?? avgLen;
    const withdrawalSignal = avgLen > 0 && lastLen < avgLen * (1 - WITHDRAWAL_LENGTH_DROP);

    if (overwhelmedSignal || routedByLowVerdict || withdrawalSignal) {
      if (overwhelmedSignal) adjustments.push('3+ rounds with >4 weaknesses found');
      if (routedByLowVerdict) adjustments.push(`verdict dropped below ${RELENT_MIN_VERDICT}`);
      if (withdrawalSignal) adjustments.push('argument length dropped >50% — withdrawal signal');

      return {
        mode: 'relent',
        rationale: `User is showing signs of being overwhelmed or withdrawal. Easing pressure. Signals: ${adjustments.join('; ')}.`,
        adjustments,
      };
    }

    // 2. CONSOLIDATE — breakthrough detected
    const breakthroughSignal = signals.find((s) => s.type === 'breakthrough');
    if (breakthroughSignal) {
      adjustments.push('verdict jumped >0.15 in one round');

      const rounds = session.rounds;
      const lastRound = last(rounds);
      if (lastRound) {
        const usedNewArgType =
          lastRound.argumentType &&
          !session.priorSessionArgTypes.includes(lastRound.argumentType) &&
          rounds.slice(0, -1).every((r) => r.argumentType !== lastRound.argumentType);
        if (usedNewArgType) {
          adjustments.push(`new argument type introduced: "${lastRound.argumentType}"`);
        }
      }

      return {
        mode: 'consolidate',
        rationale: `User made a significant breakthrough. Holding space for articulation before advancing. Signals: ${adjustments.join('; ')}.`,
        adjustments,
      };
    }

    // 3. SWITCH — same weakness or stagnation
    const sameWeaknessSignal = signals.find((s) => s.type === 'same_weakness_3x');
    const stagnantSignal = signals.find((s) => s.type === 'stagnant');

    if (sameWeaknessSignal || stagnantSignal) {
      if (sameWeaknessSignal) {
        const weakness = this.dominantRecentWeakness(session, REPEAT_WEAKNESS_ROUNDS);
        adjustments.push(`weakness "${weakness}" targeted ${REPEAT_WEAKNESS_ROUNDS}x in a row without development`);
      }
      if (stagnantSignal) {
        adjustments.push(`verdict unchanged (±${STAGNATION_VERDICT_THRESHOLD}) for ${STAGNATION_ROUNDS} rounds`);
      }

      return {
        mode: 'switch',
        rationale: `Current approach is not producing development. Changing tactics. Signals: ${adjustments.join('; ')}.`,
        adjustments,
      };
    }

    // 4. RELENTLESS — strong user who wants the hardest opposition
    const improvingFastSignal = signals.find((s) => s.type === 'improving_fast');
    const strongUser =
      personalization.sessionCount >= RELENTLESS_MIN_SESSIONS &&
      personalization.avgVerdictScore >= RELENTLESS_MIN_AVG_VERDICT;
    const requestedHarder = session.userPreferences?.requestedHarder === true;

    if (strongUser || requestedHarder || improvingFastSignal) {
      if (strongUser) adjustments.push(`${personalization.sessionCount} sessions, avg verdict ${personalization.avgVerdictScore.toFixed(2)}`);
      if (requestedHarder) adjustments.push('user explicitly requested harder opposition');
      if (improvingFastSignal) adjustments.push('verdict improving rapidly');

      return {
        mode: 'relentless',
        rationale: `User has demonstrated sustained strength. Maximum pressure appropriate. Signals: ${adjustments.join('; ')}.`,
        adjustments,
      };
    }

    // 5. CALIBRATING — early sessions
    if (session.totalSessionCount <= 2) {
      adjustments.push(`session ${session.totalSessionCount} of lifecycle — still calibrating`);
      return {
        mode: 'calibrating',
        rationale: 'Early session: building baseline understanding of the user.',
        adjustments,
      };
    }

    // 6. CHALLENGING or BUILDING — based on current verdict trend
    if (session.trendDirection === 'improving' && session.avgVerdictScore > 0.45) {
      adjustments.push('user holding their own, verdict trend improving');
      return {
        mode: 'challenging',
        rationale: 'User is performing well. Raising the stakes.',
        adjustments,
      };
    }

    adjustments.push('user is struggling — constructive opposition');
    return {
      mode: 'building',
      rationale: 'User is finding the material difficult. Maintaining constructive opposition.',
      adjustments,
    };
  }

  // -------------------------------------------------------------------------
  // Private: detect switch signals from session state
  // -------------------------------------------------------------------------

  private detectSwitchSignals(session: CrucibleSession): SwitchSignal[] {
    const signals: SwitchSignal[] = [];
    const rounds = session.rounds;
    if (rounds.length === 0) return signals;

    const now = Date.now();
    const lastRound = last(rounds)!;

    // --- same_weakness_3x ---
    const dominantWeakness = this.dominantRecentWeakness(session, REPEAT_WEAKNESS_ROUNDS);
    if (
      dominantWeakness &&
      this.isRepeatTargeting(session, dominantWeakness, REPEAT_WEAKNESS_ROUNDS)
    ) {
      signals.push({
        type: 'same_weakness_3x',
        detectedAt: now,
        round: lastRound.roundNumber,
      });
    }

    // --- stagnant ---
    if (rounds.length >= STAGNATION_ROUNDS) {
      const window = rounds.slice(-STAGNATION_ROUNDS);
      const firstVerdict = window[0].verdictScore;
      const allClose = window.every(
        (r) => Math.abs(r.verdictScore - firstVerdict) <= STAGNATION_VERDICT_THRESHOLD,
      );
      if (allClose) {
        signals.push({
          type: 'stagnant',
          detectedAt: now,
          round: lastRound.roundNumber,
        });
      }
    }

    // --- breakthrough ---
    if (rounds.length >= 2) {
      const delta = verdictDeltaInRound(session, rounds.length - 1);
      if (delta >= BREAKTHROUGH_VERDICT_DELTA) {
        signals.push({
          type: 'breakthrough',
          detectedAt: now,
          round: lastRound.roundNumber,
        });
      }
    }

    // --- overwhelmed ---
    if (rounds.length >= OVERWHELM_ROUNDS) {
      const window = rounds.slice(-OVERWHELM_ROUNDS);
      if (window.every((r) => r.weaknessCount > OVERWHELM_WEAKNESS_COUNT)) {
        signals.push({
          type: 'overwhelmed',
          detectedAt: now,
          round: lastRound.roundNumber,
        });
      }
    }

    // --- frustration_detected ---
    if (lastRound.userSignals.includes('frustration')) {
      signals.push({
        type: 'frustration_detected',
        detectedAt: now,
        round: lastRound.roundNumber,
      });
    }

    // --- improving_fast ---
    if (rounds.length >= 3) {
      const window = rounds.slice(-3);
      const deltas = window.slice(1).map((r, i) => r.verdictScore - window[i].verdictScore);
      const allPositive = deltas.every((d) => d > 0.04);
      if (allPositive) {
        signals.push({
          type: 'improving_fast',
          detectedAt: now,
          round: lastRound.roundNumber,
        });
      }
    }

    return signals;
  }

  // -------------------------------------------------------------------------
  // Private: has Atlas targeted the same weakness type N times in a row?
  // -------------------------------------------------------------------------

  private isRepeatTargeting(
    session: CrucibleSession,
    weaknessType: string,
    threshold: number,
  ): boolean {
    const rounds = session.rounds;
    if (rounds.length < threshold) return false;

    const window = rounds.slice(-threshold);
    return window.every((r) => r.primaryWeakness === weaknessType);
  }

  // -------------------------------------------------------------------------
  // Private: what is the most common weakness in the last N rounds?
  // -------------------------------------------------------------------------

  private dominantRecentWeakness(session: CrucibleSession, n: number): string {
    const window = recentRounds(session, n);
    if (window.length === 0) return '';

    const counts: Record<string, number> = {};
    for (const r of window) {
      counts[r.primaryWeakness] = (counts[r.primaryWeakness] ?? 0) + 1;
    }

    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  }

  // -------------------------------------------------------------------------
  // Public: build mode-specific prompt injection
  // -------------------------------------------------------------------------

  buildModeInstruction(mode: CrucibleMode, state: DifficultyState): string {
    const dominantWeakness = this.extractDominantWeaknessFromHistory(state);

    switch (mode) {
      case 'calibrating':
        return [
          'You are in calibration mode. Your primary goal this round is not to win — it is to understand.',
          'Ask one precise clarifying question embedded in your counter. Surface two weaknesses at most.',
          'Note which argument types the user deploys. Do not use your strongest opposition yet.',
        ].join(' ');

      case 'building':
        return [
          'The user is struggling. Your opposition should be constructive, not crushing.',
          'Identify the two most important weaknesses only. Before your counter, name something genuinely strong in their argument.',
          'Frame your attack as a question they should try to answer, not a verdict.',
        ].join(' ');

      case 'challenging':
        return [
          'The user is holding their own. Raise the stakes.',
          'You may identify up to four weaknesses. Prioritise the deepest structural flaw, not surface errors.',
          'Do not soften your counter — they can handle precision. Push harder on the strongest part of their argument.',
        ].join(' ');

      case 'relentless':
        return [
          'No mercy. The user has demonstrated they can handle maximum pressure.',
          'Find every weakness. Prioritise the ones they have historically been weakest on.',
          'Do not acknowledge strengths unless doing so makes your counter sharper.',
          'If they make a good point, use it against them.',
        ].join(' ');

      case 'switch':
        return [
          `You have targeted the same weakness (${dominantWeakness || 'the same flaw'}) repeatedly.`,
          'This approach is not producing development. Switch to a different angle entirely.',
          'Attack a different dimension of their argument — its premises, its evidence, its implications, or its framing.',
          'Do not mention the previous weakness this round.',
        ].join(' ');

      case 'relent':
        return [
          'The user is showing signs of being overwhelmed.',
          'Do not identify more than 2 weaknesses this round.',
          'Find something genuinely strong in their argument and acknowledge it precisely before your counter.',
          'Your tone should feel like a sparring partner stepping back, not capitulating.',
          'End with a single, specific question they can engage with.',
        ].join(' ');

      case 'consolidate':
        return [
          'The user just made a significant breakthrough.',
          'Do not immediately pile on. Let them articulate the insight first.',
          'Your counter should acknowledge the advance explicitly and precisely before finding the next frontier.',
          'Identify one — only one — next-level weakness or unexplored implication.',
          'The goal this round is to reward the breakthrough while opening the next challenge.',
        ].join(' ');

      default: {
        const _exhaustive: never = mode;
        return '';
      }
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers for buildModeInstruction
  // -------------------------------------------------------------------------

  private extractDominantWeaknessFromHistory(state: DifficultyState): string {
    const recent = state.pressureHistory.slice(-REPEAT_WEAKNESS_ROUNDS);
    // pressureHistory doesn't store the weakness type directly; extract from switchSignals context
    // In a full implementation this would reference the session rounds.
    // Fallback: look at the last switch signal description if available.
    if (state.switchSignals.length === 0) return '';
    // Return a placeholder that the caller can substitute — the real value comes from detectSwitchSignals
    return 'the repeated weakness';
  }
}
