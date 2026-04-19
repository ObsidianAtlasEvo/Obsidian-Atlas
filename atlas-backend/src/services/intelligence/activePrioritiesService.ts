/**
 * activePrioritiesService.ts — Phase 0.9: Temporal Cognition Stack
 *
 * Tracks the user's active projects, recurring themes, and strategic
 * workstreams. Surfaces them as lightweight context for the Overseer.
 *
 * Design invariants:
 * - Non-throwing: all errors caught, safe defaults returned.
 * - Feature-flagged: all Supabase calls gated on env.MEMORY_LAYER_ENABLED.
 * - detectPrioritiesFromMemories() is fully heuristic — no LLM required.
 * - Deduplicates by title (case-insensitive) per user.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type PriorityType =
  | 'active_project'
  | 'recurring_theme'
  | 'unresolved_thread'
  | 'strategic_priority'
  | 'dormant_initiative'
  | 'blocked_priority';

export type ProgressState = 'active' | 'stalled' | 'dormant' | 'complete' | 'abandoned';

export interface ActivePriority {
  id: string;
  userId: string;
  priorityType: PriorityType;
  title: string;
  priorityScore: number;
  progressState: ProgressState;
  recencyScore: number;
  linkedMemoryIds: string[];
  linkedIdentityDomains: string[];
  blockedByGapIds: string[];
  relatedChamber?: string;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface RawPriorityRow {
  id: string;
  user_id: string;
  priority_type: string;
  title: string;
  priority_score: number;
  progress_state: string;
  recency_score: number;
  linked_memory_ids: string[];
  linked_identity_domains: string[];
  blocked_by_gap_ids: string[];
  related_chamber?: string | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

// ── Mappers ──────────────────────────────────────────────────────────────────

function rowToPriority(row: RawPriorityRow): ActivePriority {
  return {
    id: row.id,
    userId: row.user_id,
    priorityType: row.priority_type as PriorityType,
    title: row.title,
    priorityScore: row.priority_score ?? 0.5,
    progressState: row.progress_state as ProgressState,
    recencyScore: row.recency_score ?? 0.5,
    linkedMemoryIds: Array.isArray(row.linked_memory_ids) ? row.linked_memory_ids : [],
    linkedIdentityDomains: Array.isArray(row.linked_identity_domains)
      ? row.linked_identity_domains
      : [],
    blockedByGapIds: Array.isArray(row.blocked_by_gap_ids) ? row.blocked_by_gap_ids : [],
    relatedChamber: row.related_chamber ?? undefined,
    lastActivityAt: new Date(row.last_activity_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface UpsertPriorityInput {
  priorityType: PriorityType;
  title: string;
  priorityScore?: number;
  progressState?: ProgressState;
  recencyScore?: number;
  linkedMemoryIds?: string[];
  linkedIdentityDomains?: string[];
  blockedByGapIds?: string[];
  relatedChamber?: string;
}

/**
 * Upsert a priority for a user. Deduplicates by title (case-insensitive).
 * Returns the priority ID.
 */
export async function upsertPriority(
  userId: string,
  input: UpsertPriorityInput,
): Promise<string> {
  if (!env.memoryLayerEnabled) return '';

  try {
    const titleNormalized = input.title.trim().toLowerCase();

    // Fetch existing by title (case-insensitive using ilike)
    const qs = [
      `user_id=eq.${encodeURIComponent(userId)}`,
      `title=ilike.${encodeURIComponent(titleNormalized)}`,
      `limit=1`,
    ].join('&');

    const existing = await supabaseRest<RawPriorityRow[]>('GET', `active_priorities?${qs}`);

    const now = new Date().toISOString();
    const body: Record<string, unknown> = {
      priority_type: input.priorityType,
      title: input.title.trim(),
      priority_score: Math.max(0, Math.min(1, input.priorityScore ?? 0.5)),
      progress_state: input.progressState ?? 'active',
      recency_score: Math.max(0, Math.min(1, input.recencyScore ?? 0.5)),
      linked_memory_ids: input.linkedMemoryIds ?? [],
      linked_identity_domains: input.linkedIdentityDomains ?? [],
      blocked_by_gap_ids: input.blockedByGapIds ?? [],
      related_chamber: input.relatedChamber ?? null,
      last_activity_at: now,
      updated_at: now,
    };

    if (existing.ok && existing.data && existing.data.length > 0) {
      const existingId = existing.data[0]!.id;
      await supabaseRest(
        'PATCH',
        `active_priorities?id=eq.${encodeURIComponent(existingId)}`,
        body,
      );
      return existingId;
    }

    const id = randomUUID();
    await supabaseRest('POST', 'active_priorities', {
      id,
      user_id: userId,
      ...body,
    });
    return id;
  } catch (err) {
    console.error('[activePriorities] upsertPriority error:', err);
    return '';
  }
}

