/**
 * workstreamContextInjector.ts — Workstream ambient injection for Stage 4.
 *
 * Specialist service (not absorbed into the conductor) that assembles a
 * sovereign context block summarizing the user's active workstreams,
 * overdue commitments, stalled execution chains, and unresolved decisions.
 *
 * Invoked from cognitiveOrchestrator Stage 4 ONLY when isWorkstreamRelevant
 * gates the message as strategic/planning. Never throws — returns null on
 * any failure so the conductor pipeline is unaffected.
 */
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import {
  getWorkstreams,
  type WorkstreamRow,
} from '../intelligence/workstreamStateService.js';
import {
  getOpenCommitments,
  type CommitmentRow,
} from '../intelligence/commitmentTrackerService.js';
import {
  getChains,
  detectStalls,
  type ChainRow,
} from '../intelligence/executionContinuityService.js';
import {
  getDecisions,
  type DecisionRow,
} from '../intelligence/decisionLedgerService.js';

export interface WorkstreamContextWorkstream {
  id: string;
  name: string;
  status: string;
  open_questions: number;
  stalled: boolean;
  last_activity: string;
}

export interface WorkstreamContextCommitment {
  id: string;
  text: string;
  due_date: string | null;
  days_overdue: number;
}

export interface WorkstreamContextDecision {
  id: string;
  title: string;
  context: string;
}

export interface WorkstreamContextChain {
  id: string;
  description: string;
  stalled_hours: number;
}

export interface WorkstreamContextBlock {
  has_active_workstreams: boolean;
  workstreams: WorkstreamContextWorkstream[];
  overdue_commitments: WorkstreamContextCommitment[];
  open_decisions: WorkstreamContextDecision[];
  stalled_chains: WorkstreamContextChain[];
  summary_line: string;
  token_estimate: number;
}

export interface BuildOptions {
  maxWorkstreams?: number;
  maxCommitments?: number;
}

const DEFAULT_MAX_WORKSTREAMS = 3;
const DEFAULT_MAX_COMMITMENTS = 5;
const STALL_THRESHOLD_HOURS = 24;
const MS_PER_HOUR = 60 * 60 * 1000;

function safeDateMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function isStalledWorkstream(ws: WorkstreamRow): boolean {
  if (ws.status === 'stalled') return true;
  const last = safeDateMs(ws.updated_at);
  if (last === null) return false;
  return Date.now() - last > STALL_THRESHOLD_HOURS * MS_PER_HOUR;
}

interface OpenQuestionRow {
  workstream_id: string;
}

async function fetchOpenQuestionCounts(
  userId: string,
  workstreamIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (workstreamIds.length === 0) return counts;
  for (const id of workstreamIds) counts.set(id, 0);

  if (!env.memoryLayerEnabled) return counts;
  try {
    const idList = workstreamIds.map(encodeURIComponent).join(',');
    const result = await supabaseRest<OpenQuestionRow[]>(
      'GET',
      `open_questions?user_id=eq.${encodeURIComponent(userId)}&workstream_id=in.(${idList})&status=eq.open&select=workstream_id`,
    );
    if (result.ok && Array.isArray(result.data)) {
      for (const row of result.data) {
        if (!row.workstream_id) continue;
        counts.set(row.workstream_id, (counts.get(row.workstream_id) ?? 0) + 1);
      }
    }
  } catch {
    // Table may not exist; return zero-count map.
  }
  return counts;
}

function commitmentDaysOverdue(c: CommitmentRow): number {
  if (!c.due_at) return 0;
  const due = safeDateMs(c.due_at);
  if (due === null) return 0;
  const diffMs = Date.now() - due;
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (24 * MS_PER_HOUR));
}

function chainStalledHours(c: ChainRow): number {
  const last = safeDateMs(c.last_action_at);
  if (last === null) return STALL_THRESHOLD_HOURS;
  const diffMs = Date.now() - last;
  return Math.max(0, Math.floor(diffMs / MS_PER_HOUR));
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length <= n ? s : `${s.slice(0, Math.max(0, n - 1))}…`;
}

/**
 * Build a structured workstream context block for injection into Stage 4.
 * Returns null if user has no active workstreams or if assembly fails.
 */
