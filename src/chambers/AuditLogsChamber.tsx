import React, { useState } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { generateId, nowISO } from '../lib/persistence';

// ─── Types ────────────────────────────────────────────────────────────────────

type LogSeverity = 'low' | 'medium' | 'high' | 'critical';

interface AuditLog {
  id: string;
  timestamp: string;
  actorUid: string;
  action: string;
  resource?: string;
  metadata?: any;
  severity: LogSeverity;
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
  gray:    'rgba(148,163,184,0.55)',
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

// ─── Severity helpers ─────────────────────────────────────────────────────────

const SEV_COLOR: Record<LogSeverity, string> = {
  low:      C.gray,
  medium:   C.amber,
  high:     C.danger,
  critical: C.danger,
};

const SEVERITIES: LogSeverity[] = ['low', 'medium', 'high', 'critical'];

// ─── Seed logs ────────────────────────────────────────────────────────────────

const SEED_LOGS: AuditLog[] = [
  {
    id: 'log-001',
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    actorUid: 'sovereign_creator_01',
    action: 'emergency.containment.activated',
    resource: 'system',
    severity: 'critical',
    metadata: { level: 3, reason: 'Unauthorized access detected' },
  },
  {
    id: 'log-002',
    timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
    actorUid: 'sovereign_creator_01',
    action: 'doctrine.rule.modified',
    resource: 'doctrine/rule-007',
    severity: 'high',
    metadata: { field: 'priority', from: 'medium', to: 'critical' },
  },
  {
    id: 'log-003',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    actorUid: 'system',
    action: 'memory.consolidated',
    resource: 'memory/batch-20',
    severity: 'low',
    metadata: { count: 24 },
  },
  {
    id: 'log-004',
    timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
    actorUid: 'user_admin_02',
    action: 'user.role.changed',
    resource: 'user/uid-99',
    severity: 'medium',
    metadata: { from: 'viewer', to: 'editor' },
  },
  {
    id: 'log-005',
    timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
    actorUid: 'system',
    action: 'directive.expired',
    resource: 'directive/dir-003',
    severity: 'low',
    metadata: {},
  },
];

// ─── Components ───────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: LogSeverity }) {
  const color = SEV_COLOR[severity];
  const isPulse = severity === 'critical';
  return (
    <span style={{
      background: `${color}18`,
      border: `1px solid ${color}44`,
      borderRadius: 5,
      color,
      fontSize: '0.63rem',
      fontWeight: 700,
      letterSpacing: '0.1em',
      padding: '2px 9px',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
      ...(isPulse ? { animation: 'atlas-pulse 1.5s infinite' } : {}),
    }}>
      {severity}
    </span>
  );
}

function FilterPill({
  label, active, color, onClick,
}: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
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
    }}>
      {label}
    </button>
  );
}

