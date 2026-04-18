/**
 * HomeChamber — Today-in-Atlas landing surface.
 *
 * Replaces PulseChamber as the `today-in-atlas` view. Six sections per
 * Refine.txt §3:
 *
 *   1. Pulse (system heartbeat + last-24h activity summary)
 *   2. Resume (jump back to most recently active chamber)
 *   3. Pinned chambers (grid — from useNavStore.pinnedChambers)
 *   4. Recents (list — from useNavStore.recentChambers)
 *   5. System status (degraded/ok badge — wired to /health)
 *   6. Open gaps (if user is sovereign_creator; links to Gap Ledger)
 *
 * Presentation only: sections fall back to empty-state copy when their
 * data source is empty, so a brand-new user still sees a coherent page.
 */
import React, { useEffect, useState } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { useNavStore, PIN_VISIBLE_MOBILE } from '../store/useNavStore';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  getChamber,
  Icon,
  ICONS,
} from '../components/shell/chamberCatalog';
import type { ChamberDef } from '../components/shell/chamberCatalog';
import { atlasApiUrl } from '../lib/atlasApi';

type HealthStatus = 'ok' | 'degraded' | 'down' | 'unknown';

interface HealthResp {
  status?: HealthStatus;
  dependencies?: Array<{ name: string; ok: boolean; latencyMs?: number }>;
}

// ── Section frame ─────────────────────────────────────────────────────────

function SectionHeader({ icon, label, hint }: { icon: string; label: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          borderRadius: 4,
          background: 'rgba(26,16,60,0.6)',
          color: 'rgba(201,162,39,0.85)',
        }}
      >
        <Icon path={ICONS[icon] ?? ICONS.atlas} size={13} />
      </span>
      <span
        style={{
          fontSize: '0.75rem',
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'rgba(226,232,240,0.78)',
        }}
      >
        {label}
      </span>
      {hint && (
        <span style={{ fontSize: '0.72rem', color: 'rgba(226,232,240,0.4)' }}>
          {hint}
        </span>
      )}
    </div>
  );
}

function Card({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{
        padding: 14,
        background: 'rgba(18,10,42,0.55)',
        border: '1px solid rgba(88,28,135,0.22)',
        borderRadius: 6,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 140ms ease, background 140ms ease',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(201,162,39,0.45)';
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(88,28,135,0.22)';
        }
      }}
    >
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: '14px 16px',
        border: '1px dashed rgba(88,28,135,0.28)',
        borderRadius: 6,
        color: 'rgba(226,232,240,0.5)',
        fontSize: '0.8rem',
        lineHeight: 1.5,
      }}
    >
      {text}
    </div>
  );
}

// ── Data hooks ────────────────────────────────────────────────────────────

function useHealth(): HealthResp | null {
  const [data, setData] = useState<HealthResp | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(atlasApiUrl('/health'), { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as HealthResp;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData({ status: 'unknown' });
      }
    };
    void load();
    const t = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);
  return data;
}

// ── Chamber ───────────────────────────────────────────────────────────────

