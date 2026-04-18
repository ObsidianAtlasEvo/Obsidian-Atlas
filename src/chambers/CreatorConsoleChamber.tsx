import React, { useState } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { generateId, nowISO } from '../lib/persistence';

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

const LABEL_STYLE: React.CSSProperties = {
  fontSize: '0.62rem',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: C.muted,
};

const PANEL_STYLE: React.CSSProperties = {
  background: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: '20px 24px',
};

const INSET_STYLE: React.CSSProperties = {
  background: C.inset,
  border: `1px solid ${C.borderS}`,
  borderRadius: 8,
  padding: '14px 18px',
};

const BTN: React.CSSProperties = {
  background: 'rgba(88,28,135,0.18)',
  border: `1px solid rgba(88,28,135,0.35)`,
  borderRadius: 8,
  color: C.violet,
  fontSize: '0.78rem',
  fontWeight: 600,
  padding: '8px 18px',
  cursor: 'pointer',
  letterSpacing: '0.04em',
  transition: 'background 200ms',
};

const BTN_DANGER: React.CSSProperties = {
  ...BTN,
  background: 'rgba(239,68,68,0.12)',
  border: `1px solid rgba(239,68,68,0.35)`,
  color: C.danger,
};

const BTN_SUCCESS: React.CSSProperties = {
  ...BTN,
  background: 'rgba(34,197,94,0.1)',
  border: `1px solid rgba(34,197,94,0.3)`,
  color: C.success,
};

