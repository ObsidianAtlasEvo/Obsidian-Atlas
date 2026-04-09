import React, { useState, useCallback } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { generateId, nowISO } from '../lib/persistence';
import type { Decision } from '@/types';

// ── Shared style tokens ────────────────────────────────────────────────────

const T = {
  body:    'rgba(226,232,240,0.92)',
  muted:   'rgba(226,232,240,0.55)',
  dim:     'rgba(226,232,240,0.3)',
  dimmer:  'rgba(226,232,240,0.18)',
  gold:    'rgba(201,162,39,0.9)',
  goldDim: 'rgba(201,162,39,0.55)',
  violet:  'rgba(167,139,250,0.85)',
  violetDim: 'rgba(167,139,250,0.45)',
  danger:  'rgba(239,68,68,0.75)',
  green:   'rgba(34,197,94,0.75)',
  border:  'rgba(88,28,135,0.14)',
  borderSubtle: 'rgba(88,28,135,0.1)',
  borderActive: 'rgba(88,28,135,0.4)',
  surface: 'rgba(15,10,30,0.55)',
  inset:   'rgba(5,5,8,0.72)',
  panel:   'rgba(88,28,135,0.12)',
  panelHover: 'rgba(88,28,135,0.2)',
} as const;

const labelStyle: React.CSSProperties = {
  fontSize: '0.62rem',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: T.dim,
};

const inputBase: React.CSSProperties = {
  width: '100%',
  background: T.inset,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  padding: '8px 10px',
  color: T.body,
  fontSize: '0.83rem',
  fontFamily: 'Inter, sans-serif',
  outline: 'none',
  boxSizing: 'border-box',
};

const textareaBase: React.CSSProperties = {
  ...inputBase,
  resize: 'vertical' as const,
  minHeight: 72,
  lineHeight: 1.7,
};

function SmallBtn({
  onClick,
  children,
  danger,
  active,
  style,
  title,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  active?: boolean;
  style?: React.CSSProperties;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: active ? T.panel : danger ? 'rgba(239,68,68,0.08)' : 'transparent',
        border: `1px solid ${active ? T.borderActive : danger ? 'rgba(239,68,68,0.25)' : T.border}`,
        borderRadius: 5,
        padding: '4px 10px',
        color: active ? T.violet : danger ? T.danger : T.dim,
        cursor: 'pointer',
        fontSize: '0.65rem',
        fontWeight: 600,
        letterSpacing: '0.08em',
        fontFamily: 'Inter, sans-serif',
        transition: 'all 120ms ease',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Decision['status'] }) {
  const map: Record<Decision['status'], { label: string; color: string; bg: string }> = {
    pending:     { label: 'Pending',    color: T.gold,   bg: 'rgba(201,162,39,0.1)' },
    resolved:    { label: 'Resolved',   color: T.green,  bg: 'rgba(34,197,94,0.1)'  },
    'post-mortem': { label: 'Post-Mortem', color: T.violet, bg: 'rgba(167,139,250,0.1)' },
  };
  const s = map[status];
  return (
    <span
      style={{
        fontSize: '0.58rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: s.color,
        background: s.bg,
        border: `1px solid ${s.color.replace('0.', '0.2').replace('0.9', '0.25')}`,
        borderRadius: 4,
        padding: '2px 7px',
        flexShrink: 0,
      }}
    >
      {s.label}
    </span>
  );
}

// ── Tag input ──────────────────────────────────────────────────────────────

