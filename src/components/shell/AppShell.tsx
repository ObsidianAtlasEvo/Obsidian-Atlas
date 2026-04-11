import React from 'react';
import { useAtlasStore } from '../../store/useAtlasStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import NavRail from './NavRail';
import ChamberView from './ChamberView';

export default function AppShell() {
  const sidebarCollapsed = useAtlasStore((s) => s.uiConfig.sidebarCollapsed);
  const setSidebarCollapsed = useAtlasStore((s) => s.setSidebarCollapsed);
  const isMobile = useIsMobile();

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
        />
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
    </div>
  );
}
