import React from 'react';
import { useAtlasStore } from '../../store/useAtlasStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import NavRail from './NavRail';
import ChamberView from './ChamberView';

export default function AppShell() {
  const sidebarCollapsed = useAtlasStore((s) => s.uiConfig.sidebarCollapsed);
  const setSidebarCollapsed = useAtlasStore((s) => s.setSidebarCollapsed);
  const isMobile = useIsMobile();

  const navBottomReserve = isMobile
    ? 'calc(52px + env(safe-area-inset-bottom, 0px))'
    : 0;

  return (
    <div
      style={{
        width: '100%',
        height: '100dvh',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {!isMobile && (
        <NavRail
          expanded={!sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      )}

      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: isMobile ? 'auto' : 'hidden',
          overflowX: 'hidden',
          position: 'relative',
          minWidth: 0,
          minHeight: 0,
          paddingBottom: navBottomReserve,
        }}
      >
        <ChamberView />
      </main>

      {isMobile && (
        <NavRail
          isMobile
          expanded={false}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      )}
    </div>
  );
}
