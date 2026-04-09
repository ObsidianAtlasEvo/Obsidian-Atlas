/**
 * CrucibleChamber — Adversarial testing chamber.
 *
 * Atlas challenges the user's beliefs, plans, and assumptions with
 * ruthless intellectual honesty. Two phases:
 *   1. Session setup: mode selection, intensity, topic input.
 *   2. Active session: adversarial chat with streaming Ollama responses,
 *      epistemic category badges, intensity indicator, findings summary.
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { streamChat, type OllamaMessage } from '../lib/ollama';
import { generateId } from '../lib/persistence';
import type {
  CrucibleMode,
  CrucibleIntensity,
  CrucibleExchange,
} from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────

const MODE_META: Record<
  CrucibleMode,
  { label: string; description: string; icon: React.ReactNode }
> = {
  'pressure-test': {
    label: 'Pressure Test',
    description: 'Stress-test an idea under adversarial conditions',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    ),
  },
  'adversarial-review': {
    label: 'Adversarial Review',
    description: 'Challenge every assumption in a position',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  'reality-check': {
    label: 'Reality Check',
    description: 'Force confrontation with uncomfortable facts',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4l3 3" />
      </svg>
    ),
  },
  'contradiction-scan': {
    label: 'Contradiction Scan',
    description: 'Find internal contradictions in your thinking',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    ),
  },
  'blind-spot-finder': {
    label: 'Blind Spot Finder',
    description: "Expose what you're not seeing",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <path d="M1 1l22 22" />
      </svg>
    ),
  },
  'decision-forge': {
    label: 'Decision Forge',
    description: 'Pressure-test a decision before committing',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
  'narrative-deconstruction': {
    label: 'Narrative Deconstruction',
    description: "Break apart a story you're telling yourself",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7V4h16v3" />
        <path d="M9 20h6" />
        <path d="M12 4v16" />
      </svg>
    ),
  },
  'self-deception-audit': {
    label: 'Self-Deception Audit',
    description: 'Surface self-deceptions and motivated reasoning',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
        <path d="M11 8v3l2 2" />
      </svg>
    ),
  },
  'hard-truth': {
    label: 'Hard Truth',
    description: 'Deliver the unfiltered truth about a situation',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  reforge: {
    label: 'Reforge',
    description: 'Destroy a weak position and rebuild it stronger',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
};

const INTENSITY_CONFIG: Record<
  CrucibleIntensity,
  { label: string; color: string; barColor: string; description: string; temp: number }
> = {
  calibrated: {
    label: 'Calibrated',
    color: 'rgba(234,179,8,0.85)',
    barColor: 'rgba(234,179,8,0.7)',
    description: 'Rigorous but measured. Challenges with precision.',
    temp: 0.6,
  },
  intensive: {
    label: 'Intensive',
    color: 'rgba(249,115,22,0.85)',
    barColor: 'rgba(249,115,22,0.7)',
    description: 'Aggressive pressure. No quarter for weak reasoning.',
    temp: 0.75,
  },
  ruthless: {
    label: 'Ruthless',
    color: 'rgba(239,68,68,0.85)',
    barColor: 'rgba(239,68,68,0.7)',
    description: 'Maximum adversarial force. Expect no mercy.',
    temp: 0.85,
  },
};

const EPISTEMIC_BADGE_COLORS: Record<CrucibleExchange['epistemicCategory'], { bg: string; border: string; text: string; label: string }> = {
  'adversarial-hypothesis': {
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.35)',
    text: 'rgba(239,68,68,0.9)',
    label: 'Adversarial Hypothesis',
  },
  'structural-critique': {
    bg: 'rgba(249,115,22,0.08)',
    border: 'rgba(249,115,22,0.35)',
    text: 'rgba(249,115,22,0.9)',
    label: 'Structural Critique',
  },
  'logical-fracture': {
    bg: 'rgba(239,68,68,0.1)',
    border: 'rgba(239,68,68,0.4)',
    text: 'rgba(239,68,68,0.95)',
    label: 'Logical Fracture',
  },
  'reality-check': {
    bg: 'rgba(99,102,241,0.08)',
    border: 'rgba(99,102,241,0.35)',
    text: 'rgba(167,139,250,0.9)',
    label: 'Reality Check',
  },
  'epistemic-warning': {
    bg: 'rgba(234,179,8,0.08)',
    border: 'rgba(234,179,8,0.35)',
    text: 'rgba(234,179,8,0.9)',
    label: 'Epistemic Warning',
  },
  synthesis: {
    bg: 'rgba(34,197,94,0.07)',
    border: 'rgba(34,197,94,0.3)',
    text: 'rgba(34,197,94,0.85)',
    label: 'Synthesis',
  },
};

// ── Build Crucible system prompt ──────────────────────────────────────────

function buildCrucibleSystemPrompt(
  mode: CrucibleMode,
  intensity: CrucibleIntensity,
  topic: string
): string {
  const intensityDirectives: Record<CrucibleIntensity, string> = {
    calibrated: `Apply rigorous but measured adversarial pressure. Challenge assumptions with precision. Point out weaknesses clearly but don't over-dramatize. Ask exactly the question that most threatens the position.`,
    intensive: `Apply aggressive intellectual pressure. Pursue every weakness without mercy. Surface contradictions immediately. Do not soften your critique. Maintain logical force throughout. The user needs to feel the weight of every flaw.`,
    ruthless: `Apply maximum adversarial force. Expose every flaw, contradiction, assumption, and self-deception with unflinching directness. No diplomatic softening. No consolation. This is intellectual combat — find and attack every structural weakness until nothing weak remains standing.`,
  };

  const modeDirectives: Record<CrucibleMode, string> = {
    'pressure-test': `You are stress-testing the user's idea. Apply every adversarial scenario, edge case, and counterexample you can generate. Your goal is to find the breaking point of the idea before real-world conditions do.`,
    'adversarial-review': `You are challenging every assumption in the user's stated position. Enumerate assumptions explicitly, then attack each one. No assumption is too small to examine.`,
    'reality-check': `You are forcing confrontation with uncomfortable facts. Identify where the user's framing diverges from documented reality. Be specific. Cite what is factually contradicted.`,
    'contradiction-scan': `You are scanning for internal contradictions. Find places where the user's thinking contradicts itself — between stated values and actions, between different claims, between time horizons. Surface these with surgical precision.`,
    'blind-spot-finder': `You are exposing what the user cannot see from their current vantage point. Identify systematic biases, missing perspectives, unexamined angles, and structural blind spots in their thinking.`,
    'decision-forge': `You are pressure-testing a decision before it is committed to. Enumerate failure modes, second-order consequences, hidden costs, and alternatives not considered. Make the user earn their decision.`,
    'narrative-deconstruction': `You are breaking apart the story the user is telling themselves. Identify the narrative's assumptions, the parts being edited out, the motivated framing, and what a hostile but honest narrator would say instead.`,
    'self-deception-audit': `You are surfacing self-deceptions and motivated reasoning. Find where the user's conclusions conveniently align with their preferences. Name the psychological mechanism at work. Do not let comfortable illusions survive this session.`,
    'hard-truth': `You are delivering the unfiltered truth. No sugar-coating, no diplomatic framing, no softening. State what is true with full force. The user asked for this — honor that request with complete honesty.`,
    reforge: `You are destroying weak positions in order to rebuild them stronger. First, demolish whatever cannot withstand scrutiny. Then, from the surviving elements, help construct a more defensible position. Destruction precedes reconstruction.`,
  };

  return `You are Atlas operating in CRUCIBLE mode — the adversarial testing chamber.

TOPIC UNDER EXAMINATION: "${topic}"
MODE: ${mode.replace(/-/g, ' ').toUpperCase()} — ${MODE_META[mode].description}
INTENSITY: ${intensity.toUpperCase()}

INTENSITY DIRECTIVE:
${intensityDirectives[intensity]}

MODE DIRECTIVE:
${modeDirectives[mode]}

CORE CRUCIBLE RULES:
1. You are the adversary, not the ally. Your function in this chamber is to find and expose weaknesses, not to support or validate.
2. Every response must challenge, probe, or fracture. Never affirm without condition. Never validate without evidence.
3. Begin each response by identifying one specific structural weakness, contradiction, or assumption.
4. Use precise language. Vague critique is useless. Name the exact flaw, the exact contradiction, the exact assumption.
5. Do not moralize. Do not lecture. Do not pad. Attack the argument, not the person.
6. If you see self-deception, name it directly: "This is motivated reasoning because..."
7. If you find a logical fracture, isolate it: "These two claims cannot both be true simultaneously because..."
8. Depth calibration: be thorough, not exhaustive. One devastating point > five weak ones.
9. Format: use plain prose. No bullet-point laundry lists. Sustained analytical force.
10. You may acknowledge genuine strength, but only after exhausting the weaknesses.

EPISTEMIC MARKERS — label your moves:
- [ADVERSARIAL HYPOTHESIS]: A counter-thesis you're proposing
- [STRUCTURAL CRITIQUE]: An attack on the framework itself
- [LOGICAL FRACTURE]: An internal contradiction you've found
- [REALITY CHECK]: Where claims diverge from documented reality
- [EPISTEMIC WARNING]: A signal of motivated reasoning or bias
- [SYNTHESIS]: Only when rebuilding something stronger from the wreckage

Remember: the Crucible exists to make the user's thinking stronger. Pressure is the service.`;
}

// ── Inline markdown renderer (shared with AtlasChamber) ───────────────────

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[ADVERSARIAL HYPOTHESIS\]|\[STRUCTURAL CRITIQUE\]|\[LOGICAL FRACTURE\]|\[REALITY CHECK\]|\[EPISTEMIC WARNING\]|\[SYNTHESIS\])/g;
  let last = 0;
  let match;

  const markerColors: Record<string, string> = {
    'ADVERSARIAL HYPOTHESIS': 'rgba(239,68,68,0.85)',
    'STRUCTURAL CRITIQUE': 'rgba(249,115,22,0.85)',
    'LOGICAL FRACTURE': 'rgba(239,68,68,0.95)',
    'REALITY CHECK': 'rgba(167,139,250,0.9)',
    'EPISTEMIC WARNING': 'rgba(234,179,8,0.9)',
    'SYNTHESIS': 'rgba(34,197,94,0.85)',
  };

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(
        <strong key={match.index} style={{ color: 'rgba(226,232,240,0.98)', fontWeight: 600 }}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*')) {
      parts.push(
        <em key={match.index} style={{ color: 'rgba(167,139,250,0.85)' }}>
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('`')) {
      parts.push(
        <code
          key={match.index}
          style={{
            background: 'rgba(5,5,8,0.5)',
            border: '1px solid rgba(226,232,240,0.07)',
            borderRadius: 3,
            padding: '1px 4px',
            fontSize: '0.82em',
          }}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[')) {
      const label = token.slice(1, -1);
      const color = markerColors[label] ?? 'rgba(167,139,250,0.8)';
      parts.push(
        <span
          key={match.index}
          style={{
            fontSize: '0.62rem',
            fontWeight: 600,
            letterSpacing: '0.1em',
            color,
            background: color.replace(/[\d.]+\)$/, '0.08)'),
            border: `1px solid ${color.replace(/[\d.]+\)$/, '0.25)')}`,
            borderRadius: 3,
            padding: '1px 5px',
            margin: '0 3px',
            verticalAlign: 'middle',
            textTransform: 'uppercase' as const,
          }}
        >
          {label}
        </span>
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

function renderContent(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeKey = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre
            key={`code-${codeKey++}`}
            style={{
              margin: '8px 0',
              background: 'rgba(5,5,8,0.6)',
              border: '1px solid rgba(88,28,135,0.18)',
              borderRadius: 6,
              padding: '10px 14px',
              fontSize: '0.8rem',
              overflow: 'auto',
            }}
          >
            <code>{codeLines.join('\n')}</code>
          </pre>
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} style={{ margin: '16px 0 8px', fontSize: '0.95rem', fontWeight: 600, color: 'rgba(239,68,68,0.85)', letterSpacing: '-0.01em' }}>
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} style={{ margin: '12px 0 6px', fontSize: '0.875rem', fontWeight: 500, color: 'rgba(226,232,240,0.9)' }}>
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith('- ') || line.startsWith('• ')) {
      elements.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <span style={{ color: 'rgba(239,68,68,0.5)', marginTop: 2, flexShrink: 0 }}>—</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
    } else if (/^\d+\. /.test(line)) {
      const num = line.match(/^(\d+)\. /)?.[1];
      elements.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <span style={{ color: 'rgba(239,68,68,0.45)', minWidth: 18, flexShrink: 0, fontSize: '0.75rem' }}>
            {num}.
          </span>
          <span>{renderInline(line.replace(/^\d+\. /, ''))}</span>
        </div>
      );
    } else if (line.trim() === '') {
      if (i > 0 && lines[i - 1]?.trim() !== '') {
        elements.push(<div key={i} style={{ height: 8 }} />);
      }
    } else {
      elements.push(
        <p key={i} style={{ margin: '0 0 6px' }}>
          {renderInline(line)}
        </p>
      );
    }
  }

  return elements;
}

// ── Sub-components ────────────────────────────────────────────────────────

function IntensityBar({ intensity }: { intensity: CrucibleIntensity }) {
  const config = INTENSITY_CONFIG[intensity];
  const widthMap: Record<CrucibleIntensity, string> = {
    calibrated: '33%',
    intensive: '66%',
    ruthless: '100%',
  };

  return (
    <div
      style={{
        height: 2,
        background: 'rgba(88,28,135,0.15)',
        borderRadius: 1,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          height: '100%',
          width: widthMap[intensity],
          background: config.barColor,
          borderRadius: 1,
          transition: 'width 400ms ease, background 300ms ease',
          boxShadow: `0 0 8px ${config.barColor}`,
        }}
      />
    </div>
  );
}

function EpistemicBadge({ category }: { category: CrucibleExchange['epistemicCategory'] }) {
  const conf = EPISTEMIC_BADGE_COLORS[category];
  return (
    <span
      style={{
        fontSize: '0.58rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: conf.text,
        background: conf.bg,
        border: `1px solid ${conf.border}`,
        borderRadius: 4,
        padding: '2px 6px',
        flexShrink: 0,
      }}
    >
      {conf.label}
    </span>
  );
}

interface StreamingExchange {
  id: string;
  userInput: string;
  atlasResponse: string;
  isStreaming: boolean;
  error?: string;
  epistemicCategory: CrucibleExchange['epistemicCategory'];
}

function ExchangeBubble({ exchange, intensity }: { exchange: StreamingExchange; intensity: CrucibleIntensity }) {
  const dangerColor = INTENSITY_CONFIG[intensity].color;

  return (
    <div
      style={{
        marginBottom: 28,
        animation: 'atlas-fade-in 300ms ease both',
      }}
    >
      {/* User input */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 14,
        }}
      >
        <div
          style={{
            maxWidth: '72%',
            background: 'rgba(239,68,68,0.07)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '12px 12px 3px 12px',
            padding: '10px 14px',
            color: 'rgba(226,232,240,0.92)',
            fontSize: '0.875rem',
            lineHeight: 1.65,
          }}
        >
          {exchange.userInput}
        </div>
      </div>

      {/* Atlas response */}
      <div>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 10,
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: `1px solid ${dangerColor.replace('0.85', '0.4')}`,
              background: 'radial-gradient(circle, rgba(239,68,68,0.2) 0%, transparent 70%)',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: '0.62rem',
              fontWeight: 600,
              letterSpacing: '0.12em',
              color: dangerColor,
              textTransform: 'uppercase',
            }}
          >
            Atlas — Crucible
          </span>
          {!exchange.isStreaming && !exchange.error && (
            <EpistemicBadge category={exchange.epistemicCategory} />
          )}
          {exchange.isStreaming && (
            <span
              style={{
                fontSize: '0.58rem',
                fontWeight: 600,
                letterSpacing: '0.1em',
                color: 'rgba(226,232,240,0.25)',
                textTransform: 'uppercase',
              }}
            >
              Processing…
            </span>
          )}
        </div>

        {/* Content */}
        <div
          style={{
            paddingLeft: 28,
            fontSize: '0.875rem',
            lineHeight: 1.75,
            color: 'rgba(226,232,240,0.88)',
          }}
        >
          {exchange.error ? (
            <div
              style={{
                color: 'rgba(239,68,68,0.8)',
                fontSize: '0.8rem',
                padding: '8px 12px',
                background: 'rgba(239,68,68,0.06)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 6,
              }}
            >
              {exchange.error}
            </div>
          ) : exchange.atlasResponse ? (
            <div>{renderContent(exchange.atlasResponse)}</div>
          ) : (
            <span
              style={{
                color: 'rgba(239,68,68,0.3)',
                fontStyle: 'italic',
                fontSize: '0.8rem',
              }}
            >
              Preparing adversarial response…
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Findings panel ────────────────────────────────────────────────────────

function FindingsPanel({ findings, reconstruction, onClose }: {
  findings: NonNullable<import('@/types').CrucibleSession['findings']>;
  reconstruction?: import('@/types').CrucibleSession['reconstruction'];
  onClose: () => void;
}) {
  const sectionStyle: React.CSSProperties = {
    marginBottom: 20,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.62rem',
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'rgba(239,68,68,0.7)',
    marginBottom: 8,
  };

  const listItemStyle: React.CSSProperties = {
    display: 'flex',
    gap: 8,
    marginBottom: 5,
    fontSize: '0.82rem',
    lineHeight: 1.6,
    color: 'rgba(226,232,240,0.8)',
  };

  const renderList = (items: string[], accentColor = 'rgba(239,68,68,0.5)') =>
    items.map((item, i) => (
      <div key={i} style={listItemStyle}>
        <span style={{ color: accentColor, flexShrink: 0, marginTop: 2 }}>—</span>
        <span>{item}</span>
      </div>
    ));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5,5,8,0.82)',
        backdropFilter: 'blur(12px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        animation: 'atlas-fade-in 300ms ease both',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'rgba(15,10,30,0.92)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 12,
          padding: '28px 32px',
          maxWidth: 680,
          width: '100%',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 0 60px -10px rgba(239,68,68,0.15)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.62rem',
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'rgba(239,68,68,0.7)',
                marginBottom: 4,
              }}
            >
              Session Findings
            </div>
            <h2
              style={{
                fontSize: '1.15rem',
                fontWeight: 500,
                color: 'rgba(226,232,240,0.92)',
                margin: 0,
                letterSpacing: '-0.02em',
              }}
            >
              What the Crucible Found
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid rgba(88,28,135,0.2)',
              borderRadius: 6,
              color: 'rgba(226,232,240,0.4)',
              fontSize: '0.7rem',
              letterSpacing: '0.08em',
              padding: '4px 10px',
              cursor: 'pointer',
              transition: 'all 140ms ease',
            }}
          >
            CLOSE
          </button>
        </div>

        {/* Contradictions */}
        {findings.contradictions.length > 0 && (
          <div style={sectionStyle}>
            <div style={labelStyle}>Contradictions</div>
            {renderList(findings.contradictions, 'rgba(239,68,68,0.6)')}
          </div>
        )}

        {/* Weaknesses */}
        {findings.weaknesses.length > 0 && (
          <div style={sectionStyle}>
            <div style={labelStyle}>Structural Weaknesses</div>
            {renderList(findings.weaknesses, 'rgba(249,115,22,0.6)')}
          </div>
        )}

        {/* Assumptions */}
        {findings.assumptions.length > 0 && (
          <div style={sectionStyle}>
            <div style={{ ...labelStyle, color: 'rgba(234,179,8,0.7)' }}>Exposed Assumptions</div>
            {renderList(findings.assumptions, 'rgba(234,179,8,0.55)')}
          </div>
        )}

        {/* Self-deceptions */}
        {findings.selfDeceptions.length > 0 && (
          <div style={sectionStyle}>
            <div style={{ ...labelStyle, color: 'rgba(167,139,250,0.75)' }}>Self-Deceptions</div>
            {renderList(findings.selfDeceptions, 'rgba(167,139,250,0.6)')}
          </div>
        )}

        {/* Surviving doctrine */}
        {findings.survivingDoctrine && (
          <div style={sectionStyle}>
            <div style={{ ...labelStyle, color: 'rgba(34,197,94,0.7)' }}>What Survived</div>
            <p style={{ fontSize: '0.85rem', lineHeight: 1.65, color: 'rgba(226,232,240,0.78)', margin: 0 }}>
              {findings.survivingDoctrine}
            </p>
          </div>
        )}

        {/* Unanswered questions */}
        {findings.unansweredQuestions.length > 0 && (
          <div style={sectionStyle}>
            <div style={{ ...labelStyle, color: 'rgba(99,102,241,0.75)' }}>Unanswered Questions</div>
            {renderList(findings.unansweredQuestions, 'rgba(99,102,241,0.6)')}
          </div>
        )}

        {/* Reconstruction */}
        {reconstruction && (
          <div
            style={{
              marginTop: 24,
              paddingTop: 20,
              borderTop: '1px solid rgba(88,28,135,0.15)',
            }}
          >
            <div
              style={{
                fontSize: '0.62rem',
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'rgba(34,197,94,0.7)',
                marginBottom: 12,
              }}
            >
              Reconstruction
            </div>
            {reconstruction.strongerDoctrine && (
              <p
                style={{
                  fontSize: '0.875rem',
                  lineHeight: 1.7,
                  color: 'rgba(226,232,240,0.88)',
                  margin: '0 0 14px',
                  background: 'rgba(34,197,94,0.05)',
                  border: '1px solid rgba(34,197,94,0.15)',
                  borderRadius: 6,
                  padding: '12px 14px',
                }}
              >
                {reconstruction.strongerDoctrine}
              </p>
            )}
            {reconstruction.cleanerArguments.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(34,197,94,0.55)', marginBottom: 6 }}>
                  Cleaner Arguments
                </div>
                {renderList(reconstruction.cleanerArguments, 'rgba(34,197,94,0.5)')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Setup Phase ────────────────────────────────────────────────────────────

function SetupPhase({
  onStart,
}: {
  onStart: (mode: CrucibleMode, intensity: CrucibleIntensity, topic: string) => void;
}) {
  const [selectedMode, setSelectedMode] = useState<CrucibleMode | null>(null);
  const [intensity, setIntensity] = useState<CrucibleIntensity>('calibrated');
  const [topic, setTopic] = useState('');
  const topicRef = useRef<HTMLTextAreaElement>(null);

  const modes = Object.keys(MODE_META) as CrucibleMode[];

  const canStart = selectedMode !== null && topic.trim().length > 0;

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '36px 40px',
        animation: 'atlas-fade-in 300ms ease both',
      }}
    >
      <div style={{ maxWidth: 800, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <div
            style={{
              fontSize: '0.62rem',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(239,68,68,0.65)',
              marginBottom: 8,
            }}
          >
            Crucible Chamber
          </div>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 400,
              letterSpacing: '-0.03em',
              color: 'rgba(226,232,240,0.92)',
              margin: '0 0 10px',
            }}
          >
            Adversarial Testing
          </h1>
          <p
            style={{
              fontSize: '0.85rem',
              color: 'rgba(226,232,240,0.38)',
              margin: 0,
              lineHeight: 1.7,
              maxWidth: 500,
            }}
          >
            Atlas will challenge your beliefs, plans, and assumptions with ruthless intellectual
            honesty. Choose your mode, set the intensity, and name your subject.
          </p>
        </div>

        {/* Mode selection */}
        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              fontSize: '0.62rem',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(226,232,240,0.3)',
              marginBottom: 12,
            }}
          >
            Select Mode
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
              gap: 8,
            }}
          >
            {modes.map((m) => {
              const meta = MODE_META[m];
              const isSelected = selectedMode === m;
              return (
                <button
                  key={m}
                  onClick={() => setSelectedMode(m)}
                  style={{
                    background: isSelected
                      ? 'rgba(239,68,68,0.08)'
                      : 'rgba(15,10,30,0.55)',
                    border: `1px solid ${
                      isSelected ? 'rgba(239,68,68,0.35)' : 'rgba(88,28,135,0.14)'
                    }`,
                    borderRadius: 8,
                    padding: '12px 14px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 160ms ease',
                    fontFamily: 'inherit',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.22)';
                      (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.04)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(88,28,135,0.14)';
                      (e.currentTarget as HTMLButtonElement).style.background = 'rgba(15,10,30,0.55)';
                    }
                  }}
                >
                  <div
                    style={{
                      color: isSelected ? 'rgba(239,68,68,0.8)' : 'rgba(226,232,240,0.3)',
                      transition: 'color 160ms ease',
                    }}
                  >
                    {meta.icon}
                  </div>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: isSelected ? 'rgba(226,232,240,0.95)' : 'rgba(226,232,240,0.65)',
                      letterSpacing: '-0.01em',
                      transition: 'color 160ms ease',
                    }}
                  >
                    {meta.label}
                  </div>
                  <div
                    style={{
                      fontSize: '0.72rem',
                      color: 'rgba(226,232,240,0.32)',
                      lineHeight: 1.55,
                    }}
                  >
                    {meta.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Intensity selector */}
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: '0.62rem',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(226,232,240,0.3)',
              marginBottom: 12,
            }}
          >
            Intensity
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['calibrated', 'intensive', 'ruthless'] as CrucibleIntensity[]).map((lvl) => {
              const conf = INTENSITY_CONFIG[lvl];
              const isActive = intensity === lvl;
              return (
                <button
                  key={lvl}
                  onClick={() => setIntensity(lvl)}
                  style={{
                    flex: 1,
                    background: isActive
                      ? conf.barColor.replace('0.7', '0.1')
                      : 'rgba(15,10,30,0.55)',
                    border: `1px solid ${isActive ? conf.barColor : 'rgba(88,28,135,0.14)'}`,
                    borderRadius: 8,
                    padding: '12px 16px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 160ms ease',
                    fontFamily: 'inherit',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: isActive ? conf.color : 'rgba(226,232,240,0.55)',
                      marginBottom: 3,
                      transition: 'color 160ms ease',
                    }}
                  >
                    {conf.label}
                  </div>
                  <div
                    style={{
                      fontSize: '0.7rem',
                      color: 'rgba(226,232,240,0.3)',
                      lineHeight: 1.5,
                    }}
                  >
                    {conf.description}
                  </div>
                  {/* Intensity pip bar */}
                  <div
                    style={{
                      marginTop: 10,
                      height: 2,
                      background: 'rgba(88,28,135,0.15)',
                      borderRadius: 1,
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: lvl === 'calibrated' ? '33%' : lvl === 'intensive' ? '66%' : '100%',
                        background: isActive ? conf.barColor : 'rgba(88,28,135,0.3)',
                        borderRadius: 1,
                        transition: 'background 160ms ease',
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Topic input */}
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: '0.62rem',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(226,232,240,0.3)',
              marginBottom: 12,
            }}
          >
            Subject Under Examination
          </div>
          <div
            style={{
              background: 'rgba(5,5,8,0.72)',
              border: '1px solid rgba(88,28,135,0.14)',
              borderRadius: 8,
              transition: 'border-color 160ms ease, box-shadow 160ms ease',
            }}
            onFocusCapture={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(239,68,68,0.3)';
              (e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 0 2px rgba(239,68,68,0.06)';
            }}
            onBlurCapture={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(88,28,135,0.14)';
              (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
            }}
          >
            <textarea
              ref={topicRef}
              value={topic}
              onChange={(e) => {
                setTopic(e.target.value);
                const el = e.target;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
              }}
              placeholder={
                selectedMode
                  ? `Describe what you want to ${MODE_META[selectedMode].description.toLowerCase()}…`
                  : 'Select a mode first, then describe your subject…'
              }
              rows={3}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                padding: '12px 14px',
                color: 'rgba(226,232,240,0.9)',
                fontSize: '0.875rem',
                lineHeight: 1.65,
                fontFamily: 'inherit',
                minHeight: 72,
                maxHeight: 160,
                overflow: 'auto',
              }}
              className="crucible-textarea"
            />
          </div>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: '0.7rem',
              color: 'rgba(226,232,240,0.2)',
              lineHeight: 1.5,
            }}
          >
            Be specific. Vague subjects produce vague pressure. The more precise your input, the
            more surgical the challenge.
          </p>
        </div>

        {/* Start button */}
        <button
          onClick={() => {
            if (canStart && selectedMode) {
              onStart(selectedMode, intensity, topic.trim());
            }
          }}
          disabled={!canStart}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: canStart ? 'rgba(239,68,68,0.12)' : 'rgba(15,10,30,0.55)',
            border: `1px solid ${canStart ? 'rgba(239,68,68,0.4)' : 'rgba(88,28,135,0.14)'}`,
            borderRadius: 8,
            padding: '13px 24px',
            color: canStart ? 'rgba(239,68,68,0.9)' : 'rgba(226,232,240,0.2)',
            fontSize: '0.8rem',
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            cursor: canStart ? 'pointer' : 'not-allowed',
            transition: 'all 160ms ease',
            fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => {
            if (canStart) {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.18)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.55)';
            }
          }}
          onMouseLeave={(e) => {
            if (canStart) {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.12)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.4)';
            }
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          Enter the Crucible
        </button>
      </div>

      <style>{`
        .crucible-textarea::placeholder {
          color: rgba(226,232,240,0.18);
        }
        .crucible-textarea:focus {
          outline: none;
        }
      `}</style>
    </div>
  );
}

