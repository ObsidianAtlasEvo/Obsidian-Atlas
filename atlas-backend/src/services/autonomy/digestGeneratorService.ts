/**
 * digestGeneratorService.ts — Background Intelligence Digest generator.
 *
 * Reads unacknowledged watcher_events for a user, groups by event_type, and
 * renders a structured markdown brief. Persists the brief to
 * intelligence_digests and returns a minimal record.
 *
 * Discipline:
 *   - Fails open. Any error logs a warning and returns null. Never throws.
 *   - Pure read/write of Supabase rows; no LLM calls, no side effects beyond
 *     the digest row and the watcher_events fetch.
 *   - Not absorbed into conductor/orchestrator — invoked directly from routes
 *     or, later, from a per-user weekly tick.
 */

import { supabaseRest } from '../../db/supabase.js';

export type DigestType = 'weekly' | 'session_start' | 'on_demand';

interface WatcherEventBriefRow {
  id: string;
  event_type: string;
  entity_id: string | null;
  entity_type: string | null;
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string | null;
  created_at: string;
}

interface DigestInsertResult {
  id: string;
}

type Bucket =
  | 'overdue_commitments'
  | 'stalled_chains'
  | 'fragile_assumptions'
  | 'contradictions'
  | 'other';

const SECTION_TITLES: Record<Bucket, string> = {
  overdue_commitments: 'Overdue commitments',
  stalled_chains: 'Stalled chains',
  fragile_assumptions: 'Fragile assumptions',
  contradictions: 'Unresolved contradictions',
  other: 'Other signals',
};

const SECTION_EMOJI: Record<Bucket, string> = {
  overdue_commitments: '⚠',
  stalled_chains: '🔄',
  fragile_assumptions: '⚡',
  contradictions: '🔀',
  other: '📌',
};

function bucketFor(eventType: string): Bucket {
  const t = eventType.toLowerCase();
  if (t === 'overdue_commitment' || t === 'overdue_commitments') return 'overdue_commitments';
  if (t === 'stalled_chain' || t === 'stalled_chains' || t.includes('stall')) return 'stalled_chains';
  if (t === 'fragile_assumption' || t === 'fragile_assumptions') return 'fragile_assumptions';
  if (t === 'contradiction' || t === 'unresolved_contradiction') return 'contradictions';
  return 'other';
}

function buildMarkdown(rows: WatcherEventBriefRow[]): string {
  const groups = new Map<Bucket, WatcherEventBriefRow[]>();
  for (const r of rows) {
    const b = bucketFor(r.event_type);
    const arr = groups.get(b);
    if (arr) arr.push(r);
    else groups.set(b, [r]);
  }

  const order: Bucket[] = [
    'overdue_commitments',
    'stalled_chains',
    'fragile_assumptions',
    'contradictions',
    'other',
  ];

  const parts: string[] = [];
  parts.push('## Atlas Intelligence Brief');
  parts.push(`*${rows.length} things detected since your last review*`);

  for (const bucket of order) {
    const items = groups.get(bucket);
    if (!items || items.length === 0) continue;
    parts.push('');
    parts.push(`### ${SECTION_EMOJI[bucket]} ${SECTION_TITLES[bucket]} (${items.length})`);
    for (const it of items) {
      const desc = it.description ? `: ${it.description}` : '';
      parts.push(`- **${it.title}**${desc}`);
    }
  }

  return parts.join('\n');
}

export async function generateDigestForUser(
  userId: string,
  digestType: DigestType,
): Promise<{ id: string; event_count: number; digest_markdown: string } | null> {
  if (!userId) return null;
  try {
    // Severity ordering: high > medium > low. PostgREST has no enum order so we
    // sort severity DESC textually then created_at DESC. That orders
    // 'medium' before 'low' and 'low' before 'high' alphabetically, which is
    // wrong — so fetch unordered by severity and apply a stable sort here.
    const result = await supabaseRest<WatcherEventBriefRow[]>(
      'GET',
      `watcher_events?user_id=eq.${encodeURIComponent(userId)}&acknowledged=eq.false` +
        `&select=id,event_type,entity_id,entity_type,severity,title,description,created_at` +
        `&order=created_at.desc&limit=20`,
    );
    if (!result.ok || !result.data) {
      console.warn('[digestGeneratorService] watcher_events fetch failed for user', userId);
      return null;
    }
    if (result.data.length === 0) return null;

    const severityRank = (s: string): number =>
      s === 'high' ? 3 : s === 'medium' ? 2 : s === 'low' ? 1 : 0;
    const rows = [...result.data].sort((a, b) => {
      const r = severityRank(b.severity) - severityRank(a.severity);
      if (r !== 0) return r;
      return b.created_at.localeCompare(a.created_at);
    });

    const digest_markdown = buildMarkdown(rows);
    const event_count = rows.length;

    const insert = await supabaseRest<DigestInsertResult[]>(
      'POST',
      'intelligence_digests',
      [
        {
          user_id: userId,
          digest_type: digestType,
          event_count,
          digest_markdown,
          viewed: false,
        },
      ],
      { Prefer: 'return=representation' },
    );
    if (!insert.ok || !insert.data || insert.data.length === 0) {
      console.warn('[digestGeneratorService] insert intelligence_digests failed for user', userId);
      return null;
    }

    const id = insert.data[0]?.id;
    if (!id) return null;
    return { id, event_count, digest_markdown };
  } catch (err) {
    console.warn('[digestGeneratorService] generateDigestForUser error:', err);
    return null;
  }
}