function TagInput({
  label,
  tags,
  onChange,
  placeholder,
  tagColor,
  suggestions,
}: {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  tagColor?: string;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState('');
  const color = tagColor ?? T.violetDim;

  function commit(val: string) {
    const v = val.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setDraft('');
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(draft); }
    if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  const filtered = suggestions?.filter(
    (s) => s.toLowerCase().includes(draft.toLowerCase()) && !tags.includes(s)
  ).slice(0, 6) ?? [];

  return (
    <div>
      <div style={{ ...labelStyle, marginBottom: 6 }}>{label}</div>
      <div
        style={{
          background: T.inset,
          border: `1px solid ${T.border}`,
          borderRadius: 6,
          padding: '6px 8px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 5,
          alignItems: 'center',
          minHeight: 36,
          position: 'relative',
        }}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            style={{
              background: 'rgba(88,28,135,0.18)',
              border: `1px solid ${T.borderActive}`,
              borderRadius: 4,
              padding: '2px 6px',
              fontSize: '0.72rem',
              color,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {tag}
            <button
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: T.dim,
                fontSize: '0.75rem',
                lineHeight: 1,
                padding: 0,
                fontFamily: 'inherit',
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => { if (draft.trim()) commit(draft); }}
          placeholder={tags.length === 0 ? placeholder : ''}
          style={{
            flex: 1,
            minWidth: 80,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: T.body,
            fontSize: '0.8rem',
            fontFamily: 'Inter, sans-serif',
          }}
        />
      </div>
      {filtered.length > 0 && draft.length > 0 && (
        <div
          style={{
            marginTop: 4,
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          {filtered.map((s) => (
            <button
              key={s}
              onMouseDown={(e) => { e.preventDefault(); commit(s); }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                padding: '6px 10px',
                color: T.muted,
                fontSize: '0.78rem',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Reversibility / Uncertainty bars ──────────────────────────────────────

function MetricBar({
  label,
  value,
  colorHigh,
  colorLow,
}: {
  label: string;
  value: number;
  colorHigh: string;
  colorLow: string;
}) {
  const pct = Math.round(value * 100);
  const color = value > 0.5 ? colorHigh : colorLow;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ ...labelStyle, color: T.dimmer }}>{label}</span>
        <span style={{ fontSize: '0.62rem', color: T.dim, fontVariantNumeric: 'tabular-nums' }}>
          {pct}%
        </span>
      </div>
      <div
        style={{
          height: 3,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: color,
            borderRadius: 2,
            transition: 'width 300ms ease',
          }}
        />
      </div>
    </div>
  );
}

// ── Option card (detail view) ──────────────────────────────────────────────

function OptionCard({ opt }: { opt: Decision['options'][number] }) {
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        animation: 'atlas-fade-in 300ms ease both',
      }}
    >
      <div
        style={{
          fontSize: '0.88rem',
          fontWeight: 600,
          color: T.body,
          letterSpacing: '-0.01em',
        }}
      >
        {opt.label || 'Unnamed Option'}
      </div>

      {/* Metrics */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <MetricBar
          label="Reversibility"
          value={opt.reversibility}
          colorHigh="rgba(34,197,94,0.75)"
          colorLow="rgba(239,68,68,0.65)"
        />
        <MetricBar
          label="Uncertainty"
          value={opt.uncertainty}
          colorHigh="rgba(239,68,68,0.65)"
          colorLow="rgba(34,197,94,0.65)"
        />
      </div>

      {opt.tradeoffs.length > 0 && (
        <div>
          <div style={{ ...labelStyle, marginBottom: 6 }}>Tradeoffs</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {opt.tradeoffs.map((t, i) => (
              <span
                key={i}
                style={{
                  fontSize: '0.7rem',
                  padding: '2px 8px',
                  background: 'rgba(239,68,68,0.07)',
                  border: '1px solid rgba(239,68,68,0.18)',
                  borderRadius: 4,
                  color: 'rgba(239,68,68,0.7)',
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {opt.consequences.length > 0 && (
        <div>
          <div style={{ ...labelStyle, marginBottom: 6 }}>2nd-Order Consequences</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {opt.consequences.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                <span style={{ color: T.goldDim, flexShrink: 0, marginTop: 1, fontSize: '0.7rem' }}>→</span>
                <span style={{ fontSize: '0.77rem', color: T.muted, lineHeight: 1.5 }}>{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Option builder row (in form) ───────────────────────────────────────────

function OptionBuilder({
  opt,
  onChange,
  onRemove,
  index,
}: {
  opt: Decision['options'][number];
  onChange: (updated: Decision['options'][number]) => void;
  onRemove: () => void;
  index: number;
}) {
  return (
    <div
      style={{
        background: T.inset,
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        padding: '12px 14px',
        marginBottom: 10,
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <span style={{ ...labelStyle, color: T.violetDim }}>Option {index + 1}</span>
        <SmallBtn onClick={onRemove} danger title="Remove option">✕ Remove</SmallBtn>
      </div>

      {/* Label */}
      <div style={{ marginBottom: 10 }}>
        <input
          style={inputBase}
          placeholder="Option label"
          value={opt.label}
          onChange={(e) => onChange({ ...opt, label: e.target.value })}
        />
      </div>

      {/* Tradeoffs */}
      <div style={{ marginBottom: 10 }}>
        <TagInput
          label="Tradeoffs"
          tags={opt.tradeoffs}
          onChange={(tradeoffs) => onChange({ ...opt, tradeoffs })}
          placeholder="Type and press Enter"
          tagColor="rgba(239,68,68,0.7)"
        />
      </div>

      {/* Consequences */}
      <div style={{ marginBottom: 12 }}>
        <TagInput
          label="2nd-Order Consequences"
          tags={opt.consequences}
          onChange={(consequences) => onChange({ ...opt, consequences })}
          placeholder="Second-order effects…"
          tagColor={T.goldDim}
        />
      </div>

      {/* Sliders */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <div style={{ ...labelStyle, marginBottom: 5 }}>
            Reversibility — {Math.round(opt.reversibility * 100)}%
          </div>
          <input
            type="range"
            min={0} max={1} step={0.01}
            value={opt.reversibility}
            onChange={(e) => onChange({ ...opt, reversibility: parseFloat(e.target.value) })}
            style={{ width: '100%', accentColor: 'rgba(34,197,94,0.8)', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <span style={{ fontSize: '0.58rem', color: 'rgba(239,68,68,0.5)' }}>Locked in</span>
            <span style={{ fontSize: '0.58rem', color: 'rgba(34,197,94,0.5)' }}>Easily undone</span>
          </div>
        </div>
        <div>
          <div style={{ ...labelStyle, marginBottom: 5 }}>
            Uncertainty — {Math.round(opt.uncertainty * 100)}%
          </div>
          <input
            type="range"
            min={0} max={1} step={0.01}
            value={opt.uncertainty}
            onChange={(e) => onChange({ ...opt, uncertainty: parseFloat(e.target.value) })}
            style={{ width: '100%', accentColor: 'rgba(239,68,68,0.7)', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <span style={{ fontSize: '0.58rem', color: 'rgba(34,197,94,0.5)' }}>Known</span>
            <span style={{ fontSize: '0.58rem', color: 'rgba(239,68,68,0.5)' }}>Highly unclear</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Empty option factory ───────────────────────────────────────────────────

function makeOption(): Decision['options'][number] {
  return {
    id: generateId(),
    label: '',
    tradeoffs: [],
    consequences: [],
    reversibility: 0.5,
    uncertainty: 0.5,
  };
}

// ── Decision list item ─────────────────────────────────────────────────────

function DecisionListItem({
  decision,
  isSelected,
  onSelect,
}: {
  decision: Decision;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const createdAt = (decision as Decision & { createdAt?: string }).createdAt;
  const dateStr = createdAt
    ? new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';

  return (
    <button
      onClick={onSelect}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: isSelected ? 'rgba(88,28,135,0.15)' : 'transparent',
        border: `1px solid ${isSelected ? T.borderActive : T.borderSubtle}`,
        borderRadius: 8,
        padding: '11px 13px',
        cursor: 'pointer',
        transition: 'all 140ms ease',
        fontFamily: 'Inter, sans-serif',
        marginBottom: 7,
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(88,28,135,0.08)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(88,28,135,0.22)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.borderColor = T.borderSubtle;
        }
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: '0.8rem',
            fontWeight: 500,
            color: 'rgba(226,232,240,0.85)',
            lineHeight: 1.3,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {decision.title || 'Untitled Decision'}
        </span>
        <StatusBadge status={decision.status} />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: '0.67rem', color: T.dimmer }}>
          {decision.options.length} option{decision.options.length !== 1 ? 's' : ''}
        </span>
        {dateStr && (
          <span style={{ fontSize: '0.62rem', color: T.dimmer }}>{dateStr}</span>
        )}
      </div>
    </button>
  );
}

// ── Decision detail view ───────────────────────────────────────────────────

function DecisionDetail({
  decision,
  onEdit,
  onDelete,
}: {
  decision: Decision;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const createdAt = (decision as Decision & { createdAt?: string }).createdAt;

  return (
    <div
      style={{ flex: 1, overflowY: 'auto', padding: '28px 36px', animation: 'atlas-fade-in 300ms ease both' }}
    >
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 24,
            gap: 16,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h2
                style={{
                  fontSize: '1.2rem',
                  fontWeight: 600,
                  letterSpacing: '-0.025em',
                  color: T.body,
                  margin: 0,
                }}
              >
                {decision.title || 'Untitled Decision'}
              </h2>
              <StatusBadge status={decision.status} />
            </div>
            {createdAt && (
              <div style={{ fontSize: '0.65rem', color: T.dimmer, letterSpacing: '0.04em' }}>
                {new Date(createdAt).toLocaleString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
            <SmallBtn onClick={onEdit} active>EDIT</SmallBtn>
            <SmallBtn onClick={onDelete} danger>DELETE</SmallBtn>
          </div>
        </div>

        {/* Context & Dossier */}
        {(decision.context || decision.dossier) && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: decision.context && decision.dossier ? '1fr 1fr' : '1fr',
              gap: 14,
              marginBottom: 22,
            }}
          >
            {decision.context && (
              <div
                style={{
                  background: T.surface,
                  border: `1px solid ${T.border}`,
                  borderRadius: 9,
                  padding: '14px 16px',
                }}
              >
                <div style={{ ...labelStyle, marginBottom: 8 }}>Context</div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.83rem',
                    color: T.muted,
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {decision.context}
                </p>
              </div>
            )}
            {decision.dossier && (
              <div
                style={{
                  background: T.surface,
                  border: `1px solid ${T.border}`,
                  borderRadius: 9,
                  padding: '14px 16px',
                }}
              >
                <div style={{ ...labelStyle, marginBottom: 8 }}>Dossier</div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.83rem',
                    color: T.muted,
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {decision.dossier}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Options grid */}
        {decision.options.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ ...labelStyle, marginBottom: 10 }}>Options</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              {decision.options.map((opt) => (
                <OptionCard key={opt.id} opt={opt} />
              ))}
            </div>
          </div>
        )}

        {/* Meta columns */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 22,
          }}
        >
          {decision.stakeholders.length > 0 && (
            <MetaSection
              label="Stakeholders"
              items={decision.stakeholders}
              color="rgba(99,102,241,0.7)"
            />
          )}
          {decision.principlesChecked.length > 0 && (
            <MetaSection
              label="Principles Checked"
              items={decision.principlesChecked}
              color={T.goldDim}
            />
          )}
          {decision.emotionalContamination.length > 0 && (
            <MetaSection
              label="Emotional Contamination"
              items={decision.emotionalContamination}
              color="rgba(239,68,68,0.6)"
            />
          )}
        </div>

        {/* Review loop */}
        {decision.reviewLoop && (
          <div
            style={{
              background: 'rgba(167,139,250,0.05)',
              border: `1px solid rgba(167,139,250,0.15)`,
              borderRadius: 9,
              padding: '14px 16px',
            }}
          >
            <div style={{ ...labelStyle, color: T.violetDim, marginBottom: 8 }}>
              Post-Decision Review Loop
            </div>
            <p
              style={{
                margin: 0,
                fontSize: '0.83rem',
                color: T.muted,
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
              }}
            >
              {decision.reviewLoop}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function MetaSection({
  label,
  items,
  color,
}: {
  label: string;
  items: string[];
  color: string;
}) {
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 9,
        padding: '12px 14px',
      }}
    >
      <div style={{ ...labelStyle, marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {items.map((item, i) => (
          <span
            key={i}
            style={{
              fontSize: '0.7rem',
              padding: '2px 8px',
              background: 'rgba(88,28,135,0.12)',
              border: `1px solid rgba(88,28,135,0.25)`,
              borderRadius: 4,
              color,
            }}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Form state types ───────────────────────────────────────────────────────

interface FormState {
  title: string;
  context: string;
  dossier: string;
  options: Decision['options'];
  stakeholders: string[];
  principlesChecked: string[];
  emotionalContamination: string[];
  status: Decision['status'];
  reviewLoop: string;
}

function makeBlankForm(): FormState {
  return {
    title: '',
    context: '',
    dossier: '',
    options: [makeOption()],
    stakeholders: [],
    principlesChecked: [],
    emotionalContamination: [],
    status: 'pending',
    reviewLoop: '',
  };
}

function decisionToForm(d: Decision): FormState {
  return {
    title: d.title,
    context: d.context,
    dossier: d.dossier,
    options: d.options.length > 0 ? d.options : [makeOption()],
    stakeholders: d.stakeholders,
    principlesChecked: d.principlesChecked,
    emotionalContamination: d.emotionalContamination,
    status: d.status,
    reviewLoop: d.reviewLoop ?? '',
  };
}

// ── Decision form ──────────────────────────────────────────────────────────

function DecisionForm({
  initial,
  doctrine,
  onSave,
  onCancel,
  mode,
}: {
  initial: FormState;
  doctrine: string[];
  onSave: (form: FormState) => void;
  onCancel: () => void;
  mode: 'create' | 'edit';
}) {
  const [form, setForm] = useState<FormState>(initial);

  const set = useCallback(<K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  }, []);

  function updateOption(id: string, updated: Decision['options'][number]) {
    setForm((prev) => ({
      ...prev,
      options: prev.options.map((o) => (o.id === id ? updated : o)),
    }));
  }

  function addOption() {
    setForm((prev) => ({ ...prev, options: [...prev.options, makeOption()] }));
  }

  function removeOption(id: string) {
    setForm((prev) => ({
      ...prev,
      options: prev.options.filter((o) => o.id !== id),
    }));
  }

  const STATUS_OPTIONS: Decision['status'][] = ['pending', 'resolved', 'post-mortem'];

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 32px',
        animation: 'atlas-fade-in 300ms ease both',
      }}
    >
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        {/* Form header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.6rem',
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: T.violetDim,
                textTransform: 'uppercase',
                marginBottom: 3,
              }}
            >
              Decision Architecture
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 600, color: T.body, letterSpacing: '-0.02em' }}>
              {mode === 'create' ? 'New Decision' : 'Edit Decision'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <SmallBtn onClick={onCancel}>Cancel</SmallBtn>
            <button
              onClick={() => onSave(form)}
              style={{
                background: 'rgba(88,28,135,0.25)',
                border: `1px solid ${T.borderActive}`,
                borderRadius: 6,
                padding: '6px 16px',
                color: T.violet,
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontWeight: 600,
                fontFamily: 'Inter, sans-serif',
                letterSpacing: '0.04em',
              }}
            >
              {mode === 'create' ? 'Create' : 'Save'}
            </button>
          </div>
        </div>

        {/* Title */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...labelStyle, marginBottom: 6 }}>Decision Title</div>
          <input
            style={{ ...inputBase, fontSize: '1rem', fontWeight: 500 }}
            placeholder="What is this decision about?"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
          />
        </div>

        {/* Context + Dossier */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div>
            <div style={{ ...labelStyle, marginBottom: 6 }}>Context</div>
            <textarea
              style={textareaBase}
              placeholder="What is the situation? What's at stake?"
              value={form.context}
              onChange={(e) => set('context', e.target.value)}
            />
          </div>
          <div>
            <div style={{ ...labelStyle, marginBottom: 6 }}>Dossier</div>
            <textarea
              style={textareaBase}
              placeholder="Relevant intelligence, data, prior art…"
              value={form.dossier}
              onChange={(e) => set('dossier', e.target.value)}
            />
          </div>
        </div>

        {/* Options builder */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <div style={labelStyle}>Options</div>
            <SmallBtn onClick={addOption} active>+ Add Option</SmallBtn>
          </div>
          {form.options.map((opt, i) => (
            <OptionBuilder
              key={opt.id}
              opt={opt}
              index={i}
              onChange={(updated) => updateOption(opt.id, updated)}
              onRemove={() => removeOption(opt.id)}
            />
          ))}
          {form.options.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '18px',
                color: T.dim,
                fontSize: '0.78rem',
                border: `1px dashed ${T.border}`,
                borderRadius: 8,
              }}
            >
              No options yet — add at least one.
            </div>
          )}
        </div>

        {/* Tag fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <TagInput
            label="Stakeholders"
            tags={form.stakeholders}
            onChange={(v) => set('stakeholders', v)}
            placeholder="Who is affected?"
            tagColor="rgba(99,102,241,0.75)"
          />
          <TagInput
            label="Principles Checked"
            tags={form.principlesChecked}
            onChange={(v) => set('principlesChecked', v)}
            placeholder="Select or type…"
            tagColor={T.goldDim}
            suggestions={doctrine}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <TagInput
            label="Emotional Contamination"
            tags={form.emotionalContamination}
            onChange={(v) => set('emotionalContamination', v)}
            placeholder="e.g. fear of loss, sunk cost, ego…"
            tagColor="rgba(239,68,68,0.7)"
          />
        </div>

        {/* Status selector */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...labelStyle, marginBottom: 8 }}>Status</div>
          <div style={{ display: 'flex', gap: 7 }}>
            {STATUS_OPTIONS.map((s) => (
              <SmallBtn
                key={s}
                onClick={() => set('status', s)}
                active={form.status === s}
              >
                {s === 'post-mortem' ? 'Post-Mortem' : s.charAt(0).toUpperCase() + s.slice(1)}
              </SmallBtn>
            ))}
          </div>
        </div>

        {/* Review loop */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ ...labelStyle, marginBottom: 6 }}>Review Loop (optional)</div>
          <textarea
            style={{ ...textareaBase, minHeight: 60 }}
            placeholder="Post-decision reflection: what actually happened, what you learned…"
            value={form.reviewLoop}
            onChange={(e) => set('reviewLoop', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main Chamber ───────────────────────────────────────────────────────────

export default function DecisionsChamber() {
  const decisions = useAtlasStore((s) => s.decisions);
  const addDecision = useAtlasStore((s) => s.addDecision);
  const updateDecision = useAtlasStore((s) => s.updateDecision);
  const removeDecision = useAtlasStore((s) => s.removeDecision);
  const doctrine = useAtlasStore((s) => s.userModel.doctrine);

  const doctrineTitles = doctrine.map((d) => d.title);

  const [selectedId, setSelectedId] = useState<string | null>(decisions[0]?.id ?? null);
  const [mode, setMode] = useState<'view' | 'create' | 'edit'>('view');
  const [formState, setFormState] = useState<FormState>(makeBlankForm());

  const selected = decisions.find((d) => d.id === selectedId) ?? null;

  function startCreate() {
    setFormState(makeBlankForm());
    setSelectedId(null);
    setMode('create');
  }

  function startEdit() {
    if (!selected) return;
    setFormState(decisionToForm(selected));
    setMode('edit');
  }

  function cancelForm() {
    setMode('view');
  }

  async function handleSave(form: FormState) {
    if (!form.title.trim()) return;

    const payload = {
      title: form.title.trim(),
      context: form.context,
      dossier: form.dossier,
      options: form.options,
      stakeholders: form.stakeholders,
      principlesChecked: form.principlesChecked,
      emotionalContamination: form.emotionalContamination,
      status: form.status,
      reviewLoop: form.reviewLoop || undefined,
    };

    if (mode === 'create') {
      const created = await addDecision(payload);
      setSelectedId(created.id);
    } else if (mode === 'edit' && selected) {
      await updateDecision(selected.id, payload);
    }
    setMode('view');
  }

  async function handleDelete() {
    if (!selected) return;
    const nextId = decisions.find((d) => d.id !== selected.id)?.id ?? null;
    await removeDecision(selected.id);
    setSelectedId(nextId);
    setMode('view');
  }

  const pending   = decisions.filter((d) => d.status === 'pending');
  const resolved  = decisions.filter((d) => d.status === 'resolved');
  const postMortem = decisions.filter((d) => d.status === 'post-mortem');
  const sorted = [...pending, ...resolved, ...postMortem];

  return (
    <div style={{ flex: 1, display: 'flex', height: '100%', overflow: 'hidden', fontFamily: 'Inter, sans-serif' }}>

      {/* ── Left panel: decision list ── */}
      <div
        style={{
          width: 280,
          minWidth: 280,
          borderRight: '1px solid var(--border-structural, rgba(88,28,135,0.14))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--atlas-surface-rail, rgba(8,4,20,0.6))',
        }}
      >
        {/* List header */}
        <div
          style={{
            padding: '16px 16px 12px',
            borderBottom: '1px solid rgba(88,28,135,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 500,
                color: 'rgba(226,232,240,0.8)',
                letterSpacing: '-0.01em',
              }}
            >
              Decisions
            </div>
            <div style={{ fontSize: '0.62rem', color: T.dimmer, marginTop: 1 }}>
              {decisions.length} {decisions.length === 1 ? 'decision' : 'decisions'}
            </div>
          </div>
          <button
            onClick={startCreate}
            title="New decision"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: 'rgba(88,28,135,0.2)',
              border: `1px solid rgba(88,28,135,0.35)`,
              color: T.violet,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.1rem',
              lineHeight: 1,
              transition: 'all 140ms ease',
              fontFamily: 'inherit',
            }}
          >
            +
          </button>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
          {sorted.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '32px 16px',
                color: T.dim,
                fontSize: '0.78rem',
                lineHeight: 1.7,
              }}
            >
              No decisions yet.
              <br />
              Press + to begin.
            </div>
          ) : (
            sorted.map((d) => (
              <DecisionListItem
                key={d.id}
                decision={d}
                isSelected={selectedId === d.id && mode === 'view'}
                onSelect={() => { setSelectedId(d.id); setMode('view'); }}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {mode === 'create' || mode === 'edit' ? (
          <DecisionForm
            initial={formState}
            doctrine={doctrineTitles}
            onSave={(f) => void handleSave(f)}
            onCancel={cancelForm}
            mode={mode}
          />
        ) : selected ? (
          <DecisionDetail
            decision={selected}
            onEdit={startEdit}
            onDelete={() => void handleDelete()}
          />
        ) : (
          /* Empty state */
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              color: T.dim,
              animation: 'atlas-fade-in 300ms ease both',
            }}
          >
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(88,28,135,0.3)"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: T.muted, marginBottom: 6 }}>
                Decision Architecture
              </div>
              <div style={{ fontSize: '0.75rem', color: T.dim, lineHeight: 1.6 }}>
                Select a decision or create a new one
              </div>
            </div>
            <button
              onClick={startCreate}
              style={{
                background: 'rgba(88,28,135,0.18)',
                border: `1px solid rgba(88,28,135,0.35)`,
                borderRadius: 7,
                padding: '8px 20px',
                color: T.violet,
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 500,
                fontFamily: 'Inter, sans-serif',
                letterSpacing: '0.02em',
                marginTop: 4,
              }}
            >
              New Decision
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
