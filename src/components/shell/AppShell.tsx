import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useAtlasStore } from '../../store/useAtlasStore';
import { useNavStore } from '../../store/useNavStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAtlasAuth } from '../Auth/atlasAuthContext';
import { SOVEREIGN_CREATOR_EMAIL } from '../../config/sovereignCreator';
import { nowISO } from '../../lib/persistence';
import { atlasAuthUrl } from '../../lib/atlasApi';
import { syncChatHistoryOnLogin } from '../../lib/chatSync';
import NavRail from './NavRail';
import ChamberView from './ChamberView';
import MobileSidebarDrawer from './MobileSidebarDrawer';
import MobileTopBar from './MobileTopBar';
import { SettingsMenu } from '../SettingsMenu';
import type { AppState } from '../../types';

// Command palette — lazy so it doesn't block initial shell render. Only one
// mount point exists; it's toggled via useNavStore.commandPaletteOpen and
// the global ⌘K / Ctrl+K shortcut installed below.
const CommandPalette = lazy(() => import('./CommandPalette'));

export default function AppShell() {
  const sidebarCollapsed = useAtlasStore((s) => s.uiConfig.sidebarCollapsed);
  const setSidebarCollapsed = useAtlasStore((s) => s.setSidebarCollapsed);
  const setSettingsOpen = useAtlasStore((s) => s.setSettingsOpen);
  const isMobile = useIsMobile();

  // ── Bridge Google OAuth JWT session into Zustand store ──────────────
  const atlasSession = useAtlasAuth();
  const setCurrentUser = useAtlasStore((s) => s.setCurrentUser);
  const hydrateUserData = useAtlasStore((s) => s.hydrateUserData);

  useEffect(() => {
    if (!atlasSession) return;
    const role = atlasSession.email.toLowerCase() === SOVEREIGN_CREATOR_EMAIL.toLowerCase()
      ? 'sovereign_creator' as const
      : 'registered_user' as const;
    const profile = {
      uid: atlasSession.databaseUserId,
      email: atlasSession.email,
      emailVerified: true,
      role,
      createdAt: nowISO(),
      securitySettings: { mfaEnabled: false, passkeyEnabled: false },
      privacySettings: { dataMinimization: true, memorySovereignty: true },
    };
    setCurrentUser(profile);
    void hydrateUserData(atlasSession.databaseUserId).then(() => {
      // Fire-and-forget: chat history sync pulls remote threads/messages from
      // Supabase so the user's conversations follow them across devices. Any
      // error is swallowed inside syncChatHistoryOnLogin so the shell never
      // blocks on hydration.
      void syncChatHistoryOnLogin(atlasSession.databaseUserId);
    });
  }, [atlasSession, setCurrentUser, hydrateUserData]);

  const handleSettingsClick = useCallback(() => {
    setSettingsOpen(true);
  }, [setSettingsOpen]);

  const handleSignOut = useCallback(async () => {
    try {
      // POST to backend to clear the session cookie
      await fetch(atlasAuthUrl('/auth/signout'), {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Even if the backend call fails, redirect to force re-auth
    }
    window.location.href = '/';
  }, []);

  // Bridge Zustand store to SettingsMenu's {state, setState} interface.
  // Subscribe to the fields SettingsMenu reads so it re-renders when they change.
  const isSettingsOpen = useAtlasStore((s) => s.isSettingsOpen);
  const activeMode = useAtlasStore((s) => s.activeMode);
  const currentUser = useAtlasStore((s) => s.currentUser);

  const settingsState = { isSettingsOpen, activeMode, currentUser } as unknown as AppState;

  const settingsSetState: React.Dispatch<React.SetStateAction<AppState>> = useCallback(
    (action) => {
      const current = useAtlasStore.getState() as unknown as AppState;
      const next = typeof action === 'function' ? action(current) : action;
      if (next.isSettingsOpen !== undefined) {
        useAtlasStore.getState().setSettingsOpen(next.isSettingsOpen);
      }
      if (next.activeMode !== undefined) {
        useAtlasStore.getState().setActiveMode(next.activeMode);
      }
    },
    [],
  );

  // ── Mobile sidebar drawer state ──
  // Kept here (not in the store) because it's purely a layout concern tied to
  // the mobile shell's lifecycle — no other component needs to read or
  // persist it. If we ever want deep-linking or cross-tab sync we can lift it
  // into the Zustand store later.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement | null>(null);

  // Collapse the drawer automatically when the viewport grows past the mobile
  // breakpoint (e.g. rotation from portrait to landscape on a tablet) so the
  // desktop layout doesn't start with a stale open overlay.
  useEffect(() => {
    if (!isMobile && drawerOpen) setDrawerOpen(false);
  }, [isMobile, drawerOpen]);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // ── Command palette global shortcut (⌘K / Ctrl+K) ──
  // Installed at the shell level so it works regardless of which chamber is
  // active. Matches the Refine.txt §6 "universal search" spec.
  const toggleCommandPalette = useNavStore((s) => s.toggleCommandPalette);
  const commandPaletteOpen = useNavStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useNavStore((s) => s.setCommandPaletteOpen);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isSearchKey =
        (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
      if (isSearchKey) {
        e.preventDefault();
        toggleCommandPalette();
      } else if (e.key === 'Escape' && useNavStore.getState().commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleCommandPalette, setCommandPaletteOpen]);

  if (isMobile) {
    return (
      <div
        style={{
          width: '100%',
          height: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <MobileTopBar onOpenDrawer={openDrawer} triggerRef={hamburgerRef} />

        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            overflowX: 'hidden',
            position: 'relative',
            minHeight: 0,
            paddingBottom: 56, // space for bottom nav
          }}
        >
          <ChamberView />
        </main>

        <NavRail
          expanded={false}
          onToggle={() => {}}
          isMobile
          onSettingsClick={handleSettingsClick}
          onSignOutClick={handleSignOut}
          onOpenDrawer={openDrawer}
        />

        <MobileSidebarDrawer
          open={drawerOpen}
          onClose={closeDrawer}
          onSettingsClick={handleSettingsClick}
          onSignOutClick={handleSignOut}
          returnFocusRef={hamburgerRef}
        />

        <SettingsMenu state={settingsState} setState={settingsSetState} />

        {commandPaletteOpen && (
          <Suspense fallback={null}>
            <CommandPalette />
          </Suspense>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100dvh',
        display: 'flex',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <NavRail
        expanded={!sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onSettingsClick={handleSettingsClick}
        onSignOutClick={handleSignOut}
      />

      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
          minWidth: 0,
        }}
      >
        <ChamberView />
      </main>
      <SettingsMenu state={settingsState} setState={settingsSetState} />

      {commandPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
      )}
    </div>
  );
}
