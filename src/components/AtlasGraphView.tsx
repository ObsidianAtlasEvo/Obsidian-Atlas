// Atlas-Audit: [EXEC-MAP] Verified — Loads Mind Cartography graph into Atlas Graph when API enabled; header/metrics state substrate honestly.
import React, { useState, useCallback, useEffect } from 'react';
import { Network, Filter, ZoomIn, ZoomOut, Maximize2, Share2, Download, Settings } from 'lucide-react';
import { AppState } from '../types';
import type { Entity } from '../types';
import { AtlasGraph } from './AtlasGraph';
import { AtlasGraphNodePanel } from './atlas/AtlasGraphNodePanel';
import { fetchMindMapGraphEntities } from '../services/mindMapGraphBridge';
import { atlasTraceUserId } from '../lib/atlasTraceContext';

interface AtlasGraphViewProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function AtlasGraphView({ state, setState: _setState }: AtlasGraphViewProps) {
  void _setState;
  const [selectedNode, setSelectedNode] = useState<Entity | null>(null);
  const [graphEntities, setGraphEntities] = useState<Entity[] | undefined>(undefined);
  const [graphMode, setGraphMode] = useState<'loading' | 'live' | 'scaffold'>('loading');

  const clearSelection = useCallback(() => setSelectedNode(null), []);
  const handleSelect = useCallback((e: Entity | null) => setSelectedNode(e), []);

  useEffect(() => {
    const uid = atlasTraceUserId(state);
    let cancelled = false;
    void (async () => {
      const { entities, live } = await fetchMindMapGraphEntities(uid);
      if (cancelled) return;
      setGraphEntities(entities);
      setGraphMode(live ? 'live' : 'scaffold');
    })();
    return () => {
      cancelled = true;
    };
  }, [state.currentUser?.uid, state.currentUser?.email]);

  const nodeCount =
    graphEntities?.length ??
    state.globalIntelligence.trendingTopics.length + state.globalIntelligence.shiftingCenters.length;

  return (
    <div className="h-full flex flex-col bg-obsidian relative overflow-hidden">
      <header className="h-16 border-b border-titanium/20 px-8 flex items-center justify-between bg-obsidian/90 backdrop-blur-xl z-30">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-signal-amber/10 rounded-sm border border-signal-amber/15">
            <Network size={18} className="text-signal-amber" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-sm font-serif text-ivory uppercase tracking-widest">Atlas Graph</h2>
            <p className="text-[9px] font-mono text-stone/50 uppercase tracking-[0.2em]">
              {graphMode === 'loading' && 'Loading substrate…'}
              {graphMode === 'live' && 'Live mind map · same API as Cartography'}
              {graphMode === 'scaffold' && 'Scaffold dataset · enable HTTP + Cartography seed for live graph'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 px-4 py-2 bg-titanium/10 border border-titanium/20 rounded-sm">
            <Filter size={12} className="text-stone" strokeWidth={1.5} />
            <span className="text-[9px] font-mono text-stone uppercase tracking-widest">Filter: All Nodes</span>
          </div>

          <div className="h-6 w-px bg-titanium/30" />

          <div className="flex items-center gap-3">
            {[
              { icon: ZoomIn, label: 'Zoom In' },
              { icon: ZoomOut, label: 'Zoom Out' },
              { icon: Maximize2, label: 'Fit' },
              { icon: Share2, label: 'Share' },
              { icon: Download, label: 'Export' },
              { icon: Settings, label: 'Config' },
            ].map((tool) => (
              <button
                key={tool.label}
                type="button"
                className="p-2 text-stone/50 hover:text-signal-amber transition-colors duration-200 group relative"
                title={tool.label}
              >
                <tool.icon size={16} strokeWidth={1.5} />
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-graphite border border-titanium/30 text-[8px] font-mono text-ivory uppercase tracking-widest opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 whitespace-nowrap">
                  {tool.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 relative bg-obsidian/95 min-h-0">
        <AtlasGraph
          globalIntelligence={state.globalIntelligence}
          hideUI
          graphEntities={graphEntities}
          selectedEntity={selectedNode}
          onSelectEntity={handleSelect}
        />

        <AtlasGraphNodePanel entity={selectedNode} onClose={clearSelection} />

        <div className="absolute bottom-8 left-8 p-5 glass-panel border-titanium/20 bg-graphite/70 z-20 space-y-3 max-w-[220px] pointer-events-none">
          <h3 className="instrument-label text-signal-amber/90">Legend</h3>
          <div className="space-y-2">
            {[
              { label: 'Core concept', cls: 'bg-signal-amber' },
              { label: 'Latent pattern', cls: 'bg-teal' },
              { label: 'High tension', cls: 'bg-drift-crimson' },
              { label: 'Verified fact', cls: 'bg-extract-green' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${item.cls}`} />
                <span className="text-[9px] font-mono text-stone/70 uppercase tracking-widest">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute top-8 right-8 p-5 glass-panel border-titanium/20 bg-graphite/70 space-y-3 z-20 w-52 pointer-events-none">
          <h3 className="instrument-label text-signal-amber/90">Metrics</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-[8px] font-mono text-stone/45 uppercase tracking-widest block mb-1">Nodes</span>
              <span className="text-sm font-serif text-ivory tabular-nums">{nodeCount}</span>
            </div>
            <div>
              <span className="text-[8px] font-mono text-stone/45 uppercase tracking-widest block mb-1">Substrate</span>
              <span className="text-[10px] font-mono text-stone uppercase tracking-tighter">
                {graphMode === 'loading' ? '…' : graphMode}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute inset-0 pointer-events-none z-[5] shadow-[inset_0_0_160px_rgba(0,0,0,0.65)]" />
    </div>
  );
}
