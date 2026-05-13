/**
 * adaptationEventService — write-only telemetry for behavior adaptation events.
 *
 * Net-new in P4 (no SQLite predecessor — see PR #165 stop-report). All writes
 * are fire-and-forget; failures are logged but never thrown.
 *
 * Mode gating via storeFlags.adaptation():
 *   - 'sqlite' or 'dual': writes are no-ops (no SQLite source to dual-write to)
 *   - 'supabase':         writes to behavior_adaptation_events via supabaseRest()
 *
 * The 'dual' mode is intentionally a no-op here because there is no SQLite
 * mirror. Operators flip to 'supabase' as soon as the migration is applied.
 */

import { randomUUID } from 'node:crypto';
import { supabaseRest } from '../../db/supabase.js';
import { storeFlags } from '../../utils/storeFlags.js';

export type AdaptationType =
  | 'correction_applied'
  | 'drift_detected'
  | 'doctrine_updated'
  | 'feedback_incorporated'
  | 'policy_shift'
  | 'identity_signal_revision'
  | 'other';

export interface AdaptationEventInput {
  userId: string;
  adaptationType: AdaptationType;
  trigger?: string;
  triggerRefTable?: string;
  triggerRefId?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  rationale?: string;
  /** 0..1 inclusive; out-of-range values are clamped. Non-finite → 0.5. */
  significance?: number;
  metadata?: Record<string, unknown>;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

export async function recordAdaptationEvent(input: AdaptationEventInput): Promise<void> {
  const mode = storeFlags.adaptation();
  // 'sqlite' and 'dual' are no-ops here: there is no SQLite predecessor table.
  // Operators move directly to 'supabase' once mig 025 is applied.
  if (mode !== 'supabase') return;

  const row = {
    id: randomUUID(),
    user_id: input.userId,
    adaptation_type: input.adaptationType,
    trigger: input.trigger ?? null,
    trigger_ref_table: input.triggerRefTable ?? null,
    trigger_ref_id: input.triggerRefId ?? null,
    before_state: input.beforeState ?? {},
    after_state: input.afterState ?? {},
    rationale: input.rationale ?? null,
    significance: clamp01(input.significance ?? 0.5),
    metadata: input.metadata ?? {},
  };

  try {
    const res = await supabaseRest('POST', 'behavior_adaptation_events', row);
    if (!res.ok) {
      console.error(
        `[adaptationEventService] insert failed (non-fatal): status=${res.status ?? 'n/a'}`,
      );
    }
  } catch (err) {
    console.error('[adaptationEventService] insert threw (non-fatal):', err);
  }
}
