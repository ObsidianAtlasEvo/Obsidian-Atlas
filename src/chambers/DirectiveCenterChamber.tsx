import React, { useState } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { nowISO } from '../lib/persistence';
import type {
  Directive,
  DirectiveType,
  DirectiveScope,
  DirectiveOutcome,
  AdaptivePosture,
} from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_TYPES: DirectiveType[] = [
  'tone', 'depth', 'structure', 'challenge', 'ui',
  'context', 'continuity', 'learning', 'boundary', 'custom',
];

const TYPE_COLORS: Record<DirectiveType, string> = {
  tone:        'rgba(59,130,246,0.75)',
  depth:       'rgba(99,102,241,0.75)',
  structure:   'rgba(20,184,166,0.75)',
  challenge:   'rgba(249,115,22,0.75)',
  ui:          'rgba(236,72,153,0.75)',
  context:     'rgba(34,197,94,0.75)',
  continuity:  'rgba(167,139,250,0.85)',
  learning:    'rgba(234,179,8,0.75)',
  boundary:    'rgba(239,68,68,0.75)',
  custom:      'rgba(148,163,184,0.65)',
};

const SCOPE_OPTIONS: DirectiveScope[] = [
  'persistent', 'session', 'chamber', 'question', 'once', 'default',
];

const OUTCOME_OPTIONS: DirectiveOutcome[] = [
  'fully-accepted', 'accepted-with-bounds', 'context-limited', 'rejected',
];

const OUTCOME_COLORS: Record<DirectiveOutcome, string> = {
  'fully-accepted':      'rgba(34,197,94,0.7)',
  'accepted-with-bounds':'rgba(201,162,39,0.9)',
  'context-limited':     'rgba(249,115,22,0.7)',
  'rejected':            'rgba(239,68,68,0.75)',
};

const TONE_OPTIONS = [
  'analytical', 'warm', 'stoic', 'provocative', 'clinical',
  'socratic', 'direct', 'expansive', 'terse', 'empathetic',
];

const LANGUAGE_LEVELS: AdaptivePosture['languageLevel'][] = [
  'simple', 'standard', 'advanced', 'expert', 'forensic',
];

// ── Shared Styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: 'rgba(5,5,8,0.72)',
  border: '1px solid rgba(88,28,135,0.2)',
  borderRadius: 6,
  padding: '9px 12px',
  color: 'rgba(226,232,240,0.92)',
  fontSize: '0.855rem',
  fontFamily: 'Inter, sans-serif',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  transition: 'border-color 140ms ease',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'none' as const,
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.62rem',
  fontWeight: 600,
  letterSpacing: '0.12em',
  color: 'rgba(226,232,240,0.3)',
  textTransform: 'uppercase',
  marginBottom: 5,
  display: 'block',
};

const sectionStyle: React.CSSProperties = {
  background: 'rgba(15,10,30,0.55)',
  border: '1px solid rgba(88,28,135,0.14)',
  borderRadius: 12,
  padding: '20px 22px',
  marginBottom: 18,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '0.62rem',
  fontWeight: 600,
  letterSpacing: '0.12em',
  color: 'rgba(201,162,39,0.9)',
  textTransform: 'uppercase',
  marginBottom: 16,
};

// ── Sub-components ────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: DirectiveType }) {
  return (
    <span
      style={{
        fontSize: '0.58rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: TYPE_COLORS[type],
        background: TYPE_COLORS[type].replace(/[\d.]+\)$/, '0.1)'),
        border: `1px solid ${TYPE_COLORS[type].replace(/[\d.]+\)$/, '0.2)')}`,
        borderRadius: 4,
        padding: '2px 6px',
        flexShrink: 0,
      }}
    >
      {type}
    </span>
  );
}

