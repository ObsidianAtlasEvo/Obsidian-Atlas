/**
 * NavRail — desktop left rail + mobile bottom tab bar.
 *
 * Desktop rail structure (Refine.txt §5–§8):
 *   - Header / collapse
 *   - Universal Search trigger (⌘K) — keeps the search surface persistent
 *   - Primary: Home, Atlas, Journal
 *   - Pinned (user favorites, if any)
 *   - Sections: Strategy, Identity, Intelligence, Evolution, Memory, Control
 *     Center. Each is collapsible. Labs nests inside Strategy.
 *   - Model selector
 *   - User area + Settings + Sign Out
 *
 * Mobile bottom tab bar: Home, Atlas, Journal, Search, Menu — always visible,
 * labels always visible, gold accent active state.
 *
 * Chamber metadata lives in `./chamberCatalog`.
 */

import React, { useState } from 'react';
import { useAtlasStore } from '../../store/useAtlasStore';
import { useNavStore } from '../../store/useNavStore';
import { ModelSelector } from '../ModelSelector';
import {
  PRIMARY_CHAMBERS,
  SECTIONS,
  BOTTOM_NAV,
  ICONS,
  Icon,
  getChamber,
  getDirectSectionChildren,
  getSubgroupsInSection,
  getChambersInSubgroup,
} from './chamberCatalog';
import type { ChamberDef, ChamberId, SectionId, BottomNavId } from './chamberCatalog';

// ── Props ─────────────────────────────────────────────────────────────────