const FADE_IN: React.CSSProperties = { animation: 'atlas-fade-in 300ms ease both' };

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="cc-stat" style={{ ...INSET_STYLE, minWidth: 100, flex: 1 }}>
      <div style={LABEL_STYLE}>{label}</div>
      <div style={{ fontSize: '1.55rem', fontWeight: 700, color: color ?? C.gold, marginTop: 6 }}>
        {value}
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    low: C.teal, medium: C.amber, high: C.danger, critical: C.danger,
  };
  return (
    <span style={{
      background: `${map[severity] ?? C.muted}22`,
      border: `1px solid ${map[severity] ?? C.muted}55`,
      borderRadius: 6,
      color: map[severity] ?? C.muted,
      fontSize: '0.65rem',
      fontWeight: 700,
      letterSpacing: '0.1em',
      padding: '2px 8px',
      textTransform: 'uppercase',
    }}>
      {severity}
    </span>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'ai_governance' | 'bug_hunter' | 'emergency';

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'System Overview' },
    { id: 'ai_governance', label: 'AI Governance' },
    { id: 'bug_hunter', label: 'Bug Hunter' },
    { id: 'emergency', label: 'Emergency' },
  ];
  return (
    <div className="cc-tabs" style={{ display: 'flex', gap: 4, background: C.inset, borderRadius: 10, padding: 4, border: `1px solid ${C.borderS}` }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            flex: 1,
            background: active === t.id ? 'rgba(88,28,135,0.28)' : 'transparent',
            border: active === t.id ? `1px solid rgba(88,28,135,0.4)` : '1px solid transparent',
            borderRadius: 7,
            color: active === t.id ? C.violet : C.muted,
            fontSize: '0.74rem',
            fontWeight: active === t.id ? 700 : 500,
            padding: '8px 14px',
            cursor: 'pointer',
            letterSpacing: '0.04em',
            transition: 'all 200ms',
            whiteSpace: 'nowrap',
          }}
        >
          {t.label}
          {t.id === 'emergency' && (
            <span style={{ marginLeft: 6, display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: C.danger, verticalAlign: 'middle' }} />
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  currentUser,
  emergencyStatus,
  bugHunter,
  store,
}: {
  currentUser: any;
  emergencyStatus: any;
  bugHunter: any;
  store: any;
}) {
  const memories = store.memories ?? [];
  const journalEntries = store.journalEntries ?? [];
  const decisions = store.decisions ?? [];
  const doctrineItems = store.doctrineItems ?? [];
  const directives = store.directives ?? [];

  const handleActivateEmergency = () => {
    if (window.confirm('Activate Emergency Containment? This will lock down system access and trigger forensic logging.')) {
      store.setEmergencyStatus?.({
        active: true,
        activatedAt: nowISO(),
        activatedBy: currentUser?.uid ?? 'sovereign_creator',
        reason: 'Manual activation from Creator Console',
        level: 1,
        forensicSnapshot: {
          configState: {},
          authLogs: ['manual-activation'],
          activeSessions: [],
          timestamp: nowISO(),
        },
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, ...FADE_IN }}>
      {/* System Vitals */}
      <div style={PANEL_STYLE}>
        <div style={{ ...LABEL_STYLE, marginBottom: 14 }}>System Vitals</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatCard label="Memories" value={memories.length} color={C.violet} />
          <StatCard label="Journal" value={journalEntries.length} color={C.teal} />
          <StatCard label="Decisions" value={decisions.length} color={C.indigo} />
          <StatCard label="Doctrine" value={doctrineItems.length} color={C.gold} />
          <StatCard label="Directives" value={directives.length} color={C.amber} />
        </div>
      </div>

      {/* Identity & Auth */}
      <div style={PANEL_STYLE}>
        <div style={{ ...LABEL_STYLE, marginBottom: 14 }}>Identity & Auth</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="cc-inset-flex" style={{ ...INSET_STYLE, flex: 1 }}>
            <div style={LABEL_STYLE}>Role</div>
            <div style={{ color: C.gold, fontWeight: 700, fontSize: '0.9rem', marginTop: 4 }}>
              {currentUser?.role ?? '—'}
            </div>
          </div>
          <div className="cc-inset-flex" style={{ ...INSET_STYLE, flex: 1, minWidth: 0 }}>
            <div style={LABEL_STYLE}>UID</div>
            <div className="cc-uid" style={{ color: C.text, fontSize: '0.82rem', marginTop: 4, fontFamily: 'monospace', wordBreak: 'break-all', overflowWrap: 'break-word' }}>
              {currentUser?.uid ?? '—'}
            </div>
          </div>
          <div className="cc-inset-flex" style={{ ...INSET_STYLE, flex: 1 }}>
            <div style={LABEL_STYLE}>Auth Status</div>
            <div style={{ color: C.success, fontWeight: 700, fontSize: '0.88rem', marginTop: 4 }}>
              {currentUser ? 'Authenticated' : 'Unauthenticated'}
            </div>
          </div>
          <div className="cc-inset-flex" style={{ ...INSET_STYLE, flex: 1 }}>
            <div style={LABEL_STYLE}>Session Uptime</div>
            <div style={{ color: C.muted, fontSize: '0.82rem', marginTop: 4 }}>
              {(() => {
                const start = currentUser?.sessionStart;
                if (!start) return 'Unknown';
                const ms = Date.now() - new Date(start).getTime();
                const m = Math.floor(ms / 60000);
                return m < 1 ? '<1m' : `${m}m`;
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Bug Hunter Status */}
      <div style={PANEL_STYLE}>
        <div style={{ ...LABEL_STYLE, marginBottom: 12 }}>Bug Hunter Status</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: bugHunter?.isActive ? C.success : C.dim,
            boxShadow: bugHunter?.isActive ? `0 0 8px ${C.success}` : 'none',
            flexShrink: 0,
          }} />
          <span style={{ color: bugHunter?.isActive ? C.success : C.muted, fontWeight: 600, fontSize: '0.84rem' }}>
            {bugHunter?.isActive ? 'Active — monitoring enabled' : 'Inactive'}
          </span>
          {bugHunter?.isActive && (
            <span style={{ color: C.muted, fontSize: '0.78rem', marginLeft: 8 }}>
              {bugHunter.ledger?.length ?? 0} entries in ledger
            </span>
          )}
        </div>
      </div>

      {/* Emergency Containment */}
      <div style={{ ...PANEL_STYLE, border: `1px solid ${emergencyStatus?.active ? 'rgba(239,68,68,0.4)' : C.border}` }}>
        <div style={{ ...LABEL_STYLE, marginBottom: 14, color: emergencyStatus?.active ? C.danger : C.muted }}>
          Emergency Containment
        </div>
        {emergencyStatus?.active ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ ...INSET_STYLE }}>
                <div style={LABEL_STYLE}>Level</div>
                <div style={{ color: C.danger, fontWeight: 700, fontSize: '1.2rem' }}>{emergencyStatus.level}</div>
              </div>
              <div style={{ ...INSET_STYLE, flex: 1 }}>
                <div style={LABEL_STYLE}>Activated At</div>
                <div style={{ color: C.muted, fontSize: '0.82rem', marginTop: 4 }}>
                  {emergencyStatus.activatedAt ? new Date(emergencyStatus.activatedAt).toLocaleString() : '—'}
                </div>
              </div>
            </div>
            <div style={INSET_STYLE}>
              <div style={LABEL_STYLE}>Reason</div>
              <div style={{ color: C.text, fontSize: '0.84rem', marginTop: 4 }}>{emergencyStatus.reason ?? '—'}</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ color: C.muted, fontSize: '0.84rem' }}>
              No active containment. System operating normally.
            </div>
            <button
              style={BTN_DANGER}
              onClick={handleActivateEmergency}
            >
              Activate Emergency Containment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AI Governance Tab ────────────────────────────────────────────────────────

