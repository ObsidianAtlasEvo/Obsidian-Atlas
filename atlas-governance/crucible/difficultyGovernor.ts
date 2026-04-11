/**
 * Atlas Crucible Difficulty Governor
 * Phase 2 Governance
 *
 * 7 difficulty modes with adaptive switching logic.
 * Prevents Atlas from exploiting a known weakness repeatedly.
 * Knows when to pressure, relent, consolidate, or switch modes.
 */

export type DifficultyMode =
  | 'calibrating'    // first session — establishing baseline
  | 'probing'        // exploring weak points methodically
  | 'pressure'       // sustained challenge on identified weakness
  | 'consolidation'  // letting user integrate recent progress
  | 'synthesis'      // connecting dots across domains
  | 'adversarial'    // maximum challenge, no quarter
  | 'recovery';      // user is struggling — ease off, rebuild confidence

export interface SessionMetrics {
  userId: string;
  sessionId: string;
  totalExchanges: number;
  correctDefenses: number;
  failedDefenses: number;
  surrenders: number; // user explicitly backed down
  consecutiveCorrect: number;
  consecutiveIncorrect: number;
  exploitedWeaknessCount: number; // times Atlas hit the same weakness repeatedly
  lastModeChange: string;
  dominantWeakness?: string; // most frequently failed domain
}

export interface GovernorDecision {
  mode: DifficultyMode;
  reason: string;
  promptInjection: string;
  switchTriggered: boolean;
}

// How many consecutive same-weakness hits before governor forces a mode switch
const MAX_WEAKNESS_EXPLOITATION = 3;

// Consecutive correct defenses to trigger mode escalation
const ESCALATION_THRESHOLD = 4;

// Consecutive failures to trigger recovery mode
const RECOVERY_THRESHOLD = 3;

const sessionStore: Map<string, SessionMetrics> = new Map();

const PROMPT_INJECTIONS: Record<DifficultyMode, string> = {
  calibrating: 'Explore multiple angles without committing to sustained pressure. Identify where the user has gaps.',
  probing: 'Methodically test different domains. Note where responses become hesitant or thin.',
  pressure: 'Apply sustained pressure on the identified weakness. Vary the angle but maintain the domain.',
  consolidation: 'Ease pressure. Ask synthesis questions that let the user demonstrate what they have integrated.',
  synthesis: 'Push the user to connect their arguments across domains into a coherent position.',
  adversarial: 'Maximize challenge. Use the sharpest counter-arguments available. No scaffolding.',
  recovery: 'Reduce pressure significantly. Ask questions the user can answer well. Rebuild momentum.',
};

const MODE_DESCRIPTIONS: Record<DifficultyMode, string> = {
  calibrating: 'Baseline calibration',
  probing: 'Methodical exploration',
  pressure: 'Targeted pressure',
  consolidation: 'Integration consolidation',
  synthesis: 'Cross-domain synthesis',
  adversarial: 'Maximum adversarial',
  recovery: 'Recovery mode',
};

function getMetrics(userId: string, sessionId: string): SessionMetrics {
  const key = `${userId}:${sessionId}`;
  if (!sessionStore.has(key)) {
    sessionStore.set(key, {
      userId,
      sessionId,
      totalExchanges: 0,
      correctDefenses: 0,
      failedDefenses: 0,
      surrenders: 0,
      consecutiveCorrect: 0,
      consecutiveIncorrect: 0,
      exploitedWeaknessCount: 0,
      lastModeChange: new Date().toISOString(),
    });
  }
  return sessionStore.get(key)!;
}

export function recordExchange(
  userId: string,
  sessionId: string,
  outcome: 'correct' | 'failed' | 'surrender',
  domain?: string
): void {
  const metrics = getMetrics(userId, sessionId);
  metrics.totalExchanges++;

  if (outcome === 'correct') {
    metrics.correctDefenses++;
    metrics.consecutiveCorrect++;
    metrics.consecutiveIncorrect = 0;
  } else if (outcome === 'failed') {
    metrics.failedDefenses++;
    metrics.consecutiveIncorrect++;
    metrics.consecutiveCorrect = 0;
    if (domain && domain === metrics.dominantWeakness) {
      metrics.exploitedWeaknessCount++;
    } else if (domain) {
      metrics.dominantWeakness = domain;
      metrics.exploitedWeaknessCount = 1;
    }
  } else {
    metrics.surrenders++;
    metrics.consecutiveIncorrect++;
    metrics.consecutiveCorrect = 0;
  }
}

/**
 * Assess the current session and return the appropriate difficulty mode with prompt injection.
 */
export function assessMode(
  userId: string,
  sessionId: string,
  currentMode: DifficultyMode
): GovernorDecision {
  const metrics = getMetrics(userId, sessionId);

  // Recovery: user has failed too many in a row
  if (metrics.consecutiveIncorrect >= RECOVERY_THRESHOLD) {
    return {
      mode: 'recovery',
      reason: `${metrics.consecutiveIncorrect} consecutive failures — switching to recovery to rebuild momentum.`,
      promptInjection: PROMPT_INJECTIONS.recovery,
      switchTriggered: currentMode !== 'recovery',
    };
  }

  // Break weakness exploitation loop
  if (metrics.exploitedWeaknessCount >= MAX_WEAKNESS_EXPLOITATION) {
    metrics.exploitedWeaknessCount = 0;
    const nextMode: DifficultyMode = metrics.consecutiveCorrect > 2 ? 'synthesis' : 'probing';
    return {
      mode: nextMode,
      reason: `Weakness "${metrics.dominantWeakness}" has been challenged ${MAX_WEAKNESS_EXPLOITATION} times. Rotating to avoid exploitation loop.`,
      promptInjection: PROMPT_INJECTIONS[nextMode],
      switchTriggered: true,
    };
  }

  // Escalation: user on a winning streak
  if (metrics.consecutiveCorrect >= ESCALATION_THRESHOLD) {
    const escalation = currentMode === 'calibrating' ? 'probing' :
                       currentMode === 'probing' ? 'pressure' :
                       currentMode === 'pressure' ? 'synthesis' :
                       currentMode === 'consolidation' ? 'adversarial' : 'adversarial';
    return {
      mode: escalation as DifficultyMode,
      reason: `${metrics.consecutiveCorrect} consecutive correct defenses — escalating to ${escalation}.`,
      promptInjection: PROMPT_INJECTIONS[escalation as DifficultyMode],
      switchTriggered: currentMode !== escalation,
    };
  }

  // Consolidation after pressure run
  if (currentMode === 'pressure' && metrics.consecutiveCorrect >= 2) {
    return {
      mode: 'consolidation',
      reason: 'User has defended well under pressure. Allowing consolidation.',
      promptInjection: PROMPT_INJECTIONS.consolidation,
      switchTriggered: true,
    };
  }

  // Stay in current mode
  return {
    mode: currentMode,
    reason: 'Current mode appropriate for session state.',
    promptInjection: PROMPT_INJECTIONS[currentMode],
    switchTriggered: false,
  };
}

export function getSessionMetrics(userId: string, sessionId: string): SessionMetrics {
  return { ...getMetrics(userId, sessionId) };
}

export function getModeDescription(mode: DifficultyMode): string {
  return MODE_DESCRIPTIONS[mode];
}

export function getDifficultyModes(): DifficultyMode[] {
  return ['calibrating', 'probing', 'pressure', 'consolidation', 'synthesis', 'adversarial', 'recovery'];
}