export async function buildWorkstreamContext(
  userId: string,
  options?: BuildOptions,
): Promise<WorkstreamContextBlock | null> {
  try {
    const maxWorkstreams = options?.maxWorkstreams ?? DEFAULT_MAX_WORKSTREAMS;
    const maxCommitments = options?.maxCommitments ?? DEFAULT_MAX_COMMITMENTS;

    const [allWorkstreams, openCommitments, allChains, allDecisions] = await Promise.all([
      getWorkstreams(userId).catch(() => [] as WorkstreamRow[]),
      getOpenCommitments(userId).catch(() => [] as CommitmentRow[]),
      getChains(userId).catch(() => [] as ChainRow[]),
      getDecisions(userId).catch(() => [] as DecisionRow[]),
    ]);

    const activeWorkstreams = allWorkstreams
      .filter((w) => w.status === 'active' || w.status === 'paused' || w.status === 'stalled')
      .slice(0, maxWorkstreams);

    if (activeWorkstreams.length === 0) return null;

    const openQuestionCounts = await fetchOpenQuestionCounts(
      userId,
      activeWorkstreams.map((w) => w.id),
    );

    const workstreams: WorkstreamContextWorkstream[] = activeWorkstreams.map((w) => ({
      id: w.id,
      name: w.name,
      status: w.status,
      open_questions: openQuestionCounts.get(w.id) ?? 0,
      stalled: isStalledWorkstream(w),
      last_activity: w.updated_at,
    }));

    const overdue_commitments: WorkstreamContextCommitment[] = openCommitments
      .map((c) => ({
        id: c.id,
        text: c.description,
        due_date: c.due_at,
        days_overdue: commitmentDaysOverdue(c),
      }))
      .filter((c) => c.days_overdue > 0)
      .sort((a, b) => b.days_overdue - a.days_overdue)
      .slice(0, maxCommitments);

    const stalledChainRows = detectStalls(allChains, STALL_THRESHOLD_HOURS);
    const stalled_chains: WorkstreamContextChain[] = stalledChainRows
      .slice(0, maxCommitments)
      .map((c) => ({
        id: c.id,
        description: c.name,
        stalled_hours: chainStalledHours(c),
      }));

    const open_decisions: WorkstreamContextDecision[] = allDecisions
      .filter((d) => !d.chosen_option)
      .slice(0, maxCommitments)
      .map((d) => ({
        id: d.id,
        title: d.title,
        context: d.description ?? d.rationale ?? '',
      }));

    const summaryParts: string[] = [];
    summaryParts.push(`${workstreams.length} active workstream${workstreams.length === 1 ? '' : 's'}`);
    if (overdue_commitments.length > 0) {
      summaryParts.push(`${overdue_commitments.length} overdue commitment${overdue_commitments.length === 1 ? '' : 's'}`);
    }
    if (stalled_chains.length > 0) {
      summaryParts.push(`${stalled_chains.length} stalled chain${stalled_chains.length === 1 ? '' : 's'}`);
    }
    if (open_decisions.length > 0) {
      summaryParts.push(`${open_decisions.length} open decision${open_decisions.length === 1 ? '' : 's'}`);
    }
    const summary_line = summaryParts.join(' · ');

    const formatted = formatWorkstreamContextBlock({
      has_active_workstreams: true,
      workstreams,
      overdue_commitments,
      open_decisions,
      stalled_chains,
      summary_line,
      token_estimate: 0,
    });
    const token_estimate = Math.ceil(formatted.length / 4);

    return {
      has_active_workstreams: true,
      workstreams,
      overdue_commitments,
      open_decisions,
      stalled_chains,
      summary_line,
      token_estimate,
    };
  } catch (err) {
    console.warn('[workstreamContextInjector] buildWorkstreamContext error:', err);
    return null;
  }
}

/**
 * Format a WorkstreamContextBlock as a token-efficient prompt block.
 */