function AIGovernanceTab({ store }: { store: any }) {
  const posture = store.adaptivePosture ?? { mode: 'balanced', learningEnabled: true, resonanceMode: 'standard' };

  const rows: { label: string; value: string; color?: string }[] = [
    { label: 'Adaptive Posture Mode', value: posture.mode ?? 'balanced', color: C.violet },
    { label: 'Resonance Mode', value: posture.resonanceMode ?? 'standard', color: C.teal },
    { label: 'Learning Status', value: posture.learningEnabled ? 'Enabled' : 'Disabled', color: posture.learningEnabled ? C.success : C.danger },
    { label: 'Inference Sensitivity', value: posture.inferenceSensitivity ?? 'moderate', color: C.amber },
    { label: 'Memory Consolidation', value: posture.memoryConsolidation ?? 'auto', color: C.indigo },
    { label: 'Doctrine Enforcement', value: posture.doctrineEnforcement ?? 'strict', color: C.gold },
    { label: 'Context Window Policy', value: posture.contextWindowPolicy ?? 'full', color: C.muted },
    { label: 'Safety Guardrails', value: posture.safetyGuardrails ?? 'active', color: C.success },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, ...FADE_IN }}>
      <div style={PANEL_STYLE}>
        <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>Behavioral Configuration</div>
        <div style={{ color: C.muted, fontSize: '0.78rem', marginBottom: 16 }}>
          Read-only overview of the system's current AI behavioral settings. Modify via Doctrine or Directive chambers.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {rows.map(r => (
            <div key={r.label} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '11px 16px',
              borderBottom: `1px solid ${C.borderS}`,
            }}>
              <div style={{ color: C.muted, fontSize: '0.82rem' }}>{r.label}</div>
              <div style={{ color: r.color ?? C.text, fontWeight: 600, fontSize: '0.84rem', textTransform: 'capitalize' }}>
                {r.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={PANEL_STYLE}>
        <div style={{ ...LABEL_STYLE, marginBottom: 12 }}>Current Posture Summary</div>
        <div style={{ ...INSET_STYLE, color: C.muted, fontSize: '0.83rem', lineHeight: 1.7 }}>
          The system is operating in{' '}
          <span style={{ color: C.violet, fontWeight: 600 }}>{posture.mode ?? 'balanced'}</span> mode
          with resonance set to{' '}
          <span style={{ color: C.teal, fontWeight: 600 }}>{posture.resonanceMode ?? 'standard'}</span>.
          Continuous learning is{' '}
          <span style={{ color: posture.learningEnabled ? C.success : C.danger, fontWeight: 600 }}>
            {posture.learningEnabled ? 'enabled' : 'disabled'}
          </span>.
          All doctrine rules are being enforced with{' '}
          <span style={{ color: C.gold, fontWeight: 600 }}>{posture.doctrineEnforcement ?? 'strict'}</span> priority.
        </div>
      </div>
    </div>
  );
}

