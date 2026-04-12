import React, { useEffect, useRef, useMemo } from 'react';
import {
  UserEvolutionProfile,
  MutationEvent,
  CommunicationArchetype,
} from '../types/evolutionTypes';

// ─── Props ──────────────────────────────────────────────────────────────────

interface EvolutionTimelineProps {
  evolutionProfile: UserEvolutionProfile | null;
  mutationHistory: MutationEvent[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const ARCHETYPE_LABELS: Record<string, string> = {
  unknown: 'UNKNOWN',
  philosopher: 'PHILOSOPHER',
  engineer: 'ENGINEER',
  strategist: 'STRATEGIST',
  storyteller: 'STORYTELLER',
  analyst: 'ANALYST',
  visionary: 'VISIONARY',
  pragmatist: 'PRAGMATIST',
  scholar: 'SCHOLAR',
};

// ─── Change Type Parsing ──────────────────────────────────────────────────────
// Mutations are human-readable strings that begin with +, -, or ~

type ChangeType = 'addition' | 'removal' | 'adjustment' | 'neutral';

function parseChangeType(mutation: string): ChangeType {
  const t = mutation.trim();
  if (t.startsWith('+')) return 'addition';
  if (t.startsWith('-')) return 'removal';
  if (t.startsWith('~')) return 'adjustment';
  return 'neutral';
}

const CHANGE_COLORS: Record<ChangeType, string> = {
  addition: '#00d4aa',
  removal: '#e74c3c',
  adjustment: '#c9a84c',
  neutral: 'rgba(255,255,255,0.25)',
};

const CHANGE_SYMBOLS: Record<ChangeType, string> = {
  addition: '+',
  removal: '−',
  adjustment: '~',
  neutral: '·',
};

// ─── Starfield (empty state) ──────────────────────────────────────────────────

function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth || 600;
    canvas.height = canvas.offsetHeight || 400;

    const stars: { x: number; y: number; r: number; alpha: number; speed: number }[] = [];
    for (let i = 0; i < 120; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.5 + 0.3,
        alpha: Math.random() * 0.5 + 0.1,
        speed: Math.random() * 0.2 + 0.05,
      });
    }

    let t = 0;
    let animId: number;
    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      t += 0.01;
      for (const s of stars) {
        const a = s.alpha * (0.6 + 0.4 * Math.sin(t * s.speed * 10 + s.x));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fill();
      }
      animId = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full opacity-30"
      style={{ pointerEvents: 'none' }}
    />
  );
}

// ─── Special Milestone Markers ────────────────────────────────────────────────

type MilestoneType =
  | 'initialized'
  | 'archetype_identified'
  | 'confidence_25'
  | 'confidence_50'
  | 'confidence_75'
  | 'first_adaptation';

interface Milestone {
  type: MilestoneType;
  timestamp: number;
  label: string;
  sublabel?: string;
}

function detectMilestones(
  history: MutationEvent[],
  profile: UserEvolutionProfile
): Milestone[] {
  const milestones: Milestone[] = [];

  // First contact — always shown at the bottom
  milestones.push({
    type: 'initialized',
    timestamp: profile.firstContact,
    label: 'ATLAS INITIALIZED',
    sublabel: 'First contact established',
  });

  // First adaptation — earliest mutation
  if (history.length > 0) {
    const first = [...history].sort((a, b) => a.timestamp - b.timestamp)[0];
    milestones.push({
      type: 'first_adaptation',
      timestamp: first.timestamp - 1,
      label: 'FIRST ADAPTATION',
      sublabel: 'Atlas changed behavior for the first time',
    });
  }

  // Archetype identified — first mutation where archetype != 'unknown'
  const archetypeReveal = [...history]
    .sort((a, b) => a.timestamp - b.timestamp)
    .find((m) => m.archetype !== 'unknown');
  if (archetypeReveal) {
    milestones.push({
      type: 'archetype_identified',
      timestamp: archetypeReveal.timestamp,
      label: `ARCHETYPE IDENTIFIED: ${ARCHETYPE_LABELS[archetypeReveal.archetype] ?? archetypeReveal.archetype.toUpperCase()}`,
      sublabel: 'Cognitive signature crystallized',
    });
  }

  // Confidence milestones
  const thresholds = [
    { pct: 25, type: 'confidence_25' as MilestoneType },
    { pct: 50, type: 'confidence_50' as MilestoneType },
    { pct: 75, type: 'confidence_75' as MilestoneType },
  ];
  const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
  for (const { pct, type } of thresholds) {
    const hit = sortedHistory.find((m) => m.confidenceAtTime * 100 >= pct);
    if (hit) {
      milestones.push({
        type,
        timestamp: hit.timestamp - 1,
        label: `CONFIDENCE THRESHOLD: ${pct}%`,
        sublabel: `Atlas reached ${pct}% certainty about your profile`,
      });
    }
  }

  return milestones;
}

