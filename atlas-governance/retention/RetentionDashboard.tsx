/**
 * Retention Dashboard — Phase 4 §5
 *
 * Sovereign Creator–only React component for managing data retention,
 * legal holds, GDPR/CCPA erasure requests, and the retention audit trail.
 *
 * Sections:
 * 1. Deletion Schedule — next run time, last report
 * 2. Legal Holds — active holds with release capability
 * 3. Erasure Requests — pending/completed with execute action
 * 4. Audit Trail — last 50 retention events
 */

import React, { useState, useEffect, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TableDeletionResult {
  table: string;
  deleted: number;
  held: number;
  errors: string[];
}

interface DeletionReport {
  date: string;
  tables: TableDeletionResult[];
  totalDeleted: number;
}

interface RetentionStatus {
  lastRun: DeletionReport | null;
  nextRunUtc: string;
}

interface LegalHold {
  id: string;
  table: string;
  rowId?: string;
  userId?: string;
  reason: string;
  placedBy: string;
  placedAt: string;
  expiresAt?: string;
}

interface ErasureRequestItem {
  requestId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  completedAt?: string;
  certificate?: {
    sha256: string;
    tablesErased: string[];
  };
}

interface RetentionEvent {
  id: string;
  type: string;
  table?: string;
  rowId?: string;
  userId?: string;
  actorId: string;
  timestamp: string;
  detail?: string;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = {
  container: {
    fontFamily: '"SF Mono", "Fira Code", monospace',
    background: '#0a0a0f',
    color: '#e0e0e0',
    padding: '2rem',
    minHeight: '100vh',
  } as React.CSSProperties,
  header: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#00ffaa',
    marginBottom: '1.5rem',
    borderBottom: '1px solid #1a1a2e',
    paddingBottom: '0.75rem',
  } as React.CSSProperties,
  section: {
    marginBottom: '2rem',
    background: '#111118',
    borderRadius: '8px',
    padding: '1.25rem',
    border: '1px solid #1a1a2e',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#60a5fa',
    marginBottom: '0.75rem',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '0.85rem',
  },
  th: {
    textAlign: 'left' as const,
    padding: '0.5rem',
    borderBottom: '1px solid #2a2a3e',
    color: '#888',
    fontWeight: 500,
  },
  td: {
    padding: '0.5rem',
    borderBottom: '1px solid #1a1a2e',
  },
  button: {
    background: '#1e40af',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '0.35rem 0.75rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 500,
  } as React.CSSProperties,
  dangerButton: {
    background: '#991b1b',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '0.35rem 0.75rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 500,
  } as React.CSSProperties,
  label: {
    color: '#888',
    fontSize: '0.8rem',
  } as React.CSSProperties,
  value: {
    color: '#e0e0e0',
    fontSize: '0.9rem',
    fontWeight: 500,
  } as React.CSSProperties,
  denied: {
    padding: '3rem',
    textAlign: 'center' as const,
    color: '#f87171',
    fontSize: '1.1rem',
    fontWeight: 600,
  } as React.CSSProperties,
  statusBadge: (status: string): React.CSSProperties => ({
    display: 'inline-block',
    padding: '0.15rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: 600,
    background:
      status === 'COMPLETED' ? '#065f46' :
      status === 'PENDING' ? '#78350f' :
      status === 'IN_PROGRESS' ? '#1e3a5f' :
      '#7f1d1d',
    color: '#fff',
  }),
} as const;

const SOVEREIGN_CREATOR = 'crowleyrc62@gmail.com';

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function RetentionDashboard(): React.ReactElement {
  const [currentUser] = useState<string>(
    typeof window !== 'undefined'
      ? (localStorage.getItem('atlas_user_email') ?? '')
      : ''
  );

  const [status, setStatus] = useState<RetentionStatus | null>(null);
  const [holds, setHolds] = useState<LegalHold[]>([]);
  const [erasures, setErasures] = useState<ErasureRequestItem[]>([]);
  const [auditEvents, setAuditEvents] = useState<RetentionEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, holdsRes, auditRes] = await Promise.all([
        fetch('/api/governance/retention/status'),
        fetch('/api/governance/retention/holds'),
        fetch('/api/governance/retention/audit'),
      ]);
      if (statusRes.ok) setStatus(await statusRes.json() as RetentionStatus);
      if (holdsRes.ok) {
        const data = await holdsRes.json() as { holds: LegalHold[] };
        setHolds(data.holds);
      }
      if (auditRes.ok) {
        const data = await auditRes.json() as { events: RetentionEvent[] };
        setAuditEvents(data.events);
      }
    } catch {
      // Silently handle fetch errors in dashboard
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  /* Access guard */
  if (currentUser.trim().toLowerCase() !== SOVEREIGN_CREATOR) {
    return <div style={styles.denied}>Access denied — Sovereign Creator only</div>;
  }

  if (loading) {
    return <div style={styles.container}>Loading retention data…</div>;
  }

  const handleReleaseHold = async (holdId: string): Promise<void> => {
    await fetch(`/api/governance/retention/holds/${holdId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId: currentUser }),
    });
    void fetchData();
  };

  const handleExecuteErasure = async (requestId: string): Promise<void> => {
    const res = await fetch(`/api/governance/retention/erasure/${requestId}`);
    if (res.ok) {
      const data = await res.json() as ErasureRequestItem;
      setErasures((prev) =>
        prev.map((e) => (e.requestId === requestId ? data : e))
      );
    }
    void fetchData();
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>Data Retention & Deletion Dashboard</div>

      {/* ── Section 1: Deletion Schedule ── */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Deletion Schedule</div>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <div>
            <div style={styles.label}>Next Scheduled Run</div>
            <div style={styles.value}>
              {status?.nextRunUtc
                ? new Date(status.nextRunUtc).toLocaleString() + ' (03:00 UTC daily)'
                : '—'}
            </div>
          </div>
          <div>
            <div style={styles.label}>Last Run Date</div>
            <div style={styles.value}>{status?.lastRun?.date ?? 'Never'}</div>
          </div>
          {status?.lastRun && (
            <div>
              <div style={styles.label}>Total Deleted</div>
              <div style={styles.value}>{status.lastRun.totalDeleted}</div>
            </div>
          )}
        </div>
        {status?.lastRun && status.lastRun.tables.length > 0 && (
          <table style={{ ...styles.table, marginTop: '0.75rem' }}>
            <thead>
              <tr>
                <th style={styles.th}>Table</th>
                <th style={styles.th}>Deleted</th>
                <th style={styles.th}>Held</th>
                <th style={styles.th}>Errors</th>
              </tr>
            </thead>
            <tbody>
              {status.lastRun.tables.map((t) => (
                <tr key={t.table}>
                  <td style={styles.td}>{t.table}</td>
                  <td style={styles.td}>{t.deleted}</td>
                  <td style={styles.td}>{t.held}</td>
                  <td style={styles.td}>{t.errors.length > 0 ? t.errors.join('; ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Section 2: Legal Holds ── */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Legal Holds</div>
        {holds.length === 0 ? (
          <div style={{ color: '#666' }}>No active legal holds</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Table</th>
                <th style={styles.th}>Reason</th>
                <th style={styles.th}>Placed By</th>
                <th style={styles.th}>Placed At</th>
                <th style={styles.th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {holds.map((hold) => (
                <tr key={hold.id}>
                  <td style={styles.td}>{hold.table}</td>
                  <td style={styles.td}>{hold.reason}</td>
                  <td style={styles.td}>{hold.placedBy}</td>
                  <td style={styles.td}>{new Date(hold.placedAt).toLocaleDateString()}</td>
                  <td style={styles.td}>
                    <button
                      style={styles.dangerButton}
                      onClick={() => void handleReleaseHold(hold.id)}
                    >
                      Release Hold
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Section 3: Erasure Requests ── */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Erasure Requests</div>
        {erasures.length === 0 ? (
          <div style={{ color: '#666' }}>No erasure requests</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Request ID</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Completed</th>
                <th style={styles.th}>Certificate</th>
                <th style={styles.th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {erasures.map((er) => (
                <tr key={er.requestId}>
                  <td style={styles.td}>{er.requestId.slice(0, 8)}…</td>
                  <td style={styles.td}>
                    <span style={styles.statusBadge(er.status)}>{er.status}</span>
                  </td>
                  <td style={styles.td}>
                    {er.completedAt ? new Date(er.completedAt).toLocaleString() : '—'}
                  </td>
                  <td style={styles.td}>
                    {er.certificate ? er.certificate.sha256.slice(0, 16) + '…' : '—'}
                  </td>
                  <td style={styles.td}>
                    {er.status === 'PENDING' && (
                      <button
                        style={styles.button}
                        onClick={() => void handleExecuteErasure(er.requestId)}
                      >
                        Execute
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Section 4: Audit Trail ── */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Audit Trail (Last 50)</div>
        {auditEvents.length === 0 ? (
          <div style={{ color: '#666' }}>No retention events recorded</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Timestamp</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Table</th>
                <th style={styles.th}>Actor</th>
                <th style={styles.th}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {auditEvents.map((ev) => (
                <tr key={ev.id}>
                  <td style={styles.td}>{new Date(ev.timestamp).toLocaleString()}</td>
                  <td style={styles.td}>
                    <span style={styles.statusBadge(ev.type)}>{ev.type}</span>
                  </td>
                  <td style={styles.td}>{ev.table ?? '—'}</td>
                  <td style={styles.td}>{ev.actorId}</td>
                  <td style={styles.td}>{ev.detail ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