interface NavRailProps {
  expanded: boolean;
  onToggle: () => void;
  isMobile?: boolean;
  onSettingsClick?: () => void;
  onSignOutClick?: () => void;
  /** Open the mobile drawer. Supplied only in mobile mode. */
  onOpenDrawer?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function NavRail({
  expanded,
  onToggle,
  isMobile,
  onSettingsClick,
  onSignOutClick,
  onOpenDrawer,
}: NavRailProps) {
  const activeMode = useAtlasStore((s) => s.activeMode);
  const setActiveMode = useAtlasStore((s) => s.setActiveMode);
  const currentUser = useAtlasStore((s) => s.currentUser);
  const isCreator = currentUser?.role === 'sovereign_creator';

  const pinnedIds = useNavStore((s) => s.pinnedChambers);
  const commandPaletteOpen = useNavStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useNavStore((s) => s.setCommandPaletteOpen);
  const togglePinChamber = useNavStore((s) => s.togglePinChamber);
  const labsExpanded = useNavStore((s) => s.labsExpanded);
  const setLabsExpanded = useNavStore((s) => s.setLabsExpanded);

  // ── Mobile bottom tab bar ────────────────────────────────────────────
  if (isMobile) {
    const activeBottomId: BottomNavId =
      activeMode === 'today-in-atlas' ? 'home'
      : activeMode === 'atlas'        ? 'atlas'
      : activeMode === 'journal'      ? 'journal'
      : 'home'; // default highlight Home when no match

    return (
      <nav
        className="atlas-mobile-nav"
        role="navigation"
        aria-label="Primary"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 64,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          background: 'var(--atlas-surface-rail)',
          borderTop: '1px solid var(--border-structural)',
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'space-around',
          zIndex: 50,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          flexShrink: 0,
        }}
      >
        {BOTTOM_NAV.map((item) => {
          const isActive =
            (item.id === 'search' && commandPaletteOpen) ||
            (item.mode !== undefined && activeBottomId === item.id);

          const handleClick = () => {
            if (item.id === 'search') {
              setCommandPaletteOpen(true);
            } else if (item.id === 'menu') {
              onOpenDrawer?.();
            } else if (item.mode) {
              setActiveMode(item.mode);
            }
          };

          return (
            <button
              key={item.id}
              onClick={handleClick}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '8px 6px',
                color: isActive
                  ? 'rgba(201, 162, 39, 0.95)'
                  : 'rgba(226, 232, 240, 0.5)',
                transition: 'color 160ms ease',
                position: 'relative',
                minHeight: 44,
                fontFamily: 'inherit',
              }}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: '22%',
                    right: '22%',
                    height: 2,
                    background: 'rgba(201, 162, 39, 0.85)',
                    borderRadius: '0 0 2px 2px',
                  }}
                />
              )}
              <Icon path={ICONS[item.icon] ?? ICONS.atlas} size={20} />
              <span
                style={{
                  fontSize: '0.625rem',
                  fontWeight: isActive ? 600 : 500,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    );
  }

  // ── Desktop side rail ────────────────────────────────────────────────

  const width = expanded ? 'var(--atlas-nav-expanded)' : 'var(--atlas-nav-collapsed)';
  const pinnedChambers = pinnedIds
    .map((id) => getChamber(id))
    .filter((c): c is ChamberDef => !!c && (!c.creatorOnly || isCreator));

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
            }}
          >
            Obsidian Atlas
          </span>
        )}
      </div>

      {/* Search trigger */}
      <div style={{ padding: expanded ? '12px 12px 4px' : '12px 0 4px' }}>
        <button
          onClick={() => setCommandPaletteOpen(true)}
          title="Search Atlas (⌘K)"
          aria-label="Open search"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: expanded ? 'space-between' : 'center',
            gap: 8,
            padding: expanded ? '8px 12px' : '8px 0',
            background: 'rgba(26, 16, 60, 0.4)',
            border: '1px solid rgba(88,28,135,0.18)',
            borderRadius: 4,
            cursor: 'pointer',
            color: 'rgba(226, 232, 240, 0.55)',
            fontFamily: 'inherit',
            fontSize: '0.6875rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            transition: 'all 160ms ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,162,39,0.3)';
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(226,232,240,0.85)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(88,28,135,0.18)';
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(226,232,240,0.55)';
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon path={ICONS.search} size={14} />
            {expanded && <span>Search</span>}
          </span>
          {expanded && (
            <span
              style={{
                display: 'flex',
                gap: 2,
                fontSize: '0.625rem',
                opacity: 0.6,
              }}
            >
              <kbd style={kbdStyle}>⌘</kbd>
              <kbd style={kbdStyle}>K</kbd>
            </span>
          )}
        </button>
      </div>

      {/* Chamber list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '4px 0 8px',
        }}
      >
        {/* Primary surfaces */}
        <div style={{ marginBottom: 8 }}>
          {expanded && <GroupLabel>Primary</GroupLabel>}
          {PRIMARY_CHAMBERS.map((chamber) => (
            <NavItem
              key={chamber.id}
              chamber={chamber}
              activeMode={activeMode}
              expanded={expanded}
              onSelect={setActiveMode}
              onTogglePin={togglePinChamber}
              pinned={pinnedIds.includes(chamber.id)}
            />
          ))}
        </div>

        {/* Pinned */}
        {pinnedChambers.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {expanded && <GroupLabel>Pinned</GroupLabel>}
            {pinnedChambers.map((chamber) => (
              <NavItem
                key={`pin-${chamber.id}`}
                chamber={chamber}
                activeMode={activeMode}
                expanded={expanded}
                onSelect={setActiveMode}
                onTogglePin={togglePinChamber}
                pinned
              />
            ))}
          </div>
        )}

        {/* Sections */}
        {SECTIONS.map((section) => {
          // Hide Control Center entirely if user has no visible children
          const directChildren = getDirectSectionChildren(section.id).filter(
            (c) => !c.creatorOnly || isCreator,
          );
          const subgroups = getSubgroupsInSection(section.id);
          const hasSubgroupChildren = subgroups.some((g) =>
            getChambersInSubgroup(section.id, g.id).some(
              (c) => !c.creatorOnly || isCreator,
            ),
          );
          if (directChildren.length === 0 && !hasSubgroupChildren) return null;

          return (
            <div key={section.id} style={{ marginBottom: 8 }}>
              {expanded && <GroupLabel>{section.label}</GroupLabel>}
              {!expanded && <GroupDivider />}
              {directChildren.map((chamber) => (
                <NavItem
                  key={chamber.id}
                  chamber={chamber}
                  activeMode={activeMode}
                  expanded={expanded}
                  onSelect={setActiveMode}
                  onTogglePin={togglePinChamber}
                  pinned={pinnedIds.includes(chamber.id)}
                />
              ))}
              {subgroups.map((sub) => {
                const subChildren = getChambersInSubgroup(section.id, sub.id).filter(
                  (c) => !c.creatorOnly || isCreator,
                );
                if (subChildren.length === 0) return null;
                const expandedSub = !expanded ? true : (sub.id === 'labs' ? labsExpanded : true);
                return (
                  <div key={sub.id}>
                    {expanded && (
                      <button
                        type="button"
                        onClick={() => {
                          if (sub.id === 'labs') setLabsExpanded(!labsExpanded);
                        }}
                        aria-expanded={expandedSub}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          width: '100%',
                          padding: '8px 16px',
                          background: 'transparent',
                          border: 'none',
                          color: 'rgba(226, 232, 240, 0.55)',
                          cursor: 'pointer',
                          fontSize: '0.8125rem',
                          fontFamily: 'inherit',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ flexShrink: 0, lineHeight: 0 }}>
                          <Icon path={ICONS[sub.icon] ?? ICONS.atlas} size={16} />
                        </span>
                        <span style={{ flex: 1 }}>{sub.label}</span>
                        <Chevron rotated={expandedSub} />
                      </button>
                    )}
                    {expandedSub &&
                      subChildren.map((chamber) => (
                        <NavItem
                          key={chamber.id}
                          chamber={chamber}
                          activeMode={activeMode}
                          expanded={expanded}
                          onSelect={setActiveMode}
                          onTogglePin={togglePinChamber}
                          pinned={pinnedIds.includes(chamber.id)}
                          indent
                        />
                      ))}
                  </div>
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
            style={footerButtonStyle(expanded, false)}
          >
            <Icon path={ICONS.settings} size={14} />
            {expanded && <span>Settings</span>}
          </button>

          <button
            onClick={onSignOutClick}
            title="Sign Out"
            style={footerButtonStyle(expanded, true)}
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

// ── Internals ─────────────────────────────────────────────────────────────

interface NavItemProps {
  chamber: ChamberDef;
  activeMode: ChamberId;
  expanded: boolean;
  onSelect: (mode: ChamberId) => void;
  onTogglePin: (mode: ChamberId) => void;
  pinned: boolean;
  indent?: boolean;
}

function NavItem({ chamber, activeMode, expanded, onSelect, onTogglePin, pinned, indent }: NavItemProps) {
  const isActive = activeMode === chamber.id;
  const [hover, setHover] = useState(false);

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'stretch',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        onClick={() => onSelect(chamber.id)}
        title={chamber.label}
        aria-current={isActive ? 'page' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flex: 1,
          padding: expanded ? `9px 16px 9px ${indent ? 32 : 16}px` : '10px 0',
          justifyContent: expanded ? 'flex-start' : 'center',
          background: isActive ? 'rgba(88, 28, 135, 0.18)' : hover ? 'rgba(88,28,135,0.09)' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: isActive
            ? 'rgba(226, 232, 240, 0.95)'
            : hover ? 'rgba(226,232,240,0.78)' : 'rgba(226, 232, 240, 0.5)',
          fontSize: '0.8125rem',
          fontWeight: isActive ? 500 : 400,
          letterSpacing: '0.01em',
          transition: 'background 160ms ease, color 160ms ease',
          position: 'relative',
          whiteSpace: 'nowrap',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        {isActive && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              top: '20%',
              bottom: '20%',
              width: 2,
              background: 'rgba(201, 162, 39, 0.85)',
              borderRadius: '0 2px 2px 0',
            }}
          />
        )}
        <span style={{ flexShrink: 0, lineHeight: 0 }}>
          <Icon path={ICONS[chamber.icon] ?? ICONS.atlas} size={17} />
        </span>
        {expanded && <span>{chamber.label}</span>}
      </button>

      {expanded && hover && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(chamber.id);
          }}
          aria-label={pinned ? `Unpin ${chamber.label}` : `Pin ${chamber.label}`}
          title={pinned ? 'Unpin' : 'Pin to favorites'}
          style={{
            position: 'absolute',
            right: 6,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: pinned ? 'rgba(201, 162, 39, 0.85)' : 'rgba(226, 232, 240, 0.4)',
            padding: 4,
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Icon path={ICONS.pin} size={13} />
        </button>
      )}
      {expanded && pinned && !hover && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'rgba(201, 162, 39, 0.7)',
            lineHeight: 0,
          }}
        >
          <Icon path={ICONS.pin} size={11} />
        </span>
      )}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '12px 16px 4px',
        fontSize: '0.625rem',
        fontWeight: 600,
        letterSpacing: '0.12em',
        color: 'rgba(226,232,240,0.3)',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  );
}

function GroupDivider() {
  return (
    <div
      style={{
        margin: '8px auto',
        width: 24,
        height: 1,
        background: 'var(--border-structural)',
      }}
    />
  );
}

function Chevron({ rotated }: { rotated: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{
        transform: rotated ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 180ms ease',
        opacity: 0.6,
      }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

const kbdStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.625rem',
  padding: '1px 4px',
  border: '1px solid rgba(88,28,135,0.3)',
  borderRadius: 3,
  background: 'rgba(26,16,60,0.4)',
};

function footerButtonStyle(expanded: boolean, danger: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: expanded ? '5px 8px' : '5px',
    background: 'transparent',
    border: `1px solid ${danger ? 'rgba(220,38,38,0.15)' : 'rgba(88,28,135,0.2)'}`,
    borderRadius: 4,
    cursor: 'pointer',
    color: danger ? 'rgba(248,113,113,0.5)' : 'rgba(226,232,240,0.5)',
    fontSize: '0.65rem',
    fontFamily: 'inherit',
    letterSpacing: '0.04em',
    transition: 'all 140ms ease',
  };
}
