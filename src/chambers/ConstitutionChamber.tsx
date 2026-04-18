import React, { useState } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { nowISO } from '../lib/persistence';
import { SyncStatusIndicator } from '../components/SyncStatusIndicator';
import type { SyncStatus } from '../lib/sovereignSync';
import type {
  PersonalConstitution,
  ConstitutionValue,
  ConstitutionStandard,
  ConstitutionGoal,
  ConstitutionMotive,
  ConstitutionTension,
} from '@/types';

// ── Design tokens ──────────────────────────────────────────────────────────
const T = {
  gold:    'rgba(201,162,39,0.9)',
  goldDim: 'rgba(201,162,39,0.45)',
  violet:  'rgba(167,139,250,0.85)',
  violetDim:'rgba(167,139,250,0.35)',
  indigo:  'rgba(99,102,241,0.8)',
  indigoDim:'rgba(99,102,241,0.3)',
  teal:    'rgba(45,212,191,0.75)',
  tealDim: 'rgba(45,212,191,0.25)',
  green:   'rgba(34,197,94,0.7)',
  greenDim:'rgba(34,197,94,0.22)',
  amber:   'rgba(251,191,36,0.8)',
  amberDim:'rgba(251,191,36,0.25)',
  rose:    'rgba(251,113,133,0.8)',
  roseDim: 'rgba(251,113,133,0.22)',
  danger:  'rgba(239,68,68,0.75)',
  body:    'rgba(226,232,240,0.92)',
  muted:   'rgba(226,232,240,0.55)',
  dim:     'rgba(226,232,240,0.3)',
  ghost:   'rgba(226,232,240,0.14)',
  border:  'rgba(88,28,135,0.14)',
  borderS: 'rgba(88,28,135,0.1)',
  panel:   'rgba(15,10,30,0.55)',
  inset:   'rgba(5,5,8,0.72)',
};

// ── Shared style helpers ───────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  fontSize: '0.62rem',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
};

const inputStyle: React.CSSProperties = {
  background: T.inset,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  padding: '9px 12px',
  color: T.body,
  fontSize: '0.85rem',
  fontFamily: 'Inter, sans-serif',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(226,232,240,0.3)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  paddingRight: 30,
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
  lineHeight: 1.75,
};

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ ...labelStyle, color: T.dim }}>{label}</div>
      {children}
    </div>
  );
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: `1px solid rgba(239,68,68,0.18)`,
        borderRadius: 4,
        padding: '3px 9px',
        color: 'rgba(239,68,68,0.45)',
        cursor: 'pointer',
        fontSize: '0.6rem',
        letterSpacing: '0.1em',
        fontFamily: 'Inter, sans-serif',
        transition: 'all 140ms ease',
        fontWeight: 600,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = T.danger;
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.45)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = 'rgba(239,68,68,0.45)';
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.18)';
      }}
    >
      REMOVE
    </button>
  );
}

function MiniBar({
  value,
  max = 1,
  color,
  height = 3,
}: {
  value: number;
  max?: number;
  color: string;
  height?: number;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      style={{
        height,
        background: 'rgba(255,255,255,0.06)',
        borderRadius: height,
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: height,
          transition: 'width 300ms ease',
        }}
      />
    </div>
  );
}

