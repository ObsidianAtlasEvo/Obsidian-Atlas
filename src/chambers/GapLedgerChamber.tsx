import React, { useState } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { generateId, nowISO } from '../lib/persistence';

// ─── Types ────────────────────────────────────────────────────────────────────

type GapType =
  | 'bug'
  | 'logic_failure'
  | 'privacy_risk'
  | 'security_weakness'
  | 'latency_bottleneck'
  | 'structural_gap';

type GapSeverity = 'low' | 'medium' | 'high' | 'critical';

type GapStatus =
  | 'identified'
  | 'suspected'
  | 'investigating'
  | 'repair_proposed'
  | 'repaired'
  | 'failed_repair';

interface Gap {
  id: string;
  title: string;
  description: string;
  type: GapType;
  severity: GapSeverity;
  status: GapStatus;
  detectedAt: string;
  repairedAt?: string;
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  body:    '#050505',
  panel:   'rgba(15,10,30,0.55)',
  inset:   'rgba(5,5,8,0.72)',
  border:  'rgba(88,28,135,0.14)',
  borderS: 'rgba(88,28,135,0.1)',
  text:    'rgba(226,232,240,0.92)',
  muted:   'rgba(226,232,240,0.55)',
  dim:     'rgba(226,232,240,0.3)',
  gold:    'rgba(201,162,39,0.9)',
  violet:  'rgba(167,139,250,0.85)',
  danger:  'rgba(239,68,68,0.75)',
  success: 'rgba(34,197,94,0.7)',
  indigo:  'rgba(99,102,241,0.7)',
  amber:   'rgba(234,179,8,0.7)',
  teal:    'rgba(6,182,212,0.7)',
};

const LABEL: React.CSSProperties = {
  fontSize: '0.62rem',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: C.muted,
};

const PANEL: React.CSSProperties = {
  background: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: '20px 24px',
};

const INSET: React.CSSProperties = {
  background: C.inset,
  border: `1px solid ${C.borderS}`,
  borderRadius: 8,
};

const FADE: React.CSSProperties = { animation: 'atlas-fade-in 300ms ease both' };

// ─── Color maps ───────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<GapType, string> = {
  bug:                C.danger,
  logic_failure:      C.amber,
  privacy_risk:       C.violet,
  security_weakness:  C.danger,
  latency_bottleneck: C.teal,
  structural_gap:     C.indigo,
};

const TYPE_LABEL: Record<GapType, string> = {
  bug:                'Bug',
  logic_failure:      'Logic Failure',
  privacy_risk:       'Privacy Risk',
  security_weakness:  'Security Weakness',
  latency_bottleneck: 'Latency Bottleneck',
  structural_gap:     'Structural Gap',
};

const SEV_COLOR: Record<GapSeverity, string> = {
  low:      C.teal,
  medium:   C.amber,
  high:     C.danger,
  critical: C.danger,
};

const STATUS_COLOR: Record<GapStatus, string> = {
  identified:     C.muted,
  suspected:      C.amber,
  investigating:  C.indigo,
  repair_proposed: C.teal,
  repaired:       C.success,
  failed_repair:  C.danger,
};

const STATUS_PROGRESSION: GapStatus[] = [
  'identified', 'suspected', 'investigating', 'repair_proposed', 'repaired',
];

const STATUS_LABEL: Record<GapStatus, string> = {
  identified:     'Identified',
  suspected:      'Suspected',
  investigating:  'Investigating',
  repair_proposed: 'Repair Proposed',
  repaired:       'Repaired',
  failed_repair:  'Failed Repair',
};

// ─── Sample data ──────────────────────────────────────────────────────────────