function LogEntry({ log }: { log: AuditLog }) {
  const [open, setOpen] = useState(false);
  const formatted = new Date(log.timestamp).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const hasExtra = log.resource || log.metadata;

  return (
    <div
      style={{
        ...INSET,
        padding: '13px 16px',
        cursor: hasExtra ? 'pointer' : 'default',
        borderColor: open ? 'rgba(88,28,135,0.3)' : C.borderS,
        transition: 'border-color 150ms',
      }}
      onClick={() => hasExtra && setOpen(o => !o)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Severity dot */}
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: SEV_COLOR[log.severity],
          boxShadow: log.severity === 'critical' ? `0 0 8px ${C.danger}` : 'none',
          flexShrink: 0,
          marginTop: 5,
        }} />

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ color: C.text, fontWeight: 600, fontSize: '0.85rem', fontFamily: 'monospace' }}>
              {log.action}
            </span>
            <SeverityBadge severity={log.severity} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 5, flexWrap: 'wrap' }}>
            <span style={{ color: C.dim, fontSize: '0.72rem', fontFamily: 'monospace' }}>{formatted}</span>
            <span style={{ color: C.muted, fontSize: '0.75rem' }}>
              by <span style={{ color: C.violet }}>{log.actorUid}</span>
            </span>
            {log.resource && (
              <span style={{ color: C.teal, fontSize: '0.72rem', fontFamily: 'monospace' }}>
                → {log.resource}
              </span>
            )}
          </div>
        </div>

        {hasExtra && (
          <div style={{ color: C.dim, fontSize: '0.68rem', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms', flexShrink: 0 }}>
            ▼
          </div>
        )}
      </div>

      {/* Metadata */}
      {open && log.metadata && Object.keys(log.metadata).length > 0 && (
        <div style={{ marginTop: 12, ...FADE }} onClick={e => e.stopPropagation()}>
          <div style={{ ...LABEL, marginBottom: 6 }}>Metadata</div>
          <pre style={{
            background: 'rgba(0,0,0,0.45)',
            border: `1px solid ${C.borderS}`,
            borderRadius: 6,
            color: C.muted,
            fontSize: '0.72rem',
            fontFamily: 'monospace',
            padding: '10px 12px',
            overflow: 'auto',
            maxHeight: 150,
            whiteSpace: 'pre-wrap',
            margin: 0,
          }}>
            {JSON.stringify(log.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Add Log Form ─────────────────────────────────────────────────────────────

function AddLogForm({ onAdd }: { onAdd: (log: AuditLog) => void }) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState('');
  const [resource, setResource] = useState('');
  const [severity, setSeverity] = useState<LogSeverity>('low');
  const [metaRaw, setMetaRaw] = useState('');
  const [metaErr, setMetaErr] = useState(false);

  const submit = () => {
    if (!action.trim()) return;
    let metadata: any = undefined;
    if (metaRaw.trim()) {
      try {
        metadata = JSON.parse(metaRaw.trim());
        setMetaErr(false);
      } catch {
        setMetaErr(true);
        return;
      }
    }
    onAdd({
      id: generateId(),
      timestamp: nowISO(),
      actorUid: 'sovereign_creator',
      action: action.trim(),
      resource: resource.trim() || undefined,
      severity,
      metadata,
    });
    setAction(''); setResource(''); setMetaRaw('');
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
        }}
      >
        + Add Manual Log Entry
      </button>
    );
  }

  return (
    <div style={{ ...PANEL, ...FADE }}>
      <div style={{ ...LABEL, marginBottom: 16 }}>New Manual Audit Entry</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ ...LABEL, marginBottom: 6 }}>Action</div>
          <input
            value={action}
            onChange={e => setAction(e.target.value)}
            placeholder="e.g. doctrine.rule.created"
            style={{ ...inputStyle, fontFamily: 'monospace' }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ ...LABEL, marginBottom: 6 }}>Resource</div>
            <input
              value={resource}
              onChange={e => setResource(e.target.value)}
              placeholder="e.g. directive/dir-009"
              style={{ ...inputStyle, fontFamily: 'monospace' }}
            />
          </div>
          <div>
            <div style={{ ...LABEL, marginBottom: 6 }}>Severity</div>
            <select
              value={severity}
              onChange={e => setSeverity(e.target.value as LogSeverity)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {SEVERITIES.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <div style={{ ...LABEL, marginBottom: 6, color: metaErr ? C.danger : C.muted }}>
            Metadata (JSON){metaErr ? ' — invalid JSON' : ''}
          </div>
          <textarea
            value={metaRaw}
            onChange={e => { setMetaRaw(e.target.value); setMetaErr(false); }}
            placeholder='{"key": "value"}'
            style={{
              ...inputStyle,
              minHeight: 64,
              resize: 'vertical',
              fontFamily: 'monospace',
              borderColor: metaErr ? C.danger : C.border,
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
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
              opacity: action.trim() ? 1 : 0.4,
            }}
          >
            Log Entry
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AuditLogsChamber() {
  const [logs, setLogs] = useState<AuditLog[]>(SEED_LOGS);
  const [severityFilter, setSeverityFilter] = useState<LogSeverity | 'all'>('all');
  const [copied, setCopied] = useState(false);

  const addLog = (log: AuditLog) => setLogs(prev => [log, ...prev]);

  const sorted = [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const filtered = sorted.filter(l => severityFilter === 'all' || l.severity === severityFilter);

  const sevCounts = SEVERITIES.reduce((acc, s) => ({
    ...acc,
    [s]: logs.filter(l => l.severity === s).length,
  }), {} as Record<LogSeverity, number>);

  const exportLogs = () => {
    navigator.clipboard.writeText(JSON.stringify(logs, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  };

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
        @keyframes atlas-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28, ...FADE }}>
        <div>
          <div style={{ ...LABEL, color: C.gold, marginBottom: 4 }}>Sovereign Creator</div>
          <h1 style={{ margin: 0, fontSize: '1.55rem', fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>
            Audit Logs
          </h1>
          <div style={{ color: C.muted, fontSize: '0.8rem', marginTop: 4 }}>
            Immutable chronological record of system events and actor actions
          </div>
        </div>
        <button
          onClick={exportLogs}
          style={{
            background: copied ? 'rgba(34,197,94,0.12)' : 'rgba(88,28,135,0.12)',
            border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(88,28,135,0.35)'}`,
            borderRadius: 8,
            color: copied ? C.success : C.violet,
            cursor: 'pointer',
            fontSize: '0.76rem',
            fontWeight: 600,
            padding: '9px 18px',
            letterSpacing: '0.04em',
            transition: 'all 200ms',
            whiteSpace: 'nowrap',
          }}
        >
          {copied ? '✓ Copied' : 'Export JSON'}
        </button>
      </div>

      {/* Stats */}
      <div style={{ ...PANEL, marginBottom: 20, ...FADE }}>
        <div style={{ ...LABEL, marginBottom: 14 }}>Log Statistics</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ ...INSET, padding: '12px 16px', flex: 1, minWidth: 80 }}>
            <div style={LABEL}>Total</div>
            <div style={{ color: C.gold, fontWeight: 700, fontSize: '1.4rem', marginTop: 4 }}>{logs.length}</div>
          </div>
          {SEVERITIES.map(s => (
            <div key={s} style={{ ...INSET, padding: '12px 16px', flex: 1, minWidth: 80 }}>
              <div style={{ ...LABEL, color: SEV_COLOR[s] }}>{s}</div>
              <div style={{ color: SEV_COLOR[s], fontWeight: 700, fontSize: '1.4rem', marginTop: 4 }}>
                {sevCounts[s] ?? 0}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16, ...FADE }}>
        <div style={{ ...LABEL, marginRight: 4 }}>Severity</div>
        <FilterPill label="All" active={severityFilter === 'all'} color={C.violet} onClick={() => setSeverityFilter('all')} />
        {SEVERITIES.map(s => (
          <FilterPill key={s} label={s} active={severityFilter === s} color={SEV_COLOR[s]} onClick={() => setSeverityFilter(s)} />
        ))}
        <div style={{ marginLeft: 'auto', color: C.dim, fontSize: '0.74rem' }}>
          {filtered.length} of {logs.length} entries
        </div>
      </div>

      {/* Log list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
        {filtered.length === 0 ? (
          <div style={{ ...INSET, padding: '32px', textAlign: 'center', color: C.muted, fontSize: '0.84rem' }}>
            No log entries match the current filter.
          </div>
        ) : (
          filtered.map(log => <LogEntry key={log.id} log={log} />)
        )}
      </div>

      {/* Add form */}
      <AddLogForm onAdd={addLog} />
    </div>
  );
}
