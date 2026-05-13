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
import { supabaseRest } from '../../db/supabase.js';

let handle: ReturnType<typeof setInterval> | null = null;
let retentionHandle: ReturnType<typeof setInterval> | null = null;
let running = false;
let retentionRunning = false;

// ---------------------------------------------------------------------------
// Digest-shaped watcher_events writer
//
// The legacy logger (watcherFrameworkService.logWatcherEvent) writes the
// existing event_class/watcher_type/description columns. The Background
// Intelligence Digest needs additional fields (event_type, title, entity_id,
// fingerprint, acknowledged). After each sweep we upsert digest-shaped rows
// for the events just detected, deduplicated by a 2h fingerprint.
//
// Failure modes: every error is caught and logged. The watcher pipeline is
// never blocked by digest persistence.
// ---------------------------------------------------------------------------

interface LegacyWatcherRow {
  id: string;
  watcher_type: string;
  event_class: string;
  severity: string;
  description: string;
  watcher_metadata: Record<string, unknown> | null;
  detected_at: string;
}

function pickEntityFromMetadata(meta: Record<string, unknown> | null): {
  entity_id: string | null;
  entity_type: string | null;
} {
  if (!meta) return { entity_id: null, entity_type: null };
  if (typeof meta.chain_id === 'string') return { entity_id: meta.chain_id, entity_type: 'chain' };
  if (typeof meta.contradiction_id === 'string')
    return { entity_id: meta.contradiction_id, entity_type: 'contradiction' };
  if (typeof meta.assumption_id === 'string')
    return { entity_id: meta.assumption_id, entity_type: 'assumption' };
  if (typeof meta.commitment_id === 'string')
    return { entity_id: meta.commitment_id, entity_type: 'commitment' };
  if (typeof meta.open_count === 'number')
    return { entity_id: `backlog:${meta.open_count}`, entity_type: 'commitment_backlog' };
  return { entity_id: null, entity_type: null };
}

function digestEventTypeFor(watcherType: string, eventClass: string): string {
  const wt = watcherType.toLowerCase();
  const ec = eventClass.toLowerCase();
  if (wt === 'commitment_tracker') return 'overdue_commitment';
  if (ec === 'stall') return 'stalled_chain';
  if (ec === 'staleness') return 'fragile_assumption';
  if (ec === 'violation' && wt === 'truth_spine') return 'contradiction';
  return ec || wt || 'other';
}

function digestSeverityFor(eventType: string, legacy: string): 'low' | 'medium' | 'high' {
  const t = eventType.toLowerCase();
  if (t.includes('stall') || t.includes('overdue') || t.includes('backlog')) return 'high';
  if (legacy === 'low') return 'low';
  return 'medium';
}

async function persistDigestEventsForUser(userId: string): Promise<void> {
  try {
    // Pull events detected in the last sweep window (cheap, single GET).
    const sinceIso = new Date(Date.now() - 10 * 60_000).toISOString();
    const recent = await supabaseRest<LegacyWatcherRow[]>(
      'GET',
      `watcher_events?user_id=eq.${encodeURIComponent(userId)}` +
        `&created_at=gte.${encodeURIComponent(sinceIso)}` +
        `&select=id,watcher_type,event_class,severity,description,watcher_metadata,detected_at`,
    );
    if (!recent.ok || !recent.data || recent.data.length === 0) return;

    for (const row of recent.data) {
      try {
        const eventType = digestEventTypeFor(row.watcher_type ?? '', row.event_class ?? '');
        const { entity_id, entity_type } = pickEntityFromMetadata(row.watcher_metadata);
        const fingerprint = `${userId}:${eventType}:${String(entity_id ?? 'none')}:${Math.floor(
          Date.now() / 7_200_000,
        )}`;
        const severity = digestSeverityFor(eventType, row.severity ?? 'medium');
        const title = (row.description ?? eventType).slice(0, 280);

        const upsert = await supabaseRest(
          'POST',
          'watcher_events',
          [
            {
              user_id: userId,
              event_type: eventType,
              entity_id,
              entity_type,
              severity,
              title,
              description: row.description ?? null,
              fingerprint,
              acknowledged: false,
            },
          ],
          { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        );
        if (!upsert.ok) {
          console.warn(
            `[sovereigntyBackgroundSweeper] digest upsert non-ok status=${upsert.status} user=${userId}`,
          );
        }
      } catch (innerErr) {
        console.warn('[sovereigntyBackgroundSweeper] digest upsert error:', innerErr);
      }
    }
  } catch (err) {
    console.warn('[sovereigntyBackgroundSweeper] persistDigestEventsForUser failed:', err);
  }
}

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
        // Mirror just-detected watcher events into the digest-shaped columns.
        // Wrapped: never throws, never blocks the existing pipeline.
        await persistDigestEventsForUser(userId);
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
