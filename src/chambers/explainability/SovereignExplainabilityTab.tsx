import React, { useState } from 'react';
import { ExplainabilityPanel } from './ExplainabilityPanel';
import { useExplainabilityFeed } from './useExplainabilityFeed';

const C = {
  surface: '#0f0f12',
  border: 'rgba(255,255,255,0.07)',
  textMuted: 'rgba(255,255,255,0.3)',
  text: '#f9fafb',
  red: '#dc2626',
};

/**
 * Sovereign Console tab — inspect explanations for any user id (service role data via API).
 */
export function SovereignExplainabilityTab() {
  const [userId, setUserId] = useState('');
  const trimmed = userId.trim();
  const { data, loading, error, refetch } = useExplainabilityFeed(
    trimmed.length > 0 ? trimmed : undefined,
    150,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
      <div
        style={{
          padding: '1rem',
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
        }}
      >
        <label style={{ display: 'block', fontSize: '0.65rem', color: C.textMuted, marginBottom: 6, letterSpacing: '0.08em' }}>
          USER ID
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="e.g. firebase uid or internal user id"
            style={{
              flex: 1,
              minWidth: 200,
              padding: '0.5rem 0.75rem',
              background: '#0a0a0c',
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              color: C.text,
              fontSize: '0.875rem',
            }}
          />
          <button
            type="button"
            onClick={() => void refetch()}
            style={{
              padding: '0.5rem 1rem',
              background: C.red,
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Load
          </button>
        </div>
        {error ? (
          <p style={{ marginTop: 8, fontSize: '0.75rem', color: C.red }}>{error}</p>
        ) : null}
      </div>

      <div style={{ flex: 1, minHeight: 400, overflow: 'auto', borderRadius: 8 }}>
        {trimmed ? (
          <ExplainabilityPanel
            userId={trimmed}
            recentExplanations={data}
            isLoading={loading}
          />
        ) : (
          <p style={{ color: C.textMuted, fontSize: '0.875rem', padding: '2rem', textAlign: 'center' }}>
            Enter a user id to load the explainability feed.
          </p>
        )}
      </div>
    </div>
  );
}