function AddCard({
  accentColor,
  label,
  onCancel,
  onSave,
  saveDisabled,
  children,
}: {
  accentColor: string;
  label: string;
  onCancel: () => void;
  onSave: () => void;
  saveDisabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: T.panel,
        border: `1px solid ${T.border}`,
        borderLeft: `2px solid ${accentColor}`,
        borderRadius: 10,
        padding: 18,
        marginBottom: 20,
        animation: 'atlas-fade-in 200ms ease both',
      }}
    >
      <div style={{ ...labelStyle, color: accentColor, marginBottom: 14 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {children}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: `1px solid ${T.border}`,
              borderRadius: 5,
              padding: '7px 14px',
              color: T.dim,
              cursor: 'pointer',
              fontSize: '0.78rem',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saveDisabled}
            style={{
              background: saveDisabled ? 'rgba(88,28,135,0.1)' : 'rgba(88,28,135,0.25)',
              border: `1px solid ${saveDisabled ? T.border : 'rgba(88,28,135,0.45)'}`,
              borderRadius: 5,
              padding: '7px 16px',
              color: saveDisabled ? T.dim : T.violet,
              cursor: saveDisabled ? 'not-allowed' : 'pointer',
              fontSize: '0.78rem',
              fontFamily: 'Inter, sans-serif',
              fontWeight: 500,
              transition: 'all 140ms ease',
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  color,
  label,
  count,
}: {
  color: string;
  label: string;
  count: number;
}) {
  return (
    <div
      style={{
        ...labelStyle,
        color,
        marginBottom: 10,
        paddingBottom: 6,
        borderBottom: `1px solid ${color.replace(/[\d.]+\)$/, '0.12)')}`,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {label}
      <span style={{ opacity: 0.55, fontWeight: 400 }}>· {count}</span>
    </div>
  );
}

// ── Values Tab ─────────────────────────────────────────────────────────────

type ValueForm = {
  title: string;
  description: string;
  priority: number;
  origin: string;
};

function ValueCard({
  value,
  onDelete,
}: {
  value: ConstitutionValue;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        background: T.panel,
        border: `1px solid ${open ? 'rgba(201,162,39,0.2)' : T.borderS}`,
        borderLeft: `2px solid ${T.gold}`,
        borderRadius: 8,
        marginBottom: 8,
        overflow: 'hidden',
        transition: 'border-color 140ms ease',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          padding: '12px 14px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          gap: 10,
          fontFamily: 'Inter, sans-serif',
          textAlign: 'left',
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            background: 'rgba(201,162,39,0.1)',
            border: `1px solid rgba(201,162,39,0.25)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '0.6rem', fontWeight: 700, color: T.goldDim }}>
            {value.priority}
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '0.875rem',
              fontWeight: 500,
              color: T.body,
              letterSpacing: '-0.01em',
              whiteSpace: open ? 'normal' : 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {value.title}
          </div>
          {!open && (
            <div
              style={{
                marginTop: 3,
                height: 3,
                width: 80,
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${value.priority * 10}%`,
                  background: T.gold,
                  borderRadius: 2,
                }}
              />
            </div>
          )}
        </div>

        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke={T.ghost}
          strokeWidth="2"
          style={{
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 200ms ease',
          }}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            padding: '0 14px 14px',
            animation: 'atlas-fade-in 200ms ease both',
          }}
        >
          <div
            style={{
              borderTop: `1px solid ${T.borderS}`,
              paddingTop: 12,
              marginBottom: 12,
            }}
          >
            <p
              style={{
                margin: '0 0 10px',
                fontSize: '0.83rem',
                color: T.muted,
                lineHeight: 1.75,
              }}
            >
              {value.description}
            </p>

            <div style={{ marginBottom: 10 }}>
              <div style={{ ...labelStyle, color: T.dim, marginBottom: 5 }}>
                Priority
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <MiniBar value={value.priority} max={10} color={T.gold} height={4} />
                </div>
                <span style={{ fontSize: '0.7rem', color: T.goldDim, fontWeight: 600 }}>
                  {value.priority}/10
                </span>
              </div>
            </div>

            {value.origin && (
              <div>
                <span style={{ ...labelStyle, color: T.dim }}>Origin · </span>
                <span style={{ fontSize: '0.78rem', color: T.muted, fontStyle: 'italic' }}>
                  {value.origin}
                </span>
              </div>
            )}
          </div>

          <DeleteBtn onClick={onDelete} />
        </div>
      )}
    </div>
  );
}

