// Trajectory Observatory · Friction Cartography · Threshold Protocols (Vision §XV).
// Consumes the live atlas-backend intelligence routes (intelligenceChambersRoutes.ts).
// One chamber, three tabs — same governed data plane, honest error/empty states.
import React, { useCallback, useEffect, useState } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { atlasApiUrl, atlasHttpEnabled } from '../lib/atlasApi';
import { atlasTraceUserId } from '../lib/atlasTraceContext';

type Tab = 'trajectory' | 'friction' | 'threshold';

interface TrajectoryLive {
  overall_classification: string;
  confidence: number;
  summary_text: string;
  domains: { domain?: string; band?: string; note?: string }[];
  contributing_factors: string[];
  drift_warnings: string[];
  projections: { if_unchanged: string; if_corrected: string };
  correction_leverage: string[];
}

type Row = Record<string, unknown>;

const label: React.CSSProperties = {
  fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.12em',
  color: 'rgba(226,232,240,0.28)', textTransform: 'uppercase', marginBottom: 10,
};
const card: React.CSSProperties = {
  background: 'var(--atlas-surface-panel)',
  border: '1px solid var(--border-structural)',
  borderRadius: 'var(--radius-sm)',
  padding: '14px 16px',
  marginBottom: 14,
};
const bodyText: React.CSSProperties = {
  margin: 0, fontSize: '0.82rem', color: 'rgba(226,232,240,0.72)', lineHeight: 1.65,
};
const dimText: React.CSSProperties = {
  margin: 0, fontSize: '0.75rem', color: 'rgba(226,232,240,0.4)', lineHeight: 1.6,
};

function ActionButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '7px 14px', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.72rem',
        background: disabled ? 'transparent' : 'rgba(201,162,39,0.12)',
        border: `1px solid ${disabled ? 'var(--border-subtle)' : 'rgba(201,162,39,0.35)'}`,
        color: disabled ? 'rgba(226,232,240,0.25)' : 'rgba(201,162,39,0.85)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 140ms ease',
      }}
    >
      {children}
    </button>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(239,68,68,0.75)', lineHeight: 1.6 }}>{text}</p>
  );
}

