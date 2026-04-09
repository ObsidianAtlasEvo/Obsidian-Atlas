import React, { useState, useEffect } from 'react';
import { AppState, GrowthMilestone, IdentityDiff, RecurringLoop } from '../types';
import { motion } from 'motion/react';
import { Brain, GitBranch, RefreshCw, Star, ArrowRight, Clock, Shield, Zap, AlertCircle, Activity } from 'lucide-react';
import { cn } from '../lib/utils';
import { globalEvolutionEngine } from '../services/ollamaService';

interface EvolutionViewProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function EvolutionView({ state, setState }: EvolutionViewProps) {
  const { evolutionTimeline } = state;
  const [profile, setProfile] = useState(globalEvolutionEngine.getProfile());
  const [ledger, setLedger] = useState(globalEvolutionEngine.getLedger());

  useEffect(() => {
    // Poll for updates (in a real app, use a subscription or event emitter)
    const interval = setInterval(() => {
      setProfile(globalEvolutionEngine.getProfile());
      setLedger(globalEvolutionEngine.getLedger());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleAuthorize = (logId: string) => {
    setState(prev => ({
      ...prev,
      adaptiveEvolution: {
        ...prev.adaptiveEvolution,
        evolutionLog: prev.adaptiveEvolution.evolutionLog.map(log => 
          log.id === logId ? { ...log, status: 'implemented', is_user_verified: true } : log
        )
      }
    }));
  };

  return (
    <div className="h-full flex flex-col bg-obsidian text-ivory overflow-hidden">
      <header className="p-4 md:p-8 border-b border-titanium/10 flex items-center justify-between bg-obsidian/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 border border-gold/40 flex items-center justify-center bg-gold/5">
            <Brain className="text-gold" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-serif tracking-tight">Evolution Timeline</h1>
            <div className="flex items-center gap-2 mt-1">
              <Shield size={10} className="text-teal" />
              <p className="text-[10px] text-stone uppercase tracking-widest opacity-60">
                Sovereign Instance: <span className="text-teal">Isolated</span>. Evolution tethered to User <span className="text-ivory">[{state.currentUser?.uid?.slice(0, 8)}]</span>. No global data leakage.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-16 max-w-6xl mx-auto w-full">
        {/* Growth Milestones - Vertical Timeline */}
        <section className="space-y-8">
          <div className="flex items-center gap-3">
            <Star className="text-gold" size={20} />
            <h2 className="text-lg font-serif">Growth Milestones</h2>
          </div>
          <div className="relative pl-10 md:pl-12 border-l border-titanium/20 space-y-12">
            {evolutionTimeline.milestones.map((milestone, i) => (
              <motion.div 
                key={milestone.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="relative"
              >
                <div className="absolute -left-[49px] md:left-[-57px] top-0 w-4 h-4 bg-obsidian border-2 border-gold rounded-full z-10 shadow-[0_0_10px_rgba(212,175,55,0.5)]" />
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-stone">{new Date(milestone.timestamp).toLocaleDateString()}</span>
                    <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 bg-gold/10 text-gold border border-gold/20 rounded">
                      {milestone.category}
                    </span>
                  </div>
                  <h3 className="text-lg font-serif text-ivory">{milestone.title}</h3>
                  <p className="text-sm text-stone max-w-2xl leading-relaxed">{milestone.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Identity Diffs - Structural Changes */}
        <section className="space-y-8">
          <div className="flex items-center gap-3">
            <GitBranch className="text-gold" size={20} />
            <h2 className="text-lg font-serif">Identity Diffing</h2>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {evolutionTimeline.identityDiffs.map((diff) => (
              <div key={diff.id} className="glass-panel p-6 border-titanium/20 space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Clock size={14} className="text-stone" />
                    <span className="text-[10px] font-mono text-stone">{new Date(diff.timestamp).toLocaleString()}</span>
                    <span className="text-[10px] uppercase tracking-widest text-gold font-bold">{diff.field}</span>
                  </div>
                  <span className={cn(
                    "text-[9px] uppercase tracking-widest px-2 py-0.5 rounded border",
                    diff.significance === 'high' ? "border-gold/30 bg-gold/5 text-gold" : "border-titanium/20 text-stone"
                  )}>
                    {diff.significance} Significance
                  </span>
                </div>
                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 md:gap-8">
                  <div className="flex-1 p-4 bg-oxblood/5 border border-oxblood/10 rounded">
                    <div className="text-[8px] uppercase tracking-widest text-oxblood mb-2">Previous State</div>
                    <div className="text-sm text-stone line-through opacity-50">{diff.oldValue}</div>
                  </div>
                  <div className="flex justify-center md:block">
                    <ArrowRight className="text-stone opacity-30 rotate-90 md:rotate-0" size={24} />
                  </div>
                  <div className="flex-1 p-4 bg-teal/5 border border-teal/10 rounded">
                    <div className="text-[8px] uppercase tracking-widest text-teal mb-2">Current State</div>
                    <div className="text-sm text-ivory">{diff.newValue}</div>
                  </div>
                </div>
                {diff.context && (
                  <p className="text-xs text-stone italic opacity-60">Context: {diff.context}</p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Recurring Loops - Behavioral Patterns */}
        <section className="space-y-8">
          <div className="flex items-center gap-3">
            <RefreshCw className="text-gold" size={20} />
            <h2 className="text-lg font-serif">Recurring Loops & Patterns</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {evolutionTimeline.recurringLoops.map((loop) => (
              <div key={loop.id} className="p-6 bg-titanium/5 border border-titanium/10 rounded hover:border-gold/30 transition-all space-y-4">
                <div className="flex justify-between items-start">
                  <h3 className="text-ivory font-medium">{loop.title}</h3>
                  <span className={cn(
                    "text-[9px] uppercase tracking-widest px-2 py-0.5 rounded border",
                    loop.status === 'active' ? "border-gold/30 bg-gold/5 text-gold" : "border-teal/30 bg-teal/5 text-teal"
                  )}>
                    {loop.status}
                  </span>
                </div>
                <p className="text-xs text-stone leading-relaxed">{loop.description}</p>
                <div className="pt-4 border-t border-titanium/10 flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-[8px] uppercase tracking-widest text-stone">Recurrence</span>
                    <span className="text-sm font-mono text-ivory">{loop.frequency}x</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[8px] uppercase tracking-widest text-stone">Last Observed</span>
                    <span className="text-sm font-mono text-ivory">{loop.lastSeen}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Resonance Heatmap */}
        <section className="space-y-8">
          <div className="flex items-center gap-3">
            <Activity className="text-gold" size={20} />
            <h2 className="text-lg font-serif">Resonance Heatmap (Shadow Ontology)</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(profile.patternHeatmap).length > 0 ? (
              Object.entries(profile.patternHeatmap).map(([key, value]) => (
                <div key={key} className="p-4 bg-stone-900/50 border border-stone-800 rounded relative overflow-hidden">
                  <div 
                    className="absolute bottom-0 left-0 right-0 bg-gold/10" 
                    style={{ height: `${Math.min(100, value * 10)}%` }} 
                  />
                  <div className="relative z-10">
                    <div className="text-[10px] uppercase tracking-widest text-stone-400 mb-1">{key.split('.')[1] || key}</div>
                    <div className="text-xl font-mono text-gold">{value.toFixed(2)}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full p-8 text-center border border-dashed border-titanium/20 rounded text-stone">
                Insufficient data to generate resonance heatmap. Engage with Atlas to build ontology.
              </div>
            )}
          </div>
        </section>

        {/* Discretionary Logs */}
        <section className="space-y-8">
          <div className="flex items-center gap-3">
            <Shield className="text-gold" size={20} />
            <h2 className="text-lg font-serif">Autonomous Shifts (Discretionary Logs)</h2>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {ledger.map((event) => (
              <div key={event.id} className="glass-panel p-6 border-gold/20 space-y-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-gold/50" />
                <div className="flex justify-between items-center pl-4">
                  <div className="flex items-center gap-3">
                    <Clock size={14} className="text-stone" />
                    <span className="text-[10px] font-mono text-stone">{new Date(event.timestamp).toLocaleString()}</span>
                    <span className="text-[10px] uppercase tracking-widest text-gold font-bold">{event.impactZone}</span>
                  </div>
                  <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded border border-gold/30 bg-gold/5 text-gold">
                    Resonance: {event.resonanceScore.toFixed(2)}
                  </span>
                </div>
                <div className="space-y-2 pl-4">
                  <div className="text-[10px] uppercase tracking-widest text-stone">Rationale</div>
                  <p className="text-sm text-ivory">{event.rationale}</p>
                </div>
              </div>
            ))}
            {ledger.length === 0 && (
              <div className="p-8 text-center border border-dashed border-titanium/20 rounded text-stone">
                No autonomous shifts recorded yet.
              </div>
            )}
          </div>
        </section>

        {/* Adaptive Evolution Log */}
        <section className="space-y-8">
          <div className="flex items-center gap-3">
            <Shield className="text-gold" size={20} />
            <h2 className="text-lg font-serif">Adaptive Evolution Core Log</h2>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {state.adaptiveEvolution.evolutionLog.map((log) => (
              <div key={log.id} className="glass-panel p-6 border-titanium/20 space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Clock size={14} className="text-stone" />
                    <span className="text-[10px] font-mono text-stone">{new Date(log.timestamp).toLocaleString()}</span>
                    <span className="text-[10px] uppercase tracking-widest text-gold font-bold">{log.layer}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className={cn(
                      "text-[9px] uppercase tracking-widest px-2 py-0.5 rounded border",
                      log.trigger.includes('positive') ? "border-teal/30 bg-teal/5 text-teal" : 
                      log.trigger.includes('negative') ? "border-oxblood/30 bg-oxblood/5 text-oxblood" :
                      "border-titanium/20 text-stone"
                    )}>
                      {log.trigger}
                    </span>
                    <span className={cn(
                      "text-[9px] uppercase tracking-widest px-2 py-0.5 rounded border",
                      log.status === 'implemented' ? "border-gold/30 bg-gold/5 text-gold" : "border-titanium/20 text-stone"
                    )}>
                      {log.status}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-widest text-stone">Observation</div>
                  <p className="text-sm text-ivory">{log.observation}</p>
                </div>
                <div className="space-y-2 pt-2 border-t border-titanium/10">
                  <div className="text-[10px] uppercase tracking-widest text-stone">Adaptation</div>
                  <p className="text-sm text-gold">{log.adaptation}</p>
                </div>

                {log.status === 'proposed' && !log.is_user_verified && (
                  <div className="pt-4 flex items-center justify-between border-t border-titanium/10">
                    <div className="flex items-center gap-2 text-gold/60">
                      <AlertCircle size={14} />
                      <span className="text-[10px] uppercase tracking-widest font-mono">Proposed Cognitive Shift</span>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleAuthorize(log.id)}
                      className="px-4 py-1.5 bg-gold/10 border border-gold/30 text-gold text-[10px] uppercase tracking-[0.2em] hover:bg-gold/20 transition-all"
                    >
                      [AUTHORIZE ADAPTATION]
                    </motion.button>
                  </div>
                )}

                {log.is_user_verified && (
                  <div className="pt-2 flex items-center gap-2 text-teal/60">
                    <Shield size={12} />
                    <span className="text-[9px] uppercase tracking-widest font-mono">User Verified & Isolated</span>
                  </div>
                )}
              </div>
            ))}
            {state.adaptiveEvolution.evolutionLog.length === 0 && (
              <div className="p-8 text-center border border-dashed border-titanium/20 rounded text-stone">
                No adaptive evolution logs recorded yet.
              </div>
            )}
          </div>
        </section>

        {/* Evolution Metrics */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-8 pt-8 border-t border-titanium/10">
          <div className="space-y-2">
            <h3 className="text-[10px] uppercase tracking-widest text-stone font-bold">Growth Velocity</h3>
            <div className="text-3xl font-serif text-gold">High</div>
          </div>
          <div className="space-y-2">
            <h3 className="text-[10px] uppercase tracking-widest text-stone font-bold">Identity Stability</h3>
            <div className="text-3xl font-serif text-ivory">84%</div>
          </div>
          <div className="space-y-2">
            <h3 className="text-[10px] uppercase tracking-widest text-stone font-bold">Loop Break Rate</h3>
            <div className="text-3xl font-serif text-teal">32%</div>
          </div>
          <div className="space-y-2">
            <h3 className="text-[10px] uppercase tracking-widest text-stone font-bold">Strategic Alignment</h3>
            <div className="text-3xl font-serif text-gold">0.91</div>
          </div>
        </section>
      </main>
    </div>
  );
}
