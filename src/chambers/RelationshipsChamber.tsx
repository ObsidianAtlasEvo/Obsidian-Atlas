import React, { useState } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { generateId, nowISO } from '../lib/persistence';

// TODO: Add store actions: addRelationship, removeRelationship, updateRelationship to useAtlasStore

interface RelationshipDepth {
  id: string;
  personId: string;
  name: string;
  role: string;
  trust: number;
  resonance: number;
  drivers: string[];
  recentAuthorityMoment?: string;
  mentalModel: string;
  preferredLanguage: string;
  unresolvedTensions: string[];
  trustTrajectory: number[];
  roleInUserMind: string;
  keySensitivities: string[];
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

function trustColor(t: number): string {
  if (t >= 0.7) return C.success;
  if (t >= 0.4) return C.amber;
  return C.danger;
}

function initials(name: string): string {
  return name.split(' ').map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
}

// Mini SVG sparkline for trust trajectory
function Sparkline({ values, width = 80, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (!values || values.length < 2) {
    return <svg width={width} height={height}><line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={C.dim} strokeWidth={1} /></svg>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 3;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * w;
    const y = pad + h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  const lastX = pad + w;
  const lastY = parseFloat(pts[pts.length - 1].split(',')[1]);
  const lastVal = values[values.length - 1];
  const dotColor = trustColor(lastVal);

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={C.violet}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.6}
      />
      {values.map((v, i) => {
        const x = pad + (i / (values.length - 1)) * w;
        const y = pad + h - ((v - min) / range) * h;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={i === values.length - 1 ? 3 : 2}
            fill={i === values.length - 1 ? dotColor : C.violet}
            opacity={i === values.length - 1 ? 1 : 0.5}
          />
        );
      })}
    </svg>
  );
}

const SEED: RelationshipDepth[] = [
  {
    id: 'rel-1',
    personId: 'p-1',
    name: 'Mira Santos',
    role: 'Strategic Advisor',
    trust: 0.88,
    resonance: 0.82,
    drivers: ['Long-term orientation', 'Pattern recognition', 'Honesty over comfort'],
    recentAuthorityMoment: 'Correctly called the market shift before anyone else in the room.',
    mentalModel: 'Views organizations as living organisms that adapt or atrophy. Believes culture precedes strategy.',
    preferredLanguage: 'Systems-level metaphors, historical analogies, direct challenge',
    unresolvedTensions: ['Disagrees on timeline for expansion', 'Different risk appetite for international bets'],
    trustTrajectory: [0.5, 0.6, 0.65, 0.75, 0.8, 0.88],
    roleInUserMind: 'Trusted truth-teller who challenges assumptions',
    keySensitivities: ['Short-termism', 'Performative busyness', 'Lack of intellectual humility'],
  },
  {
    id: 'rel-2',
    personId: 'p-2',
    name: 'Dae-Hyun Park',
    role: 'Operating Partner',
    trust: 0.62,
    resonance: 0.55,
    drivers: ['Execution velocity', 'Clear ownership', 'Measurable outcomes'],
    mentalModel: 'Execution-first thinker. Distrusts abstraction. Wants concrete next steps at all times.',
    preferredLanguage: 'Numbers, deadlines, accountability frames',
    unresolvedTensions: ['Tension around communication cadence', 'Misalignment on role boundaries'],
    trustTrajectory: [0.7, 0.65, 0.62, 0.58, 0.62],
    roleInUserMind: 'High-output executor who needs clear framing',
    keySensitivities: ['Ambiguity', 'Scope creep', 'Last-minute changes'],
  },
  {
    id: 'rel-3',
    personId: 'p-3',
    name: 'Zara Okonkwo',
    role: 'Creative Director',
    trust: 0.45,
    resonance: 0.78,
    drivers: ['Aesthetic integrity', 'Creative autonomy', 'Brand coherence'],
    recentAuthorityMoment: 'Redesign resulted in 40% improvement in user engagement.',
    mentalModel: 'Leads with intuition and narrative. Needs to feel intrinsic meaning in work.',
    preferredLanguage: 'Story, emotion, vision — not metrics',
    unresolvedTensions: ['Trust eroded after feedback was given publicly', 'Creative authority boundary unclear'],
    trustTrajectory: [0.7, 0.68, 0.6, 0.5, 0.45],
    roleInUserMind: 'High-creative, needs careful management',
    keySensitivities: ['Public criticism', 'Micromanagement', 'Overriding design decisions'],
  },
];

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

