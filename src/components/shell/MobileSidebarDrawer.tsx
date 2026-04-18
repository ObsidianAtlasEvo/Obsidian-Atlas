/**
 * Mobile Sidebar Drawer
 *
 * Opens from the left via a hamburger button in the mobile top bar and renders
 * the full desktop NavRail chamber list (grouped, with creator-only sections
 * when applicable) so mobile users have parity with desktop navigation.
 *
 * Desktop keeps the permanent left NavRail; the bottom tab bar keeps its
 * five-item shortcut for primary chambers. The drawer is additive: it gives
 * mobile users the full surface without forcing them to stop using the bottom
 * nav.
 *
 * Accessibility:
 *   - role="dialog", aria-modal, aria-labelledby on the drawer panel
 *   - Escape key closes
 *   - Focus is returned to the trigger (hamburger) on close
 *   - Body scroll is locked while the drawer is open
 *   - Tapping the backdrop closes
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { useAtlasStore } from '../../store/useAtlasStore';
import { ModelSelector } from '../ModelSelector';
import { CHAMBERS, ICONS, Icon } from './chamberCatalog';
import type { ChamberDef } from './chamberCatalog';

// ── Props ─────────────────────────────────────────────────────────────────

interface MobileSidebarDrawerProps {
  open: boolean;
  onClose: () => void;
  onSettingsClick?: () => void;
  onSignOutClick?: () => void;
  /**
   * Ref to the element that triggered open (the hamburger button). When the
   * drawer closes it refocuses this element so keyboard/screen-reader users
   * don't lose their place.
   */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

// ── Hamburger icon (exported so AppShell can render it without re-importing) ─

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

  const visibleChambers = CHAMBERS.filter((c) => !c.creatorOnly || isCreator);
  const groups = Array.from(new Set(visibleChambers.map((c) => c.group)));

  const panelRef = useRef<HTMLDivElement | null>(null);
  const firstFocusableRef = useRef<HTMLButtonElement | null>(null);

  // Escape to close
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

  // Lock body scroll while open so the page underneath doesn't rubber-band
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Move focus into the drawer on open; return focus to the trigger on close
  useEffect(() => {
    if (open) {
      firstFocusableRef.current?.focus();
    } else {
      // Defer so React commits the "drawer removed" state before we refocus
      const el = returnFocusRef?.current;
      if (el) {
        requestAnimationFrame(() => el.focus());
      }
    }
  }, [open, returnFocusRef]);

  const handleSelect = useCallback(
    (chamber: ChamberDef) => {
      setActiveMode(chamber.id);
      onClose();
    },
    [setActiveMode, onClose],
  );

  return (
    <>
      {/* Backdrop — always rendered so we can animate opacity */}
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
          transition: 'opacity var(--atlas-motion-standard) var(--atlas-ease-out)',
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
          width: 'min(84vw, 320px)',
          maxWidth: '100%',
          background: 'var(--atlas-surface-rail)',
          borderRight: '1px solid var(--border-structural)',
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: `transform var(--atlas-motion-slow) var(--atlas-ease-out)`,
          zIndex: 100,
          boxShadow: open ? '0 0 30px rgba(0,0,0,0.5)' : 'none',
          // Respect iOS safe areas so content isn't hidden behind the notch / home bar
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
              Obsidian Atlas
            </span>
          </div>

          <button
            ref={firstFocusableRef}
            onClick={onClose}
            aria-label="Close navigation"
            style={{
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
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        {/* Chamber list (same grouped structure as desktop NavRail) */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '8px 0',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {groups.map((group, gi) => {
            const groupChambers = visibleChambers.filter((c) => c.group === group);
            return (
              <div key={group} style={{ marginBottom: 4 }}>
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
                {groupChambers.map((chamber) => {
                  const isActive = activeMode === chamber.id;
                  return (
                    <button
                      key={chamber.id}
                      onClick={() => handleSelect(chamber)}
                      aria-current={isActive ? 'page' : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        width: '100%',
                        padding: '11px 16px',
                        justifyContent: 'flex-start',
                        background: isActive
                          ? 'rgba(88, 28, 135, 0.18)'
                          : 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: isActive
                          ? 'rgba(226, 232, 240, 0.95)'
                          : 'rgba(226, 232, 240, 0.62)',
                        fontSize: '0.875rem',
                        fontWeight: isActive ? 500 : 400,
                        letterSpacing: '0.01em',
                        transition: `background var(--atlas-motion-fast) var(--atlas-ease-out), color var(--atlas-motion-fast) var(--atlas-ease-out)`,
                        position: 'relative',
                        whiteSpace: 'nowrap',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                        // Bigger touch targets on mobile (≥44px recommended)
                        minHeight: 44,
                      }}
                    >
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
                        <Icon path={ICONS[chamber.icon] ?? ICONS.atlas} size={18} />
                      </span>
                      <span>{chamber.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Model selector (matches desktop NavRail footer block) */}
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

        {/* Bottom user area — mirrors desktop NavRail */}
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
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

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <button
              onClick={() => {
                onSettingsClick?.();
                onClose();
              }}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '8px 10px',
                background: 'transparent',
                border: '1px solid rgba(88,28,135,0.25)',
                borderRadius: 4,
                cursor: 'pointer',
                color: 'rgba(226,232,240,0.75)',
                fontSize: '0.75rem',
                fontFamily: 'inherit',
                letterSpacing: '0.04em',
                minHeight: 38,
              }}
            >
              <Icon path={ICONS.settings} size={14} />
              <span>Settings</span>
            </button>

            <button
              onClick={() => {
                onSignOutClick?.();
                onClose();
              }}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '8px 10px',
                background: 'transparent',
                border: '1px solid rgba(220,38,38,0.2)',
                borderRadius: 4,
                cursor: 'pointer',
                color: 'rgba(248,113,113,0.75)',
                fontSize: '0.75rem',
                fontFamily: 'inherit',
                letterSpacing: '0.04em',
                minHeight: 38,
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
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
