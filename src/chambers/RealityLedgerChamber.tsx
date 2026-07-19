import React, { useMemo, useState } from 'react';
import {
  REALITY_SPINE,
  IMPLEMENTATION_STATES,
  listFeatureRecords,
  summarizeStates,
  stateTier,
  type FeatureRecord,
  type ImplementationState,
} from '../reality/realitySpine';

// Reality Ledger — the interface telling the truth about itself.
//
// Doctrine (§IV State-congruent presentation, §IX Reality Spine):
// every surface below is classified by what it actually is, with evidence.
// Nothing here is estimated, simulated, or decorative. The registry lives in
// src/reality/realitySpine.ts and is type-checked against the route union.

// ─── Design tokens (Quiet Power, consistent with sibling chambers) ─────────
const T = {
  body: 'rgba(226,232,240,0.92)',
  muted: 'rgba(226,232,240,0.55)',
  dim: 'rgba(226,232,240,0.3)',
  gold: 'rgba(201,162,39,0.9)',
  goldSoft: 'rgba(201,162,39,0.55)',
  violet: 'rgba(167,139,250,0.85)',
  danger: 'rgba(239,68,68,0.75)',
  success: 'rgba(34,197,94,0.7)',
  amber: 'rgba(234,179,8,0.75)',
  panel: 'rgba(15,10,30,0.55)',
  inset: 'rgba(5,5,8,0.72)',
  border: 'rgba(88,28,135,0.14)',
};

function tierColor(state: ImplementationState): string {
  switch (stateTier(state)) {
    case 0: return T.dim;
    case 1: return T.violet;
    case 2: return T.amber;
    case 3: return T.success;
  }
}

function StateChip({ state }: { state: ImplementationState }) {
  const color = tierColor(state);
  return (
    <span
      style={{
        fontSize: '0.62rem',
        letterSpacing: '0.08em',
        color,
        border: `1px solid ${color}`,
        borderRadius: 3,
        padding: '2px 7px',
        whiteSpace: 'nowrap',
        opacity: 0.95,
      }}
    >
      {state}
    </span>
  );
}

