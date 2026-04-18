import React, { useCallback, useEffect } from 'react';
import { useAtlasStore } from '../../store/useAtlasStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAtlasAuth } from '../Auth/atlasAuthContext';
import { SOVEREIGN_CREATOR_EMAIL } from '../../config/sovereignCreator';
import { nowISO } from '../../lib/persistence';
import { atlasAuthUrl } from '../../lib/atlasApi';
import NavRail from './NavRail';
import ChamberView from './ChamberView';
import { SettingsMenu } from '../SettingsMenu';
import type { AppState } from '../../types';

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
    void hydrateUserData(atlasSession.databaseUserId);
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
        />
        <SettingsMenu state={settingsState} setState={settingsSetState} />
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
    </div>
  );
}
