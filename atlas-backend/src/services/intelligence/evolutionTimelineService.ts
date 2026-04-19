/**
 * evolutionTimelineService.ts — Phase 0.9: Temporal Cognition Stack
 *
 * Tracks identity and memory evolution events in Supabase.
 * Law of Visible Evolution: preserve and expose how understanding changed.
 *
 * NOTE: Do NOT confuse with src/services/governance/evolutionTimelineService.ts
 * which uses SQLite and tracks system-level evolution events. This module
 * is specifically for identity/memory evolution in the Supabase memory layer.
 *
 * Design invariants:
 * - Non-throwing: all errors are caught and logged, never propagated.
 * - Feature-flagged: all Supabase calls gated on env.MEMORY_LAYER_ENABLED.
 * - Auto-clustering: events in the same domain within 10 min share a cluster.
 * - No LLM required: narrative generation is rule-based.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type TimelineEventType =
  | 'added'
  | 'clarified'
  | 'narrowed'
  | 'widened'
  | 'strengthened'
  | 'weakened'
  | 'corrected'
  | 'contradicted'
  | 'demoted'
  | 'frozen'
  | 'reverted'
  | 'deactivated';

export interface TimelineEntry {
  id: string;
  userId: string;
  changeClusterId?: string;
  timelineEventType: TimelineEventType;
  domain?: string;
  beforeStateRef?: unknown;
  afterStateRef?: unknown;
  changeReasonChain?: string;
  impactScope: 'local' | 'domain' | 'global';
  affectedDomains: string[];
  triggeredBy: string;
  significance: number;
  createdAt: Date;
}

interface RawTimelineRow {
  id: string;
  user_id: string;
  change_cluster_id?: string | null;
  timeline_event_type: string;
  domain?: string | null;
  before_state_ref?: unknown;
  after_state_ref?: unknown;
  change_reason_chain?: string | null;
  impact_scope: string;
  affected_domains: string[];
  triggered_by: string;
  significance: number;
  created_at: string;
}

// ── Mappers ──────────────────────────────────────────────────────────────────

function rowToEntry(row: RawTimelineRow): TimelineEntry {
  return {
    id: row.id,
    userId: row.user_id,
    changeClusterId: row.change_cluster_id ?? undefined,
    timelineEventType: row.timeline_event_type as TimelineEventType,
    domain: row.domain ?? undefined,
    beforeStateRef: row.before_state_ref ?? undefined,
    afterStateRef: row.after_state_ref ?? undefined,
    changeReasonChain: row.change_reason_chain ?? undefined,
    impactScope: (row.impact_scope ?? 'local') as TimelineEntry['impactScope'],
    affectedDomains: Array.isArray(row.affected_domains) ? row.affected_domains : [],
    triggeredBy: row.triggered_by ?? 'system',
    significance: row.significance ?? 0.5,
    createdAt: new Date(row.created_at),
  };
}

// ── Cluster resolution ───────────────────────────────────────────────────────
/**
 * Find or mint a cluster ID for a domain event.
 * If the same domain had an event in the last 10 minutes, reuse its cluster.
 * This is a best-effort lookup; on any error we return a fresh UUID.
 */
async function resolveClusterId(userId: string, domain?: string): Promise<string> {
  if (!domain) return randomUUID();

  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const qs = [
    `user_id=eq.${encodeURIComponent(userId)}`,
    `domain=eq.${encodeURIComponent(domain)}`,
    `created_at=gte.${tenMinAgo}`,
    `change_cluster_id=not.is.null`,
    `order=created_at.desc`,
    `limit=1`,
  ].join('&');

  const result = await supabaseRest<RawTimelineRow[]>('GET', `identity_evolution_timeline?${qs}`);
  if (result.ok && result.data && result.data.length > 0) {
    const existing = result.data[0]?.change_cluster_id;
    if (existing) return existing;
  }
  return randomUUID();
}

// ── Core API ─────────────────────────────────────────────────────────────────

/**
 * Record an identity/memory evolution timeline event.
 * Returns the new event ID, or '' on failure.
 */
export async function recordTimelineEvent(
  input: Omit<TimelineEntry, 'id' | 'createdAt'>,
): Promise<string> {
  if (!env.memoryLayerEnabled) return '';

  try {
    const clusterId = input.changeClusterId ?? (await resolveClusterId(input.userId, input.domain));

    const body = {
      id: randomUUID(),
      user_id: input.userId,
      change_cluster_id: clusterId,
      timeline_event_type: input.timelineEventType,
      domain: input.domain ?? null,
      before_state_ref: input.beforeStateRef ?? null,
      after_state_ref: input.afterStateRef ?? null,
      change_reason_chain: input.changeReasonChain ?? null,
      impact_scope: input.impactScope,
      affected_domains: input.affectedDomains,
      triggered_by: input.triggeredBy,
      significance: Math.max(0, Math.min(1, input.significance)),
    };

    const result = await supabaseRest<RawTimelineRow[]>(
      'POST',
      'identity_evolution_timeline',
      body,
    );

    if (!result.ok) {
      console.warn('[evolutionTimeline] Failed to record event:', result.status);
      return '';
    }

    return body.id;
  } catch (err) {
    console.error('[evolutionTimeline] recordTimelineEvent error:', err);
    return '';
  }
}

