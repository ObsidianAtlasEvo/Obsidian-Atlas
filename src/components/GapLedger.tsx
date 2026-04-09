// Atlas-Audit: [EXEC-MODE] Verified — Repair-from-gap routes Home inquiry surface via coerceActiveMode('today-in-atlas', prev.activeMode).
import React, { useState, useEffect } from 'react';
import { AppState, Gap } from '../types';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  Timestamp,
  type QuerySnapshot,
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Target, AlertTriangle, CheckCircle, Clock, Search, Filter, Plus, ChevronRight, RefreshCw } from 'lucide-react';
import { coerceActiveMode } from '../lib/atlasWayfinding';
import { cn } from '../lib/utils';

interface GapLedgerProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function GapLedger({ state, setState }: GapLedgerProps) {
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [repairingGapId, setRepairingGapId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'gap_ledger'), orderBy('detectedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const s = snapshot as QuerySnapshot;
      const gapData = s.docs.map((d) => ({ id: d.id, ...d.data() } as Gap));
      setGaps(gapData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'gap_ledger');
    });

    return () => unsubscribe();
  }, []);

  const filteredGaps = filter === 'all' ? gaps : gaps.filter(g => g.severity === filter);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-crimson-900 border-crimson-900/20 bg-crimson-900/5';
      case 'high': return 'text-gold-500 border-gold-500/20 bg-gold-500/5';
      case 'medium': return 'text-ivory border-stone-800/20 bg-stone-800/5';
      default: return 'text-stone border-stone-800/10 bg-stone-800/5';
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-serif text-ivory tracking-tight">Ranked Gap Ledger</h2>
          <p className="text-[10px] font-mono uppercase tracking-widest text-stone">Identified Architectural Weaknesses</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-stone-900/40 border border-stone-800 p-1 rounded-sm">
            {['all', 'critical', 'high', 'medium', 'low'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f as any)}
                className={cn(
                  "px-3 py-1.5 text-[8px] uppercase tracking-widest transition-all duration-300",
                  filter === f ? "bg-gold-500/10 text-gold-500" : "text-stone hover:text-ivory"
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <button className="p-2 bg-gold-500/10 border border-gold-500/20 text-gold-500 hover:bg-gold-500/20 transition-all duration-300">
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="py-20 text-center text-stone uppercase tracking-widest pulse-shimmer rounded-sm">Scanning Architecture...</div>
        ) : filteredGaps.length === 0 ? (
          <div className="py-20 text-center text-stone uppercase tracking-widest opacity-30">No Gaps Identified in this Tier</div>
        ) : (
          filteredGaps.map((gap) => (
            <motion.div 
              key={gap.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "p-6 border rounded-sm flex items-center justify-between group transition-all duration-300",
                getSeverityColor(gap.severity)
              )}
            >
              <div className="flex items-center gap-6">
                <div className="p-3 bg-obsidian/40 border border-stone-800 rounded-sm">
                  <AlertTriangle size={20} className={cn(gap.severity === 'critical' ? 'text-crimson-900' : 'text-gold-500')} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-ivory uppercase tracking-widest">{gap.title}</h3>
                  <p className="text-xs text-stone leading-relaxed max-w-xl">{gap.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-8">
                {gap.status === 'identified' && (
                  <button 
                    onClick={() => {
                      setRepairingGapId(gap.id);
                      setState((prev) => ({
                        ...prev,
                        activeMode: coerceActiveMode('today-in-atlas', prev.activeMode),
                        activeChamberState: {
                          query: `/repair ${gap.title} - ${gap.description}`,
                          immediateSend: true,
                          thinkingState: 'WEIGHING CONTRADICTIONS',
                        },
                      }));
                      // Reset loading state after a delay (simulating the request starting)
                      setTimeout(() => setRepairingGapId(null), 2000);
                    }}
                    disabled={repairingGapId === gap.id}
                    className={cn(
                      "px-3 py-1.5 border text-[8px] uppercase tracking-widest transition-all duration-300 flex items-center gap-2",
                      repairingGapId === gap.id 
                        ? "border-gold-500/20 text-gold-500/40 cursor-not-allowed" 
                        : "border-gold-500/40 text-gold-500 hover:bg-gold-500/10 active:scale-95"
                    )}
                  >
                    {repairingGapId === gap.id ? (
                      <>
                        <RefreshCw size={12} className="animate-spin" />
                        Processing
                      </>
                    ) : (
                      'Propose Repair'
                    )}
                  </button>
                )}
                <div className="flex flex-col items-end">
                  <span className="text-[8px] uppercase tracking-widest text-stone">Status</span>
                  <span className="text-[10px] font-mono text-ivory uppercase tracking-widest">{gap.status}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[8px] uppercase tracking-widest text-stone">Detected</span>
                  <span className="text-[10px] font-mono text-ivory uppercase tracking-widest">{new Date(gap.detectedAt).toLocaleDateString()}</span>
                </div>
                <ChevronRight size={16} className="text-stone group-hover:text-gold-500 transition-all duration-300" />
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
