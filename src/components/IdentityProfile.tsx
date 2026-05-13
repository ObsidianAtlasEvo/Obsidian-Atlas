import React, { useEffect, useState } from 'react';
import { Brain, Loader2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { atlasApiUrl } from '../lib/atlasApi';

interface IdentitySignal {
  content: string;
  confidence: number;
  kind: string;
  provenance: string;
  created_at: string;
}

interface IdentityDomain {
  domain: string;
  signal_count: number;
  top_signals: IdentitySignal[];
}

interface EvolutionHighlight {
  event_type: string;
  title: string;
  body: string;
  significance: number;
  related_domain: string | null;
  created_at: string;
}

interface TruthSummary {
  statement: string;
  status: string;
  confidence: number;
}

interface CorrectionItem {
  content: string;
  created_at: string;
}

interface MemoryStats {
  total: number;
  by_kind: Record<string, number>;
  correction_count: number;
  high_confidence_count: number;
}

interface IdentityProfileResponse {
  identity_domains: IdentityDomain[];
  memory_stats: MemoryStats;
  evolution_highlights: EvolutionHighlight[];
  recent_corrections: CorrectionItem[];
  truth_ledger_summary: TruthSummary[];
}

const GOLD = '#C9A84C';
const BG = '#0D0D0D';
const TEXT = '#F5F5F5';

function provenanceTone(provenance: string): { bg: string; border: string; color: string } {
  if (provenance === 'user_stated' || provenance === 'corrected_by_user') {
    return { bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.45)', color: 'rgb(134,239,172)' };
  }
  if (provenance === 'user_confirmed') {
    return { bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.45)', color: 'rgb(147,197,253)' };
  }
  return { bg: 'rgba(120,120,120,0.10)', border: 'rgba(160,160,160,0.30)', color: 'rgba(245,245,245,0.6)' };
}

function statusTone(status: string): string {
  if (status === 'verified') return 'rgb(134,239,172)';
  if (status === 'provisional') return 'rgb(250,204,21)';
  if (status === 'disputed') return 'rgb(248,113,113)';
  return 'rgba(245,245,245,0.6)';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      style={{
        height: 3,
        width: '100%',
        background: 'rgba(245,245,245,0.08)',
        borderRadius: 2,
        marginTop: 4,
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: GOLD,
          borderRadius: 2,
        }}
      />
    </div>
  );
}

