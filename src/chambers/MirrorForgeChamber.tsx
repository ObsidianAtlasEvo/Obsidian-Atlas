/**
 * MirrorForgeChamber — Advanced self-modeling chamber.
 *
 * Reflects the user's thinking patterns, tracks behavioral patterns,
 * and shows decision divergence analysis across four sections:
 *   1. Current Read    — Atlas's live psychological state read
 *   2. Active Modes   — Detected cognitive/behavioral modes
 *   3. Pattern Ledger — Recurring behavioral patterns
 *   4. Decision Divergence — Most Likely vs Highest Order path comparison
 */

import React, { useState, useCallback, useRef } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { generateId, nowISO } from '../lib/persistence';
import type { MirrorforgeModel } from '@/types';

// ── Design tokens ─────────────────────────────────────────────────────────────

const T = {
  gold:      'rgba(201,162,39,0.9)',
  goldDim:   'rgba(201,162,39,0.22)',
  goldBorder:'rgba(201,162,39,0.35)',
  violet:    'rgba(167,139,250,0.85)',
  violetDim: 'rgba(167,139,250,0.18)',
  danger:    'rgba(239,68,68,0.75)',
  dangerDim: 'rgba(239,68,68,0.12)',
  dangerBorder:'rgba(239,68,68,0.25)',
  success:   'rgba(34,197,94,0.7)',
  successDim:'rgba(34,197,94,0.12)',
  indigo:    'rgba(99,102,241,0.7)',
  indigoDim: 'rgba(99,102,241,0.14)',
  amber:     'rgba(234,179,8,0.7)',
  amberDim:  'rgba(234,179,8,0.12)',
  teal:      'rgba(6,182,212,0.7)',
  tealDim:   'rgba(6,182,212,0.12)',
  rose:      'rgba(244,114,182,0.7)',
  roseDim:   'rgba(244,114,182,0.12)',
  body:      'rgba(226,232,240,0.92)',
  muted:     'rgba(226,232,240,0.55)',
  dim:       'rgba(226,232,240,0.3)',
  ghost:     'rgba(226,232,240,0.08)',
  border:    'rgba(88,28,135,0.14)',
  borderS:   'rgba(88,28,135,0.1)',
  panel:     'rgba(15,10,30,0.55)',
  inset:     'rgba(5,5,8,0.72)',
} as const;

// ── Shared style helpers ───────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: '0.62rem',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: T.dim,
};

const inputStyle: React.CSSProperties = {
  background: T.inset,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  padding: '8px 11px',
  color: T.body,
  fontSize: '0.85rem',
  fontFamily: 'Inter, sans-serif',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical' as const,
  lineHeight: 1.75,
  minHeight: 60,
};

const panelStyle: React.CSSProperties = {
  background: T.panel,
  border: `1px solid ${T.border}`,
  borderRadius: 12,
  padding: '20px 22px',
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginBottom: 18,
};

// ── Utility helpers ───────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return `${Math.floor(diffDay / 30)}mo ago`;
}

function divergenceColor(score: number): string {
  // 0 = green (aligned), 0.5 = amber, 1 = red (deeply divergent)
  if (score <= 0.25) return T.success;
  if (score <= 0.5)  return T.amber;
  if (score <= 0.75) return T.rose;
  return T.danger;
}

function divergenceLabel(score: number): string {
  if (score <= 0.2)  return 'Highly Aligned';
  if (score <= 0.4)  return 'Mild Divergence';
  if (score <= 0.6)  return 'Moderate Gap';
  if (score <= 0.8)  return 'Significant Split';
  return 'Deep Divergence';
}

// ── Inline-editable field ─────────────────────────────────────────────────────

interface EditableFieldProps {
  value: string;
  onSave: (val: string) => void;
  multiline?: boolean;
  style?: React.CSSProperties;
  placeholder?: string;
}