/**
 * Get timeline entries for a user, optionally filtered by domain and/or since date.
 */
export async function getTimeline(
  userId: string,
  options: { domain?: string; since?: Date; limit?: number } = {},
): Promise<TimelineEntry[]> {
  if (!env.memoryLayerEnabled) return [];

  try {
    const parts: string[] = [`user_id=eq.${encodeURIComponent(userId)}`];
    if (options.domain) parts.push(`domain=eq.${encodeURIComponent(options.domain)}`);
    if (options.since) parts.push(`created_at=gte.${options.since.toISOString()}`);
    parts.push(`order=created_at.desc`);
    parts.push(`limit=${options.limit ?? 100}`);

    const result = await supabaseRest<RawTimelineRow[]>(
      'GET',
      `identity_evolution_timeline?${parts.join('&')}`,
    );

    if (!result.ok || !result.data) return [];
    return result.data.map(rowToEntry);
  } catch (err) {
    console.error('[evolutionTimeline] getTimeline error:', err);
    return [];
  }
}

/**
 * Get all events belonging to a specific change cluster.
 */
export async function getChangeCluster(clusterId: string): Promise<TimelineEntry[]> {
  if (!env.memoryLayerEnabled) return [];

  try {
    const qs = [
      `change_cluster_id=eq.${encodeURIComponent(clusterId)}`,
      `order=created_at.asc`,
    ].join('&');

    const result = await supabaseRest<RawTimelineRow[]>(
      'GET',
      `identity_evolution_timeline?${qs}`,
    );

    if (!result.ok || !result.data) return [];
    return result.data.map(rowToEntry);
  } catch (err) {
    console.error('[evolutionTimeline] getChangeCluster error:', err);
    return [];
  }
}

// ── Narrative generation (rule-based, no LLM) ─────────────────────────────

const EVENT_DESCRIPTIONS: Record<TimelineEventType, string> = {
  added: 'new signal added',
  clarified: 'clarified',
  narrowed: 'scope narrowed',
  widened: 'scope widened',
  strengthened: 'confidence strengthened',
  weakened: 'confidence weakened',
  corrected: 'user correction applied',
  contradicted: 'contradiction detected',
  demoted: 'demoted to lower class',
  frozen: 'frozen by user',
  reverted: 'reverted to prior state',
  deactivated: 'deactivated',
};

/**
 * Compute a text narrative of what changed since a given date.
 * Pure rule-based; max ~200 words. No LLM required.
 */
export async function computeEvolutionNarrative(
  userId: string,
  since: Date,
): Promise<{ summary: string; keyChanges: TimelineEntry[] }> {
  const entries = await getTimeline(userId, { since, limit: 200 });

  if (entries.length === 0) {
    return { summary: 'No identity changes recorded in this period.', keyChanges: [] };
  }

  // Group by domain
  const byDomain = new Map<string, TimelineEntry[]>();
  for (const e of entries) {
    const key = e.domain ?? '(global)';
    const existing = byDomain.get(key) ?? [];
    existing.push(e);
    byDomain.set(key, existing);
  }

  // Key changes: highest-significance events per domain (top 1 per domain)
  const keyChanges: TimelineEntry[] = [];
  for (const [, domainEntries] of byDomain) {
    const sorted = [...domainEntries].sort((a, b) => b.significance - a.significance);
    if (sorted[0]) keyChanges.push(sorted[0]);
  }
  keyChanges.sort((a, b) => b.significance - a.significance);
  const topKey = keyChanges.slice(0, 5);

  // Count event types
  const typeCounts = new Map<TimelineEventType, number>();
  for (const e of entries) {
    typeCounts.set(e.timelineEventType, (typeCounts.get(e.timelineEventType) ?? 0) + 1);
  }

  // Build narrative
  const domainList = [...byDomain.keys()].join(', ');
  const corrections = typeCounts.get('corrected') ?? 0;
  const contradictions = typeCounts.get('contradicted') ?? 0;
  const frozen = typeCounts.get('frozen') ?? 0;

  const lines: string[] = [
    `Identity evolution since ${since.toISOString().slice(0, 10)}: ${entries.length} event(s) across ${byDomain.size} domain(s) (${domainList}).`,
  ];

  if (topKey.length > 0) {
    lines.push('Key changes:');
    for (const e of topKey) {
      const desc = EVENT_DESCRIPTIONS[e.timelineEventType] ?? e.timelineEventType;
      lines.push(`- ${e.domain ?? 'global'}: ${desc} (significance ${e.significance.toFixed(2)})`);
    }
  }

  if (corrections > 0) lines.push(`${corrections} user correction(s) applied.`);
  if (contradictions > 0) lines.push(`${contradictions} contradiction(s) flagged.`);
  if (frozen > 0) lines.push(`${frozen} domain(s) frozen by user.`);

  const summary = lines.join(' ').slice(0, 1200); // ~200 words

  return { summary, keyChanges: topKey };
}
