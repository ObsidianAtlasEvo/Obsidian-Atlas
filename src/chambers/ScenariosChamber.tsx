import React, { useState } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { generateId, nowISO } from '../lib/persistence';

// TODO: Add store actions: addScenario, removeScenario, updateScenario to useAtlasStore

interface Branch {
  id: string;
  description: string;
  probability: number;
  leveragePoints: string[];
  failurePaths: string[];
  strategicPivots: string[];
}

interface Scenario {
  id: string;
  title: string;
  branches: Branch[];
  groundedInference: string[];
  speculation: string[];
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

const label: React.CSSProperties = {
  fontSize: '0.62rem',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: C.dim,
};

const probColor = (p: number): string => {
  // green (success) at 1.0, yellow at 0.5, red (danger) at 0.0
  if (p >= 0.7) return C.success;
  if (p >= 0.4) return C.amber;
  return C.danger;
};

const SEED_SCENARIOS: Scenario[] = [
  {
    id: 'sc-1',
    title: 'Market Inflection Point',
    branches: [
      {
        id: 'b-1',
        description: 'Rapid adoption accelerates beyond forecast.',
        probability: 0.72,
        leveragePoints: ['Distribution partnerships', 'Community flywheel'],
        failurePaths: ['Talent bottleneck', 'Infrastructure lag'],
        strategicPivots: ['Shift to platform model', 'Raise pre-emptively'],
      },
      {
        id: 'b-2',
        description: 'Incumbents respond with aggressive pricing.',
        probability: 0.38,
        leveragePoints: ['Niche superiority', 'Switching cost lock-in'],
        failurePaths: ['Race to bottom', 'Margin compression'],
        strategicPivots: ['Premiumize offering', 'Anchor to enterprise'],
      },
    ],
    groundedInference: ['Current TAM signals 3× growth in 18 months', 'Three major pilots converting'],
    speculation: ['Regulatory tailwind could emerge', 'New entrant may acquire key supplier'],
  },
];

export default function ScenariosChamber() {
  const storeScenarios = useAtlasStore((s) => s.scenarios) as Scenario[];
  // TODO: Replace local state with store actions once addScenario/removeScenario are implemented
  const [scenarios, setScenarios] = useState<Scenario[]>(
    storeScenarios?.length ? storeScenarios : SEED_SCENARIOS
  );
  const [selectedId, setSelectedId] = useState<string>(scenarios[0]?.id ?? '');
  const [expandedBranch, setExpandedBranch] = useState<string | null>(null);
  const [showAddScenario, setShowAddScenario] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [addingBranch, setAddingBranch] = useState(false);
  const [branchDesc, setBranchDesc] = useState('');
  const [branchProb, setBranchProb] = useState(0.5);
  const [branchLeverage, setBranchLeverage] = useState('');
  const [branchFailure, setBranchFailure] = useState('');
  const [branchPivots, setBranchPivots] = useState('');
  const [newGrounded, setNewGrounded] = useState('');
  const [newSpeculation, setNewSpeculation] = useState('');

  const selected = scenarios.find((s) => s.id === selectedId) ?? null;

  const addScenario = () => {
    if (!newTitle.trim()) return;
    const s: Scenario = {
      id: generateId(),
      title: newTitle.trim(),
      branches: [],
      groundedInference: [],
      speculation: [],
    };
    setScenarios((prev) => [...prev, s]);
    setSelectedId(s.id);
    setNewTitle('');
    setShowAddScenario(false);
  };

  const removeScenario = (id: string) => {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(scenarios[0]?.id ?? '');
  };

  const addBranch = () => {
    if (!branchDesc.trim() || !selected) return;
    const branch: Branch = {
      id: generateId(),
      description: branchDesc.trim(),
      probability: branchProb,
      leveragePoints: branchLeverage.split(',').map((s) => s.trim()).filter(Boolean),
      failurePaths: branchFailure.split(',').map((s) => s.trim()).filter(Boolean),
      strategicPivots: branchPivots.split(',').map((s) => s.trim()).filter(Boolean),
    };
    setScenarios((prev) =>
      prev.map((s) => s.id === selected.id ? { ...s, branches: [...s.branches, branch] } : s)
    );
    setBranchDesc(''); setBranchProb(0.5); setBranchLeverage(''); setBranchFailure(''); setBranchPivots('');
    setAddingBranch(false);
  };

  const addGrounded = () => {
    if (!newGrounded.trim() || !selected) return;
    setScenarios((prev) =>
      prev.map((s) => s.id === selected.id ? { ...s, groundedInference: [...s.groundedInference, newGrounded.trim()] } : s)
    );
    setNewGrounded('');
  };

  const addSpeculation = () => {
    if (!newSpeculation.trim() || !selected) return;
    setScenarios((prev) =>
      prev.map((s) => s.id === selected.id ? { ...s, speculation: [...s.speculation, newSpeculation.trim()] } : s)
    );
    setNewSpeculation('');
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: C.body, color: C.text, fontFamily: 'inherit', animation: 'atlas-fade-in 300ms ease both', minHeight: 0 }}>
      {/* Left sidebar */}
      <div style={{ width: 250, flexShrink: 0, background: C.panel, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${C.borderSubtle}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={label}>Scenarios</span>
          <button
            onClick={() => setShowAddScenario((v) => !v)}
            style={{ background: 'rgba(88,28,135,0.2)', border: `1px solid ${C.border}`, color: C.violet, borderRadius: 4, padding: '2px 8px', fontSize: '0.72rem', cursor: 'pointer' }}
          >
            + Add
          </button>
        </div>

        {showAddScenario && (
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.borderSubtle}`, background: C.inset }}>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Scenario title…"
              onKeyDown={(e) => e.key === 'Enter' && addScenario()}
              style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: '5px 8px', fontSize: '0.8rem', boxSizing: 'border-box' }}
            />
            <button onClick={addScenario} style={{ marginTop: 6, width: '100%', background: 'rgba(88,28,135,0.25)', border: `1px solid rgba(88,28,135,0.3)`, color: C.violet, borderRadius: 4, padding: '4px 0', fontSize: '0.75rem', cursor: 'pointer' }}>
              Create
            </button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {scenarios.map((s) => (
            <div
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              style={{
                padding: '10px 14px',
                borderBottom: `1px solid ${C.borderSubtle}`,
                cursor: 'pointer',
                background: selectedId === s.id ? 'rgba(88,28,135,0.18)' : 'transparent',
                borderLeft: selectedId === s.id ? `2px solid ${C.violet}` : '2px solid transparent',
                transition: 'background 150ms',
              }}
            >
              <div style={{ fontSize: '0.82rem', color: C.text, marginBottom: 3 }}>{s.title}</div>
              <div style={{ ...label, color: C.dim }}>{s.branches.length} branch{s.branches.length !== 1 ? 'es' : ''}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {!selected ? (
          <div style={{ color: C.muted, textAlign: 'center', marginTop: 60, fontSize: '0.9rem' }}>Select or create a scenario</div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 600, color: C.text, marginBottom: 4 }}>{selected.title}</div>
                <div style={{ ...label, color: C.muted }}>{selected.branches.length} branches · {selected.groundedInference.length} grounded · {selected.speculation.length} speculative</div>
              </div>
              <button
                onClick={() => removeScenario(selected.id)}
                style={{ background: 'rgba(239,68,68,0.08)', border: `1px solid rgba(239,68,68,0.2)`, color: C.danger, borderRadius: 4, padding: '4px 10px', fontSize: '0.72rem', cursor: 'pointer' }}
              >
                Remove
              </button>
            </div>

            {/* Branches */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={label}>Branches</span>
                <button
                  onClick={() => setAddingBranch((v) => !v)}
                  style={{ background: 'rgba(6,182,212,0.1)', border: `1px solid rgba(6,182,212,0.2)`, color: C.teal, borderRadius: 4, padding: '2px 8px', fontSize: '0.72rem', cursor: 'pointer' }}
                >
                  + Branch
                </button>
              </div>

              {addingBranch && (
                <div style={{ background: C.inset, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
                  <div style={{ ...label, marginBottom: 6 }}>New Branch</div>
                  <textarea
                    value={branchDesc}
                    onChange={(e) => setBranchDesc(e.target.value)}
                    placeholder="Branch description…"
                    rows={2}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: '6px 8px', fontSize: '0.8rem', resize: 'vertical', boxSizing: 'border-box', marginBottom: 10 }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ ...label, whiteSpace: 'nowrap' }}>Probability</span>
                    <input type="range" min={0} max={1} step={0.01} value={branchProb} onChange={(e) => setBranchProb(Number(e.target.value))} style={{ flex: 1 }} />
                    <span style={{ color: probColor(branchProb), fontWeight: 600, fontSize: '0.85rem', minWidth: 36, textAlign: 'right' }}>{Math.round(branchProb * 100)}%</span>
                  </div>
                  {[
                    { label: 'Leverage Points (comma-sep)', val: branchLeverage, set: setBranchLeverage },
                    { label: 'Failure Paths (comma-sep)', val: branchFailure, set: setBranchFailure },
                    { label: 'Strategic Pivots (comma-sep)', val: branchPivots, set: setBranchPivots },
                  ].map((f) => (
                    <div key={f.label} style={{ marginBottom: 8 }}>
                      <div style={{ ...label, marginBottom: 3 }}>{f.label}</div>
                      <input
                        value={f.val}
                        onChange={(e) => f.set(e.target.value)}
                        style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: '5px 8px', fontSize: '0.8rem', boxSizing: 'border-box' }}
                      />
                    </div>
                  ))}
                  <button onClick={addBranch} style={{ background: 'rgba(6,182,212,0.15)', border: `1px solid rgba(6,182,212,0.25)`, color: C.teal, borderRadius: 4, padding: '5px 14px', fontSize: '0.75rem', cursor: 'pointer', marginTop: 4 }}>
                    Add Branch
                  </button>
                </div>
              )}

              {selected.branches.map((branch) => {
                const isExpanded = expandedBranch === branch.id;
                const pct = Math.round(branch.probability * 100);
                const pc = probColor(branch.probability);
                return (
                  <div
                    key={branch.id}
                    style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}
                  >
                    {/* Branch header */}
                    <div
                      onClick={() => setExpandedBranch(isExpanded ? null : branch.id)}
                      style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.85rem', color: C.text, marginBottom: 6 }}>{branch.description}</div>
                        {/* Probability bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%',
                              width: `${pct}%`,
                              borderRadius: 2,
                              background: `linear-gradient(90deg, ${C.danger}, ${C.amber}, ${C.success})`,
                              backgroundSize: '200% 100%',
                              backgroundPosition: `${100 - pct}% 0`,
                              transition: 'width 400ms ease',
                            }} />
                          </div>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: pc, minWidth: 32, textAlign: 'right' }}>{pct}%</span>
                        </div>
                      </div>
                      <span style={{ color: C.dim, fontSize: '0.75rem' }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>

                    {/* Expanded branch details */}
                    {isExpanded && (
                      <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${C.borderSubtle}` }}>
                        {branch.leveragePoints.length > 0 && (
                          <div style={{ marginTop: 12 }}>
                            <div style={label}>Leverage Points</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                              {branch.leveragePoints.map((lp, i) => (
                                <span key={i} style={{ background: 'rgba(99,102,241,0.12)', border: `1px solid rgba(99,102,241,0.2)`, color: C.indigo, borderRadius: 4, padding: '2px 8px', fontSize: '0.75rem' }}>{lp}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {branch.failurePaths.length > 0 && (
                          <div style={{ marginTop: 12 }}>
                            <div style={label}>Failure Paths</div>
                            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {branch.failurePaths.map((fp, i) => (
                                <div key={i} style={{ background: 'rgba(239,68,68,0.07)', border: `1px solid rgba(239,68,68,0.15)`, borderRadius: 4, padding: '4px 10px', fontSize: '0.78rem', color: C.danger }}>{fp}</div>
                              ))}
                            </div>
                          </div>
                        )}
                        {branch.strategicPivots.length > 0 && (
                          <div style={{ marginTop: 12 }}>
                            <div style={label}>Strategic Pivots</div>
                            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {branch.strategicPivots.map((sp, i) => (
                                <div key={i} style={{ background: 'rgba(6,182,212,0.07)', border: `1px solid rgba(6,182,212,0.15)`, borderRadius: 4, padding: '4px 10px', fontSize: '0.78rem', color: C.teal }}>{sp}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Grounded Inference */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
              {/* Grounded */}
              <div style={{ background: C.panel, border: `1px solid rgba(34,197,94,0.15)`, borderRadius: 8, padding: 16 }}>
                <div style={{ ...label, color: C.success, marginBottom: 10 }}>Grounded Inference</div>
                {selected.groundedInference.map((g, i) => (
                  <div key={i} style={{ background: 'rgba(34,197,94,0.07)', border: `1px solid rgba(34,197,94,0.15)`, borderRadius: 4, padding: '6px 10px', fontSize: '0.8rem', color: C.text, marginBottom: 6 }}>{g}</div>
                ))}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <input
                    value={newGrounded}
                    onChange={(e) => setNewGrounded(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addGrounded()}
                    placeholder="Add grounded point…"
                    style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: '4px 8px', fontSize: '0.78rem' }}
                  />
                  <button onClick={addGrounded} style={{ background: 'rgba(34,197,94,0.12)', border: `1px solid rgba(34,197,94,0.2)`, color: C.success, borderRadius: 4, padding: '4px 10px', fontSize: '0.72rem', cursor: 'pointer' }}>+</button>
                </div>
              </div>

              {/* Speculation */}
              <div style={{ background: C.panel, border: `1px solid rgba(234,179,8,0.15)`, borderRadius: 8, padding: 16 }}>
                <div style={{ ...label, color: C.amber, marginBottom: 10 }}>Speculation</div>
                {selected.speculation.map((sp, i) => (
                  <div key={i} style={{ background: 'rgba(234,179,8,0.07)', border: `1px solid rgba(234,179,8,0.15)`, borderRadius: 4, padding: '6px 10px', fontSize: '0.8rem', color: C.text, marginBottom: 6 }}>{sp}</div>
                ))}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <input
                    value={newSpeculation}
                    onChange={(e) => setNewSpeculation(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addSpeculation()}
                    placeholder="Add speculation…"
                    style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: '4px 8px', fontSize: '0.78rem' }}
                  />
                  <button onClick={addSpeculation} style={{ background: 'rgba(234,179,8,0.12)', border: `1px solid rgba(234,179,8,0.2)`, color: C.amber, borderRadius: 4, padding: '4px 10px', fontSize: '0.72rem', cursor: 'pointer' }}>+</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