function ValuesTab() {
  const constitution = useAtlasStore((s) => s.constitution);
  const addConstitutionValue = useAtlasStore((s) => s.addConstitutionValue);
  const removeConstitutionValue = useAtlasStore((s) => s.removeConstitutionValue);

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<ValueForm>({
    title: '',
    description: '',
    priority: 5,
    origin: '',
  });

  const sorted = [...constitution.values].sort((a, b) => b.priority - a.priority);

  function handleSave() {
    if (!form.title.trim() || !form.description.trim()) return;
    addConstitutionValue({
      title: form.title.trim(),
      description: form.description.trim(),
      priority: form.priority,
      origin: form.origin.trim() || undefined,
    });
    setForm({ title: '', description: '', priority: 5, origin: '' });
    setIsAdding(false);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            style={{
              background: 'rgba(201,162,39,0.08)',
              border: `1px solid rgba(201,162,39,0.3)`,
              borderRadius: 6,
              padding: '6px 14px',
              color: T.goldDim,
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontFamily: 'Inter, sans-serif',
              fontWeight: 500,
            }}
          >
            + Add Value
          </button>
        )}
      </div>

      {isAdding && (
        <AddCard
          accentColor={T.gold}
          label="New Value"
          onCancel={() => setIsAdding(false)}
          onSave={handleSave}
          saveDisabled={!form.title.trim() || !form.description.trim()}
        >
          <FormField label="Title">
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Integrity, Excellence, Autonomy…"
              autoFocus
              style={inputStyle}
            />
          </FormField>

          <FormField label="Description">
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What does this value mean to you? How does it manifest?"
              rows={3}
              style={textareaStyle}
            />
          </FormField>

          <FormField label={`Priority · ${form.priority}/10`}>
            <input
              type="range"
              min={1}
              max={10}
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
              style={{ width: '100%', accentColor: T.gold, cursor: 'pointer' }}
            />
          </FormField>

          <FormField label="Origin (optional)">
            <input
              type="text"
              value={form.origin}
              onChange={(e) => setForm((f) => ({ ...f, origin: e.target.value }))}
              placeholder="Where does this value come from?"
              style={inputStyle}
            />
          </FormField>
        </AddCard>
      )}

      {sorted.length === 0 && !isAdding ? (
        <EmptyState
          title="No values defined yet."
          description="Values are the axioms of your decision-making. Capturing them helps Atlas reason with your actual priorities, not assumed ones."
        />
      ) : (
        <div>
          {sorted.map((v) => (
            <ValueCard
              key={v.id}
              value={v}
              onDelete={() => removeConstitutionValue(v.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Standards Tab ──────────────────────────────────────────────────────────

const DOMAIN_COLORS: Record<ConstitutionStandard['domain'], string> = {
  thought:       T.indigo,
  work:          T.gold,
  communication: T.teal,
  ethics:        T.green,
};

const DOMAINS: ConstitutionStandard['domain'][] = [
  'thought',
  'work',
  'communication',
  'ethics',
];

function StandardCard({
  standard,
  onDelete,
}: {
  standard: ConstitutionStandard;
  onDelete: () => void;
}) {
  const color = DOMAIN_COLORS[standard.domain];
  return (
    <div
      style={{
        background: T.panel,
        border: `1px solid ${T.borderS}`,
        borderLeft: `2px solid ${color}`,
        borderRadius: 8,
        padding: '12px 14px',
        marginBottom: 8,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '0.82rem',
            fontWeight: 600,
            color: color,
            marginBottom: 3,
            letterSpacing: '-0.01em',
          }}
        >
          {standard.threshold}
        </div>
        <div
          style={{
            fontSize: '0.8rem',
            color: T.muted,
            lineHeight: 1.65,
          }}
        >
          {standard.description}
        </div>
      </div>
      <DeleteBtn onClick={onDelete} />
    </div>
  );
}

function StandardsTab() {
  const constitution = useAtlasStore((s) => s.constitution);
  const addConstitutionStandard = useAtlasStore((s) => s.addConstitutionStandard);
  const removeConstitutionStandard = useAtlasStore((s) => s.removeConstitutionStandard);

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<{
    domain: ConstitutionStandard['domain'];
    threshold: string;
    description: string;
  }>({
    domain: 'thought',
    threshold: '',
    description: '',
  });

  const grouped = DOMAINS.reduce<Record<string, ConstitutionStandard[]>>((acc, d) => {
    acc[d] = constitution.standards.filter((s) => s.domain === d);
    return acc;
  }, {});

  function handleSave() {
    if (!form.threshold.trim() || !form.description.trim()) return;
    addConstitutionStandard({
      domain: form.domain,
      threshold: form.threshold.trim(),
      description: form.description.trim(),
    });
    setForm({ domain: 'thought', threshold: '', description: '' });
    setIsAdding(false);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            style={{
              background: 'rgba(99,102,241,0.08)',
              border: `1px solid rgba(99,102,241,0.3)`,
              borderRadius: 6,
              padding: '6px 14px',
              color: T.indigoDim,
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontFamily: 'Inter, sans-serif',
              fontWeight: 500,
            }}
          >
            + Add Standard
          </button>
        )}
      </div>

      {isAdding && (
        <AddCard
          accentColor={DOMAIN_COLORS[form.domain]}
          label="New Standard"
          onCancel={() => setIsAdding(false)}
          onSave={handleSave}
          saveDisabled={!form.threshold.trim() || !form.description.trim()}
        >
          <FormField label="Domain">
            <select
              value={form.domain}
              onChange={(e) =>
                setForm((f) => ({ ...f, domain: e.target.value as ConstitutionStandard['domain'] }))
              }
              style={selectStyle}
            >
              {DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Threshold">
            <input
              type="text"
              value={form.threshold}
              onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
              placeholder="The bar you hold yourself to…"
              autoFocus
              style={inputStyle}
            />
          </FormField>

          <FormField label="Description">
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="How do you apply this standard in practice?"
              rows={3}
              style={textareaStyle}
            />
          </FormField>
        </AddCard>
      )}

      {constitution.standards.length === 0 && !isAdding ? (
        <EmptyState
          title="No standards defined yet."
          description="Standards define the minimum acceptable bar across domains. They distinguish non-negotiables from preferences."
        />
      ) : (
        <div>
          {DOMAINS.filter((d) => grouped[d].length > 0).map((d) => (
            <div key={d} style={{ marginBottom: 24 }}>
              <SectionHeader
                color={DOMAIN_COLORS[d]}
                label={d.charAt(0).toUpperCase() + d.slice(1)}
                count={grouped[d].length}
              />
              {grouped[d].map((s) => (
                <StandardCard
                  key={s.id}
                  standard={s}
                  onDelete={() => removeConstitutionStandard(s.id)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Goals Tab ──────────────────────────────────────────────────────────────

const HORIZON_COLORS: Record<ConstitutionGoal['horizon'], string> = {
  short:  T.amber,
  medium: T.indigo,
  long:   T.violet,
  legacy: T.gold,
};

const HORIZONS: ConstitutionGoal['horizon'][] = ['short', 'medium', 'long', 'legacy'];

const HORIZON_LABELS: Record<ConstitutionGoal['horizon'], string> = {
  short:  'Short-Term',
  medium: 'Medium-Term',
  long:   'Long-Term',
  legacy: 'Legacy',
};

function GoalCard({
  goal,
  onDelete,
}: {
  goal: ConstitutionGoal;
  onDelete: () => void;
}) {
  const color = HORIZON_COLORS[goal.horizon];
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        background: T.panel,
        border: `1px solid ${open ? color.replace(/[\d.]+\)$/, '0.2)') : T.borderS}`,
        borderLeft: `2px solid ${color}`,
        borderRadius: 8,
        marginBottom: 8,
        overflow: 'hidden',
        transition: 'border-color 140ms ease',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          padding: '12px 14px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          gap: 10,
          fontFamily: 'Inter, sans-serif',
          textAlign: 'left',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '0.875rem',
              fontWeight: 500,
              color: T.body,
              letterSpacing: '-0.01em',
              whiteSpace: open ? 'normal' : 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginBottom: 4,
            }}
          >
            {goal.title}
          </div>
          <MiniBar
            value={goal.alignmentScore}
            max={1}
            color={color}
            height={2}
          />
        </div>
        <div
          style={{
            ...labelStyle,
            color,
            flexShrink: 0,
            fontSize: '0.55rem',
          }}
        >
          {Math.round(goal.alignmentScore * 100)}%
        </div>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke={T.ghost}
          strokeWidth="2"
          style={{
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 200ms ease',
          }}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px', animation: 'atlas-fade-in 200ms ease both' }}>
          <div
            style={{
              borderTop: `1px solid ${T.borderS}`,
              paddingTop: 12,
              marginBottom: 12,
            }}
          >
            <p
              style={{
                margin: '0 0 12px',
                fontSize: '0.83rem',
                color: T.muted,
                lineHeight: 1.75,
              }}
            >
              {goal.description}
            </p>
            <div>
              <div style={{ ...labelStyle, color: T.dim, marginBottom: 5 }}>
                Alignment · {Math.round(goal.alignmentScore * 100)}%
              </div>
              <MiniBar value={goal.alignmentScore} max={1} color={color} height={4} />
            </div>
          </div>
          <DeleteBtn onClick={onDelete} />
        </div>
      )}
    </div>
  );
}

function GoalsTab() {
  const constitution = useAtlasStore((s) => s.constitution);
  const addConstitutionGoal = useAtlasStore((s) => s.addConstitutionGoal);
  const removeConstitutionGoal = useAtlasStore((s) => s.removeConstitutionGoal);

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<{
    title: string;
    horizon: ConstitutionGoal['horizon'];
    description: string;
    alignmentScore: number;
  }>({
    title: '',
    horizon: 'short',
    description: '',
    alignmentScore: 0.7,
  });

  const grouped = HORIZONS.reduce<Record<string, ConstitutionGoal[]>>((acc, h) => {
    acc[h] = constitution.goals.filter((g) => g.horizon === h);
    return acc;
  }, {});

  function handleSave() {
    if (!form.title.trim() || !form.description.trim()) return;
    addConstitutionGoal({
      title: form.title.trim(),
      horizon: form.horizon,
      description: form.description.trim(),
      alignmentScore: form.alignmentScore,
    });
    setForm({ title: '', horizon: 'short', description: '', alignmentScore: 0.7 });
    setIsAdding(false);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            style={{
              background: 'rgba(34,197,94,0.07)',
              border: `1px solid rgba(34,197,94,0.25)`,
              borderRadius: 6,
              padding: '6px 14px',
              color: T.greenDim,
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontFamily: 'Inter, sans-serif',
              fontWeight: 500,
            }}
          >
            + Add Goal
          </button>
        )}
      </div>

      {isAdding && (
        <AddCard
          accentColor={HORIZON_COLORS[form.horizon]}
          label="New Goal"
          onCancel={() => setIsAdding(false)}
          onSave={handleSave}
          saveDisabled={!form.title.trim() || !form.description.trim()}
        >
          <FormField label="Title">
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="What do you want to achieve?"
              autoFocus
              style={inputStyle}
            />
          </FormField>

          <FormField label="Horizon">
            <select
              value={form.horizon}
              onChange={(e) =>
                setForm((f) => ({ ...f, horizon: e.target.value as ConstitutionGoal['horizon'] }))
              }
              style={selectStyle}
            >
              {HORIZONS.map((h) => (
                <option key={h} value={h}>
                  {HORIZON_LABELS[h]}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Description">
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Describe the goal in concrete terms. What does success look like?"
              rows={3}
              style={textareaStyle}
            />
          </FormField>

          <FormField label={`Alignment Score · ${Math.round(form.alignmentScore * 100)}%`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={form.alignmentScore}
              onChange={(e) =>
                setForm((f) => ({ ...f, alignmentScore: Number(e.target.value) }))
              }
              style={{
                width: '100%',
                accentColor: HORIZON_COLORS[form.horizon],
                cursor: 'pointer',
              }}
            />
          </FormField>
        </AddCard>
      )}

      {constitution.goals.length === 0 && !isAdding ? (
        <EmptyState
          title="No goals defined yet."
          description="Goals give Atlas a sense of your trajectory. Defining them by horizon lets Atlas weight near-term actions against long-term aims."
        />
      ) : (
        <div>
          {HORIZONS.filter((h) => grouped[h].length > 0).map((h) => (
            <div key={h} style={{ marginBottom: 24 }}>
              <SectionHeader
                color={HORIZON_COLORS[h]}
                label={HORIZON_LABELS[h]}
                count={grouped[h].length}
              />
              {grouped[h].map((g) => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  onDelete={() => removeConstitutionGoal(g.id)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Motives & Tensions Tab ─────────────────────────────────────────────────

function MotiveCard({
  motive,
  onDelete,
}: {
  motive: ConstitutionMotive;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        background: T.panel,
        border: `1px solid ${T.borderS}`,
        borderLeft: `2px solid ${T.violet}`,
        borderRadius: 8,
        padding: '12px 14px',
        marginBottom: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '0.875rem',
            fontWeight: 500,
            color: T.body,
            marginBottom: 5,
            letterSpacing: '-0.01em',
          }}
        >
          {motive.driver}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <MiniBar value={motive.intensity} max={1} color={T.violet} height={3} />
          </div>
          <span style={{ ...labelStyle, color: T.violetDim, fontSize: '0.55rem' }}>
            {Math.round(motive.intensity * 100)}%
          </span>
        </div>
      </div>
      <DeleteBtn onClick={onDelete} />
    </div>
  );
}

function TensionCard({
  tension,
  onDelete,
  onBalanceChange,
}: {
  tension: ConstitutionTension;
  onDelete: () => void;
  onBalanceChange: (val: number) => void;
}) {
  const balance = tension.currentBalance;

  return (
    <div
      style={{
        background: T.panel,
        border: `1px solid ${T.borderS}`,
        borderRadius: 8,
        padding: '14px 16px',
        marginBottom: 10,
      }}
    >
      {/* Poles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span
          style={{
            fontSize: '0.82rem',
            fontWeight: 600,
            color: balance < 0.5 ? T.violet : T.muted,
            flex: 1,
            textAlign: 'left',
            transition: 'color 200ms ease',
          }}
        >
          {tension.poleA}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={T.dim}
          strokeWidth="2"
        >
          <path d="M17 7L21 12M21 12L17 17M21 12H3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span
          style={{
            fontSize: '0.82rem',
            fontWeight: 600,
            color: balance > 0.5 ? T.violet : T.muted,
            flex: 1,
            textAlign: 'right',
            transition: 'color 200ms ease',
          }}
        >
          {tension.poleB}
        </span>
      </div>

      {/* Balance slider */}
      <div style={{ marginBottom: 10, position: 'relative' }}>
        <div
          style={{
            height: 4,
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 4,
            overflow: 'visible',
            position: 'relative',
            marginBottom: 6,
          }}
        >
          {/* Left fill */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${balance * 100}%`,
              background: `linear-gradient(90deg, ${T.violet}, ${T.violetDim})`,
              borderRadius: 4,
              transition: 'width 100ms ease',
            }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={balance}
          onChange={(e) => onBalanceChange(Number(e.target.value))}
          style={{
            width: '100%',
            position: 'absolute',
            top: -8,
            left: 0,
            opacity: 0,
            cursor: 'pointer',
            height: 20,
            margin: 0,
            padding: 0,
          }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '0.6rem', color: T.dim }}>
            {balance < 0.5 ? '←' : ''}
          </span>
          <span style={{ fontSize: '0.62rem', color: T.violetDim, fontWeight: 600 }}>
            {balance < 0.45
              ? `${tension.poleA} leaning`
              : balance > 0.55
              ? `${tension.poleB} leaning`
              : 'balanced'}
          </span>
          <span style={{ fontSize: '0.6rem', color: T.dim }}>
            {balance > 0.5 ? '→' : ''}
          </span>
        </div>
      </div>

      {/* Description */}
      {tension.description && (
        <p
          style={{
            margin: '0 0 10px',
            fontSize: '0.8rem',
            color: T.muted,
            lineHeight: 1.65,
          }}
        >
          {tension.description}
        </p>
      )}

      <DeleteBtn onClick={onDelete} />
    </div>
  );
}

function MotivesTensionsTab() {
  const constitution = useAtlasStore((s) => s.constitution);
  const addConstitutionMotive = useAtlasStore((s) => s.addConstitutionMotive);
  const removeConstitutionMotive = useAtlasStore((s) => s.removeConstitutionMotive);
  const addConstitutionTension = useAtlasStore((s) => s.addConstitutionTension);
  const removeConstitutionTension = useAtlasStore((s) => s.removeConstitutionTension);
  const updateConstitutionTension = useAtlasStore((s) => s.updateConstitutionTension);

  const [addingMotive, setAddingMotive] = useState(false);
  const [addingTension, setAddingTension] = useState(false);
  const [motiveForm, setMotiveForm] = useState({ driver: '', intensity: 0.7 });
  const [tensionForm, setTensionForm] = useState({
    poleA: '',
    poleB: '',
    description: '',
    currentBalance: 0.5,
  });

  function handleSaveMotive() {
    if (!motiveForm.driver.trim()) return;
    addConstitutionMotive({ driver: motiveForm.driver.trim(), intensity: motiveForm.intensity });
    setMotiveForm({ driver: '', intensity: 0.7 });
    setAddingMotive(false);
  }

  function handleSaveTension() {
    if (!tensionForm.poleA.trim() || !tensionForm.poleB.trim()) return;
    addConstitutionTension({
      poleA: tensionForm.poleA.trim(),
      poleB: tensionForm.poleB.trim(),
      description: tensionForm.description.trim(),
      currentBalance: tensionForm.currentBalance,
    });
    setTensionForm({ poleA: '', poleB: '', description: '', currentBalance: 0.5 });
    setAddingTension(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Motives Section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <SectionHeader color={T.violet} label="Motives" count={constitution.motives.length} />
          {!addingMotive && (
            <button
              onClick={() => setAddingMotive(true)}
              style={{
                background: 'rgba(167,139,250,0.07)',
                border: `1px solid rgba(167,139,250,0.25)`,
                borderRadius: 6,
                padding: '5px 12px',
                color: T.violetDim,
                cursor: 'pointer',
                fontSize: '0.72rem',
                fontFamily: 'Inter, sans-serif',
                fontWeight: 500,
                marginBottom: 10,
              }}
            >
              + Add
            </button>
          )}
        </div>

        {addingMotive && (
          <AddCard
            accentColor={T.violet}
            label="New Motive"
            onCancel={() => setAddingMotive(false)}
            onSave={handleSaveMotive}
            saveDisabled={!motiveForm.driver.trim()}
          >
            <FormField label="Driver">
              <input
                type="text"
                value={motiveForm.driver}
                onChange={(e) => setMotiveForm((f) => ({ ...f, driver: e.target.value }))}
                placeholder="What drives you? E.g. Fear of mediocrity, pursuit of mastery…"
                autoFocus
                style={inputStyle}
              />
            </FormField>
            <FormField label={`Intensity · ${Math.round(motiveForm.intensity * 100)}%`}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={motiveForm.intensity}
                onChange={(e) => setMotiveForm((f) => ({ ...f, intensity: Number(e.target.value) }))}
                style={{ width: '100%', accentColor: T.violet, cursor: 'pointer' }}
              />
            </FormField>
          </AddCard>
        )}

        {constitution.motives.length === 0 && !addingMotive ? (
          <div style={{ fontSize: '0.8rem', color: T.dim, fontStyle: 'italic', paddingLeft: 2 }}>
            No motives defined.
          </div>
        ) : (
          constitution.motives.map((m) => (
            <MotiveCard
              key={m.id}
              motive={m}
              onDelete={() => removeConstitutionMotive(m.id)}
            />
          ))
        )}
      </div>

      {/* Tensions Section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <SectionHeader color={T.rose} label="Tensions" count={constitution.tensions.length} />
          {!addingTension && (
            <button
              onClick={() => setAddingTension(true)}
              style={{
                background: 'rgba(251,113,133,0.07)',
                border: `1px solid rgba(251,113,133,0.25)`,
                borderRadius: 6,
                padding: '5px 12px',
                color: T.roseDim,
                cursor: 'pointer',
                fontSize: '0.72rem',
                fontFamily: 'Inter, sans-serif',
                fontWeight: 500,
                marginBottom: 10,
              }}
            >
              + Add
            </button>
          )}
        </div>

        {addingTension && (
          <AddCard
            accentColor={T.rose}
            label="New Tension"
            onCancel={() => setAddingTension(false)}
            onSave={handleSaveTension}
            saveDisabled={!tensionForm.poleA.trim() || !tensionForm.poleB.trim()}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <FormField label="Pole A">
                <input
                  type="text"
                  value={tensionForm.poleA}
                  onChange={(e) => setTensionForm((f) => ({ ...f, poleA: e.target.value }))}
                  placeholder="E.g. Depth"
                  autoFocus
                  style={inputStyle}
                />
              </FormField>
              <FormField label="Pole B">
                <input
                  type="text"
                  value={tensionForm.poleB}
                  onChange={(e) => setTensionForm((f) => ({ ...f, poleB: e.target.value }))}
                  placeholder="E.g. Speed"
                  style={inputStyle}
                />
              </FormField>
            </div>

            <FormField label="Description">
              <textarea
                value={tensionForm.description}
                onChange={(e) => setTensionForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Describe the tension and when it surfaces…"
                rows={2}
                style={textareaStyle}
              />
            </FormField>

            <FormField
              label={`Current Balance · ${tensionForm.currentBalance < 0.45 ? tensionForm.poleA || 'Pole A' : tensionForm.currentBalance > 0.55 ? tensionForm.poleB || 'Pole B' : 'Balanced'}`}
            >
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={tensionForm.currentBalance}
                onChange={(e) =>
                  setTensionForm((f) => ({ ...f, currentBalance: Number(e.target.value) }))
                }
                style={{ width: '100%', accentColor: T.rose, cursor: 'pointer' }}
              />
            </FormField>
          </AddCard>
        )}

        {constitution.tensions.length === 0 && !addingTension ? (
          <div style={{ fontSize: '0.8rem', color: T.dim, fontStyle: 'italic', paddingLeft: 2 }}>
            No tensions defined.
          </div>
        ) : (
          constitution.tensions.map((t) => (
            <TensionCard
              key={t.id}
              tension={t}
              onDelete={() => removeConstitutionTension(t.id)}
              onBalanceChange={(val) => updateConstitutionTension(t.id, { currentBalance: val })}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Style Tab ──────────────────────────────────────────────────────────────

const REASONING_PREFS: Array<{ value: PersonalConstitution['reasoningStyle']['preference']; label: string }> = [
  { value: 'first-principles', label: 'First Principles' },
  { value: 'analogical', label: 'Analogical' },
  { value: 'empirical', label: 'Empirical' },
  { value: 'intuitive', label: 'Intuitive' },
];

const VIBES: Array<{ value: PersonalConstitution['aestheticModel']['vibe']; label: string }> = [
  { value: 'minimalist', label: 'Minimalist' },
  { value: 'brutalist', label: 'Brutalist' },
  { value: 'editorial', label: 'Editorial' },
  { value: 'technical', label: 'Technical' },
  { value: 'baroque', label: 'Baroque' },
];

const TONALITIES: Array<{ value: PersonalConstitution['aestheticModel']['tonality']; label: string }> = [
  { value: 'stoic', label: 'Stoic' },
  { value: 'warm', label: 'Warm' },
  { value: 'analytical', label: 'Analytical' },
  { value: 'provocative', label: 'Provocative' },
];

function StyleTab() {
  const constitution = useAtlasStore((s) => s.constitution);
  const updateConstitution = useAtlasStore((s) => s.updateConstitution);

  const { reasoningStyle, aestheticModel } = constitution;

  const [newColor, setNewColor] = useState('');

  function updateReasoning(partial: Partial<PersonalConstitution['reasoningStyle']>) {
    updateConstitution({
      reasoningStyle: { ...reasoningStyle, ...partial },
    });
  }

  function updateAesthetic(partial: Partial<PersonalConstitution['aestheticModel']>) {
    updateConstitution({
      aestheticModel: { ...aestheticModel, ...partial },
    });
  }

  function addColorTag() {
    const val = newColor.trim();
    if (!val || aestheticModel.colorPreference.includes(val)) return;
    updateAesthetic({ colorPreference: [...aestheticModel.colorPreference, val] });
    setNewColor('');
  }

  function removeColorTag(color: string) {
    updateAesthetic({
      colorPreference: aestheticModel.colorPreference.filter((c) => c !== color),
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Reasoning Style */}
      <div
        style={{
          background: T.panel,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          padding: 18,
        }}
      >
        <div style={{ ...labelStyle, color: T.indigo, marginBottom: 18 }}>
          Reasoning Style
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Preference */}
          <FormField label="Preference">
            <select
              value={reasoningStyle.preference}
              onChange={(e) =>
                updateReasoning({
                  preference: e.target.value as PersonalConstitution['reasoningStyle']['preference'],
                })
              }
              style={selectStyle}
            >
              {REASONING_PREFS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </FormField>

          {/* Depth Threshold */}
          <FormField
            label={`Depth Threshold · ${Math.round(reasoningStyle.depthThreshold * 100)}%`}
          >
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={reasoningStyle.depthThreshold}
              onChange={(e) =>
                updateReasoning({ depthThreshold: Number(e.target.value) })
              }
              style={{ width: '100%', accentColor: T.indigo, cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: -4 }}>
              <span style={{ fontSize: '0.6rem', color: T.dim }}>Surface</span>
              <span style={{ fontSize: '0.6rem', color: T.dim }}>Exhaustive</span>
            </div>
          </FormField>

          {/* Rigor Level */}
          <FormField label={`Rigor Level · ${Math.round(reasoningStyle.rigorLevel * 100)}%`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={reasoningStyle.rigorLevel}
              onChange={(e) =>
                updateReasoning({ rigorLevel: Number(e.target.value) })
              }
              style={{ width: '100%', accentColor: T.indigo, cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: -4 }}>
              <span style={{ fontSize: '0.6rem', color: T.dim }}>Casual</span>
              <span style={{ fontSize: '0.6rem', color: T.dim }}>Rigorous</span>
            </div>
          </FormField>
        </div>
      </div>

      {/* Aesthetic Model */}
      <div
        style={{
          background: T.panel,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          padding: 18,
        }}
      >
        <div style={{ ...labelStyle, color: T.rose, marginBottom: 18 }}>
          Aesthetic Model
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Vibe — Segmented buttons */}
          <div>
            <div style={{ ...labelStyle, color: T.dim, marginBottom: 8 }}>Vibe</div>
            <div
              style={{
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              {VIBES.map((v) => {
                const active = aestheticModel.vibe === v.value;
                return (
                  <button
                    key={v.value}
                    onClick={() => updateAesthetic({ vibe: v.value })}
                    style={{
                      background: active ? 'rgba(251,113,133,0.15)' : 'transparent',
                      border: `1px solid ${active ? 'rgba(251,113,133,0.45)' : T.border}`,
                      borderRadius: 6,
                      padding: '6px 12px',
                      color: active ? T.rose : T.muted,
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: active ? 600 : 400,
                      transition: 'all 140ms ease',
                    }}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tonality — Segmented buttons */}
          <div>
            <div style={{ ...labelStyle, color: T.dim, marginBottom: 8 }}>Tonality</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TONALITIES.map((t) => {
                const active = aestheticModel.tonality === t.value;
                return (
                  <button
                    key={t.value}
                    onClick={() => updateAesthetic({ tonality: t.value })}
                    style={{
                      background: active ? 'rgba(251,113,133,0.12)' : 'transparent',
                      border: `1px solid ${active ? 'rgba(251,113,133,0.4)' : T.border}`,
                      borderRadius: 6,
                      padding: '6px 12px',
                      color: active ? T.rose : T.muted,
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: active ? 600 : 400,
                      transition: 'all 140ms ease',
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color Preference Tags */}
          <div>
            <div style={{ ...labelStyle, color: T.dim, marginBottom: 8 }}>Color Preferences</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {aestheticModel.colorPreference.map((c) => (
                <div
                  key={c}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${T.border}`,
                    borderRadius: 20,
                    padding: '4px 10px 4px 8px',
                  }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: c,
                      flexShrink: 0,
                      border: '1px solid rgba(255,255,255,0.12)',
                    }}
                  />
                  <span style={{ fontSize: '0.72rem', color: T.muted }}>{c}</span>
                  <button
                    onClick={() => removeColorTag(c)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: T.dim,
                      padding: 0,
                      lineHeight: 1,
                      fontSize: '0.75rem',
                      fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              {aestheticModel.colorPreference.length === 0 && (
                <span style={{ fontSize: '0.78rem', color: T.dim, fontStyle: 'italic' }}>
                  No colors defined
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addColorTag();
                }}
                placeholder="e.g. slate, #1a1a2e, deep navy"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={addColorTag}
                disabled={!newColor.trim()}
                style={{
                  background: 'rgba(88,28,135,0.18)',
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  padding: '9px 14px',
                  color: newColor.trim() ? T.violet : T.dim,
                  cursor: newColor.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '0.75rem',
                  fontFamily: 'Inter, sans-serif',
                  transition: 'all 140ms ease',
                  whiteSpace: 'nowrap',
                }}
              >
                Add Tag
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────────────

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '48px 20px',
        animation: 'atlas-fade-in 300ms ease both',
      }}
    >
      <div
        style={{ fontSize: '0.875rem', color: T.dim, marginBottom: 8, fontWeight: 500 }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: '0.78rem',
          color: 'rgba(226,232,240,0.2)',
          lineHeight: 1.75,
          maxWidth: 380,
          margin: '0 auto',
        }}
      >
        {description}
      </div>
    </div>
  );
}

// ── Tab definitions ────────────────────────────────────────────────────────

type TabId = 'values' | 'standards' | 'goals' | 'motives' | 'style';

const TABS: Array<{ id: TabId; label: string; color: string }> = [
  { id: 'values',    label: 'Values',            color: T.gold },
  { id: 'standards', label: 'Standards',          color: T.indigo },
  { id: 'goals',     label: 'Goals',              color: T.green },
  { id: 'motives',   label: 'Motives & Tensions', color: T.violet },
  { id: 'style',     label: 'Style',              color: T.rose },
];

// ── Main component ─────────────────────────────────────────────────────────

export default function ConstitutionChamber() {
  const constitution = useAtlasStore((s) => s.constitution);
  const [activeTab, setActiveTab] = useState<TabId>('values');
  const [syncStatus] = useState<SyncStatus>('idle');

  const activeTabMeta = TABS.find((t) => t.id === activeTab)!;

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
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: '20px 28px 0',
          borderBottom: '1px solid rgba(88,28,135,0.14)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: '1rem',
                fontWeight: 500,
                color: T.body,
                letterSpacing: '-0.02em',
              }}
            >
              Personal Constitution{' '}
              <span style={{ color: T.goldDim, fontWeight: 400 }}>
                v{constitution.version}
              </span>
            </h2>
            <p
              style={{
                margin: '3px 0 0',
                fontSize: '0.72rem',
                color: T.dim,
              }}
            >
              Last updated{' '}
              {constitution.lastUpdated
                ? new Date(constitution.lastUpdated).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : '—'}
              {' '}·{' '}
              {constitution.values.length} values · {constitution.standards.length} standards ·{' '}
              {constitution.goals.length} goals
              {' '}<SyncStatusIndicator status={syncStatus} />
            </p>
          </div>
        </div>

        {/* ── Tab bar ───────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto' }}>
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${active ? tab.color : 'transparent'}`,
                  padding: '8px 14px 10px',
                  color: active ? tab.color : T.dim,
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: active ? 600 : 400,
                  letterSpacing: active ? '-0.01em' : '0',
                  whiteSpace: 'nowrap',
                  transition: 'all 160ms ease',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div
        key={activeTab}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '22px 28px',
          animation: 'atlas-fade-in 200ms ease both',
        }}
      >
        {/* Tab-level descriptor */}
        <div
          style={{
            ...labelStyle,
            color: activeTabMeta.color,
            marginBottom: 18,
            opacity: 0.7,
          }}
        >
          {activeTab === 'values' && 'Core principles ranked by priority'}
          {activeTab === 'standards' && 'Non-negotiable thresholds by domain'}
          {activeTab === 'goals' && 'Intentions across time horizons'}
          {activeTab === 'motives' && 'Driving forces and internal conflicts'}
          {activeTab === 'style' && 'How you think and how you express'}
        </div>

        {activeTab === 'values'    && <ValuesTab />}
        {activeTab === 'standards' && <StandardsTab />}
        {activeTab === 'goals'     && <GoalsTab />}
        {activeTab === 'motives'   && <MotivesTensionsTab />}
        {activeTab === 'style'     && <StyleTab />}
      </div>
    </div>
  );
}
