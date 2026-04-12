import React from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { EvolutionControlPanel } from './EvolutionControlPanel';

/**
 * Shell chamber for the governance evolution transparency panel (Phase 2).
 */
export default function EvolutionControlChamber() {
  const uid = useAtlasStore((s) => s.currentUser?.uid ?? 'anonymous');

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <EvolutionControlPanel userId={uid} onProfileChange={() => {}} />
    </div>
  );
}
