/**
 * identityDiffService.ts — Phase 0.8: Identity evolution tracking.
 *
 * Writes append-only diffs to identity_diff_log and reads history back.
 * This is a leaf-level service (no imports from other Phase 0.8 files).
 *
 * Design invariants:
 *   - All Supabase calls are guarded by env.memoryLayerEnabled.
 *   - Returns graceful defaults when storage is unavailable.
 *   - No throwing at the outer layer — callers rely on this for audit writes.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import { type IdentityDomain } from './identityGovernance.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type DiffType =
  | 'added'
  | 'strengthened'
  | 'weakened'
  | 'corrected'
  | 'scoped'
  | 'contradicted'
  | 'demoted'
  | 'removed'
  | 'reactivated';

export interface IdentityDiffRow {
  id: string;
  userId: string;
  domain: IdentityDomain;
  diffType: DiffType;
  beforePayload?: unknown;
  afterPayload?: unknown;
  reason?: string;
  evidenceMemoryIds: string[];
  triggeredBy: string;
  createdAt: Date;
}

interface DiffWriteInput {
  userId: string;
  domain: IdentityDomain;
  diffType: DiffType;
  beforePayload?: unknown;
  afterPayload?: unknown;
  reason: string;
  evidenceMemoryIds?: string[];
  triggeredBy: string;
}

// ── DB row shape (snake_case from Supabase) ──────────────────────────────────

interface RawDiffRow {
  id: string;
  user_id: string;
  domain: string;
  diff_type: string;
  before_payload?: unknown;
  after_payload?: unknown;
  reason?: string;
  evidence_memory_ids?: unknown;
  triggered_by?: string;
  created_at: string;
}

// ── Write ────────────────────────────────────────────────────────────────────

/**
 * Insert a single identity diff entry into identity_diff_log.
 * Returns the newly-created id, or an empty string on failure.
 */
export async function writeDiff(input: DiffWriteInput): Promise<string> {
  if (!env.memoryLayerEnabled) return '';
  if (!process.env.SUPABASE_URL) return '';

  const id = randomUUID();

  try {
    const res = await supabaseRest<RawDiffRow[]>(
      'POST',
      'identity_diff_log',
      {
        id,
        user_id: input.userId,
        domain: input.domain,
        diff_type: input.diffType,
        before_payload: input.beforePayload ?? null,
        after_payload: input.afterPayload ?? null,
        reason: input.reason ?? null,
        evidence_memory_ids: JSON.stringify(input.evidenceMemoryIds ?? []),
        triggered_by: input.triggeredBy,
      },
      { Prefer: 'return=minimal' },
    );

    if (!res.ok) {
      console.warn('[identityDiffService] writeDiff failed:', res.status);
      return '';
    }

    return id;
  } catch (err) {
    console.warn('[identityDiffService] writeDiff threw:', err instanceof Error ? err.message : err);
    return '';
  }
}

// ── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetch diff history for a user, optionally filtered by domain.
 * Results are ordered by created_at DESC.
 */
export async function getDiffHistory(
  userId: string,
  domain?: IdentityDomain,
  limit = 50,
): Promise<IdentityDiffRow[]> {
  if (!env.memoryLayerEnabled) return [];
  if (!process.env.SUPABASE_URL) return [];
  if (!userId) return [];

  try {
    const domainFilter = domain ? `&domain=eq.${encodeURIComponent(domain)}` : '';
    const res = await supabaseRest<RawDiffRow[]>(
      'GET',
      `identity_diff_log?user_id=eq.${encodeURIComponent(userId)}${domainFilter}&order=created_at.desc&limit=${limit}`,
    );

    if (!res.ok || !Array.isArray(res.data)) return [];

    return res.data.map(rowToIdentityDiff);
  } catch (err) {
    console.warn('[identityDiffService] getDiffHistory threw:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ── Mapper ───────────────────────────────────────────────────────────────────

function rowToIdentityDiff(row: RawDiffRow): IdentityDiffRow {
  return {
    id: row.id,
    userId: row.user_id,
    domain: row.domain as IdentityDomain,
    diffType: row.diff_type as DiffType,
    beforePayload: row.before_payload ?? undefined,
    afterPayload: row.after_payload ?? undefined,
    reason: row.reason ?? undefined,
    evidenceMemoryIds: Array.isArray(row.evidence_memory_ids)
      ? (row.evidence_memory_ids as string[])
      : [],
    triggeredBy: row.triggered_by ?? 'system',
    createdAt: new Date(row.created_at),
  };
}