function DomainCard({ domain }: { domain: IdentityDomain }) {
  const [open, setOpen] = useState(true);
  return (
    <div
      style={{
        border: '1px solid rgba(201,168,76,0.2)',
        borderRadius: 4,
        background: 'rgba(245,245,245,0.02)',
        marginBottom: 12,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          color: TEXT,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span style={{ fontFamily: 'serif', fontSize: 14, color: TEXT }}>{domain.domain}</span>
          <span
            style={{
              fontSize: 10,
              color: 'rgba(245,245,245,0.5)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            {domain.signal_count} signal{domain.signal_count === 1 ? '' : 's'}
          </span>
        </span>
      </button>
      {open && domain.top_signals.length > 0 && (
        <div style={{ padding: '0 16px 14px' }}>
          {domain.top_signals.map((s, i) => {
            const tone = provenanceTone(s.provenance);
            return (
              <div key={i} style={{ marginTop: i === 0 ? 4 : 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontSize: 12, color: TEXT, lineHeight: 1.45 }}>{s.content}</span>
                  <span
                    style={{
                      fontSize: 9,
                      padding: '2px 6px',
                      borderRadius: 3,
                      whiteSpace: 'nowrap',
                      background: tone.bg,
                      border: `1px solid ${tone.border}`,
                      color: tone.color,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      height: 'fit-content',
                    }}
                  >
                    {s.provenance}
                  </span>
                </div>
                <ConfidenceBar value={s.confidence} />
                <div
                  style={{
                    fontSize: 9,
                    color: 'rgba(245,245,245,0.4)',
                    marginTop: 3,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  conf {s.confidence.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontFamily: 'serif',
        fontSize: 13,
        color: GOLD,
        textTransform: 'uppercase',
        letterSpacing: '0.22em',
        marginTop: 32,
        marginBottom: 14,
        paddingBottom: 8,
        borderBottom: '1px solid rgba(201,168,76,0.18)',
      }}
    >
      {children}
    </h3>
  );
}

export function IdentityProfile() {
  const [data, setData] = useState<IdentityProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(atlasApiUrl('/v1/sovereignty/identity-profile'), {
        credentials: 'include',
      });
      if (!res.ok) {
        setError(`Failed to load (${res.status})`);
        setData(null);
      } else {
        const json = (await res.json()) as IdentityProfileResponse;
        setData(json);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div
      style={{
        background: BG,
        color: TEXT,
        padding: '32px 28px',
        minHeight: '100%',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          paddingBottom: 20,
          borderBottom: `1px solid ${GOLD}33`,
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Brain size={22} style={{ color: GOLD }} />
          <div>
            <h2
              style={{
                fontFamily: 'serif',
                fontSize: 22,
                color: GOLD,
                margin: 0,
                letterSpacing: '0.04em',
              }}
            >
              What Atlas Knows About You
            </h2>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 11,
                color: 'rgba(245,245,245,0.55)',
                letterSpacing: '0.04em',
              }}
            >
              Your cognitive model — inspectable, yours
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            color: 'rgba(245,245,245,0.6)',
            background: 'transparent',
            border: `1px solid ${GOLD}33`,
            padding: '6px 10px',
            borderRadius: 3,
            cursor: loading ? 'not-allowed' : 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
          }}
        >
          <RefreshCw size={11} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
          refresh
        </button>
      </header>

      {loading && !data && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 24, color: 'rgba(245,245,245,0.6)' }}>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> loading…
        </div>
      )}

      {error && (
        <div
          style={{
            margin: '16px 0',
            padding: 12,
            border: '1px solid rgba(248,113,113,0.4)',
            background: 'rgba(248,113,113,0.06)',
            color: 'rgb(252,165,165)',
            fontSize: 12,
            borderRadius: 3,
          }}
        >
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Section 1: Memory Overview */}
          <SectionHeader>Memory Overview</SectionHeader>
          <div style={{ fontSize: 12, color: 'rgba(245,245,245,0.85)', marginBottom: 12 }}>
            Total memories: <strong style={{ color: TEXT }}>{data.memory_stats.total}</strong>
            <span style={{ color: 'rgba(245,245,245,0.4)' }}> · </span>
            Corrections: <strong style={{ color: TEXT }}>{data.memory_stats.correction_count}</strong>
            <span style={{ color: 'rgba(245,245,245,0.4)' }}> · </span>
            High confidence: <strong style={{ color: TEXT }}>{data.memory_stats.high_confidence_count}</strong>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(data.memory_stats.by_kind).map(([kind, count]) => (
              <span
                key={kind}
                style={{
                  background: BG,
                  border: `1px solid ${GOLD}55`,
                  color: TEXT,
                  fontSize: 11,
                  padding: '4px 10px',
                  borderRadius: 3,
                  letterSpacing: '0.04em',
                }}
              >
                {kind} <span style={{ color: GOLD }}>({count})</span>
              </span>
            ))}
            {Object.keys(data.memory_stats.by_kind).length === 0 && (
              <span style={{ fontSize: 11, color: 'rgba(245,245,245,0.4)' }}>No memories logged yet.</span>
            )}
          </div>

          {/* Section 2: Identity Domains */}
          <SectionHeader>Identity Domains</SectionHeader>
          {data.identity_domains.length === 0 ? (
            <p style={{ fontSize: 12, color: 'rgba(245,245,245,0.5)' }}>No identity domains resolved yet.</p>
          ) : (
            data.identity_domains.map((d) => <DomainCard key={d.domain} domain={d} />)
          )}

          {/* Section 3: Cognitive Evolution */}
          <SectionHeader>Cognitive Evolution</SectionHeader>
          {data.evolution_highlights.length === 0 ? (
            <p style={{ fontSize: 12, color: 'rgba(245,245,245,0.5)' }}>No evolution events recorded yet.</p>
          ) : (
            <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {data.evolution_highlights.map((ev, i) => (
                <li
                  key={i}
                  style={{
                    display: 'flex',
                    gap: 14,
                    paddingBottom: 16,
                    borderLeft: `1px solid ${GOLD}33`,
                    marginLeft: 6,
                    paddingLeft: 18,
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: -5,
                      top: 4,
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      background: GOLD,
                      boxShadow: `0 0 6px ${GOLD}88`,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 9,
                        color: 'rgba(245,245,245,0.5)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.12em',
                      }}
                    >
                      {ev.event_type}
                      {ev.related_domain && ` · ${ev.related_domain}`}
                    </div>
                    <div style={{ fontSize: 13, color: TEXT, marginTop: 3 }}>{ev.title}</div>
                    <div style={{ fontSize: 11, color: 'rgba(245,245,245,0.65)', marginTop: 3, lineHeight: 1.5 }}>
                      {ev.body.length > 120 ? `${ev.body.slice(0, 120)}…` : ev.body}
                    </div>
                    <div
                      style={{
                        fontSize: 9,
                        color: 'rgba(245,245,245,0.4)',
                        marginTop: 4,
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                      }}
                    >
                      significance: {ev.significance.toFixed(2)} · {formatDate(ev.created_at)}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {/* Section 4: Corrections */}
          <SectionHeader>Things You've Corrected</SectionHeader>
          {data.recent_corrections.length === 0 ? (
            <p style={{ fontSize: 12, color: 'rgba(245,245,245,0.5)' }}>
              No corrections logged yet — Atlas will record when you correct it.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {data.recent_corrections.map((c, i) => (
                <li
                  key={i}
                  style={{
                    padding: '10px 12px',
                    border: '1px solid rgba(245,245,245,0.08)',
                    borderRadius: 3,
                    marginBottom: 8,
                    background: 'rgba(245,245,245,0.02)',
                  }}
                >
                  <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.5 }}>{c.content}</div>
                  <div
                    style={{
                      fontSize: 9,
                      color: 'rgba(245,245,245,0.4)',
                      marginTop: 4,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                    }}
                  >
                    {formatDate(c.created_at)}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Section 5: Truth Ledger */}
          <SectionHeader>Your Truth Ledger</SectionHeader>
          {data.truth_ledger_summary.length === 0 ? (
            <p style={{ fontSize: 12, color: 'rgba(245,245,245,0.5)' }}>No verified truths on file yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {data.truth_ledger_summary.map((t, i) => (
                <li
                  key={i}
                  style={{
                    padding: '8px 0',
                    borderBottom: '1px solid rgba(245,245,245,0.06)',
                    fontSize: 12,
                    color: TEXT,
                    display: 'flex',
                    gap: 10,
                    alignItems: 'baseline',
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: statusTone(t.status),
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    [{t.status} conf={t.confidence.toFixed(2)}]
                  </span>
                  <span style={{ lineHeight: 1.5 }}>{t.statement}</span>
                </li>
              ))}
            </ul>
          )}

          <footer
            style={{
              marginTop: 40,
              paddingTop: 16,
              borderTop: '1px solid rgba(245,245,245,0.08)',
              fontSize: 10,
              color: 'rgba(245,245,245,0.4)',
              letterSpacing: '0.04em',
              lineHeight: 1.5,
            }}
          >
            This model is built from your conversations with Atlas. You can correct any signal using Atlas's sovereignty
            controls.
          </footer>
        </>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
