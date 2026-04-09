import React from 'react';
import { useAtlasStore } from './store/useAtlasStore';
import AppShell from './components/shell/AppShell';
import AuthChamber from './chambers/AuthChamber';

export default function App() {
  const isAuthReady = useAtlasStore((s) => s.isAuthReady);
  const currentUser = useAtlasStore((s) => s.currentUser);
  const activeMode = useAtlasStore((s) => s.activeMode);

  // Boot screen — only shown for ~100ms while IDB resolves
  if (!isAuthReady) {
    return (
      <div
        style={{
          width: '100%',
          height: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--atlas-void-core)',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: '1.5px solid rgba(201, 162, 39, 0.4)',
            borderTopColor: 'rgba(201, 162, 39, 0.9)',
            animation: 'spin 0.9s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <span style={{ color: 'rgba(226,232,240,0.3)', fontSize: '0.75rem', letterSpacing: '0.1em' }}>
          ATLAS
        </span>
      </div>
    );
  }

  // Auth gate — show auth screen if no user
  if (!currentUser || activeMode === 'auth') {
    return <AuthChamber />;
  }

  return <AppShell />;
}
