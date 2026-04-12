/**
 * ConceptGraph.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Obsidian Atlas — Thinking Evolution River
 *
 * A scrollable SVG + React timeline showing how the user's thinking evolved
 * across conversation sessions. A glowing gold river flows top-to-bottom,
 * session nodes branch left/right into concept tags, evolution markers
 * (Atlas adaptation moments) appear as gold diamonds, and thinking-system
 * constellations float at the top of the view.
 *
 * Deps: d3, react (>=18), tailwindcss
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, {
  useRef,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react';
import * as d3 from 'd3';
import type {
  UserEvolutionProfile,
  AtlasAdaptationSnapshot,
  DomainKey,
  DomainInterest,
} from '../types/evolutionTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Palette & constants
// ─────────────────────────────────────────────────────────────────────────────

const COLORS = {
  bg: '#0a0a0f',
  bgCard: 'rgba(10, 10, 20, 0.85)',
  river: '#c9a84c',
  riverFaded: 'rgba(201, 168, 76, 0.15)',
  gold: '#c9a84c',
  blue: '#4a9eff',
  teal: '#00d4aa',
  text: '#ccd6f6',
  muted: '#8892b0',
  dim: '#4a5568',
  sessionBg: 'rgba(26, 10, 46, 0.9)',
  sessionBorder: 'rgba(201, 168, 76, 0.35)',
  adaptationBg: 'rgba(201, 168, 76, 0.08)',
};

const DOMAIN_COLORS: Record<string, string> = {
  philosophy: '#9b59b6',
  technology: '#4a9eff',
  strategy: '#c9a84c',
  psychology: '#e74c3c',
  science: '#00d4aa',
  history: '#e67e22',
  culture: '#f39c12',
  economics: '#27ae60',
  mathematics: '#1abc9c',
  art: '#e91e8c',
  language: '#8e44ad',
  ethics: '#d35400',
  default: '#7f8c8d',
};

const getDomainColor = (d: string) => DOMAIN_COLORS[d] ?? DOMAIN_COLORS.default;

// Layout
const RIVER_X = 380;         // center of the river in SVG coords
const SESSION_SPACING = 180; // vertical px between sessions
const TOP_OFFSET = 240;      // top margin for constellations
const BRANCH_LENGTH = 160;   // horizontal branch extend
const BRANCH_STAGGER = 30;   // vertical stagger between concept tags on same branch
const SVG_WIDTH = 800;

// ─────────────────────────────────────────────────────────────────────────────
// Domain side classifier
// ─────────────────────────────────────────────────────────────────────────────

/** Abstract/philosophical domains go left, practical/technical go right */
function getDomainSide(domain: string): 'left' | 'right' {
  const rightDomains = new Set([
    'technology', 'economics', 'strategy', 'mathematics', 'science',
  ]);
  return rightDomains.has(domain) ? 'right' : 'left';
}

// ─────────────────────────────────────────────────────────────────────────────
// Concept extraction (shared logic, same as CognitionMap but lighter)
// ─────────────────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'was', 'are', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'that', 'this', 'these', 'those', 'it', 'you',
  'your', 'my', 'we', 'our', 'they', 'their', 'i', 'if', 'as', 'so',
  'up', 'out', 'about', 'how', 'what', 'when', 'where', 'which', 'who',
  'why', 'more', 'also', 'just', 'not', 'no', 'yes', 'very', 'than',
]);

const DOMAIN_SEEDS: Record<string, string[]> = {
  philosophy: ['philosophy', 'ethics', 'consciousness', 'existence', 'truth', 'metaphysics'],
  technology: ['technology', 'algorithm', 'software', 'ai', 'system', 'data', 'code'],
  strategy: ['strategy', 'decision', 'framework', 'leadership', 'planning', 'risk'],
  psychology: ['psychology', 'cognition', 'behavior', 'emotion', 'bias', 'memory'],
  science: ['science', 'physics', 'evolution', 'experiment', 'theory', 'quantum'],
  history: ['history', 'civilization', 'empire', 'revolution', 'ancient', 'century'],
  culture: ['culture', 'society', 'tradition', 'religion', 'narrative', 'identity'],
  economics: ['economics', 'market', 'capital', 'growth', 'wealth', 'trade'],
  mathematics: ['mathematics', 'theorem', 'proof', 'equation', 'probability', 'logic'],
  art: ['art', 'aesthetic', 'creativity', 'design', 'expression', 'visual'],
  language: ['language', 'linguistics', 'meaning', 'rhetoric', 'metaphor', 'discourse'],
  ethics: ['ethics', 'moral', 'justice', 'fairness', 'rights', 'virtue'],
};

