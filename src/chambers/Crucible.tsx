// ─── Atlas Crucible — Main UI Component ──────────────────────────────────────
// Adversarial reasoning chamber. Three phases: Entry → Debate → Analysis.
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  type FC,
  type KeyboardEvent,
} from 'react';

import {
  useCrucibleStore,
  selectRoundCount,
  selectVerdictScore,
  selectCanSubmit,
  selectCanEnter,
  selectLastRound,
  selectWeaknessCount,
  selectConcessionCount,
} from '../store/useCrucibleStore';

import type {
  CrucibleDomain,
  CrucibleRound,
  ArgumentWeakness,
  ClosingAnalysis,
  CrucibleSession,
} from '../lib/crucibleEngine';

// ── Constants ─────────────────────────────────────────────────────────────────

const DOMAINS: { id: CrucibleDomain; label: string }[] = [
  { id: 'philosophy', label: 'Philosophy' },
  { id: 'politics', label: 'Politics' },
  { id: 'science', label: 'Science' },
  { id: 'ethics', label: 'Ethics' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'economics', label: 'Economics' },
  { id: 'history', label: 'History' },
  { id: 'technology', label: 'Technology' },
];

const WEAKNESS_LABELS: Record<string, string> = {
  logical_fallacy: 'Logical Fallacy',
  unsupported_claim: 'Unsupported Claim',
  false_premise: 'False Premise',
  scope_creep: 'Scope Creep',
  false_dichotomy: 'False Dichotomy',
  circular_reasoning: 'Circular Reasoning',
  appeal_to_authority: 'Appeal to Authority',
  overgeneralization: 'Overgeneralization',
  missing_context: 'Missing Context',
  internal_contradiction: 'Internal Contradiction',
  definitional_ambiguity: 'Definitional Ambiguity',
  evidence_gap: 'Evidence Gap',
};

const SEVERITY_COLORS: Record<string, string> = {
  minor: 'text-yellow-400/70',
  moderate: 'text-amber-400',
  significant: 'text-orange-400',
  fatal: 'text-red-500',
};

const GRADE_COLORS: Record<string, string> = {
  A: 'text-teal-400',
  B: 'text-blue-400',
  C: 'text-yellow-400',
  D: 'text-orange-400',
  F: 'text-red-500',
};

// ── Utility helpers ───────────────────────────────────────────────────────────

function verdictLabel(score: number): string {
  if (score >= 0.8) return 'POSITION STANDS';
  if (score >= 0.6) return 'POSITION HOLDING';
  if (score >= 0.45) return 'CONTESTED';
  if (score >= 0.25) return 'POSITION WEAKENING';
  return 'POSITION COLLAPSED';
}

function verdictColor(score: number): string {
  if (score >= 0.6) return '#00d4aa';
  if (score >= 0.45) return '#c9a84c';
  return '#e74c3c';
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function domainLabel(d: CrucibleDomain): string {
  return d.charAt(0).toUpperCase() + d.slice(1);
}

// ── Sub-components ────────────────────────────────────────────────────────────

// ── Animated verdict meter ─────────────────────────────────────────────────

const VerdictMeter: FC<{ score: number; className?: string }> = ({ score, className = '' }) => {
  const pct = Math.round(score * 100);
  const barColor = score >= 0.6 ? '#00d4aa' : score >= 0.45 ? '#c9a84c' : '#e74c3c';
  const label = verdictLabel(score);

  return (
    <div className={`w-full ${className}`}>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-[10px] font-mono text-teal-400/70 tracking-widest uppercase">
          POSITION STANDS
        </span>
        <span className="text-[10px] font-mono text-red-500/70 tracking-widest uppercase">
          COLLAPSED
        </span>
      </div>
      <div className="relative h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/10">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, background: barColor }}
        />
        {/* Center marker */}
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/20" />
      </div>
      <div className="mt-1.5 text-center">
        <span
          className="text-[11px] font-mono font-bold tracking-[0.2em] uppercase"
          style={{ color: barColor }}
        >
          {label}
        </span>
      </div>
    </div>
  );
};

// ── Weakness badge ────────────────────────────────────────────────────────────

