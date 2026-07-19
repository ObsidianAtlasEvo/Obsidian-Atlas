// Home — sovereign orientation surface (Vision §XI).
// Shows what matters now from real store state (pulse, decisions, threads, directives),
// live backend health (state-congruent, §IV), and an inquiry surface that streams
// through the governed backend (atlasOmniStream → /v1/chat/omni-stream).
import React, { useEffect, useRef, useState } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { streamOmniChat, AtlasStreamError } from '../lib/atlasOmniStream';
import { atlasApiUrl, atlasHttpEnabled } from '../lib/atlasApi';
import { atlasTraceUserId } from '../lib/atlasTraceContext';
import { nowISO } from '../lib/persistence';
import type { UserQuestion } from '@/types';

type HealthState =
  | { kind: 'checking' }
  | { kind: 'ok'; status: string; checks: { name: string; ok: boolean }[] }
  | { kind: 'unreachable'; detail: string };

const label: React.CSSProperties = {
  fontSize: '0.62rem',
  fontWeight: 600,
  letterSpacing: '0.12em',
  color: 'rgba(226,232,240,0.28)',
  textTransform: 'uppercase',
  marginBottom: 10,
};

const card: React.CSSProperties = {
  background: 'var(--atlas-surface-panel)',
  border: '1px solid var(--border-structural)',
  borderRadius: 'var(--radius-sm)',
  padding: '14px 16px',
};

function SectionEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(226,232,240,0.25)', lineHeight: 1.6 }}>
      {children}
    </p>
  );
}