function FeatureRow({ record }: { record: FeatureRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        background: T.inset,
        border: `1px solid ${T.border}`,
        borderRadius: 6,
        padding: '10px 14px',
        cursor: 'pointer',
      }}
      onClick={() => setOpen((v) => !v)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ color: T.body, fontSize: '0.85rem', flex: 1 }}>
          {record.title}
          <span style={{ color: T.dim, fontSize: '0.68rem', marginLeft: 8 }}>{record.mode}</span>
        </span>
        <StateChip state={record.state} />
      </div>
      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <div style={{ color: T.goldSoft, fontSize: '0.62rem', letterSpacing: '0.1em', marginBottom: 3 }}>
              EVIDENCE
            </div>
            <div style={{ color: T.muted, fontSize: '0.76rem', lineHeight: 1.5 }}>{record.evidence}</div>
          </div>
          {record.gaps.length > 0 && (
            <div>
              <div style={{ color: T.goldSoft, fontSize: '0.62rem', letterSpacing: '0.1em', marginBottom: 3 }}>
                WHAT PREVENTS THE NEXT STATE
              </div>
              {record.gaps.map((gap, i) => (
                <div key={i} style={{ color: T.muted, fontSize: '0.76rem', lineHeight: 1.5, display: 'flex', gap: 6 }}>
                  <span style={{ color: T.dim }}>—</span>
                  <span>{gap}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RealityLedgerChamber() {
  const [stateFilter, setStateFilter] = useState<ImplementationState | 'all'>('all');

  const records = useMemo(() => listFeatureRecords(), []);
  const summary = useMemo(() => summarizeStates(), []);
  const total = records.length;

  const filtered = stateFilter === 'all' ? records : records.filter((r) => r.state === stateFilter);

  const byDomain = useMemo(() => {
    const map = new Map<string, FeatureRecord[]>();
    for (const r of filtered) {
      const list = map.get(r.domain) ?? [];
      list.push(r);
      map.set(r.domain, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => stateTier(a.state) - stateTier(b.state) || a.title.localeCompare(b.title));
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const verifiedCount = records.filter((r) => stateTier(r.state) === 3).length;
  const usableCount = records.filter((r) => stateTier(r.state) === 2).length;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', color: T.body }}>
      <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Header */}
        <header>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 500, letterSpacing: '0.02em', color: T.body, margin: 0 }}>
            Reality Ledger
          </h1>
          <p style={{ color: T.muted, fontSize: '0.82rem', lineHeight: 1.6, maxWidth: 640, marginTop: 8 }}>
            The honest implementation state of every Atlas surface, with evidence. Vision, scaffold,
            partial implementation, and confirmed behavior are never collapsed into “done.” This ledger
            is hand-audited and type-enforced: a surface cannot enter the interface without a
            classification here.
          </p>
        </header>

        {/* Headline reality */}
        <section
          style={{
            background: T.panel,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ color: T.goldSoft, fontSize: '0.64rem', letterSpacing: '0.12em' }}>
            SYSTEM REALITY — AUDITED 2026-07-19
          </div>
          <div style={{ color: T.muted, fontSize: '0.8rem', lineHeight: 1.6 }}>
            {total} routed surfaces. {verifiedCount} verified at runtime. {usableCount} usable today
            (local persistence or partial integration); the remainder are backend-only, scaffolds, or
            doctrine awaiting construction. The primary Atlas conversation and Home inquiry now stream
            through the governed backend (`/v1/chat/omni-stream`); most other chambers still persist
            locally without governed memory — closing that gap, surface by surface, is the current
            work. Per-surface evidence and gaps below are the authoritative record.
          </div>
        </section>

        {/* State summary + filters */}
        <section style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setStateFilter('all')}
            style={{
              background: stateFilter === 'all' ? 'rgba(201,162,39,0.12)' : 'transparent',
              border: `1px solid ${stateFilter === 'all' ? T.gold : T.border}`,
              color: stateFilter === 'all' ? T.gold : T.muted,
              borderRadius: 4,
              padding: '4px 10px',
              fontSize: '0.68rem',
              letterSpacing: '0.06em',
              cursor: 'pointer',
            }}
          >
            ALL · {total}
          </button>
          {summary.map(({ state, count }) => (
            <button
              key={state}
              onClick={() => setStateFilter(state === stateFilter ? 'all' : state)}
              style={{
                background: stateFilter === state ? 'rgba(201,162,39,0.12)' : 'transparent',
                border: `1px solid ${stateFilter === state ? T.gold : T.border}`,
                color: tierColor(state),
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: '0.68rem',
                letterSpacing: '0.06em',
                cursor: 'pointer',
              }}
            >
              {state} · {count}
            </button>
          ))}
        </section>

        {/* Domain groups */}
        {byDomain.map(([domain, list]) => (
          <section key={domain} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ color: T.dim, fontSize: '0.66rem', letterSpacing: '0.14em' }}>
              {domain.toUpperCase()} · {list.length}
            </div>
            {list.map((record) => (
              <FeatureRow key={record.mode} record={record} />
            ))}
          </section>
        ))}

        {/* Ledger's own limits */}
        <footer style={{ color: T.dim, fontSize: '0.7rem', lineHeight: 1.6, paddingBottom: 24 }}>
          Limits of this ledger: states are maintained by audit of routing and source, not by runtime
          probes; no state above {`FRONTEND_ONLY / PARTIALLY_INTEGRATED`} is claimed anywhere because
          none has been verified. The ledger itself is {REALITY_SPINE['reality-ledger'].state} and is
          listed above under Evidence with its own gaps. States: {IMPLEMENTATION_STATES.join(' → ')}.
        </footer>
      </div>
    </div>
  );
}
