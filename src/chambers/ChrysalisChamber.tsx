import React, { useState } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { generateId, nowISO } from '../lib/persistence';

interface ChrysalisModel {
  implementedUpgrades: {
    id: string;
    title: string;
    description: string;
    timestamp: string;
    impact: string;
  }[];
  experiments: {
    id: string;
    title: string;
    targetWeakness: string;
    type: string;
    status: 'proposed' | 'running' | 'passed' | 'failed' | 'shadowing' | 'canary' | 'approved' | 'rolled-back';
    impact: string;
    privacyScore: number;
    safetyScore: number;
  }[];
  weaknessLedger: {
    id: string;
    title: string;
    domain: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    recurrence: number;
    visibilityRisk: number;
    proposedAction: string;
  }[];
  modelComparisons: {
    id: string;
    architectures: {
      name: string;
      performance: string;
      pros: string[];
      cons: string[];
      privacyImpact: number;
      elegance: number;
      isSelected: boolean;
    }[];
  }[];
}

// ─── Design tokens ───────────────────────────────────────────────
const T = {
  body: 'rgba(226,232,240,0.92)',
  muted: 'rgba(226,232,240,0.55)',
  dim: 'rgba(226,232,240,0.3)',
  gold: 'rgba(201,162,39,0.9)',
  violet: 'rgba(167,139,250,0.85)',
  danger: 'rgba(239,68,68,0.75)',
  success: 'rgba(34,197,94,0.7)',
  indigo: 'rgba(99,102,241,0.7)',
  amber: 'rgba(234,179,8,0.7)',
  teal: 'rgba(6,182,212,0.7)',
  rose: 'rgba(244,114,182,0.7)',
  panel: 'rgba(15,10,30,0.55)',
  inset: 'rgba(5,5,8,0.72)',
  border: 'rgba(88,28,135,0.14)',
  borderSubtle: 'rgba(88,28,135,0.1)',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.62rem',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
};

const EMPTY_MODEL: ChrysalisModel = {
  implementedUpgrades: [],
  experiments: [],
  weaknessLedger: [],
  modelComparisons: [],
};

// ─── Status configs ───────────────────────────────────────────────
type ExperimentStatus = ChrysalisModel['experiments'][number]['status'];
const EXP_STATUS: Record<ExperimentStatus, { color: string; label: string }> = {
  proposed:     { color: 'rgba(226,232,240,0.35)', label: 'Proposed' },
  running:      { color: 'rgba(234,179,8,0.7)',    label: 'Running' },
  passed:       { color: 'rgba(34,197,94,0.7)',    label: 'Passed' },
  failed:       { color: 'rgba(239,68,68,0.75)',   label: 'Failed' },
  shadowing:    { color: 'rgba(167,139,250,0.85)', label: 'Shadowing' },
  canary:       { color: 'rgba(6,182,212,0.7)',    label: 'Canary' },
  approved:     { color: 'rgba(99,102,241,0.7)',   label: 'Approved' },
  'rolled-back':{ color: 'rgba(244,114,182,0.7)',  label: 'Rolled Back' },
};

type SeverityLevel = ChrysalisModel['weaknessLedger'][number]['severity'];
const SEV_CONFIG: Record<SeverityLevel, { color: string; label: string }> = {
  low:      { color: 'rgba(226,232,240,0.35)', label: 'Low' },
  medium:   { color: 'rgba(234,179,8,0.7)',    label: 'Medium' },
  high:     { color: 'rgba(239,68,68,0.75)',   label: 'High' },
  critical: { color: 'rgba(239,68,68,0.9)',    label: 'Critical' },
};

const SEV_ORDER: SeverityLevel[] = ['critical', 'high', 'medium', 'low'];

// ─── Shared UI ───────────────────────────────────────────────────