// ─── Bug Hunter Tab ───────────────────────────────────────────────────────────

interface BugEntry {
  id: string;
  name: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: string;
  affectedSurface: string;
  description?: string;
  detectedAt?: string;
  stackTrace?: string;
}

function BugHunterTab({ bugHunter, store }: { bugHunter: any; store: any }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const ledger: BugEntry[] = bugHunter?.ledger ?? [];

  const toggleActive = () => {
    store.setBugHunter?.({ ...bugHunter, isActive: !bugHunter?.isActive });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, ...FADE_IN }}>
      <div style={{ ...PANEL_STYLE, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>Bug Hunter Engine</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: bugHunter?.isActive ? C.success : C.dim,
              boxShadow: bugHunter?.isActive ? `0 0 8px ${C.success}` : 'none',
            }} />
            <span style={{ color: bugHunter?.isActive ? C.success : C.muted, fontWeight: 600, fontSize: '0.85rem' }}>
              {bugHunter?.isActive ? 'Active — system monitoring enabled' : 'Inactive — monitoring paused'}
            </span>
          </div>
        </div>
        <button
          style={bugHunter?.isActive ? BTN_DANGER : BTN_SUCCESS}
          onClick={toggleActive}
        >
          {bugHunter?.isActive ? 'Deactivate' : 'Activate'}
        </button>
      </div>

      {!bugHunter?.isActive && (
        <div style={{ ...INSET_STYLE, color: C.muted, fontSize: '0.83rem', textAlign: 'center', padding: '32px 24px' }}>
          Bug Hunter is inactive. Activate above to enable real-time system monitoring and anomaly detection.
        </div>
      )}

      {bugHunter?.isActive && ledger.length === 0 && (
        <div style={{ ...INSET_STYLE, color: C.muted, fontSize: '0.83rem', textAlign: 'center', padding: '32px 24px' }}>
          No entries in bug ledger. The system is clean.
        </div>
      )}

      {bugHunter?.isActive && ledger.length > 0 && (
        <div style={PANEL_STYLE}>
          <div style={{ ...LABEL_STYLE, marginBottom: 14 }}>Bug Ledger — {ledger.length} entries</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr 2fr',
              gap: 10,
              padding: '6px 12px',
              borderBottom: `1px solid ${C.border}`,
            }}>
              {['Name', 'Category', 'Severity', 'Status', 'Surface'].map(h => (
                <div key={h} style={LABEL_STYLE}>{h}</div>
              ))}
            </div>
            {ledger.map(bug => (
              <div key={bug.id}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 1fr 2fr',
                    gap: 10,
                    padding: '10px 12px',
                    background: expanded === bug.id ? 'rgba(88,28,135,0.1)' : 'transparent',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'background 150ms',
                    borderBottom: `1px solid ${C.borderS}`,
                  }}
                  onClick={() => setExpanded(expanded === bug.id ? null : bug.id)}
                >
                  <div style={{ color: C.text, fontSize: '0.83rem', fontWeight: 500 }}>{bug.name}</div>
                  <div style={{ color: C.muted, fontSize: '0.78rem' }}>{bug.category}</div>
                  <SeverityBadge severity={bug.severity} />
                  <div style={{ color: C.muted, fontSize: '0.78rem' }}>{bug.status}</div>
                  <div style={{ color: C.dim, fontSize: '0.78rem' }}>{bug.affectedSurface}</div>
                </div>
                {expanded === bug.id && (
                  <div style={{ ...INSET_STYLE, margin: '4px 0 8px', ...FADE_IN }}>
                    <div className="cc-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 12 }}>
                      <div>
                        <div style={LABEL_STYLE}>Description</div>
                        <div style={{ color: C.text, fontSize: '0.82rem', marginTop: 4 }}>{bug.description ?? '—'}</div>
                      </div>
                      <div>
                        <div style={LABEL_STYLE}>Detected At</div>
                        <div style={{ color: C.muted, fontSize: '0.82rem', marginTop: 4 }}>
                          {bug.detectedAt ? new Date(bug.detectedAt).toLocaleString() : '—'}
                        </div>
                      </div>
                    </div>
                    {bug.stackTrace && (
                      <div>
                        <div style={LABEL_STYLE}>Stack Trace</div>
                        <pre style={{
                          background: 'rgba(0,0,0,0.5)',
                          borderRadius: 6,
                          padding: '10px 12px',
                          color: C.muted,
                          fontSize: '0.72rem',
                          fontFamily: 'monospace',
                          overflow: 'auto',
                          maxHeight: 120,
                          marginTop: 6,
                          whiteSpace: 'pre-wrap',
                        }}>
                          {bug.stackTrace}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Emergency Tab ────────────────────────────────────────────────────────────

const LEVEL_CONFIG = [
  { level: 1 as const, label: 'Level 1 — Watchful', color: C.amber, desc: 'Elevated monitoring. No access restrictions. Forensic logging enabled.' },
  { level: 2 as const, label: 'Level 2 — Guarded', color: 'rgba(249,115,22,0.85)', desc: 'Restricted write access. Read-only mode for non-creators. Incident log opened.' },
  { level: 3 as const, label: 'Level 3 — Critical', color: C.danger, desc: 'Full access lockdown. Only sovereign_creator may operate. All sessions terminated.' },
  { level: 4 as const, label: 'Level 4 — Total Blackout', color: C.danger, desc: 'System frozen. No reads or writes. Cryptographic seal engaged. Manual recovery required.', pulse: true },
];

function EmergencyTab({
  emergencyStatus,
  currentUser,
  store,
}: {
  emergencyStatus: any;
  currentUser: any;
  store: any;
}) {
  const [selectedLevel, setSelectedLevel] = useState<1 | 2 | 3 | 4>(1);
  const [reason, setReason] = useState('');

  const activate = () => {
    if (!reason.trim()) { alert('A reason is required to activate emergency containment.'); return; }
    store.setEmergencyStatus?.({
      active: true,
      activatedAt: nowISO(),
      activatedBy: currentUser?.uid ?? 'sovereign_creator',
      reason,
      level: selectedLevel,
      forensicSnapshot: {
        configState: {},
        authLogs: ['manual-activation', `level-${selectedLevel}`],
        activeSessions: [],
        timestamp: nowISO(),
      },
    });
    setReason('');
  };

  const lift = () => {
    if (!window.confirm('Lift Emergency Containment? This will restore normal system access.')) return;
    store.setEmergencyStatus?.({
      ...emergencyStatus,
      active: false,
      liftedAt: nowISO(),
      liftedBy: currentUser?.uid ?? 'sovereign_creator',
    });
  };

  if (emergencyStatus?.active) {
    const lvl = emergencyStatus.level ?? 1;
    const lvlCfg = LEVEL_CONFIG[lvl - 1];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, ...FADE_IN }}>
        {/* Level bar */}
        <div style={{
          background: `${lvlCfg?.color ?? C.danger}18`,
          border: `1px solid ${lvlCfg?.color ?? C.danger}55`,
          borderRadius: 10,
          padding: '18px 22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <div>
            <div style={{ color: lvlCfg?.color ?? C.danger, fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.04em' }}>
              ⚠ CONTAINMENT ACTIVE — {lvlCfg?.label.toUpperCase()}
            </div>
            <div style={{ color: C.muted, fontSize: '0.8rem', marginTop: 4 }}>{lvlCfg?.desc}</div>
          </div>
          <div style={{
            background: lvlCfg?.color,
            borderRadius: '50%',
            width: 42,
            height: 42,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 900,
            fontSize: '1.2rem',
            color: '#050505',
            flexShrink: 0,
          }}>
            {lvl}
          </div>
        </div>

        {/* Details */}
        <div className="cc-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={INSET_STYLE}>
            <div style={LABEL_STYLE}>Activated At</div>
            <div style={{ color: C.text, fontSize: '0.84rem', marginTop: 4 }}>
              {emergencyStatus.activatedAt ? new Date(emergencyStatus.activatedAt).toLocaleString() : '—'}
            </div>
          </div>
          <div style={INSET_STYLE}>
            <div style={LABEL_STYLE}>Activated By</div>
            <div style={{ color: C.gold, fontWeight: 600, fontSize: '0.84rem', marginTop: 4 }}>
              {emergencyStatus.activatedBy ?? '—'}
            </div>
          </div>
        </div>

        <div style={INSET_STYLE}>
          <div style={LABEL_STYLE}>Reason</div>
          <div style={{ color: C.text, fontSize: '0.84rem', marginTop: 4 }}>{emergencyStatus.reason ?? '—'}</div>
        </div>

        {/* Forensic snapshot */}
        {emergencyStatus.forensicSnapshot && (
          <div style={PANEL_STYLE}>
            <div style={{ ...LABEL_STYLE, marginBottom: 12 }}>Forensic Snapshot</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={INSET_STYLE}>
                <div style={LABEL_STYLE}>Snapshot Timestamp</div>
                <div style={{ color: C.muted, fontSize: '0.82rem', fontFamily: 'monospace', marginTop: 4 }}>
                  {emergencyStatus.forensicSnapshot.timestamp}
                </div>
              </div>
              <div style={INSET_STYLE}>
                <div style={LABEL_STYLE}>Auth Logs</div>
                <div style={{ color: C.muted, fontSize: '0.78rem', marginTop: 4 }}>
                  {emergencyStatus.forensicSnapshot.authLogs?.join(', ') || '—'}
                </div>
              </div>
              <div style={INSET_STYLE}>
                <div style={LABEL_STYLE}>Active Sessions at Activation</div>
                <div style={{ color: C.muted, fontSize: '0.78rem', marginTop: 4 }}>
                  {emergencyStatus.forensicSnapshot.activeSessions?.length
                    ? emergencyStatus.forensicSnapshot.activeSessions.join(', ')
                    : 'None'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recovery plan */}
        {emergencyStatus.recoveryPlan && (
          <div style={INSET_STYLE}>
            <div style={LABEL_STYLE}>Recovery Plan</div>
            <div style={{ color: C.text, fontSize: '0.82rem', marginTop: 4, lineHeight: 1.6 }}>
              {emergencyStatus.recoveryPlan}
            </div>
          </div>
        )}

        <button style={{ ...BTN_SUCCESS, padding: '12px 28px', fontSize: '0.84rem' }} onClick={lift}>
          Lift Containment
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, ...FADE_IN }}>
      <div style={PANEL_STYLE}>
        <div style={{ ...LABEL_STYLE, marginBottom: 14 }}>Select Containment Level</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {LEVEL_CONFIG.map(cfg => (
            <button
              key={cfg.level}
              onClick={() => setSelectedLevel(cfg.level)}
              style={{
                background: selectedLevel === cfg.level ? `${cfg.color}1A` : C.inset,
                border: `1px solid ${selectedLevel === cfg.level ? cfg.color + '77' : C.borderS}`,
                borderRadius: 8,
                padding: '14px 18px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                textAlign: 'left',
                transition: 'all 200ms',
                ...(cfg.pulse && selectedLevel === cfg.level ? { animation: 'atlas-fade-in 300ms ease both' } : {}),
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: selectedLevel === cfg.level ? cfg.color : 'rgba(255,255,255,0.05)',
                border: `2px solid ${cfg.color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: '0.9rem',
                color: selectedLevel === cfg.level ? '#050505' : cfg.color,
                flexShrink: 0,
              }}>
                {cfg.level}
              </div>
              <div>
                <div style={{ color: cfg.color, fontWeight: 700, fontSize: '0.85rem' }}>{cfg.label}</div>
                <div style={{ color: C.muted, fontSize: '0.76rem', marginTop: 3 }}>{cfg.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div style={PANEL_STYLE}>
        <div style={{ ...LABEL_STYLE, marginBottom: 10 }}>Activation Reason</div>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Document the reason for emergency activation..."
          style={{
            width: '100%',
            minHeight: 90,
            background: C.inset,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            color: C.text,
            fontSize: '0.84rem',
            padding: '12px 14px',
            resize: 'vertical',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            style={{
              ...BTN_DANGER,
              padding: '11px 28px',
              fontSize: '0.85rem',
              opacity: reason.trim() ? 1 : 0.45,
            }}
            onClick={activate}
          >
            Activate Level {selectedLevel} Containment
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CreatorConsoleChamber() {
  const currentUser = useAtlasStore((s: any) => s.currentUser);
  const emergencyStatus = useAtlasStore((s: any) => s.emergencyStatus);
  const creatorConsoleState = useAtlasStore((s: any) => s.creatorConsoleState);
  const bugHunter = useAtlasStore((s: any) => s.bugHunter);
  const store = useAtlasStore((s: any) => s);

  const [activeTab, setActiveTab] = useState<Tab>(
    (creatorConsoleState?.activeTab as Tab) ?? 'overview'
  );

  // Access check
  if (!currentUser || currentUser.role !== 'sovereign_creator') {
    return (
      <div style={{
        minHeight: '100vh',
        background: C.body,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...FADE_IN,
      }}>
        <div style={{
          ...PANEL_STYLE,
          textAlign: 'center',
          maxWidth: 440,
          padding: '48px 40px',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(239,68,68,0.12)',
            border: `2px solid ${C.danger}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
            fontSize: '1.5rem',
          }}>
            🔒
          </div>
          <div style={{ color: C.danger, fontWeight: 800, fontSize: '1.05rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Access Denied
          </div>
          <div style={{ color: C.muted, fontSize: '0.84rem', marginTop: 12, lineHeight: 1.6 }}>
            The Creator Console is restricted to <span style={{ color: C.gold }}>sovereign_creator</span> accounts only.
            Your current role — <span style={{ color: C.violet }}>{currentUser?.role ?? 'unauthenticated'}</span> — does not have the required clearance.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cc-chamber" style={{
      minHeight: '100vh',
      background: C.body,
      color: C.text,
      fontFamily: "'Inter', system-ui, sans-serif",
      padding: '32px 28px',
      boxSizing: 'border-box',
      maxWidth: 1100,
      margin: '0 auto',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 28, ...FADE_IN }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ ...LABEL_STYLE, color: C.gold, marginBottom: 4 }}>Sovereign Creator</div>
            <h1 style={{ margin: 0, fontSize: '1.55rem', fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>
              Creator Console
            </h1>
            <div style={{ color: C.muted, fontSize: '0.8rem', marginTop: 4 }}>
              System-wide governance and emergency administration
            </div>
          </div>
          {emergencyStatus?.active && (
            <div style={{
              background: 'rgba(239,68,68,0.12)',
              border: `1px solid rgba(239,68,68,0.45)`,
              borderRadius: 8,
              padding: '8px 16px',
              color: C.danger,
              fontWeight: 700,
              fontSize: '0.78rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}>
              ⚠ Containment Active — L{emergencyStatus.level}
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ marginBottom: 24 }}>
        <TabBar active={activeTab} onChange={setActiveTab} />
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <OverviewTab
          currentUser={currentUser}
          emergencyStatus={emergencyStatus}
          bugHunter={bugHunter}
          store={store}
        />
      )}
      {activeTab === 'ai_governance' && <AIGovernanceTab store={store} />}
      {activeTab === 'bug_hunter' && <BugHunterTab bugHunter={bugHunter} store={store} />}
      {activeTab === 'emergency' && (
        <EmergencyTab
          emergencyStatus={emergencyStatus}
          currentUser={currentUser}
          store={store}
        />
      )}

      <style>{`
        @keyframes atlas-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 640px) {
          .cc-chamber { padding: 16px 14px !important; }
          .cc-tabs {
            overflow-x: auto !important;
            flex-wrap: nowrap !important;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
          }
          .cc-tabs::-webkit-scrollbar { display: none; }
          .cc-tabs > button {
            flex: 0 0 auto !important;
            padding: 8px 12px !important;
          }
          .cc-stat { min-width: 0 !important; flex: 1 1 45% !important; }
          .cc-inset-flex { flex: 1 1 45% !important; min-width: 0 !important; }
          .cc-uid {
            font-size: 0.72rem !important;
            word-break: break-all !important;
            overflow-wrap: break-word !important;
          }
          .cc-grid-2 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
