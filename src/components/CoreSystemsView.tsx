// Atlas-Audit: [EXEC-QL] Verified — initialTab syncs Truth Ledger / Memory Vault deep links from activeMode (Home Quick Access) into the correct Core Systems tab.
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AppState } from '../types';
import { RealityEngine } from './RealityEngine';
import { TruthLedgerView } from './TruthLedgerView';
import { EvolutionView } from './EvolutionView';
import { MemoryView } from './MemoryView';
import { Globe, Radio, Brain, Database } from 'lucide-react';
import { cn } from '../lib/utils';

export type CoreSystemsTab = 'reality-engine' | 'truth-ledger' | 'evolution' | 'memory';

interface CoreSystemsViewProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  /** When set (e.g. activeMode reality-ledger / memory-vault), opens the matching sub-surface. */
  initialTab?: CoreSystemsTab;
}

export function CoreSystemsView({ state, setState, initialTab }: CoreSystemsViewProps) {
  const [activeTab, setActiveTab] = useState<CoreSystemsTab>(() => initialTab ?? 'reality-engine');

  useEffect(() => {
    setActiveTab(initialTab ?? 'reality-engine');
  }, [initialTab]);

  const tabs = [
    { id: 'reality-engine', label: 'Reality Engine', icon: Globe },
    { id: 'truth-ledger', label: 'Truth Ledger', icon: Radio },
    { id: 'evolution', label: 'Evolution', icon: Brain },
    { id: 'memory', label: 'Memory Vault', icon: Database },
  ] as const;

  return (
    <div className="h-full flex flex-col bg-obsidian overflow-hidden">
      {/* Top Navigation */}
      <div className="flex items-center gap-8 border-b border-titanium/10 px-8 pt-6 pb-0 bg-graphite/40">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "pb-4 text-[10px] font-bold uppercase tracking-[0.3em] transition-all relative flex items-center gap-2",
                isActive ? "text-gold" : "text-stone opacity-40 hover:opacity-100"
              )}
            >
              <Icon size={14} />
              {tab.label}
              {isActive && (
                <motion.div 
                  layoutId="activeCoreSystemTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold shadow-[0_0_10px_rgba(255,215,0,0.5)]"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {activeTab === 'reality-engine' && (
            <motion.div
              key="reality-engine"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute inset-0"
            >
              <RealityEngine state={state} setState={setState} />
            </motion.div>
          )}
          {activeTab === 'truth-ledger' && (
            <motion.div
              key="truth-ledger"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute inset-0"
            >
              <TruthLedgerView state={state} setState={setState} />
            </motion.div>
          )}
          {activeTab === 'evolution' && (
            <motion.div
              key="evolution"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute inset-0"
            >
              <EvolutionView state={state} setState={setState} />
            </motion.div>
          )}
          {activeTab === 'memory' && (
            <motion.div
              key="memory"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute inset-0"
            >
              <MemoryView state={state} setState={setState} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
