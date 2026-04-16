import React from 'react';
import AppShell from './components/shell/AppShell';
import { AuthGuard } from './components/Auth/AuthGuard';

export default function App() {
  return (
    <AuthGuard>
      <AppShell />
    </AuthGuard>
  );
}
