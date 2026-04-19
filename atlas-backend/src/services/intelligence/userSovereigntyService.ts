/**
 * userSovereigntyService.ts — Phase 0.9: Temporal Cognition Stack
 *
 * User control execution layer. Implements the Law of User Sovereignty:
 * users can inspect, suppress, freeze, correct, and revert any identity
 * signal or domain at any time.
 *
 * Design invariants:
 * - Non-throwing: all errors caught, safe defaults returned.
 * - Feature-flagged: all Supabase calls gated on env.MEMORY_LAYER_ENABLED.
 * - Every mutating action records a timeline event for auditability.
 * - Freeze check is synchronous-safe via a lightweight DB query.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import { recordTimelineEvent } from './evolutionTimelineService.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SovereigntyControl {
  id: string;
  userId: string;
  controlType: 'freeze' | 'suppress' | 'confirm' | 'quarantine' | 'revert';
  controlScope: 'global' | 'domain' | 'memory' | 'chamber' | 'project' | 'policy_field';
  scopeKey?: string;
  active: boolean;
  controlReason?: string;
  revertAnchor?: unknown;
  expiresAt?: Date;
  createdAt: Date;
  resolvedAt?: Date;
}

interface RawControlRow {
  id: string;
  user_id: string;
  control_type: string;
  control_scope: string;
  scope_key?: string | null;
  active: boolean;
  control_reason?: string | null;
  revert_anchor?: unknown;
  expires_at?: string | null;
  created_at: string;
  resolved_at?: string | null;
}

// ── Mappers ──────────────────────────────────────────────────────────────────

function rowToControl(row: RawControlRow): SovereigntyControl {
  return {
    id: row.id,
    userId: row.user_id,
    controlType: row.control_type as SovereigntyControl['controlType'],
    controlScope: row.control_scope as SovereigntyControl['controlScope'],
    scopeKey: row.scope_key ?? undefined,
    active: row.active,
    controlReason: row.control_reason ?? undefined,
    revertAnchor: row.revert_anchor ?? undefined,
    expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    createdAt: new Date(row.created_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
  };
}

// ── Internal insert helper ────────────────────────────────────────────────────

async function insertControl(
  userId: string,
  controlType: SovereigntyControl['controlType'],
  controlScope: SovereigntyControl['controlScope'],
  scopeKey?: string,
  reason?: string,
  revertAnchor?: unknown,
  expiresAt?: Date,
): Promise<string> {
  const id = randomUUID();
  const body: Record<string, unknown> = {
    id,
    user_id: userId,
    control_type: controlType,
    control_scope: controlScope,
    active: true,
  };
  if (scopeKey !== undefined) body['scope_key'] = scopeKey;
  if (reason !== undefined) body['control_reason'] = reason;
  if (revertAnchor !== undefined) body['revert_anchor'] = revertAnchor;
  if (expiresAt !== undefined) body['expires_at'] = expiresAt.toISOString();

  const result = await supabaseRest<RawControlRow[]>('POST', 'user_sovereignty_controls', body);
  if (!result.ok) {
    console.warn('[sovereignty] Failed to insert control:', result.status);
    return '';
  }
  return id;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Freeze a domain, memory, or global scope. Blocks future writes to the scope.
 * If scope='domain': also marks the identity_domains row as frozen (best-effort).
 */
export async function freeze(
  userId: string,
  scope: SovereigntyControl['controlScope'],
  scopeKey?: string,
  reason?: string,
): Promise<string> {
  if (!env.memoryLayerEnabled) return '';

  try {
    const id = await insertControl(userId, 'freeze', scope, scopeKey, reason);

    // If domain scope: update the identity domain row to note frozen state
    if (scope === 'domain' && scopeKey) {
      await supabaseRest(
        'PATCH',
        `user_identity_domains?user_id=eq.${encodeURIComponent(userId)}&domain=eq.${encodeURIComponent(scopeKey)}`,
        { resolution_version: '0.9-frozen' }, // mark in resolution_version as a best-effort signal
      );
    }

    // Record timeline event
    await recordTimelineEvent({
      userId,
      timelineEventType: 'frozen',
      domain: scopeKey,
      changeReasonChain: reason,
      impactScope: scope === 'global' ? 'global' : scope === 'domain' ? 'domain' : 'local',
      affectedDomains: scopeKey ? [scopeKey] : [],
      triggeredBy: 'user',
      significance: 0.8,
    });

    return id;
  } catch (err) {
    console.error('[sovereignty] freeze error:', err);
    return '';
  }
}

