/**
 * ResponsiveShell.tsx
 * Root layout component for Obsidian Atlas.
 *
 * Layout strategy:
 *   Desktop  (≥1024px) — full sidebar nav rail + main content area. Unchanged from original design.
 *   Tablet   (768–1023px) — sidebar collapses to icon-only rail (56px wide). Panels stack vertically.
 *   Mobile   (<768px) — sidebar hidden entirely; accessible via floating action button that opens a
 *                        full-screen bottom-sheet drawer. Single-column, bottom-safe-area-aware.
 *
 * Drop-in replacement for the existing desktop shell. Wrap your existing <App /> with this and it
 * forwards the correct layout class names / context values at every breakpoint automatically.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { CollapsibleNav } from './CollapsibleNav';

// ─────────────────────────────────────────────────────────────────────────────
// Breakpoint hook (exported for use anywhere in the app)
// ─────────────────────────────────────────────────────────────────────────────

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

function getBreakpoint(width: number): Breakpoint {
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() =>
    typeof window !== 'undefined'
      ? getBreakpoint(window.innerWidth)
      : 'desktop',
  );

  useEffect(() => {
    let raf = 0;
    const handler = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setBp(getBreakpoint(window.innerWidth)));
    };
    window.addEventListener('resize', handler, { passive: true });
    return () => {
      window.removeEventListener('resize', handler);
      cancelAnimationFrame(raf);
    };
  }, []);

  return bp;
}

export function useIsMobile(): boolean {
  return useBreakpoint() === 'mobile';
}

export function useIsTablet(): boolean {
  return useBreakpoint() === 'tablet';
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell context — consumed by child components (chat, map, etc.)
// ─────────────────────────────────────────────────────────────────────────────

interface ShellContextValue {
  breakpoint: Breakpoint;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  activeChamber: string;
  setActiveChamber: (id: string) => void;
  /** True when the nav rail is in icon-only mode (tablet) */
  navCollapsed: boolean;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used inside <ResponsiveShell>');
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile FAB — floating button to open the drawer on small screens
// ─────────────────────────────────────────────────────────────────────────────

