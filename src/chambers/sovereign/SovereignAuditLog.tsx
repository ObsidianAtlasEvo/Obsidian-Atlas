/**
 * SovereignAuditLog.tsx
 *
 * Dark-themed audit log table for the Sovereign Console's Security tab.
 * Displays action history with color-coded result badges, actor info,
 * optional target user, and supports filtering, pagination, and JSON export.
 *
 * Destination: src/chambers/sovereign/SovereignAuditLog.tsx
 */

import React, { useMemo, useState } from 'react';
import type { SovereignAction, SovereignAuditEntry } from './sovereignAuditTypes';

// ---------------------------------------------------------------------------
// Palette (dark-mode sovereign UI)
// ---------------------------------------------------------------------------
const PALETTE = {
  bg: '#0E0E0E',
  surface: '#161616',
  surfaceAlt: '#1C1C1C',
  border: '#2A2A2A',
  text: '#CDCCCA',
  textMuted: '#797876',
  textFaint: '#4A4948',

  // Result badge colors
  success: { bg: '#0D2E2C', text: '#4CADA8', border: '#1A4A47' },
  denied:  { bg: '#2E2200', text: '#DDAA33', border: '#4A3800' },
  error:   { bg: '#2E0D0D', text: '#DD5555', border: '#4A1A1A' },

  // Accent
  accent: '#4F98A3',
  accentHover: '#6CB8C4',
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getUTCFullYear();
  const mm   = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd   = String(d.getUTCDate()).padStart(2, '0');
  const hh   = String(d.getUTCHours()).padStart(2, '0');
  const mi   = String(d.getUTCMinutes()).padStart(2, '0');
  const ss   = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}Z`;
}

function exportAsJson(entries: SovereignAuditEntry[]): void {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `sovereign-audit-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

const ALL_ACTIONS: SovereignAction[] = [
  'prompt.read', 'prompt.edit', 'prompt.publish', 'prompt.rollback',
  'flag.read', 'flag.toggle', 'flag.create', 'flag.delete',
  'users.read', 'users.evolution.read', 'users.evolution.reset',
  'bugs.read', 'bugs.update',
  'deploy.trigger', 'release.publish',
  'logs.stream', 'evolution.rebuild', 'evolution.quarantine_override',
];

const PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ResultBadgeProps {
  result: 'success' | 'denied' | 'error';
}

const ResultBadge: React.FC<ResultBadgeProps> = ({ result }) => {
  const colors = PALETTE[result];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        color: colors.text,
        fontFamily: 'Consolas, "Fira Code", "JetBrains Mono", monospace',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {result}
    </span>
  );
};

interface ActionLabelProps {
  action: SovereignAction;
}

