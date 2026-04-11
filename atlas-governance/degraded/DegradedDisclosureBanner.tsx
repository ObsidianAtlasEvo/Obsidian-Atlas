/**
 * Degraded Disclosure Banner
 * Phase 4 Section 3 — Fixed top banner that informs the user of the current
 * system degradation level. Color-coded by severity, dismissable per session,
 * and re-appears when the mode changes.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { type DegradedMode, getDisabledFeatures } from './capabilityMatrix.js';

/** Response shape from GET /api/governance/mode */
interface ModeResponse {
  mode: DegradedMode;
  signals: Array<{ name: string; ok: boolean; latencyMs?: number; error?: string }>;
  since: string;
}

const POLL_INTERVAL_MS = 30_000;

/** Hook that polls the backend for the current degraded mode. */
export function useDegradedMode(): {
  mode: DegradedMode;
  signals: ModeResponse['signals'];
  since: string;
} {
  const [state, setState] = useState<ModeResponse>({
    mode: 'NOMINAL',
    signals: [],
    since: new Date().toISOString(),
  });

  useEffect(() => {
    let mounted = true;

    async function fetchMode(): Promise<void> {
      try {
        const res = await fetch('/api/governance/mode');
        if (res.ok && mounted) {
          const data: ModeResponse = await res.json();
          setState(data);
        }
      } catch {
        // network failure — keep last known state
      }
    }

    void fetchMode();
    const timer = setInterval(() => void fetchMode(), POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  return state;
}

/** Background color for each degraded mode. */
const MODE_COLORS: Record<DegradedMode, string> = {
  NOMINAL: '',
  DEGRADED_1: '#f59e0b',
  DEGRADED_2: '#f97316',
  DEGRADED_3: '#ef4444',
  OFFLINE: '#991b1b',
};

/** Human-readable label for each mode. */
const MODE_LABELS: Record<DegradedMode, string> = {
  NOMINAL: 'Nominal',
  DEGRADED_1: 'Degraded (Level 1)',
  DEGRADED_2: 'Degraded (Level 2)',
  DEGRADED_3: 'Degraded (Level 3)',
  OFFLINE: 'Offline',
};

/** Brief reason text for each mode. */
const MODE_REASONS: Record<DegradedMode, string> = {
  NOMINAL: '',
  DEGRADED_1: 'Some services are experiencing issues. Non-critical features may be limited.',
  DEGRADED_2: 'Multiple services are degraded. Mutations and active tools are disabled.',
  DEGRADED_3: 'Severe degradation. Only audit and console access remain.',
  OFFLINE: 'All external services are unreachable. System is in read-only emergency mode.',
};

function getDismissKey(mode: DegradedMode): string {
  return `atlas_banner_dismissed_${mode}`;
}

/** Fixed top banner disclosing the current degraded mode to the user. */
export default function DegradedDisclosureBanner(): React.ReactElement | null {
  const { mode, signals } = useDegradedMode();
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissal when mode changes
  useEffect(() => {
    const key = getDismissKey(mode);
    const wasDismissed = sessionStorage.getItem(key) === '1';
    setDismissed(wasDismissed);
  }, [mode]);

  const handleDismiss = useCallback(() => {
    sessionStorage.setItem(getDismissKey(mode), '1');
    setDismissed(true);
  }, [mode]);

  if (mode === 'NOMINAL' || dismissed) {
    return null;
  }

  const disabledFeatures = getDisabledFeatures(mode);
  const failedSignals = signals.filter((s) => !s.ok).map((s) => s.name);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        backgroundColor: MODE_COLORS[mode],
        color: mode === 'OFFLINE' ? '#fca5a5' : '#000',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '14px',
        fontFamily: 'system-ui, sans-serif',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}
      role="alert"
    >
      <div style={{ flex: 1 }}>
        <strong>{MODE_LABELS[mode]}</strong>
        <span style={{ margin: '0 8px' }}>—</span>
        <span>{MODE_REASONS[mode]}</span>
        {failedSignals.length > 0 && (
          <span style={{ marginLeft: 8, opacity: 0.8 }}>
            (Failed: {failedSignals.join(', ')})
          </span>
        )}
        {disabledFeatures.length > 0 && (
          <span style={{ display: 'block', marginTop: 2, fontSize: '12px', opacity: 0.9 }}>
            Affected features: {disabledFeatures.join(', ')}
          </span>
        )}
      </div>
      <button
        onClick={handleDismiss}
        style={{
          background: 'transparent',
          border: '1px solid currentColor',
          color: 'inherit',
          cursor: 'pointer',
          padding: '4px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          marginLeft: '12px',
          flexShrink: 0,
        }}
        aria-label="Dismiss banner"
      >
        Dismiss
      </button>
    </div>
  );
}
