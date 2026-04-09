import React, { useState } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { generateId, nowISO } from '../lib/persistence';

// TODO: Add store actions: addMilestone, addIdentityDiff, addRecurringLoop, etc. to useAtlasStore

interface GrowthMilestone {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  category: 'belief' | 'skill' | 'behavior' | 'strategic';
  impact: number;
}

interface IdentityDiff {
  id: string;
  timestamp: string;
  field: string;
  oldValue: any;
  newValue: any;
  significance: 'low' | 'medium' | 'high';
  context?: string;
}

interface RecurringLoop {
  id: string;
  title: string;
  description: string;
  frequency: number;
  lastSeen: string;
  status: 'active' | 'broken' | 'monitored';
}

interface EvolutionTimeline {
  milestones: GrowthMilestone[];
  identityDiffs: IdentityDiff[];
  recurringLoops: RecurringLoop[];
}

const C = {
  body: '#050505',
  panel: 'rgba(15,10,30,0.55)',
  inset: 'rgba(5,5,8,0.72)',
  border: 'rgba(88,28,135,0.14)',
  borderSubtle: 'rgba(88,28,135,0.1)',
  text: 'rgba(226,232,240,0.92)',
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
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.62rem',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: C.dim,
};

const categoryColor: Record<GrowthMilestone['category'], string> = {
  belief: C.violet,
  skill: C.teal,
  behavior: C.amber,
  strategic: C.gold,
};

const significanceColor: Record<IdentityDiff['significance'], string> = {
  low: C.dim,
  medium: C.amber,
  high: C.danger,
};