/**
 * Get all active priorities for a user, ordered by priorityScore DESC, active state first.
 */
export async function getActivePriorities(userId: string): Promise<ActivePriority[]> {
  if (!env.memoryLayerEnabled) return [];

  try {
    const qs = [
      `user_id=eq.${encodeURIComponent(userId)}`,
      `progress_state=in.(active,stalled)`,
      `order=priority_score.desc`,
    ].join('&');

    const result = await supabaseRest<RawPriorityRow[]>('GET', `active_priorities?${qs}`);
    if (!result.ok || !result.data) return [];
    return result.data.map(rowToPriority);
  } catch (err) {
    console.error('[activePriorities] getActivePriorities error:', err);
    return [];
  }
}

/**
 * Mark a priority as dormant.
 */
export async function markPriorityDormant(priorityId: string): Promise<void> {
  if (!env.memoryLayerEnabled) return;

  try {
    await supabaseRest(
      'PATCH',
      `active_priorities?id=eq.${encodeURIComponent(priorityId)}`,
      { progress_state: 'dormant', updated_at: new Date().toISOString() },
    );
  } catch (err) {
    console.error('[activePriorities] markPriorityDormant error:', err);
  }
}

// ── Heuristic priority detection ─────────────────────────────────────────────

/** Project/goal keyword triggers */
const PROJECT_KEYWORDS = [
  'building', 'working on', 'developing', 'creating', 'implementing', 'project',
  'need to', 'trying to', 'plan to', 'goal is', 'objective', 'milestone',
  'launch', 'ship', 'release', 'deploy', 'integrate', 'refactor', 'migrate',
];

/** Recurring theme keywords */
const THEME_KEYWORDS = [
  'always', 'usually', 'every time', 'regularly', 'typically', 'tend to',
  'prefer to', 'like to', 'often', 'habit', 'pattern', 'routine',
];

/** Constraint/blocked keywords */
const CONSTRAINT_KEYWORDS = [
  'blocked by', 'waiting for', 'depends on', 'can\'t proceed', 'stuck on',
  'issue with', 'problem with', 'need to resolve', 'pending',
];

/** Strategic keywords */
const STRATEGIC_KEYWORDS = [
  'priority', 'strategic', 'important', 'critical', 'key goal', 'must have',
  'high priority', 'q1', 'q2', 'q3', 'q4', 'quarter', 'roadmap', 'vision',
];

function keywordScore(content: string, keywords: string[]): number {
  const lower = content.toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) hits++;
  }
  return Math.min(1, hits / Math.max(1, keywords.length * 0.2));
}

function extractTitle(content: string): string {
  // Take the first sentence or first 60 chars, whichever is shorter
  const firstSentence = content.split(/[.!?]/)[0] ?? content;
  return firstSentence.trim().slice(0, 60);
}

/**
 * Detect active priorities from recent user memories (last 30 days).
 * Pure heuristic pattern matching — no LLM required.
 * Groups by content theme, auto-creates/updates priorities.
 */