export function formatWorkstreamContextBlock(ctx: WorkstreamContextBlock): string {
  const lines: string[] = [];
  lines.push('[ACTIVE WORKSTREAMS — Atlas Sovereign Context]');
  lines.push(`Summary: ${ctx.summary_line}`);
  lines.push('');

  if (ctx.workstreams.length > 0) {
    lines.push('Workstreams:');
    for (const w of ctx.workstreams) {
      const stalledMark = w.stalled ? ' ⚠ STALLED' : '';
      lines.push(`• ${w.name} (${w.status}) — ${w.open_questions} open questions${stalledMark}`);
    }
    lines.push('');
  }

  if (ctx.overdue_commitments.length > 0) {
    lines.push('Overdue Commitments:');
    for (const c of ctx.overdue_commitments) {
      lines.push(`• ${truncate(c.text, 120)} — ${c.days_overdue}d overdue`);
    }
    lines.push('');
  }

  if (ctx.open_decisions.length > 0) {
    lines.push('Open Decisions:');
    for (const d of ctx.open_decisions) {
      lines.push(`• ${d.title}: ${truncate(d.context, 80)}`);
    }
    lines.push('');
  }

  if (ctx.stalled_chains.length > 0) {
    lines.push('Stalled Chains:');
    for (const ch of ctx.stalled_chains) {
      lines.push(`• ${ch.description} — stalled ${ch.stalled_hours}h`);
    }
    lines.push('');
  }

  lines.push(
    '[Use this context to inform your response. If the user\'s message relates to any of the above, surface the relevant workstream state naturally — don\'t announce it mechanically.]',
  );
  return lines.join('\n');
}

// ── Heuristic intent gate ─────────────────────────────────────────────────────

const STRATEGIC_MODES = new Set<string>([
  'decision_support',
  'constitutional_alignment',
  'contradiction_analysis',
  'truth_pressure',
  'unfinished_surface',
  'future_simulation',
  'identity_operationalization',
  'legacy_extraction',
  'self_revision',
  'calibration_test',
]);

const CASUAL_MODES = new Set<string>(['casual', 'chitchat']);

const STRATEGIC_SIGNAL_WORDS: readonly string[] = [
  'project',
  'workstream',
  'plan',
  'strategy',
  'roadmap',
  'milestone',
  'deadline',
  'commit',
  'decision',
  'launch',
  'sprint',
  'initiative',
  'progress',
  'status',
  'update',
  'next step',
  'follow up',
  'working on',
  'building',
  'shipping',
];

type RoutingLike =
  | {
      mode?: string;
      intent?: string;
      class?: string;
    }
  | null
  | undefined;

function extractRoutingIntent(routing: RoutingLike): string | null {
  if (!routing) return null;
  if (typeof routing.mode === 'string') return routing.mode;
  if (typeof routing.intent === 'string') return routing.intent;
  if (typeof routing.class === 'string') return routing.class;
  return null;
}

/**
 * Pure heuristic gate — no model call. Returns true when injection is
 * appropriate (strategic / planning conversation), false otherwise.
 */
export function isWorkstreamRelevant(
  messageText: string,
  routingDecision: RoutingLike,
): boolean {
  if (!messageText || messageText.length < 20) return false;

  const intent = extractRoutingIntent(routingDecision);
  if (intent && CASUAL_MODES.has(intent)) return false;

  const lower = messageText.toLowerCase();
  const hasSignal = STRATEGIC_SIGNAL_WORDS.some((word) => lower.includes(word));
  if (hasSignal) return true;

  if (intent && STRATEGIC_MODES.has(intent)) return true;

  return false;
}

/**
 * Heuristic decision-extraction for the ATLAS_WORKSTREAM metadata block.
 * Looks for phrases that suggest the response contains a commitment or
 * decision the user could persist. Best-effort; returns null if nothing
 * confident enough surfaces.
 */
const DECISION_PHRASES: readonly string[] = [
  'we should',
  "let's",
  'lets ',
  'decided to',
  'going with',
  ' will ',
  'commit to',
];

export function extractSuggestedDecision(responseText: string): string | null {
  if (!responseText) return null;
  const lower = responseText.toLowerCase();
  const hasPhrase = DECISION_PHRASES.some((p) => lower.includes(p));
  if (!hasPhrase) return null;

  const sentences = responseText.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const sl = sentence.toLowerCase();
    if (DECISION_PHRASES.some((p) => sl.includes(p))) {
      return truncate(sentence.trim(), 240);
    }
  }
  return null;
}

export interface WorkstreamMetadataBlock {
  active: true;
  workstream_ids: string[];
  suggested_log?: {
    type: 'decision';
    text: string;
    workstream_id: string | null;
  };
}

export function buildWorkstreamMetadataBlock(
  ctx: WorkstreamContextBlock,
  responseText: string,
): WorkstreamMetadataBlock {
  const workstream_ids = ctx.workstreams.map((w) => w.id);
  const suggestedText = extractSuggestedDecision(responseText);
  if (suggestedText) {
    return {
      active: true,
      workstream_ids,
      suggested_log: {
        type: 'decision',
        text: suggestedText,
        workstream_id: workstream_ids[0] ?? null,
      },
    };
  }
  return { active: true, workstream_ids };
}
