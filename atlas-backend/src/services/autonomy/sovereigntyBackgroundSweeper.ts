/**
 * sovereigntyBackgroundSweeper.ts — Phase 0.988 / 0.99: Governed background agency.
 *
 * Runs on a low-frequency tick (default 30m). For each configured user_id:
 *   1. Runs runScheduledWatcherSweep — real detection of stalls, contradictions,
 *      staleness, commitment backlog — persists watcher_events.
 *   2. Runs runAndPersistFullEvalSuite — persists constitutional_eval_results.
 *
 * Discipline:
 *   - Opt-in via env.sovereigntyBackgroundSweeperEnabled.
 *   - Scope-limited via env.sovereigntyBackgroundSweeperUserIds — empty list is a no-op.
 *   - Never throws. All errors are logged and the tick continues.
 *   - Rate-limited: one full sweep per user per tick interval.
 *   - Quiet-queue discipline: writes governance events but does NOT notify or email.
 */

import { env } from '../../config/env.js';
import { runScheduledWatcherSweep } from '../intelligence/watcherFrameworkService.js';
import { runAndPersistFullEvalSuite } from '../intelligence/constitutionalEvalService.js';

let handle: ReturnType<typeof setInterval> | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  if (!env.sovereigntyBackgroundSweeperEnabled) return;
  const userIds = env.sovereigntyBackgroundSweeperUserIds;
  if (userIds.length === 0) return;

  running = true;
  try {
    for (const userId of userIds) {
      try {
        const sweep = await runScheduledWatcherSweep(userId);
        console.info(
          `[sovereigntyBackgroundSweeper] watchers user=${userId} detected=${sweep.detected} suppressed=${sweep.suppressed}`,
        );
      } catch (err) {
        console.error('[sovereigntyBackgroundSweeper] watcher error:', err);
      }
      try {
        const results = await runAndPersistFullEvalSuite(userId);
        const passed = results.filter((r) => r.passed).length;
        console.info(
          `[sovereigntyBackgroundSweeper] eval user=${userId} passed=${passed}/${results.length}`,
        );
      } catch (err) {
        console.error('[sovereigntyBackgroundSweeper] eval error:', err);
      }
    }
  } finally {
    running = false;
  }
}

export function startSovereigntyBackgroundSweeper(): void {
  if (handle) return;
  // Kick off one immediate pass so admins can see first events quickly, then schedule.
  tick().catch(() => {});
  handle = setInterval(() => {
    tick().catch(() => {});
  }, env.sovereigntyBackgroundSweeperTickMs);
}

export function stopSovereigntyBackgroundSweeper(): void {
  if (handle) {
    clearInterval(handle);
    handle = null;
  }
}
