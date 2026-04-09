import React, { useState } from 'react';
import { GitBranch, Flame } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { CrucibleView } from '../../../components/CrucibleView';
import { DeepWorkChamber } from '../../../components/DeepWorkChamber';
import type { ActionModuleProps } from '../types';

/**
 * Crucible + Deep Work — heavy compute. DAG visualization + non-blocking orchestration
 * (SSE / worker) plugs into the placeholder rail below.
 */
export function CrucibleDeepWorkModule({ state, setState }: ActionModuleProps): React.ReactElement {
  const [tab, setTab] = useState<'crucible' | 'deep-work'>('crucible');

  return (
    <div className="flex h-full min-h-0 flex-col bg-obsidian text-ivory">
      <div className="flex shrink-0 gap-1 border-b border-titanium/15 px-4 py-2">
        <button
          type="button"
          onClick={() => setTab('crucible')}
          className={cn(
            'flex items-center gap-2 rounded-sm px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest',
            tab === 'crucible' ? 'bg-gold/15 text-gold' : 'text-stone hover:text-ivory'
          )}
        >
          <Flame size={14} />
          Crucible
        </button>
        <button
          type="button"
          onClick={() => setTab('deep-work')}
          className={cn(
            'flex items-center gap-2 rounded-sm px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest',
            tab === 'deep-work' ? 'bg-gold/15 text-gold' : 'text-stone hover:text-ivory'
          )}
        >
          <GitBranch size={14} />
          Deep Work
        </button>
      </div>

      {tab === 'crucible' ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <CrucibleView state={state} setState={setState} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="border-b border-titanium/10 bg-graphite/30 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-gold">Research DAG</p>
            <p className="mt-1 text-xs text-stone">
              Orchestrator steps render here (idle → plan → tool → synthesize). Non-blocking UI with cancel
              ties to backend stream.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {['Plan', 'Retrieve', 'Cross-check', 'Synthesize', 'Artifact'].map((step, i) => (
                <div
                  key={step}
                  className="rounded border border-titanium/20 bg-titanium/5 px-2 py-1 text-[10px] text-stone"
                >
                  {i + 1}. {step}
                </div>
              ))}
            </div>
          </div>
          <DeepWorkChamber />
        </div>
      )}
    </div>
  );
}