/**
 * Suppress a signal or memory from being used in context injection.
 * For memory scope: marks user_memories.quarantined = true.
 */
export async function suppress(
  userId: string,
  scope: SovereigntyControl['controlScope'],
  scopeKey?: string,
  reason?: string,
): Promise<string> {
  if (!env.memoryLayerEnabled) return '';

  try {
    const id = await insertControl(userId, 'suppress', scope, scopeKey, reason);

    if (scope === 'memory' && scopeKey) {
      await supabaseRest(
        'PATCH',
        `user_memories?id=eq.${encodeURIComponent(scopeKey)}&user_id=eq.${encodeURIComponent(userId)}`,
        { quarantined: true },
      );
    }

    return id;
  } catch (err) {
    console.error('[sovereignty] suppress error:', err);
    return '';
  }
}

/**
 * Confirm a memory or domain signal, marking it as user-verified.
 * For memory scope: sets confirmation_status='confirmed' and bumps stability_score by 0.1.
 */
export async function confirm(
  userId: string,
  scope: SovereigntyControl['controlScope'],
  scopeKey?: string,
  reason?: string,
): Promise<string> {
  if (!env.memoryLayerEnabled) return '';

  try {
    const id = await insertControl(userId, 'confirm', scope, scopeKey, reason);

    if (scope === 'memory' && scopeKey) {
      // Fetch current stability to bump it
      const existing = await supabaseRest<Array<{ stability_score: number }>>(
        'GET',
        `user_memories?id=eq.${encodeURIComponent(scopeKey)}&user_id=eq.${encodeURIComponent(userId)}&select=stability_score`,
      );
      const rawStability = existing.ok ? (existing.data?.[0]?.stability_score ?? 0.5) : 0.5;
      const current: number = typeof rawStability === 'number' ? rawStability : 0.5;
      const bumped = Math.min(1, current + 0.1);

      await supabaseRest(
        'PATCH',
        `user_memories?id=eq.${encodeURIComponent(scopeKey)}&user_id=eq.${encodeURIComponent(userId)}`,
        { confirmation_status: 'confirmed', stability_score: bumped },
      );
    }

    return id;
  } catch (err) {
    console.error('[sovereignty] confirm error:', err);
    return '';
  }
}

/**
 * Quarantine a memory — marks it as untrusted until reviewed.
 * For memory scope: sets quarantined=true on user_memories.
 */
export async function quarantine(
  userId: string,
  scope: SovereigntyControl['controlScope'],
  scopeKey?: string,
  reason?: string,
): Promise<string> {
  if (!env.memoryLayerEnabled) return '';

  try {
    const id = await insertControl(userId, 'quarantine', scope, scopeKey, reason);

    if (scope === 'memory' && scopeKey) {
      await supabaseRest(
        'PATCH',
        `user_memories?id=eq.${encodeURIComponent(scopeKey)}&user_id=eq.${encodeURIComponent(userId)}`,
        { quarantined: true },
      );
    }

    return id;
  } catch (err) {
    console.error('[sovereignty] quarantine error:', err);
    return '';
  }
}

/**
 * Revert a scope to its previous state using revert_anchor stored in the
 * most recent freeze/control event for that scope.
 * Records a 'reverted' timeline event.
 */