export default function HomeChamber() {
  const store = useAtlasStore();
  const setActiveMode = useAtlasStore((s) => s.setActiveMode);

  const [query, setQuery] = useState('');
  const [streamText, setStreamText] = useState('');
  const [inquiryState, setInquiryState] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle');
  const [inquiryError, setInquiryError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthState>({ kind: 'checking' });
  const abortRef = useRef<AbortController | null>(null);

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // Live backend health — shown truthfully, including "unreachable" (§IV state congruence).
  useEffect(() => {
    let cancelled = false;
    if (!atlasHttpEnabled()) {
      setHealth({ kind: 'unreachable', detail: 'No backend configured for this build.' });
      return;
    }
    (async () => {
      try {
        const res = await fetch(atlasApiUrl('/health'), { signal: AbortSignal.timeout(5000) });
        const data = (await res.json()) as { status?: string; checks?: { name: string; ok: boolean }[] };
        if (!cancelled) setHealth({ kind: 'ok', status: data.status ?? 'unknown', checks: data.checks ?? [] });
      } catch {
        if (!cancelled) setHealth({ kind: 'unreachable', detail: 'Backend not reachable from this session.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const attention = [...store.pulse.items]
    .filter((p) => p.type === 'attention' || p.type === 'neglected')
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 4);
  const unresolvedDecisions = store.decisions.filter((d) => d.status === 'pending').slice(0, 3);
  const recentThreads = store.recentQuestions.slice(0, 3);
  const activeDirectives = store.directives.filter((d) => d.isActive).slice(0, 3);

  function submitInquiry() {
    const q = query.trim();
    if (!q || inquiryState === 'streaming') return;
    setStreamText('');
    setInquiryError(null);
    setInquiryState('streaming');

    abortRef.current = streamOmniChat(
      [{ role: 'user', content: q }],
      {
        onToken: (t) => setStreamText((prev) => prev + t),
        onDone: (full) => {
          setInquiryState('done');
          setStreamText(full);
          const question: UserQuestion = {
            id: `uq-${Date.now()}`,
            text: q,
            timestamp: nowISO(),
            analysis: { style: 'synthetic', depth: store.activePosture.depth, dimensions: {} },
            response: {
              synthesis: full,
              latentPatterns: [],
              strategicImplications: [],
              suggestedChambers: [],
              epistemicStatus: 'inference',
              cognitiveSignatureImpact: 'Home inquiry via omni-stream',
            },
          };
          store.addQuestion(question);
        },
        onError: (err: AtlasStreamError) => {
          setInquiryState('error');
          setInquiryError(
            err.code === 'ABORTED'
              ? 'Inquiry cancelled.'
              : err.code === 'NETWORK'
                ? 'Cannot reach the Atlas backend. The inquiry surface needs a live connection.'
                : err.message
          );
        },
      },
      {
        userId: atlasTraceUserId(store),
        posture: store.activePosture.depth,
        lineOfInquiry: 'home-orientation',
      }
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 28, animation: 'atlas-fade-in 400ms ease both' }}>
          <div style={{ fontSize: '0.7rem', color: 'rgba(226,232,240,0.3)', letterSpacing: '0.08em', marginBottom: 4 }}>
            {dateStr}
          </div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 300, letterSpacing: '-0.03em', color: 'rgba(226,232,240,0.85)' }}>
            {greeting}.
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '0.875rem', color: 'rgba(226,232,240,0.3)' }}>
            What matters now — from your own record, not a feed.
          </p>
        </div>

        {/* Inquiry surface */}
        <div style={{ ...card, marginBottom: 24 }}>
          <div style={label}>Inquiry</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submitInquiry();
                }
              }}
              placeholder="Ask Atlas — routed through the governed backend…"
              rows={2}
              style={{
                flex: 1,
                background: 'var(--atlas-surface-inset)',
                border: '1px solid var(--border-default)',
                borderRadius: 6,
                padding: '10px 12px',
                color: 'rgba(226,232,240,0.88)',
                fontSize: '0.85rem',
                fontFamily: 'inherit',
                lineHeight: 1.6,
                outline: 'none',
                resize: 'none',
              }}
            />
            {inquiryState === 'streaming' ? (
              <button
                onClick={() => abortRef.current?.abort()}
                style={{
                  padding: '10px 16px',
                  borderRadius: 6,
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  color: 'rgba(239,68,68,0.8)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontFamily: 'inherit',
                }}
              >
                Stop
              </button>
            ) : (
              <button
                onClick={submitInquiry}
                disabled={!query.trim()}
                style={{
                  padding: '10px 16px',
                  borderRadius: 6,
                  background: query.trim() ? 'rgba(201,162,39,0.15)' : 'transparent',
                  border: `1px solid ${query.trim() ? 'rgba(201,162,39,0.4)' : 'var(--border-subtle)'}`,
                  color: query.trim() ? 'rgba(201,162,39,0.9)' : 'rgba(226,232,240,0.2)',
                  cursor: query.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '0.75rem',
                  fontFamily: 'inherit',
                }}
              >
                Ask
              </button>
            )}
          </div>

          {(streamText || inquiryError) && (
            <div style={{ marginTop: 14, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
              {inquiryError ? (
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(239,68,68,0.75)', lineHeight: 1.6 }}>
                  {inquiryError}
                </p>
              ) : (
                <>
                  <p style={{ margin: 0, fontSize: '0.84rem', color: 'rgba(226,232,240,0.82)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {streamText}
                  </p>
                  {inquiryState === 'done' && (
                    <button
                      onClick={() => setActiveMode('atlas')}
                      style={{
                        marginTop: 10,
                        background: 'transparent',
                        border: 'none',
                        color: 'rgba(201,162,39,0.6)',
                        fontSize: '0.7rem',
                        letterSpacing: '0.06em',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      Continue in Atlas →
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Orientation grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 24 }}>
          <div style={card}>
            <div style={label}>Requires Attention</div>
            {attention.length === 0 ? (
              <SectionEmpty>Nothing flagged. Add pulse items as things start to matter.</SectionEmpty>
            ) : (
              attention.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActiveMode('pulse')}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
                    border: 'none', borderLeft: '2px solid rgba(234,179,8,0.6)', padding: '4px 10px',
                    marginBottom: 8, cursor: 'pointer', color: 'rgba(226,232,240,0.72)',
                    fontSize: '0.8rem', lineHeight: 1.55, fontFamily: 'inherit',
                  }}
                >
                  {p.content}
                </button>
              ))
            )}
          </div>

          <div style={card}>
            <div style={label}>Unresolved Decisions</div>
            {unresolvedDecisions.length === 0 ? (
              <SectionEmpty>No pending decisions on record.</SectionEmpty>
            ) : (
              unresolvedDecisions.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setActiveMode('decisions')}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
                    border: 'none', borderLeft: '2px solid rgba(99,102,241,0.6)', padding: '4px 10px',
                    marginBottom: 8, cursor: 'pointer', color: 'rgba(226,232,240,0.72)',
                    fontSize: '0.8rem', lineHeight: 1.55, fontFamily: 'inherit',
                  }}
                >
                  {d.title}
                </button>
              ))
            )}
          </div>

          <div style={card}>
            <div style={label}>Recent Threads</div>
            {recentThreads.length === 0 ? (
              <SectionEmpty>No inquiries yet. Ask something above.</SectionEmpty>
            ) : (
              recentThreads.map((qn) => (
                <button
                  key={qn.id}
                  onClick={() => setActiveMode('atlas')}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
                    border: 'none', borderLeft: '2px solid rgba(167,139,250,0.55)', padding: '4px 10px',
                    marginBottom: 8, cursor: 'pointer', color: 'rgba(226,232,240,0.72)',
                    fontSize: '0.8rem', lineHeight: 1.55, fontFamily: 'inherit',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {qn.text}
                </button>
              ))
            )}
          </div>

          <div style={card}>
            <div style={label}>Active Directives</div>
            {activeDirectives.length === 0 ? (
              <SectionEmpty>No standing directives. Set them in the Directive Center.</SectionEmpty>
            ) : (
              activeDirectives.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setActiveMode('directive-center')}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
                    border: 'none', borderLeft: '2px solid rgba(201,162,39,0.55)', padding: '4px 10px',
                    marginBottom: 8, cursor: 'pointer', color: 'rgba(226,232,240,0.72)',
                    fontSize: '0.8rem', lineHeight: 1.55, fontFamily: 'inherit',
                  }}
                >
                  {d.text}
                </button>
              ))
            )}
          </div>
        </div>

        {/* System health — real state, stated plainly */}
        <div style={{ ...card, marginBottom: 24 }}>
          <div style={label}>System Health</div>
          {health.kind === 'checking' ? (
            <SectionEmpty>Checking backend…</SectionEmpty>
          ) : health.kind === 'unreachable' ? (
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(234,179,8,0.7)', lineHeight: 1.6 }}>
              {health.detail} Conversations and orientation still work from local state; governed features (memory,
              routing, research) need the backend.
            </p>
          ) : (
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: health.status === 'ok' ? 'rgba(34,197,94,0.8)' : 'rgba(234,179,8,0.8)',
                }}
              >
                {health.status}
              </span>
              {health.checks.map((c) => (
                <span key={c.name} style={{ fontSize: '0.72rem', color: c.ok ? 'rgba(226,232,240,0.45)' : 'rgba(239,68,68,0.7)' }}>
                  {c.name}: {c.ok ? 'ok' : 'failing'}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Quick access */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(
            [
              ['Atlas', 'atlas'],
              ['Pulse', 'pulse'],
              ['Journal', 'journal'],
              ['Decisions', 'decisions'],
              ['Memory Vault', 'memory-vault'],
              ['Reality Ledger', 'reality-ledger'],
            ] as const
          ).map(([labelText, mode]) => (
            <button
              key={mode}
              onClick={() => setActiveMode(mode)}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                borderRadius: 20,
                padding: '6px 14px',
                color: 'rgba(226,232,240,0.4)',
                cursor: 'pointer',
                fontSize: '0.72rem',
                fontFamily: 'inherit',
                letterSpacing: '0.04em',
                transition: 'all 140ms ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--atlas-border-hover)';
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(226,232,240,0.7)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)';
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(226,232,240,0.4)';
              }}
            >
              {labelText}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
