/**
 * MobileTopBar
 *
 * Slim top bar shown only on mobile. Its job is to host the hamburger button
 * that opens MobileSidebarDrawer and display the Atlas sigil + active chamber
 * label so users always have a "where am I" signpost. Desktop layout keeps
 * the permanent NavRail and has no top bar.
 */

import React from 'react';
import { useAtlasStore } from '../../store/useAtlasStore';
import { CHAMBERS, ICONS, Icon } from './chamberCatalog';
import { HamburgerIcon } from './MobileSidebarDrawer';

interface MobileTopBarProps {
  onOpenDrawer: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

export default function MobileTopBar({ onOpenDrawer, triggerRef }: MobileTopBarProps) {
  const activeMode = useAtlasStore((s) => s.activeMode);
  const activeChamber = CHAMBERS.find((c) => c.id === activeMode);

  return (
    <header
      className="atlas-mobile-topbar"
      style={{
        position: 'sticky',
        top: 0,
        left: 0,
        right: 0,
        // Base bar is 48px; extend by iOS notch (safe-area-inset-top) so content
        // underneath isn't clipped behind the status-bar cutout.
        height: 'calc(48px + env(safe-area-inset-top, 0px))',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 10px',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        background: 'var(--atlas-surface-rail)',
        borderBottom: '1px solid var(--border-structural)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        zIndex: 40,
        flexShrink: 0,
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={onOpenDrawer}
        aria-label="Open navigation"
        aria-haspopup="dialog"
        style={{
          background: 'transparent',
          border: '1px solid rgba(88,28,135,0.2)',
          borderRadius: 4,
          width: 36,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(226,232,240,0.8)',
          cursor: 'pointer',
          padding: 0,
          flexShrink: 0,
        }}
      >
        <HamburgerIcon />
      </button>

      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          border: '1.25px solid rgba(201, 162, 39, 0.5)',
          background: 'radial-gradient(circle, rgba(88,28,135,0.4) 0%, transparent 70%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: 'rgba(201, 162, 39, 0.9)',
        }}
      >
        <Icon path={ICONS.atlas} size={12} />
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minWidth: 0,
          flex: 1,
        }}
      >
        <span
          style={{
            fontSize: '0.625rem',
            fontWeight: 600,
            letterSpacing: '0.12em',
            color: 'rgba(226, 232, 240, 0.4)',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          Obsidian Atlas
        </span>
        <span
          style={{
            fontSize: '0.8125rem',
            color: 'rgba(226, 232, 240, 0.85)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.2,
          }}
        >
          {activeChamber?.label ?? ''}
        </span>
      </div>
    </header>
  );
}
