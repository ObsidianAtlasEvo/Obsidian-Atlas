/**
 * Atlas Explanation Viewer
 * Phase 4 Section 4 — Explainability Layer
 *
 * Right-anchored slide-in drawer that displays explanation entries
 * with timeline, detail view, and two-panel diff.
 */

import React, { useState, useEffect } from 'react';
import type { ExplanationEntry } from './explanationStore';
import { getExplanation } from './explanationStore';

export interface ExplanationViewerProps {
  open: boolean;
  onClose: () => void;
  explanationId?: string;
  entries?: ExplanationEntry[];
}

const DRAWER_WIDTH = 480;

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    zIndex: 9998,
  },
  drawer: {
    position: 'fixed',
    right: 0,
    top: 0,
    height: '100vh',
    width: DRAWER_WIDTH,
    background: '#0a0a0a',
    borderLeft: '1px solid #1f2937',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#e5e7eb',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #1f2937',
  },
  title: {
    fontSize: 14,
    fontFamily: 'serif',
    color: '#f5f0e8',
  },
  closeBtn: {
    background: 'none',
    border: '1px solid #374151',
    color: '#9ca3af',
    padding: '4px 12px',
    cursor: 'pointer',
    fontSize: 11,
  },
  listContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 0',
  },
  entryRow: {
    padding: '10px 20px',
    borderBottom: '1px solid #111',
    cursor: 'pointer',
  },
  entryRowActive: {
    padding: '10px 20px',
    borderBottom: '1px solid #111',
    cursor: 'pointer',
    background: '#111',
  },
  entryTime: {
    color: '#6b7280',
    fontSize: 10,
  },
  entryType: {
    color: '#d4af37',
    fontSize: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginTop: 2,
  },
  entrySummary: {
    color: '#e5e7eb',
    marginTop: 4,
  },
  detailPanel: {
    padding: '16px 20px',
    borderTop: '1px solid #1f2937',
    overflowY: 'auto',
    maxHeight: '50vh',
    background: '#0d0d0d',
  },
  detailLabel: {
    color: '#6b7280',
    fontSize: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    marginBottom: 4,
    marginTop: 12,
  },
  detailValue: {
    color: '#e5e7eb',
    whiteSpace: 'pre-wrap' as const,
    overflowWrap: 'break-word' as const,
  },
  diffContainer: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
    marginTop: 8,
  },
  diffPanel: {
    background: '#111',
    border: '1px solid #1f2937',
    padding: 10,
    fontSize: 10,
    whiteSpace: 'pre-wrap' as const,
    overflowWrap: 'break-word' as const,
    maxHeight: 160,
    overflowY: 'auto',
  },
  diffBefore: {
    borderColor: '#7f1d1d',
    color: '#fca5a5',
  },
  diffAfter: {
    borderColor: '#14532d',
    color: '#86efac',
  },
  changedField: {
    display: 'inline-block',
    padding: '1px 6px',
    marginRight: 4,
    marginBottom: 4,
    background: '#d4af3720',
    border: '1px solid #d4af3740',
    color: '#d4af37',
    fontSize: 9,
  },
  empty: {
    padding: 40,
    textAlign: 'center' as const,
    color: '#4b5563',
  },
};

export default function ExplanationViewer({
  open,
  onClose,
  explanationId,
  entries: externalEntries,
}: ExplanationViewerProps): React.ReactElement | null {
  const [entries, setEntries] = useState<ExplanationEntry[]>(externalEntries ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (externalEntries) {
      setEntries(externalEntries);
    }
  }, [externalEntries]);

  useEffect(() => {
    if (explanationId && open) {
      getExplanation(explanationId).then((entry) => {
        if (entry) {
          setEntries([entry]);
          setSelectedId(entry.id ?? null);
        }
      });
    }
  }, [explanationId, open]);

  if (!open) return null;

  const selected = entries.find((e) => e.id === selectedId);

  return (
    <>
      <div style={styles.overlay} onClick={onClose} />
      <div style={styles.drawer}>
        <div style={styles.header}>
          <span style={styles.title}>Explanations</span>
          <button style={styles.closeBtn} onClick={onClose}>
            ✕ Close
          </button>
        </div>

        <div style={styles.listContainer}>
          {entries.length === 0 && (
            <div style={styles.empty}>No explanation available.</div>
          )}
          {entries.map((entry) => {
            const isActive = entry.id === selectedId;
            return (
              <div
                key={entry.id ?? entry.timestamp.toString()}
                style={isActive ? styles.entryRowActive : styles.entryRow}
                onClick={() => setSelectedId(isActive ? null : (entry.id ?? null))}
              >
                <div style={styles.entryTime}>
                  {entry.timestamp instanceof Date
                    ? entry.timestamp.toLocaleString()
                    : String(entry.timestamp)}
                </div>
                <div style={styles.entryType}>{entry.eventType}</div>
                <div style={styles.entrySummary}>{entry.humanSummary}</div>
              </div>
            );
          })}
        </div>

        {selected && (
          <div style={styles.detailPanel}>
            <div style={styles.detailLabel}>Summary</div>
            <div style={styles.detailValue}>{selected.humanSummary}</div>

            <div style={styles.detailLabel}>Technical Detail</div>
            <div style={styles.detailValue}>{selected.technicalDetail}</div>

            {selected.policyLayer && (
              <>
                <div style={styles.detailLabel}>Policy Layer</div>
                <div style={styles.detailValue}>{selected.policyLayer}</div>
              </>
            )}

            <div style={styles.detailLabel}>Timestamp</div>
            <div style={styles.detailValue}>
              {selected.timestamp instanceof Date
                ? selected.timestamp.toISOString()
                : String(selected.timestamp)}
            </div>

            {selected.diff && (
              <>
                <div style={styles.detailLabel}>Diff</div>
                <div style={{ color: '#9ca3af', fontSize: 10, marginBottom: 6 }}>
                  {selected.diff.summary}
                </div>
                <div style={{ marginBottom: 6 }}>
                  {selected.diff.changedFields.map((f) => (
                    <span key={f} style={styles.changedField}>
                      {f}
                    </span>
                  ))}
                </div>
                <div style={styles.diffContainer}>
                  <div style={{ ...styles.diffPanel, ...styles.diffBefore }}>
                    <div style={{ color: '#6b7280', fontSize: 9, marginBottom: 4 }}>BEFORE</div>
                    {selected.diff.before}
                  </div>
                  <div style={{ ...styles.diffPanel, ...styles.diffAfter }}>
                    <div style={{ color: '#6b7280', fontSize: 9, marginBottom: 4 }}>AFTER</div>
                    {selected.diff.after}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