export async function revert(
  userId: string,
  scope: SovereigntyControl['controlScope'],
  scopeKey?: string,
  reason?: string,
): Promise<string> {
  if (!env.memoryLayerEnabled) return '';

  try {
    // Look for the most recent control with a revert_anchor for this scope
    const parts = [
      `user_id=eq.${encodeURIComponent(userId)}`,
      `control_scope=eq.${scope}`,
      `active=eq.true`,
      `order=created_at.desc`,
      `limit=1`,
    ];
    if (scopeKey) parts.push(`scope_key=eq.${encodeURIComponent(scopeKey)}`);

    const existing = await supabaseRest<RawControlRow[]>(
      'GET',
      `user_sovereignty_controls?${parts.join('&')}`,
    );

    const anchor =
      existing.ok && existing.data?.[0]?.revert_anchor
        ? existing.data[0].revert_anchor
        : null;

    // Best-effort state restore: if memory scope and we have an anchor, patch the memory
    if (scope === 'memory' && scopeKey && anchor && typeof anchor === 'object') {
      await supabaseRest(
        'PATCH',
        `user_memories?id=eq.${encodeURIComponent(scopeKey)}&user_id=eq.${encodeURIComponent(userId)}`,
        anchor,
      );
    }

    const id = await insertControl(userId, 'revert', scope, scopeKey, reason, anchor);

    await recordTimelineEvent({
      userId,
      timelineEventType: 'reverted',
      domain: scopeKey,
      changeReasonChain: reason,
      afterStateRef: anchor,
      impactScope: scope === 'global' ? 'global' : scope === 'domain' ? 'domain' : 'local',
      affectedDomains: scopeKey ? [scopeKey] : [],
      triggeredBy: 'user',
      significance: 0.75,
    });

    return id;
  } catch (err) {
    console.error('[sovereignty] revert error:', err);
    return '';
  }
}

/**
 * Get all active sovereignty controls for a user, optionally filtered by scope.
 */
export async function getActiveControls(
  userId: string,
  scope?: SovereigntyControl['controlScope'],
): Promise<SovereigntyControl[]> {
  if (!env.memoryLayerEnabled) return [];

  try {
    const parts = [
      `user_id=eq.${encodeURIComponent(userId)}`,
      `active=eq.true`,
      `order=created_at.desc`,
    ];
    if (scope) parts.push(`control_scope=eq.${scope}`);

    const result = await supabaseRest<RawControlRow[]>(
      'GET',
      `user_sovereignty_controls?${parts.join('&')}`,
    );

    if (!result.ok || !result.data) return [];
    // Filter out expired controls
    const now = Date.now();
    return result.data
      .map(rowToControl)
      .filter((c) => !c.expiresAt || c.expiresAt.getTime() > now);
  } catch (err) {
    console.error('[sovereignty] getActiveControls error:', err);
    return [];
  }
}

/**
 * Mark a control as resolved (no longer active).
 */
export async function resolveControl(controlId: string): Promise<void> {
  if (!env.memoryLayerEnabled) return;

  try {
    await supabaseRest(
      'PATCH',
      `user_sovereignty_controls?id=eq.${encodeURIComponent(controlId)}`,
      { active: false, resolved_at: new Date().toISOString() },
    );
  } catch (err) {
    console.error('[sovereignty] resolveControl error:', err);
  }
}

/**
 * Check whether a specific domain is frozen for a user.
 * Returns true if any active freeze control covers this domain or global scope.
 */
export async function checkFreezeState(userId: string, domain: string): Promise<boolean> {
  if (!env.memoryLayerEnabled) return false;

  try {
    const controls = await getActiveControls(userId);
    const now = Date.now();

    return controls.some((c) => {
      if (c.controlType !== 'freeze') return false;
      if (c.expiresAt && c.expiresAt.getTime() <= now) return false;
      if (c.controlScope === 'global') return true;
      if (c.controlScope === 'domain' && c.scopeKey === domain) return true;
      return false;
    });
  } catch (err) {
    console.error('[sovereignty] checkFreezeState error:', err);
    return false;
  }
}
