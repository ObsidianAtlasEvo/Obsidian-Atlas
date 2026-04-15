import React from 'react';
import type { SyncStatus } from '../lib/sovereignSync';

interface Props { status: SyncStatus; className?: string }

export function SyncStatusIndicator({ status, className = '' }: Props) {
  if (status === 'idle' || status === 'synced') return null;
  const labels: Record<SyncStatus, string> = {
    idle: '', syncing: 'Syncing...', synced: '', failed: 'Sync failed — local draft',
  };
  const colors: Record<SyncStatus, string> = {
    idle: '', syncing: 'rgba(226,232,240,0.35)', synced: '', failed: 'rgba(251,191,36,0.7)',
  };
  return (
    <span className={className} style={{ fontSize: '0.6rem', color: colors[status] }}>
      {labels[status]}
    </span>
  );
}
