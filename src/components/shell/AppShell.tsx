import React, { useState } from 'react';
import { useAtlasStore } from '../../store/useAtlasStore';
import NavRail from './NavRail';
import ChamberView from './ChamberView';

export default function AppShell() {
  const sidebarCollapsed = useAtlasStore((s) => s.uiConfig.sidebarCollapsed);
  const setSidebarCollapsed = useAtlasStore((s) => s.setSidebarCollapsed);

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
