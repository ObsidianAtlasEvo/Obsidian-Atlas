import React, { useEffect, useRef } from 'react';
import {
  UserEvolutionProfile,
  CognitiveRadarValues,
  DomainInterest,
  SystemPromptMutation,
  CorrectionLogEntry,
} from '../types/evolutionTypes';

// ─── Props ──────────────────────────────────────────────────────────────────

interface MindProfileProps {
  evolutionProfile: UserEvolutionProfile | null;
  isLoading: boolean;
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
  unknown: 'UNDEFINED',
  philosopher: 'THE PHILOSOPHER',
  engineer: 'THE ENGINEER',
  strategist: 'THE STRATEGIST',
  storyteller: 'THE STORYTELLER',
  analyst: 'THE ANALYST',
  visionary: 'THE VISIONARY',
  pragmatist: 'THE PRAGMATIST',
  scholar: 'THE SCHOLAR',
};

// ─── Nebula Particle Effect (empty state) ────────────────────────────────────

function NebulaParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const particles: {
      x: number;
      y: number;
      r: number;
      vx: number;
      vy: number;
      alpha: number;
      hue: number;
    }[] = [];

    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2 + 0.5,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        alpha: Math.random() * 0.6 + 0.1,
        hue: Math.random() > 0.5 ? 260 : 200,
      });
    }

    let animId: number;
    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 70%, 70%, ${p.alpha})`;
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
      className="absolute inset-0 w-full h-full opacity-40"
      style={{ pointerEvents: 'none' }}
    />
  );
}

// ─── Circular Progress Ring ──────────────────────────────────────────────────

function ConfidenceRing({ value }: { value: number }) {
  const r = 28;
  const circumference = 2 * Math.PI * r;
  const progress = circumference - (value / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
      <svg width="72" height="72" className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx="36" cy="36" r={r}
          fill="none"
          stroke="rgba(201,168,76,0.15)"
          strokeWidth="4"
        />
        <circle
          cx="36" cy="36" r={r}
          fill="none"
          stroke="#c9a84c"
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={progress}
          strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 0 6px #c9a84c88)' }}
        />
      </svg>
      <span className="relative text-sm font-bold text-amber-400 tabular-nums">
        {value}%
      </span>
    </div>
  );
}

// ─── Radar Chart ─────────────────────────────────────────────────────────────

function RadarChart({ values }: { values: CognitiveRadarValues }) {
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 100;
  const axes = [
    { key: 'formality', label: 'FORMALITY' },
    { key: 'directness', label: 'DIRECTNESS' },
    { key: 'philosophicalBias', label: 'PHILOSOPHICAL' },
    { key: 'abstractTolerance', label: 'ABSTRACTION' },
    { key: 'depthPreference', label: 'DEPTH' },
    { key: 'vocabularyLevel', label: 'VOCABULARY' },
  ] as const;

  const n = axes.length;

  function polarToXY(angle: number, r: number) {
    return {
      x: cx + r * Math.cos(angle - Math.PI / 2),
      y: cy + r * Math.sin(angle - Math.PI / 2),
    };
  }

  // Web rings at 25%, 50%, 75%, 100%
  const rings = [0.25, 0.5, 0.75, 1.0];

  // Axis grid lines
  const axisLines = axes.map((_, i) => {
    const angle = (i / n) * 2 * Math.PI;
    const end = polarToXY(angle, maxR);
    return { x1: cx, y1: cy, x2: end.x, y2: end.y };
  });

  // Polygon for user values
  const polygon = axes
    .map((a, i) => {
      const angle = (i / n) * 2 * Math.PI;
      const val = values[a.key as keyof CognitiveRadarValues] ?? 0;
      const r = val * maxR;
      const pt = polarToXY(angle, r);
      return `${pt.x},${pt.y}`;
    })
    .join(' ');

  // Dot positions
  const dots = axes.map((a, i) => {
    const angle = (i / n) * 2 * Math.PI;
    const val = values[a.key as keyof CognitiveRadarValues] ?? 0;
    return polarToXY(angle, val * maxR);
  });

  // Label positions (slightly outside maxR)
  const labelPositions = axes.map((a, i) => {
    const angle = (i / n) * 2 * Math.PI;
    const pos = polarToXY(angle, maxR + 22);
    return { ...pos, label: a.label };
  });

  // Ring polygon paths
  const ringPaths = rings.map((frac) => {
    return axes
      .map((_, i) => {
        const angle = (i / n) * 2 * Math.PI;
        const pt = polarToXY(angle, frac * maxR);
        return `${pt.x},${pt.y}`;
      })
      .join(' ');
  });

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
        style={{ filter: 'drop-shadow(0 0 18px rgba(74,158,255,0.15))' }}
      >
        <defs>
          <radialGradient id="radar-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1a0a2e" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#0a0a0f" stopOpacity="0.9" />
          </radialGradient>
          <filter id="glow-blue">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background */}
        <circle cx={cx} cy={cy} r={maxR + 10} fill="url(#radar-bg)" />

        {/* Ring grid */}
        {ringPaths.map((path, i) => (
          <polygon
            key={i}
            points={path}
            fill="none"
            stroke={i === rings.length - 1 ? 'rgba(201,168,76,0.4)' : 'rgba(201,168,76,0.12)'}
            strokeWidth={i === rings.length - 1 ? 1 : 0.75}
          />
        ))}

        {/* Axis lines */}
        {axisLines.map((l, i) => (
          <line
            key={i}
            x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke="rgba(201,168,76,0.3)"
            strokeWidth="1"
          />
        ))}

        {/* Filled polygon */}
        <polygon
          points={polygon}
          fill="rgba(74,158,255,0.18)"
          stroke="#4a9eff"
          strokeWidth="2"
          strokeLinejoin="round"
          filter="url(#glow-blue)"
        />

        {/* Dots at each axis value */}
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={4} fill="#4a9eff"
            style={{ filter: 'drop-shadow(0 0 4px #4a9effcc)' }}
          />
        ))}

        {/* Center label */}
        <text
          x={cx} y={cy - 5}
          textAnchor="middle"
          fill="rgba(255,255,255,0.25)"
          fontSize="7"
          letterSpacing="2"
          fontWeight="600"
        >
          COGNITIVE
        </text>
        <text
          x={cx} y={cy + 6}
          textAnchor="middle"
          fill="rgba(255,255,255,0.25)"
          fontSize="7"
          letterSpacing="2"
          fontWeight="600"
        >
          SIGNATURE
        </text>

        {/* Axis labels */}
        {labelPositions.map((lp, i) => (
          <text
            key={i}
            x={lp.x} y={lp.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(201,168,76,0.8)"
            fontSize="7.5"
            letterSpacing="1.5"
            fontWeight="600"
          >
            {lp.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ─── Domain Constellation ────────────────────────────────────────────────────

function DomainConstellation({ domains }: { domains: DomainInterest[] }) {
  if (!domains.length) return null;

  const sorted = [...domains].sort((a, b) => b.score - a.score).slice(0, 8);
  const containerW = 700;
  const containerH = 120;

  // Place nodes evenly
  const spacing = containerW / (sorted.length + 1);
  const positions = sorted.map((d, i) => ({
    x: spacing * (i + 1),
    y: containerH / 2 + (i % 2 === 0 ? -12 : 12),
    r: 8 + d.score * 22,
    ...d,
  }));

  // Build connection lines between related domains
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < positions.length; i++) {
    const a = positions[i];
    for (const relName of a.relatedDomains) {
      const j = positions.findIndex((p) => p.name === relName);
      if (j > i) {
        lines.push({ x1: a.x, y1: a.y, x2: positions[j].x, y2: positions[j].y });
      }
    }
  }

  return (
    <div className="overflow-x-auto">
      <svg
        width="100%"
        viewBox={`0 0 ${containerW} ${containerH + 40}`}
        style={{ minWidth: 480, maxWidth: 720 }}
      >
        <defs>
          <filter id="node-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Connecting lines */}
        {lines.map((l, i) => (
          <line
            key={i}
            x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
        ))}

        {/* Nodes */}
        {positions.map((p, i) => (
          <g key={i}>
            {/* Outer glow ring */}
            <circle
              cx={p.x} cy={p.y} r={p.r + 4}
              fill="none"
              stroke={p.color}
              strokeWidth="1"
              strokeOpacity="0.2"
            />
            <circle
              cx={p.x} cy={p.y} r={p.r}
              fill={p.color}
              fillOpacity="0.15"
              stroke={p.color}
              strokeWidth="1.5"
              filter="url(#node-glow)"
            />
            {/* Inner bright core */}
            <circle
              cx={p.x} cy={p.y} r={p.r * 0.35}
              fill={p.color}
              fillOpacity="0.6"
            />
            {/* Domain label */}
            <text
              x={p.x} y={p.y + p.r + 14}
              textAnchor="middle"
              fill="rgba(255,255,255,0.6)"
              fontSize="8.5"
              letterSpacing="0.8"
              fontWeight="500"
            >
              {p.name.toUpperCase()}
            </text>
            <text
              x={p.x} y={p.y + p.r + 24}
              textAnchor="middle"
              fill="rgba(255,255,255,0.25)"
              fontSize="7"
            >
              {p.visitCount}×
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── Horizontal Bar ──────────────────────────────────────────────────────────

function HBar({
  label,
  value,
  max = 1,
  color = '#4a9eff',
}: {
  label: string;
  value: number;
  max?: number;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-white/40 uppercase tracking-widest w-28 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: color,
            boxShadow: `0 0 8px ${color}88`,
          }}
        />
      </div>
      <span className="text-xs tabular-nums" style={{ color, minWidth: 28, textAlign: 'right' }}>
        {max === 10 ? `${value}/10` : `${Math.round(pct)}%`}
      </span>
    </div>
  );
}

// ─── Depth Step Indicator ────────────────────────────────────────────────────

const DEPTH_STEPS = ['Surface', 'Moderate', 'Deep', 'Exhaustive'] as const;
type DepthStep = (typeof DEPTH_STEPS)[number];

function DepthIndicator({ current }: { current: string }) {
  const currentIdx = DEPTH_STEPS.findIndex(
    (s) => s.toLowerCase() === current.toLowerCase()
  );

  return (
    <div className="flex items-center gap-1.5">
      {DEPTH_STEPS.map((step, i) => {
        const isActive = i === currentIdx;
        const isPast = i < currentIdx;
        return (
          <React.Fragment key={step}>
            <div
              className="flex flex-col items-center gap-1"
              style={{ minWidth: 52 }}
            >
              <div
                className="w-2.5 h-2.5 rounded-full border transition-all"
                style={{
                  borderColor: isActive ? '#c9a84c' : isPast ? 'rgba(201,168,76,0.3)' : 'rgba(255,255,255,0.15)',
                  backgroundColor: isActive ? '#c9a84c' : isPast ? 'rgba(201,168,76,0.2)' : 'transparent',
                  boxShadow: isActive ? '0 0 8px #c9a84c88' : 'none',
                }}
              />
              <span
                className="text-[9px] uppercase tracking-widest"
                style={{
                  color: isActive ? '#c9a84c' : isPast ? 'rgba(201,168,76,0.4)' : 'rgba(255,255,255,0.2)',
                  fontWeight: isActive ? 700 : 400,
                }}
              >
                {step}
              </span>
            </div>
            {i < DEPTH_STEPS.length - 1 && (
              <div
                className="h-px flex-1 mb-4"
                style={{
                  backgroundColor: i < currentIdx ? 'rgba(201,168,76,0.25)' : 'rgba(255,255,255,0.08)',
                  minWidth: 12,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Format Icon ─────────────────────────────────────────────────────────────

const FORMAT_ICONS: Record<string, { icon: string; label: string }> = {
  prose: { icon: '¶', label: 'Prose' },
  bullets: { icon: '≡', label: 'Bullets' },
  code: { icon: '</>', label: 'Code' },
  tables: { icon: '⊞', label: 'Tables' },
};

function FormatPicker({ preferred }: { preferred: string }) {
  return (
    <div className="flex gap-2">
      {Object.entries(FORMAT_ICONS).map(([key, { icon, label }]) => {
        const isActive = key === preferred;
        return (
          <div
            key={key}
            className="flex flex-col items-center gap-1.5 px-3 py-2 rounded-lg border transition-all"
            style={{
              borderColor: isActive ? '#c9a84c' : 'rgba(255,255,255,0.08)',
              backgroundColor: isActive ? 'rgba(201,168,76,0.08)' : 'rgba(255,255,255,0.02)',
              boxShadow: isActive ? '0 0 12px rgba(201,168,76,0.15)' : 'none',
            }}
          >
            <span
              className="text-base font-mono"
              style={{ color: isActive ? '#c9a84c' : 'rgba(255,255,255,0.25)' }}
            >
              {icon}
            </span>
            <span
              className="text-[9px] uppercase tracking-widest"
              style={{ color: isActive ? '#c9a84c' : 'rgba(255,255,255,0.2)' }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Cognitive Style Cards ───────────────────────────────────────────────────

const COGNITIVE_TRAITS: {
  key: string;
  icon: string;
  label: string;
  description: string;
}[] = [
  {
    key: 'systemsThinker',
    icon: '◈',
    label: 'Systems Thinker',
    description: 'Sees the architecture beneath the surface.',
  },
  {
    key: 'firstPrinciplesReasoner',
    icon: '⬡',
    label: 'First Principles',
    description: 'Deconstructs to bedrock before rebuilding.',
  },
  {
    key: 'analogicalThinker',
    icon: '⤳',
    label: 'Analogical Thinker',
    description: 'Maps new territory through familiar terrain.',
  },
  {
    key: 'sovereignCommunicator',
    icon: '◉',
    label: 'Sovereign Communicator',
    description: 'Resists prescription. Demands intellectual honesty.',
  },
  {
    key: 'socraticDisposition',
    icon: '?',
    label: 'Socratic Disposition',
    description: 'Prefers the question that opens to the answer that closes.',
  },
  {
    key: 'patternRecognizer',
    icon: '⬣',
    label: 'Pattern Recognizer',
    description: 'Finds signal in noise before others see the pattern.',
  },
  {
    key: 'convergentThinker',
    icon: '▽',
    label: 'Convergent Thinker',
    description: 'Drives toward precision and singular conclusions.',
  },
  {
    key: 'divergentThinker',
    icon: '△',
    label: 'Divergent Thinker',
    description: 'Fans outward from a premise into possibility space.',
  },
];

function ThinkingSystemsGrid({
  cognitiveStyle,
}: {
  cognitiveStyle: Record<string, boolean>;
}) {
  const active = COGNITIVE_TRAITS.filter((t) => cognitiveStyle[t.key]);

  if (!active.length) {
    return (
      <p className="text-sm text-white/30 italic">
        Cognitive style signals accumulating. Return after more conversations.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {active.map((t) => (
        <div
          key={t.key}
          className="flex flex-col gap-2 p-3 rounded-xl border border-white/8"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          <div className="flex items-center gap-2">
            <span
              className="text-lg font-mono"
              style={{ color: '#00d4aa', textShadow: '0 0 8px rgba(0,212,170,0.5)' }}
            >
              {t.icon}
            </span>
            <span className="text-xs font-semibold uppercase tracking-widest text-white/70">
              {t.label}
            </span>
          </div>
          <p className="text-xs text-white/40 leading-relaxed">{t.description}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Section Wrapper ─────────────────────────────────────────────────────────

function Section({
  title,
  label,
  children,
}: {
  title: string;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <h2
          className="text-xs font-bold uppercase tracking-[0.25em]"
          style={{ color: '#c9a84c' }}
        >
          {title}
        </h2>
        {label && (
          <span className="text-xs text-white/25 italic">{label}</span>
        )}
        <div className="flex-1 h-px bg-gradient-to-r from-amber-500/20 to-transparent ml-2" />
      </div>
      {children}
    </div>
  );
}

// ─── Glass Card ──────────────────────────────────────────────────────────────

function GlassCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 p-6 ${className}`}
      style={{
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {children}
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      className="relative flex flex-col items-center justify-center min-h-screen gap-6 overflow-hidden"
      style={{ background: '#0a0a0f' }}
    >
      <NebulaParticles />
      <div className="relative z-10 flex flex-col items-center gap-4 text-center max-w-sm px-6">
        <div
          className="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center mb-2"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          <span className="text-2xl" style={{ color: '#c9a84c', opacity: 0.6 }}>
            ◈
          </span>
        </div>
        <h2
          className="text-xl font-bold uppercase tracking-widest"
          style={{ color: 'rgba(255,255,255,0.7)' }}
        >
          Mind Unmapped
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Atlas is still mapping your mind. Engage in a few conversations and return here.
        </p>
        <div
          className="mt-2 px-4 py-1.5 rounded-full border text-xs uppercase tracking-widest"
          style={{ borderColor: 'rgba(201,168,76,0.2)', color: 'rgba(201,168,76,0.4)' }}
        >
          Awaiting signal
        </div>
      </div>
    </div>
  );
}

