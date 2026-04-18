import React from 'react';
import { useAtlasStore } from '../../store/useAtlasStore';
import { ModelSelector } from '../ModelSelector';
import { CHAMBERS, ICONS, MOBILE_TAB_IDS, Icon } from './chamberCatalog';
import type { ChamberDef } from './chamberCatalog';

// Chamber registry + icon dictionary live in `./chamberCatalog` so both this
// rail and the mobile sidebar drawer render the exact same chamber list.

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