// ── Active Session Phase ──────────────────────────────────────────────────

function ActiveSession() {
  const session = useAtlasStore((s) => s.activeCrucibleSession);
  const addCrucibleExchange = useAtlasStore((s) => s.addCrucibleExchange);
  const endCrucibleSession = useAtlasStore((s) => s.endCrucibleSession);
  const clearCrucibleSession = useAtlasStore((s) => s.clearCrucibleSession);

  const [exchanges, setExchanges] = useState<StreamingExchange[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showFindings, setShowFindings] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  if (!session) return null;

  const { mode, intensity, topic } = session;
  const intensityConf = INTENSITY_CONFIG[intensity];

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [exchanges]);

  // Auto-focus
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Infer epistemic category from response text
  const inferCategory = useCallback((text: string): CrucibleExchange['epistemicCategory'] => {
    const lower = text.toLowerCase();
    if (lower.includes('[logical fracture]') || lower.includes('contradiction') || lower.includes('cannot both be true'))
      return 'logical-fracture';
    if (lower.includes('[adversarial hypothesis]') || lower.includes('counter-thesis') || lower.includes('consider instead'))
      return 'adversarial-hypothesis';
    if (lower.includes('[structural critique]') || lower.includes('framework') || lower.includes('the structure'))
      return 'structural-critique';
    if (lower.includes('[epistemic warning]') || lower.includes('motivated reasoning') || lower.includes('self-deception'))
      return 'epistemic-warning';
    if (lower.includes('[synthesis]') || lower.includes('reconstruct') || lower.includes('stronger version'))
      return 'synthesis';
    return 'reality-check';
  }, []);

  const buildConversationHistory = useCallback((): OllamaMessage[] => {
    const systemPrompt = buildCrucibleSystemPrompt(mode, intensity, topic);
    const history: OllamaMessage[] = [{ role: 'system', content: systemPrompt }];

    // Include prior exchanges (last 16 turns)
    const recent = exchanges.slice(-8);
    for (const ex of recent) {
      if (ex.userInput) {
        history.push({ role: 'user', content: ex.userInput });
      }
      if (ex.atlasResponse && !ex.isStreaming && !ex.error) {
        history.push({ role: 'assistant', content: ex.atlasResponse });
      }
    }

    return history;
  }, [mode, intensity, topic, exchanges]);

  const handleSubmit = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isStreaming) return;

    abortRef.current?.abort();

    const exchangeId = generateId();

    const newExchange: StreamingExchange = {
      id: exchangeId,
      userInput: text,
      atlasResponse: '',
      isStreaming: true,
      epistemicCategory: 'adversarial-hypothesis',
    };

    setInputValue('');
    setExchanges((prev) => [...prev, newExchange]);
    setIsStreaming(true);

    // Cycle thinking labels
    const labels = ['ANALYZING WEAKNESSES', 'SCANNING FOR CONTRADICTIONS', 'PREPARING ADVERSARIAL RESPONSE'];
    let lIdx = 0;
    setThinkingLabel(labels[0]);
    const labelInterval = setInterval(() => {
      lIdx = (lIdx + 1) % labels.length;
      setThinkingLabel(labels[lIdx]);
    }, 2000);

    const history = buildConversationHistory();
    history.push({ role: 'user', content: text });

    abortRef.current = streamChat(
      history,
      {
        onToken: (token) => {
          setExchanges((prev) =>
            prev.map((ex) =>
              ex.id === exchangeId
                ? { ...ex, atlasResponse: ex.atlasResponse + token }
                : ex
            )
          );
        },
        onDone: (fullText) => {
          clearInterval(labelInterval);
          setThinkingLabel(null);
          setIsStreaming(false);

          const category = inferCategory(fullText);

          setExchanges((prev) =>
            prev.map((ex) =>
              ex.id === exchangeId
                ? { ...ex, atlasResponse: fullText, isStreaming: false, epistemicCategory: category }
                : ex
            )
          );

          // Persist to store
          addCrucibleExchange({
            userInput: text,
            atlasResponse: fullText,
            epistemicCategory: category,
          });
        },
        onError: (err) => {
          clearInterval(labelInterval);
          setThinkingLabel(null);
          setIsStreaming(false);

          let errorMsg = err.message;
          if (err.code === 'NETWORK') {
            errorMsg = 'Cannot reach the local model. Make sure Ollama is running.';
          } else if (err.code === 'ABORTED') {
            return;
          }

          setExchanges((prev) =>
            prev.map((ex) =>
              ex.id === exchangeId
                ? { ...ex, isStreaming: false, error: errorMsg }
                : ex
            )
          );
        },
      },
      { temperature: intensityConf.temp }
    );
  }, [inputValue, isStreaming, buildConversationHistory, intensityConf.temp, inferCategory, addCrucibleExchange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handleAbort = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setThinkingLabel(null);
    setExchanges((prev) =>
      prev.map((ex) =>
        ex.isStreaming ? { ...ex, isStreaming: false } : ex
      )
    );
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const handleEndSession = () => {
    abortRef.current?.abort();
    endCrucibleSession();
    // Show findings if present
    if (session.findings) {
      setShowFindings(true);
    }
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Session header */}
      <div
        style={{
          borderBottom: '1px solid rgba(88,28,135,0.1)',
          background: 'rgba(15,10,30,0.55)',
          backdropFilter: 'blur(8px)',
          padding: '0 32px',
          flexShrink: 0,
        }}
      >
        {/* Intensity bar */}
        <IntensityBar intensity={intensity} />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 0',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {/* Mode badge */}
            <span
              style={{
                fontSize: '0.62rem',
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: intensityConf.color,
                background: intensityConf.color.replace('0.85', '0.08'),
                border: `1px solid ${intensityConf.color.replace('0.85', '0.25')}`,
                borderRadius: 4,
                padding: '2px 7px',
                flexShrink: 0,
              }}
            >
              {intensityConf.label}
            </span>
            <span
              style={{
                fontSize: '0.62rem',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(226,232,240,0.35)',
                flexShrink: 0,
              }}
            >
              {MODE_META[mode].label}
            </span>
            <span
              style={{
                fontSize: '0.78rem',
                color: 'rgba(226,232,240,0.5)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={topic}
            >
              — {topic}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {session.findings && (
              <button
                onClick={() => setShowFindings(true)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(34,197,94,0.25)',
                  borderRadius: 5,
                  color: 'rgba(34,197,94,0.7)',
                  fontSize: '0.62rem',
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  padding: '3px 9px',
                  cursor: 'pointer',
                  transition: 'all 140ms ease',
                }}
              >
                Findings
              </button>
            )}
            <button
              onClick={handleEndSession}
              disabled={isStreaming}
              style={{
                background: 'transparent',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 5,
                color: 'rgba(239,68,68,0.6)',
                fontSize: '0.62rem',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                padding: '3px 9px',
                cursor: isStreaming ? 'not-allowed' : 'pointer',
                transition: 'all 140ms ease',
                opacity: isStreaming ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isStreaming) {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.4)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'rgba(239,68,68,0.85)';
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.2)';
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(239,68,68,0.6)';
              }}
            >
              End Session
            </button>
            <button
              onClick={() => {
                abortRef.current?.abort();
                clearCrucibleSession();
              }}
              style={{
                background: 'transparent',
                border: '1px solid rgba(88,28,135,0.15)',
                borderRadius: 5,
                color: 'rgba(226,232,240,0.25)',
                fontSize: '0.62rem',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                padding: '3px 9px',
                cursor: 'pointer',
                transition: 'all 140ms ease',
              }}
              title="Exit Crucible (discard session)"
            >
              Exit
            </button>
          </div>
        </div>
      </div>

      {/* Exchanges list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '28px 40px 24px',
        }}
      >
        {exchanges.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 16,
              animation: 'atlas-fade-in 300ms ease both',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                border: `1.5px solid ${intensityConf.color.replace('0.85', '0.3')}`,
                background: `radial-gradient(circle, ${intensityConf.color.replace('0.85', '0.1')} 0%, transparent 70%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: intensityConf.color,
              }}
            >
              {MODE_META[mode].icon}
            </div>
            <div>
              <p
                style={{
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  color: 'rgba(226,232,240,0.7)',
                  margin: '0 0 6px',
                  letterSpacing: '-0.01em',
                }}
              >
                The Crucible is ready.
              </p>
              <p
                style={{
                  fontSize: '0.78rem',
                  color: 'rgba(226,232,240,0.28)',
                  margin: 0,
                  lineHeight: 1.65,
                  maxWidth: 360,
                }}
              >
                Present your position. Atlas will challenge it with{' '}
                <span style={{ color: intensityConf.color }}>
                  {intensityConf.label.toLowerCase()}
                </span>{' '}
                force.
              </p>
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            {exchanges.map((ex) => (
              <ExchangeBubble key={ex.id} exchange={ex} intensity={intensity} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Thinking indicator */}
      {thinkingLabel && (
        <div
          style={{
            position: 'absolute',
            bottom: 128,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15,10,30,0.9)',
            border: `1px solid ${intensityConf.color.replace('0.85', '0.25')}`,
            borderRadius: 20,
            padding: '5px 14px',
            fontSize: '0.6rem',
            fontWeight: 600,
            letterSpacing: '0.1em',
            color: intensityConf.color,
            textTransform: 'uppercase',
            backdropFilter: 'blur(8px)',
            animation: 'atlas-pulse-slow 1.5s ease infinite',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {thinkingLabel}
        </div>
      )}

      {/* Input area */}
      <div
        style={{
          borderTop: '1px solid rgba(88,28,135,0.1)',
          background: 'rgba(15,10,30,0.55)',
          backdropFilter: 'blur(12px)',
          padding: '14px 40px 18px',
          flexShrink: 0,
        }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            {/* Textarea wrapper */}
            <div
              style={{
                flex: 1,
                background: 'rgba(5,5,8,0.72)',
                border: '1px solid rgba(88,28,135,0.14)',
                borderRadius: 8,
                transition: 'border-color 140ms ease, box-shadow 140ms ease',
                position: 'relative',
              }}
              onFocusCapture={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = intensityConf.color.replace('0.85', '0.3');
                (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 2px ${intensityConf.color.replace('0.85', '0.06')}`;
              }}
              onBlurCapture={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(88,28,135,0.14)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
              }}
            >
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="State your position, belief, or plan…"
                rows={1}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  padding: '11px 13px',
                  color: 'rgba(226,232,240,0.9)',
                  fontSize: '0.875rem',
                  lineHeight: 1.6,
                  fontFamily: 'inherit',
                  minHeight: 42,
                  maxHeight: 200,
                  overflow: 'auto',
                }}
                className="crucible-input-textarea"
              />
            </div>

            {/* Send / Stop */}
            {isStreaming ? (
              <button
                onClick={handleAbort}
                title="Stop"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 7,
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  color: 'rgba(239,68,68,0.8)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 140ms ease',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                onClick={() => void handleSubmit()}
                disabled={!inputValue.trim()}
                title="Send (Enter)"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 7,
                  background: inputValue.trim()
                    ? intensityConf.color.replace('0.85', '0.12')
                    : 'transparent',
                  border: '1px solid',
                  borderColor: inputValue.trim()
                    ? intensityConf.color.replace('0.85', '0.4')
                    : 'rgba(88,28,135,0.14)',
                  color: inputValue.trim()
                    ? intensityConf.color
                    : 'rgba(226,232,240,0.2)',
                  cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 140ms ease',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22l-4-9-9-4 20-7z" />
                </svg>
              </button>
            )}
          </div>

          <div
            style={{
              marginTop: 7,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span
              style={{
                fontSize: '0.6rem',
                color: 'rgba(226,232,240,0.15)',
                letterSpacing: '0.06em',
              }}
            >
              Enter to send · Shift+Enter for newline
            </span>
            <span
              style={{
                fontSize: '0.6rem',
                color: 'rgba(226,232,240,0.15)',
                letterSpacing: '0.06em',
              }}
            >
              {exchanges.length} exchange{exchanges.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Findings panel overlay */}
      {showFindings && session.findings && (
        <FindingsPanel
          findings={session.findings}
          reconstruction={session.reconstruction}
          onClose={() => setShowFindings(false)}
        />
      )}

      <style>{`
        .crucible-input-textarea::placeholder {
          color: rgba(226,232,240,0.18);
        }
        .crucible-input-textarea:focus {
          outline: none;
        }
      `}</style>
    </div>
  );
}

// ── Main Export ────────────────────────────────────────────────────────────

export default function CrucibleChamber() {
  const activeCrucibleSession = useAtlasStore((s) => s.activeCrucibleSession);
  const startCrucibleSession = useAtlasStore((s) => s.startCrucibleSession);

  const handleStart = useCallback(
    (mode: CrucibleMode, intensity: CrucibleIntensity, topic: string) => {
      startCrucibleSession({ mode, intensity, topic });
    },
    [startCrucibleSession]
  );

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        fontFamily: "'Inter', sans-serif",
        color: 'rgba(226,232,240,0.92)',
      }}
    >
      {activeCrucibleSession ? (
        <ActiveSession key={activeCrucibleSession.id} />
      ) : (
        <SetupPhase onStart={handleStart} />
      )}
    </div>
  );
}
