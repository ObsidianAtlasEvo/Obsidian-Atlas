/**
 * Atlas Evolution Control Panel
 * Phase 2 Governance — React UI
 *
 * Full dashboard for user inspection and control of Atlas personalization.
 * Freeze, revert, reset with nuclear options clearly labeled.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  freezeEvolution,
  unfreezeEvolution,
  revertEvolution,
  resetEvolutionDomains,
  inspectEvolution,
  isFrozen,
  type EvolutionInspectReport,
} from './userEvolutionControl';

interface EvolutionControlPanelProps {
  userId: string;
}

export const EvolutionControlPanel: React.FC<EvolutionControlPanelProps> = ({ userId }) => {
  const [report, setReport] = useState<EvolutionInspectReport | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'traits' | 'mutations' | 'controls'>('overview');

  const refresh = useCallback(() => {
    const r = inspectEvolution(userId);
    setReport(r);
    setFrozen(isFrozen(userId));
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleFreeze = () => {
    if (frozen) {
      unfreezeEvolution(userId);
      showMessage('info', 'Evolution resumed. Atlas will continue adapting.');
    } else {
      freezeEvolution(userId, 'User paused evolution from control panel');
      showMessage('success', 'Evolution frozen. Atlas will not adapt until you resume.');
    }
    refresh();
  };

  const handleRevert = async (stepsBack: number) => {
    setLoading(true);
    const result = revertEvolution(userId, { stepsBack }, 'User revert from control panel');
    if (result.success) {
      showMessage('success', `Reverted ${result.mutationsRolledBack} mutations to previous state.`);
    } else {
      showMessage('error', result.error ?? 'Revert failed.');
    }
    setLoading(false);
    refresh();
  };

  const handleReset = async (domain: 'traits' | 'mutations' | 'all') => {
    if (!window.confirm(`This will permanently reset your ${domain === 'all' ? 'entire evolution profile' : domain}. Are you sure?`)) return;
    setLoading(true);
    const result = resetEvolutionDomains(userId, [domain]);
    if (result.success) {
      showMessage('success', `Reset ${result.domainsReset.join(', ')} successfully.`);
    } else {
      showMessage('error', result.error ?? 'Reset failed.');
    }
    setLoading(false);
    refresh();
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return '#4ade80';
      case 'observed': return '#fbbf24';
      case 'decayed': return '#6b7280';
      case 'contradicted': return '#f87171';
      default: return '#9ca3af';
    }
  };

  const mutationStatusColor = (status: string) => {
    switch (status) {
      case 'committed': return '#4ade80';
      case 'quarantined': return '#f87171';
      case 'rolled_back': return '#6b7280';
      case 'pending_approval': return '#fbbf24';
      default: return '#9ca3af';
    }
  };

  if (!report) return <div style={{ color: '#9ca3af', fontSize: 12, padding: 24 }}>Loading evolution data…</div>;

  return (
    <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#e5e7eb', background: '#0a0a0a', minHeight: '100%', padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 16, fontFamily: 'serif', color: '#f5f0e8', letterSpacing: '0.1em' }}>Evolution Control</div>
          <div style={{ color: '#6b7280', fontSize: 10, marginTop: 2 }}>Atlas Personalization Dashboard</div>
        </div>
        <button
          onClick={handleFreeze}
          style={{
            padding: '8px 16px',
            background: frozen ? '#16a34a20' : '#dc262620',
            border: `1px solid ${frozen ? '#16a34a' : '#dc2626'}`,
            color: frozen ? '#4ade80' : '#f87171',
            fontSize: 11,
            letterSpacing: '0.15em',
            cursor: 'pointer',
            textTransform: 'uppercase',
          }}
        >
          {frozen ? '▶ Resume Evolution' : '⏸ Freeze Evolution'}
        </button>
      </div>

      {/* Status Message */}
      {message && (
        <div style={{
          padding: '10px 14px',
          marginBottom: 16,
          background: message.type === 'error' ? '#dc262615' : message.type === 'success' ? '#16a34a15' : '#1d4ed815',
          border: `1px solid ${message.type === 'error' ? '#dc2626' : message.type === 'success' ? '#16a34a' : '#1d4ed8'}`,
          color: message.type === 'error' ? '#f87171' : message.type === 'success' ? '#4ade80' : '#60a5fa',
          fontSize: 11,
        }}>
          {message.text}
        </div>
      )}

      {frozen && (
        <div style={{ padding: '8px 12px', marginBottom: 16, background: '#1d4ed815', border: '1px solid #1d4ed8', color: '#60a5fa', fontSize: 11 }}>
          Evolution is frozen. Atlas is not adapting until you resume.
        </div>
      )}

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Committed', value: report.committedMutations, color: '#4ade80' },
          { label: 'Quarantined', value: report.quarantinedMutations, color: '#f87171' },
          { label: 'Confirmed Traits', value: report.confirmedTraits, color: '#a78bfa' },
          { label: 'Observed Traits', value: report.observedTraits, color: '#fbbf24' },
        ].map((stat) => (
          <div key={stat.label} style={{ padding: 12, border: '1px solid #1f2937', background: '#111' }}>
            <div style={{ color: stat.color, fontSize: 20, fontWeight: 'bold' }}>{stat.value}</div>
            <div style={{ color: '#6b7280', fontSize: 10, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #1f2937' }}>
        {(['overview', 'traits', 'mutations', 'controls'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '8px 16px', background: 'none', border: 'none',
            borderBottom: activeTab === tab ? '2px solid #d4af37' : '2px solid transparent',
            color: activeTab === tab ? '#d4af37' : '#6b7280',
            fontSize: 11, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em',
          }}>{tab}</button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div style={{ color: '#9ca3af', fontSize: 11, lineHeight: 1.8 }}>
          <p>Total mutations processed: <span style={{ color: '#e5e7eb' }}>{report.totalMutations}</span></p>
          <p>Rolled back: <span style={{ color: '#e5e7eb' }}>{report.rolledBackMutations}</span></p>
          <p>Available snapshots: <span style={{ color: '#e5e7eb' }}>{report.snapshots}</span></p>
          <p>Report generated: <span style={{ color: '#e5e7eb' }}>{new Date(report.generatedAt).toLocaleString()}</span></p>
        </div>
      )}

      {/* Traits Tab */}
      {activeTab === 'traits' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {report.traitSummary.length === 0 && <div style={{ color: '#6b7280' }}>No traits recorded yet.</div>}
          {report.traitSummary.map((t, i) => (
            <div key={i} style={{ padding: '8px 12px', border: '1px solid #1f2937', background: '#0d0d0d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ color: '#d4af37', marginRight: 8 }}>{t.trait}:</span>
                <span style={{ color: '#e5e7eb' }}>{t.value}</span>
                <span style={{ color: '#4b5563', marginLeft: 8, fontSize: 10 }}>[{t.class}]</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 60, height: 4, background: '#1f2937', borderRadius: 2 }}>
                  <div style={{ width: `${Math.round(t.confidence * 100)}%`, height: '100%', background: statusColor(t.status), borderRadius: 2 }} />
                </div>
                <span style={{ color: statusColor(t.status), fontSize: 10, textTransform: 'uppercase' }}>{t.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mutations Tab */}
      {activeTab === 'mutations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {report.recentMutations.length === 0 && <div style={{ color: '#6b7280' }}>No mutations recorded yet.</div>}
          {report.recentMutations.map((m) => (
            <div key={m.id} style={{ padding: '10px 12px', border: '1px solid #1f2937', background: '#0d0d0d' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#6b7280', fontSize: 10 }}>{new Date(m.timestamp).toLocaleString()}</span>
                <span style={{ color: mutationStatusColor(m.status), fontSize: 10, textTransform: 'uppercase' }}>{m.status}</span>
              </div>
              <div style={{ color: '#e5e7eb', marginBottom: 4 }}>{m.instruction}</div>
              <div style={{ color: '#6b7280', fontSize: 10 }}>Source: {m.traitSource} · Strength: {Math.round(m.signalStrength * 100)}%</div>
            </div>
          ))}
        </div>
      )}

      {/* Controls Tab */}
      {activeTab === 'controls' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: 16, border: '1px solid #1f2937', background: '#0d0d0d' }}>
            <div style={{ color: '#e5e7eb', marginBottom: 8, fontSize: 13 }}>Revert</div>
            <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 12 }}>Roll back Atlas adaptations to a previous state.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[1, 3, 5].map((n) => (
                <button key={n} onClick={() => handleRevert(n)} disabled={loading || report.snapshots === 0} style={{
                  padding: '8px 14px', background: '#1a1a1a', border: '1px solid #374151',
                  color: '#9ca3af', fontSize: 11, cursor: 'pointer',
                }}>Revert {n} step{n > 1 ? 's' : ''}</button>
              ))}
            </div>
          </div>

          <div style={{ padding: 16, border: '1px solid #7f1d1d', background: '#0d0d0d' }}>
            <div style={{ color: '#f87171', marginBottom: 8, fontSize: 13 }}>Nuclear Options</div>
            <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 12 }}>These actions are irreversible. Atlas will lose accumulated personalization.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => handleReset('mutations')} disabled={loading} style={{
                padding: '8px 14px', background: '#7f1d1d20', border: '1px solid #7f1d1d',
                color: '#fca5a5', fontSize: 11, cursor: 'pointer',
              }}>Reset All Mutations</button>
              <button onClick={() => handleReset('all')} disabled={loading} style={{
                padding: '8px 14px', background: '#7f1d1d40', border: '1px solid #dc2626',
                color: '#f87171', fontSize: 11, cursor: 'pointer', fontWeight: 'bold',
              }}>Full Profile Reset</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 24, color: '#374151', fontSize: 10, textAlign: 'right' }}>
        <button onClick={refresh} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 10 }}>↻ Refresh</button>
      </div>
    </div>
  );
};

export default EvolutionControlPanel;