export default function RelationshipsChamber() {
  const storeRelationships = useAtlasStore((s) => s.relationships) as RelationshipDepth[] | undefined;
  // TODO: Replace local state with store actions once CRUD is implemented
  const [relationships, setRelationships] = useState<RelationshipDepth[]>(
    storeRelationships?.length ? storeRelationships : SEED
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [fName, setFName] = useState('');
  const [fRole, setFRole] = useState('');
  const [fTrust, setFTrust] = useState(0.5);
  const [fResonance, setFResonance] = useState(0.5);
  const [fMentalModel, setFMentalModel] = useState('');
  const [fPrefLang, setFPrefLang] = useState('');
  const [fRoleInMind, setFRoleInMind] = useState('');

  const addRelationship = () => {
    if (!fName.trim()) return;
    const r: RelationshipDepth = {
      id: generateId(),
      personId: generateId(),
      name: fName.trim(),
      role: fRole.trim(),
      trust: fTrust,
      resonance: fResonance,
      drivers: [],
      mentalModel: fMentalModel.trim(),
      preferredLanguage: fPrefLang.trim(),
      unresolvedTensions: [],
      trustTrajectory: [fTrust],
      roleInUserMind: fRoleInMind.trim(),
      keySensitivities: [],
    };
    setRelationships((prev) => [...prev, r]);
    setFName(''); setFRole(''); setFTrust(0.5); setFResonance(0.5); setFMentalModel(''); setFPrefLang(''); setFRoleInMind('');
    setShowForm(false);
  };

  const removeRelationship = (id: string) => {
    setRelationships((prev) => prev.filter((r) => r.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.body, color: C.text, fontFamily: 'inherit', animation: 'atlas-fade-in 300ms ease both', minHeight: 0, overflow: 'hidden' }}>
      {/* Header bar */}
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, background: C.panel, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: C.text }}>Relationships</span>
          <span style={{ ...labelStyle, marginLeft: 12 }}>{relationships.length} people</span>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{ background: 'rgba(88,28,135,0.18)', border: `1px solid ${C.border}`, color: C.violet, borderRadius: 5, padding: '5px 14px', fontSize: '0.75rem', cursor: 'pointer' }}
        >
          {showForm ? '✕ Cancel' : '+ Add Person'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, background: C.inset, flexShrink: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ ...labelStyle, marginBottom: 4 }}>Name</div>
              <input value={fName} onChange={(e) => setFName(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 4 }}>Role</div>
              <input value={fRole} onChange={(e) => setFRole(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 4 }}>Role in Your Mind</div>
              <input value={fRoleInMind} onChange={(e) => setFRoleInMind(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={labelStyle}>Trust</span>
                <span style={{ color: trustColor(fTrust), fontSize: '0.78rem', fontWeight: 600 }}>{Math.round(fTrust * 100)}%</span>
              </div>
              <input type="range" min={0} max={1} step={0.01} value={fTrust} onChange={(e) => setFTrust(Number(e.target.value))} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={labelStyle}>Resonance</span>
                <span style={{ color: C.indigo, fontSize: '0.78rem', fontWeight: 600 }}>{Math.round(fResonance * 100)}%</span>
              </div>
              <input type="range" min={0} max={1} step={0.01} value={fResonance} onChange={(e) => setFResonance(Number(e.target.value))} style={{ width: '100%' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ ...labelStyle, marginBottom: 4 }}>Mental Model</div>
              <textarea value={fMentalModel} onChange={(e) => setFMentalModel(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 4 }}>Preferred Language</div>
              <textarea value={fPrefLang} onChange={(e) => setFPrefLang(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>
          <button onClick={addRelationship} style={{ background: 'rgba(88,28,135,0.25)', border: '1px solid rgba(88,28,135,0.35)', color: C.violet, borderRadius: 5, padding: '6px 18px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}>
            Add Relationship
          </button>
        </div>
      )}

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {relationships.map((r) => {
            const isExpanded = expandedId === r.id;
            const tc = trustColor(r.trust);
            return (
              <div
                key={r.id}
                style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', transition: 'border-color 200ms' }}
              >
                {/* Card header */}
                <div style={{ padding: '14px 16px', cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : r.id)}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    {/* Avatar */}
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                      background: `linear-gradient(135deg, rgba(88,28,135,0.4), rgba(99,102,241,0.3))`,
                      border: `2px solid rgba(88,28,135,0.3)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.8rem', fontWeight: 700, color: C.violet,
                    }}>
                      {initials(r.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.92rem', fontWeight: 700, color: C.text }}>{r.name}</span>
                        <span style={{ color: C.dim, fontSize: '0.72rem' }}>{isExpanded ? '▲' : '▼'}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: C.muted, marginTop: 2 }}>{r.role}</div>
                    </div>
                  </div>

                  {/* Trust & Resonance bars */}
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {[
                      { label: 'Trust', value: r.trust, color: tc },
                      { label: 'Resonance', value: r.resonance, color: C.indigo },
                    ].map(({ label: lbl, value, color }) => (
                      <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ ...labelStyle, minWidth: 60 }}>{lbl}</span>
                        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${value * 100}%`, background: color, borderRadius: 2, transition: 'width 400ms ease' }} />
                        </div>
                        <span style={{ color, fontSize: '0.72rem', fontWeight: 600, minWidth: 28, textAlign: 'right' }}>{Math.round(value * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${C.borderSubtle}` }}>
                    {/* Recent authority moment */}
                    {r.recentAuthorityMoment && (
                      <div style={{ margin: '12px 0', background: 'rgba(201,162,39,0.07)', border: `1px solid rgba(201,162,39,0.18)`, borderRadius: 6, padding: '8px 10px' }}>
                        <div style={{ ...labelStyle, color: C.gold, marginBottom: 4 }}>Recent Authority Moment</div>
                        <div style={{ fontSize: '0.78rem', color: C.muted }}>{r.recentAuthorityMoment}</div>
                      </div>
                    )}

                    {/* Role in user's mind */}
                    {r.roleInUserMind && (
                      <div style={{ marginTop: 12 }}>
                        <div style={labelStyle}>Role in Your Mind</div>
                        <div style={{ fontSize: '0.8rem', color: C.text, marginTop: 4 }}>{r.roleInUserMind}</div>
                      </div>
                    )}

                    {/* Mental model */}
                    {r.mentalModel && (
                      <div style={{ marginTop: 12 }}>
                        <div style={labelStyle}>Mental Model</div>
                        <div style={{ fontSize: '0.8rem', color: C.muted, marginTop: 4, lineHeight: 1.6 }}>{r.mentalModel}</div>
                      </div>
                    )}

                    {/* Preferred language */}
                    {r.preferredLanguage && (
                      <div style={{ marginTop: 12 }}>
                        <div style={labelStyle}>Preferred Language</div>
                        <div style={{ fontSize: '0.78rem', color: C.teal, marginTop: 4 }}>{r.preferredLanguage}</div>
                      </div>
                    )}

                    {/* Drivers */}
                    {r.drivers.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={labelStyle}>Drivers</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                          {r.drivers.map((d, i) => (
                            <span key={i} style={{ background: 'rgba(99,102,241,0.1)', border: `1px solid rgba(99,102,241,0.2)`, color: C.indigo, borderRadius: 4, padding: '2px 8px', fontSize: '0.72rem' }}>{d}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Key sensitivities */}
                    {r.keySensitivities.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={labelStyle}>Key Sensitivities</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                          {r.keySensitivities.map((s, i) => (
                            <span key={i} style={{ background: 'rgba(244,114,182,0.1)', border: `1px solid rgba(244,114,182,0.2)`, color: C.rose, borderRadius: 4, padding: '2px 8px', fontSize: '0.72rem' }}>{s}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Unresolved tensions */}
                    {r.unresolvedTensions.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ ...labelStyle, color: C.danger }}>Unresolved Tensions</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                          {r.unresolvedTensions.map((t, i) => (
                            <div key={i} style={{ background: 'rgba(239,68,68,0.07)', border: `1px solid rgba(239,68,68,0.15)`, borderRadius: 4, padding: '5px 10px', fontSize: '0.78rem', color: C.danger }}>{t}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Trust Trajectory sparkline */}
                    {r.trustTrajectory.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={labelStyle}>Trust Trajectory</div>
                          <Sparkline values={r.trustTrajectory} width={100} height={30} />
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeRelationship(r.id); }}
                        style={{ background: 'rgba(239,68,68,0.08)', border: `1px solid rgba(239,68,68,0.2)`, color: C.danger, borderRadius: 4, padding: '4px 10px', fontSize: '0.7rem', cursor: 'pointer' }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {relationships.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: C.dim, fontSize: '0.85rem', paddingTop: 60 }}>
              No relationships yet. Add someone to start mapping your network.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
