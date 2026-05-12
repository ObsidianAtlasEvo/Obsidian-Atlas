import React, { useState } from 'react';
import {
  CLAIM_COLORS,
  type EpistemicMetadata,
  type ConstitutionalMetadata,
} from '../lib/epistemicMetadata';

interface Props {
  epistemic: EpistemicMetadata | null;
  constitutional: ConstitutionalMetadata | null;
}

/**
 * Collapsible epistemic-map panel + constitutional-compliance indicator.
 * Renders beneath an assistant message bubble. Both inputs are optional —
 * if both are null the component renders nothing.
 */
export function EpistemicMap({ epistemic, constitutional }: Props) {
  const [open, setOpen] = useState(false);

  const hasClaims = !!epistemic && epistemic.claims.length > 0;
  const hasConstitutional = !!constitutional;

  if (!hasClaims && !hasConstitutional) return null;

  const violations = constitutional?.violations ?? [];
  const flagged = !!constitutional && !constitutional.passed && violations.length > 0;

  return (
    <div style={{ marginTop: 8, marginLeft: 28, fontSize: '0.7rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {hasClaims && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            title="Toggle epistemic map"
            style={{
              background: 'rgba(13,13,13,0.7)',
              border: '1px solid rgba(201,168,76,0.32)',
              color: 'rgba(201,168,76,0.85)',
              padding: '3px 8px',
              borderRadius: 4,
              fontSize: '0.65rem',
              letterSpacing: '0.08em',
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >
            📊 Epistemic Map · {epistemic!.claims.length} · {epistemic!.overall_uncertainty}
          </button>
        )}

        {flagged && (
          <span
            title={`Constitutional flag — ${violations.length} violation${violations.length === 1 ? '' : 's'} (tap to review)`}
            onClick={() => setOpen((v) => !v)}
            style={{
              background: 'rgba(234,179,8,0.10)',
              border: '1px solid rgba(234,179,8,0.45)',
              color: 'rgba(234,179,8,0.95)',
              padding: '2px 7px',
              borderRadius: 4,
              fontSize: '0.62rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              cursor: 'pointer',
            }}
          >
            ⚠ CONSTITUTIONAL FLAG
          </span>
        )}

        {!flagged && hasConstitutional && (
          <span
            title={`Constitutional check passed (score ${constitutional!.compliance_score.toFixed(2)})`}
            style={{
              color: 'rgba(34,197,94,0.55)',
              fontSize: '0.65rem',
              opacity: 0.6,
            }}
          >
            ✓
          </span>
        )}
      </div>

      {open && hasClaims && (
        <div
          style={{
            marginTop: 8,
            padding: '10px 12px',
            background: '#0D0D0D',
            border: '1px solid rgba(201,168,76,0.22)',
            borderRadius: 6,
            color: '#F5F5F5',
          }}
        >
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.1em', color: 'rgba(201,168,76,0.7)', textTransform: 'uppercase', marginBottom: 6 }}>
            Overall uncertainty: {epistemic!.overall_uncertainty}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {epistemic!.claims.map((claim, i) => {
              const c = CLAIM_COLORS[claim.classification];
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                    padding: '6px 0',
                    borderTop: i === 0 ? 'none' : '1px solid rgba(245,245,245,0.06)',
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: '0.55rem',
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      color: c.fg,
                      background: c.bg,
                      border: `1px solid ${c.border}`,
                      borderRadius: 3,
                      padding: '2px 5px',
                      minWidth: 70,
                      textAlign: 'center',
                    }}
                  >
                    {c.label}
                  </span>
                  <div style={{ flex: 1, fontSize: '0.72rem', lineHeight: 1.5 }}>
                    <div style={{ color: 'rgba(245,245,245,0.92)' }}>{claim.claim_text}</div>
                    {claim.basis && (
                      <div style={{ color: 'rgba(245,245,245,0.45)', fontSize: '0.65rem', marginTop: 2 }}>
                        {claim.basis} · confidence {claim.confidence}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {open && flagged && (
        <div
          style={{
            marginTop: 8,
            padding: '10px 12px',
            background: '#0D0D0D',
            border: '1px solid rgba(234,179,8,0.32)',
            borderRadius: 6,
            color: '#F5F5F5',
          }}
        >
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.1em', color: 'rgba(234,179,8,0.85)', textTransform: 'uppercase', marginBottom: 6 }}>
            Constitutional violations
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {violations.map((v, i) => (
              <div key={i} style={{ fontSize: '0.72rem', lineHeight: 1.5 }}>
                <div style={{ color: 'rgba(245,245,245,0.92)' }}>
                  <span style={{ color: 'rgba(234,179,8,0.95)', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.08em', marginRight: 6 }}>{v.severity}</span>
                  {v.principle_text}
                </div>
                <div style={{ color: 'rgba(245,245,245,0.55)', fontSize: '0.66rem', marginTop: 2 }}>
                  {v.violation_description}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
