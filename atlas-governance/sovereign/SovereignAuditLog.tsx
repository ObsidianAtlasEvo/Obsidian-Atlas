/**
 * Atlas Sovereign Audit Log
 * Phase 2 Governance — React UI
 *
 * Paginated audit table for creator console.
 * Filter by action, date, severity. JSON export.
 */

import React, { useState, useMemo } from 'react';

export type AuditSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  permission?: string;
  severity: AuditSeverity;
  details: Record<string, unknown>;
  sessionId?: string;
}

const auditLog: AuditEntry[] = [];

export function logAuditEntry(
  action: string,
  actor: string,
  severity: AuditSeverity,
  details: Record<string, unknown> = {},
  permission?: string,
  sessionId?: string
): AuditEntry {
  const entry: AuditEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    action,
    actor,
    permission,
    severity,
    details,
    sessionId,
  };
  auditLog.push(entry);
  return entry;
}

export function getAuditLog(filters?: {
  severity?: AuditSeverity;
  action?: string;
  since?: string;
  limit?: number;
}): AuditEntry[] {
  let result = [...auditLog];
  if (filters?.severity) result = result.filter((e) => e.severity === filters.severity);
  if (filters?.action) result = result.filter((e) => e.action.includes(filters.action!));
  if (filters?.since) result = result.filter((e) => e.timestamp >= filters.since!);
  result.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  if (filters?.limit) result = result.slice(0, filters.limit);
  return result;
}

const SEVERITY_COLORS: Record<AuditSeverity, string> = {
  info: '#60a5fa',
  low: '#4ade80',
  medium: '#fbbf24',
  high: '#f97316',
  critical: '#f87171',
};

const PAGE_SIZE = 25;

interface SovereignAuditLogProps {
  initialEntries?: AuditEntry[];
}

export const SovereignAuditLog: React.FC<SovereignAuditLogProps> = ({ initialEntries }) => {
  const [entries] = useState<AuditEntry[]>(initialEntries ?? getAuditLog({ limit: 200 }));
  const [page, setPage] = useState(1);
  const [filterSeverity, setFilterSeverity] = useState<AuditSeverity | 'all'>('all');
  const [filterAction, setFilterAction] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = entries;
    if (filterSeverity !== 'all') result = result.filter((e) => e.severity === filterSeverity);
    if (filterAction.trim()) result = result.filter((e) => e.action.toLowerCase().includes(filterAction.toLowerCase()));
    return result;
  }, [entries, filterSeverity, filterAction]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atlas-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const s: Record<string, React.CSSProperties> = {
    root: { fontFamily: 'monospace', fontSize: 11, color: '#e5e7eb', background: '#0a0a0a', padding: 24 },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    controls: { display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' as const },
    input: { background: '#111', border: '1px solid #374151', color: '#e5e7eb', padding: '6px 10px', fontSize: 11, width: 200 },
    select: { background: '#111', border: '1px solid #374151', color: '#e5e7eb', padding: '6px 10px', fontSize: 11 },
    btn: { background: '#1a1a1a', border: '1px solid #374151', color: '#9ca3af', padding: '6px 14px', cursor: 'pointer', fontSize: 11 },
    row: { padding: '10px 12px', borderBottom: '1px solid #1a1a1a', cursor: 'pointer' },
    pagination: { display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 },
  };

  const badge = (sev: AuditSeverity): React.CSSProperties => ({
    padding: '2px 6px', fontSize: 9, textTransform: 'uppercase' as const,
    background: `${SEVERITY_COLORS[sev]}20`, border: `1px solid ${SEVERITY_COLORS[sev]}`,
    color: SEVERITY_COLORS[sev], letterSpacing: '0.1em',
  });

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div>
          <div style={{ fontSize: 14, fontFamily: 'serif', color: '#f5f0e8' }}>Sovereign Audit Log</div>
          <div style={{ color: '#6b7280', fontSize: 10, marginTop: 2 }}>{filtered.length} entries</div>
        </div>
        <button style={{ ...s.btn, borderColor: '#d4af3740', color: '#d4af37' }} onClick={handleExport}>
          ↓ Export JSON
        </button>
      </div>

      <div style={s.controls}>
        <input
          style={s.input}
          placeholder="Filter by action…"
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
        />
        <select
          style={s.select}
          value={filterSeverity}
          onChange={(e) => { setFilterSeverity(e.target.value as AuditSeverity | 'all'); setPage(1); }}
        >
          <option value="all">All severities</option>
          {(['info', 'low', 'medium', 'high', 'critical'] as const).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div style={{ border: '1px solid #1f2937' }}>
        {/* Header row */}
        <div style={{ ...s.row, background: '#111', display: 'grid', gridTemplateColumns: '160px 1fr 120px 80px', gap: 12, cursor: 'default' }}>
          <span style={{ color: '#6b7280', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.1em' }}>Time</span>
          <span style={{ color: '#6b7280', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.1em' }}>Action</span>
          <span style={{ color: '#6b7280', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.1em' }}>Actor</span>
          <span style={{ color: '#6b7280', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.1em' }}>Severity</span>
        </div>

        {paginated.length === 0 && (
          <div style={{ padding: 24, color: '#4b5563', textAlign: 'center' }}>No audit entries match the current filter.</div>
        )}

        {paginated.map((entry) => (
          <div key={entry.id}>
            <div
              style={{ ...s.row, display: 'grid', gridTemplateColumns: '160px 1fr 120px 80px', gap: 12, background: expandedId === entry.id ? '#111' : 'transparent' }}
              onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
            >
              <span style={{ color: '#6b7280' }}>{new Date(entry.timestamp).toLocaleTimeString()}</span>
              <span style={{ color: '#e5e7eb' }}>{entry.action}</span>
              <span style={{ color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{entry.actor}</span>
              <span style={badge(entry.severity)}>{entry.severity}</span>
            </div>
            {expandedId === entry.id && (
              <div style={{ padding: '10px 12px 12px 12px', background: '#0d0d0d', borderTop: '1px solid #1a1a1a' }}>
                <pre style={{ color: '#9ca3af', fontSize: 10, margin: 0, whiteSpace: 'pre-wrap' as const, overflowWrap: 'break-word' as const }}>
                  {JSON.stringify(entry.details, null, 2)}
                </pre>
                {entry.sessionId && (
                  <div style={{ color: '#4b5563', fontSize: 10, marginTop: 6 }}>Session: {entry.sessionId}</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div style={s.pagination}>
          <button style={s.btn} disabled={page === 1} onClick={() => setPage(page - 1)}>← Prev</button>
          <span style={{ padding: '6px 14px', color: '#6b7280' }}>{page} / {totalPages}</span>
          <button style={s.btn} disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
};

export default SovereignAuditLog;
