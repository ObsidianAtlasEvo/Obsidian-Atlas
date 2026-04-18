import React from 'react';
import AppShell from './components/shell/AppShell';
import { AuthGuard } from './components/Auth/AuthGuard';
import { LegalGate } from './components/legal/LegalGate';

export default function App() {
  return (
    <AuthGuard>
      <LegalGate>
        <AppShell />
      </LegalGate>
    </AuthGuard>
  );
}