// ─── Loading State ───────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen gap-4"
      style={{ background: '#0a0a0f' }}
    >
      <div
        className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: 'rgba(201,168,76,0.4)', borderTopColor: 'transparent' }}
      />
      <span className="text-xs uppercase tracking-widest text-white/30">
        Reconstructing your profile...
      </span>
    </div>
  );
}

// ─── Mutation Badge ──────────────────────────────────────────────────────────

const MUTATION_TYPE_COLORS: Record<string, string> = {
  addition: '#00d4aa',
  removal: '#e74c3c',
  adjustment: '#c9a84c',
};

function MutationBadge({
  type,
}: {
  type: 'addition' | 'removal' | 'adjustment';
}) {
  const color = MUTATION_TYPE_COLORS[type] ?? '#888';
  const symbol = type === 'addition' ? '+' : type === 'removal' ? '−' : '~';
  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded text-xs font-bold"
      style={{ color, background: `${color}18`, border: `1px solid ${color}44` }}
    >
      {symbol}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MindProfile({
  evolutionProfile,
  isLoading,
}: MindProfileProps) {
  if (isLoading) return <LoadingState />;
  if (!evolutionProfile) return <EmptyState />;

  const p = evolutionProfile;
  const archetypeLabel =
    ARCHETYPE_LABELS[p.archetype] ?? p.archetype.toUpperCase();
  const confidencePct = Math.round(p.archetypeConfidence * 100);

  return (
    <div
      className="min-h-screen pb-20"
      style={{ background: 'linear-gradient(160deg, #0a0a0f 0%, #1a0a2e 60%, #0a0a0f 100%)' }}
    >
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-30 px-6 py-3 flex items-center justify-between border-b border-white/5"
        style={{
          background: 'rgba(10,10,15,0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        <span
          className="text-xs uppercase tracking-[0.3em]"
          style={{ color: 'rgba(201,168,76,0.5)' }}
        >
          Obsidian Atlas · Mind Profile
        </span>
        <div className="flex items-center gap-3">
          <span
            className="text-xs tabular-nums"
            style={{ color: 'rgba(255,255,255,0.25)' }}
          >
            Profile v{p.profileVersion}
          </span>
          <div className="w-px h-4 bg-white/10" />
          <span
            className="text-xs"
            style={{ color: 'rgba(255,255,255,0.2)' }}
          >
            {formatTimestamp(p.lastUpdated)}
          </span>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-6 pt-10 flex flex-col gap-10">

        {/* ─ 1. Identity Header ──────────────────────────────────────────── */}
        <GlassCard>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <ConfidenceRing value={confidencePct} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <h1
                  className="text-3xl sm:text-4xl font-black uppercase tracking-[0.15em]"
                  style={{
                    color: '#c9a84c',
                    textShadow: '0 0 30px rgba(201,168,76,0.3)',
                  }}
                >
                  {archetypeLabel}
                </h1>
                <span
                  className="text-xs px-2 py-0.5 rounded border border-white/10 uppercase tracking-widest"
                  style={{ color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.04)' }}
                >
                  v{p.profileVersion}
                </span>
              </div>
              <p
                className="text-sm leading-relaxed mb-3"
                style={{ color: 'rgba(255,255,255,0.5)', maxWidth: 520 }}
              >
                {p.archetypeDescription}
              </p>
              <p
                className="text-xs italic"
                style={{ color: 'rgba(201,168,76,0.6)' }}
              >
                {p.generatedTagline}
              </p>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              <span
                className="text-[10px] uppercase tracking-widest"
                style={{ color: 'rgba(255,255,255,0.2)' }}
              >
                Atlas confidence
              </span>
              <span
                className="text-2xl font-bold tabular-nums"
                style={{ color: '#c9a84c', textShadow: '0 0 16px rgba(201,168,76,0.35)' }}
              >
                {confidencePct}%
              </span>
              <span
                className="text-[10px]"
                style={{ color: 'rgba(255,255,255,0.2)' }}
              >
                Updated {formatDate(p.lastUpdated)}
              </span>
            </div>
          </div>
        </GlassCard>

        {/* ─ 2. Cognitive Signature Radar ────────────────────────────────── */}
        <GlassCard>
          <Section title="Cognitive Signature" label="Radar analysis · 6 axes">
            <div className="flex justify-center pt-2">
              <RadarChart values={p.cognitiveRadar} />
            </div>
          </Section>
        </GlassCard>

        {/* ─ 3. Domain Constellation ─────────────────────────────────────── */}
        <GlassCard>
          <Section title="Domain Constellation" label="Your gravitational fields">
            <div className="overflow-hidden">
              <DomainConstellation domains={p.domainInterests} />
            </div>
          </Section>
        </GlassCard>

        {/* ─ 4. Vocabulary & Communication Profile ───────────────────────── */}
        <GlassCard>
          <Section title="Communication Profile" label="As observed across all sessions">
            <div className="flex flex-col gap-6">
              {/* Vocabulary level */}
              <div className="flex flex-col gap-2">
                <span
                  className="text-xs uppercase tracking-widest mb-1"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                >
                  Vocabulary Level
                </span>
                <HBar
                  label=""
                  value={p.communicationProfile.vocabularyLevel}
                  max={10}
                  color="#c9a84c"
                />
              </div>

              {/* Tone bars */}
              <div className="flex flex-col gap-3">
                <span
                  className="text-xs uppercase tracking-widest"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                >
                  Tone Profile
                </span>
                <HBar label="Formality" value={p.communicationProfile.formality} color="#4a9eff" />
                <HBar label="Directness" value={p.communicationProfile.directness} color="#00d4aa" />
                <HBar label="Warmth" value={p.communicationProfile.warmth} color="#c9a84c" />
                <HBar label="Seriousness" value={p.communicationProfile.seriousness} color="#a78bfa" />
              </div>

              {/* Preferred format */}
              <div className="flex flex-col gap-3">
                <span
                  className="text-xs uppercase tracking-widest"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                >
                  Preferred Format
                </span>
                <FormatPicker preferred={p.communicationProfile.preferredFormat} />
              </div>

              {/* Preferred depth */}
              <div className="flex flex-col gap-3">
                <span
                  className="text-xs uppercase tracking-widest"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                >
                  Depth Preference
                </span>
                <DepthIndicator current={p.communicationProfile.preferredDepth} />
              </div>
            </div>
          </Section>
        </GlassCard>

        {/* ─ 5. Thinking Systems ─────────────────────────────────────────── */}
        <GlassCard>
          <Section title="Identified Thinking Systems" label="Cognitive style profile">
            <ThinkingSystemsGrid
              cognitiveStyle={p.cognitiveStyle as unknown as Record<string, boolean>}
            />
          </Section>
        </GlassCard>

        {/* ─ 6. Atlas Behavioral Adaptations ────────────────────────────── */}
        <GlassCard>
          <Section title="Atlas Behavioral Adaptations" label="How Atlas has changed for you">
            <div className="flex flex-col gap-6">

              {/* Active mutations */}
              {p.activeMutations.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <span
                    className="text-[10px] uppercase tracking-widest mb-1"
                    style={{ color: 'rgba(255,255,255,0.25)' }}
                  >
                    Active System Mutations
                  </span>
                  {p.activeMutations.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-start gap-3 py-2 border-b border-white/5"
                    >
                      <MutationBadge type={m.type} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white/70">{m.description}</p>
                        <p className="text-xs text-white/30 mt-0.5">
                          Signal: {m.sourceSignal} · Confidence:{' '}
                          {Math.round(m.confidence * 100)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/25 italic">No active mutations logged.</p>
              )}

              {/* Banned patterns */}
              {p.bannedPatterns.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span
                    className="text-[10px] uppercase tracking-widest mb-1"
                    style={{ color: 'rgba(255,255,255,0.25)' }}
                  >
                    Banned Patterns
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {p.bannedPatterns.map((bp, i) => (
                      <span
                        key={i}
                        className="text-xs px-2.5 py-1 rounded border"
                        style={{
                          borderColor: 'rgba(231,76,60,0.25)',
                          background: 'rgba(231,76,60,0.06)',
                          color: 'rgba(231,76,60,0.6)',
                          textDecoration: 'line-through',
                          textDecorationColor: 'rgba(231,76,60,0.4)',
                        }}
                      >
                        {bp}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Preferred openings */}
              {p.preferredOpenings.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span
                    className="text-[10px] uppercase tracking-widest mb-1"
                    style={{ color: 'rgba(255,255,255,0.25)' }}
                  >
                    Preferred Openings
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {p.preferredOpenings.map((op, i) => (
                      <span
                        key={i}
                        className="text-xs px-2.5 py-1 rounded border"
                        style={{
                          borderColor: 'rgba(0,212,170,0.25)',
                          background: 'rgba(0,212,170,0.06)',
                          color: 'rgba(0,212,170,0.7)',
                        }}
                      >
                        "{op}"
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom instructions excerpt */}
              {p.customInstructionsExcerpt && (
                <div className="flex flex-col gap-2">
                  <span
                    className="text-[10px] uppercase tracking-widest"
                    style={{ color: 'rgba(255,255,255,0.25)' }}
                  >
                    Custom Instructions
                  </span>
                  <p
                    className="text-xs leading-relaxed font-mono border-l-2 pl-3"
                    style={{
                      color: 'rgba(255,255,255,0.4)',
                      borderColor: 'rgba(201,168,76,0.2)',
                    }}
                  >
                    {p.customInstructionsExcerpt.slice(0, 200)}
                    {p.customInstructionsExcerpt.length > 200 ? '…' : ''}
                  </p>
                </div>
              )}
            </div>
          </Section>
        </GlassCard>

        {/* ─ 7. Correction Log ───────────────────────────────────────────── */}
        <GlassCard>
          <Section title="Correction Log" label="What Atlas got wrong, and fixed">
            {p.correctionLog.length === 0 ? (
              <p className="text-xs text-white/25 italic">
                Atlas has made no corrections requiring acknowledgment.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/8">
                      <th className="text-left pb-2 pr-4 text-white/30 font-medium uppercase tracking-widest">
                        Correction
                      </th>
                      <th className="text-left pb-2 pr-4 text-white/30 font-medium uppercase tracking-widest">
                        When
                      </th>
                      <th className="text-left pb-2 text-white/30 font-medium uppercase tracking-widest">
                        Incorporated
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.correctionLog.map((entry) => (
                      <tr key={entry.id} className="border-b border-white/5">
                        <td className="py-2.5 pr-4 text-white/60">{entry.description}</td>
                        <td className="py-2.5 pr-4 text-white/30 whitespace-nowrap">
                          {formatDate(entry.timestamp)}
                        </td>
                        <td className="py-2.5">
                          {entry.incorporated ? (
                            <span style={{ color: '#00d4aa' }}>✓ Yes</span>
                          ) : (
                            <span style={{ color: 'rgba(255,255,255,0.2)' }}>Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </GlassCard>

        {/* ─ 8. Evolution Stats Footer ───────────────────────────────────── */}
        <div
          className="rounded-2xl border border-white/8 px-6 py-5"
          style={{
            background: 'rgba(201,168,76,0.04)',
            borderColor: 'rgba(201,168,76,0.15)',
          }}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            {[
              { label: 'Signals Processed', value: p.totalSignalsProcessed.toLocaleString() },
              { label: 'Total Interactions', value: p.totalInteractions.toLocaleString() },
              { label: 'Profile Version', value: `v${p.profileVersion}` },
              { label: 'Confidence Score', value: `${confidencePct}%` },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col gap-1">
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
          <p
            className="text-xs italic text-center"
            style={{ color: 'rgba(201,168,76,0.35)' }}
          >
            Atlas knows you better every session.
          </p>
        </div>
      </div>
    </div>
  );
}