function classifyDomain(text: string): string {
  const lower = text.toLowerCase();
  let best = 'philosophy';
  let bestScore = 0;
  for (const [domain, seeds] of Object.entries(DOMAIN_SEEDS)) {
    const score = seeds.filter((s) => lower.includes(s)).length;
    if (score > bestScore) { bestScore = score; best = domain; }
  }
  return best;
}

interface ExtractedConcept {
  label: string;
  domain: string;
  side: 'left' | 'right';
}

function extractSessionConcepts(messages: Array<{ content: string }>): ExtractedConcept[] {
  const text = messages.map((m) => m.content).join(' ');
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4 && !STOP_WORDS.has(w));

  const freq = new Map<string, number>();
  words.forEach((w) => freq.set(w, (freq.get(w) ?? 0) + 1));

  // Also pick up seed terms
  Object.values(DOMAIN_SEEDS).flat().forEach((seed) => {
    if (text.toLowerCase().includes(seed)) {
      freq.set(seed, (freq.get(seed) ?? 0) + 2);
    }
  });

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label]) => {
      const domain = classifyDomain(label);
      return { label, domain, side: getDomainSide(domain) };
    });
}

function generateSessionSummary(messages: Array<{ content: string }>): string {
  const userMsgs = messages.filter((_, i) => i % 2 === 0).map((m) => m.content);
  if (userMsgs.length === 0) return 'Session';
  const first = userMsgs[0].slice(0, 80);
  return first.length < userMsgs[0].length ? first + '…' : first;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data model for rendering
// ─────────────────────────────────────────────────────────────────────────────

interface SessionData {
  sessionId: string;
  timestamp: number;
  y: number;                       // computed layout Y
  summary: string;
  concepts: ExtractedConcept[];
  leftConcepts: ExtractedConcept[];
  rightConcepts: ExtractedConcept[];
  primaryDomain: string;
}

interface AdaptationMarker {
  timestamp: number;
  y: number;
  label: string;
  summary: string;
  changes: string[];
}

interface ThinkingSystem {
  label: string;
  x: number;
  y: number;
  stars: Array<{ dx: number; dy: number; r: number; alpha: number }>;
  color: string;
  domain: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Derive layout data
// ─────────────────────────────────────────────────────────────────────────────

function deriveGraphData(
  profile: UserEvolutionProfile | null,
  messages: Array<{ role: 'user' | 'atlas'; content: string; timestamp: number; sessionId: string }>,
  adaptationHistory: AtlasAdaptationSnapshot[]
): {
  sessions: SessionData[];
  adaptationMarkers: AdaptationMarker[];
  thinkingSystems: ThinkingSystem[];
  totalHeight: number;
} {
  // ── Group messages by sessionId ──
  const sessionMap = new Map<string, typeof messages>();
  messages.forEach((m) => {
    const arr = sessionMap.get(m.sessionId) ?? [];
    arr.push(m);
    sessionMap.set(m.sessionId, arr);
  });

  // Sort sessions by first message timestamp
  const sessionEntries = Array.from(sessionMap.entries())
    .map(([sessionId, msgs]) => ({
      sessionId,
      timestamp: msgs[0].timestamp,
      msgs,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  // ── Build session data ──
  const sessions: SessionData[] = sessionEntries.map((entry, idx) => {
    const y = TOP_OFFSET + idx * SESSION_SPACING;
    const concepts = extractSessionConcepts(entry.msgs);
    const summary = generateSessionSummary(entry.msgs);
    const domainFreq = new Map<string, number>();
    concepts.forEach((c) => domainFreq.set(c.domain, (domainFreq.get(c.domain) ?? 0) + 1));
    const primaryDomain = [...domainFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'philosophy';

    return {
      sessionId: entry.sessionId,
      timestamp: entry.timestamp,
      y,
      summary,
      concepts,
      leftConcepts: concepts.filter((c) => c.side === 'left'),
      rightConcepts: concepts.filter((c) => c.side === 'right'),
      primaryDomain,
    };
  });

  // ── Build adaptation markers ──
  const adaptationMarkers: AdaptationMarker[] = adaptationHistory.map((state) => {
    // Find the session Y closest to this adaptation's timestamp
    const closestSession = sessions.reduce(
      (best, s) =>
        Math.abs(s.timestamp - state.timestamp) < Math.abs(best.timestamp - state.timestamp)
          ? s : best,
      sessions[0] ?? { timestamp: 0, y: TOP_OFFSET }
    );
    const y = closestSession ? closestSession.y + 30 : TOP_OFFSET;

    return {
      timestamp: state.timestamp,
      y,
      label: 'Atlas adapted',
      summary: state.summary,
      changes: state.changes.map((c) => c.description).slice(0, 3),
    };
  });

  // ── Build thinking systems (from profile or infer from domain distribution) ──
  // Support both shape variants: thinkingSystems[] (new) or derive from domainInterests (existing)
  const profileAny = profile as any;
  const systemLabels: string[] =
    profileAny?.thinkingSystems ??
    (profileAny?.domainInterests
      ? inferThinkingSystemsFromDomainInterests(profileAny.domainInterests as DomainInterest[])
      : inferThinkingSystems(sessions));
  const systemColors = [COLORS.gold, '#4a9eff', '#00d4aa', '#9b59b6', '#e74c3c', '#f39c12'];

  const thinkingSystems: ThinkingSystem[] = systemLabels.slice(0, 6).map((label, idx) => {
    const cols = 3;
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    const x = 100 + col * 200;
    const y = 55 + row * 70;
    const color = systemColors[idx % systemColors.length];
    const domain = inferDomainFromSystem(label);

    // Constellation star positions (relative to center)
    const starCount = 5 + Math.floor(Math.random() * 4);
    const stars = Array.from({ length: starCount }, () => ({
      dx: (Math.random() - 0.5) * 80,
      dy: (Math.random() - 0.5) * 40,
      r: 1 + Math.random() * 2.5,
      alpha: 0.4 + Math.random() * 0.6,
    }));

    return { label, x, y, stars, color, domain };
  });

  const totalHeight = TOP_OFFSET + sessions.length * SESSION_SPACING + 120;
  return { sessions, adaptationMarkers, thinkingSystems, totalHeight };
}

function inferThinkingSystemsFromDomainInterests(interests: DomainInterest[]): string[] {
  const systemMap: Record<string, string> = {
    philosophy: 'Philosophical Seeker',
    technology: 'Systems Architect',
    strategy: 'Strategic Analyst',
    psychology: 'Mind Explorer',
    science: 'Scientific Reasoner',
    history: 'Historical Contextualist',
    culture: 'Cultural Synthesizer',
    economics: 'Systems Economist',
    mathematics: 'Formal Thinker',
    ethics: 'Ethical Reasoner',
    arts: 'Aesthetic Inquirer',
    society: 'Social Synthesizer',
  };
  return interests
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((d) => systemMap[d.name] ?? systemMap[d.category] ?? `${d.name} Thinker`);
}

function inferThinkingSystems(sessions: SessionData[]): string[] {
  const domainFreq = new Map<string, number>();
  sessions.forEach((s) => {
    s.concepts.forEach((c) => domainFreq.set(c.domain, (domainFreq.get(c.domain) ?? 0) + 1));
  });
  const topDomains = [...domainFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

  const systemMap: Record<string, string> = {
    philosophy: 'Philosophical Seeker',
    technology: 'Systems Architect',
    strategy: 'Strategic Analyst',
    psychology: 'Mind Explorer',
    science: 'Scientific Reasoner',
    history: 'Historical Contextualist',
    culture: 'Cultural Synthesizer',
    economics: 'Systems Economist',
    mathematics: 'Formal Thinker',
    ethics: 'Ethical Reasoner',
    art: 'Aesthetic Inquirer',
    language: 'Semantic Navigator',
  };

  return topDomains.map(([d]) => systemMap[d] ?? 'Generalist Thinker');
}

function inferDomainFromSystem(label: string): string {
  const domainHints: Record<string, string> = {
    'Philosophical Seeker': 'philosophy',
    'Systems Architect': 'technology',
    'Strategic Analyst': 'strategy',
    'Mind Explorer': 'psychology',
    'Scientific Reasoner': 'science',
    'Historical Contextualist': 'history',
    'Cultural Synthesizer': 'culture',
    'Systems Economist': 'economics',
    'Formal Thinker': 'mathematics',
    'Ethical Reasoner': 'ethics',
    'Aesthetic Inquirer': 'art',
    'Semantic Navigator': 'language',
    'Systems Thinker': 'technology',
    'Generalist Thinker': 'philosophy',
  };
  return domainHints[label] ?? 'philosophy';
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Animated traveling-dot component for concept connection highlights */
function TravelingDot({
  pathD,
  color,
  duration = 1200,
}: {
  pathD: string;
  color: string;
  duration?: number;
}) {
  return (
    <g>
      <path d={pathD} fill="none" stroke="none" id={`path-${pathD.slice(0, 8)}`} />
      <circle r={3} fill={color} opacity={0.9}>
        <animateMotion dur={`${duration}ms`} repeatCount="indefinite" path={pathD} />
      </circle>
    </g>
  );
}

/** Concept pill tag (SVG foreignObject for HTML inside SVG) */
function ConceptPill({
  label,
  domain,
  x,
  y,
  highlighted,
  onHover,
  onLeave,
}: {
  label: string;
  domain: string;
  x: number;
  y: number;
  highlighted: boolean;
  onHover: (label: string) => void;
  onLeave: () => void;
}) {
  const color = getDomainColor(domain);
  const pillW = Math.max(70, label.length * 7 + 20);
  const pillH = 22;

  return (
    <g
      transform={`translate(${x - pillW / 2}, ${y - pillH / 2})`}
      onMouseEnter={() => onHover(label)}
      onMouseLeave={onLeave}
      style={{ cursor: 'pointer' }}
    >
      <rect
        width={pillW}
        height={pillH}
        rx={11}
        fill={highlighted ? color + '33' : color + '18'}
        stroke={highlighted ? color + 'cc' : color + '55'}
        strokeWidth={highlighted ? 1.5 : 1}
        style={{ transition: 'all 0.2s' }}
      />
      {highlighted && (
        <rect
          width={pillW}
          height={pillH}
          rx={11}
          fill="none"
          stroke={color}
          strokeWidth={1}
          opacity={0.3}
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
      )}
      <text
        x={pillW / 2}
        y={pillH / 2 + 4}
        textAnchor="middle"
        fill={highlighted ? '#ffffff' : color}
        fontSize={10}
        fontFamily="monospace"
        letterSpacing="0.04em"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {label}
      </text>
    </g>
  );
}

/** Constellation cluster at the top of the graph */
function ThinkingSystemConstellation({
  system,
  animTime,
}: {
  system: ThinkingSystem;
  animTime: number;
}) {
  const { x, y, stars, color, label } = system;
  return (
    <g>
      {/* Connection lines between stars */}
      {stars.slice(1).map((star, i) => (
        <line
          key={`line-${i}`}
          x1={x + stars[i].dx}
          y1={y + stars[i].dy}
          x2={x + star.dx}
          y2={y + star.dy}
          stroke={color}
          strokeWidth={0.5}
          opacity={0.25}
          strokeDasharray="3 3"
        />
      ))}

      {/* Stars */}
      {stars.map((star, i) => {
        const pulse = 1 + 0.18 * Math.sin(animTime * 1.2 + i * 1.3);
        return (
          <g key={`star-${i}`}>
            {/* Glow */}
            <circle
              cx={x + star.dx}
              cy={y + star.dy}
              r={star.r * 3 * pulse}
              fill={color}
              opacity={star.alpha * 0.2}
            />
            {/* Core */}
            <circle
              cx={x + star.dx}
              cy={y + star.dy}
              r={star.r * pulse}
              fill={color}
              opacity={star.alpha}
              style={{ filter: `drop-shadow(0 0 3px ${color})` }}
            />
          </g>
        );
      })}

      {/* Label */}
      <text
        x={x}
        y={y + 30}
        textAnchor="middle"
        fill={color}
        fontSize={9}
        fontFamily="monospace"
        letterSpacing="0.1em"
        opacity={0.85}
        style={{ filter: `drop-shadow(0 0 4px ${color}88)`, textTransform: 'uppercase' }}
      >
        {label.toUpperCase()}
      </text>
    </g>
  );
}

/** Session node on the river */
function SessionNode({
  session,
  isActive,
  onClick,
}: {
  session: SessionData;
  isActive: boolean;
  onClick: () => void;
}) {
  const color = getDomainColor(session.primaryDomain);
  const nodeR = 10;

  const dateStr = new Date(session.timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      {/* Outer ring */}
      <circle
        cx={RIVER_X}
        cy={session.y}
        r={nodeR + 6}
        fill="none"
        stroke={COLORS.gold}
        strokeWidth={isActive ? 1.5 : 0.5}
        opacity={isActive ? 0.9 : 0.3}
        style={{ transition: 'all 0.3s' }}
      />
      {/* Glow disc */}
      <circle
        cx={RIVER_X}
        cy={session.y}
        r={nodeR + 12}
        fill={COLORS.gold}
        opacity={isActive ? 0.12 : 0.04}
        style={{ transition: 'all 0.3s' }}
      />
      {/* Core */}
      <circle
        cx={RIVER_X}
        cy={session.y}
        r={nodeR}
        fill={isActive ? color + '55' : 'rgba(26, 10, 46, 0.95)'}
        stroke={isActive ? color : COLORS.gold}
        strokeWidth={isActive ? 2 : 1.5}
        style={{ filter: isActive ? `drop-shadow(0 0 8px ${color})` : undefined, transition: 'all 0.3s' }}
      />
      {/* Domain dot */}
      <circle
        cx={RIVER_X}
        cy={session.y}
        r={3}
        fill={color}
        opacity={0.9}
      />

      {/* Date label */}
      <text
        x={RIVER_X}
        y={session.y - nodeR - 8}
        textAnchor="middle"
        fill={COLORS.gold}
        fontSize={9}
        fontFamily="monospace"
        letterSpacing="0.1em"
        opacity={0.7}
      >
        {dateStr}
      </text>
    </g>
  );
}

/** Session summary card (shown when session is active) */
function SessionCard({ session }: { session: SessionData }) {
  const dateStr = new Date(session.timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <foreignObject
      x={RIVER_X - 130}
      y={session.y + 16}
      width={260}
      height={80}
      style={{ overflow: 'visible' }}
    >
      <div
        style={{
          background: COLORS.sessionBg,
          border: `1px solid ${COLORS.sessionBorder}`,
          backdropFilter: 'blur(12px)',
          borderRadius: 8,
          padding: '10px 12px',
          maxWidth: 260,
        }}
      >
        <div
          style={{
            color: COLORS.gold,
            fontSize: 9,
            fontFamily: 'monospace',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          {dateStr}
        </div>
        <div
          style={{
            color: COLORS.text,
            fontSize: 11,
            lineHeight: 1.5,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          {session.summary}
        </div>
      </div>
    </foreignObject>
  );
}

/** Atlas adaptation diamond marker */
function AdaptationMarker({ marker }: { marker: AdaptationMarker }) {
  const size = 10;
  const points = `${RIVER_X},${marker.y - size} ${RIVER_X + size},${marker.y} ${RIVER_X},${marker.y + size} ${RIVER_X - size},${marker.y}`;

  const [expanded, setExpanded] = useState(false);

  return (
    <g onClick={() => setExpanded((v) => !v)} style={{ cursor: 'pointer' }}>
      {/* Glow */}
      <polygon
        points={points}
        fill={COLORS.gold}
        opacity={0.1}
        transform={`scale(1.8) translate(${-RIVER_X * 0.8}, ${-marker.y * 0.8})`}
      />
      {/* Diamond */}
      <polygon
        points={points}
        fill={COLORS.adaptationBg}
        stroke={COLORS.gold}
        strokeWidth={1.5}
        style={{ filter: `drop-shadow(0 0 6px ${COLORS.gold}88)` }}
      />
      {/* Label */}
      <text
        x={RIVER_X + size + 10}
        y={marker.y + 4}
        fill={COLORS.gold}
        fontSize={9}
        fontFamily="monospace"
        letterSpacing="0.12em"
        opacity={0.9}
        style={{ textTransform: 'uppercase' }}
      >
        ◆ ATLAS ADAPTED
      </text>

      {/* Expanded detail */}
      {expanded && (
        <foreignObject
          x={RIVER_X + 30}
          y={marker.y - 10}
          width={220}
          height={90}
          style={{ overflow: 'visible' }}
        >
          <div
            style={{
              background: 'rgba(10, 10, 20, 0.95)',
              border: `1px solid ${COLORS.gold}44`,
              backdropFilter: 'blur(16px)',
              borderRadius: 8,
              padding: '10px 12px',
            }}
          >
            <div
              style={{
                color: COLORS.gold,
                fontSize: 9,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontFamily: 'monospace',
                marginBottom: 5,
              }}
            >
              What changed
            </div>
            {marker.changes.map((change, i) => (
              <div
                key={i}
                style={{
                  color: COLORS.muted,
                  fontSize: 10,
                  lineHeight: 1.6,
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                · {change}
              </div>
            ))}
          </div>
        </foreignObject>
      )}
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Traveling dot animation state
// ─────────────────────────────────────────────────────────────────────────────

interface TravelRoute {
  pathD: string;
  color: string;
  key: string;
}

function buildBranchPath(
  sessionY: number,
  conceptX: number,
  conceptY: number,
  side: 'left' | 'right'
): string {
  const startX = RIVER_X;
  const startY = sessionY;
  const midX = side === 'right' ? RIVER_X + 40 : RIVER_X - 40;
  const midY = sessionY + (conceptY - sessionY) * 0.4;
  return `M ${startX} ${startY} C ${midX} ${midY}, ${conceptX} ${midY}, ${conceptX} ${conceptY}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ConceptGraph component
// ─────────────────────────────────────────────────────────────────────────────

export interface ConceptGraphProps {
  evolutionProfile: UserEvolutionProfile | null;
  messageHistory: Array<{
    role: 'user' | 'atlas';
    content: string;
    timestamp: number;
    sessionId: string;
  }>;
  atlasAdaptationHistory: AtlasAdaptationSnapshot[];
}

export const ConceptGraph: React.FC<ConceptGraphProps> = ({
  evolutionProfile,
  messageHistory,
  atlasAdaptationHistory,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [animTime, setAnimTime] = useState(0);
  const rafRef = useRef<number>(0);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [highlightedConcept, setHighlightedConcept] = useState<string | null>(null);
  const [travelRoutes, setTravelRoutes] = useState<TravelRoute[]>([]);

  // Derive layout
  const { sessions, adaptationMarkers, thinkingSystems, totalHeight } = useMemo(
    () => deriveGraphData(evolutionProfile, messageHistory, atlasAdaptationHistory),
    [evolutionProfile, messageHistory, atlasAdaptationHistory]
  );

  const activeSession = sessions.find((s) => s.sessionId === activeSessionId) ?? null;

  // Animation loop for constellation pulse
  useEffect(() => {
    let start = performance.now();
    const tick = (now: number) => {
      setAnimTime((now - start) / 1000);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // When a concept is highlighted, compute travel routes across sessions that share it
  const handleConceptHover = useCallback(
    (label: string) => {
      setHighlightedConcept(label);

      const routes: TravelRoute[] = [];
      const matchingSessions = sessions.filter((s) =>
        s.concepts.some((c) => c.label === label)
      );

      // Draw travel paths between consecutive matching sessions
      for (let i = 0; i < matchingSessions.length - 1; i++) {
        const a = matchingSessions[i];
        const b = matchingSessions[i + 1];
        const color = getDomainColor(
          a.concepts.find((c) => c.label === label)?.domain ?? 'philosophy'
        );
        const pathD = `M ${RIVER_X} ${a.y} C ${RIVER_X} ${a.y + 60}, ${RIVER_X} ${b.y - 60}, ${RIVER_X} ${b.y}`;
        routes.push({ pathD, color, key: `${a.sessionId}-${b.sessionId}-${label}` });
      }

      setTravelRoutes(routes);
    },
    [sessions]
  );

  const handleConceptLeave = useCallback(() => {
    setHighlightedConcept(null);
    setTravelRoutes([]);
  }, []);

  // Compute branch positions
  const computeBranchPositions = (
    session: SessionData
  ): Array<{
    concept: ExtractedConcept;
    x: number;
    y: number;
    branchPath: string;
    stemPath: string;
  }> => {
    const results: Array<{
      concept: ExtractedConcept;
      x: number;
      y: number;
      branchPath: string;
      stemPath: string;
    }> = [];

    const place = (concepts: ExtractedConcept[], side: 'left' | 'right') => {
      concepts.forEach((c, idx) => {
        const sign = side === 'right' ? 1 : -1;
        const baseX = RIVER_X + sign * (BRANCH_LENGTH + Math.floor(idx / 4) * 60);
        const baseY = session.y - 20 + idx * BRANCH_STAGGER - (concepts.length * BRANCH_STAGGER) / 2;

        // Curved branch path from river to concept
        const midX = RIVER_X + sign * BRANCH_LENGTH * 0.5;
        const branchPath = `M ${RIVER_X} ${session.y} C ${midX} ${session.y}, ${midX} ${baseY}, ${baseX} ${baseY}`;

        // Short horizontal stem at the concept end
        const stemEnd = baseX + sign * 8;
        const stemPath = `M ${baseX} ${baseY} L ${stemEnd} ${baseY}`;

        results.push({ concept: c, x: baseX, y: baseY, branchPath, stemPath });
      });
    };

    place(session.leftConcepts, 'left');
    place(session.rightConcepts, 'right');

    return results;
  };

  const svgHeight = Math.max(totalHeight, 600);

  return (
    <div
      className="relative w-full h-full flex flex-col overflow-hidden"
      style={{ background: COLORS.bg, fontFamily: 'system-ui, sans-serif' }}
    >
      {/* Header bar */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-6 py-3 z-20"
        style={{
          background: 'rgba(10, 10, 15, 0.9)',
          borderBottom: '1px solid rgba(201, 168, 76, 0.12)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center" style={{ width: 12, height: 12 }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: COLORS.teal,
                opacity: 0.4,
                animation: 'ping 1.8s cubic-bezier(0,0,0.2,1) infinite',
              }}
            />
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: COLORS.teal,
                boxShadow: `0 0 8px ${COLORS.teal}`,
              }}
            />
          </div>
          <span
            style={{
              color: COLORS.gold,
              fontFamily: 'monospace',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              textShadow: `0 0 12px ${COLORS.gold}88`,
            }}
          >
            Concept Graph
          </span>
          <span
            style={{
              color: COLORS.muted,
              fontFamily: 'monospace',
              fontSize: 10,
              letterSpacing: '0.06em',
            }}
          >
            — Thinking Evolution River
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Domain legend pills */}
          {['philosophy', 'technology', 'strategy', 'psychology', 'science'].map((d) => (
            <div key={d} className="flex items-center gap-1.5">
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: getDomainColor(d),
                  boxShadow: `0 0 5px ${getDomainColor(d)}88`,
                }}
              />
              <span
                style={{
                  color: COLORS.dim,
                  fontSize: 9,
                  fontFamily: 'monospace',
                  textTransform: 'capitalize',
                  letterSpacing: '0.06em',
                }}
              >
                {d}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Axis labels */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-6 py-1.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <span
          style={{
            color: COLORS.muted,
            fontSize: 9,
            fontFamily: 'monospace',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          ← Abstract / Philosophical
        </span>
        <span
          style={{
            color: COLORS.muted,
            fontSize: 9,
            fontFamily: 'monospace',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          Practical / Technical →
        </span>
      </div>

      {/* Main scrollable SVG area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ position: 'relative' }}
      >
        <svg
          width="100%"
          viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`}
          style={{
            display: 'block',
            minHeight: svgHeight,
          }}
        >
          <defs>
            {/* River gradient */}
            <linearGradient id="riverGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.gold} stopOpacity={0.05} />
              <stop offset="15%" stopColor={COLORS.gold} stopOpacity={0.6} />
              <stop offset="85%" stopColor={COLORS.gold} stopOpacity={0.6} />
              <stop offset="100%" stopColor={COLORS.gold} stopOpacity={0.05} />
            </linearGradient>
            {/* Glow filter */}
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glowStrong" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="6" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* ── Background nebula particles ── */}
          {Array.from({ length: 60 }, (_, i) => {
            const seed = i * 137.508;
            const bx = (seed % 800);
            const by = ((seed * 2.1) % svgHeight);
            const br = 0.5 + (i % 3) * 0.5;
            return (
              <circle
                key={`bg-${i}`}
                cx={bx}
                cy={by}
                r={br}
                fill="#ccd6f6"
                opacity={0.08 + (i % 4) * 0.04}
              />
            );
          })}

          {/* ── Constellation region ── */}
          <rect
            x={0}
            y={0}
            width={SVG_WIDTH}
            height={TOP_OFFSET - 10}
            fill="rgba(26, 10, 46, 0.3)"
            rx={0}
          />
          <line
            x1={0}
            y1={TOP_OFFSET - 10}
            x2={SVG_WIDTH}
            y2={TOP_OFFSET - 10}
            stroke={COLORS.gold}
            strokeWidth={0.5}
            strokeDasharray="4 8"
            opacity={0.3}
          />
          <text
            x={SVG_WIDTH / 2}
            y={14}
            textAnchor="middle"
            fill={COLORS.gold}
            fontSize={8}
            fontFamily="monospace"
            letterSpacing="0.2em"
            opacity={0.5}
          >
            IDENTIFIED THINKING SYSTEMS
          </text>

          {/* ── Thinking system constellations ── */}
          {thinkingSystems.map((system, idx) => (
            <ThinkingSystemConstellation
              key={`sys-${idx}`}
              system={system}
              animTime={animTime}
            />
          ))}

          {/* ── River line ── */}
          <line
            x1={RIVER_X}
            y1={TOP_OFFSET - 20}
            x2={RIVER_X}
            y2={svgHeight - 40}
            stroke="url(#riverGrad)"
            strokeWidth={2.5}
            filter="url(#glow)"
          />
          {/* River glow halo */}
          <line
            x1={RIVER_X}
            y1={TOP_OFFSET - 20}
            x2={RIVER_X}
            y2={svgHeight - 40}
            stroke={COLORS.gold}
            strokeWidth={8}
            opacity={0.04}
          />

          {/* ── Session branches and concept tags ── */}
          {sessions.map((session) => {
            const isActive = activeSessionId === session.sessionId;
            const branchPositions = computeBranchPositions(session);

            return (
              <g key={session.sessionId}>
                {/* Branch paths */}
                {branchPositions.map(({ concept, x, y, branchPath }, bIdx) => {
                  const isHl = highlightedConcept === concept.label;
                  const col = getDomainColor(concept.domain);
                  return (
                    <g key={`branch-${bIdx}`}>
                      {/* Branch line */}
                      <path
                        d={branchPath}
                        fill="none"
                        stroke={col}
                        strokeWidth={isHl ? 1.5 : 0.75}
                        opacity={isHl ? 0.8 : 0.25}
                        style={{ transition: 'opacity 0.2s, stroke-width 0.2s' }}
                      />
                    </g>
                  );
                })}

                {/* Concept pills */}
                {branchPositions.map(({ concept, x, y }, bIdx) => (
                  <ConceptPill
                    key={`pill-${bIdx}`}
                    label={concept.label}
                    domain={concept.domain}
                    x={x}
                    y={y}
                    highlighted={highlightedConcept === concept.label}
                    onHover={handleConceptHover}
                    onLeave={handleConceptLeave}
                  />
                ))}

                {/* Session node */}
                <SessionNode
                  session={session}
                  isActive={isActive}
                  onClick={() =>
                    setActiveSessionId((prev) =>
                      prev === session.sessionId ? null : session.sessionId
                    )
                  }
                />

                {/* Session summary card */}
                {isActive && <SessionCard session={session} />}
              </g>
            );
          })}

          {/* ── Atlas adaptation markers ── */}
          {adaptationMarkers.map((marker, idx) => (
            <AdaptationMarker key={`adapt-${idx}`} marker={marker} />
          ))}

          {/* ── Traveling dots for highlighted concept ── */}
          {travelRoutes.map((route) => (
            <TravelingDot
              key={route.key}
              pathD={route.pathD}
              color={route.color}
              duration={1400}
            />
          ))}

          {/* ── River terminus ── */}
          <g transform={`translate(${RIVER_X}, ${svgHeight - 50})`}>
            <circle r={4} fill={COLORS.gold} opacity={0.6} />
            <circle r={8} fill={COLORS.gold} opacity={0.1} />
            <circle r={14} fill={COLORS.gold} opacity={0.04} />
          </g>

          {/* ── Time axis labels ── */}
          {sessions.length > 0 && (
            <>
              <text
                x={RIVER_X + 16}
                y={TOP_OFFSET + 4}
                fill={COLORS.muted}
                fontSize={9}
                fontFamily="monospace"
                opacity={0.5}
              >
                {new Date(sessions[0].timestamp).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </text>
              {sessions.length > 1 && (
                <text
                  x={RIVER_X + 16}
                  y={svgHeight - 60}
                  fill={COLORS.muted}
                  fontSize={9}
                  fontFamily="monospace"
                  opacity={0.5}
                >
                  {new Date(sessions[sessions.length - 1].timestamp).toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                  })}
                </text>
              )}
            </>
          )}
        </svg>
      </div>

      {/* Footer hint */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-6 py-2"
        style={{
          borderTop: '1px solid rgba(255,255,255,0.04)',
          background: 'rgba(10, 10, 15, 0.8)',
        }}
      >
        <span
          style={{
            color: COLORS.dim,
            fontSize: 9,
            fontFamily: 'monospace',
            letterSpacing: '0.06em',
          }}
        >
          hover concept tags to trace cross-session patterns · click session nodes to expand
        </span>
        <span
          style={{
            color: COLORS.dim,
            fontSize: 9,
            fontFamily: 'monospace',
            letterSpacing: '0.06em',
          }}
        >
          {sessions.length} sessions · {atlasAdaptationHistory.length} adaptations
        </span>
      </div>
    </div>
  );
};

export default ConceptGraph;
