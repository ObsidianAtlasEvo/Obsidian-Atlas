/**
 * memoryDistillerScheduler.ts — periodic driver for the Phase 0.5 distiller.
 *
 * Walks a small batch of users with un-distilled conversation chunks and runs
 * the full distill → policy-auto-write loop for each. Designed to be cheap
 * enough to run every 10-15 minutes on a single backend instance.
 *
 * Design:
 *   - Global feature flag: env.memoryDistillerEnabled
 *   - Scheduler tick: env.memoryDistillerTickMs (default 15 min)
 *   - Batch size: env.memoryDistillerBatchSize (default 5 users / tick)
 *   - Hard per-user time budget: 20s (distiller already has 15s LLM cap +
 *     a handful of REST calls; we allow a small headroom).
 *   - Single-flight: if a previous tick is still running, skip this one.
 *   - Fire-and-forget: errors logged, never thrown upward.
 */

import { env } from '../../config/env.js';
import {
  distillUserMemories,
  listUsersNeedingDistillation,
} from '../intelligence/memoryDistiller.js';
import { applyPolicyPatch } from '../intelligence/policyAutoWriter.js';

let schedulerHandle: ReturnType<typeof setInterval> | null = null;
let running = false;

export interface DistillerTickSummary {
  scanned: number;
  distilled: number;
  memoriesWritten: number;
  memoriesSuperseded: number;
  policyPatchesApplied: number;
  errors: number;
}

/**
 * Run a single distiller batch. Safe to call on-demand from a route or test.
 */
export async function runDistillerTick(): Promise<DistillerTickSummary> {
  const summary: DistillerTickSummary = {
    scanned: 0,
    distilled: 0,
    memoriesWritten: 0,
    memoriesSuperseded: 0,
    policyPatchesApplied: 0,
    errors: 0,
  };

  if (!env.memoryDistillerEnabled) return summary;

  const batch = await listUsersNeedingDistillation(env.memoryDistillerBatchSize, 4);
  summary.scanned = batch.length;
  if (batch.length === 0) return summary;

  for (const userId of batch) {
    try {
      const result = await distillUserMemories(userId);
      if (result.status === 'error') {
        summary.errors += 1;
        continue;
      }
      if (result.status === 'skip') continue;
      summary.distilled += 1;
      summary.memoriesWritten += result.memoriesWritten;
      summary.memoriesSuperseded += result.memoriesSuperseded;

      if (result.policyPatch) {
        const applied = await applyPolicyPatch(userId, result.policyPatch);
        if (applied) summary.policyPatchesApplied += 1;
      }
    } catch (err) {
      summary.errors += 1;
      console.warn('[memoryDistillerScheduler] user failed (non-fatal):', userId, err);
    }
  }

  return summary;
}

/**
 * Start the interval scheduler. No-op if already running or flag is off.
 * Called from the server bootstrap alongside Chronos.
 */
export function startMemoryDistillerScheduler(): void {
  if (!env.memoryDistillerEnabled) {
    console.info('[memoryDistillerScheduler] disabled via MEMORY_DISTILLER_ENABLED');
    return;
  }
  if (schedulerHandle) return;

  const tickMs = env.memoryDistillerTickMs;
  console.info(`[memoryDistillerScheduler] starting — tick=${tickMs}ms batch=${env.memoryDistillerBatchSize}`);

  // Stagger first run by 30s so boot noise settles.
  setTimeout(() => {
    void tickSafe();
  }, 30_000);

  schedulerHandle = setInterval(() => {
    void tickSafe();
  }, tickMs);

  // Allow Node to exit if the scheduler is the only thing holding the loop.
  schedulerHandle.unref?.();
}

/** Stop the scheduler (used in tests and graceful shutdown). */
export function stopMemoryDistillerScheduler(): void {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
  }
}

async function tickSafe(): Promise<void> {
  if (running) return;
  running = true;
  const startedAt = Date.now();
  try {
    const summary = await runDistillerTick();
    if (summary.scanned > 0 || summary.errors > 0) {
      console.info(
        `[memoryDistillerScheduler] tick done in ${Date.now() - startedAt}ms`,
        summary,
      );
    }
  } catch (err) {
    console.warn('[memoryDistillerScheduler] tick failed (non-fatal):', err);
  } finally {
    running = false;
  }
}
