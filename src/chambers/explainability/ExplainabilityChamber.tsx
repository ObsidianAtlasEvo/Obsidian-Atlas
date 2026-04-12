import React from 'react';
import { useAtlasStore } from '../../store/useAtlasStore';
import { ExplainabilityPanel } from './ExplainabilityPanel';
import { useExplainabilityFeed } from './useExplainabilityFeed';

/**
 * User-facing chamber: explanations for the signed-in user.
 */
export default function ExplainabilityChamber() {
  const uid = useAtlasStore((s) => s.currentUser?.uid);
  const { data, loading, error, refetch } = useExplainabilityFeed(uid, 100);

  if (!uid) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
        Sign in to view explainability for your account.
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
        <p className="text-sm text-rose-400">{error}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded-lg border border-white/10 px-4 py-2 text-xs text-slate-300 hover:bg-white/5"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-[#08080f]">
      <ExplainabilityPanel
        userId={uid}
        recentExplanations={data}
        isLoading={loading}
      />
    </div>
  );
}