// ─── Timeline Item Types ──────────────────────────────────────────────────────

type TimelineEntry =
  | { kind: 'mutation'; event: MutationEvent }
  | { kind: 'milestone'; milestone: Milestone };

// ─── Mutation Card ────────────────────────────────────────────────────────────

function MutationCard({
  event,
  side,
}: {
  event: MutationEvent;
  side: 'left' | 'right';
}) {
  return (
    <div
      className="rounded-xl border border-white/10 p-4 flex flex-col gap-3"
      style={{
        background: 'rgba(255,255,255,0.035)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}
    >
      {/* Card header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span
          className="text-[10px] uppercase tracking-widest"
          style={{ color: 'rgba(255,255,255,0.3)' }}
        >
          {formatTimestamp(event.timestamp)}
        </span>
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border"
          style={{
            borderColor: 'rgba(201,168,76,0.25)',
            background: 'rgba(201,168,76,0.06)',
          }}
        >
          <span
            className="text-[10px] uppercase tracking-widest"
            style={{ color: 'rgba(201,168,76,0.7)' }}
          >
            v{event.versionFrom} → v{event.versionTo}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-white/8" />

      {/* What changed */}
      <div className="flex flex-col gap-1">
        <span
          className="text-[9px] uppercase tracking-widest mb-1"
          style={{ color: 'rgba(255,255,255,0.2)' }}
        >
          What changed
        </span>
        <div className="flex flex-col gap-1.5">
          {event.mutations.map((m, i) => {
            const changeType = parseChangeType(m);
            const color = CHANGE_COLORS[changeType];
            const symbol = CHANGE_SYMBOLS[changeType];
            const text = m.replace(/^[+\-~]\s*/, '').trim();
            return (
              <div key={i} className="flex items-start gap-2">
                <span
                  className="text-sm font-bold mt-0.5 shrink-0 w-4 text-center font-mono"
                  style={{ color, textShadow: `0 0 6px ${color}66` }}
                >
                  {symbol}
                </span>
                <span
                  className="text-xs leading-relaxed"
                  style={{
                    color:
                      changeType === 'neutral'
                        ? 'rgba(255,255,255,0.35)'
                        : 'rgba(255,255,255,0.65)',
                  }}
                >
                  {text}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-white/8" />

      {/* Triggered by */}
      <div className="flex flex-col gap-1">
        <span
          className="text-[9px] uppercase tracking-widest mb-1"
          style={{ color: 'rgba(255,255,255,0.2)' }}
        >
          Triggered by
        </span>
        <div className="flex flex-col gap-1">
          {event.triggerSignals.map((sig, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span
                className="text-[9px] mt-0.5"
                style={{ color: 'rgba(255,255,255,0.2)' }}
              >
                •
              </span>
              <span
                className="text-[11px] leading-relaxed"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                {sig}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Confidence at time */}
      <div
        className="flex items-center justify-between mt-1 pt-2 border-t border-white/6"
      >
        <span
          className="text-[9px] uppercase tracking-widest"
          style={{ color: 'rgba(255,255,255,0.2)' }}
        >
          Confidence at mutation
        </span>
        <span
          className="text-xs font-bold tabular-nums"
          style={{ color: '#c9a84c' }}
        >
          {Math.round(event.confidenceAtTime * 100)}%
        </span>
      </div>
    </div>
  );
}

// ─── Milestone Marker ────────────────────────────────────────────────────────

const MILESTONE_CONFIGS: Record<
  MilestoneType,
  { icon: string; color: string; bgColor: string; borderColor: string }
> = {
  initialized: {
    icon: '◉',
    color: '#c9a84c',
    bgColor: 'rgba(201,168,76,0.1)',
    borderColor: 'rgba(201,168,76,0.4)',
  },
  archetype_identified: {
    icon: '◈',
    color: '#00d4aa',
    bgColor: 'rgba(0,212,170,0.08)',
    borderColor: 'rgba(0,212,170,0.35)',
  },
  confidence_25: {
    icon: '▣',
    color: '#4a9eff',
    bgColor: 'rgba(74,158,255,0.07)',
    borderColor: 'rgba(74,158,255,0.25)',
  },
  confidence_50: {
    icon: '▣',
    color: '#4a9eff',
    bgColor: 'rgba(74,158,255,0.07)',
    borderColor: 'rgba(74,158,255,0.3)',
  },
  confidence_75: {
    icon: '▣',
    color: '#a78bfa',
    bgColor: 'rgba(167,139,250,0.08)',
    borderColor: 'rgba(167,139,250,0.35)',
  },
  first_adaptation: {
    icon: '⬡',
    color: '#00d4aa',
    bgColor: 'rgba(0,212,170,0.07)',
    borderColor: 'rgba(0,212,170,0.25)',
  },
};

function MilestoneMarker({ milestone }: { milestone: Milestone }) {
  const cfg = MILESTONE_CONFIGS[milestone.type];
  return (
    <div className="flex flex-col items-center gap-1 py-1">
      <div
        className="flex items-center gap-3 px-5 py-2.5 rounded-full border"
        style={{
          borderColor: cfg.borderColor,
          background: cfg.bgColor,
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          boxShadow: `0 0 20px ${cfg.color}18`,
        }}
      >
        <span
          className="text-base"
          style={{ color: cfg.color, textShadow: `0 0 8px ${cfg.color}88` }}
        >
          {cfg.icon}
        </span>
        <div className="flex flex-col">
          <span
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: cfg.color }}
          >
            {milestone.label}
          </span>
          {milestone.sublabel && (
            <span
              className="text-[10px]"
              style={{ color: `${cfg.color}70` }}
            >
              {milestone.sublabel}
            </span>
          )}
        </div>
        <span
          className="text-[10px] ml-2 whitespace-nowrap"
          style={{ color: 'rgba(255,255,255,0.2)' }}
        >
          {formatDate(milestone.timestamp)}
        </span>
      </div>
    </div>
  );
}

// ─── Timeline Node (center dot) ───────────────────────────────────────────────

function TimelineNode({ isMilestone = false }: { isMilestone?: boolean }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 20, flexShrink: 0 }}>
      <div
        className="rounded-full border-2 transition-all"
        style={{
          width: isMilestone ? 14 : 10,
          height: isMilestone ? 14 : 10,
          borderColor: isMilestone ? '#c9a84c' : 'rgba(201,168,76,0.35)',
          backgroundColor: isMilestone ? 'rgba(201,168,76,0.25)' : 'rgba(10,10,15,1)',
          boxShadow: isMilestone ? '0 0 12px rgba(201,168,76,0.4)' : 'none',
          flexShrink: 0,
        }}
      />
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      className="relative flex flex-col items-center justify-center min-h-screen gap-6 overflow-hidden"
      style={{ background: '#0a0a0f' }}
    >
      <Starfield />
      <div className="relative z-10 flex flex-col items-center gap-4 text-center max-w-sm px-6">
        <div
          className="w-14 h-14 rounded-full border border-white/10 flex items-center justify-center mb-2"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          <span
            className="text-xl"
            style={{ color: '#c9a84c', opacity: 0.5 }}
          >
            ⟳
          </span>
        </div>
        <h2
          className="text-xl font-bold uppercase tracking-widest"
          style={{ color: 'rgba(255,255,255,0.6)' }}
        >
          No History Yet
        </h2>
        <p
          className="text-sm leading-relaxed"
          style={{ color: 'rgba(255,255,255,0.3)' }}
        >
          The timeline begins with your first conversation. Nothing has been written yet.
        </p>
        <div
          className="mt-2 px-4 py-1.5 rounded-full border text-xs uppercase tracking-widest"
          style={{
            borderColor: 'rgba(201,168,76,0.2)',
            color: 'rgba(201,168,76,0.35)',
          }}
        >
          Awaiting first adaptation
        </div>
      </div>
    </div>
  );
}

// ─── Summary Header ───────────────────────────────────────────────────────────

function SummaryHeader({
  profile,
  history,
}: {
  profile: UserEvolutionProfile;
  history: MutationEvent[];
}) {
  const adaptationCount = history.length;
  const currentVersion = profile.profileVersion;
  const firstContact = formatDate(profile.firstContact);
  const confidence = Math.round(profile.archetypeConfidence * 100);

  return (
    <div
      className="rounded-2xl border p-6 mb-2"
      style={{
        borderColor: 'rgba(201,168,76,0.2)',
        background: 'rgba(201,168,76,0.04)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <p
        className="text-lg font-semibold mb-4 leading-snug"
        style={{ color: 'rgba(255,255,255,0.8)' }}
      >
        Atlas has adapted{' '}
        <span style={{ color: '#c9a84c', textShadow: '0 0 16px rgba(201,168,76,0.4)' }}>
          {adaptationCount} {adaptationCount === 1 ? 'time' : 'times'}
        </span>{' '}
        to serve you better.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Current Version', value: `v${currentVersion}` },
          { label: 'First Contact', value: firstContact },
          { label: 'Confidence', value: `${confidence}%` },
          {
            label: 'Total Adaptations',
            value: adaptationCount.toString(),
          },
        ].map((stat) => (
          <div key={stat.label} className="flex flex-col gap-0.5">
            <span
              className="text-[10px] uppercase tracking-widest"
              style={{ color: 'rgba(255,255,255,0.25)' }}
            >
              {stat.label}
            </span>
            <span
              className="text-xl font-bold tabular-nums"
              style={{ color: '#c9a84c' }}
            >
              {stat.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  const items: { symbol: string; label: string; color: string }[] = [
    { symbol: '+', label: 'Addition', color: '#00d4aa' },
    { symbol: '−', label: 'Removal', color: '#e74c3c' },
    { symbol: '~', label: 'Adjustment', color: '#c9a84c' },
    { symbol: '·', label: 'Minor', color: 'rgba(255,255,255,0.3)' },
  ];

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <span
        className="text-[10px] uppercase tracking-widest"
        style={{ color: 'rgba(255,255,255,0.2)' }}
      >
        Legend
      </span>
      {items.map(({ symbol, label, color }) => (
        <div key={label} className="flex items-center gap-1.5">
          <span
            className="text-sm font-bold font-mono"
            style={{ color, textShadow: `0 0 4px ${color}44` }}
          >
            {symbol}
          </span>
          <span
            className="text-[10px] uppercase tracking-widest"
            style={{ color: 'rgba(255,255,255,0.25)' }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EvolutionTimeline({
  evolutionProfile,
  mutationHistory,
}: EvolutionTimelineProps) {
  if (!evolutionProfile && mutationHistory.length === 0) {
    return <EmptyState />;
  }

  const profile = evolutionProfile;
  const history = mutationHistory;

  // Build combined timeline entries (mutations + milestones), sorted newest-first
  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = history.map((event) => ({
      kind: 'mutation' as const,
      event,
    }));

    if (profile) {
      const milestones = detectMilestones(history, profile);
      for (const milestone of milestones) {
        entries.push({ kind: 'milestone' as const, milestone });
      }
    }

    // Sort newest first
    entries.sort((a, b) => {
      const ta = a.kind === 'mutation' ? a.event.timestamp : a.milestone.timestamp;
      const tb = b.kind === 'mutation' ? b.event.timestamp : b.milestone.timestamp;
      return tb - ta;
    });

    return entries;
  }, [history, profile]);

  return (
    <div
      className="min-h-screen pb-20"
      style={{ background: 'linear-gradient(160deg, #0a0a0f 0%, #1a0a2e 60%, #0a0a0f 100%)' }}
    >
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-30 px-6 py-3 flex items-center justify-between border-b border-white/5"
        style={{
          background: 'rgba(10,10,15,0.88)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        <span
          className="text-xs uppercase tracking-[0.3em]"
          style={{ color: 'rgba(201,168,76,0.5)' }}
        >
          Obsidian Atlas · Evolution Timeline
        </span>
        {profile && (
          <span
            className="text-xs tabular-nums"
            style={{ color: 'rgba(255,255,255,0.2)' }}
          >
            {history.length} adaptation{history.length !== 1 ? 's' : ''} recorded
          </span>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-10 flex flex-col gap-8">

        {/* Summary */}
        {profile && (
          <SummaryHeader profile={profile} history={history} />
        )}

        {/* Legend */}
        <div className="flex justify-end">
          <Legend />
        </div>

        {/* ── Timeline ─────────────────────────────────────────────────── */}
        {timelineEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <p className="text-sm text-white/25 italic">
              No adaptations have been recorded yet.
            </p>
          </div>
        ) : (
          <div className="relative flex flex-col gap-0">
            {/* Center spine line */}
            <div
              className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2"
              style={{
                width: 1,
                background:
                  'linear-gradient(to bottom, transparent 0%, rgba(201,168,76,0.4) 5%, rgba(201,168,76,0.25) 90%, transparent 100%)',
                pointerEvents: 'none',
              }}
            />

            {timelineEntries.map((entry, index) => {
              const isMilestone = entry.kind === 'milestone';

              if (isMilestone) {
                return (
                  <div
                    key={`milestone-${entry.milestone.type}-${entry.milestone.timestamp}`}
                    className="relative flex flex-col items-center py-4 z-10"
                  >
                    <MilestoneMarker milestone={entry.milestone} />
                  </div>
                );
              }

              // Alternating sides: even → left card, right empty; odd → left empty, right card
              const mutEvent = entry.event;
              const isLeft = index % 2 === 0;

              return (
                <div
                  key={`mutation-${mutEvent.id}`}
                  className="relative flex items-start gap-0 py-3"
                  style={{ minHeight: 40 }}
                >
                  {/* Left side */}
                  <div className="flex-1 pr-4 flex justify-end">
                    {isLeft ? (
                      <div className="w-full max-w-xs sm:max-w-sm">
                        <MutationCard event={mutEvent} side="left" />
                      </div>
                    ) : (
                      <div />
                    )}
                  </div>

                  {/* Center node */}
                  <div
                    className="relative z-10 flex items-center justify-center"
                    style={{ width: 20, paddingTop: 20, flexShrink: 0 }}
                  >
                    <TimelineNode isMilestone={false} />
                  </div>

                  {/* Right side */}
                  <div className="flex-1 pl-4 flex justify-start">
                    {!isLeft ? (
                      <div className="w-full max-w-xs sm:max-w-sm">
                        <MutationCard event={mutEvent} side="right" />
                      </div>
                    ) : (
                      <div />
                    )}
                  </div>
                </div>
              );
            })}

            {/* Bottom cap */}
            <div className="relative flex justify-center py-6 z-10">
              <div
                className="flex items-center gap-2 px-4 py-2 rounded-full border"
                style={{
                  borderColor: 'rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)',
                }}
              >
                <span
                  className="text-[10px] uppercase tracking-widest"
                  style={{ color: 'rgba(255,255,255,0.2)' }}
                >
                  Timeline origin
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Footer note ──────────────────────────────────────────────── */}
        <div className="flex justify-center pb-4">
          <p
            className="text-xs italic text-center"
            style={{ color: 'rgba(201,168,76,0.3)', maxWidth: 400 }}
          >
            Every entry above is a moment Atlas became more yours.
          </p>
        </div>
      </div>
    </div>
  );
}