function str(row: Row, key: string): string {
  const v = row[key];
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

export default function IntelligenceChambersChamber() {
  const store = useAtlasStore();
  const userId = atlasTraceUserId(store);
  const activeMode = useAtlasStore((s) => s.activeMode);
  const initialTab: Tab =
    activeMode === 'friction-cartography' ? 'friction' : activeMode === 'threshold-forge' ? 'threshold' : 'trajectory';
  const [tab, setTab] = useState<Tab>(initialTab);

  const httpOk = atlasHttpEnabled();

  // ── Trajectory ─────────────────────────────────────────────────────────
  const [trajectory, setTrajectory] = useState<TrajectoryLive | null>(null);
  const [trajectoryBusy, setTrajectoryBusy] = useState(false);
  const [trajectoryError, setTrajectoryError] = useState<string | null>(null);

  const computeTrajectory = useCallback(async (horizon: 'near' | 'medium') => {
    setTrajectoryBusy(true);
    setTrajectoryError(null);
    try {
      const res = await fetch(atlasApiUrl('/v1/cognitive/trajectory/compute'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId, horizon }),
      });
      if (!res.ok) throw new Error(`Backend returned ${res.status}`);
      const data = (await res.json()) as { live: TrajectoryLive };
      setTrajectory(data.live);
    } catch (e) {
      setTrajectoryError(e instanceof Error ? e.message : 'Trajectory computation failed.');
    } finally {
      setTrajectoryBusy(false);
    }
  }, [userId]);

  // ── Friction ───────────────────────────────────────────────────────────
  const [frictionItems, setFrictionItems] = useState<Row[] | null>(null);
  const [frictionBusy, setFrictionBusy] = useState(false);
  const [frictionError, setFrictionError] = useState<string | null>(null);

  const loadFriction = useCallback(async () => {
    setFrictionBusy(true);
    setFrictionError(null);
    try {
      const res = await fetch(
        atlasApiUrl(`/v1/cognitive/friction/items?userId=${encodeURIComponent(userId)}`),
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error(`Backend returned ${res.status}`);
      const data = (await res.json()) as { items: Row[] };
      setFrictionItems(data.items ?? []);
    } catch (e) {
      setFrictionError(e instanceof Error ? e.message : 'Could not load friction items.');
    } finally {
      setFrictionBusy(false);
    }
  }, [userId]);

  const rebuildFriction = useCallback(async () => {
    setFrictionBusy(true);
    setFrictionError(null);
    try {
      const res = await fetch(atlasApiUrl('/v1/cognitive/friction/rebuild'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error(`Backend returned ${res.status}`);
      const data = (await res.json()) as { items: Row[] };
      setFrictionItems(data.items ?? []);
    } catch (e) {
      setFrictionError(e instanceof Error ? e.message : 'Friction rebuild failed.');
    } finally {
      setFrictionBusy(false);
    }
  }, [userId]);

  // ── Threshold ──────────────────────────────────────────────────────────
  const [protocols, setProtocols] = useState<Row[] | null>(null);
  const [activations, setActivations] = useState<Row[]>([]);
  const [thresholdBusy, setThresholdBusy] = useState(false);
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newStateDesc, setNewStateDesc] = useState('');

  const loadThreshold = useCallback(async () => {
    setThresholdBusy(true);
    setThresholdError(null);
    try {
      const [pRes, aRes] = await Promise.all([
        fetch(atlasApiUrl(`/v1/cognitive/threshold/protocols?userId=${encodeURIComponent(userId)}`), { credentials: 'include' }),
        fetch(atlasApiUrl(`/v1/cognitive/threshold/activations?userId=${encodeURIComponent(userId)}`), { credentials: 'include' }),
      ]);
      if (!pRes.ok) throw new Error(`Backend returned ${pRes.status}`);
      const pData = (await pRes.json()) as { protocols: Row[] };
      setProtocols(pData.protocols ?? []);
      if (aRes.ok) {
        const aData = (await aRes.json()) as { activations: Row[] };
        setActivations(aData.activations ?? []);
      }
    } catch (e) {
      setThresholdError(e instanceof Error ? e.message : 'Could not load threshold protocols.');
    } finally {
      setThresholdBusy(false);
    }
  }, [userId]);

  const createProtocol = useCallback(async () => {
    if (!newTitle.trim() || !newStateDesc.trim()) return;
    setThresholdBusy(true);
    setThresholdError(null);
    try {
      const res = await fetch(atlasApiUrl('/v1/cognitive/threshold/protocols'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId, title: newTitle.trim(), stateDescription: newStateDesc.trim() }),
      });
      if (!res.ok) throw new Error(`Backend returned ${res.status}`);
      setNewTitle('');
      setNewStateDesc('');
      await loadThreshold();
    } catch (e) {
      setThresholdError(e instanceof Error ? e.message : 'Protocol creation failed.');
      setThresholdBusy(false);
    }
  }, [userId, newTitle, newStateDesc, loadThreshold]);

  useEffect(() => {
    if (!httpOk) return;
    if (tab === 'friction' && frictionItems === null) void loadFriction();
    if (tab === 'threshold' && protocols === null) void loadThreshold();
  }, [tab, httpOk, frictionItems, protocols, loadFriction, loadThreshold]);

  const tabs: { id: Tab; title: string; sub: string }[] = [
    { id: 'trajectory', title: 'Trajectory', sub: 'Direction, not just current state' },
    { id: 'friction', title: 'Friction', sub: 'Where work stalls and loops' },
    { id: 'threshold', title: 'Threshold', sub: 'Protocols for compromised states' },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 300, letterSpacing: '-0.02em', color: 'rgba(226,232,240,0.85)' }}>
            Intelligence Chambers
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'rgba(226,232,240,0.3)' }}>
            Trajectory, friction, and threshold analysis computed from your governed backend record.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '8px 16px', borderRadius: 6, fontFamily: 'inherit', textAlign: 'left',
                background: tab === t.id ? 'rgba(88,28,135,0.22)' : 'transparent',
                border: `1px solid ${tab === t.id ? 'rgba(88,28,135,0.45)' : 'var(--border-subtle)'}`,
                cursor: 'pointer', transition: 'all 140ms ease',
              }}
            >
              <span style={{ display: 'block', fontSize: '0.8rem', color: tab === t.id ? 'rgba(167,139,250,0.9)' : 'rgba(226,232,240,0.5)' }}>
                {t.title}
              </span>
              <span style={{ display: 'block', fontSize: '0.62rem', color: 'rgba(226,232,240,0.25)' }}>{t.sub}</span>
            </button>
          ))}
        </div>

        {!httpOk && (
          <div style={card}>
            <ErrorNote text="No backend connection configured for this build. These chambers read live governed data and cannot run offline." />
          </div>
        )}

        {/* ── Trajectory tab ── */}
        {httpOk && tab === 'trajectory' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <ActionButton onClick={() => void computeTrajectory('near')} disabled={trajectoryBusy}>
                Compute — near horizon (45d)
              </ActionButton>
              <ActionButton onClick={() => void computeTrajectory('medium')} disabled={trajectoryBusy}>
                Compute — medium horizon (120d)
              </ActionButton>
            </div>
            {trajectoryError && <div style={card}><ErrorNote text={trajectoryError} /></div>}
            {trajectoryBusy && <div style={card}><p style={dimText}>Computing from backend record…</p></div>}
            {!trajectoryBusy && !trajectoryError && !trajectory && (
              <div style={card}>
                <p style={dimText}>
                  No snapshot yet this session. Trajectory is computed on demand from unfinished business, decisions,
                  twin traits, tensions, and evolution history — it examines direction, not just current state.
                  Forecasts are probabilistic, not verdicts.
                </p>
              </div>
            )}
            {trajectory && (
              <>
                <div style={card}>
                  <div style={label}>Classification</div>
                  <p style={{ ...bodyText, color: 'rgba(201,162,39,0.85)', fontWeight: 500 }}>
                    {trajectory.overall_classification} · confidence {(trajectory.confidence * 100).toFixed(0)}%
                  </p>
                  <p style={{ ...bodyText, marginTop: 8 }}>{trajectory.summary_text}</p>
                </div>
                {trajectory.drift_warnings.length > 0 && (
                  <div style={card}>
                    <div style={label}>Drift Warnings</div>
                    {trajectory.drift_warnings.map((w, i) => (
                      <p key={i} style={{ ...bodyText, color: 'rgba(234,179,8,0.75)', marginBottom: 6 }}>{w}</p>
                    ))}
                  </div>
                )}
                <div style={card}>
                  <div style={label}>Projections</div>
                  <p style={bodyText}><strong style={{ color: 'rgba(226,232,240,0.85)' }}>If unchanged:</strong> {trajectory.projections.if_unchanged}</p>
                  <p style={{ ...bodyText, marginTop: 8 }}><strong style={{ color: 'rgba(226,232,240,0.85)' }}>If corrected:</strong> {trajectory.projections.if_corrected}</p>
                </div>
                {trajectory.correction_leverage.length > 0 && (
                  <div style={card}>
                    <div style={label}>Correction Leverage</div>
                    {trajectory.correction_leverage.map((c, i) => (
                      <p key={i} style={{ ...bodyText, marginBottom: 6 }}>— {c}</p>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Friction tab ── */}
        {httpOk && tab === 'friction' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <ActionButton onClick={() => void loadFriction()} disabled={frictionBusy}>Refresh</ActionButton>
              <ActionButton onClick={() => void rebuildFriction()} disabled={frictionBusy}>
                Rebuild from backend heuristics
              </ActionButton>
            </div>
            {frictionError && <div style={card}><ErrorNote text={frictionError} /></div>}
            {frictionBusy && <div style={card}><p style={dimText}>Loading…</p></div>}
            {!frictionBusy && !frictionError && frictionItems !== null && frictionItems.length === 0 && (
              <div style={card}>
                <p style={dimText}>
                  No active friction items. "Rebuild from backend heuristics" derives them from stalled decisions,
                  unfinished business, and recurring tension in your governed record.
                </p>
              </div>
            )}
            {frictionItems?.map((item, i) => (
              <div key={str(item, 'id') || i} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.85rem', color: 'rgba(226,232,240,0.85)' }}>{str(item, 'title')}</span>
                  <span style={{ fontSize: '0.65rem', color: 'rgba(234,179,8,0.7)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {str(item, 'friction_type')} · severity {str(item, 'severity')}
                  </span>
                </div>
                <p style={bodyText}>{str(item, 'description')}</p>
                {str(item, 'smallest_release') && (
                  <p style={{ ...dimText, marginTop: 8 }}>Smallest release: {str(item, 'smallest_release')}</p>
                )}
              </div>
            ))}
          </>
        )}

        {/* ── Threshold tab ── */}
        {httpOk && tab === 'threshold' && (
          <>
            {thresholdError && <div style={card}><ErrorNote text={thresholdError} /></div>}
            {thresholdBusy && <div style={card}><p style={dimText}>Loading…</p></div>}
            {!thresholdBusy && protocols !== null && protocols.length === 0 && (
              <div style={card}>
                <p style={dimText}>
                  No threshold protocols yet. A protocol is a pre-written agreement with yourself: when a named state
                  arrives (overload, spiral, conflict), what you will and will not trust, and what to do first.
                </p>
              </div>
            )}
            {protocols?.map((p, i) => {
              const pid = str(p, 'id');
              const active = activations.find((a) => str(a, 'protocol_id') === pid && !str(a, 'closed_at'));
              return (
                <div key={pid || i} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <span style={{ fontSize: '0.85rem', color: 'rgba(226,232,240,0.85)' }}>{str(p, 'title')}</span>
                    {active && (
                      <span style={{ fontSize: '0.65rem', color: 'rgba(239,68,68,0.75)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        Active
                      </span>
                    )}
                  </div>
                  <p style={bodyText}>{str(p, 'state_description')}</p>
                </div>
              );
            })}

            {/* Minimal creation */}
            <div style={card}>
              <div style={label}>New Protocol</div>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Name the state (e.g. Post-midnight decision spiral)"
                style={{
                  width: '100%', marginBottom: 8, background: 'var(--atlas-surface-inset)',
                  border: '1px solid var(--border-default)', borderRadius: 6, padding: '9px 11px',
                  color: 'rgba(226,232,240,0.88)', fontSize: '0.8rem', fontFamily: 'inherit', outline: 'none',
                }}
              />
              <textarea
                value={newStateDesc}
                onChange={(e) => setNewStateDesc(e.target.value)}
                placeholder="Describe how you recognize this state and what tends to go wrong in it."
                rows={3}
                style={{
                  width: '100%', marginBottom: 10, background: 'var(--atlas-surface-inset)',
                  border: '1px solid var(--border-default)', borderRadius: 6, padding: '9px 11px',
                  color: 'rgba(226,232,240,0.88)', fontSize: '0.8rem', fontFamily: 'inherit',
                  outline: 'none', resize: 'none', lineHeight: 1.6,
                }}
              />
              <ActionButton onClick={() => void createProtocol()} disabled={thresholdBusy || !newTitle.trim() || !newStateDesc.trim()}>
                Create protocol
              </ActionButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
