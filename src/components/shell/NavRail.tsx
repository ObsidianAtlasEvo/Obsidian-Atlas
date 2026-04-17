import React, { useState } from 'react';
import { useAtlasStore } from '../../store/useAtlasStore';
import { ModelSelector } from '../ModelSelector';
import type { AppState } from '@/types';

// ── Chamber Registry ─────────────────────────────────────────────────────

interface ChamberDef {
  id: AppState['activeMode'];
  label: string;
  icon: string; // SVG path or emoji fallback — using inline SVG paths
  group?: string;
  creatorOnly?: boolean;
}

// SVG icon paths (24x24 viewBox)
const ICONS: Record<string, string> = {
  atlas:        'M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.5L20 9l-8 4-8-4 8-4.5zm9 10.5-9 4.5-9-4.5V9.5l9 4.5 9-4.5v5.5z',
  journal:      'M4 2h12l4 4v16H4V2zm12 0v4h4M8 10h8M8 14h8M8 18h5',
  pulse:        'M2 12h4l3-8 4 16 3-8h6',
  decisions:    'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18',
  doctrine:     'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  crucible:     'M9 3H5l-2 9h4l1 9 4-4 4 4 1-9h4L19 3h-4l-3 7-3-7z',
  mirror:       'M12 4a4 4 0 110 8 4 4 0 010-8zm0 10c4.42 0 8 1.79 8 4v2H4v-2c0-2.21 3.58-4 8-4z',
  signals:      'M22 12h-4l-3 9L9 3l-3 9H2',
  canon:        'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  constitution: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  memory:       'M9 3v11l3 3 3-3V3M6 21h12M3 3h18',
  relationships:'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  scenarios:    'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  topology:     'M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z M4 4a2 2 0 100 4 2 2 0 000-4z',
  council:      'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  forge:        'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
  settings:     'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  console:      'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18',
};

const CHAMBERS: ChamberDef[] = [
  // ── Core ────────────────────────────────────────────────────────────
  { id: 'atlas',          label: 'Atlas',          icon: 'atlas',        group: 'Core' },
  { id: 'pulse',          label: 'Pulse',          icon: 'pulse',        group: 'Core' },
  { id: 'journal',        label: 'Journal',        icon: 'journal',      group: 'Core' },

  // ── Strategy ────────────────────────────────────────────────────────
  { id: 'decisions',      label: 'Decisions',      icon: 'decisions',    group: 'Strategy' },
  { id: 'scenarios',      label: 'Scenarios',      icon: 'scenarios',    group: 'Strategy' },
  { id: 'crucible',       label: 'Crucible',       icon: 'crucible',     group: 'Strategy' },
  { id: 'forge',          label: 'Forge',          icon: 'forge',        group: 'Strategy' },

  // ── Identity ─────────────────────────────────────────────────────────
  { id: 'doctrine',       label: 'Doctrine',       icon: 'doctrine',     group: 'Identity' },
  { id: 'constitution',   label: 'Constitution',   icon: 'constitution', group: 'Identity' },
  { id: 'continuity',     label: 'Continuity',     icon: 'memory',       group: 'Identity' },
  { id: 'relationships',  label: 'Relationships',  icon: 'relationships',group: 'Identity' },

  // ── Intelligence ─────────────────────────────────────────────────────
  { id: 'signals',        label: 'Signals',        icon: 'signals',      group: 'Intelligence' },
  { id: 'canon',          label: 'Canon',          icon: 'canon',        group: 'Intelligence' },
  { id: 'council',        label: 'Council',        icon: 'council',      group: 'Intelligence' },
  { id: 'topology',       label: 'Topology',       icon: 'topology',     group: 'Intelligence' },
  { id: 'mastery',        label: 'Mastery',        icon: 'canon',        group: 'Intelligence' },

  // ── Adaptive ────────────────────────────────────────────────────────
  { id: 'core-systems',   label: 'Model Hub',      icon: 'atlas',        group: 'Adaptive' },
  { id: 'resonance',      label: 'Resonance',      icon: 'signals',      group: 'Adaptive' },
  { id: 'mirrorforge',    label: 'MirrorForge',    icon: 'forge',        group: 'Adaptive' },
  { id: 'reality-engine', label: 'Reality Engine',  icon: 'topology',     group: 'Adaptive' },
  { id: 'chrysalis',      label: 'Chrysalis',      icon: 'settings',     group: 'Adaptive' },

  // ── Memory ───────────────────────────────────────────────────────────
  { id: 'memory-vault',    label: 'Memory Vault',  icon: 'memory',       group: 'Memory' },

  // ── Meta ─────────────────────────────────────────────────────────────
  { id: 'directive-center', label: 'Directives',   icon: 'settings',     group: 'Meta' },
  { id: 'creator-console',  label: 'Console',      icon: 'console',      group: 'Meta', creatorOnly: true },
  { id: 'gap-ledger',       label: 'Gap Ledger',   icon: 'console',      group: 'Meta', creatorOnly: true },
  { id: 'audit-logs',       label: 'Audit Logs',   icon: 'console',      group: 'Meta', creatorOnly: true },
  { id: 'change-control',   label: 'Changes',      icon: 'console',      group: 'Meta', creatorOnly: true },
];

