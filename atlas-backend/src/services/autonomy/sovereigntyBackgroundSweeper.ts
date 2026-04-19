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
import { runRetentionEnforcer } from '../../workers/retentionEnforcer.js';

let handle: ReturnType<typeof setInterval> | null = null;
let retentionHandle: ReturnType<typeof setInterval> | null = null;
let running = false;
let retentionRunning = false;

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

async function retentionTick(): Promise<void> {
  if (retentionRunning) return;
  if (!env.retentionEnforcerEnabled) return;
  retentionRunning = true;
  try {
    const report = await runRetentionEnforcer();
    if (report.skipped) return;
    console.info(
      `[sovereigntyBackgroundSweeper] retention policies_run=${report.policiesRun} records_affected=${report.recordsAffected} errors=${report.errors.length}`,
    );
  } catch (err) {
    console.error('[sovereigntyBackgroundSweeper] retention error:', err);
  } finally {
    retentionRunning = false;
  }
}

export function startSovereigntyBackgroundSweeper(): void {
  if (handle) return;
  // Kick off one immediate pass so admins can see first events quickly, then schedule.
  tick().catch(() => {});
  handle = setInterval(() => {
    tick().catch(() => {});
  }, env.sovereigntyBackgroundSweeperTickMs);

  if (!retentionHandle && env.retentionEnforcerEnabled) {
    retentionTick().catch(() => {});
    retentionHandle = setInterval(() => {
      retentionTick().catch(() => {});
    }, env.retentionEnforcerTickMs);
  }
}

export function stopSovereigntyBackgroundSweeper(): void {
  if (handle) {
    clearInterval(handle);
    handle = null;
  }
  if (retentionHandle) {
    clearInterval(retentionHandle);
    retentionHandle = null;
  }
}