export async function detectPrioritiesFromMemories(userId: string): Promise<ActivePriority[]> {
  if (!env.memoryLayerEnabled) return [];

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Load recent memories with relevant kinds
    const result = await supabaseRest<Array<{
      id: string;
      content: string;
      kind: string;
      scope_type?: string | null;
      scope_key?: string | null;
      stability_score?: number | null;
      created_at: string;
    }>>(
      'GET',
      [
        `user_memories?user_id=eq.${encodeURIComponent(userId)}`,
        `kind=in.(goal,preference,fact,pattern)`,
        `created_at=gte.${thirtyDaysAgo}`,
        `quarantined=is.false`,
        `select=id,content,kind,scope_type,scope_key,stability_score,created_at`,
        `order=created_at.desc`,
        `limit=150`,
      ].join('&'),
    );

    const memories = result.ok && result.data ? result.data : [];

    interface Cluster {
      theme: string;
      type: PriorityType;
      memoryIds: string[];
      totalScore: number;
      domains: string[];
      chamber?: string;
      lastSeen: string;
    }

    // Cluster memories by heuristic type
    const clusters: Cluster[] = [];

    for (const mem of memories) {
      const content = mem.content ?? '';
      const stability = mem.stability_score ?? 0.5;
      const recencyDays =
        (Date.now() - new Date(mem.created_at).getTime()) / (1000 * 60 * 60 * 24);
      const recencyBoost = Math.max(0, 1 - recencyDays / 30);

      // Score each priority type
      const projectScore = keywordScore(content, PROJECT_KEYWORDS);
      const themeScore = keywordScore(content, THEME_KEYWORDS);
      const constraintScore = keywordScore(content, CONSTRAINT_KEYWORDS);
      const strategicScore = keywordScore(content, STRATEGIC_KEYWORDS);

      const maxScore = Math.max(projectScore, themeScore, constraintScore, strategicScore);
      if (maxScore < 0.1) continue; // Too generic — skip

      let type: PriorityType = 'recurring_theme';
      let score = themeScore;

      if (strategicScore >= projectScore && strategicScore >= themeScore && strategicScore >= constraintScore) {
        type = 'strategic_priority';
        score = strategicScore;
      } else if (constraintScore >= projectScore && constraintScore >= themeScore) {
        type = 'blocked_priority';
        score = constraintScore;
      } else if (projectScore >= themeScore) {
        type = 'active_project';
        score = projectScore;
      }

      const title = extractTitle(content);
      const priority = (score * 0.6 + stability * 0.3 + recencyBoost * 0.1);

      // Find existing cluster with similar title (simple edit-distance proxy)
      let matched = false;
      for (const cluster of clusters) {
        if (cluster.theme.length > 5 && title.toLowerCase().startsWith(cluster.theme.slice(0, 10).toLowerCase())) {
          cluster.memoryIds.push(mem.id);
          cluster.totalScore = Math.max(cluster.totalScore, priority);
          cluster.lastSeen = mem.created_at > cluster.lastSeen ? mem.created_at : cluster.lastSeen;
          if (mem.scope_type === 'chamber' && mem.scope_key && !cluster.chamber) {
            cluster.chamber = mem.scope_key;
          }
          matched = true;
          break;
        }
      }

      if (!matched) {
        clusters.push({
          theme: title,
          type,
          memoryIds: [mem.id],
          totalScore: priority,
          domains: [],
          chamber: mem.scope_type === 'chamber' ? (mem.scope_key ?? undefined) : undefined,
          lastSeen: mem.created_at,
        });
      }
    }

    // Sort clusters by totalScore DESC, take top 10
    clusters.sort((a, b) => b.totalScore - a.totalScore);
    const topClusters = clusters.slice(0, 10);

    // Upsert each cluster as a priority
    const upsertPromises = topClusters.map((cluster) => {
      const recencyDays =
        (Date.now() - new Date(cluster.lastSeen).getTime()) / (1000 * 60 * 60 * 24);
      const recencyScore = Math.max(0, 1 - recencyDays / 30);

      return upsertPriority(userId, {
        priorityType: cluster.type,
        title: cluster.theme,
        priorityScore: Math.min(1, cluster.totalScore),
        progressState: recencyDays > 14 ? 'stalled' : 'active',
        recencyScore,
        linkedMemoryIds: cluster.memoryIds,
        relatedChamber: cluster.chamber,
      });
    });

    await Promise.allSettled(upsertPromises);

    return getActivePriorities(userId);
  } catch (err) {
    console.error('[activePriorities] detectPrioritiesFromMemories error:', err);
    return [];
  }
}

/**
 * Format active priorities as a compact context string. Max ~60 tokens.
 */
export function formatActivePrioritiesForContext(priorities: ActivePriority[]): string {
  if (priorities.length === 0) return '';

  const top3 = priorities
    .filter((p) => p.progressState === 'active')
    .slice(0, 3);

  if (top3.length === 0) return '';

  const items = top3.map((p) => `• ${p.title.slice(0, 40)} (${p.priorityType})`);
  return `[Active priorities: ${items.join(' | ')}]`;
}