// ── SVG Icon ─────────────────────────────────────────────────────────────

function Icon({ path, size = 18 }: { path: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path.split('M').filter(Boolean).map((seg, i) => (
        <path key={i} d={`M${seg}`} />
      ))}
    </svg>
  );
}

// ── Mobile tab bar chambers (subset for bottom nav) ──────────────────────

const MOBILE_TAB_IDS: AppState['activeMode'][] = [
  'atlas', 'pulse', 'journal', 'decisions', 'doctrine',
];

// ── NavRail ───────────────────────────────────────────────────────────────

interface NavRailProps {
  expanded: boolean;
  onToggle: () => void;
  isMobile?: boolean;
  onSettingsClick?: () => void;
  onSignOutClick?: () => void;
}

export default function NavRail({ expanded, onToggle, isMobile, onSettingsClick, onSignOutClick }: NavRailProps) {
  const activeMode = useAtlasStore((s) => s.activeMode);
  const setActiveMode = useAtlasStore((s) => s.setActiveMode);
  const currentUser = useAtlasStore((s) => s.currentUser);
  const isCreator = currentUser?.role === 'sovereign_creator';

  const visibleChambers = CHAMBERS.filter((c) => !c.creatorOnly || isCreator);

  // ── Mobile bottom tab bar ────────────────────────────────────────────
  if (isMobile) {
    const mobileTabs = MOBILE_TAB_IDS
      .map((id) => CHAMBERS.find((c) => c.id === id))
      .filter((c): c is ChamberDef => !!c);

    return (
      <nav
        className="atlas-mobile-nav"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 56,
          background: 'var(--atlas-surface-rail)',
          borderTop: '1px solid var(--border-structural)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          zIndex: 50,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          flexShrink: 0,
        }}
      >
        {mobileTabs.map((chamber) => {
          const isActive = activeMode === chamber.id;
          return (
            <button
              key={chamber.id}
              onClick={() => setActiveMode(chamber.id)}
              title={chamber.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '6px 12px',
                color: isActive
                  ? 'rgba(201, 162, 39, 0.9)'
                  : 'rgba(226, 232, 240, 0.42)',
                transition: 'color 140ms ease',
                position: 'relative',
              }}
            >
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: '20%',
                    right: '20%',
                    height: 2,
                    background: 'rgba(201, 162, 39, 0.8)',
                    borderRadius: '0 0 2px 2px',
                  }}
                />
              )}
              <Icon path={ICONS[chamber.icon] ?? ICONS.atlas} size={20} />
              <span
                style={{
                  fontSize: '0.55rem',
                  fontWeight: isActive ? 600 : 400,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {chamber.label}
              </span>
            </button>
          );
        })}
      </nav>
    );
  }

  // ── Desktop side rail ────────────────────────────────────────────────

  // Group them
  const groups = Array.from(new Set(visibleChambers.map((c) => c.group)));

  const width = expanded ? 'var(--atlas-nav-expanded)' : 'var(--atlas-nav-collapsed)';

  return (
    <nav
      className="atlas-desktop-nav"
      style={{
        width,
        minWidth: width,
        height: '100dvh',
        background: 'var(--atlas-surface-rail)',
        borderRight: '1px solid var(--border-structural)',
        display: 'flex',
        flexDirection: 'column',
        transition: `width var(--atlas-motion-slow) var(--atlas-ease-out), min-width var(--atlas-motion-slow) var(--atlas-ease-out)`,
        overflow: 'hidden',
        flexShrink: 0,
        zIndex: 20,
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          padding: expanded ? '0 20px' : '0 0 0 22px',
          borderBottom: '1px solid var(--border-structural)',
          flexShrink: 0,
          gap: 12,
          cursor: 'pointer',
          transition: 'padding var(--atlas-motion-slow) var(--atlas-ease-out)',
        }}
        onClick={onToggle}
        title={expanded ? 'Collapse navigation' : 'Expand navigation'}
      >
        {/* Atlas sigil */}
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: '1.5px solid rgba(201, 162, 39, 0.5)',
            background: 'radial-gradient(circle, rgba(88,28,135,0.4) 0%, transparent 70%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: 'rgba(201, 162, 39, 0.9)',
          }}
        >
          <Icon path={ICONS.atlas} size={14} />
        </div>
        {expanded && (
          <span
            style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              letterSpacing: '0.12em',
              color: 'rgba(226, 232, 240, 0.7)',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              opacity: expanded ? 1 : 0,
              transition: 'opacity var(--atlas-motion-standard) var(--atlas-ease-out)',
            }}
          >
            Obsidian Atlas
          </span>
        )}
      </div>

      {/* Chamber list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '8px 0',
        }}
      >
        {groups.map((group, gi) => {
          const groupChambers = visibleChambers.filter((c) => c.group === group);
          return (
            <div key={group} style={{ marginBottom: 4 }}>
              {expanded && (
                <div
                  style={{
                    padding: gi === 0 ? '12px 16px 4px' : '16px 16px 4px',
                    fontSize: '0.625rem',
                    fontWeight: 600,
                    letterSpacing: '0.12em',
                    color: 'rgba(226,232,240,0.3)',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {group}
                </div>
              )}
              {!expanded && gi > 0 && (
                <div
                  style={{
                    margin: '8px auto',
                    width: 24,
                    height: 1,
                    background: 'var(--border-structural)',
                  }}
                />
              )}
              {groupChambers.map((chamber) => {
                const isActive = activeMode === chamber.id;
                return (
                  <button
                    key={chamber.id}
                    onClick={() => setActiveMode(chamber.id)}
                    title={chamber.label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      padding: expanded ? '9px 16px' : '10px 0',
                      justifyContent: expanded ? 'flex-start' : 'center',
                      background: isActive
                        ? 'rgba(88, 28, 135, 0.18)'
                        : 'transparent',
                      border: 'none',
                      borderRadius: 'none',
                      cursor: 'pointer',
                      color: isActive
                        ? 'rgba(226, 232, 240, 0.95)'
                        : 'rgba(226, 232, 240, 0.42)',
                      fontSize: '0.8125rem',
                      fontWeight: isActive ? 500 : 400,
                      letterSpacing: '0.01em',
                      transition: `all var(--atlas-motion-fast) var(--atlas-ease-out)`,
                      position: 'relative',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(88, 28, 135, 0.09)';
                        (e.currentTarget as HTMLButtonElement).style.color = 'rgba(226, 232, 240, 0.72)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                        (e.currentTarget as HTMLButtonElement).style.color = 'rgba(226, 232, 240, 0.42)';
                      }
                    }}
                  >
                    {/* Active indicator */}
                    {isActive && (
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: '20%',
                          bottom: '20%',
                          width: 2,
                          background: 'rgba(201, 162, 39, 0.8)',
                          borderRadius: '0 2px 2px 0',
                        }}
                      />
                    )}

                    <span style={{ flexShrink: 0, lineHeight: 0 }}>
                      <Icon path={ICONS[chamber.icon] ?? ICONS.atlas} size={17} />
                    </span>

                    {expanded && (
                      <span
                        style={{
                          opacity: expanded ? 1 : 0,
                          transform: expanded ? 'translateX(0)' : 'translateX(-4px)',
                          transition: `opacity var(--atlas-motion-standard) var(--atlas-ease-out), transform var(--atlas-motion-standard) var(--atlas-ease-out)`,
                        }}
                      >
                        {chamber.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Model Selector */}
      <div
        style={{
          borderTop: '1px solid var(--border-structural)',
          padding: expanded ? '8px 12px' : '8px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: expanded ? 'flex-start' : 'center',
          flexShrink: 0,
        }}
      >
        <ModelSelector onUpgradeClick={() => {}} compact={!expanded} />
      </div>

      {/* Bottom user area */}
      <div
        style={{
          borderTop: '1px solid var(--border-structural)',
          padding: expanded ? '10px 16px' : '10px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          flexShrink: 0,
        }}
      >
        {/* User info row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: expanded ? 'flex-start' : 'center',
            gap: 10,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'rgba(88, 28, 135, 0.35)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: '0.65rem',
              fontWeight: 600,
              color: 'rgba(167, 139, 250, 0.8)',
              letterSpacing: '0.05em',
            }}
          >
            {currentUser?.email?.[0]?.toUpperCase() ?? 'A'}
          </div>
          {expanded && (
            <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'rgba(226,232,240,0.7)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 160,
                }}
              >
                {currentUser?.email ?? ''}
              </div>
              <div
                style={{
                  fontSize: '0.625rem',
                  color: 'rgba(201, 162, 39, 0.7)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {currentUser?.role?.replace(/_/g, ' ') ?? ''}
              </div>
            </div>
          )}
        </div>

        {/* Settings + Sign Out buttons */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: expanded ? 'flex-start' : 'center',
            gap: 4,
          }}
        >
          <button
            onClick={onSettingsClick}
            title="Settings"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: expanded ? '5px 8px' : '5px',
              background: 'transparent',
              border: '1px solid rgba(88,28,135,0.2)',
              borderRadius: 4,
              cursor: 'pointer',
              color: 'rgba(226,232,240,0.5)',
              fontSize: '0.65rem',
              fontFamily: 'inherit',
              letterSpacing: '0.04em',
              transition: 'all 140ms ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(226,232,240,0.85)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(88,28,135,0.4)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(226,232,240,0.5)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(88,28,135,0.2)';
            }}
          >
            <Icon path={ICONS.settings} size={14} />
            {expanded && <span>Settings</span>}
          </button>

          <button
            onClick={onSignOutClick}
            title="Sign Out"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: expanded ? '5px 8px' : '5px',
              background: 'transparent',
              border: '1px solid rgba(220,38,38,0.15)',
              borderRadius: 4,
              cursor: 'pointer',
              color: 'rgba(248,113,113,0.5)',
              fontSize: '0.65rem',
              fontFamily: 'inherit',
              letterSpacing: '0.04em',
              transition: 'all 140ms ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(248,113,113,0.9)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(220,38,38,0.35)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(248,113,113,0.5)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(220,38,38,0.15)';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {expanded && <span>Sign Out</span>}
          </button>
        </div>
      </div>
    </nav>
  );
}