const loopStatusColor: Record<RecurringLoop['status'], string> = {
  active: C.success,
  broken: C.danger,
  monitored: C.amber,
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d}d ago`;
  const m = Math.floor(d / 30);
  if (m < 12) return `${m}mo ago`;
  return `${Math.floor(m / 12)}y ago`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

const SEED: EvolutionTimeline = {
  milestones: [
    { id: 'm-1', title: 'Shifted from execution to leverage', description: 'Recognized that effort alone cannot scale — began building systems.', timestamp: '2024-03-15T00:00:00Z', category: 'strategic', impact: 0.9 },
    { id: 'm-2', title: 'Developed deep listening', description: 'Started noticing subtext in conversations rather than surface content.', timestamp: '2024-06-01T00:00:00Z', category: 'skill', impact: 0.7 },
    { id: 'm-3', title: 'Released need for approval', description: 'Stopped anchoring decisions to external validation.', timestamp: '2024-09-10T00:00:00Z', category: 'belief', impact: 0.85 },
  ],
  identityDiffs: [
    { id: 'd-1', timestamp: '2024-07-01T00:00:00Z', field: 'Risk tolerance', oldValue: 'Low — preferred certainty', newValue: 'Calibrated — accepts asymmetric bets', significance: 'high', context: 'After watching multiple optionality-seekers succeed' },
    { id: 'd-2', timestamp: '2024-10-15T00:00:00Z', field: 'Communication style', oldValue: 'Verbose and justifying', newValue: 'Precise and assertive', significance: 'medium' },
  ],
  recurringLoops: [
    { id: 'l-1', title: 'Overcommitment spiral', description: 'Takes on excess responsibility then retreats when overwhelmed.', frequency: 4, lastSeen: '2024-11-20T00:00:00Z', status: 'monitored' },
    { id: 'l-2', title: 'Perfectionism gate', description: 'Delays shipping until conditions are ideal — which never arrive.', frequency: 7, lastSeen: '2025-01-05T00:00:00Z', status: 'active' },
  ],
};

type Tab = 'milestones' | 'diffs' | 'loops';

export default function ContinuityChamber() {
  const storeData = useAtlasStore((s) => s.evolutionTimeline) as EvolutionTimeline | undefined;
  // TODO: Replace local state with store actions once CRUD is implemented
  const [data, setData] = useState<EvolutionTimeline>({
    milestones: storeData?.milestones?.length ? storeData.milestones : SEED.milestones,
    identityDiffs: storeData?.identityDiffs?.length ? storeData.identityDiffs : SEED.identityDiffs,
    recurringLoops: storeData?.recurringLoops?.length ? storeData.recurringLoops : SEED.recurringLoops,
  });
  const [tab, setTab] = useState<Tab>('milestones');
  const [showAddForm, setShowAddForm] = useState(false);

  // Milestone form state
  const [mTitle, setMTitle] = useState('');
  const [mDesc, setMDesc] = useState('');
  const [mCat, setMCat] = useState<GrowthMilestone['category']>('strategic');
  const [mImpact, setMImpact] = useState(0.7);

  // Diff form state
  const [dField, setDField] = useState('');
  const [dOld, setDOld] = useState('');
  const [dNew, setDNew] = useState('');
  const [dSig, setDSig] = useState<IdentityDiff['significance']>('medium');
  const [dCtx, setDCtx] = useState('');

  // Loop form state
  const [lTitle, setLTitle] = useState('');
  const [lDesc, setLDesc] = useState('');
  const [lFreq, setLFreq] = useState(3);
  const [lStatus, setLStatus] = useState<RecurringLoop['status']>('active');

  const addMilestone = () => {
    if (!mTitle.trim()) return;
    const m: GrowthMilestone = { id: generateId(), title: mTitle.trim(), description: mDesc.trim(), timestamp: nowISO(), category: mCat, impact: mImpact };
    setData((d) => ({ ...d, milestones: [m, ...d.milestones] }));
    setMTitle(''); setMDesc(''); setMImpact(0.7); setShowAddForm(false);
  };

  const addDiff = () => {
    if (!dField.trim()) return;
    const d: IdentityDiff = { id: generateId(), timestamp: nowISO(), field: dField.trim(), oldValue: dOld.trim(), newValue: dNew.trim(), significance: dSig, context: dCtx.trim() || undefined };
    setData((prev) => ({ ...prev, identityDiffs: [d, ...prev.identityDiffs] }));
    setDField(''); setDOld(''); setDNew(''); setDCtx(''); setShowAddForm(false);
  };

  const addLoop = () => {
    if (!lTitle.trim()) return;
    const l: RecurringLoop = { id: generateId(), title: lTitle.trim(), description: lDesc.trim(), frequency: lFreq, lastSeen: nowISO(), status: lStatus };
    setData((d) => ({ ...d, recurringLoops: [l, ...d.recurringLoops] }));
    setLTitle(''); setLDesc(''); setLFreq(3); setShowAddForm(false);
  };

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'milestones', label: 'Milestones', count: data.milestones.length },
    { key: 'diffs', label: 'Identity Diffs', count: data.identityDiffs.length },
    { key: 'loops', label: 'Recurring Loops', count: data.recurringLoops.length },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.body, color: C.text, fontFamily: 'inherit', animation: 'atlas-fade-in 300ms ease both', minHeight: 0 }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', borderBottom: `1px solid ${C.border}`, background: C.panel, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 2, flex: 1 }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setShowAddForm(false); }}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: tab === t.key ? `2px solid ${C.violet}` : '2px solid transparent',
                color: tab === t.key ? C.violet : C.muted,
                padding: '14px 16px 12px',
                fontSize: '0.8rem',
                fontWeight: tab === t.key ? 600 : 400,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'color 150ms',
              }}
            >
              {t.label}
              <span style={{
                background: tab === t.key ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.05)',
                color: tab === t.key ? C.violet : C.dim,
                borderRadius: 10,
                padding: '1px 6px',
                fontSize: '0.68rem',
                fontWeight: 600,
              }}>{t.count}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          style={{ background: 'rgba(88,28,135,0.18)', border: `1px solid ${C.border}`, color: C.violet, borderRadius: 5, padding: '5px 12px', fontSize: '0.75rem', cursor: 'pointer' }}
        >
          {showAddForm ? '✕ Cancel' : '+ Add'}
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {/* Add forms */}
        {showAddForm && tab === 'milestones' && (
          <div style={{ background: C.inset, border: `1px solid ${C.border}`, borderRadius: 8, padding: 18, marginBottom: 20 }}>
            <div style={{ ...labelStyle, marginBottom: 12 }}>New Milestone</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
              <div>
                <div style={{ ...labelStyle, marginBottom: 4 }}>Title</div>
                <input value={mTitle} onChange={(e) => setMTitle(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <div style={{ ...labelStyle, marginBottom: 4 }}>Category</div>
                <select value={mCat} onChange={(e) => setMCat(e.target.value as any)} style={selectStyle}>
                  {(['belief', 'skill', 'behavior', 'strategic'] as const).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ ...labelStyle, marginBottom: 4 }}>Description</div>
              <textarea value={mDesc} onChange={(e) => setMDesc(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical', width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={labelStyle}>Impact</span>
              <input type="range" min={0} max={1} step={0.01} value={mImpact} onChange={(e) => setMImpact(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ color: C.gold, fontWeight: 600, fontSize: '0.85rem', minWidth: 36 }}>{Math.round(mImpact * 100)}%</span>
            </div>
            <button onClick={addMilestone} style={submitBtn}>Add Milestone</button>
          </div>
        )}

        {showAddForm && tab === 'diffs' && (
          <div style={{ background: C.inset, border: `1px solid ${C.border}`, borderRadius: 8, padding: 18, marginBottom: 20 }}>
            <div style={{ ...labelStyle, marginBottom: 12 }}>New Identity Diff</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
              <div>
                <div style={{ ...labelStyle, marginBottom: 4 }}>Field</div>
                <input value={dField} onChange={(e) => setDField(e.target.value)} placeholder="e.g. Risk tolerance" style={inputStyle} />
              </div>
              <div>
                <div style={{ ...labelStyle, marginBottom: 4 }}>Significance</div>
                <select value={dSig} onChange={(e) => setDSig(e.target.value as any)} style={selectStyle}>
                  {(['low', 'medium', 'high'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
              <div>
                <div style={{ ...labelStyle, marginBottom: 4 }}>Before</div>
                <input value={dOld} onChange={(e) => setDOld(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <div style={{ ...labelStyle, marginBottom: 4 }}>After</div>
                <input value={dNew} onChange={(e) => setDNew(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ ...labelStyle, marginBottom: 4 }}>Context (optional)</div>
              <input value={dCtx} onChange={(e) => setDCtx(e.target.value)} style={inputStyle} />
            </div>
            <button onClick={addDiff} style={submitBtn}>Add Diff</button>
          </div>
        )}

        {showAddForm && tab === 'loops' && (
          <div style={{ background: C.inset, border: `1px solid ${C.border}`, borderRadius: 8, padding: 18, marginBottom: 20 }}>
            <div style={{ ...labelStyle, marginBottom: 12 }}>New Recurring Loop</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
              <div>
                <div style={{ ...labelStyle, marginBottom: 4 }}>Title</div>
                <input value={lTitle} onChange={(e) => setLTitle(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <div style={{ ...labelStyle, marginBottom: 4 }}>Status</div>
                <select value={lStatus} onChange={(e) => setLStatus(e.target.value as any)} style={selectStyle}>
                  {(['active', 'broken', 'monitored'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ ...labelStyle, marginBottom: 4 }}>Description</div>
              <textarea value={lDesc} onChange={(e) => setLDesc(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical', width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={labelStyle}>Frequency</span>
              <input type="range" min={1} max={20} step={1} value={lFreq} onChange={(e) => setLFreq(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ color: C.rose, fontWeight: 600, fontSize: '0.85rem', minWidth: 24 }}>{lFreq}×</span>
            </div>
            <button onClick={addLoop} style={submitBtn}>Add Loop</button>
          </div>
        )}

        {/* Milestones tab */}
        {tab === 'milestones' && (
          <div style={{ position: 'relative', paddingLeft: 24 }}>
            {/* Vertical timeline line */}
            <div style={{ position: 'absolute', left: 7, top: 12, bottom: 12, width: 2, background: `linear-gradient(180deg, ${C.violet}, transparent)`, opacity: 0.3 }} />
            {data.milestones.map((m) => {
              const cc = categoryColor[m.category];
              return (
                <div key={m.id} style={{ position: 'relative', marginBottom: 20 }}>
                  {/* Timeline dot */}
                  <div style={{ position: 'absolute', left: -24 + 4, top: 16, width: 10, height: 10, borderRadius: '50%', background: cc, boxShadow: `0 0 8px ${cc}` }} />
                  <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '0.88rem', fontWeight: 600, color: C.text }}>{m.title}</span>
                        <span style={{
                          marginLeft: 10,
                          background: `${cc}18`,
                          border: `1px solid ${cc}30`,
                          color: cc,
                          borderRadius: 4,
                          padding: '1px 7px',
                          fontSize: '0.62rem',
                          fontWeight: 600,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                        }}>{m.category}</span>
                      </div>
                      <span style={{ ...labelStyle, whiteSpace: 'nowrap', marginLeft: 12 }}>{formatDate(m.timestamp)}</span>
                    </div>
                    {m.description && <div style={{ fontSize: '0.8rem', color: C.muted, marginBottom: 10 }}>{m.description}</div>}
                    {/* Impact bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={labelStyle}>Impact</span>
                      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${m.impact * 100}%`, background: cc, borderRadius: 2, transition: 'width 500ms ease' }} />
                      </div>
                      <span style={{ color: cc, fontSize: '0.75rem', fontWeight: 600, minWidth: 32, textAlign: 'right' }}>{Math.round(m.impact * 100)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {data.milestones.length === 0 && <div style={{ color: C.dim, fontSize: '0.82rem', textAlign: 'center', paddingTop: 40 }}>No milestones yet</div>}
          </div>
        )}

        {/* Identity Diffs tab */}
        {tab === 'diffs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.identityDiffs.map((d) => {
              const sc = significanceColor[d.significance];
              return (
                <div key={d.id} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', borderLeft: `3px solid ${sc}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 600, color: C.text }}>{d.field}</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ background: `${sc}18`, border: `1px solid ${sc}30`, color: sc, borderRadius: 4, padding: '1px 7px', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{d.significance}</span>
                      <span style={labelStyle}>{relativeTime(d.timestamp)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'center' }}>
                    <div style={{ background: 'rgba(239,68,68,0.07)', border: `1px solid rgba(239,68,68,0.15)`, borderRadius: 6, padding: '8px 12px' }}>
                      <div style={{ ...labelStyle, color: C.danger, marginBottom: 4 }}>Before</div>
                      <div style={{ fontSize: '0.8rem', color: C.muted }}>{String(d.oldValue)}</div>
                    </div>
                    <span style={{ color: C.dim, fontSize: '1rem' }}>→</span>
                    <div style={{ background: 'rgba(34,197,94,0.07)', border: `1px solid rgba(34,197,94,0.15)`, borderRadius: 6, padding: '8px 12px' }}>
                      <div style={{ ...labelStyle, color: C.success, marginBottom: 4 }}>After</div>
                      <div style={{ fontSize: '0.8rem', color: C.text }}>{String(d.newValue)}</div>
                    </div>
                  </div>
                  {d.context && (
                    <div style={{ marginTop: 10, fontSize: '0.78rem', color: C.dim, fontStyle: 'italic', paddingLeft: 4, borderLeft: `2px solid ${C.borderSubtle}` }}>{d.context}</div>
                  )}
                </div>
              );
            })}
            {data.identityDiffs.length === 0 && <div style={{ color: C.dim, fontSize: '0.82rem', textAlign: 'center', paddingTop: 40 }}>No identity diffs recorded</div>}
          </div>
        )}

        {/* Recurring Loops tab */}
        {tab === 'loops' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.recurringLoops.map((l) => {
              const sc = loopStatusColor[l.status];
              return (
                <div key={l.id} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <span style={{ fontSize: '0.88rem', fontWeight: 600, color: C.text, marginRight: 10 }}>{l.title}</span>
                      <span style={{ background: `${sc}18`, border: `1px solid ${sc}30`, color: sc, borderRadius: 4, padding: '1px 7px', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{l.status}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ ...labelStyle, marginBottom: 2 }}>Frequency</div>
                        <span style={{ color: C.rose, fontWeight: 700, fontSize: '1rem' }}>{l.frequency}<span style={{ color: C.dim, fontSize: '0.7rem', marginLeft: 2 }}>×</span></span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ ...labelStyle, marginBottom: 2 }}>Last seen</div>
                        <span style={{ color: C.muted, fontSize: '0.78rem' }}>{relativeTime(l.lastSeen)}</span>
                      </div>
                    </div>
                  </div>
                  {l.description && <div style={{ fontSize: '0.8rem', color: C.muted, lineHeight: 1.5 }}>{l.description}</div>}
                </div>
              );
            })}
            {data.recurringLoops.length === 0 && <div style={{ color: C.dim, fontSize: '0.82rem', textAlign: 'center', paddingTop: 40 }}>No loops recorded</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// Shared input/button styles
const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(88,28,135,0.14)',
  borderRadius: 4,
  color: 'rgba(226,232,240,0.92)',
  padding: '5px 8px',
  fontSize: '0.8rem',
  boxSizing: 'border-box',
  outline: 'none',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

const submitBtn: React.CSSProperties = {
  background: 'rgba(88,28,135,0.25)',
  border: '1px solid rgba(88,28,135,0.35)',
  color: 'rgba(167,139,250,0.85)',
  borderRadius: 5,
  padding: '6px 16px',
  fontSize: '0.78rem',
  cursor: 'pointer',
  fontWeight: 600,
};