function EditableField({ value, onSave, multiline = false, style, placeholder }: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    setEditing(false);
  }, [draft, value, onSave]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { setDraft(value); setEditing(false); }
  };

  if (editing) {
    const editBase: React.CSSProperties = {
      ...inputStyle,
      width: '100%',
      boxSizing: 'border-box',
      ...(multiline ? { minHeight: 72, resize: 'vertical' as const } : {}),
      ...style,
    };
    return multiline ? (
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        style={editBase}
        placeholder={placeholder}
      />
    ) : (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        style={editBase}
        placeholder={placeholder}
      />
    );
  }

  return (
    <span
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Click to edit"
      style={{
        cursor: 'text',
        borderRadius: 4,
        padding: '2px 4px',
        margin: '-2px -4px',
        transition: 'background 150ms',
        display: 'inline-block',
        ...style,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = T.ghost;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      {value || <span style={{ color: T.dim, fontStyle: 'italic' }}>{placeholder ?? 'Click to edit'}</span>}
    </span>
  );
}

// ── Section 1: Current Read ───────────────────────────────────────────────────

interface CurrentReadSectionProps {
  read: MirrorforgeModel['currentRead'];
  onUpdate: (partial: Partial<MirrorforgeModel['currentRead']>) => void;
}

function CurrentReadSection({ read, onUpdate }: CurrentReadSectionProps) {
  const confidencePct = Math.round(read.confidence * 100);
  const [newEvidence, setNewEvidence] = useState('');

  const addEvidence = () => {
    const trimmed = newEvidence.trim();
    if (!trimmed) return;
    onUpdate({ evidence: [...read.evidence, trimmed] });
    setNewEvidence('');
  };

  const removeEvidence = (idx: number) => {
    onUpdate({ evidence: read.evidence.filter((_, i) => i !== idx) });
  };

  return (
    <section style={{ animation: 'atlas-fade-in 300ms ease both' }}>
      {/* Header */}
      <div style={sectionHeaderStyle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.violet} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
        </svg>
        <span style={{ ...labelStyle, color: T.violet, fontSize: '0.7rem' }}>Current Read</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...labelStyle, color: T.dim }}>Confidence</span>
          {/* Circular confidence indicator */}
          <svg width="38" height="38" viewBox="0 0 38 38">
            <circle cx="19" cy="19" r="15" fill="none" stroke={T.border} strokeWidth="3" />
            <circle
              cx="19" cy="19" r="15"
              fill="none"
              stroke={confidencePct >= 70 ? T.success : confidencePct >= 40 ? T.amber : T.danger}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 15}`}
              strokeDashoffset={`${2 * Math.PI * 15 * (1 - read.confidence)}`}
              transform="rotate(-90 19 19)"
              style={{ transition: 'stroke-dashoffset 400ms ease' }}
            />
            <text x="19" y="23" textAnchor="middle" fontSize="9" fill={T.muted} fontFamily="Inter,sans-serif" fontWeight="600">
              {confidencePct}%
            </text>
          </svg>
        </div>
      </div>

      {/* Dominant Insight — headline */}
      <div style={{
        ...panelStyle,
        background: 'rgba(167,139,250,0.06)',
        border: `1px solid rgba(167,139,250,0.18)`,
        marginBottom: 14,
        padding: '22px 24px',
      }}>
        <div style={{ ...labelStyle, color: T.violet, marginBottom: 8 }}>Dominant Insight</div>
        <div style={{ fontSize: '1.2rem', fontWeight: 600, color: T.body, lineHeight: 1.45 }}>
          <EditableField
            value={read.dominantInsight}
            onSave={(v) => onUpdate({ dominantInsight: v })}
            multiline
            style={{ fontSize: '1.2rem', fontWeight: 600, color: T.body, lineHeight: 1.45 }}
            placeholder="What is Atlas's core read of your current state?"
          />
        </div>
      </div>

      {/* Surface + Deeper driver row */}
      <div className="mf-row-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div style={{ ...panelStyle, padding: '16px 18px' }}>
          <div style={{ ...labelStyle, color: T.teal, marginBottom: 8 }}>Surface Driver</div>
          <div style={{ color: T.body, fontSize: '0.9rem', lineHeight: 1.55 }}>
            <EditableField
              value={read.surfaceDriver}
              onSave={(v) => onUpdate({ surfaceDriver: v })}
              multiline
              style={{ fontSize: '0.9rem', color: T.body }}
              placeholder="What is driving you on the surface?"
            />
          </div>
        </div>
        <div style={{ ...panelStyle, padding: '16px 18px' }}>
          <div style={{ ...labelStyle, color: T.indigo, marginBottom: 8 }}>Deeper Driver</div>
          <div style={{ color: T.body, fontSize: '0.9rem', lineHeight: 1.55 }}>
            <EditableField
              value={read.deeperDriver}
              onSave={(v) => onUpdate({ deeperDriver: v })}
              multiline
              style={{ fontSize: '0.9rem', color: T.body }}
              placeholder="What is the underlying motivation?"
            />
          </div>
        </div>
      </div>

      {/* Hidden Tension */}
      <div style={{
        ...panelStyle,
        background: T.dangerDim,
        border: `1px solid ${T.dangerBorder}`,
        marginBottom: 14,
        padding: '14px 18px',
      }}>
        <div style={{ ...labelStyle, color: T.danger, marginBottom: 7 }}>Hidden Tension</div>
        <div style={{ color: T.body, fontSize: '0.875rem', lineHeight: 1.55 }}>
          <EditableField
            value={read.hiddenTension}
            onSave={(v) => onUpdate({ hiddenTension: v })}
            multiline
            style={{ fontSize: '0.875rem', color: T.body }}
            placeholder="What unacknowledged tension is present?"
          />
        </div>
      </div>

      {/* Evidence badges */}
      <div style={{ ...panelStyle, padding: '14px 18px' }}>
        <div style={{ ...labelStyle, color: T.dim, marginBottom: 10 }}>Evidence</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {read.evidence.length === 0 && (
            <span style={{ color: T.dim, fontSize: '0.8rem', fontStyle: 'italic' }}>No evidence logged yet</span>
          )}
          {read.evidence.map((ev, i) => (
            <span
              key={i}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: T.inset,
                border: `1px solid ${T.border}`,
                borderRadius: 20,
                padding: '3px 10px 3px 10px',
                fontSize: '0.77rem',
                color: T.muted,
                cursor: 'default',
              }}
            >
              {ev}
              <button
                onClick={() => removeEvidence(i)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: T.dim,
                  padding: 0,
                  lineHeight: 1,
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Remove"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Add evidence observation..."
            value={newEvidence}
            onChange={(e) => setNewEvidence(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEvidence(); } }}
          />
          <button
            onClick={addEvidence}
            style={{
              background: T.indigoDim,
              border: `1px solid ${T.indigo}`,
              borderRadius: 6,
              color: T.indigo,
              padding: '8px 14px',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            Add
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Section 2: Active Modes ───────────────────────────────────────────────────

type ActiveMode = MirrorforgeModel['activeModes'][0];

interface ActiveModesSectionProps {
  modes: ActiveMode[];
  onUpdate: (partial: Partial<MirrorforgeModel>) => void;
}

function AddModeForm({ onAdd }: { onAdd: (mode: Omit<ActiveMode, 'id'>) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [confidence, setConfidence] = useState(0.7);

  const submit = () => {
    if (!label.trim()) return;
    onAdd({
      label: label.trim(),
      description: description.trim(),
      confidence,
      isCurrent: false,
    });
    setLabel(''); setDescription(''); setConfidence(0.7); setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: T.ghost,
          border: `1px dashed ${T.border}`,
          borderRadius: 10,
          padding: '14px 18px',
          color: T.muted,
          cursor: 'pointer',
          fontSize: '0.82rem',
          fontFamily: 'Inter, sans-serif',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          minWidth: 160,
          flexShrink: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add Mode
      </button>
    );
  }

  return (
    <div style={{
      ...panelStyle,
      minWidth: 240,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      <div style={{ ...labelStyle, color: T.dim }}>New Mode</div>
      <input
        autoFocus
        style={inputStyle}
        placeholder="Label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false); }}
      />
      <textarea
        style={{ ...textareaStyle, minHeight: 48 }}
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div>
        <div style={{ ...labelStyle, marginBottom: 4 }}>Confidence: {Math.round(confidence * 100)}%</div>
        <input
          type="range" min={0} max={1} step={0.01}
          value={confidence}
          onChange={(e) => setConfidence(parseFloat(e.target.value))}
          style={{ width: '100%', accentColor: T.violet }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={submit}
          style={{
            flex: 1,
            background: T.violetDim,
            border: `1px solid ${T.violet}`,
            borderRadius: 6,
            color: T.violet,
            padding: '7px 0',
            cursor: 'pointer',
            fontSize: '0.82rem',
            fontWeight: 600,
            fontFamily: 'Inter, sans-serif',
          }}
        >Add</button>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: 'transparent',
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            color: T.dim,
            padding: '7px 12px',
            cursor: 'pointer',
            fontSize: '0.82rem',
            fontFamily: 'Inter, sans-serif',
          }}
        >Cancel</button>
      </div>
    </div>
  );
}

function ActiveModesSection({ modes, onUpdate }: ActiveModesSectionProps) {
  const setCurrentMode = (id: string) => {
    onUpdate({
      activeModes: modes.map((m) => ({ ...m, isCurrent: m.id === id })),
    });
  };

  const removeMode = (id: string) => {
    onUpdate({ activeModes: modes.filter((m) => m.id !== id) });
  };

  const addMode = (mode: Omit<ActiveMode, 'id'>) => {
    onUpdate({ activeModes: [...modes, { ...mode, id: generateId() }] });
  };

  return (
    <section style={{ animation: 'atlas-fade-in 300ms ease both' }}>
      <div style={sectionHeaderStyle}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.gold} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <span style={{ ...labelStyle, color: T.gold, fontSize: '0.7rem' }}>Active Modes</span>
        <span style={{
          marginLeft: 8,
          background: T.goldDim,
          border: `1px solid ${T.goldBorder}`,
          borderRadius: 20,
          padding: '1px 9px',
          fontSize: '0.7rem',
          color: T.gold,
          fontWeight: 600,
        }}>{modes.length}</span>
      </div>

      {/* Horizontal scroll row */}
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6 }}>
        {modes.length === 0 && (
          <div style={{ color: T.dim, fontSize: '0.85rem', padding: '12px 4px', fontStyle: 'italic' }}>
            No active modes detected
          </div>
        )}
        {modes.map((mode) => (
          <div
            key={mode.id}
            style={{
              position: 'relative',
              background: mode.isCurrent ? 'rgba(201,162,39,0.07)' : T.panel,
              border: `1px solid ${mode.isCurrent ? T.goldBorder : T.border}`,
              borderRadius: 10,
              padding: '14px 16px 18px',
              minWidth: 200,
              maxWidth: 240,
              flexShrink: 0,
              cursor: 'pointer',
              transition: 'border-color 200ms',
              boxShadow: mode.isCurrent ? `0 0 0 1px ${T.goldBorder}` : 'none',
              overflow: 'hidden',
            }}
            onClick={() => setCurrentMode(mode.id)}
          >
            {mode.isCurrent && (
              <div style={{
                position: 'absolute',
                top: 8, right: 8,
                background: T.goldDim,
                border: `1px solid ${T.goldBorder}`,
                borderRadius: 10,
                padding: '1px 7px',
                fontSize: '0.6rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: T.gold,
              }}>CURRENT</div>
            )}
            <div style={{ fontWeight: 600, color: mode.isCurrent ? T.gold : T.body, fontSize: '0.9rem', marginBottom: 6, paddingRight: mode.isCurrent ? 60 : 0 }}>
              {mode.label}
            </div>
            <div style={{ color: T.muted, fontSize: '0.78rem', lineHeight: 1.5, marginBottom: 12 }}>
              {mode.description || <span style={{ fontStyle: 'italic', color: T.dim }}>No description</span>}
            </div>

            {/* Confidence bar at bottom */}
            <div style={{ position: 'absolute', left: 0, bottom: 0, right: 0, height: 3, background: T.inset }}>
              <div style={{
                height: '100%',
                width: `${Math.round(mode.confidence * 100)}%`,
                background: mode.isCurrent ? T.gold : T.violet,
                borderRadius: '0 2px 2px 0',
                transition: 'width 400ms ease',
              }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ ...labelStyle, color: T.dim }}>
                {Math.round(mode.confidence * 100)}% confidence
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); removeMode(mode.id); }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: T.dim,
                  padding: 2,
                  lineHeight: 1,
                  fontSize: '1rem',
                }}
                title="Remove mode"
              >
                ×
              </button>
            </div>
          </div>
        ))}
        <AddModeForm onAdd={addMode} />
      </div>
    </section>
  );
}

// ── Section 3: Pattern Ledger ─────────────────────────────────────────────────

type PatternEntry = MirrorforgeModel['patternLedger'][0];

interface PatternLedgerSectionProps {
  patterns: PatternEntry[];
  onAdd: (p: Omit<PatternEntry, 'id'>) => void;
  onRemove: (id: string) => void;
}

function TrendIcon({ trend }: { trend: PatternEntry['trend'] }) {
  if (trend === 'improving') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    );
  }
  if (trend === 'declining') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.danger} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    );
  }
  // stable
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function trendColor(trend: PatternEntry['trend']): string {
  if (trend === 'improving') return T.success;
  if (trend === 'declining') return T.danger;
  return T.muted;
}

function PatternLedgerSection({ patterns, onAdd, onRemove }: PatternLedgerSectionProps) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [trend, setTrend] = useState<PatternEntry['trend']>('stable');

  const sorted = [...patterns].sort((a, b) => b.recurrence - a.recurrence);

  const submit = () => {
    if (!title.trim()) return;
    onAdd({
      title: title.trim(),
      description: desc.trim(),
      recurrence: 1,
      lastSeen: nowISO(),
      trend,
    });
    setTitle(''); setDesc(''); setTrend('stable');
  };

  return (
    <section style={{ animation: 'atlas-fade-in 300ms ease both' }}>
      <div style={sectionHeaderStyle}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.amber} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        <span style={{ ...labelStyle, color: T.amber, fontSize: '0.7rem' }}>Pattern Ledger</span>
        <span style={{
          marginLeft: 8,
          background: T.amberDim,
          border: `1px solid ${T.amber}`,
          borderRadius: 20,
          padding: '1px 9px',
          fontSize: '0.7rem',
          color: T.amber,
          fontWeight: 600,
        }}>{patterns.length}</span>
      </div>

      {/* Pattern list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {sorted.length === 0 && (
          <div style={{
            ...panelStyle,
            color: T.dim,
            fontSize: '0.85rem',
            fontStyle: 'italic',
            textAlign: 'center',
            padding: '22px',
          }}>
            No patterns tracked yet
          </div>
        )}
        {sorted.map((p) => (
          <div
            key={p.id}
            style={{
              ...panelStyle,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
              padding: '14px 16px',
            }}
          >
            {/* Recurrence badge */}
            <div style={{
              flexShrink: 0,
              width: 38,
              height: 38,
              borderRadius: 8,
              background: T.amberDim,
              border: `1px solid ${T.amber}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '1rem',
              color: T.amber,
            }}>
              {p.recurrence}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: T.body, fontSize: '0.9rem' }}>{p.title}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: trendColor(p.trend) }}>
                  <TrendIcon trend={p.trend} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>
                    {p.trend.charAt(0).toUpperCase() + p.trend.slice(1)}
                  </span>
                </span>
              </div>
              {p.description && (
                <div style={{ color: T.muted, fontSize: '0.8rem', lineHeight: 1.5, marginBottom: 5 }}>
                  {p.description}
                </div>
              )}
              <div style={{ display: 'flex', gap: 12 }}>
                <span style={{ ...labelStyle, color: T.dim }}>
                  Last seen: <span style={{ color: T.muted, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                    {relativeTime(p.lastSeen)}
                  </span>
                </span>
              </div>
            </div>

            {/* Delete */}
            <button
              onClick={() => onRemove(p.id)}
              style={{
                flexShrink: 0,
                background: 'transparent',
                border: `1px solid rgba(239,68,68,0.18)`,
                borderRadius: 5,
                color: T.danger,
                cursor: 'pointer',
                padding: '5px 8px',
                fontSize: '0.75rem',
                fontFamily: 'Inter, sans-serif',
                opacity: 0.7,
                transition: 'opacity 150ms',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.7'; }}
              title="Delete pattern"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {/* Add pattern form */}
      <div style={{ ...panelStyle, padding: '16px 18px' }}>
        <div style={{ ...labelStyle, color: T.dim, marginBottom: 12 }}>Log New Pattern</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            style={inputStyle}
            placeholder="Pattern title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          <textarea
            style={{ ...textareaStyle, minHeight: 52 }}
            placeholder="Description (optional)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ ...labelStyle, color: T.dim, flexShrink: 0 }}>Trend:</div>
            {(['improving', 'stable', 'declining'] as PatternEntry['trend'][]).map((t) => (
              <button
                key={t}
                onClick={() => setTrend(t)}
                style={{
                  background: trend === t
                    ? (t === 'improving' ? T.successDim : t === 'declining' ? T.dangerDim : T.inset)
                    : 'transparent',
                  border: `1px solid ${trend === t
                    ? (t === 'improving' ? T.success : t === 'declining' ? T.danger : T.muted)
                    : T.border}`,
                  borderRadius: 5,
                  color: trend === t
                    ? (t === 'improving' ? T.success : t === 'declining' ? T.danger : T.muted)
                    : T.dim,
                  padding: '5px 10px',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontFamily: 'Inter, sans-serif',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  transition: 'all 150ms',
                }}
              >
                <TrendIcon trend={t} />
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
            <button
              onClick={submit}
              style={{
                marginLeft: 'auto',
                background: T.amberDim,
                border: `1px solid ${T.amber}`,
                borderRadius: 6,
                color: T.amber,
                padding: '7px 18px',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: 600,
                fontFamily: 'Inter, sans-serif',
              }}
            >
              Log Pattern
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Section 4: Decision Divergence ────────────────────────────────────────────

type DivergenceData = MirrorforgeModel['decisionDivergence'];
type PathData = DivergenceData['mostLikely'] | DivergenceData['highestOrder'];

interface PathCardProps {
  title: string;
  accentColor: string;
  accentDim: string;
  data: PathData;
  onUpdate: (partial: Partial<PathData>) => void;
}

function PathCard({ title, accentColor, accentDim, data, onUpdate }: PathCardProps) {
  return (
    <div style={{
      flex: 1,
      background: T.panel,
      border: `1px solid ${accentColor}22`,
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      {/* Header stripe */}
      <div style={{
        background: accentDim,
        borderBottom: `1px solid ${accentColor}22`,
        padding: '10px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: accentColor }} />
        <span style={{ ...labelStyle, color: accentColor, fontSize: '0.68rem' }}>{title}</span>
      </div>

      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Action */}
        <div>
          <div style={{ ...labelStyle, color: T.dim, marginBottom: 5 }}>Action</div>
          <div style={{ fontWeight: 600, color: T.body, fontSize: '0.92rem', lineHeight: 1.45 }}>
            <EditableField
              value={data.action}
              onSave={(v) => onUpdate({ action: v })}
              multiline
              style={{ fontWeight: 600, fontSize: '0.92rem', color: T.body }}
              placeholder="What would you do?"
            />
          </div>
        </div>

        {/* Reasoning */}
        <div>
          <div style={{ ...labelStyle, color: T.dim, marginBottom: 5 }}>Reasoning</div>
          <div style={{ color: T.muted, fontSize: '0.83rem', lineHeight: 1.6 }}>
            <EditableField
              value={data.reasoning}
              onSave={(v) => onUpdate({ reasoning: v })}
              multiline
              style={{ fontSize: '0.83rem', color: T.muted }}
              placeholder="Why this path?"
            />
          </div>
        </div>

        {/* Risk */}
        <div style={{
          background: T.dangerDim,
          border: `1px solid ${T.dangerBorder}`,
          borderRadius: 7,
          padding: '10px 13px',
        }}>
          <div style={{ ...labelStyle, color: T.danger, marginBottom: 4 }}>Risk</div>
          <div style={{ color: T.body, fontSize: '0.82rem', lineHeight: 1.5 }}>
            <EditableField
              value={data.risk}
              onSave={(v) => onUpdate({ risk: v })}
              multiline
              style={{ fontSize: '0.82rem', color: T.body }}
              placeholder="What could go wrong?"
            />
          </div>
        </div>

        {/* Outcome */}
        <div>
          <div style={{ ...labelStyle, color: T.dim, marginBottom: 5 }}>Projected Outcome</div>
          <div style={{ color: T.muted, fontSize: '0.83rem', lineHeight: 1.6 }}>
            <EditableField
              value={data.outcome}
              onSave={(v) => onUpdate({ outcome: v })}
              multiline
              style={{ fontSize: '0.83rem', color: T.muted }}
              placeholder="What happens next?"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface DecisionDivergenceSectionProps {
  divergence: DivergenceData;
  onUpdate: (partial: Partial<MirrorforgeModel>) => void;
}

function DecisionDivergenceSection({ divergence, onUpdate }: DecisionDivergenceSectionProps) {
  const score = divergence.divergenceScore;
  const scoreColor = divergenceColor(score);
  const scoreLabel = divergenceLabel(score);
  const scorePercent = Math.round(score * 100);

  const updateMostLikely = (partial: Partial<PathData>) => {
    onUpdate({ decisionDivergence: { ...divergence, mostLikely: { ...divergence.mostLikely, ...partial } } });
  };
  const updateHighestOrder = (partial: Partial<PathData>) => {
    onUpdate({ decisionDivergence: { ...divergence, highestOrder: { ...divergence.highestOrder, ...partial } } });
  };
  const updateScore = (val: number) => {
    onUpdate({ decisionDivergence: { ...divergence, divergenceScore: Math.max(0, Math.min(1, val)) } });
  };

  return (
    <section style={{ animation: 'atlas-fade-in 300ms ease both' }}>
      <div style={sectionHeaderStyle}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.rose} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <path d="M4.93 4.93l2.83 2.83" />
          <path d="M16.24 16.24l2.83 2.83" />
          <path d="M2 12h4" />
          <path d="M18 12h4" />
          <path d="M4.93 19.07l2.83-2.83" />
          <path d="M16.24 7.76l2.83-2.83" />
        </svg>
        <span style={{ ...labelStyle, color: T.rose, fontSize: '0.7rem' }}>Decision Divergence</span>
      </div>

      {/* Divergence Score — prominent centre piece */}
      <div style={{
        ...panelStyle,
        marginBottom: 16,
        padding: '22px 26px',
        background: `linear-gradient(135deg, rgba(15,10,30,0.7) 0%, ${scoreColor}09 100%)`,
        border: `1px solid ${scoreColor}2a`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          {/* Big score display */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '3.4rem',
              fontWeight: 800,
              color: scoreColor,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
              textShadow: `0 0 40px ${scoreColor}50`,
            }}>
              {scorePercent}
              <span style={{ fontSize: '1.6rem', fontWeight: 600, color: `${scoreColor}80` }}>%</span>
            </div>
            <div style={{ ...labelStyle, color: scoreColor, marginTop: 5, fontSize: '0.68rem' }}>
              Divergence Score
            </div>
          </div>

          {/* Bar + label */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: scoreColor }}>{scoreLabel}</span>
              <span style={{ ...labelStyle, color: T.dim }}>
                {score <= 0.3 ? 'Instinct ≈ Optimal' : score <= 0.6 ? 'Moderate gap to bridge' : 'Significant realignment needed'}
              </span>
            </div>
            {/* Visual divergence bar */}
            <div style={{ height: 10, background: T.inset, borderRadius: 5, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{
                height: '100%',
                width: `${scorePercent}%`,
                background: `linear-gradient(90deg, ${T.success} 0%, ${T.amber} 50%, ${T.danger} 100%)`,
                backgroundSize: '200px 100%',
                backgroundPosition: `${scorePercent * -1}% 0`,
                borderRadius: 5,
                transition: 'width 400ms ease',
              }} />
            </div>
            {/* Score slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ ...labelStyle, color: T.dim, flexShrink: 0 }}>Adjust:</span>
              <input
                type="range"
                min={0} max={1} step={0.01}
                value={score}
                onChange={(e) => updateScore(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: scoreColor }}
              />
            </div>
          </div>

          {/* Axis labels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.teal }} />
              <span style={{ fontSize: '0.8rem', color: T.teal, fontWeight: 500 }}>Most Likely Path</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.violet }} />
              <span style={{ fontSize: '0.8rem', color: T.violet, fontWeight: 500 }}>Highest Order Path</span>
            </div>
          </div>
        </div>
      </div>

      {/* Side-by-side path comparison */}
      <div className="mf-path-row" style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
        <PathCard
          title="Most Likely Path"
          accentColor={T.teal}
          accentDim={T.tealDim}
          data={divergence.mostLikely}
          onUpdate={updateMostLikely}
        />

        {/* Center divider with arrow */}
        <div className="mf-path-divider" style={{
          flexShrink: 0,
          width: 32,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          paddingTop: 40,
        }}>
          <div style={{ width: 1, flex: 1, background: `linear-gradient(to bottom, transparent, ${scoreColor}40, transparent)` }} />
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={scoreColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
          <div style={{ width: 1, flex: 1, background: `linear-gradient(to bottom, transparent, ${scoreColor}40, transparent)` }} />
        </div>

        <PathCard
          title="Highest Order Path"
          accentColor={T.violet}
          accentDim={T.violetDim}
          data={divergence.highestOrder}
          onUpdate={updateHighestOrder}
        />
      </div>
    </section>
  );
}

// ── Root Component ─────────────────────────────────────────────────────────────

export default function MirrorForgeChamber() {
  const mirrorforge = useAtlasStore((s) => s.mirrorforge);
  const updateMirrorforge = useAtlasStore((s) => s.updateMirrorforge);
  const addMirrorforgePattern = useAtlasStore((s) => s.addMirrorforgePattern);
  const removeMirrorforgePattern = useAtlasStore((s) => s.removeMirrorforgePattern);
  const updateMirrorforgeCurrentRead = useAtlasStore((s) => s.updateMirrorforgeCurrentRead);

  const handleUpdateRead = useCallback(
    (partial: Partial<MirrorforgeModel['currentRead']>) => {
      updateMirrorforgeCurrentRead(partial);
    },
    [updateMirrorforgeCurrentRead]
  );

  return (
    <div
      className="mf-chamber"
      style={{
        minHeight: '100%',
        padding: '28px 28px 60px',
        fontFamily: 'Inter, sans-serif',
        color: 'rgba(226,232,240,0.92)',
        maxWidth: 1060,
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      {/*
        Mobile overrides. We keep the desktop layout intact and only tighten
        padding, collapse 2-col grids to 1-col, and wrap the Most Likely /
        Highest Order row when the viewport is narrow. Using a media query
        avoids threading isMobile into five nested subcomponents.
      */}
      <style>{`
        @media (max-width: 640px) {
          .mf-chamber { padding: 16px 14px 56px !important; }
          .mf-chamber .mf-section { padding: 16px 14px !important; }
          .mf-chamber .mf-row-2col { grid-template-columns: 1fr !important; }
          .mf-chamber .mf-path-row { flex-direction: column !important; gap: 12px !important; }
          .mf-chamber .mf-path-row .mf-path-divider { display: none !important; }
          .mf-chamber .mf-header { gap: 12px !important; margin-bottom: 20px !important; }
          .mf-chamber .mf-header h1 { font-size: 1.2rem !important; }
          .mf-chamber .mf-header p { font-size: 0.78rem !important; }
        }
      `}</style>
      {/* Chamber header */}
      <div className="mf-header" style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 16,
        marginBottom: 32,
        animation: 'atlas-fade-in 300ms ease both',
      }}>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: 'rgba(167,139,250,0.1)',
          border: '1px solid rgba(167,139,250,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.violet} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </div>
        <div>
          <h1 style={{
            margin: 0,
            fontSize: '1.45rem',
            fontWeight: 700,
            color: T.body,
            letterSpacing: '-0.015em',
          }}>
            MirrorForge
          </h1>
          <p style={{
            margin: '4px 0 0',
            fontSize: '0.85rem',
            color: T.muted,
            lineHeight: 1.5,
          }}>
            Advanced self-modeling · behavioral pattern tracking · decision divergence analysis
          </p>
        </div>
      </div>

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* Section 1: Current Read */}
        <div className="mf-section" style={{ ...panelStyle, padding: '22px 24px' }}>
          <CurrentReadSection
            read={mirrorforge.currentRead}
            onUpdate={handleUpdateRead}
          />
        </div>

        {/* Section 2: Active Modes */}
        <div className="mf-section" style={{ ...panelStyle, padding: '22px 24px' }}>
          <ActiveModesSection
            modes={mirrorforge.activeModes}
            onUpdate={updateMirrorforge}
          />
        </div>

        {/* Section 3: Pattern Ledger */}
        <div className="mf-section" style={{ ...panelStyle, padding: '22px 24px' }}>
          <PatternLedgerSection
            patterns={mirrorforge.patternLedger}
            onAdd={addMirrorforgePattern}
            onRemove={removeMirrorforgePattern}
          />
        </div>

        {/* Section 4: Decision Divergence */}
        <div className="mf-section" style={{ ...panelStyle, padding: '22px 24px' }}>
          <DecisionDivergenceSection
            divergence={mirrorforge.decisionDivergence}
            onUpdate={updateMirrorforge}
          />
        </div>
      </div>
    </div>
  );
}
