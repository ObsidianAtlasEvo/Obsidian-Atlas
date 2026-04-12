/**
 * ExplainabilityPanel.tsx — Atlas Phase 3
 *
 * A React component for the Evolution Control Panel that shows the user
 * a chronological feed of why Atlas did what it did. Each explanation
 * is rendered as an expandable card with color-coded borders, evidence
 * bullets, and a Reverse button where applicable.
 *
 * Design: Atlas dark nebula aesthetic — deep navy/charcoal backgrounds,
 * nebula purple accents, muted borders, subtle glows.
 *
 * Tab structure:
 *   1. THIS SESSION     — what changed in the current session
 *   2. RECENT CHANGES   — last 10 explanations, expandable cards
 *   3. WHY DID ATLAS... — search/filter bar over the full feed
 */

import React, { useState, useMemo, useCallback } from 'react';
import type { Explanation, ExplainableAction } from './explainabilityTypes';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS & CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Color-coded left border per action category.
 * gold:  mutations (behavioral changes)
 * teal:  crucible / resonance
 * amber: uncertainty signals
 * red:   constitution blocks, quarantine
 * slate: system/migration/policy
 */
const ACTION_COLOR_MAP: Record<ExplainableAction, ActionColor> = {
  mutation_committed: 'gold',
  trait_observed_not_confirmed: 'gold',
  trait_decayed: 'gold',
  crucible_escalated: 'teal',
  crucible_relented: 'teal',
  crucible_switched_mode: 'teal',
  resonance_guardrail_fired: 'teal',
  uncertainty_injected: 'amber',
  claim_marked_stale: 'amber',
  overseer_rewrote: 'amber',
  goal_activated: 'amber',
  goal_stale: 'amber',
  constitution_blocked: 'red',
  quarantine_triggered: 'red',
  policy_conflict_resolved: 'slate',
  schema_migration_ran: 'slate',
};

type ActionColor = 'gold' | 'teal' | 'amber' | 'red' | 'slate';

const COLOR_STYLES: Record<ActionColor, {
  border: string;
  glow: string;
  badge: string;
  badgeText: string;
  icon: string;
}> = {
  gold: {
    border: 'border-l-amber-400',
    glow: 'shadow-[0_0_12px_rgba(251,191,36,0.15)]',
    badge: 'bg-amber-400/10 border-amber-400/30',
    badgeText: 'text-amber-300',
    icon: '✦',
  },
  teal: {
    border: 'border-l-teal-400',
    glow: 'shadow-[0_0_12px_rgba(45,212,191,0.15)]',
    badge: 'bg-teal-400/10 border-teal-400/30',
    badgeText: 'text-teal-300',
    icon: '◈',
  },
  amber: {
    border: 'border-l-orange-400',
    glow: 'shadow-[0_0_12px_rgba(251,146,60,0.15)]',
    badge: 'bg-orange-400/10 border-orange-400/30',
    badgeText: 'text-orange-300',
    icon: '◉',
  },
  red: {
    border: 'border-l-red-500',
    glow: 'shadow-[0_0_12px_rgba(239,68,68,0.2)]',
    badge: 'bg-red-500/10 border-red-500/30',
    badgeText: 'text-red-400',
    icon: '⊗',
  },
  slate: {
    border: 'border-l-slate-500',
    glow: 'shadow-[0_0_8px_rgba(100,116,139,0.1)]',
    badge: 'bg-slate-500/10 border-slate-500/30',
    badgeText: 'text-slate-400',
    icon: '◇',
  },
};

const ACTION_LABELS: Record<ExplainableAction, string> = {
  mutation_committed: 'Behavior Changed',
  trait_observed_not_confirmed: 'Pattern Observed',
  trait_decayed: 'Pattern Decayed',
  crucible_escalated: 'Crucible Escalated',
  crucible_relented: 'Crucible Eased Off',
  crucible_switched_mode: 'Crucible Mode Switched',
  uncertainty_injected: 'Uncertainty Flagged',
  claim_marked_stale: 'Claim Went Stale',
  overseer_rewrote: 'Response Rewritten',
  goal_activated: 'Goal Activated',
  goal_stale: 'Goal Went Inactive',
  resonance_guardrail_fired: 'Resonance Guardrail',
  constitution_blocked: 'Constitution Block',
  quarantine_triggered: 'Evolution Paused',
  policy_conflict_resolved: 'Policy Conflict',
  schema_migration_ran: 'Data Migrated',
};

