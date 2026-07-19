// Privacy Center (Vision §XXVII / §XXIX) — retention, holds, erasure, audit.
// Consumes atlas-backend retentionRoutes.ts. Erasure is irreversible and gated
// behind an explicit typed-email confirmation.
import React, { useCallback, useEffect, useState } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { atlasApiUrl, atlasHttpEnabled } from '../lib/atlasApi';
import { atlasTraceUserId } from '../lib/atlasTraceContext';

type Row = Record<string, unknown>;

const label: React.CSSProperties = {
  fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.12em',
  color: 'rgba(226,232,240,0.28)', textTransform: 'uppercase', marginBottom: 10,
};
const card: React.CSSProperties = {
  background: 'var(--atlas-surface-panel)',
  border: '1px solid var(--border-structural)',
  borderRadius: 'var(--radius-sm)',
  padding: '14px 16px',
  marginBottom: 14,
};
const bodyText: React.CSSProperties = {
  margin: 0, fontSize: '0.82rem', color: 'rgba(226,232,240,0.72)', lineHeight: 1.65,
};
const dimText: React.CSSProperties = {
  margin: 0, fontSize: '0.75rem', color: 'rgba(226,232,240,0.4)', lineHeight: 1.6,
};

function str(row: Row, key: string): string {
  const v = row[key];
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

export default function PrivacyCenterChamber() {
  const store = useAtlasStore();
  const userId = atlasTraceUserId(store);
  const userEmail = store.currentUser?.email ?? '';
  const httpOk = atlasHttpEnabled();

  const [status, setStatus] = useState<Row | null>(null);
  const [holds, setHolds] = useState<Row[]>([]);
  const [audit, setAudit] = useState<Row[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [confirmEmail, setConfirmEmail] = useState('');
  const [erasureReason, setErasureReason] = useState<'USER_REQUEST' | 'GDPR' | 'CCPA'>('USER_REQUEST');
  const [erasureBusy, setErasureBusy] = useState(false);
  const [erasureResult, setErasureResult] = useState<string | null>(null);
  const [erasureError, setErasureError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [sRes, hRes, aRes] = await Promise.all([
        fetch(atlasApiUrl('/api/governance/retention/status'), { credentials: 'include' }),
        fetch(atlasApiUrl('/api/governance/retention/holds'), { credentials: 'include' }),
        fetch(atlasApiUrl('/api/governance/retention/audit'), { credentials: 'include' }),
      ]);
      if (!sRes.ok) throw new Error(`Retention status: HTTP ${sRes.status}`);
      setStatus((await sRes.json()) as Row);
      if (hRes.ok) setHolds(((await hRes.json()) as { holds: Row[] }).holds ?? []);
      if (aRes.ok) setAudit(((await aRes.json()) as { events: Row[] }).events ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load retention state.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (httpOk) void load();
  }, [httpOk, load]);

  const requestErasure = useCallback(async () => {
    if (!userEmail || confirmEmail.trim().toLowerCase() !== userEmail.toLowerCase()) return;
    setErasureBusy(true);
    setErasureError(null);
    setErasureResult(null);
    try {
      const res = await fetch(atlasApiUrl('/api/governance/retention/erasure'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId, email: userEmail, reason: erasureReason }),
      });
      const data = (await res.json()) as { certificate?: Row; error?: string; message?: string };
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      setErasureResult(
        `Erasure request accepted. Certificate: ${JSON.stringify(data.certificate ?? {}, null, 2)}`
      );
      setConfirmEmail('');
      await load();
    } catch (e) {
      setErasureError(e instanceof Error ? e.message : 'Erasure request failed.');
    } finally {
      setErasureBusy(false);
    }
  }, [userId, userEmail, confirmEmail, erasureReason, load]);

  const erasureArmed = Boolean(userEmail) && confirmEmail.trim().toLowerCase() === userEmail.toLowerCase();

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 300, letterSpacing: '-0.02em', color: 'rgba(226,232,240,0.85)' }}>
            Privacy Center
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'rgba(226,232,240,0.3)' }}>
            Retention, legal holds, erasure, and the audit trail — the backend's real state, not policy prose.
          </p>
        </div>

        {!httpOk && (
          <div style={card}>
            <p style={{ ...bodyText, color: 'rgba(234,179,8,0.7)' }}>
              No backend connection configured for this build. Retention and erasure are backend-governed and
              cannot be inspected offline.
            </p>
          </div>
        )}

        {httpOk && (
          <>
            {loadError && (
              <div style={card}>
                <p style={{ ...bodyText, color: 'rgba(239,68,68,0.75)' }}>{loadError}</p>
              </div>
            )}
            {loading && <div style={card}><p style={dimText}>Loading retention state…</p></div>}

            {status && (
              <div style={card}>
                <div style={label}>Retention Status</div>
                <pre
                  style={{
                    margin: 0, fontSize: '0.72rem', color: 'rgba(226,232,240,0.6)', lineHeight: 1.6,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'JetBrains Mono, monospace',
                    maxHeight: 220, overflowY: 'auto',
                  }}
                >
                  {JSON.stringify(status, null, 2)}
                </pre>
              </div>
            )}

            <div style={card}>
              <div style={label}>Active Legal Holds</div>
              {holds.length === 0 ? (
                <p style={dimText}>No active holds. Deletion flows run unobstructed.</p>
              ) : (
                holds.map((h, i) => (
                  <p key={str(h, 'id') || i} style={{ ...bodyText, marginBottom: 6 }}>
                    {str(h, 'id')} — {str(h, 'reason') || str(h, 'description') || 'hold'}
                  </p>
                ))
              )}
            </div>

            <div style={card}>
              <div style={label}>Recent Retention Events</div>
              {audit.length === 0 ? (
                <p style={dimText}>No retention events recorded yet.</p>
              ) : (
                audit.slice(0, 12).map((e, i) => (
                  <p key={i} style={{ ...dimText, marginBottom: 5 }}>
                    {str(e, 'timestamp') || str(e, 'created_at')} · {str(e, 'event_type') || str(e, 'type')} ·{' '}
                    {str(e, 'detail') || str(e, 'description')}
                  </p>
                ))
              )}
            </div>

            {/* Erasure — irreversible; typed-email confirmation required */}
            <div style={{ ...card, borderColor: 'var(--border-danger)' }}>
              <div style={{ ...label, color: 'rgba(239,68,68,0.6)' }}>Erasure Request (irreversible)</div>
              <p style={{ ...dimText, marginBottom: 10 }}>
                Initiates a governed erasure of your data (GDPR/CCPA-grade). This cannot be undone. Type your
                account email to arm the request.
              </p>
              {!userEmail && (
                <p style={{ ...dimText, color: 'rgba(234,179,8,0.7)' }}>
                  No account email on this session — sign in before requesting erasure.
                </p>
              )}
              {userEmail && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <input
                      value={confirmEmail}
                      onChange={(e) => setConfirmEmail(e.target.value)}
                      placeholder={`Type ${userEmail} to confirm`}
                      style={{
                        flex: 1, minWidth: 240, background: 'var(--atlas-surface-inset)',
                        border: '1px solid var(--border-default)', borderRadius: 6, padding: '9px 11px',
                        color: 'rgba(226,232,240,0.88)', fontSize: '0.8rem', fontFamily: 'inherit', outline: 'none',
                      }}
                    />
                    <select
                      value={erasureReason}
                      onChange={(e) => setErasureReason(e.target.value as typeof erasureReason)}
                      style={{
                        background: 'var(--atlas-surface-inset)', border: '1px solid var(--border-default)',
                        borderRadius: 6, padding: '9px 11px', color: 'rgba(226,232,240,0.7)',
                        fontSize: '0.78rem', fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
                      }}
                    >
                      <option value="USER_REQUEST">User request</option>
                      <option value="GDPR">GDPR</option>
                      <option value="CCPA">CCPA</option>
                    </select>
                  </div>
                  <button
                    onClick={() => void requestErasure()}
                    disabled={!erasureArmed || erasureBusy}
                    style={{
                      padding: '8px 16px', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.75rem',
                      background: erasureArmed ? 'rgba(239,68,68,0.14)' : 'transparent',
                      border: `1px solid ${erasureArmed ? 'rgba(239,68,68,0.45)' : 'var(--border-subtle)'}`,
                      color: erasureArmed ? 'rgba(239,68,68,0.85)' : 'rgba(226,232,240,0.25)',
                      cursor: erasureArmed && !erasureBusy ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {erasureBusy ? 'Submitting…' : 'Request erasure'}
                  </button>
                </>
              )}
              {erasureError && <p style={{ ...bodyText, color: 'rgba(239,68,68,0.75)', marginTop: 10 }}>{erasureError}</p>}
              {erasureResult && (
                <pre
                  style={{
                    marginTop: 10, fontSize: '0.7rem', color: 'rgba(34,197,94,0.7)', lineHeight: 1.6,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  {erasureResult}
                </pre>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
