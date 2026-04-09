import React, { useState, useMemo } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { generateId, nowISO } from '../lib/persistence';

// Note: Signals are not a top-level AppState field — using local state as designed

interface Signal {
  id: string;
  type: 'hard' | 'soft';
  category: string;
  source: string;
  content: string;
  insight: string;
  strength: number;
  timestamp: string;
  entities: string[];
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

function strengthColor(s: number): string {
  if (s >= 0.7) return C.success;
  if (s >= 0.4) return C.amber;
  return C.dim;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const SEED_SIGNALS: Signal[] = [
  {
    id: 'sig-1',
    type: 'hard',
    category: 'Market',
    source: 'Industry report Q4',
    content: 'Enterprise SaaS churn rates fell to 4.2% — lowest in 5 years, signaling renewed multi-year commitment cycles.',
    insight: 'Buyers are locking in for longer horizons. Contracts with shorter time-to-value are losing ground.',
    strength: 0.88,
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    entities: ['SaaS', 'Enterprise', 'Churn'],
  },
  {
    id: 'sig-2',
    type: 'hard',
    category: 'Competitor',
    source: 'SEC filing review',
    content: 'Apex Corp reduced R&D headcount by 18%, focusing remaining spend on two product lines.',
    insight: 'Competitor is consolidating, leaving flanks open in segments they are abandoning.',
    strength: 0.92,
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    entities: ['Apex Corp', 'R&D', 'Headcount'],
  },
  {
    id: 'sig-3',
    type: 'soft',
    category: 'Culture',
    source: 'Team 1:1 debrief',
    content: 'Three senior contributors mentioned feeling "underutilized" within the same two-week window.',
    insight: 'A latent morale signal that precedes disengagement. Likely correlated with unclear strategic direction.',
    strength: 0.65,
    timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
    entities: ['Team', 'Morale', 'Retention risk'],
  },
  {
    id: 'sig-4',
    type: 'soft',
    category: 'Narrative',
    source: 'Social listening',
    content: 'Increasing volume of discourse framing our category as "commodity" — primarily from adjacent influencers.',
    insight: 'Narrative pressure is building. Not existential yet, but positioning needs reinforcement.',
    strength: 0.5,
    timestamp: new Date(Date.now() - 86400000 * 7).toISOString(),
    entities: ['Brand', 'Category narrative', 'Positioning'],
  },
];

export default function SignalsChamber() {
  const [signals, setSignals] = useState<Signal[]>(SEED_SIGNALS);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [showAddForm, setShowAddForm] = useState(false);

  // Form state
  const [fType, setFType] = useState<'hard' | 'soft'>('hard');
  const [fCategory, setFCategory] = useState('');
  const [fSource, setFSource] = useState('');
  const [fContent, setFContent] = useState('');
  const [fInsight, setFInsight] = useState('');
  const [fStrength, setFStrength] = useState(0.6);
  const [fEntities, setFEntities] = useState('');

  const allCategories = useMemo(() => {
    const cats = Array.from(new Set(signals.map((s) => s.category)));
    return ['All', ...cats];
  }, [signals]);

  const filteredSignals = useMemo(() => {
    if (categoryFilter === 'All') return signals;
    return signals.filter((s) => s.category === categoryFilter);
  }, [signals, categoryFilter]);

  const hardSignals = filteredSignals.filter((s) => s.type === 'hard');
  const softSignals = filteredSignals.filter((s) => s.type === 'soft');

  const addSignal = () => {
    if (!fContent.trim()) return;
    const sig: Signal = {
      id: generateId(),
      type: fType,
      category: fCategory.trim() || 'General',
      source: fSource.trim(),
      content: fContent.trim(),
      insight: fInsight.trim(),
      strength: fStrength,
      timestamp: nowISO(),
      entities: fEntities.split(',').map((e) => e.trim()).filter(Boolean),
    };
    setSignals((prev) => [sig, ...prev]);
    setFCategory(''); setFSource(''); setFContent(''); setFInsight(''); setFStrength(0.6); setFEntities('');
    setShowAddForm(false);
  };

  const removeSignal = (id: string) => {
    setSignals((prev) => prev.filter((s) => s.id !== id));
  };

  const hardAccent = C.success;
  const softAccent = C.amber;

  function SignalCard({ signal }: { signal: Signal }) {
    const sc = strengthColor(signal.strength);
    const isHard = signal.type === 'hard';
    const accent = isHard ? hardAccent : softAccent;

    return (
      <div style={{
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderTop: `2px solid ${accent}`,
        borderRadius: 8,
        padding: '12px 14px',
        marginBottom: 10,
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
              <span style={{
                background: `${accent}18`,
                border: `1px solid ${accent}30`,
                color: accent,
                borderRadius: 4,
                padding: '1px 7px',
                fontSize: '0.62rem',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}>{signal.category}</span>
              <span style={{ ...labelStyle, color: C.dim }}>{signal.source}</span>
              <span style={{ ...labelStyle, color: C.dim, marginLeft: 'auto' }}>{relativeTime(signal.timestamp)}</span>
            </div>
            <div style={{ fontSize: '0.82rem', color: C.text, lineHeight: 1.55 }}>{signal.content}</div>
          </div>
          <button
            onClick={() => removeSignal(signal.id)}
            style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: '0.75rem', padding: '0 0 0 8px', flexShrink: 0 }}
          >✕</button>
        </div>

        {/* Insight block */}
        {signal.insight && (
          <div style={{
            background: isHard ? 'rgba(34,197,94,0.06)' : 'rgba(234,179,8,0.06)',
            border: `1px solid ${isHard ? 'rgba(34,197,94,0.15)' : 'rgba(234,179,8,0.15)'}`,
            borderLeft: `3px solid ${accent}`,
            borderRadius: '0 4px 4px 0',
            padding: '7px 10px',
            marginBottom: 8,
          }}>
            <div style={{ ...labelStyle, color: accent, marginBottom: 3 }}>Insight</div>
            <div style={{ fontSize: '0.78rem', color: C.muted, lineHeight: 1.55 }}>{signal.insight}</div>
          </div>
        )}

        {/* Footer: strength + entities */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Strength bar */}
          <span style={labelStyle}>Strength</span>
          <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${signal.strength * 100}%`, background: sc, borderRadius: 2 }} />
          </div>
          <span style={{ color: sc, fontSize: '0.72rem', fontWeight: 600 }}>{Math.round(signal.strength * 100)}%</span>

          {/* Entities */}
          {signal.entities.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginLeft: 8 }}>
              {signal.entities.map((e, i) => (
                <span key={i} style={{ background: 'rgba(99,102,241,0.1)', border: `1px solid rgba(99,102,241,0.18)`, color: C.indigo, borderRadius: 3, padding: '1px 6px', fontSize: '0.68rem' }}>{e}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.body, color: C.text, fontFamily: 'inherit', animation: 'atlas-fade-in 300ms ease both', minHeight: 0, overflow: 'hidden' }}>
      {/* Top bar: category filters + add button */}
      <div style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`, background: C.panel, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 5, flex: 1, flexWrap: 'wrap' }}>
          {allCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              style={{
                background: categoryFilter === cat ? 'rgba(88,28,135,0.3)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${categoryFilter === cat ? 'rgba(88,28,135,0.4)' : C.borderSubtle}`,
                color: categoryFilter === cat ? C.violet : C.muted,
                borderRadius: 20,
                padding: '3px 12px',
                fontSize: '0.72rem',
                fontWeight: categoryFilter === cat ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 150ms',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={labelStyle}>{signals.length} signals</span>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            style={{ background: 'rgba(88,28,135,0.18)', border: `1px solid ${C.border}`, color: C.violet, borderRadius: 5, padding: '5px 14px', fontSize: '0.75rem', cursor: 'pointer' }}
          >
            {showAddForm ? '✕ Cancel' : '+ Signal'}
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, background: C.inset, flexShrink: 0 }}>
          {/* Type toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={labelStyle}>Type</span>
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              {(['hard', 'soft'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFType(t)}
                  style={{
                    background: fType === t ? (t === 'hard' ? 'rgba(34,197,94,0.2)' : 'rgba(234,179,8,0.2)') : 'rgba(255,255,255,0.03)',
                    border: 'none',
                    color: fType === t ? (t === 'hard' ? C.success : C.amber) : C.muted,
                    padding: '5px 16px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                    letterSpacing: '0.05em',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ ...labelStyle, marginBottom: 4 }}>Category</div>
              <input value={fCategory} onChange={(e) => setFCategory(e.target.value)} placeholder="e.g. Market" style={formInputStyle} />
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 4 }}>Source</div>
              <input value={fSource} onChange={(e) => setFSource(e.target.value)} placeholder="e.g. Industry report" style={formInputStyle} />
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 4 }}>Entities (comma-sep)</div>
              <input value={fEntities} onChange={(e) => setFEntities(e.target.value)} placeholder="Company, Topic…" style={formInputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ ...labelStyle, marginBottom: 4 }}>Content</div>
              <textarea value={fContent} onChange={(e) => setFContent(e.target.value)} rows={3} placeholder="What was observed…" style={{ ...formInputStyle, resize: 'vertical', width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 4 }}>Insight</div>
              <textarea value={fInsight} onChange={(e) => setFInsight(e.target.value)} rows={3} placeholder="What it means…" style={{ ...formInputStyle, resize: 'vertical', width: '100%', boxSizing: 'border-box' }} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span style={labelStyle}>Strength</span>
            <input type="range" min={0} max={1} step={0.01} value={fStrength} onChange={(e) => setFStrength(Number(e.target.value))} style={{ flex: 1, maxWidth: 200 }} />
            <span style={{ color: strengthColor(fStrength), fontWeight: 600, fontSize: '0.85rem', minWidth: 36 }}>{Math.round(fStrength * 100)}%</span>
            <span style={{ ...labelStyle, marginLeft: 4 }}>
              {fStrength >= 0.7 ? 'High' : fStrength >= 0.4 ? 'Medium' : 'Low'}
            </span>
          </div>

          <button onClick={addSignal} style={{ background: 'rgba(88,28,135,0.25)', border: '1px solid rgba(88,28,135,0.35)', color: C.violet, borderRadius: 5, padding: '6px 18px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}>
            Add Signal
          </button>
        </div>
      )}

      {/* Two-column layout */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden' }}>
        {/* Hard signals column */}
        <div style={{ borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.borderSubtle}`, background: 'rgba(34,197,94,0.04)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.success, boxShadow: `0 0 6px ${C.success}` }} />
              <span style={{ ...labelStyle, color: C.success }}>Hard Signals</span>
              <span style={{ ...labelStyle, marginLeft: 'auto' }}>{hardSignals.length}</span>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
            {hardSignals.map((s) => <SignalCard key={s.id} signal={s} />)}
            {hardSignals.length === 0 && (
              <div style={{ color: C.dim, fontSize: '0.8rem', textAlign: 'center', paddingTop: 40 }}>No hard signals{categoryFilter !== 'All' ? ` in "${categoryFilter}"` : ''}</div>
            )}
          </div>
        </div>

        {/* Soft signals column */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.borderSubtle}`, background: 'rgba(234,179,8,0.04)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.amber, boxShadow: `0 0 6px ${C.amber}` }} />
              <span style={{ ...labelStyle, color: C.amber }}>Soft Signals</span>
              <span style={{ ...labelStyle, marginLeft: 'auto' }}>{softSignals.length}</span>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
            {softSignals.map((s) => <SignalCard key={s.id} signal={s} />)}
            {softSignals.length === 0 && (
              <div style={{ color: C.dim, fontSize: '0.8rem', textAlign: 'center', paddingTop: 40 }}>No soft signals{categoryFilter !== 'All' ? ` in "${categoryFilter}"` : ''}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const formInputStyle: React.CSSProperties = {
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