/**
 * Search keywords that map to action types for the "WHY DID ATLAS..." filter.
 */
const SEARCH_KEYWORD_MAP: Array<{ keywords: string[]; actions: ExplainableAction[] }> = [
  {
    keywords: ['harder', 'pressure', 'escalat', 'crucible', 'debate', 'push', 'difficult'],
    actions: ['crucible_escalated', 'crucible_switched_mode'],
  },
  {
    keywords: ['easier', 'backed off', 'relent', 'eased', 'softer'],
    actions: ['crucible_relented'],
  },
  {
    keywords: ['behavior', 'changed', 'mutation', 'phrase', 'stopped', 'started'],
    actions: ['mutation_committed'],
  },
  {
    keywords: ['uncertain', 'unsure', 'not sure', 'conflict', 'disagree'],
    actions: ['uncertainty_injected'],
  },
  {
    keywords: ['overseer', 'rewrote', 'rewrite', 'response', 'quality'],
    actions: ['overseer_rewrote'],
  },
  {
    keywords: ['constitution', 'blocked', 'rejected', 'refused', 'protection'],
    actions: ['constitution_blocked'],
  },
  {
    keywords: ['goal', 'objective', 'project', 'mission', 'active'],
    actions: ['goal_activated', 'goal_stale'],
  },
  {
    keywords: ['resonance', 'guardrail', 'removed', 'journal', 'identity'],
    actions: ['resonance_guardrail_fired'],
  },
  {
    keywords: ['trait', 'pattern', 'observed', 'noticed'],
    actions: ['trait_observed_not_confirmed', 'trait_decayed'],
  },
  {
    keywords: ['stale', 'old', 'outdated', 'expired'],
    actions: ['claim_marked_stale', 'goal_stale', 'trait_decayed'],
  },
  {
    keywords: ['paused', 'quarantine', 'stopped learning', 'frozen'],
    actions: ['quarantine_triggered'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type PanelTab = 'session' | 'recent' | 'search';

interface ExplainabilityPanelProps {
  userId: string;
  recentExplanations: Explanation[];
  onReverse?: (explanation: Explanation) => Promise<void>;
  isLoading?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY HOOKS
// ─────────────────────────────────────────────────────────────────────────────

function useSearchFilter(
  explanations: Explanation[],
  query: string,
): Explanation[] {
  return useMemo(() => {
    if (!query.trim()) return explanations;

    const q = query.toLowerCase();

    // First: check if the query matches known keyword groups
    const matchedActions = new Set<ExplainableAction>();
    for (const group of SEARCH_KEYWORD_MAP) {
      if (group.keywords.some((kw) => q.includes(kw))) {
        group.actions.forEach((a) => matchedActions.add(a));
      }
    }

    if (matchedActions.size > 0) {
      return explanations.filter((e) => matchedActions.has(e.action));
    }

    // Fallback: full-text search over headline + reasoning
    return explanations.filter(
      (e) =>
        e.headline.toLowerCase().includes(q) ||
        e.reasoning.toLowerCase().includes(q) ||
        e.evidence.some((ev) => ev.toLowerCase().includes(q)) ||
        ACTION_LABELS[e.action].toLowerCase().includes(q),
    );
  }, [explanations, query]);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

interface ExplanationCardProps {
  explanation: Explanation;
  onReverse?: (explanation: Explanation) => Promise<void>;
  defaultExpanded?: boolean;
}

const ExplanationCard: React.FC<ExplanationCardProps> = ({
  explanation,
  onReverse,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [reversing, setReversing] = useState(false);
  const [reversed, setReversed] = useState(false);

  const color = ACTION_COLOR_MAP[explanation.action] ?? 'slate';
  const styles = COLOR_STYLES[color];
  const label = ACTION_LABELS[explanation.action] ?? explanation.action;

  const relativeTime = useMemo(() => {
    const diff = Date.now() - explanation.timestamp;
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }, [explanation.timestamp]);

  const handleReverse = useCallback(async () => {
    if (!onReverse || reversing || reversed) return;
    setReversing(true);
    try {
      await onReverse(explanation);
      setReversed(true);
    } finally {
      setReversing(false);
    }
  }, [onReverse, explanation, reversing, reversed]);

  return (
    <div
      className={[
        'relative rounded-lg border border-white/[0.06] border-l-4',
        'bg-[#0d1117] transition-all duration-200',
        styles.border,
        expanded ? styles.glow : '',
      ].join(' ')}
    >
      {/* Card header — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-3 flex items-start gap-3 group"
        aria-expanded={expanded}
      >
        {/* Icon */}
        <span
          className={`mt-0.5 text-sm font-mono shrink-0 ${styles.badgeText}`}
          aria-hidden
        >
          {styles.icon}
        </span>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span
              className={`text-[10px] font-semibold tracking-widest uppercase px-1.5 py-0.5 rounded border ${styles.badge} ${styles.badgeText}`}
            >
              {label}
            </span>
            <span className="text-[11px] text-slate-500">{relativeTime}</span>
          </div>
          <p className="text-sm text-slate-200 leading-snug pr-6">
            {explanation.headline}
          </p>
        </div>

        {/* Expand chevron */}
        <span
          className={`shrink-0 text-slate-500 mt-1 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2.5 5L7 9.5L11.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-white/[0.04]">
          {/* Reasoning */}
          <div className="pt-3">
            <p className="text-sm text-slate-300 leading-relaxed">
              {explanation.reasoning}
            </p>
          </div>

          {/* Evidence */}
          {explanation.evidence.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold tracking-widest uppercase text-slate-500 mb-2">
                Evidence
              </h4>
              <ul className="space-y-1">
                {explanation.evidence.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                    <span className="text-slate-600 shrink-0 mt-0.5">–</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Confidence */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold tracking-widest uppercase text-slate-500">
              Confidence
            </span>
            <span className="text-xs text-slate-400">{explanation.confidence}</span>
          </div>

          {/* Reverse action */}
          {explanation.reversible && onReverse && (
            <div className="pt-1">
              {reversed ? (
                <div className="flex items-center gap-2 text-xs text-teal-400">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Reversal queued. Changes will apply in a few seconds.
                </div>
              ) : (
                <div className="space-y-1.5">
                  <button
                    onClick={handleReverse}
                    disabled={reversing}
                    className={[
                      'text-xs px-3 py-1.5 rounded border transition-all duration-150',
                      'border-white/10 bg-white/[0.03] text-slate-300',
                      'hover:border-white/20 hover:bg-white/[0.06] hover:text-white',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                    ].join(' ')}
                  >
                    {reversing ? 'Reversing…' : '↩ Reverse This Change'}
                  </button>
                  {explanation.howToReverse && (
                    <p className="text-[11px] text-slate-500 leading-snug">
                      {explanation.howToReverse}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Related event IDs (collapsible meta) */}
          {explanation.relatedEventIds.length > 0 && (
            <details className="group/meta">
              <summary className="text-[10px] text-slate-600 cursor-pointer hover:text-slate-500 select-none list-none flex items-center gap-1">
                <span className="group-open/meta:rotate-90 inline-block transition-transform">▶</span>
                {explanation.relatedEventIds.length} related event{explanation.relatedEventIds.length !== 1 ? 's' : ''}
              </summary>
              <div className="mt-1 flex flex-wrap gap-1">
                {explanation.relatedEventIds.slice(0, 6).map((id) => (
                  <span key={id} className="font-mono text-[9px] text-slate-600 bg-white/[0.02] px-1.5 py-0.5 rounded border border-white/[0.04]">
                    {id.slice(0, 8)}…
                  </span>
                ))}
                {explanation.relatedEventIds.length > 6 && (
                  <span className="text-[9px] text-slate-600">
                    +{explanation.relatedEventIds.length - 6} more
                  </span>
                )}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

// ─── EMPTY STATE ─────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <div className="w-10 h-10 rounded-full border border-white/[0.06] flex items-center justify-center mb-4">
      <span className="text-slate-600 text-lg">◇</span>
    </div>
    <p className="text-sm text-slate-500">{message}</p>
  </div>
);

// ─── SESSION SUMMARY BANNER ───────────────────────────────────────────────────

interface SessionBannerProps {
  changed: Explanation[];
  observed: Explanation[];
}

const SessionBanner: React.FC<SessionBannerProps> = ({ changed, observed }) => {
  if (changed.length === 0 && observed.length === 0) {
    return (
      <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] px-4 py-3 text-sm text-slate-500">
        No changes or new observations in this session.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#0d1117] px-4 py-3">
      <div className="flex items-center gap-6 flex-wrap">
        {changed.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            <span className="text-sm text-slate-300">
              <span className="font-semibold text-amber-300">{changed.length}</span>{' '}
              change{changed.length !== 1 ? 's' : ''} applied
            </span>
          </div>
        )}
        {observed.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
            <span className="text-sm text-slate-300">
              <span className="font-semibold text-teal-300">{observed.length}</span>{' '}
              pattern{observed.length !== 1 ? 's' : ''} observed
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const ExplainabilityPanel: React.FC<ExplainabilityPanelProps> = ({
  userId: _userId,
  recentExplanations,
  onReverse,
  isLoading = false,
}) => {
  const [activeTab, setActiveTab] = useState<PanelTab>('session');
  const [searchQuery, setSearchQuery] = useState('');

  // Separate session (last hour) from recent history
  const sessionCutoff = Date.now() - 3_600_000;
  const sessionExplanations = useMemo(
    () => recentExplanations.filter((e) => e.timestamp >= sessionCutoff),
    [recentExplanations, sessionCutoff],
  );
  const sessionChanged = useMemo(
    () =>
      sessionExplanations.filter((e) =>
        ['mutation_committed', 'constitution_blocked', 'overseer_rewrote', 'quarantine_triggered'].includes(e.action),
      ),
    [sessionExplanations],
  );
  const sessionObserved = useMemo(
    () =>
      sessionExplanations.filter((e) =>
        ['trait_observed_not_confirmed', 'goal_activated', 'crucible_escalated'].includes(e.action),
      ),
    [sessionExplanations],
  );

  const recentTen = useMemo(
    () => [...recentExplanations].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10),
    [recentExplanations],
  );

  const searchResults = useSearchFilter(recentExplanations, searchQuery);

  const tabs: Array<{ id: PanelTab; label: string; count?: number }> = [
    { id: 'session', label: 'This Session', count: sessionExplanations.length },
    { id: 'recent', label: 'Recent Changes', count: recentTen.length },
    { id: 'search', label: 'Why did Atlas…' },
  ];

  return (
    <div className="flex flex-col h-full bg-[#080c12] text-slate-100 font-sans">
      {/* Panel header */}
      <div className="px-5 pt-5 pb-0 border-b border-white/[0.05]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-100">
              Explainability
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Why Atlas did what it did.
            </p>
          </div>
          {isLoading && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="animate-pulse w-1.5 h-1.5 rounded-full bg-teal-500/60" />
              Loading
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'px-4 py-2.5 text-xs font-medium tracking-wide transition-colors duration-150',
                'border-b-2',
                activeTab === tab.id
                  ? 'text-slate-100 border-teal-400'
                  : 'text-slate-500 border-transparent hover:text-slate-300 hover:border-white/10',
              ].join(' ')}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={[
                    'ml-1.5 text-[10px] px-1 py-0.5 rounded-full',
                    activeTab === tab.id
                      ? 'bg-teal-400/20 text-teal-300'
                      : 'bg-white/[0.06] text-slate-500',
                  ].join(' ')}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Panel body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">

        {/* ── TAB: THIS SESSION ────────────────────────────────────────────── */}
        {activeTab === 'session' && (
          <div className="px-5 py-4 space-y-4">
            <SessionBanner changed={sessionChanged} observed={sessionObserved} />

            {sessionExplanations.length === 0 ? (
              <EmptyState message="Nothing happened in this session yet." />
            ) : (
              <div className="space-y-2">
                {sessionChanged.length > 0 && (
                  <section>
                    <SectionLabel>Changes Applied</SectionLabel>
                    <div className="space-y-2 mt-2">
                      {sessionChanged.map((explanation) => (
                        <ExplanationCard
                          key={explanation.id}
                          explanation={explanation}
                          onReverse={onReverse}
                          defaultExpanded={sessionChanged.length === 1}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {sessionObserved.length > 0 && (
                  <section>
                    <SectionLabel>Patterns Observed (Not Yet Confirmed)</SectionLabel>
                    <div className="space-y-2 mt-2">
                      {sessionObserved.map((explanation) => (
                        <ExplanationCard
                          key={explanation.id}
                          explanation={explanation}
                          onReverse={onReverse}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Other session events that aren't in changed or observed */}
                {(() => {
                  const other = sessionExplanations.filter(
                    (e) => !sessionChanged.includes(e) && !sessionObserved.includes(e),
                  );
                  if (other.length === 0) return null;
                  return (
                    <section>
                      <SectionLabel>Other Events</SectionLabel>
                      <div className="space-y-2 mt-2">
                        {other.map((explanation) => (
                          <ExplanationCard
                            key={explanation.id}
                            explanation={explanation}
                            onReverse={onReverse}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: RECENT CHANGES ──────────────────────────────────────────── */}
        {activeTab === 'recent' && (
          <div className="px-5 py-4">
            {recentTen.length === 0 ? (
              <EmptyState message="No recent explanations to show." />
            ) : (
              <div className="space-y-2">
                {recentTen.map((explanation) => (
                  <ExplanationCard
                    key={explanation.id}
                    explanation={explanation}
                    onReverse={onReverse}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: WHY DID ATLAS... ────────────────────────────────────────── */}
        {activeTab === 'search' && (
          <div className="px-5 py-4 space-y-4">
            {/* Search input */}
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.25" />
                  <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='e.g. "get harder in Crucible" or "changed behavior"'
                className={[
                  'w-full pl-9 pr-4 py-2.5 text-sm rounded-lg',
                  'bg-white/[0.03] border border-white/[0.08]',
                  'text-slate-200 placeholder:text-slate-600',
                  'focus:outline-none focus:border-teal-500/50 focus:bg-white/[0.05]',
                  'transition-all duration-150',
                ].join(' ')}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  aria-label="Clear search"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>

            {/* Quick filter pills */}
            <QuickFilterPills
              onSelect={(query) => setSearchQuery(query)}
              activeQuery={searchQuery}
            />

            {/* Results */}
            {!searchQuery ? (
              <div className="space-y-2">
                {recentExplanations.length === 0 ? (
                  <EmptyState message="No explanations yet. Start a session and Atlas will start tracking." />
                ) : (
                  <>
                    <SectionLabel>All Explanations ({recentExplanations.length})</SectionLabel>
                    <div className="space-y-2 mt-2">
                      {recentExplanations.map((explanation) => (
                        <ExplanationCard
                          key={explanation.id}
                          explanation={explanation}
                          onReverse={onReverse}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : searchResults.length === 0 ? (
              <EmptyState
                message={`No explanations match "${searchQuery}". Try different keywords.`}
              />
            ) : (
              <div className="space-y-2">
                <SectionLabel>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"</SectionLabel>
                <div className="space-y-2 mt-2">
                  {searchResults.map((explanation) => (
                    <ExplanationCard
                      key={explanation.id}
                      explanation={explanation}
                      onReverse={onReverse}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-[10px] font-semibold tracking-widest uppercase text-slate-600">
    {children}
  </h3>
);

interface QuickFilterPillsProps {
  onSelect: (query: string) => void;
  activeQuery: string;
}

const QUICK_FILTERS: Array<{ label: string; query: string; color: ActionColor }> = [
  { label: 'Behavior Changes', query: 'changed behavior', color: 'gold' },
  { label: 'Crucible Pressure', query: 'harder crucible', color: 'teal' },
  { label: 'Uncertainty', query: 'uncertain', color: 'amber' },
  { label: 'Constitution', query: 'constitution blocked', color: 'red' },
  { label: 'Goals', query: 'goal', color: 'amber' },
  { label: 'Resonance', query: 'resonance guardrail', color: 'teal' },
];

const QuickFilterPills: React.FC<QuickFilterPillsProps> = ({ onSelect, activeQuery }) => (
  <div className="flex flex-wrap gap-1.5">
    {QUICK_FILTERS.map((filter) => {
      const styles = COLOR_STYLES[filter.color];
      const isActive = activeQuery === filter.query;
      return (
        <button
          key={filter.label}
          onClick={() => onSelect(isActive ? '' : filter.query)}
          className={[
            'text-[11px] px-2.5 py-1 rounded-full border transition-all duration-150',
            isActive
              ? `${styles.badge} ${styles.badgeText} border-opacity-60`
              : 'bg-white/[0.02] border-white/[0.06] text-slate-500 hover:text-slate-300 hover:border-white/10',
          ].join(' ')}
        >
          {filter.label}
        </button>
      );
    })}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export default ExplainabilityPanel;
export type { ExplainabilityPanelProps };