const SEED_GAPS: Gap[] = [
  {
    id: 'gap-001',
    title: 'Auth token not rotated after privilege escalation',
    description: 'When a user is promoted to admin, their existing session token retains old claims until expiry.',
    type: 'security_weakness',
    severity: 'high',
    status: 'investigating',
    detectedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: 'gap-002',
    title: 'Memory retrieval returns stale embeddings',
    description: 'The semantic search index is not invalidated when a memory is updated, leading to stale similarity matches.',
    type: 'logic_failure',
    severity: 'medium',
    status: 'repair_proposed',
    detectedAt: new Date(Date.now() - 86400000 * 7).toISOString(),
  },
  {
    id: 'gap-003',
    title: 'PII included in debug log output',
    description: 'User email addresses and UIDs appear in unmasked form in debug-level logs.',
    type: 'privacy_risk',
    severity: 'critical',
    status: 'identified',
    detectedAt: new Date(Date.now() - 3600000).toISOString(),
  },
];

// ─── Badge helpers ────────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      background: `${color}1A`,
      border: `1px solid ${color}44`,
      borderRadius: 5,
      color,
      fontSize: '0.63rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      padding: '2px 8px',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function FilterPill({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `${color}22` : 'transparent',
        border: `1px solid ${active ? color + '55' : C.borderS}`,
        borderRadius: 20,
        color: active ? color : C.muted,
        cursor: 'pointer',
        fontSize: '0.72rem',
        fontWeight: active ? 700 : 500,
        padding: '5px 13px',
        transition: 'all 150ms',
        letterSpacing: '0.04em',
      }}
    >
      {label}
    </button>
  );
}

// ─── Gap Card ─────────────────────────────────────────────────────────────────