const ActionLabel: React.FC<ActionLabelProps> = ({ action }) => {
  const [ns, ...rest] = action.split('.');
  const method = rest.join('.');
  return (
    <span
      style={{
        fontFamily: 'Consolas, "Fira Code", "JetBrains Mono", monospace',
        fontSize: 12,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: PALETTE.accent }}>{ns}</span>
      <span style={{ color: PALETTE.textMuted }}>.</span>
      <span style={{ color: PALETTE.text }}>{method}</span>
    </span>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface SovereignAuditLogProps {
  entries: SovereignAuditEntry[];
  onRefresh: () => void;
}

export const SovereignAuditLog: React.FC<SovereignAuditLogProps> = ({ entries, onRefresh }) => {
  const [filterAction, setFilterAction] = useState<SovereignAction | 'all'>('all');
  const [filterResult, setFilterResult] = useState<'all' | 'success' | 'denied' | 'error'>('all');
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // --- Filtering ---
  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filterAction !== 'all' && e.action !== filterAction) return false;
      if (filterResult !== 'all' && e.result !== filterResult) return false;
      return true;
    });
  }, [entries, filterAction, filterResult]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageEntries = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset to page 0 when filters change
  const handleFilterAction = (v: SovereignAction | 'all') => { setFilterAction(v); setPage(0); };
  const handleFilterResult = (v: 'all' | 'success' | 'denied' | 'error') => { setFilterResult(v); setPage(0); };

  // --- Styles (inline to avoid className coupling) ---
  const selectStyle: React.CSSProperties = {
    background: PALETTE.surfaceAlt,
    border: `1px solid ${PALETTE.border}`,
    borderRadius: 4,
    color: PALETTE.text,
    fontSize: 12,
    padding: '4px 8px',
    outline: 'none',
    cursor: 'pointer',
    fontFamily: 'Consolas, "Fira Code", "JetBrains Mono", monospace',
  };

  const buttonStyle: React.CSSProperties = {
    background: PALETTE.surfaceAlt,
    border: `1px solid ${PALETTE.border}`,
    borderRadius: 4,
    color: PALETTE.text,
    fontSize: 12,
    padding: '4px 12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  };

  const thStyle: React.CSSProperties = {
    padding: '8px 12px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 600,
    color: PALETTE.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    borderBottom: `1px solid ${PALETTE.border}`,
    whiteSpace: 'nowrap',
    userSelect: 'none',
  };

  const tdStyle: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: 12,
    color: PALETTE.text,
    borderBottom: `1px solid ${PALETTE.border}`,
    verticalAlign: 'middle',
    maxWidth: 240,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  return (
    <div
      style={{
        background: PALETTE.bg,
        color: PALETTE.text,
        borderRadius: 8,
        border: `1px solid ${PALETTE.border}`,
        overflow: 'hidden',
        fontFamily: '"Inter", "Segoe UI", Arial, sans-serif',
      }}
    >
      {/* ---------------------------------------------------------------- Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: `1px solid ${PALETTE.border}`,
          background: PALETTE.surface,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text }}>
            Sovereign Audit Log
          </span>
          <span
            style={{
              fontSize: 11,
              color: PALETTE.textMuted,
              background: PALETTE.surfaceAlt,
              border: `1px solid ${PALETTE.border}`,
              borderRadius: 4,
              padding: '2px 6px',
            }}
          >
            {filtered.length.toLocaleString()} entries
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Action filter */}
          <select
            value={filterAction}
            onChange={(e) => handleFilterAction(e.target.value as SovereignAction | 'all')}
            style={selectStyle}
            aria-label="Filter by action"
          >
            <option value="all">All actions</option>
            {ALL_ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          {/* Result filter */}
          <select
            value={filterResult}
            onChange={(e) => handleFilterResult(e.target.value as typeof filterResult)}
            style={selectStyle}
            aria-label="Filter by result"
          >
            <option value="all">All results</option>
            <option value="success">Success</option>
            <option value="denied">Denied</option>
            <option value="error">Error</option>
          </select>

          {/* Refresh */}
          <button
            onClick={onRefresh}
            style={buttonStyle}
            aria-label="Refresh audit log"
            title="Refresh"
          >
            Refresh
          </button>

          {/* Export */}
          <button
            onClick={() => exportAsJson(filtered)}
            style={{ ...buttonStyle, color: PALETTE.accent, borderColor: PALETTE.accent }}
            aria-label="Export filtered entries as JSON"
            title="Export as JSON"
          >
            Export JSON
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------------- Table */}
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
          }}
        >
          <colgroup>
            <col style={{ width: 168 }} />
            <col style={{ width: 220 }} />
            <col style={{ width: 88 }} />
            <col style={{ width: 180 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 64 }} />
          </colgroup>
          <thead>
            <tr style={{ background: PALETTE.surface }}>
              <th style={thStyle}>Timestamp (UTC)</th>
              <th style={thStyle}>Action</th>
              <th style={thStyle}>Result</th>
              <th style={thStyle}>Actor</th>
              <th style={thStyle}>Target User</th>
              <th style={thStyle}>IP Address</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>ms</th>
            </tr>
          </thead>
          <tbody>
            {pageEntries.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    ...tdStyle,
                    textAlign: 'center',
                    color: PALETTE.textFaint,
                    padding: '32px 12px',
                  }}
                >
                  No audit entries match the current filters.
                </td>
              </tr>
            ) : (
              pageEntries.map((entry) => {
                const isExpanded = expandedId === entry.id;
                const hasPayload = Object.keys(entry.payload).length > 0;

                return (
                  <React.Fragment key={entry.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      style={{
                        cursor: hasPayload ? 'pointer' : 'default',
                        background: isExpanded ? PALETTE.surfaceAlt : 'transparent',
                        transition: 'background 0.1s',
                      }}
                      title={hasPayload ? 'Click to expand payload' : undefined}
                    >
                      {/* Timestamp */}
                      <td style={{ ...tdStyle, fontFamily: 'Consolas, "Fira Code", monospace', fontSize: 11 }}>
                        {formatTimestamp(entry.timestamp)}
                      </td>

                      {/* Action */}
                      <td style={tdStyle}>
                        <ActionLabel action={entry.action} />
                      </td>

                      {/* Result */}
                      <td style={{ ...tdStyle, overflow: 'visible' }}>
                        <ResultBadge result={entry.result} />
                      </td>

                      {/* Actor email */}
                      <td style={{ ...tdStyle, color: PALETTE.textMuted }}>
                        {entry.actorEmail}
                      </td>

                      {/* Target user */}
                      <td style={{ ...tdStyle, color: PALETTE.textMuted }}>
                        {entry.targetUserId ?? (
                          <span style={{ color: PALETTE.textFaint }}>—</span>
                        )}
                      </td>

                      {/* IP */}
                      <td style={{ ...tdStyle, fontFamily: 'Consolas, "Fira Code", monospace', fontSize: 11 }}>
                        {entry.actorIp}
                      </td>

                      {/* Duration */}
                      <td style={{ ...tdStyle, textAlign: 'right', color: PALETTE.textMuted }}>
                        {entry.durationMs}
                      </td>
                    </tr>

                    {/* Expanded payload row */}
                    {isExpanded && hasPayload && (
                      <tr style={{ background: PALETTE.surfaceAlt }}>
                        <td
                          colSpan={7}
                          style={{
                            ...tdStyle,
                            overflow: 'visible',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            fontFamily: 'Consolas, "Fira Code", "JetBrains Mono", monospace',
                            fontSize: 11,
                            color: PALETTE.textMuted,
                            paddingLeft: 28,
                            paddingTop: 6,
                            paddingBottom: 10,
                            borderTop: `1px dashed ${PALETTE.border}`,
                          }}
                        >
                          <span style={{ color: PALETTE.textFaint, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            Payload · session {entry.sessionId || 'n/a'}
                          </span>
                          {'\n'}
                          {JSON.stringify(entry.payload, null, 2)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ---------------------------------------------------------------- Pagination */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderTop: `1px solid ${PALETTE.border}`,
          background: PALETTE.surface,
        }}
      >
        <span style={{ fontSize: 12, color: PALETTE.textMuted }}>
          Page {page + 1} of {totalPages}
          &ensp;·&ensp;
          Showing {pageEntries.length} of {filtered.length} entries
        </span>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setPage(0)}
            disabled={page === 0}
            style={{ ...buttonStyle, opacity: page === 0 ? 0.4 : 1 }}
            aria-label="First page"
          >
            «
          </button>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ ...buttonStyle, opacity: page === 0 ? 0.4 : 1 }}
            aria-label="Previous page"
          >
            ‹ Prev
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={{ ...buttonStyle, opacity: page >= totalPages - 1 ? 0.4 : 1 }}
            aria-label="Next page"
          >
            Next ›
          </button>
          <button
            onClick={() => setPage(totalPages - 1)}
            disabled={page >= totalPages - 1}
            style={{ ...buttonStyle, opacity: page >= totalPages - 1 ? 0.4 : 1 }}
            aria-label="Last page"
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
};

export default SovereignAuditLog;