export default function HomeChamber() {
  const setActiveMode = useAtlasStore((s) => s.setActiveMode);
  const currentUser = useAtlasStore((s) => s.currentUser);
  const isCreator = currentUser?.role === 'sovereign_creator';
  const isMobile = useIsMobile();

  const pinnedIds = useNavStore((s) => s.pinnedChambers);
  const recentIds = useNavStore((s) => s.recentChambers);

  const pinned: ChamberDef[] = pinnedIds
    .map((id) => getChamber(id))
    .filter((c): c is ChamberDef => !!c && (!c.creatorOnly || isCreator));
  const visiblePinned = isMobile ? pinned.slice(0, PIN_VISIBLE_MOBILE) : pinned;

  const recents: ChamberDef[] = recentIds
    .filter((id) => id !== 'today-in-atlas')
    .map((id) => getChamber(id))
    .filter((c): c is ChamberDef => !!c && (!c.creatorOnly || isCreator))
    .slice(0, 6);

  const health = useHealth();
  const status: HealthStatus = health?.status ?? 'unknown';
  const statusColor =
    status === 'ok'
      ? 'rgba(134, 239, 172, 0.85)'
      : status === 'degraded'
        ? 'rgba(234, 179, 8, 0.85)'
        : status === 'down'
          ? 'rgba(248, 113, 113, 0.85)'
          : 'rgba(226,232,240,0.4)';
  const statusLabel =
    status === 'ok'
      ? 'All systems nominal'
      : status === 'degraded'
        ? 'Degraded mode — some dependencies unreachable'
        : status === 'down'
          ? 'Atlas backend is down'
          : 'Status unknown';

  const resumeChamber: ChamberDef | undefined = recents[0];

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: isMobile ? '20px 16px 32px' : '32px 40px',
        color: 'rgba(226,232,240,0.92)',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ maxWidth: 1040, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* Pulse — header banner */}
        <header>
          <div
            style={{
              fontSize: '0.72rem',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'rgba(201,162,39,0.7)',
              marginBottom: 8,
            }}
          >
            Today in Atlas
          </div>
          <h1
            style={{
              fontSize: isMobile ? '1.35rem' : '1.75rem',
              fontWeight: 600,
              margin: 0,
              color: 'rgba(226,232,240,0.95)',
            }}
          >
            {currentUser?.email ? `Welcome back, ${currentUser.email.split('@')[0]}.` : 'Welcome back.'}
          </h1>
          <p
            style={{
              marginTop: 6,
              fontSize: '0.85rem',
              color: 'rgba(226,232,240,0.58)',
              maxWidth: 620,
              lineHeight: 1.5,
            }}
          >
            Jump back where you left off, check system pulse, or open a pinned chamber.
          </p>
        </header>

        {/* Resume */}
        {resumeChamber && (
          <section>
            <SectionHeader icon="atlas" label="Resume" hint="most recent chamber" />
            <Card onClick={() => setActiveMode(resumeChamber.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon path={ICONS[resumeChamber.icon] ?? ICONS.atlas} size={16} />
                <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{resumeChamber.label}</span>
              </div>
              {resumeChamber.description && (
                <span style={{ fontSize: '0.78rem', color: 'rgba(226,232,240,0.55)' }}>
                  {resumeChamber.description}
                </span>
              )}
            </Card>
          </section>
        )}

        {/* Pinned */}
        <section>
          <SectionHeader
            icon="pin"
            label="Pinned"
            hint={isMobile ? `showing up to ${PIN_VISIBLE_MOBILE}` : undefined}
          />
          {visiblePinned.length === 0 ? (
            <EmptyState text="Pin chambers for faster access. Long-press on mobile or use the pin icon on any chamber." />
          ) : (
            <div
              style={{
                display: 'grid',
                gap: 10,
                gridTemplateColumns: isMobile
                  ? 'repeat(2, minmax(0, 1fr))'
                  : 'repeat(auto-fill, minmax(200px, 1fr))',
              }}
            >
              {visiblePinned.map((c) => (
                <Card key={c.id} onClick={() => setActiveMode(c.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon path={ICONS[c.icon] ?? ICONS.atlas} size={14} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{c.label}</span>
                  </div>
                  {c.description && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        color: 'rgba(226,232,240,0.5)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {c.description}
                    </span>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Recents */}
        <section>
          <SectionHeader icon="journal" label="Recents" />
          {recents.length === 0 ? (
            <EmptyState text="Chambers you visit will show up here for quick jump-back." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recents.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveMode(c.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    background: 'transparent',
                    border: '1px solid rgba(88,28,135,0.18)',
                    borderRadius: 4,
                    cursor: 'pointer',
                    color: 'inherit',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    fontSize: '0.85rem',
                    transition: 'border-color 120ms ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,162,39,0.4)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(88,28,135,0.18)';
                  }}
                >
                  <Icon path={ICONS[c.icon] ?? ICONS.atlas} size={13} />
                  <span style={{ flex: 1 }}>{c.label}</span>
                  {c.description && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        color: 'rgba(226,232,240,0.45)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '50%',
                      }}
                    >
                      {c.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* System status */}
        <section>
          <SectionHeader icon="control" label="System status" />
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: statusColor,
                  boxShadow: `0 0 8px ${statusColor}`,
                }}
              />
              <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{statusLabel}</span>
            </div>
            {health?.dependencies && health.dependencies.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginTop: 6,
                  fontSize: '0.72rem',
                  color: 'rgba(226,232,240,0.55)',
                }}
              >
                {health.dependencies.map((d) => (
                  <span
                    key={d.name}
                    style={{
                      padding: '2px 8px',
                      borderRadius: 3,
                      background: d.ok ? 'rgba(134,239,172,0.1)' : 'rgba(248,113,113,0.15)',
                      border: `1px solid ${d.ok ? 'rgba(134,239,172,0.25)' : 'rgba(248,113,113,0.35)'}`,
                    }}
                  >
                    {d.name}
                    {typeof d.latencyMs === 'number' && ` · ${d.latencyMs}ms`}
                  </span>
                ))}
              </div>
            )}
          </Card>
        </section>

        {/* Open gaps — creator only */}
        {isCreator && (
          <section>
            <SectionHeader icon="gapLedger" label="Open gaps" hint="creator only" />
            <Card onClick={() => setActiveMode('gap-ledger')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon path={ICONS.gapLedger} size={14} />
                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Open the Gap Ledger</span>
              </div>
              <span style={{ fontSize: '0.78rem', color: 'rgba(226,232,240,0.55)' }}>
                Review ranked architectural weaknesses and next actions.
              </span>
            </Card>
          </section>
        )}
      </div>
    </div>
  );
}