const WeaknessBadge: FC<{ weakness: ArgumentWeakness }> = ({ weakness }) => (
  <li className="flex gap-2 items-start py-1">
    <span className="mt-0.5 shrink-0">
      <span
        className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${SEVERITY_COLORS[weakness.severity]} border-current/30`}
      >
        {weakness.severity}
      </span>
    </span>
    <span className="text-sm text-white/75 leading-relaxed">
      <span className="font-semibold text-amber-400/90">
        {WEAKNESS_LABELS[weakness.type] ?? weakness.type}:{' '}
      </span>
      {weakness.description}
    </span>
  </li>
);

// ── Round card ────────────────────────────────────────────────────────────────

const RoundCard: FC<{ round: CrucibleRound; isLatest?: boolean }> = ({
  round,
  isLatest = false,
}) => {
  const delta = round.verdictDelta;
  const deltaSign = delta >= 0 ? '+' : '';
  const deltaColor = delta >= 0 ? '#00d4aa' : '#e74c3c';
  const deltaLabel = delta >= 0.01 ? 'position strengthened' : delta <= -0.01 ? 'position weakened' : 'no change';

  return (
    <div
      className={`rounded-lg border overflow-hidden transition-all duration-300 ${
        isLatest
          ? 'border-[#c9a84c]/40 shadow-[0_0_24px_rgba(201,168,76,0.08)]'
          : 'border-white/10'
      }`}
      style={{ background: 'rgba(26,10,46,0.6)' }}
    >
      {/* Round header */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b border-white/10"
        style={{ background: 'rgba(45,27,78,0.5)' }}
      >
        <span className="text-xs font-mono font-bold tracking-[0.25em] text-[#c9a84c] uppercase">
          Round {round.roundNumber}
        </span>
        <span className="text-xs font-mono text-white/30">
          {formatTimestamp(round.timestamp)}
        </span>
      </div>

      <div className="p-4 space-y-5">
        {/* User argument */}
        <div>
          <div className="text-[10px] font-mono font-bold tracking-[0.2em] text-white/40 uppercase mb-2">
            User Argument
          </div>
          <div className="h-px w-full bg-white/10 mb-3" />
          <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
            {round.userArgument}
          </p>
        </div>

        {/* Atlas analysis */}
        <div className="border border-white/10 rounded-md overflow-hidden">
          <div
            className="px-4 py-2 border-b border-white/10"
            style={{ background: 'rgba(45,27,78,0.6)' }}
          >
            <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-[#4a9eff] uppercase">
              Atlas Analysis
            </span>
          </div>

          <div className="p-4 space-y-4">
            {/* Counter-argument */}
            <div>
              <div className="text-[10px] font-mono font-bold tracking-[0.15em] uppercase mb-1.5"
                style={{ color: '#e74c3c' }}>
                Counter-Argument:
              </div>
              <div className="h-px w-full bg-white/10 mb-2.5" />
              <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
                {round.atlasResponse.counterArgument}
              </p>
            </div>

            {/* Weaknesses */}
            {round.atlasResponse.weaknesses.length > 0 && (
              <div>
                <div className="text-[10px] font-mono font-bold tracking-[0.15em] uppercase mb-1.5"
                  style={{ color: '#e67e22' }}>
                  Weaknesses Identified:
                </div>
                <div className="h-px w-full bg-white/10 mb-2.5" />
                <ul className="space-y-1">
                  {round.atlasResponse.weaknesses.map((w, i) => (
                    <WeaknessBadge key={i} weakness={w} />
                  ))}
                </ul>
              </div>
            )}

            {/* Advisory */}
            {round.atlasResponse.advisory && (
              <div>
                <div className="text-[10px] font-mono font-bold tracking-[0.15em] uppercase mb-1.5"
                  style={{ color: '#00d4aa' }}>
                  Advisory:
                </div>
                <div className="h-px w-full bg-white/10 mb-2.5" />
                <p className="text-sm italic leading-relaxed"
                  style={{ color: '#00d4aa' }}>
                  {round.atlasResponse.advisory}
                </p>
              </div>
            )}

            {/* Verdict shift */}
            <div className="flex items-center gap-3 pt-1 border-t border-white/10">
              <span className="text-[10px] font-mono font-bold tracking-[0.15em] uppercase text-white/40">
                Verdict Shift:
              </span>
              <span
                className="text-xs font-mono font-bold"
                style={{ color: deltaColor }}
              >
                {deltaSign}{delta.toFixed(2)} ({deltaLabel})
              </span>
              {round.atlasResponse.verdictAssessment && (
                <span className="text-xs text-white/40 italic ml-auto hidden sm:block">
                  {round.atlasResponse.verdictAssessment}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Phase 1: Arena Entry ──────────────────────────────────────────────────────

const ArenaEntry: FC = () => {
  const {
    currentThesis,
    selectedDomain,
    thesisMode,
    generatingTopic,
    error,
    setCurrentThesis,
    setSelectedDomain,
    setThesisMode,
    requestTopic,
    startSession,
    clearError,
  } = useCrucibleStore();

  const canEnter = currentThesis.trim().length > 0 && !generatingTopic;

  const handleEnter = useCallback(() => {
    if (!canEnter) return;
    const domain = selectedDomain ?? 'open';
    const source = thesisMode === 'atlas_generated' ? 'atlas_generated' : 'user';
    startSession(currentThesis, domain, source);
  }, [canEnter, currentThesis, selectedDomain, thesisMode, startSession]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canEnter) {
        e.preventDefault();
        handleEnter();
      }
    },
    [canEnter, handleEnter]
  );

  const handleDomainSelect = useCallback(
    async (domain: CrucibleDomain) => {
      clearError();
      if (selectedDomain === domain && thesisMode === 'atlas_generated') {
        // Re-generate if same domain clicked again
        await requestTopic(domain);
      } else {
        await requestTopic(domain);
      }
    },
    [selectedDomain, thesisMode, requestTopic, clearError]
  );

  const handleThesisChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setCurrentThesis(e.target.value);
      clearError();
    },
    [setCurrentThesis, clearError]
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: 'linear-gradient(135deg, #0a0a0f 0%, #0f0620 50%, #0a0a0f 100%)' }}>

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(ellipse, #4a1a8a 0%, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      <div className="relative z-10 w-full max-w-3xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="h-px w-12 bg-[#c9a84c]/40" />
            <span className="text-[10px] font-mono tracking-[0.4em] text-[#c9a84c]/60 uppercase">
              Atlas Protocol
            </span>
            <div className="h-px w-12 bg-[#c9a84c]/40" />
          </div>

          <h1 className="text-5xl sm:text-6xl font-black tracking-[0.15em] uppercase mb-4"
            style={{
              color: '#c9a84c',
              textShadow: '0 0 40px rgba(201,168,76,0.3)',
              fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
            }}>
            The Crucible
          </h1>

          <p className="text-base font-mono tracking-[0.08em] text-white/40 uppercase">
            Truth is the only allegiance. Enter ready to be wrong.
          </p>

          {/* Ornamental divider */}
          <div className="flex items-center justify-center gap-4 mt-6">
            <div className="h-px flex-1 max-w-16" style={{ background: 'linear-gradient(to right, transparent, #c9a84c40)' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-[#c9a84c]/50" />
            <div className="h-px flex-1 max-w-16" style={{ background: 'linear-gradient(to left, transparent, #c9a84c40)' }} />
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-md border border-red-500/30 bg-red-500/10">
            <span className="text-red-400 text-sm font-mono mt-0.5">!</span>
            <p className="text-sm text-red-300/90">{error}</p>
            <button onClick={clearError} className="ml-auto text-red-400/60 hover:text-red-400 text-xs">✕</button>
          </div>
        )}

        {/* Two entry cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          {/* Card 1: Bring a Position */}
          <div
            className={`rounded-lg border p-5 cursor-pointer transition-all duration-200 group ${
              thesisMode === 'user'
                ? 'border-[#c9a84c]/50 shadow-[0_0_20px_rgba(201,168,76,0.1)]'
                : 'border-white/10 hover:border-white/20'
            }`}
            style={{ background: 'rgba(26,10,46,0.7)' }}
            onClick={() => { setThesisMode('user'); clearError(); }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2 h-2 rounded-full transition-colors ${thesisMode === 'user' ? 'bg-[#c9a84c]' : 'bg-white/20'}`} />
              <h2 className={`text-xs font-mono font-bold tracking-[0.2em] uppercase transition-colors ${
                thesisMode === 'user' ? 'text-[#c9a84c]' : 'text-white/50 group-hover:text-white/70'
              }`}>
                Bring a Position
              </h2>
            </div>
            <p className="text-xs text-white/40 mb-4 leading-relaxed">
              State your thesis. Atlas will oppose it.
            </p>
            <textarea
              rows={4}
              className="w-full text-sm text-white/80 bg-transparent border border-white/10 rounded px-3 py-2.5 resize-none focus:outline-none focus:border-[#c9a84c]/40 placeholder-white/20 leading-relaxed"
              placeholder="e.g. 'Free will is an illusion' / 'Centralized AI governance is necessary' / 'Stoicism is the superior philosophical framework'"
              value={thesisMode === 'user' ? currentThesis : ''}
              onChange={handleThesisChange}
              onKeyDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => {
                e.stopPropagation();
                setThesisMode('user');
              }}
            />
          </div>

          {/* Card 2: Request a Topic */}
          <div
            className={`rounded-lg border p-5 transition-all duration-200 group ${
              thesisMode === 'atlas_generated'
                ? 'border-[#4a9eff]/50 shadow-[0_0_20px_rgba(74,158,255,0.1)]'
                : 'border-white/10 hover:border-white/20'
            }`}
            style={{ background: 'rgba(26,10,46,0.7)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2 h-2 rounded-full transition-colors ${thesisMode === 'atlas_generated' ? 'bg-[#4a9eff]' : 'bg-white/20'}`} />
              <h2 className={`text-xs font-mono font-bold tracking-[0.2em] uppercase transition-colors ${
                thesisMode === 'atlas_generated' ? 'text-[#4a9eff]' : 'text-white/50'
              }`}>
                Request a Topic
              </h2>
            </div>
            <p className="text-xs text-white/40 mb-4 leading-relaxed">
              Select a domain. Atlas generates a proposition.
            </p>

            {/* Domain pills */}
            <div className="flex flex-wrap gap-2">
              {DOMAINS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => handleDomainSelect(d.id)}
                  disabled={generatingTopic}
                  className={`text-[11px] font-mono px-2.5 py-1 rounded border transition-all duration-150 ${
                    selectedDomain === d.id && thesisMode === 'atlas_generated'
                      ? 'border-[#4a9eff]/60 bg-[#4a9eff]/15 text-[#4a9eff]'
                      : 'border-white/15 text-white/40 hover:border-white/30 hover:text-white/60'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {/* Generated thesis display */}
            {thesisMode === 'atlas_generated' && (
              <div className="mt-4">
                {generatingTopic ? (
                  <div className="flex items-center gap-2 text-xs text-[#4a9eff]/60 font-mono">
                    <span className="animate-pulse">Generating proposition...</span>
                  </div>
                ) : currentThesis ? (
                  <div className="rounded border border-[#4a9eff]/20 bg-[#4a9eff]/5 px-3 py-2.5">
                    <p className="text-sm text-white/80 leading-relaxed italic">
                      "{currentThesis}"
                    </p>
                    {selectedDomain && (
                      <button
                        onClick={() => handleDomainSelect(selectedDomain)}
                        className="mt-2 text-[10px] font-mono text-[#4a9eff]/50 hover:text-[#4a9eff] transition-colors"
                      >
                        Regenerate →
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Enter button */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleEnter}
            disabled={!canEnter}
            className="w-full max-w-sm relative px-8 py-4 rounded text-sm font-mono font-bold tracking-[0.3em] uppercase transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: canEnter
                ? 'linear-gradient(135deg, #c9a84c 0%, #a07830 100%)'
                : 'rgba(201,168,76,0.1)',
              color: canEnter ? '#0a0a0f' : '#c9a84c',
              border: '1px solid rgba(201,168,76,0.3)',
              boxShadow: canEnter ? '0 0 30px rgba(201,168,76,0.2)' : 'none',
            }}
          >
            Enter the Crucible
          </button>
          <p className="text-[10px] font-mono text-white/20 tracking-widest">
            ⌘↵ to enter
          </p>
        </div>
      </div>
    </div>
  );
};

// ── Phase 2: The Debate ───────────────────────────────────────────────────────

const DebateArena: FC = () => {
  const {
    session,
    currentInput,
    isAtlasThinking,
    pendingClarification,
    error,
    setCurrentInput,
    submitArgument,
    requestClarification,
    concede,
    endSession,
    clearError,
  } = useCrucibleStore();

  const roundCount = useCrucibleStore(selectRoundCount);
  const verdictScore = useCrucibleStore(selectVerdictScore);
  const canSubmit = useCrucibleStore(selectCanSubmit);
  const weaknessCount = useCrucibleStore(selectWeaknessCount);
  const concessionCount = useCrucibleStore(selectConcessionCount);

  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showConcedeConfirm, setShowConcedeConfirm] = useState(false);

  // Scroll to latest round
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [session?.rounds.length, isAtlasThinking]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    await submitArgument(currentInput);
    inputRef.current?.focus();
  }, [canSubmit, currentInput, submitArgument]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSubmit) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [canSubmit, handleSubmit]
  );

  const nextRound = roundCount + 1;
  const remainingRounds = 10 - roundCount;

  if (!session) return null;

  return (
    <div className="min-h-screen flex flex-col"
      style={{ background: '#0a0a0f' }}>

      {/* Top bar */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0"
        style={{ background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(12px)' }}
      >
        <div className="flex items-center gap-4">
          <span className="text-xs font-mono font-bold tracking-[0.25em] text-[#c9a84c] uppercase">
            The Crucible
          </span>
          <div className="h-4 w-px bg-white/10" />
          <span className="text-xs font-mono text-white/30 uppercase tracking-widest">
            {domainLabel(session.domain)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-white/30">
            {remainingRounds} round{remainingRounds !== 1 ? 's' : ''} remaining
          </span>
          <button
            onClick={() => endSession()}
            className="text-[10px] font-mono px-2.5 py-1 rounded border border-white/10 text-white/30 hover:text-white/60 hover:border-white/20 transition-colors"
          >
            End Session
          </button>
        </div>
      </div>

      {/* Main split layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left panel: THE POSITION ─────────────────────────────────────── */}
        <div
          className="w-72 shrink-0 border-r border-white/10 flex flex-col overflow-y-auto p-5 gap-5 hidden lg:flex"
          style={{ background: 'rgba(13,7,26,0.8)' }}
        >
          {/* Thesis */}
          <div>
            <div className="text-[10px] font-mono font-bold tracking-[0.25em] text-white/30 uppercase mb-2">
              The Position
            </div>
            <div
              className="rounded-md border border-[#c9a84c]/30 p-3"
              style={{ background: 'rgba(201,168,76,0.05)' }}
            >
              <p className="text-sm text-white/80 leading-relaxed italic">
                "{session.thesis}"
              </p>
            </div>
          </div>

          {/* Round counter */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
              Round
            </span>
            <span className="text-2xl font-black font-mono" style={{ color: '#c9a84c' }}>
              {roundCount === 0 ? '—' : roundCount}
            </span>
          </div>

          {/* Session metrics */}
          <div className="space-y-2.5">
            <div className="text-[10px] font-mono font-bold tracking-[0.2em] text-white/30 uppercase mb-1">
              Session Metrics
            </div>
            <MetricRow label="Arguments Made" value={roundCount} />
            <MetricRow label="Weaknesses Identified" value={weaknessCount} accent="amber" />
            <MetricRow label="Rounds Strengthened" value={concessionCount} accent="teal" />
          </div>

          {/* Verdict meter */}
          <div>
            <div className="text-[10px] font-mono font-bold tracking-[0.2em] text-white/30 uppercase mb-3">
              Verdict Meter
            </div>
            <VerdictMeter score={verdictScore} />
          </div>

          {/* Action buttons */}
          <div className="mt-auto space-y-2">
            <button
              onClick={() => requestClarification()}
              disabled={roundCount === 0 || pendingClarification || isAtlasThinking}
              className="w-full text-[11px] font-mono px-3 py-2 rounded border border-[#4a9eff]/30 text-[#4a9eff]/70 hover:bg-[#4a9eff]/10 hover:text-[#4a9eff] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {pendingClarification ? 'Requesting...' : 'Request Clarification'}
            </button>

            {showConcedeConfirm ? (
              <div className="space-y-2">
                <p className="text-[10px] font-mono text-red-400/80 text-center">
                  Formally concede the debate?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowConcedeConfirm(false); concede(); }}
                    className="flex-1 text-[11px] font-mono py-1.5 rounded border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    Concede
                  </button>
                  <button
                    onClick={() => setShowConcedeConfirm(false)}
                    className="flex-1 text-[11px] font-mono py-1.5 rounded border border-white/10 text-white/40 hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowConcedeConfirm(true)}
                disabled={isAtlasThinking}
                className="w-full text-[11px] font-mono px-3 py-2 rounded border border-red-500/20 text-red-500/50 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/40 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Concede
              </button>
            )}
          </div>
        </div>

        {/* ── Right panel: DEBATE THREAD ────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile thesis bar */}
          <div className="lg:hidden px-4 py-3 border-b border-white/10 bg-[#0d071a]/80">
            <p className="text-xs text-white/50 italic truncate">"{session.thesis}"</p>
            <VerdictMeter score={verdictScore} className="mt-2" />
          </div>

          {/* Thread scroll area */}
          <div
            ref={threadRef}
            className="flex-1 overflow-y-auto px-4 py-6 space-y-6"
            style={{ scrollBehavior: 'smooth' }}
          >
            {session.rounds.length === 0 && !isAtlasThinking ? (
              <EmptyThread thesis={session.thesis} roundNumber={nextRound} />
            ) : (
              session.rounds.map((round, i) => (
                <RoundCard
                  key={round.roundNumber}
                  round={round}
                  isLatest={i === session.rounds.length - 1}
                />
              ))
            )}

            {/* Atlas thinking indicator */}
            {isAtlasThinking && (
              <div
                className="rounded-lg border border-[#4a9eff]/20 p-5 animate-pulse"
                style={{ background: 'rgba(74,158,255,0.04)' }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-[#4a9eff]/60 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-mono text-[#4a9eff]/60 tracking-widest uppercase">
                    Atlas is constructing counter-argument...
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Error bar */}
          {error && (
            <div className="mx-4 mb-2 flex items-center gap-3 px-3 py-2 rounded border border-red-500/30 bg-red-500/10">
              <span className="text-red-400 text-xs font-mono">!</span>
              <p className="text-xs text-red-300/90 flex-1">{error}</p>
              <button onClick={clearError} className="text-red-400/60 hover:text-red-400 text-xs">✕</button>
            </div>
          )}

          {/* ── Input bar ─────────────────────────────────────────────────── */}
          <div
            className="shrink-0 border-t border-white/10 p-4"
            style={{ background: 'rgba(10,10,15,0.98)', backdropFilter: 'blur(12px)' }}
          >
            <div className="flex gap-3 items-end">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  rows={3}
                  value={currentInput}
                  onChange={(e) => { setCurrentInput(e.target.value); clearError(); }}
                  onKeyDown={handleKeyDown}
                  disabled={isAtlasThinking || session.status !== 'active'}
                  placeholder={`State your argument for Round ${nextRound}...`}
                  className="w-full text-sm text-white/80 bg-[#13082a] border border-white/10 rounded-md px-4 py-3 resize-none focus:outline-none focus:border-[#c9a84c]/30 placeholder-white/20 leading-relaxed disabled:opacity-40"
                />
                <div className="absolute bottom-2.5 right-3 flex items-center gap-2">
                  <span className={`text-[10px] font-mono ${currentInput.length < 50 ? 'text-red-400/50' : 'text-white/25'}`}>
                    {currentInput.length}/50+
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2 shrink-0">
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="px-5 py-2.5 rounded text-xs font-mono font-bold tracking-[0.2em] uppercase transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    background: canSubmit
                      ? 'linear-gradient(135deg, #c9a84c 0%, #a07830 100%)'
                      : 'rgba(201,168,76,0.1)',
                    color: canSubmit ? '#0a0a0f' : '#c9a84c',
                    border: '1px solid rgba(201,168,76,0.3)',
                    boxShadow: canSubmit ? '0 0 20px rgba(201,168,76,0.2)' : 'none',
                  }}
                >
                  Submit
                  <br />
                  Argument
                </button>
                <span className="text-[9px] font-mono text-white/20 text-center">
                  ⌘↵
                </span>
              </div>
            </div>

            {/* Mobile metrics row */}
            <div className="lg:hidden flex items-center justify-between mt-3 pt-3 border-t border-white/10">
              <span className="text-[10px] font-mono text-white/30">Round {roundCount === 0 ? '—' : roundCount}</span>
              <span className="text-[10px] font-mono text-amber-400/70">{weaknessCount} weaknesses</span>
              <button onClick={() => setShowConcedeConfirm(true)} className="text-[10px] font-mono text-red-500/40 hover:text-red-400 transition-colors">
                Concede
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile concede confirm overlay */}
      {showConcedeConfirm && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/70 flex items-end pb-[env(safe-area-inset-bottom,0px)]">
          <div className="w-full bg-[#0d071a] border-t border-white/10 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-4">
            <p className="text-sm font-mono text-white/70 text-center">Formally concede the debate?</p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowConcedeConfirm(false); concede(); }}
                className="atlas-touch-min flex-1 py-3 rounded border border-red-500/50 text-red-400 font-mono text-sm hover:bg-red-500/10 transition-all"
              >Concede</button>
              <button
                onClick={() => setShowConcedeConfirm(false)}
                className="atlas-touch-min flex-1 py-3 rounded border border-white/10 text-white/40 font-mono text-sm hover:bg-white/5 transition-all"
              >Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Empty thread state ────────────────────────────────────────────────────────

const EmptyThread: FC<{ thesis: string; roundNumber: number }> = ({ thesis, roundNumber }) => (
  <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-8">
    <div className="w-16 h-16 rounded-full border border-[#c9a84c]/20 flex items-center justify-center mb-6"
      style={{ background: 'rgba(201,168,76,0.05)' }}>
      <span className="text-[#c9a84c]/50 text-2xl font-mono">⚖</span>
    </div>
    <h3 className="text-sm font-mono font-bold tracking-[0.2em] text-white/40 uppercase mb-3">
      Debate Chamber Ready
    </h3>
    <p className="text-xs text-white/25 max-w-md leading-relaxed font-mono">
      The thesis is set. Atlas awaits your opening argument for Round {roundNumber}.
      Make it substantive — a single sentence will be rejected.
    </p>
    <div className="mt-6 px-4 py-2 rounded border border-[#c9a84c]/15 bg-[#c9a84c]/5">
      <p className="text-xs text-[#c9a84c]/60 italic">"{thesis}"</p>
    </div>
  </div>
);

// ── Metric row ────────────────────────────────────────────────────────────────

const MetricRow: FC<{ label: string; value: number; accent?: 'amber' | 'teal' | 'default' }> = ({
  label, value, accent = 'default'
}) => {
  const color = accent === 'amber' ? '#e67e22' : accent === 'teal' ? '#00d4aa' : '#4a9eff';
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-mono text-white/30">{label}</span>
      <span className="text-sm font-mono font-bold" style={{ color }}>{value}</span>
    </div>
  );
};

// ── Phase 3: Closing Analysis ─────────────────────────────────────────────────

const ClosingAnalysisView: FC = () => {
  const { session, generatingAnalysis, resetCrucible } = useCrucibleStore();
  const reportRef = useRef<HTMLDivElement>(null);

  if (!session) return null;

  const analysis = session.closingAnalysis;
  const duration = session.endedAt
    ? `${session.rounds.length} round${session.rounds.length !== 1 ? 's' : ''}`
    : `${session.rounds.length} round${session.rounds.length !== 1 ? 's' : ''}`;

  const finalVerdictText =
    analysis?.finalVerdict === 'position_stood'
      ? 'POSITION STOOD'
      : analysis?.finalVerdict === 'position_partial'
      ? 'POSITION PARTIALLY COLLAPSED'
      : 'POSITION COLLAPSED';

  const finalVerdictColor =
    analysis?.finalVerdict === 'position_stood'
      ? '#00d4aa'
      : analysis?.finalVerdict === 'position_partial'
      ? '#c9a84c'
      : '#e74c3c';

  const handlePrint = () => {
    window.print();
  };

  if (generatingAnalysis) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center"
        style={{ background: '#0a0a0f' }}>
        <div className="text-center space-y-4">
          <div className="flex gap-2 justify-center">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-[#c9a84c]/60 animate-bounce"
                style={{ animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </div>
          <p className="text-sm font-mono text-white/40 tracking-[0.2em] uppercase">
            Generating Closing Analysis...
          </p>
          <p className="text-xs font-mono text-white/20">
            Atlas is reviewing {session.rounds.length} rounds of debate
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen pb-24"
      style={{ background: 'linear-gradient(180deg, #0a0a0f 0%, #0d071a 100%)' }}
    >
      {/* Print styles injected inline */}
      <style>{`
        @media print {
          body { background: white; color: black; }
          .no-print { display: none !important; }
          .print-area { padding: 20px; }
        }
      `}</style>

      {/* Top bar */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between px-6 py-3 border-b border-white/10"
        style={{ background: 'rgba(10,10,15,0.97)', backdropFilter: 'blur(12px)' }}>
        <span className="text-xs font-mono font-bold tracking-[0.25em] text-[#c9a84c] uppercase">
          Crucible Report
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="text-[11px] font-mono px-3 py-1.5 rounded border border-white/15 text-white/40 hover:text-white/70 hover:border-white/25 transition-colors"
          >
            Export PDF
          </button>
          <button
            onClick={resetCrucible}
            className="text-[11px] font-mono px-3 py-1.5 rounded border border-[#c9a84c]/30 text-[#c9a84c]/70 hover:bg-[#c9a84c]/10 hover:text-[#c9a84c] transition-all"
          >
            New Session
          </button>
        </div>
      </div>

      {/* Report */}
      <div ref={reportRef} className="print-area max-w-3xl mx-auto px-6 py-10 space-y-10">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-3">
            <div className="h-px w-10 bg-[#c9a84c]/30" />
            <span className="text-[10px] font-mono tracking-[0.4em] text-[#c9a84c]/50 uppercase">
              Crucible Report
            </span>
            <div className="h-px w-10 bg-[#c9a84c]/30" />
          </div>

          <div
            className="rounded-lg border border-[#c9a84c]/20 p-4"
            style={{ background: 'rgba(201,168,76,0.04)' }}
          >
            <p className="text-base text-white/80 italic leading-relaxed">"{session.thesis}"</p>
          </div>

          <div className="flex items-center justify-center gap-6 text-[10px] font-mono text-white/30">
            <span>{duration}</span>
            <span>·</span>
            <span>{formatTimestamp(session.startedAt)}</span>
            <span>·</span>
            <span className="uppercase">{domainLabel(session.domain)}</span>
          </div>
        </div>

        {/* Final verdict */}
        {analysis && (
          <div
            className="rounded-lg border p-5 text-center"
            style={{
              borderColor: finalVerdictColor + '40',
              background: `${finalVerdictColor}08`,
            }}
          >
            <div className="text-[10px] font-mono tracking-[0.3em] text-white/30 uppercase mb-2">
              Final Verdict
            </div>
            <h2
              className="text-2xl font-black font-mono tracking-[0.15em] uppercase"
              style={{ color: finalVerdictColor, textShadow: `0 0 30px ${finalVerdictColor}50` }}
            >
              {finalVerdictText}
            </h2>
            <div className="mt-4">
              <VerdictMeter score={session.verdictScore} />
            </div>
          </div>
        )}

        {/* Grade */}
        {analysis && (
          <div className="flex items-center gap-4 rounded-lg border border-white/10 p-5"
            style={{ background: 'rgba(26,10,46,0.5)' }}>
            <div
              className="text-5xl font-black font-mono"
              style={{ color: GRADE_COLORS[analysis.grade] }}
            >
              {analysis.grade}
            </div>
            <div>
              <div className="text-[10px] font-mono tracking-[0.2em] text-white/30 uppercase mb-1">
                Crucible Grade
              </div>
              <p className="text-sm text-white/60 italic">{analysis.gradeJustification}</p>
            </div>
          </div>
        )}

        {analysis ? (
          <>
            {/* Summary */}
            <AnalysisSection title="Debate Summary">
              <div className="prose prose-invert prose-sm max-w-none">
                {analysis.summary.split('\n\n').map((para, i) => (
                  <p key={i} className="text-sm text-white/70 leading-relaxed mb-3 last:mb-0">
                    {para}
                  </p>
                ))}
              </div>
            </AnalysisSection>

            {/* Strongest arguments */}
            {analysis.strongArguments.length > 0 && (
              <AnalysisSection title="Your Strongest Arguments" accent="teal">
                <ul className="space-y-3">
                  {analysis.strongArguments.map((a, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-[#00d4aa] font-mono text-sm mt-0.5 shrink-0">▸</span>
                      <div>
                        <p className="text-sm font-semibold text-white/80">{a.argument}</p>
                        <p className="text-xs text-white/40 mt-0.5 italic">{a.reason}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </AnalysisSection>
            )}

            {/* Weakest arguments */}
            {analysis.weakArguments.length > 0 && (
              <AnalysisSection title="Your Weakest Arguments" accent="red">
                <ul className="space-y-3">
                  {analysis.weakArguments.map((a, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-red-400 font-mono text-sm mt-0.5 shrink-0">▸</span>
                      <div>
                        <p className="text-sm font-semibold text-white/80">{a.argument}</p>
                        <p className="text-xs text-white/40 mt-0.5 italic">{a.reason}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </AnalysisSection>
            )}

            {/* Recurring patterns */}
            {analysis.recurringPatterns.length > 0 && (
              <AnalysisSection title="Recurring Patterns in Your Thinking" accent="amber">
                <ul className="space-y-2">
                  {analysis.recurringPatterns.map((p, i) => (
                    <li key={i} className="flex gap-3 items-start">
                      <span className="text-amber-400 font-mono text-xs mt-1 shrink-0">◆</span>
                      <p className="text-sm text-white/70 leading-relaxed">{p}</p>
                    </li>
                  ))}
                </ul>
              </AnalysisSection>
            )}

            {/* Atlas's assessment */}
            <AnalysisSection title="Atlas's Assessment of Your Position" accent="blue">
              <div
                className="rounded-md border border-[#4a9eff]/15 p-4"
                style={{ background: 'rgba(74,158,255,0.04)' }}
              >
                <p className="text-sm text-white/75 leading-relaxed italic">
                  {analysis.atlasAssessment}
                </p>
              </div>
            </AnalysisSection>

            {/* What to study */}
            {analysis.studyRecommendations.length > 0 && (
              <AnalysisSection title="What to Study">
                <ul className="space-y-2">
                  {analysis.studyRecommendations.map((r, i) => (
                    <li key={i} className="flex gap-3 items-start">
                      <span className="text-white/20 font-mono text-xs mt-1 shrink-0">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <p className="text-sm text-white/65 leading-relaxed">{r}</p>
                    </li>
                  ))}
                </ul>
              </AnalysisSection>
            )}

            {/* Sharpening recommendations */}
            {analysis.sharpeningRecommendations.length > 0 && (
              <AnalysisSection title="Sharpening Recommendations" accent="gold">
                <ul className="space-y-3">
                  {analysis.sharpeningRecommendations.map((r, i) => (
                    <li key={i} className="flex gap-3 items-start rounded-md border border-[#c9a84c]/10 p-3"
                      style={{ background: 'rgba(201,168,76,0.04)' }}>
                      <span className="text-[#c9a84c]/50 font-mono font-bold text-xs mt-0.5 shrink-0">
                        {i + 1}.
                      </span>
                      <p className="text-sm text-white/70 leading-relaxed">{r}</p>
                    </li>
                  ))}
                </ul>
              </AnalysisSection>
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-sm font-mono text-white/30">
              Analysis could not be generated. The session data is preserved.
            </p>
          </div>
        )}

        {/* Debate transcript (collapsed) */}
        {session.rounds.length > 0 && (
          <AnalysisSection title="Full Debate Transcript">
            <details className="group">
              <summary className="cursor-pointer text-xs font-mono text-white/30 hover:text-white/50 transition-colors list-none flex items-center gap-2">
                <span className="group-open:hidden">▶ Show {session.rounds.length} round{session.rounds.length !== 1 ? 's' : ''}</span>
                <span className="hidden group-open:inline">▼ Hide transcript</span>
              </summary>
              <div className="mt-5 space-y-5">
                {session.rounds.map((round) => (
                  <RoundCard key={round.roundNumber} round={round} />
                ))}
              </div>
            </details>
          </AnalysisSection>
        )}

        {/* Footer */}
        <div className="text-center pt-6 border-t border-white/10">
          <p className="text-[10px] font-mono text-white/15 tracking-widest uppercase">
            Atlas Crucible · Truth is the only allegiance
          </p>
        </div>
      </div>
    </div>
  );
};

// ── Analysis section wrapper ──────────────────────────────────────────────────

const ACCENT_STYLES: Record<string, { border: string; title: string }> = {
  teal:  { border: 'border-[#00d4aa]/15', title: 'text-[#00d4aa]' },
  red:   { border: 'border-red-500/15',   title: 'text-red-400' },
  amber: { border: 'border-amber-400/15', title: 'text-amber-400' },
  blue:  { border: 'border-[#4a9eff]/15', title: 'text-[#4a9eff]' },
  gold:  { border: 'border-[#c9a84c]/15', title: 'text-[#c9a84c]' },
  default: { border: 'border-white/10',   title: 'text-white/50' },
};

const AnalysisSection: FC<{
  title: string;
  accent?: string;
  children: React.ReactNode;
}> = ({ title, accent = 'default', children }) => {
  const style = ACCENT_STYLES[accent] ?? ACCENT_STYLES.default;

  return (
    <div className={`rounded-lg border ${style.border} overflow-hidden`}
      style={{ background: 'rgba(13,7,26,0.6)' }}>
      <div className="px-5 py-3 border-b border-white/10"
        style={{ background: 'rgba(45,27,78,0.4)' }}>
        <h3 className={`text-[11px] font-mono font-bold tracking-[0.2em] uppercase ${style.title}`}>
          {title}
        </h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
};

// ── Root: Crucible ─────────────────────────────────────────────────────────────

const Crucible: FC = () => {
  const phase = useCrucibleStore((s) => s.phase);
  const loadSessionHistory = useCrucibleStore((s) => s.loadSessionHistory);

  useEffect(() => {
    loadSessionHistory();
  }, [loadSessionHistory]);

  return (
    <div className="crucible-root font-sans" style={{ fontFamily: '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif' }}>
      {phase === 'entry' && <ArenaEntry />}
      {phase === 'debate' && <DebateArena />}
      {phase === 'analysis' && <ClosingAnalysisView />}
    </div>
  );
};

export default Crucible;