function ScoreBar({
  score,
  label,
  color,
  max = 1,
}: {
  score: number;
  label: string;
  color: string;
  max?: number;
}) {
  const pct = Math.max(0, Math.min(1, score / max)) * 100;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ ...labelStyle, color: T.dim }}>{label}</span>
        <span style={{ ...labelStyle, color }}>{Math.round(pct)}%</span>
      </div>
      <div style={{ height: 4, background: T.inset, borderRadius: 2, overflow: 'hidden', border: `1px solid ${T.borderSubtle}` }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color.replace('0.7', '0.4').replace('0.75', '0.4').replace('0.9', '0.5').replace('0.85', '0.5')}, ${color})`,
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}

function StatusBadge({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        ...labelStyle,
        color,
        background: color.replace(/[\d.]+\)$/, '0.08)'),
        border: `1px solid ${color.replace(/[\d.]+\)$/, '0.22)')}`,
        borderRadius: 4,
        padding: '2px 7px',
        display: 'inline-block',
      }}
    >
      {label}
    </span>
  );
}

function PulsingDot() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: 'rgba(239,68,68,0.9)',
        marginRight: 5,
        animation: 'atlas-fade-in 300ms ease both',
        boxShadow: '0 0 0 2px rgba(239,68,68,0.25)',
        verticalAlign: 'middle',
      }}
    />
  );
}

// ─── Input helpers ────────────────────────────────────────────────
const baseInput: React.CSSProperties = {
  background: T.inset,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  color: T.body,
  fontSize: '0.83rem',
  padding: '7px 10px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const baseTextarea: React.CSSProperties = {
  ...baseInput,
  minHeight: 60,
  resize: 'vertical',
};

const labelBlock: React.CSSProperties = {
  ...labelStyle,
  color: T.muted,
  display: 'block',
  marginBottom: 4,
  marginTop: 10,
};

// ─── Tabs ─────────────────────────────────────────────────────────
type Tab = 'upgrades' | 'experiments' | 'weaknesses' | 'comparisons';

// ═══════════════════════════════════════════════════════════════════
// Upgrades Tab
// ═══════════════════════════════════════════════════════════════════

function UpgradesTab({ data, onUpdate }: { data: ChrysalisModel; onUpdate: (d: ChrysalisModel) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', impact: '' });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const newUpgrade = {
      id: generateId(),
      title: form.title.trim(),
      description: form.description.trim(),
      timestamp: nowISO(),
      impact: form.impact.trim(),
    };
    onUpdate({ ...data, implementedUpgrades: [newUpgrade, ...data.implementedUpgrades] });
    setForm({ title: '', description: '', impact: '' });
    setShowForm(false);
  }

  function handleRemove(id: string) {
    onUpdate({ ...data, implementedUpgrades: data.implementedUpgrades.filter((u) => u.id !== id) });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ ...labelStyle, color: T.success }}>Implemented Upgrades</div>
          <div style={{ color: T.dim, fontSize: '0.75rem', marginTop: 2 }}>
            {data.implementedUpgrades.length} upgrade{data.implementedUpgrades.length !== 1 ? 's' : ''} logged
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '6px 14px',
            borderRadius: 5,
            border: '1px solid rgba(34,197,94,0.3)',
            background: showForm ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.07)',
            color: T.success,
            ...labelStyle,
            cursor: 'pointer',
          }}
        >
          {showForm ? '✕ Cancel' : '+ Log Upgrade'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleAdd}
          style={{
            background: T.panel,
            border: `1px solid rgba(34,197,94,0.18)`,
            borderRadius: 8,
            padding: 14,
            marginBottom: 16,
            animation: 'atlas-fade-in 300ms ease both',
          }}
        >
          <label style={labelBlock}>Title</label>
          <input style={baseInput} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Upgrade title..." required />
          <label style={labelBlock}>Description</label>
          <textarea style={baseTextarea} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What changed..." />
          <label style={labelBlock}>Impact</label>
          <input style={baseInput} value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })} placeholder="Measurable outcome or effect..." />
          <button
            type="submit"
            style={{
              marginTop: 12,
              width: '100%',
              padding: '8px 0',
              borderRadius: 5,
              border: '1px solid rgba(34,197,94,0.3)',
              background: 'rgba(34,197,94,0.1)',
              color: T.success,
              ...labelStyle,
              cursor: 'pointer',
            }}
          >
            Log Upgrade
          </button>
        </form>
      )}

      {data.implementedUpgrades.length === 0 ? (
        <div style={{ background: T.panel, border: `1px dashed ${T.border}`, borderRadius: 8, padding: '32px 20px', textAlign: 'center', color: T.dim, fontSize: '0.82rem' }}>
          No upgrades logged yet. Track implemented model improvements over time.
        </div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: 24 }}>
          {/* Timeline line */}
          <div style={{ position: 'absolute', left: 8, top: 0, bottom: 0, width: 1, background: 'rgba(34,197,94,0.15)' }} />
          {data.implementedUpgrades.map((u) => (
            <div
              key={u.id}
              style={{
                position: 'relative',
                marginBottom: 12,
                animation: 'atlas-fade-in 300ms ease both',
              }}
            >
              {/* Timeline dot */}
              <div
                style={{
                  position: 'absolute',
                  left: -20,
                  top: 14,
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background: T.success,
                  border: `2px solid rgba(34,197,94,0.25)`,
                }}
              />
              <div
                style={{
                  background: T.panel,
                  border: `1px solid rgba(34,197,94,0.12)`,
                  borderRadius: 8,
                  padding: '12px 14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ color: T.body, fontWeight: 700, fontSize: '0.88rem' }}>{u.title}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ color: T.dim, fontSize: '0.72rem' }}>
                      {new Date(u.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <button
                      onClick={() => handleRemove(u.id)}
                      style={{ background: 'transparent', border: 'none', color: T.dim, cursor: 'pointer', padding: '1px 3px', fontSize: '0.7rem' }}
                      onMouseEnter={(e) => ((e.target as HTMLElement).style.color = T.danger)}
                      onMouseLeave={(e) => ((e.target as HTMLElement).style.color = T.dim)}
                    >✕</button>
                  </div>
                </div>
                {u.description && (
                  <p style={{ color: T.muted, fontSize: '0.8rem', lineHeight: 1.5, margin: '6px 0 0' }}>{u.description}</p>
                )}
                {u.impact && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ ...labelStyle, color: T.success }}>Impact:</span>
                    <span style={{ color: T.muted, fontSize: '0.78rem' }}>{u.impact}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Experiments Tab
// ═══════════════════════════════════════════════════════════════════

function ExperimentsTab({ data, onUpdate }: { data: ChrysalisModel; onUpdate: (d: ChrysalisModel) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '',
    targetWeakness: '',
    type: '',
    status: 'proposed' as ExperimentStatus,
    impact: '',
    privacyScore: 0.5,
    safetyScore: 0.5,
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const exp = { id: generateId(), ...form, title: form.title.trim(), targetWeakness: form.targetWeakness.trim(), type: form.type.trim(), impact: form.impact.trim() };
    onUpdate({ ...data, experiments: [exp, ...data.experiments] });
    setForm({ title: '', targetWeakness: '', type: '', status: 'proposed', impact: '', privacyScore: 0.5, safetyScore: 0.5 });
    setShowForm(false);
  }

  function handleRemove(id: string) {
    onUpdate({ ...data, experiments: data.experiments.filter((e) => e.id !== id) });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ ...labelStyle, color: T.amber }}>Experiments</div>
          <div style={{ color: T.dim, fontSize: '0.75rem', marginTop: 2 }}>
            {data.experiments.length} experiment{data.experiments.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '6px 14px',
            borderRadius: 5,
            border: '1px solid rgba(234,179,8,0.3)',
            background: showForm ? 'rgba(234,179,8,0.15)' : 'rgba(234,179,8,0.07)',
            color: T.amber,
            ...labelStyle,
            cursor: 'pointer',
          }}
        >
          {showForm ? '✕ Cancel' : '+ Add Experiment'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleAdd}
          style={{
            background: T.panel,
            border: `1px solid rgba(234,179,8,0.18)`,
            borderRadius: 8,
            padding: 14,
            marginBottom: 16,
            animation: 'atlas-fade-in 300ms ease both',
          }}
        >
          <div className="chry-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelBlock}>Title</label>
              <input style={baseInput} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Experiment name..." required />
            </div>
            <div>
              <label style={labelBlock}>Type</label>
              <input style={baseInput} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="A/B, canary, shadow..." />
            </div>
          </div>
          <label style={labelBlock}>Target Weakness</label>
          <input style={baseInput} value={form.targetWeakness} onChange={(e) => setForm({ ...form, targetWeakness: e.target.value })} placeholder="Which weakness does this address..." />
          <label style={labelBlock}>Status</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
            {(Object.keys(EXP_STATUS) as ExperimentStatus[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setForm({ ...form, status: s })}
                style={{
                  ...labelStyle,
                  padding: '4px 9px',
                  borderRadius: 4,
                  border: `1px solid ${form.status === s ? EXP_STATUS[s].color.replace(/[\d.]+\)$/, '0.4)') : T.border}`,
                  background: form.status === s ? EXP_STATUS[s].color.replace(/[\d.]+\)$/, '0.12)') : T.inset,
                  color: form.status === s ? EXP_STATUS[s].color : T.dim,
                  cursor: 'pointer',
                }}
              >
                {EXP_STATUS[s].label}
              </button>
            ))}
          </div>
          <label style={labelBlock}>Impact</label>
          <input style={baseInput} value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })} placeholder="Expected or observed impact..." />
          <div className="chry-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ ...labelBlock }}>Privacy Score: {Math.round(form.privacyScore * 100)}%</label>
              <input type="range" min={0} max={1} step={0.01} value={form.privacyScore}
                onChange={(e) => setForm({ ...form, privacyScore: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: T.teal }} />
            </div>
            <div>
              <label style={{ ...labelBlock }}>Safety Score: {Math.round(form.safetyScore * 100)}%</label>
              <input type="range" min={0} max={1} step={0.01} value={form.safetyScore}
                onChange={(e) => setForm({ ...form, safetyScore: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: T.success }} />
            </div>
          </div>
          <button type="submit" style={{ marginTop: 12, width: '100%', padding: '8px 0', borderRadius: 5, border: '1px solid rgba(234,179,8,0.3)', background: 'rgba(234,179,8,0.1)', color: T.amber, ...labelStyle, cursor: 'pointer' }}>
            Add Experiment
          </button>
        </form>
      )}

      {data.experiments.length === 0 ? (
        <div style={{ background: T.panel, border: `1px dashed ${T.border}`, borderRadius: 8, padding: '32px 20px', textAlign: 'center', color: T.dim, fontSize: '0.82rem' }}>
          No experiments tracked yet. Add experiments targeting specific model weaknesses.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {data.experiments.map((exp) => {
            const st = EXP_STATUS[exp.status];
            return (
              <div
                key={exp.id}
                style={{
                  background: T.panel,
                  border: `1px solid ${st.color.replace(/[\d.]+\)$/, '0.15)')}`,
                  borderRadius: 8,
                  padding: '12px 14px',
                  animation: 'atlas-fade-in 300ms ease both',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.body, fontWeight: 700, fontSize: '0.86rem', marginBottom: 4 }}>{exp.title}</div>
                    <StatusBadge color={st.color} label={st.label} />
                  </div>
                  <button
                    onClick={() => handleRemove(exp.id)}
                    style={{ background: 'transparent', border: 'none', color: T.dim, cursor: 'pointer', padding: '1px 4px', fontSize: '0.7rem', flexShrink: 0 }}
                    onMouseEnter={(e) => ((e.target as HTMLElement).style.color = T.danger)}
                    onMouseLeave={(e) => ((e.target as HTMLElement).style.color = T.dim)}
                  >✕</button>
                </div>
                {exp.type && (
                  <div style={{ ...labelStyle, color: T.dim, marginBottom: 6 }}>
                    <span style={{ color: T.muted }}>Type:</span> {exp.type}
                  </div>
                )}
                {exp.targetWeakness && (
                  <div style={{ ...labelStyle, color: T.dim, marginBottom: 8 }}>
                    <span style={{ color: T.muted }}>Targets:</span> <span style={{ color: T.danger }}>{exp.targetWeakness}</span>
                  </div>
                )}
                {exp.impact && (
                  <p style={{ color: T.muted, fontSize: '0.78rem', lineHeight: 1.45, margin: '0 0 10px' }}>{exp.impact}</p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <ScoreBar score={exp.privacyScore} label="Privacy" color={T.teal} />
                  <ScoreBar score={exp.safetyScore} label="Safety" color={T.success} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Weakness Ledger Tab
// ═══════════════════════════════════════════════════════════════════

function WeaknessLedgerTab({ data, onUpdate }: { data: ChrysalisModel; onUpdate: (d: ChrysalisModel) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '',
    domain: '',
    severity: 'medium' as SeverityLevel,
    recurrence: 1,
    visibilityRisk: 0.5,
    proposedAction: '',
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const entry = { id: generateId(), ...form, title: form.title.trim(), domain: form.domain.trim(), proposedAction: form.proposedAction.trim() };
    onUpdate({ ...data, weaknessLedger: [entry, ...data.weaknessLedger] });
    setForm({ title: '', domain: '', severity: 'medium', recurrence: 1, visibilityRisk: 0.5, proposedAction: '' });
    setShowForm(false);
  }

  function handleRemove(id: string) {
    onUpdate({ ...data, weaknessLedger: data.weaknessLedger.filter((w) => w.id !== id) });
  }

  const sorted = [...data.weaknessLedger].sort(
    (a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity)
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ ...labelStyle, color: T.danger }}>Weakness Ledger</div>
          <div style={{ color: T.dim, fontSize: '0.75rem', marginTop: 2 }}>
            {data.weaknessLedger.filter((w) => w.severity === 'critical').length} critical ·{' '}
            {data.weaknessLedger.length} total
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '6px 14px',
            borderRadius: 5,
            border: '1px solid rgba(239,68,68,0.3)',
            background: showForm ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.07)',
            color: T.danger,
            ...labelStyle,
            cursor: 'pointer',
          }}
        >
          {showForm ? '✕ Cancel' : '+ Log Weakness'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleAdd}
          style={{
            background: T.panel,
            border: `1px solid rgba(239,68,68,0.18)`,
            borderRadius: 8,
            padding: 14,
            marginBottom: 16,
            animation: 'atlas-fade-in 300ms ease both',
          }}
        >
          <div className="chry-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelBlock}>Title</label>
              <input style={baseInput} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Weakness name..." required />
            </div>
            <div>
              <label style={labelBlock}>Domain</label>
              <input style={baseInput} value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="Which area..." />
            </div>
          </div>
          <label style={labelBlock}>Severity</label>
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            {SEV_ORDER.slice().reverse().map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setForm({ ...form, severity: s })}
                style={{
                  flex: 1,
                  padding: '5px 0',
                  borderRadius: 4,
                  border: `1px solid ${form.severity === s ? SEV_CONFIG[s].color.replace(/[\d.]+\)$/, '0.4)') : T.border}`,
                  background: form.severity === s ? SEV_CONFIG[s].color.replace(/[\d.]+\)$/, '0.12)') : T.inset,
                  color: form.severity === s ? SEV_CONFIG[s].color : T.dim,
                  ...labelStyle,
                  cursor: 'pointer',
                }}
              >
                {SEV_CONFIG[s].label}
              </button>
            ))}
          </div>
          <div className="chry-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ ...labelBlock }}>Recurrence: {form.recurrence}</label>
              <input type="range" min={1} max={20} step={1} value={form.recurrence}
                onChange={(e) => setForm({ ...form, recurrence: parseInt(e.target.value) })}
                style={{ width: '100%', accentColor: T.danger }} />
            </div>
            <div>
              <label style={{ ...labelBlock }}>Visibility Risk: {Math.round(form.visibilityRisk * 100)}%</label>
              <input type="range" min={0} max={1} step={0.01} value={form.visibilityRisk}
                onChange={(e) => setForm({ ...form, visibilityRisk: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: T.rose }} />
            </div>
          </div>
          <label style={labelBlock}>Proposed Action</label>
          <textarea style={baseTextarea} value={form.proposedAction} onChange={(e) => setForm({ ...form, proposedAction: e.target.value })} placeholder="Mitigation strategy..." />
          <button type="submit" style={{ marginTop: 12, width: '100%', padding: '8px 0', borderRadius: 5, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: T.danger, ...labelStyle, cursor: 'pointer' }}>
            Log Weakness
          </button>
        </form>
      )}

      {sorted.length === 0 ? (
        <div style={{ background: T.panel, border: `1px dashed ${T.border}`, borderRadius: 8, padding: '32px 20px', textAlign: 'center', color: T.dim, fontSize: '0.82rem' }}>
          No weaknesses logged. Track model failure modes and risk vectors here.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.map((w) => {
            const sev = SEV_CONFIG[w.severity];
            const isCritical = w.severity === 'critical';
            return (
              <div
                key={w.id}
                style={{
                  background: T.panel,
                  border: `1px solid ${sev.color.replace(/[\d.]+\)$/, '0.18)')}`,
                  borderRadius: 8,
                  padding: '12px 14px',
                  animation: 'atlas-fade-in 300ms ease both',
                  ...(isCritical ? { boxShadow: '0 0 0 1px rgba(239,68,68,0.1)' } : {}),
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      {isCritical && <PulsingDot />}
                      <span style={{ color: T.body, fontWeight: 700, fontSize: '0.88rem' }}>{w.title}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <StatusBadge color={sev.color} label={sev.label} />
                      {w.domain && (
                        <span style={{ ...labelStyle, color: T.muted, background: T.inset, border: `1px solid ${T.borderSubtle}`, borderRadius: 4, padding: '2px 6px' }}>
                          {w.domain}
                        </span>
                      )}
                      <span style={{ ...labelStyle, color: T.amber }}>
                        ×{w.recurrence}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(w.id)}
                    style={{ background: 'transparent', border: 'none', color: T.dim, cursor: 'pointer', padding: '1px 4px', fontSize: '0.7rem', flexShrink: 0 }}
                    onMouseEnter={(e) => ((e.target as HTMLElement).style.color = T.danger)}
                    onMouseLeave={(e) => ((e.target as HTMLElement).style.color = T.dim)}
                  >✕</button>
                </div>
                <ScoreBar score={w.visibilityRisk} label="Visibility Risk" color={T.rose} />
                {w.proposedAction && (
                  <div style={{ marginTop: 8 }}>
                    <span style={{ ...labelStyle, color: T.dim }}>Proposed Action: </span>
                    <span style={{ color: T.muted, fontSize: '0.78rem' }}>{w.proposedAction}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Model Comparisons Tab
// ═══════════════════════════════════════════════════════════════════

function ModelComparisonsTab({ data, onUpdate }: { data: ChrysalisModel; onUpdate: (d: ChrysalisModel) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [archName, setArchName] = useState('');
  const [archPerf, setArchPerf] = useState('');
  const [archPros, setArchPros] = useState('');
  const [archCons, setArchCons] = useState('');
  const [archPrivacy, setArchPrivacy] = useState(0.5);
  const [archElegance, setArchElegance] = useState(0.5);
  const [activeComparison, setActiveComparison] = useState<string | null>(null);

  const comparison = data.modelComparisons[0] ?? null;

  function toggleSelected(name: string) {
    if (!comparison) return;
    const updated = {
      ...comparison,
      architectures: comparison.architectures.map((a) => ({
        ...a,
        isSelected: a.name === name ? !a.isSelected : a.isSelected,
      })),
    };
    onUpdate({ ...data, modelComparisons: [updated, ...data.modelComparisons.slice(1)] });
  }

  function removeArch(name: string) {
    if (!comparison) return;
    const arches = comparison.architectures.filter((a) => a.name !== name);
    if (arches.length === 0) {
      onUpdate({ ...data, modelComparisons: data.modelComparisons.slice(1) });
    } else {
      onUpdate({ ...data, modelComparisons: [{ ...comparison, architectures: arches }, ...data.modelComparisons.slice(1)] });
    }
  }

  function handleAddArch(e: React.FormEvent) {
    e.preventDefault();
    if (!archName.trim()) return;
    const arch = {
      name: archName.trim(),
      performance: archPerf.trim(),
      pros: archPros.split('\n').map((p) => p.trim()).filter(Boolean),
      cons: archCons.split('\n').map((c) => c.trim()).filter(Boolean),
      privacyImpact: archPrivacy,
      elegance: archElegance,
      isSelected: false,
    };
    if (comparison) {
      onUpdate({ ...data, modelComparisons: [{ ...comparison, architectures: [...comparison.architectures, arch] }, ...data.modelComparisons.slice(1)] });
    } else {
      onUpdate({ ...data, modelComparisons: [{ id: generateId(), architectures: [arch] }] });
    }
    setArchName(''); setArchPerf(''); setArchPros(''); setArchCons(''); setArchPrivacy(0.5); setArchElegance(0.5);
    setShowForm(false);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ ...labelStyle, color: T.indigo }}>Architecture Comparisons</div>
          <div style={{ color: T.dim, fontSize: '0.75rem', marginTop: 2 }}>
            {comparison ? `${comparison.architectures.length} architectures · ${comparison.architectures.filter((a) => a.isSelected).length} selected` : 'No architectures'}
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '6px 14px',
            borderRadius: 5,
            border: '1px solid rgba(99,102,241,0.3)',
            background: showForm ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.07)',
            color: T.indigo,
            ...labelStyle,
            cursor: 'pointer',
          }}
        >
          {showForm ? '✕ Cancel' : '+ Add Architecture'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleAddArch}
          style={{
            background: T.panel,
            border: `1px solid rgba(99,102,241,0.18)`,
            borderRadius: 8,
            padding: 14,
            marginBottom: 16,
            animation: 'atlas-fade-in 300ms ease both',
          }}
        >
          <div className="chry-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelBlock}>Architecture Name</label>
              <input style={baseInput} value={archName} onChange={(e) => setArchName(e.target.value)} placeholder="e.g. Transformer-XL" required />
            </div>
            <div>
              <label style={labelBlock}>Performance</label>
              <input style={baseInput} value={archPerf} onChange={(e) => setArchPerf(e.target.value)} placeholder="e.g. 92% accuracy, 30ms p95" />
            </div>
          </div>
          <div className="chry-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelBlock}>Pros (one per line)</label>
              <textarea style={baseTextarea} value={archPros} onChange={(e) => setArchPros(e.target.value)} placeholder="Advantage 1&#10;Advantage 2..." />
            </div>
            <div>
              <label style={labelBlock}>Cons (one per line)</label>
              <textarea style={baseTextarea} value={archCons} onChange={(e) => setArchCons(e.target.value)} placeholder="Drawback 1&#10;Drawback 2..." />
            </div>
          </div>
          <div className="chry-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ ...labelBlock }}>Privacy Impact: {Math.round(archPrivacy * 100)}%</label>
              <input type="range" min={0} max={1} step={0.01} value={archPrivacy}
                onChange={(e) => setArchPrivacy(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: T.teal }} />
            </div>
            <div>
              <label style={{ ...labelBlock }}>Elegance: {Math.round(archElegance * 100)}%</label>
              <input type="range" min={0} max={1} step={0.01} value={archElegance}
                onChange={(e) => setArchElegance(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: T.violet }} />
            </div>
          </div>
          <button type="submit" style={{ marginTop: 12, width: '100%', padding: '8px 0', borderRadius: 5, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.1)', color: T.indigo, ...labelStyle, cursor: 'pointer' }}>
            Add Architecture
          </button>
        </form>
      )}

      {!comparison || comparison.architectures.length === 0 ? (
        <div style={{ background: T.panel, border: `1px dashed ${T.border}`, borderRadius: 8, padding: '32px 20px', textAlign: 'center', color: T.dim, fontSize: '0.82rem' }}>
          No architectures to compare. Add model architectures to compare their trade-offs side by side.
        </div>
      ) : (
        <div
          className="chry-compare-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(comparison.architectures.length, 3)}, 1fr)`,
            gap: 12,
          }}
        >
          {comparison.architectures.map((arch) => (
            <div
              key={arch.name}
              style={{
                background: T.panel,
                border: arch.isSelected
                  ? `1px solid rgba(201,162,39,0.5)`
                  : `1px solid ${T.border}`,
                borderRadius: 10,
                padding: '14px',
                animation: 'atlas-fade-in 300ms ease both',
                position: 'relative',
                ...(arch.isSelected ? { boxShadow: '0 0 0 1px rgba(201,162,39,0.15)' } : {}),
              }}
            >
              {/* Selected badge */}
              {arch.isSelected && (
                <div
                  style={{
                    position: 'absolute',
                    top: -1,
                    right: 12,
                    ...labelStyle,
                    color: T.gold,
                    background: 'rgba(201,162,39,0.15)',
                    border: '1px solid rgba(201,162,39,0.35)',
                    borderTop: 'none',
                    borderRadius: '0 0 6px 6px',
                    padding: '2px 8px',
                    fontSize: '0.58rem',
                  }}
                >
                  Selected
                </div>
              )}

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, marginTop: arch.isSelected ? 12 : 0 }}>
                <span style={{ color: arch.isSelected ? T.gold : T.body, fontWeight: 700, fontSize: '0.9rem' }}>{arch.name}</span>
                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                  <button
                    onClick={() => toggleSelected(arch.name)}
                    title={arch.isSelected ? 'Deselect' : 'Select'}
                    style={{
                      background: arch.isSelected ? 'rgba(201,162,39,0.15)' : T.inset,
                      border: `1px solid ${arch.isSelected ? 'rgba(201,162,39,0.35)' : T.border}`,
                      borderRadius: 4,
                      color: arch.isSelected ? T.gold : T.dim,
                      cursor: 'pointer',
                      padding: '2px 6px',
                      fontSize: '0.72rem',
                    }}
                  >★</button>
                  <button
                    onClick={() => removeArch(arch.name)}
                    style={{ background: 'transparent', border: 'none', color: T.dim, cursor: 'pointer', padding: '1px 4px', fontSize: '0.7rem' }}
                    onMouseEnter={(e) => ((e.target as HTMLElement).style.color = T.danger)}
                    onMouseLeave={(e) => ((e.target as HTMLElement).style.color = T.dim)}
                  >✕</button>
                </div>
              </div>

              {arch.performance && (
                <div
                  style={{
                    ...labelStyle,
                    color: T.muted,
                    background: T.inset,
                    border: `1px solid ${T.borderSubtle}`,
                    borderRadius: 5,
                    padding: '5px 8px',
                    fontSize: '0.72rem',
                    marginBottom: 10,
                  }}
                >
                  {arch.performance}
                </div>
              )}

              {/* Pros */}
              {arch.pros.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ ...labelStyle, color: T.success, marginBottom: 4 }}>Pros</div>
                  {arch.pros.map((p, i) => (
                    <div key={i} style={{ display: 'flex', gap: 5, marginBottom: 3 }}>
                      <span style={{ color: T.success, fontSize: '0.7rem', marginTop: 2 }}>+</span>
                      <span style={{ color: T.muted, fontSize: '0.78rem', lineHeight: 1.45 }}>{p}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Cons */}
              {arch.cons.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ ...labelStyle, color: T.danger, marginBottom: 4 }}>Cons</div>
                  {arch.cons.map((c, i) => (
                    <div key={i} style={{ display: 'flex', gap: 5, marginBottom: 3 }}>
                      <span style={{ color: T.danger, fontSize: '0.7rem', marginTop: 2 }}>–</span>
                      <span style={{ color: T.muted, fontSize: '0.78rem', lineHeight: 1.45 }}>{c}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Score bars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <ScoreBar score={arch.privacyImpact} label="Privacy Impact" color={T.teal} />
                <ScoreBar score={arch.elegance} label="Elegance" color={T.violet} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Main ChrysalisChamber
// ═══════════════════════════════════════════════════════════════════

const TABS: { id: Tab; label: string; color: string }[] = [
  { id: 'upgrades',    label: 'Upgrades',    color: 'rgba(34,197,94,0.7)'   },
  { id: 'experiments', label: 'Experiments', color: 'rgba(234,179,8,0.7)'   },
  { id: 'weaknesses',  label: 'Weaknesses',  color: 'rgba(239,68,68,0.75)'  },
  { id: 'comparisons', label: 'Comparisons', color: 'rgba(99,102,241,0.7)'  },
];

export default function ChrysalisChamber() {
  const chrysalisStore = useAtlasStore((s) => (s as any).chrysalis) as ChrysalisModel | undefined;
  const [model, setModel] = useState<ChrysalisModel>(chrysalisStore ?? EMPTY_MODEL);
  const [activeTab, setActiveTab] = useState<Tab>('upgrades');

  const activeTabConfig = TABS.find((t) => t.id === activeTab)!;

  return (
    <div
      className="chry-chamber"
      style={{
        minHeight: '100%',
        background: '#050505',
        padding: 24,
        fontFamily: 'inherit',
        animation: 'atlas-fade-in 300ms ease both',
      }}
    >
      <style>{`
        @media (max-width: 640px) {
          .chry-chamber { padding: 14px !important; }
          .chry-stats { gap: 14px !important; padding: 10px 12px !important; }
          .chry-tabs {
            overflow-x: auto !important;
            flex-wrap: nowrap !important;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
          }
          .chry-tabs::-webkit-scrollbar { display: none; }
          .chry-tabs > button {
            flex-shrink: 0 !important;
            padding: 9px 12px !important;
          }
          .chry-grid-2 { grid-template-columns: 1fr !important; }
          .chry-panel-pad { padding: 12px !important; }
          .chry-compare-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ color: T.violet, fontWeight: 700, fontSize: '1.15rem', margin: '0 0 4px' }}>
          Chrysalis Chamber
        </h2>
        <p style={{ color: T.muted, fontSize: '0.8rem', margin: 0 }}>
          Track model evolution — upgrades, experiments, weakness ledger, and architecture comparisons.
        </p>
      </div>

      {/* Stats bar */}
      <div
        className="chry-stats"
        style={{
          display: 'flex',
          gap: 20,
          flexWrap: 'wrap',
          padding: '10px 16px',
          background: T.panel,
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          marginBottom: 20,
        }}
      >
        <div>
          <div style={{ ...labelStyle, color: T.dim }}>Upgrades</div>
          <div style={{ color: T.success, fontWeight: 700, fontSize: '1rem', marginTop: 1 }}>
            {model.implementedUpgrades.length}
          </div>
        </div>
        <div>
          <div style={{ ...labelStyle, color: T.dim }}>Experiments</div>
          <div style={{ color: T.amber, fontWeight: 700, fontSize: '1rem', marginTop: 1 }}>
            {model.experiments.length}
          </div>
        </div>
        <div>
          <div style={{ ...labelStyle, color: T.dim }}>Running</div>
          <div style={{ color: T.amber, fontWeight: 700, fontSize: '1rem', marginTop: 1 }}>
            {model.experiments.filter((e) => e.status === 'running').length}
          </div>
        </div>
        <div>
          <div style={{ ...labelStyle, color: T.dim }}>Critical Weaknesses</div>
          <div style={{ color: T.danger, fontWeight: 700, fontSize: '1rem', marginTop: 1 }}>
            {model.weaknessLedger.filter((w) => w.severity === 'critical').length}
          </div>
        </div>
        <div>
          <div style={{ ...labelStyle, color: T.dim }}>Total Weaknesses</div>
          <div style={{ color: T.muted, fontWeight: 700, fontSize: '1rem', marginTop: 1 }}>
            {model.weaknessLedger.length}
          </div>
        </div>
        <div>
          <div style={{ ...labelStyle, color: T.dim }}>Architectures</div>
          <div style={{ color: T.indigo, fontWeight: 700, fontSize: '1rem', marginTop: 1 }}>
            {model.modelComparisons[0]?.architectures.length ?? 0}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div
        className="chry-tabs"
        style={{
          display: 'flex',
          gap: 2,
          borderBottom: `1px solid ${T.borderSubtle}`,
          marginBottom: 20,
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...labelStyle,
              padding: '9px 18px',
              borderRadius: '6px 6px 0 0',
              border: '1px solid transparent',
              borderBottom: activeTab === tab.id ? `2px solid ${tab.color}` : '1px solid transparent',
              background:
                activeTab === tab.id
                  ? tab.color.replace(/[\d.]+\)$/, '0.08)')
                  : 'transparent',
              color: activeTab === tab.id ? tab.color : T.dim,
              cursor: 'pointer',
              transition: 'all 0.15s',
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ animation: 'atlas-fade-in 300ms ease both' }}>
        {activeTab === 'upgrades' && (
          <UpgradesTab data={model} onUpdate={setModel} />
        )}
        {activeTab === 'experiments' && (
          <ExperimentsTab data={model} onUpdate={setModel} />
        )}
        {activeTab === 'weaknesses' && (
          <WeaknessLedgerTab data={model} onUpdate={setModel} />
        )}
        {activeTab === 'comparisons' && (
          <ModelComparisonsTab data={model} onUpdate={setModel} />
        )}
      </div>
    </div>
  );
}