function ScopeBadge({ scope }: { scope: DirectiveScope }) {
  return (
    <span
      style={{
        fontSize: '0.58rem',
        fontWeight: 600,
        letterSpacing: '0.09em',
        textTransform: 'uppercase',
        color: 'rgba(167,139,250,0.85)',
        background: 'rgba(167,139,250,0.08)',
        border: '1px solid rgba(167,139,250,0.18)',
        borderRadius: 4,
        padding: '2px 6px',
        flexShrink: 0,
      }}
    >
      {scope}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: DirectiveOutcome }) {
  const color = OUTCOME_COLORS[outcome];
  return (
    <span
      style={{
        fontSize: '0.58rem',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color,
        background: color.replace(/[\d.]+\)$/, '0.08)'),
        border: `1px solid ${color.replace(/[\d.]+\)$/, '0.18)')}`,
        borderRadius: 4,
        padding: '2px 6px',
        flexShrink: 0,
      }}
    >
      {outcome}
    </span>
  );
}

function IconBtn({
  onClick,
  title,
  danger,
  children,
}: {
  onClick: () => void;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? danger ? 'rgba(239,68,68,0.1)' : 'rgba(88,28,135,0.15)'
          : 'transparent',
        border: `1px solid ${hovered
          ? danger ? 'rgba(239,68,68,0.3)' : 'rgba(88,28,135,0.35)'
          : 'rgba(88,28,135,0.1)'}`,
        borderRadius: 5,
        padding: '4px 7px',
        color: hovered
          ? danger ? 'rgba(239,68,68,0.85)' : 'rgba(167,139,250,0.85)'
          : 'rgba(226,232,240,0.3)',
        cursor: 'pointer',
        fontSize: '0.7rem',
        fontFamily: 'Inter, sans-serif',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        transition: 'all 120ms ease',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function DirectiveCard({
  directive,
  onToggle,
  onDelete,
  dimmed,
}: {
  directive: Directive;
  onToggle: () => void;
  onDelete: () => void;
  dimmed?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        background: 'rgba(5,5,8,0.72)',
        border: `1px solid ${directive.isActive ? 'rgba(88,28,135,0.22)' : 'rgba(88,28,135,0.1)'}`,
        borderRadius: 8,
        overflow: 'hidden',
        opacity: dimmed ? 0.45 : 1,
        transition: 'opacity 200ms ease, border-color 150ms ease',
        marginBottom: 8,
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '12px 14px',
        }}
      >
        {/* Active indicator */}
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: directive.isActive ? 'rgba(34,197,94,0.7)' : 'rgba(226,232,240,0.12)',
            marginTop: 6,
            flexShrink: 0,
            boxShadow: directive.isActive ? '0 0 6px rgba(34,197,94,0.4)' : 'none',
            transition: 'all 200ms ease',
          }}
        />

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: '0 0 8px',
              fontSize: '0.85rem',
              fontWeight: 500,
              color: 'rgba(226,232,240,0.9)',
              lineHeight: 1.5,
              letterSpacing: '-0.01em',
            }}
          >
            {directive.text}
          </p>

          {/* Badges row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
            {directive.type.map((t) => (
              <TypeBadge key={t} type={t} />
            ))}
            <ScopeBadge scope={directive.scope} />
            <OutcomeBadge outcome={directive.outcome} />
            {directive.targetChamber && (
              <span
                style={{
                  fontSize: '0.58rem',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'rgba(226,232,240,0.3)',
                  background: 'rgba(226,232,240,0.04)',
                  border: '1px solid rgba(226,232,240,0.08)',
                  borderRadius: 4,
                  padding: '2px 6px',
                }}
              >
                ⌂ {directive.targetChamber}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          <IconBtn onClick={() => setExpanded((v) => !v)} title={expanded ? 'Collapse' : 'Expand'}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d={expanded ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconBtn>
          <IconBtn onClick={onToggle} title={directive.isActive ? 'Deactivate' : 'Activate'}>
            {directive.isActive ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </IconBtn>
          <IconBtn onClick={onDelete} title="Delete directive" danger>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="3,6 5,6 21,6" />
              <path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6" />
              <path d="M10,11v6M14,11v6" strokeLinecap="round" />
            </svg>
          </IconBtn>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          style={{
            borderTop: '1px solid rgba(88,28,135,0.1)',
            padding: '12px 14px 12px 30px',
            animation: 'atlas-fade-in 200ms ease both',
          }}
        >
          {directive.explanation && (
            <p
              style={{
                margin: '0 0 10px',
                fontSize: '0.8rem',
                color: 'rgba(226,232,240,0.55)',
                lineHeight: 1.7,
                fontStyle: 'italic',
              }}
            >
              {directive.explanation}
            </p>
          )}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.68rem', color: 'rgba(226,232,240,0.22)' }}>
              Created {new Date(directive.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            {directive.expiresAt && (
              <span style={{ fontSize: '0.68rem', color: 'rgba(249,115,22,0.55)' }}>
                Expires {new Date(directive.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Posture Slider ─────────────────────────────────────────────────────────────

function PostureSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  displayValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  displayValue?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={labelStyle as React.CSSProperties}>{label}</span>
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            color: 'rgba(201,162,39,0.9)',
            letterSpacing: '0.04em',
          }}
        >
          {displayValue ?? value}
        </span>
      </div>
      <div style={{ position: 'relative', height: 6 }}>
        {/* Track background */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(88,28,135,0.14)',
            borderRadius: 3,
          }}
        />
        {/* Gold fill */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${pct}%`,
            height: '100%',
            background: 'linear-gradient(90deg, rgba(201,162,39,0.55), rgba(201,162,39,0.9))',
            borderRadius: 3,
            transition: 'width 80ms ease',
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
            margin: 0,
          }}
        />
      </div>
    </div>
  );
}

// ── New Directive Form ────────────────────────────────────────────────────────

interface NewDirectiveForm {
  text: string;
  type: DirectiveType[];
  scope: DirectiveScope;
  outcome: DirectiveOutcome;
  explanation: string;
  targetChamber: string;
  expiresAt: string;
}

const DEFAULT_FORM: NewDirectiveForm = {
  text: '',
  type: [],
  scope: 'persistent',
  outcome: 'fully-accepted',
  explanation: '',
  targetChamber: '',
  expiresAt: '',
};

function NewDirectiveFormPanel({
  onSave,
  onCancel,
}: {
  onSave: (form: NewDirectiveForm) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<NewDirectiveForm>(DEFAULT_FORM);

  function toggleType(t: DirectiveType) {
    setForm((f) => ({
      ...f,
      type: f.type.includes(t) ? f.type.filter((x) => x !== t) : [...f.type, t],
    }));
  }

  const canSave = form.text.trim().length > 3 && form.type.length > 0;

  return (
    <div
      style={{
        background: 'rgba(15,10,30,0.72)',
        border: '1px solid rgba(88,28,135,0.3)',
        borderRadius: 12,
        padding: '20px 22px',
        animation: 'atlas-fade-in 250ms ease both',
        marginBottom: 18,
      }}
    >
      <div style={{ ...sectionTitleStyle, marginBottom: 18 }}>New Directive</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Text */}
        <div>
          <label style={labelStyle}>Directive Text</label>
          <textarea
            value={form.text}
            onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
            placeholder="State the directive clearly. Atlas will follow this instruction in every applicable context."
            autoFocus
            rows={3}
            style={{
              ...inputStyle,
              resize: 'vertical',
              lineHeight: 1.7,
            }}
          />
        </div>

        {/* Types */}
        <div>
          <label style={labelStyle}>Type (select all that apply)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ALL_TYPES.map((t) => {
              const selected = form.type.includes(t);
              const color = TYPE_COLORS[t];
              return (
                <button
                  key={t}
                  onClick={() => toggleType(t)}
                  style={{
                    background: selected ? color.replace(/[\d.]+\)$/, '0.12)') : 'transparent',
                    border: `1px solid ${selected ? color : 'rgba(88,28,135,0.18)'}`,
                    borderRadius: 5,
                    padding: '4px 10px',
                    color: selected ? color : 'rgba(226,232,240,0.3)',
                    cursor: 'pointer',
                    fontSize: '0.68rem',
                    fontWeight: selected ? 700 : 400,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    fontFamily: 'Inter, sans-serif',
                    transition: 'all 130ms ease',
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scope + Outcome row */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Scope</label>
            <select
              value={form.scope}
              onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as DirectiveScope }))}
              style={selectStyle}
            >
              {SCOPE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Outcome</label>
            <select
              value={form.outcome}
              onChange={(e) => setForm((f) => ({ ...f, outcome: e.target.value as DirectiveOutcome }))}
              style={selectStyle}
            >
              {OUTCOME_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Explanation */}
        <div>
          <label style={labelStyle}>Explanation (optional)</label>
          <textarea
            value={form.explanation}
            onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))}
            placeholder="Why does this directive exist? What outcome are you optimizing for?"
            rows={2}
            style={{
              ...inputStyle,
              resize: 'vertical',
              lineHeight: 1.7,
            }}
          />
        </div>

        {/* Target Chamber + Expires row */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Target Chamber (optional)</label>
            <input
              type="text"
              value={form.targetChamber}
              onChange={(e) => setForm((f) => ({ ...f, targetChamber: e.target.value }))}
              placeholder="e.g. journal, atlas, crucible"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Expires At (optional)</label>
            <input
              type="datetime-local"
              value={form.expiresAt}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              style={{
                ...inputStyle,
                colorScheme: 'dark',
              }}
            />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: '1px solid rgba(88,28,135,0.18)',
              borderRadius: 6,
              padding: '8px 16px',
              color: 'rgba(226,232,240,0.35)',
              cursor: 'pointer',
              fontSize: '0.78rem',
              fontFamily: 'Inter, sans-serif',
              transition: 'all 130ms ease',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={!canSave}
            style={{
              background: canSave ? 'rgba(88,28,135,0.28)' : 'rgba(88,28,135,0.08)',
              border: `1px solid ${canSave ? 'rgba(88,28,135,0.5)' : 'rgba(88,28,135,0.15)'}`,
              borderRadius: 6,
              padding: '8px 18px',
              color: canSave ? 'rgba(167,139,250,0.9)' : 'rgba(226,232,240,0.2)',
              cursor: canSave ? 'pointer' : 'not-allowed',
              fontSize: '0.78rem',
              fontWeight: 500,
              fontFamily: 'Inter, sans-serif',
              transition: 'all 130ms ease',
            }}
          >
            Save Directive
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DirectiveCenterChamber() {
  const directives     = useAtlasStore((s) => s.directives);
  const addDirective   = useAtlasStore((s) => s.addDirective);
  const removeDirective = useAtlasStore((s) => s.removeDirective);
  const toggleDirective = useAtlasStore((s) => s.toggleDirective);
  const activePosture  = useAtlasStore((s) => s.activePosture);
  const setPosture     = useAtlasStore((s) => s.setPosture);

  const [isAdding, setIsAdding] = useState(false);
  const [showInactive, setShowInactive] = useState(true);

  const active   = directives.filter((d) => d.isActive);
  const inactive = directives.filter((d) => !d.isActive);

  async function handleSave(form: NewDirectiveForm) {
    await addDirective({
      text:          form.text.trim(),
      type:          form.type,
      scope:         form.scope,
      outcome:       form.outcome,
      explanation:   form.explanation.trim(),
      targetChamber: form.targetChamber.trim() || undefined,
      expiresAt:     form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
      isActive:      true,
    });
    setIsAdding(false);
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        fontFamily: 'Inter, sans-serif',
        animation: 'atlas-fade-in 300ms ease both',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: '20px 28px 16px',
          borderBottom: '1px solid rgba(88,28,135,0.14)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: '1rem',
              fontWeight: 500,
              color: 'rgba(226,232,240,0.92)',
              letterSpacing: '-0.02em',
            }}
          >
            Directive Center
          </h2>
          <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: 'rgba(226,232,240,0.28)' }}>
            {active.length} active · {inactive.length} inactive · Direct control over Atlas's behavior posture
          </p>
        </div>

        <button
          onClick={() => setIsAdding(true)}
          disabled={isAdding}
          style={{
            background: isAdding ? 'rgba(88,28,135,0.08)' : 'rgba(88,28,135,0.2)',
            border: `1px solid ${isAdding ? 'rgba(88,28,135,0.18)' : 'rgba(88,28,135,0.45)'}`,
            borderRadius: 6,
            padding: '7px 14px',
            color: isAdding ? 'rgba(167,139,250,0.3)' : 'rgba(167,139,250,0.85)',
            cursor: isAdding ? 'not-allowed' : 'pointer',
            fontSize: '0.75rem',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 500,
            transition: 'all 140ms ease',
            flexShrink: 0,
          }}
        >
          + New Directive
        </button>
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '22px 28px 32px' }}>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 1: Posture Control Panel
            ═══════════════════════════════════════════════════════════════════ */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Posture Control Panel</div>

          {/* Sliders grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
            {/* Depth */}
            <PostureSlider
              label="Depth"
              value={activePosture.depth}
              min={1}
              max={5}
              step={1}
              onChange={(v) => setPosture({ depth: v as AdaptivePosture['depth'] })}
              displayValue={`${activePosture.depth} / 5`}
            />

            {/* Challenge */}
            <PostureSlider
              label="Challenge"
              value={activePosture.challenge}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => setPosture({ challenge: v })}
              displayValue={`${Math.round(activePosture.challenge * 100)}%`}
            />

            {/* Directness */}
            <PostureSlider
              label="Directness"
              value={activePosture.directness}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => setPosture({ directness: v })}
              displayValue={`${Math.round(activePosture.directness * 100)}%`}
            />

            {/* Continuity Intensity */}
            <PostureSlider
              label="Continuity Intensity"
              value={activePosture.continuityIntensity}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => setPosture({ continuityIntensity: v })}
              displayValue={`${Math.round(activePosture.continuityIntensity * 100)}%`}
            />
          </div>

          {/* Tone + Language Level row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 4 }}>
            {/* Tone */}
            <div>
              <label style={labelStyle}>Tone</label>
              <select
                value={activePosture.tone}
                onChange={(e) => setPosture({ tone: e.target.value })}
                style={selectStyle}
              >
                {TONE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* UI Density */}
            <div>
              <label style={labelStyle}>UI Density</label>
              <div style={{ display: 'flex', gap: 0, border: '1px solid rgba(88,28,135,0.2)', borderRadius: 7, overflow: 'hidden' }}>
                {(['compact', 'spacious'] as const).map((d) => {
                  const active = activePosture.uiDensity === d;
                  return (
                    <button
                      key={d}
                      onClick={() => setPosture({ uiDensity: d })}
                      style={{
                        flex: 1,
                        background: active ? 'rgba(88,28,135,0.25)' : 'rgba(5,5,8,0.72)',
                        border: 'none',
                        padding: '9px 0',
                        color: active ? 'rgba(167,139,250,0.9)' : 'rgba(226,232,240,0.35)',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: active ? 600 : 400,
                        letterSpacing: '0.04em',
                        transition: 'all 120ms ease',
                      }}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Language Level segmented buttons */}
          <div style={{ marginTop: 18 }}>
            <label style={labelStyle}>Language Level</label>
            <div style={{ display: 'flex', gap: 0, border: '1px solid rgba(88,28,135,0.2)', borderRadius: 7, overflow: 'hidden' }}>
              {LANGUAGE_LEVELS.map((lvl) => {
                const isActive = activePosture.languageLevel === lvl;
                return (
                  <button
                    key={lvl}
                    onClick={() => setPosture({ languageLevel: lvl })}
                    style={{
                      flex: 1,
                      background: isActive ? 'rgba(88,28,135,0.22)' : 'rgba(5,5,8,0.72)',
                      border: 'none',
                      borderRight: lvl !== 'forensic' ? '1px solid rgba(88,28,135,0.14)' : 'none',
                      padding: '9px 0',
                      color: isActive ? 'rgba(201,162,39,0.9)' : 'rgba(226,232,240,0.28)',
                      cursor: 'pointer',
                      fontSize: '0.65rem',
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: isActive ? 700 : 400,
                      letterSpacing: '0.07em',
                      textTransform: 'uppercase',
                      transition: 'all 120ms ease',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {lvl}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active directives hint */}
          {activePosture.activeDirectives.length > 0 && (
            <div
              style={{
                marginTop: 16,
                padding: '8px 12px',
                background: 'rgba(167,139,250,0.05)',
                border: '1px solid rgba(167,139,250,0.1)',
                borderRadius: 6,
                fontSize: '0.7rem',
                color: 'rgba(226,232,240,0.3)',
                letterSpacing: '0.03em',
              }}
            >
              <span style={{ color: 'rgba(167,139,250,0.55)', fontWeight: 600 }}>
                {activePosture.activeDirectives.length}
              </span>{' '}
              directive{activePosture.activeDirectives.length !== 1 ? 's' : ''} wired into posture
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 2: Active Directives
            ═══════════════════════════════════════════════════════════════════ */}
        <div style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={sectionTitleStyle as React.CSSProperties}>
              Active Directives
              {active.length > 0 && (
                <span
                  style={{
                    marginLeft: 8,
                    background: 'rgba(34,197,94,0.12)',
                    border: '1px solid rgba(34,197,94,0.2)',
                    borderRadius: 10,
                    padding: '1px 7px',
                    fontSize: '0.58rem',
                    color: 'rgba(34,197,94,0.7)',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                  }}
                >
                  {active.length}
                </span>
              )}
            </div>
          </div>

          {active.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '28px 0',
                color: 'rgba(226,232,240,0.2)',
              }}
            >
              <div style={{ fontSize: '0.82rem', marginBottom: 5 }}>No active directives.</div>
              <div style={{ fontSize: '0.72rem', lineHeight: 1.7, maxWidth: 340, margin: '0 auto' }}>
                Create a directive below to take direct control of Atlas's response behavior, tone, and structure.
              </div>
            </div>
          ) : (
            <div>
              {active.map((d) => (
                <DirectiveCard
                  key={d.id}
                  directive={d}
                  onToggle={() => void toggleDirective(d.id)}
                  onDelete={() => void removeDirective(d.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 3: New Directive Form + All Directives
            ═══════════════════════════════════════════════════════════════════ */}

        {/* New directive form */}
        {isAdding && (
          <NewDirectiveFormPanel
            onSave={(form) => void handleSave(form)}
            onCancel={() => setIsAdding(false)}
          />
        )}

        {/* All directives (inactive) */}
        <div style={sectionStyle}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: showInactive && inactive.length > 0 ? 16 : 0,
              cursor: inactive.length > 0 ? 'pointer' : 'default',
            }}
            onClick={() => inactive.length > 0 && setShowInactive((v) => !v)}
          >
            <div style={sectionTitleStyle as React.CSSProperties}>
              Inactive Directives
              {inactive.length > 0 && (
                <span
                  style={{
                    marginLeft: 8,
                    background: 'rgba(88,28,135,0.1)',
                    border: '1px solid rgba(88,28,135,0.18)',
                    borderRadius: 10,
                    padding: '1px 7px',
                    fontSize: '0.58rem',
                    color: 'rgba(226,232,240,0.28)',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                  }}
                >
                  {inactive.length}
                </span>
              )}
            </div>

            {inactive.length > 0 && (
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(226,232,240,0.2)"
                strokeWidth="2"
                style={{
                  transform: showInactive ? 'rotate(180deg)' : 'rotate(0)',
                  transition: 'transform 200ms ease',
                  flexShrink: 0,
                  marginBottom: 16,
                }}
              >
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>

          {inactive.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '20px 0 8px',
                color: 'rgba(226,232,240,0.15)',
                fontSize: '0.78rem',
              }}
            >
              No inactive directives.
            </div>
          ) : showInactive ? (
            <div style={{ animation: 'atlas-fade-in 200ms ease both' }}>
              {inactive.map((d) => (
                <DirectiveCard
                  key={d.id}
                  directive={d}
                  onToggle={() => void toggleDirective(d.id)}
                  onDelete={() => void removeDirective(d.id)}
                  dimmed
                />
              ))}
            </div>
          ) : null}
        </div>

        {/* Empty state — no directives at all */}
        {directives.length === 0 && !isAdding && (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: 'rgba(226,232,240,0.18)',
              animation: 'atlas-fade-in 350ms ease both',
            }}
          >
            <div style={{ fontSize: '1.8rem', marginBottom: 14, opacity: 0.3 }}>⌁</div>
            <div style={{ fontSize: '0.875rem', marginBottom: 8, color: 'rgba(226,232,240,0.25)' }}>
              No directives yet.
            </div>
            <div style={{ fontSize: '0.75rem', lineHeight: 1.75, maxWidth: 380, margin: '0 auto', color: 'rgba(226,232,240,0.15)' }}>
              Directives are persistent instructions that govern Atlas's behavior across sessions. Create your first directive above.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