function GapCard({ gap, onAdvance }: { gap: Gap; onAdvance: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const nextIdx = STATUS_PROGRESSION.indexOf(gap.status as any);
  const nextStatus = nextIdx < STATUS_PROGRESSION.length - 1 ? STATUS_PROGRESSION[nextIdx + 1] : null;

  return (
    <div
      style={{
        ...INSET,
        padding: '16px 18px',
        cursor: 'pointer',
        transition: 'border-color 200ms',
        borderColor: open ? 'rgba(88,28,135,0.3)' : C.borderS,
      }}
      onClick={() => setOpen(o => !o)}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: C.text, fontWeight: 600, fontSize: '0.88rem', marginBottom: 8 }}>
            {gap.title}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <Badge label={TYPE_LABEL[gap.type]} color={TYPE_COLOR[gap.type]} />
            <Badge label={gap.severity} color={SEV_COLOR[gap.severity]} />
            <Badge label={STATUS_LABEL[gap.status]} color={STATUS_COLOR[gap.status]} />
          </div>
        </div>
        <div style={{
          color: C.dim,
          fontSize: '0.7rem',
          flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 200ms',
          marginTop: 2,
        }}>
          ▼
        </div>
      </div>

      {/* Expanded */}
      {open && (
        <div style={{ marginTop: 14, ...FADE }} onClick={e => e.stopPropagation()}>
          <div style={{ color: C.muted, fontSize: '0.82rem', lineHeight: 1.65, marginBottom: 14 }}>
            {gap.description}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={LABEL}>Detected</div>
              <div style={{ color: C.muted, fontSize: '0.8rem', marginTop: 3 }}>
                {new Date(gap.detectedAt).toLocaleString()}
              </div>
            </div>
            {gap.repairedAt && (
              <div style={{ flex: 1 }}>
                <div style={LABEL}>Repaired</div>
                <div style={{ color: C.success, fontSize: '0.8rem', marginTop: 3 }}>
                  {new Date(gap.repairedAt).toLocaleString()}
                </div>
              </div>
            )}
          </div>
          {nextStatus && gap.status !== 'repaired' && gap.status !== 'failed_repair' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => onAdvance(gap.id)}
                style={{
                  background: `${STATUS_COLOR[nextStatus]}18`,
                  border: `1px solid ${STATUS_COLOR[nextStatus]}44`,
                  borderRadius: 7,
                  color: STATUS_COLOR[nextStatus],
                  cursor: 'pointer',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  padding: '7px 16px',
                  transition: 'background 150ms',
                }}
              >
                → Advance to {STATUS_LABEL[nextStatus]}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Add Gap Form ─────────────────────────────────────────────────────────────

const GAP_TYPES: GapType[] = [
  'bug', 'logic_failure', 'privacy_risk', 'security_weakness', 'latency_bottleneck', 'structural_gap',
];
const GAP_SEVERITIES: GapSeverity[] = ['low', 'medium', 'high', 'critical'];

function AddGapForm({ onAdd }: { onAdd: (g: Gap) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [type, setType] = useState<GapType>('bug');
  const [severity, setSeverity] = useState<GapSeverity>('medium');

  const submit = () => {
    if (!title.trim()) return;
    onAdd({
      id: generateId(),
      title: title.trim(),
      description: desc.trim(),
      type,
      severity,
      status: 'identified',
      detectedAt: nowISO(),
    });
    setTitle(''); setDesc('');
    setOpen(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: C.inset,
    border: `1px solid ${C.border}`,
    borderRadius: 7,
    color: C.text,
    fontSize: '0.84rem',
    padding: '10px 12px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: 'rgba(88,28,135,0.12)',
          border: `1px dashed rgba(88,28,135,0.35)`,
          borderRadius: 10,
          color: C.violet,
          cursor: 'pointer',
          fontSize: '0.82rem',
          fontWeight: 600,
          padding: '14px',
          width: '100%',
          letterSpacing: '0.04em',
          transition: 'background 150ms',
        }}
      >
        + Report New Gap
      </button>
    );
  }

  return (
    <div style={{ ...PANEL, ...FADE }}>
      <div style={{ ...LABEL, marginBottom: 16 }}>Report New Gap</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ ...LABEL, marginBottom: 6 }}>Title</div>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Short descriptive title..."
            style={inputStyle}
          />
        </div>
        <div>
          <div style={{ ...LABEL, marginBottom: 6 }}>Description</div>
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Detailed description of the gap..."
            style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ ...LABEL, marginBottom: 6 }}>Type</div>
            <select value={type} onChange={e => setType(e.target.value as GapType)} style={selectStyle}>
              {GAP_TYPES.map(t => (
                <option key={t} value={t}>{TYPE_LABEL[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ ...LABEL, marginBottom: 6 }}>Severity</div>
            <select value={severity} onChange={e => setSeverity(e.target.value as GapSeverity)} style={selectStyle}>
              {GAP_SEVERITIES.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'transparent',
              border: `1px solid ${C.borderS}`,
              borderRadius: 7,
              color: C.muted,
              cursor: 'pointer',
              fontSize: '0.78rem',
              padding: '8px 16px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            style={{
              background: 'rgba(88,28,135,0.22)',
              border: `1px solid rgba(88,28,135,0.45)`,
              borderRadius: 7,
              color: C.violet,
              cursor: 'pointer',
              fontSize: '0.78rem',
              fontWeight: 600,
              padding: '8px 20px',
              opacity: title.trim() ? 1 : 0.4,
            }}
          >
            Submit Gap
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GapLedgerChamber() {
  const [gaps, setGaps] = useState<Gap[]>(SEED_GAPS);
  const [severityFilter, setSeverityFilter] = useState<GapSeverity | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<GapStatus | 'all'>('all');

  const addGap = (g: Gap) => setGaps(prev => [g, ...prev]);

  const advanceStatus = (id: string) => {
    setGaps(prev => prev.map(g => {
      if (g.id !== id) return g;
      const idx = STATUS_PROGRESSION.indexOf(g.status as any);
      if (idx < 0 || idx >= STATUS_PROGRESSION.length - 1) return g;
      const next = STATUS_PROGRESSION[idx + 1];
      return { ...g, status: next, ...(next === 'repaired' ? { repairedAt: nowISO() } : {}) };
    }));
  };

  const filtered = gaps.filter(g => {
    if (severityFilter !== 'all' && g.severity !== severityFilter) return false;
    if (statusFilter !== 'all' && g.status !== statusFilter) return false;
    return true;
  });

  // Stats
  const sevCounts = GAP_SEVERITIES.reduce((acc, s) => ({ ...acc, [s]: gaps.filter(g => g.severity === s).length }), {} as Record<GapSeverity, number>);
  const staCount = (Object.keys(STATUS_LABEL) as GapStatus[]).reduce((acc, s) => ({ ...acc, [s]: gaps.filter(g => g.status === s).length }), {} as Record<GapStatus, number>);

  return (
    <div style={{
      minHeight: '100vh',
      background: C.body,
      color: C.text,
      fontFamily: "'Inter', system-ui, sans-serif",
      padding: '32px 28px',
      boxSizing: 'border-box',
      maxWidth: 920,
      margin: '0 auto',
    }}>
      <style>{`
        @keyframes atlas-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28, ...FADE }}>
        <div style={{ ...LABEL, color: C.gold, marginBottom: 4 }}>Sovereign Creator</div>
        <h1 style={{ margin: 0, fontSize: '1.55rem', fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>
          Gap Ledger
        </h1>
        <div style={{ color: C.muted, fontSize: '0.8rem', marginTop: 4 }}>
          Track, triage, and resolve system gaps and structural vulnerabilities
        </div>
      </div>

      {/* Stats */}
      <div style={{ ...PANEL, marginBottom: 20, ...FADE }}>
        <div style={{ ...LABEL, marginBottom: 14 }}>Summary</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ ...INSET, padding: '12px 16px', flex: 1, minWidth: 80 }}>
            <div style={LABEL}>Total</div>
            <div style={{ color: C.gold, fontWeight: 700, fontSize: '1.4rem', marginTop: 4 }}>{gaps.length}</div>
          </div>
          {GAP_SEVERITIES.map(s => (
            <div key={s} style={{ ...INSET, padding: '12px 16px', flex: 1, minWidth: 80 }}>
              <div style={{ ...LABEL, color: SEV_COLOR[s] }}>{s}</div>
              <div style={{ color: SEV_COLOR[s], fontWeight: 700, fontSize: '1.4rem', marginTop: 4 }}>
                {sevCounts[s] ?? 0}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(Object.keys(STATUS_LABEL) as GapStatus[]).map(s => (
            <div key={s} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: `${STATUS_COLOR[s]}10`,
              border: `1px solid ${STATUS_COLOR[s]}30`,
              borderRadius: 20,
              padding: '4px 12px',
            }}>
              <span style={{ color: STATUS_COLOR[s], fontSize: '0.72rem', fontWeight: 600 }}>
                {STATUS_LABEL[s]}
              </span>
              <span style={{ color: STATUS_COLOR[s], fontWeight: 800, fontSize: '0.78rem' }}>
                {staCount[s] ?? 0}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20, ...FADE }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ ...LABEL, marginRight: 4 }}>Severity</div>
          <FilterPill label="All" active={severityFilter === 'all'} color={C.violet} onClick={() => setSeverityFilter('all')} />
          {GAP_SEVERITIES.map(s => (
            <FilterPill key={s} label={s} active={severityFilter === s} color={SEV_COLOR[s]} onClick={() => setSeverityFilter(s)} />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ ...LABEL, marginRight: 4 }}>Status</div>
          <FilterPill label="All" active={statusFilter === 'all'} color={C.violet} onClick={() => setStatusFilter('all')} />
          {(Object.keys(STATUS_LABEL) as GapStatus[]).map(s => (
            <FilterPill key={s} label={STATUS_LABEL[s]} active={statusFilter === s} color={STATUS_COLOR[s]} onClick={() => setStatusFilter(s)} />
          ))}
        </div>
      </div>

      {/* Gap list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {filtered.length === 0 ? (
          <div style={{ ...INSET, padding: '32px', textAlign: 'center', color: C.muted, fontSize: '0.84rem' }}>
            No gaps match the current filters.
          </div>
        ) : (
          filtered.map(g => <GapCard key={g.id} gap={g} onAdvance={advanceStatus} />)
        )}
      </div>

      {/* Add form */}
      <AddGapForm onAdd={addGap} />
    </div>
  );
}