function MobileFAB({ onClick }: { onClick: () => void }) {
  return (
    <button
      aria-label="Open navigation"
      onClick={onClick}
      className={[
        'fixed z-40 bottom-6 right-4',
        'w-12 h-12 rounded-full',
        'bg-[#1a0a2e] border border-[#c9a84c]/40',
        'flex items-center justify-center',
        'shadow-lg shadow-black/60',
        'transition-transform duration-150 active:scale-95',
        // Glow
        'before:absolute before:inset-0 before:rounded-full',
        'before:shadow-[0_0_12px_2px_rgba(201,168,76,0.25)]',
      ].join(' ')}
      style={{ touchAction: 'manipulation' }}
    >
      {/* Hamburger icon */}
      <svg
        viewBox="0 0 20 20"
        fill="none"
        width={20}
        height={20}
        aria-hidden="true"
      >
        <rect x="3" y="5" width="14" height="1.5" rx="0.75" fill="#c9a84c" />
        <rect x="3" y="9.25" width="14" height="1.5" rx="0.75" fill="#c9a84c" />
        <rect x="3" y="13.5" width="14" height="1.5" rx="0.75" fill="#c9a84c" />
      </svg>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Topbar — visible only on mobile, shows Atlas wordmark + active chamber name
// ─────────────────────────────────────────────────────────────────────────────

interface TopBarProps {
  chamberName: string;
  onMenuClick: () => void;
}

function MobileTopBar({ chamberName, onMenuClick }: TopBarProps) {
  return (
    <header
      className={[
        'fixed top-0 left-0 right-0 z-30 h-14',
        'flex items-center justify-between px-4',
        'bg-[#0a0a0f]/95 backdrop-blur-md',
        'border-b border-[#2d1b4e]/60',
      ].join(' ')}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {/* Wordmark */}
      <span
        className="text-sm font-bold tracking-[0.2em] text-[#c9a84c] uppercase select-none"
        style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
      >
        Atlas
      </span>

      {/* Active chamber */}
      <span
        className="text-sm font-medium text-white/90 truncate max-w-[160px] mx-4"
        style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
      >
        {chamberName}
      </span>

      {/* Hamburger */}
      <button
        aria-label="Open navigation drawer"
        onClick={onMenuClick}
        className="w-11 h-11 flex items-center justify-center rounded-lg active:bg-white/5 transition-colors"
        style={{ touchAction: 'manipulation' }}
      >
        <svg viewBox="0 0 20 20" fill="none" width={20} height={20} aria-hidden="true">
          <rect x="3" y="5" width="14" height="1.5" rx="0.75" fill="#9ca3af" />
          <rect x="3" y="9.25" width="14" height="1.5" rx="0.75" fill="#9ca3af" />
          <rect x="3" y="13.5" width="14" height="1.5" rx="0.75" fill="#9ca3af" />
        </svg>
      </button>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ResponsiveShell component
// ─────────────────────────────────────────────────────────────────────────────

interface ResponsiveShellProps {
  /** The main content area — your existing chamber components */
  children: React.ReactNode;
  /** ID of the currently active chamber, controlled by parent */
  activeChamber?: string;
  /** Called when the user taps a nav item */
  onChamberChange?: (chamberId: string) => void;
  /** Display name of the active chamber (for mobile topbar) */
  activeChamberName?: string;
}

export function ResponsiveShell({
  children,
  activeChamber: activeChamberProp = 'chat',
  onChamberChange,
  activeChamberName = 'Chat',
}: ResponsiveShellProps) {
  const breakpoint = useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeChamber, setActiveChamberLocal] = useState(activeChamberProp);

  // Sync external prop
  useEffect(() => {
    setActiveChamberLocal(activeChamberProp);
  }, [activeChamberProp]);

  const setActiveChamber = useCallback(
    (id: string) => {
      setActiveChamberLocal(id);
      onChamberChange?.(id);
    },
    [onChamberChange],
  );

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Close drawer on breakpoint change to desktop
  useEffect(() => {
    if (breakpoint === 'desktop') setDrawerOpen(false);
  }, [breakpoint]);

  // Prevent body scroll when drawer is open on mobile
  useEffect(() => {
    if (drawerOpen && breakpoint !== 'desktop') {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen, breakpoint]);

  const navCollapsed = breakpoint === 'tablet';
  const isMobile = breakpoint === 'mobile';

  const contextValue: ShellContextValue = {
    breakpoint,
    drawerOpen,
    openDrawer,
    closeDrawer,
    activeChamber,
    setActiveChamber,
    navCollapsed,
  };

  return (
    <ShellContext.Provider value={contextValue}>
      <div
        className="atlas-shell h-screen w-screen overflow-hidden"
        style={{
          background: '#0a0a0f',
          fontFamily: 'system-ui, Inter, -apple-system, sans-serif',
        }}
      >
        {/* ── Desktop / Tablet Layout ──────────────────────────────────────── */}
        {!isMobile && (
          <div className="flex h-full w-full">
            {/* Sidebar nav — full on desktop, icon-only on tablet */}
            <CollapsibleNav
              activeChamber={activeChamber}
              onNavigate={(id) => {
                setActiveChamber(id);
                closeDrawer();
              }}
              collapsed={navCollapsed}
              drawerOpen={false}
              onDrawerClose={closeDrawer}
              mode="sidebar"
            />

            {/* Main content — fills remaining space */}
            <main
              className="flex-1 min-w-0 overflow-auto atlas-scroll"
              style={{
                /* On tablet, give content room when sidebar is icon-only */
                transition: 'margin-left 0.25s ease',
              }}
            >
              {children}
            </main>
          </div>
        )}

        {/* ── Mobile Layout ────────────────────────────────────────────────── */}
        {isMobile && (
          <>
            {/* Fixed topbar */}
            <MobileTopBar
              chamberName={activeChamberName}
              onMenuClick={openDrawer}
            />

            {/* Scrollable content below topbar, above bottom safe area */}
            <main
              className="atlas-scroll"
              style={{
                position: 'fixed',
                top: '56px',
                left: 0,
                right: 0,
                bottom: 0,
                overflowY: 'auto',
                overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              }}
            >
              {children}
            </main>

            {/* FAB — only when drawer is closed */}
            {!drawerOpen && <MobileFAB onClick={openDrawer} />}

            {/* Full-screen drawer via CollapsibleNav in drawer mode */}
            <CollapsibleNav
              activeChamber={activeChamber}
              onNavigate={(id) => {
                setActiveChamber(id);
                closeDrawer();
              }}
              collapsed={false}
              drawerOpen={drawerOpen}
              onDrawerClose={closeDrawer}
              mode="drawer"
            />
          </>
        )}
      </div>
    </ShellContext.Provider>
  );
}

export default ResponsiveShell;
