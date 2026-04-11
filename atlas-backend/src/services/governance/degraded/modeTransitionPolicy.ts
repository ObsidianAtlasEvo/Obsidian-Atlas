/**
 * Mode Transition Policy
 * Phase 4 Section 3 — Evaluates whether the system should transition between
 * degraded modes based on health signals. Enforces adjacent-only transitions
 * and hysteresis via consecutive OK counting.
 */

import type { DegradedMode, HealthSignal } from './degradedModeOracle.js';

/** Ordered severity levels for adjacency checks. */
const MODE_ORDER: readonly DegradedMode[] = [
  'NOMINAL',
  'DEGRADED_1',
  'DEGRADED_2',
  'DEGRADED_3',
  'OFFLINE',
] as const;

/** Number of consecutive all-OK polls required before upgrading one level. */
const CONSECUTIVE_OK_THRESHOLD = 5;

/** Number of critical (failed) signals required to trigger a downgrade. */
const CRITICAL_FAILURE_THRESHOLD = 3;

/** Tracks consecutive polls where all signals were healthy. */
let consecutiveOkCount = 0;

/**
 * Check whether a transition between two modes is valid.
 * Only adjacent transitions (one step up or down) are permitted.
 */
export function canTransition(from: DegradedMode, to: DegradedMode): boolean {
  const fromIdx = MODE_ORDER.indexOf(from);
  const toIdx = MODE_ORDER.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return false;
  return Math.abs(fromIdx - toIdx) === 1;
}

/**
 * Evaluate whether a mode transition should occur based on current health signals.
 *
 * Downgrade: If the number of failed signals >= CRITICAL_FAILURE_THRESHOLD, move
 * one step toward OFFLINE. The consecutive OK counter resets on any downgrade.
 *
 * Upgrade: If all signals are OK for CONSECUTIVE_OK_THRESHOLD consecutive polls,
 * move one step toward NOMINAL and reset the counter.
 *
 * No mode is ever skipped — transitions are always adjacent.
 */
export function evaluateTransition(
  signals: HealthSignal[],
  currentMode: DegradedMode
): DegradedMode {
  const failedCount = signals.filter((s) => !s.ok).length;
  const currentIdx = MODE_ORDER.indexOf(currentMode);

  // Downgrade check: 3+ critical failures → step toward OFFLINE
  if (failedCount >= CRITICAL_FAILURE_THRESHOLD) {
    consecutiveOkCount = 0;
    const nextIdx = currentIdx + 1;
    if (nextIdx < MODE_ORDER.length) {
      return MODE_ORDER[nextIdx];
    }
    return currentMode; // already at OFFLINE
  }

  // Track consecutive OK polls
  if (failedCount === 0) {
    consecutiveOkCount++;
  } else {
    consecutiveOkCount = 0;
  }

  // Upgrade check: 5 consecutive all-OK polls → step toward NOMINAL
  if (consecutiveOkCount >= CONSECUTIVE_OK_THRESHOLD && currentIdx > 0) {
    consecutiveOkCount = 0;
    return MODE_ORDER[currentIdx - 1];
  }

  return currentMode;
}

/**
 * Reset internal state. Useful for testing.
 */
export function resetConsecutiveOkCount(): void {
  consecutiveOkCount = 0;
}
