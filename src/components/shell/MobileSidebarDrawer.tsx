/**
 * Mobile Sidebar Drawer — left-side accordion sheet opened by the "Menu" item
 * in the bottom nav (or the top-bar hamburger).
 *
 * Structure:
 *   - Primary group (Home, Atlas, Journal) — mirrors the bottom nav so every
 *     destination is reachable from the drawer as well.
 *   - Pinned section (always expanded when non-empty, empty state otherwise)
 *   - Accordion: Strategy, Identity, Intelligence, Evolution, Memory, Control
 *     Center — only one expanded at a time.
 *   - Labs inside Strategy: inline nested expand area (not a second accordion).
 *   - Selecting a destination closes the drawer.
 *   - Re-opening the drawer preserves the last-open section for that session.
 *
 * Search and Menu from the bottom nav are overlays, not destinations, so they
 * are intentionally NOT listed in the drawer (⌘K opens the palette; the drawer
 * itself is what "Menu" opens).
 *
 * Accessibility:
 *   - role="dialog", aria-modal, aria-labelledby on the drawer panel
 *   - Escape closes; focus is returned to the trigger
 *   - Body scroll is locked while open
 *   - Tap backdrop to close
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { useAtlasStore } from '../../store/useAtlasStore';
import { useNavStore, PIN_VISIBLE_MOBILE } from '../../store/useNavStore';
import { ModelSelector } from '../ModelSelector';
import {
  SECTIONS,
  PRIMARY_CHAMBERS,
  ICONS,
  Icon,
  getChamber,
  getDirectSectionChildren,
  getSubgroupsInSection,
  getChambersInSubgroup,
} from './chamberCatalog';
import type { ChamberDef, ChamberId, SectionId } from './chamberCatalog';

// ── Props ─────────────────────────────────────────────────────────────────

interface MobileSidebarDrawerProps {
  open: boolean;
  onClose: () => void;
  onSettingsClick?: () => void;
  onSignOutClick?: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

// ── Hamburger icon (exported for the top bar) ─────────────────────────────

export function HamburgerIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="4" y1="7"  x2="20" y2="7"  />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export default function MobileSidebarDrawer({
  open,
  onClose,
  onSettingsClick,
  onSignOutClick,
  returnFocusRef,
}: MobileSidebarDrawerProps) {
  const activeMode = useAtlasStore((s) => s.activeMode);
  const setActiveMode = useAtlasStore((s) => s.setActiveMode);
  const currentUser = useAtlasStore((s) => s.currentUser);
  const isCreator = currentUser?.role === 'sovereign_creator';

  const pinnedIds = useNavStore((s) => s.pinnedChambers);
  const togglePinChamber = useNavStore((s) => s.togglePinChamber);
  const openSection = useNavStore((s) => s.openDrawerSection);
  const setOpenSection = useNavStore((s) => s.setOpenDrawerSection);
  const labsExpanded = useNavStore((s) => s.labsExpanded);
  const setLabsExpanded = useNavStore((s) => s.setLabsExpanded);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const firstFocusableRef = useRef<HTMLButtonElement | null>(null);

  // Escape closes
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Focus management
  useEffect(() => {
    if (open) {
      firstFocusableRef.current?.focus();
    } else {
      const el = returnFocusRef?.current;
      if (el) requestAnimationFrame(() => el.focus());
    }
  }, [open, returnFocusRef]);

  const handleSelect = useCallback(
    (id: ChamberId) => {
      setActiveMode(id);
      onClose();
    },
    [setActiveMode, onClose],
  );

  const toggleSection = useCallback(
    (id: SectionId) => {
      setOpenSection(openSection === id ? null : id);
    },
    [openSection, setOpenSection],
  );

  const pinnedChambers = pinnedIds
    .slice(0, PIN_VISIBLE_MOBILE)
    .map((id) => getChamber(id))
    .filter((c): c is ChamberDef => !!c && (!c.creatorOnly || isCreator));

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(2, 2, 8, 0.58)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 180ms ease-out',
          zIndex: 90,
        }}
      />

      {/* Drawer panel */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="atlas-mobile-drawer-title"
        aria-hidden={!open}
        style={{
          position: 'fixed',
          top: 0,
          bottom: 0,
          left: 0,
          width: 'min(84vw, 360px)',
          maxWidth: '100%',
          background: 'var(--atlas-surface-rail)',
          borderRight: '1px solid var(--border-structural)',
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
          zIndex: 100,
          boxShadow: open ? '0 0 30px rgba(0,0,0,0.5)' : 'none',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Header */}
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            borderBottom: '1px solid var(--border-structural)',
            flexShrink: 0,
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img
              src="/brand/atlas-logo.png"
              alt="Obsidian Atlas"
              width={32}
              height={32}
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                flexShrink: 0,
                objectFit: 'cover',
                display: 'block',
              }}
            />
            <span
              id="atlas-mobile-drawer-title"
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                letterSpacing: '0.12em',
                color: 'rgba(226, 232, 240, 0.7)',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              Navigation
            </span>
          </div>

          <button
            ref={firstFocusableRef}
            onClick={onClose}
            aria-label="Close navigation"
            style={closeBtnStyle}
          >
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"
              strokeLinejoin="round" aria-hidden="true"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '12px 0 8px',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {/* Primary (mirrors bottom nav destinations) */}
          <div style={{ padding: '0 4px 4px' }}>
            <div
              style={{
                padding: '4px 12px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: '0.625rem',
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  color: 'rgba(226,232,240,0.35)',
                  textTransform: 'uppercase',
                }}
              >
                Primary
              </span>
            </div>
            {PRIMARY_CHAMBERS.map((chamber) => (
              <DrawerItem
                key={`primary-${chamber.id}`}
                chamber={chamber}
                activeMode={activeMode}
                onSelect={handleSelect}
                onTogglePin={togglePinChamber}
                pinned={pinnedIds.includes(chamber.id)}
              />
            ))}
          </div>

          {/* Divider */}
          <div
            aria-hidden="true"
            style={{
              height: 1,
              margin: '8px 16px',
              background: 'var(--border-structural)',
              opacity: 0.6,
            }}
          />

          {/* Pinned */}
          <div style={{ padding: '0 4px 8px' }}>
            <div
              style={{
                padding: '4px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span
                style={{
                  fontSize: '0.625rem',
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  color: 'rgba(226,232,240,0.35)',
                  textTransform: 'uppercase',
                }}
              >
                Pinned
              </span>
              <span
                style={{
                  fontSize: '0.625rem',
                  color: 'rgba(226,232,240,0.3)',
                  letterSpacing: '0.05em',
                }}
              >
                {pinnedChambers.length}/{PIN_VISIBLE_MOBILE}
              </span>
            </div>
            {pinnedChambers.length === 0 ? (
              <div
                style={{
                  margin: '4px 12px',
                  padding: '14px 12px',
                  borderRadius: 6,
                  border: '1px dashed rgba(88,28,135,0.25)',
                  color: 'rgba(226,232,240,0.42)',
                  fontSize: '0.75rem',
                  lineHeight: 1.5,
                }}
              >
                Pin chambers for faster access. Long-press or use the pin icon on any chamber.
              </div>
            ) : (
              pinnedChambers.map((chamber) => (
                <DrawerItem
                  key={`pin-${chamber.id}`}
                  chamber={chamber}
                  activeMode={activeMode}
                  onSelect={handleSelect}
                  onTogglePin={togglePinChamber}
                  pinned
                />
              ))
            )}
          </div>

          {/* Sections accordion */}
          {SECTIONS.map((section) => {
            const direct = getDirectSectionChildren(section.id).filter(
              (c) => !c.creatorOnly || isCreator,
            );
            const subgroups = getSubgroupsInSection(section.id);
            const hasSubChildren = subgroups.some((g) =>
              getChambersInSubgroup(section.id, g.id).some(
                (c) => !c.creatorOnly || isCreator,
              ),
            );
            if (direct.length === 0 && !hasSubChildren) return null;

            const expanded = openSection === section.id;

            return (
              <div key={section.id} style={{ padding: '0 4px', marginBottom: 2 }}>
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  aria-expanded={expanded}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 12px',
                    background: expanded ? 'rgba(88,28,135,0.1)' : 'transparent',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    color: expanded ? 'rgba(226,232,240,0.95)' : 'rgba(226,232,240,0.72)',
                    fontSize: '0.875rem',
                    fontWeight: expanded ? 500 : 400,
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    letterSpacing: '0.01em',
                    minHeight: 48,
                    transition: 'background 160ms ease, color 160ms ease',
                  }}
                >
                  <span style={{ flexShrink: 0, lineHeight: 0, color: expanded ? 'rgba(201,162,39,0.9)' : 'inherit' }}>
                    <Icon path={ICONS[section.icon] ?? ICONS.atlas} size={18} />
                  </span>
                  <span style={{ flex: 1 }}>{section.label}</span>
                  <Chevron rotated={expanded} />
                </button>

                {expanded && (
                  <div
                    style={{
                      paddingBottom: 8,
                      animation: 'atlas-accordion-in 180ms ease-out',
                    }}
                  >
                    {direct.map((chamber) => (
                      <DrawerItem
                        key={chamber.id}
                        chamber={chamber}
                        activeMode={activeMode}
                        onSelect={handleSelect}
                        onTogglePin={togglePinChamber}
                        pinned={pinnedIds.includes(chamber.id)}
                        indent
                      />
                    ))}
                    {subgroups.map((sub) => {
                      const subChildren = getChambersInSubgroup(section.id, sub.id).filter(
                        (c) => !c.creatorOnly || isCreator,
                      );
                      if (subChildren.length === 0) return null;
                      const isLabsOpen = sub.id === 'labs' ? labsExpanded : true;
                      return (
                        <div key={sub.id}>
                          <button
                            type="button"
                            onClick={() => {
                              if (sub.id === 'labs') setLabsExpanded(!labsExpanded);
                            }}
                            aria-expanded={isLabsOpen}
                            style={{
                              width: 'calc(100% - 8px)',
                              margin: '2px 4px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              padding: '10px 12px 10px 32px',
                              background: 'transparent',
                              border: 'none',
                              borderRadius: 6,
                              cursor: 'pointer',
                              color: 'rgba(226,232,240,0.65)',
                              fontSize: '0.8125rem',
                              fontFamily: 'inherit',
                              textAlign: 'left',
                              minHeight: 44,
                            }}
                          >
                            <span style={{ flexShrink: 0, lineHeight: 0 }}>
                              <Icon path={ICONS[sub.icon] ?? ICONS.atlas} size={16} />
                            </span>
                            <span style={{ flex: 1 }}>{sub.label}</span>
                            <Chevron rotated={isLabsOpen} size={10} />
                          </button>
                          {isLabsOpen &&
                            subChildren.map((chamber) => (
                              <DrawerItem
                                key={chamber.id}
                                chamber={chamber}
                                activeMode={activeMode}
                                onSelect={handleSelect}
                                onTogglePin={togglePinChamber}
                                pinned={pinnedIds.includes(chamber.id)}
                                indent
                                deeper
                              />
                            ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Model selector */}
        <div
          style={{
            borderTop: '1px solid var(--border-structural)',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            flexShrink: 0,
          }}
        >
          <ModelSelector onUpgradeClick={() => {}} compact={false} />
        </div>

        {/* User area */}
        <div
          style={{
            borderTop: '1px solid var(--border-structural)',
            padding: '10px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
            <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'rgba(226,232,240,0.7)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
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
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => {
                onSettingsClick?.();
                onClose();
              }}
              style={footerBtnStyle(false)}
            >
              <Icon path={ICONS.settings} size={14} />
              <span>Settings</span>
            </button>

            <button
              onClick={() => {
                onSignOutClick?.();
                onClose();
              }}
              style={footerBtnStyle(true)}
            >
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                strokeLinejoin="round" aria-hidden="true"
              >
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

// ── Internals ─────────────────────────────────────────────────────────────

interface DrawerItemProps {
  chamber: ChamberDef;
  activeMode: ChamberId;
  onSelect: (id: ChamberId) => void;
  onTogglePin: (id: ChamberId) => void;
  pinned: boolean;
  indent?: boolean;
  deeper?: boolean;
}

function DrawerItem({ chamber, activeMode, onSelect, onTogglePin, pinned, indent, deeper }: DrawerItemProps) {
  const isActive = activeMode === chamber.id;
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
      <button
        onClick={() => onSelect(chamber.id)}
        aria-current={isActive ? 'page' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flex: 1,
          margin: '1px 4px',
          padding: `11px 36px 11px ${deeper ? 56 : indent ? 44 : 16}px`,
          justifyContent: 'flex-start',
          background: isActive ? 'rgba(88, 28, 135, 0.18)' : 'transparent',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          color: isActive
            ? 'rgba(226, 232, 240, 0.95)'
            : 'rgba(226, 232, 240, 0.65)',
          fontSize: '0.8125rem',
          fontWeight: isActive ? 500 : 400,
          letterSpacing: '0.01em',
          transition: 'background 160ms ease, color 160ms ease',
          position: 'relative',
          whiteSpace: 'nowrap',
          textAlign: 'left',
          fontFamily: 'inherit',
          minHeight: 44,
        }}
      >
        {isActive && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              top: '22%',
              bottom: '22%',
              width: 2,
              background: 'rgba(201, 162, 39, 0.85)',
              borderRadius: '0 2px 2px 0',
            }}
          />
        )}
        <span style={{ flexShrink: 0, lineHeight: 0 }}>
          <Icon path={ICONS[chamber.icon] ?? ICONS.atlas} size={16} />
        </span>
        <span>{chamber.label}</span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(chamber.id);
        }}
        aria-label={pinned ? `Unpin ${chamber.label}` : `Pin ${chamber.label}`}
        style={{
          position: 'absolute',
          right: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: pinned ? 'rgba(201, 162, 39, 0.9)' : 'rgba(226, 232, 240, 0.28)',
          padding: 6,
          borderRadius: 3,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Icon path={ICONS.pin} size={13} />
      </button>
    </div>
  );
}

function Chevron({ rotated, size = 12 }: { rotated: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
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
        opacity: 0.55,
        flexShrink: 0,
      }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(88,28,135,0.25)',
  borderRadius: 4,
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'rgba(226,232,240,0.7)',
  cursor: 'pointer',
  padding: 0,
};

function footerBtnStyle(danger: boolean): React.CSSProperties {
  return {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '8px 10px',
    background: 'transparent',
    border: `1px solid ${danger ? 'rgba(220,38,38,0.2)' : 'rgba(88,28,135,0.25)'}`,
    borderRadius: 4,
    cursor: 'pointer',
    color: danger ? 'rgba(248,113,113,0.75)' : 'rgba(226,232,240,0.75)',
    fontSize: '0.75rem',
    fontFamily: 'inherit',
    letterSpacing: '0.04em',
    minHeight: 38,
  };
}
