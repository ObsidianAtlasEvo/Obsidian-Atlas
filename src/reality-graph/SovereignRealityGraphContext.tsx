import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { SrgCitationRef, SovereignRealityGraphSnapshot } from './types';

export type SovereignRealityGraphContextValue = {
  snapshot: SovereignRealityGraphSnapshot;
  bumpRevision: () => void;
  /** Highlight a node in Atlas Graph / Reality Engine (wired later to D3 view). */
  focusGraphNode: (ref: SrgCitationRef | null) => void;
  focusedNode: SrgCitationRef | null;
  /** Register a citation tooltip source from chat / deep-work streams. */
  registerCitation: (ref: SrgCitationRef) => void;
  citations: Map<string, SrgCitationRef>;
};

const defaultSnapshot: SovereignRealityGraphSnapshot = {
  revision: 0,
  lastSyncedAt: null,
};

const SovereignRealityGraphContext = createContext<SovereignRealityGraphContextValue | null>(null);

export function SovereignRealityGraphProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [snapshot, setSnapshot] = useState<SovereignRealityGraphSnapshot>(defaultSnapshot);
  const [focusedNode, setFocusedNode] = useState<SrgCitationRef | null>(null);
  const [citations, setCitations] = useState<Map<string, SrgCitationRef>>(() => new Map());

  const bumpRevision = useCallback(() => {
    setSnapshot((s) => ({
      revision: s.revision + 1,
      lastSyncedAt: new Date().toISOString(),
    }));
  }, []);

  const focusGraphNode = useCallback((ref: SrgCitationRef | null) => {
    setFocusedNode(ref);
  }, []);

  const registerCitation = useCallback((ref: SrgCitationRef) => {
    const key = `${ref.entityType}:${ref.id}`;
    setCitations((prev) => new Map(prev).set(key, ref));
  }, []);

  const value = useMemo<SovereignRealityGraphContextValue>(
    () => ({
      snapshot,
      bumpRevision,
      focusGraphNode,
      focusedNode,
      registerCitation,
      citations,
    }),
    [snapshot, bumpRevision, focusGraphNode, focusedNode, registerCitation, citations]
  );

  return (
    <SovereignRealityGraphContext.Provider value={value}>{children}</SovereignRealityGraphContext.Provider>
  );
}

export function useSovereignRealityGraph(): SovereignRealityGraphContextValue {
  const ctx = useContext(SovereignRealityGraphContext);
  if (!ctx) {
    throw new Error('useSovereignRealityGraph must be used within SovereignRealityGraphProvider');
  }
  return ctx;
}

/** Optional hook for modules that may mount outside the provider during tests. */
export function useSovereignRealityGraphOptional(): SovereignRealityGraphContextValue | null {
  return useContext(SovereignRealityGraphContext);
}
