// Atlas-Audit: [EXEC-MODE] Verified — Substrate grid + doctrine CTA navigate via coerceActiveMode(..., prev.activeMode).
import React from 'react';
import {
  Clock,
  Link2,
  Filter,
  Brain,
  Activity,
  ShieldAlert,
  ChevronRight,
  Heart,
  Compass,
  Radar,
  Scale,
  Target,
  Orbit,
} from 'lucide-react';
import { motion } from 'motion/react';
import { AppState } from '../types';
import { coerceActiveMode } from '../lib/atlasWayfinding';
import { cn } from '../lib/utils';
import { ResonanceInsightCard } from '../resonance/ui/ResonanceInsightCard';
import { ThemeEvolutionView } from '../resonance/ui/ThemeEvolutionView';
import { ResonanceThread } from '../resonance/types';

interface IntelligenceRailProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function IntelligenceRail({ state, setState }: IntelligenceRailProps) {
  const { userModel } = state;
  const { thoughtStructure } = userModel;

  const pulseAttention = state.pulse.items.filter((i) => i.type === 'attention').slice(0, 3);
  const pulseRipening = state.pulse.items.filter((i) => i.type === 'ripening').slice(0, 2);
  const pendingDecisions = state.decisions.filter((d) => d.status === 'pending').slice(0, 3);
  const constitutionTension = state.constitution.tensions[0];
  const primaryValue = state.constitution.values[0];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.04,
        delayChildren: 0.08,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: 12 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const } },
  };

  return (
    <motion.aside 
      initial={{ y: 4, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="w-80 h-[100dvh] bg-obsidian border-l border-stone-800 flex flex-col overflow-hidden relative z-20 shadow-[-20px_0_40px_rgba(0,0,0,0.4)]"
    >
      <div className="p-8 border-b border-purple-500/15 h-24 flex items-center justify-between bg-[#0f0a1e]/40 backdrop-blur-sm">
        <div className="flex flex-col gap-1">
          <span className="text-[9px] uppercase tracking-[0.4em] text-gold-500 font-bold">Context rail</span>
          <span className="text-[8px] uppercase tracking-[0.2em] text-stone opacity-40 font-mono">Resonance · not the substrate</span>
        </div>
        <div className="flex gap-3">
          <motion.button 
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            className="p-2 bg-[#1a103c]/20 border border-purple-500/20 rounded-sm text-stone hover:text-gold-500 hover:border-gold-500/30 transition-all duration-500"
          >
            <Filter size={12} />
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-2 bg-gold-500/10 border border-gold-500/20 rounded-sm text-gold-500 hover:bg-gold-500/20 transition-all duration-500"
          >
            <Brain size={12} />
          </motion.button>
        </div>
      </div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-12 no-scrollbar"
      >
        {/* Cognitive Signature */}
        <motion.section variants={itemVariants} className="glass-obsidian p-8 border-purple-500/15 relative overflow-hidden group hover:border-gold-500/30 hover:ring-1 hover:ring-gold-500/10 hover:shadow-[0_0_15px_rgba(212,175,55,0.03)] transition-all duration-1000">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity duration-1000">
            <Brain size={48} className="text-gold-500" />
          </div>
          <h3 className="text-[9px] uppercase tracking-[0.4em] text-gold-500 mb-8 flex items-center gap-3 font-bold">
            <Activity size={14} className="opacity-50" /> Cognitive signature
          </h3>
          <div className="space-y-6">
            <div className="flex justify-between items-end">
              <span className="text-[9px] uppercase tracking-[0.2em] text-stone font-bold">Thinking Style</span>
              <span className="text-[11px] font-serif text-ivory italic opacity-80">{thoughtStructure.thinkingStyle}</span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <span className="text-[9px] uppercase tracking-[0.2em] text-stone font-bold">Altitude</span>
                <span className="text-[10px] font-mono text-gold-500">{(thoughtStructure.intellectualAltitude * 100).toFixed(0)}%</span>
              </div>
              <div className="w-full h-[1px] bg-purple-500/20 relative overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${thoughtStructure.intellectualAltitude * 100}%` }}
                  transition={{ duration: 2, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}
                  className="absolute inset-y-0 left-0 bg-gold-500 shadow-[0_0_12px_rgba(212,175,55,0.4)]" 
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {thoughtStructure.strengths.map(s => (
                <span key={s} className="text-[8px] px-2 py-0.5 bg-gold-500/5 text-gold-500/60 rounded-sm border border-gold-500/10 uppercase tracking-widest hover:bg-gold-500/10 transition-colors cursor-default">{s}</span>
              ))}
            </div>
          </div>
        </motion.section>

        {/* Resonance Intelligence */}
        <motion.section variants={itemVariants} className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[9px] uppercase tracking-[0.4em] text-gold-500 font-bold flex items-center gap-3">
              <Heart size={14} className="text-purple-400/60" /> Resonance
            </h3>
            <span className="text-[8px] text-stone opacity-40 font-mono">Significance Engine</span>
          </div>

          {state.resonance.threads.length > 0 ? (
            <div className="space-y-4">
              {state.resonance.threads.slice(0, 2).map((thread: ResonanceThread) => (
                <ResonanceInsightCard 
                  key={thread.threadId} 
                  thread={thread}
                  className="glass-obsidian border-purple-500/15 hover:border-gold-500/30 hover:ring-1 hover:ring-gold-500/10 hover:shadow-[0_0_15px_rgba(212,175,55,0.03)] transition-all duration-300"
                  onUpdate={(id, updates) => {
                    setState(prev => ({
                      ...prev,
                      resonance: {
                        ...prev.resonance,
                        threads: prev.resonance.threads.map(t => t.threadId === id ? { ...t, ...updates } : t)
                      }
                    }));
                  }}
                />
              ))}
              
              <div className="pt-4 border-t border-purple-500/15">
                <ThemeEvolutionView 
                  threads={state.resonance.threads}
                  className="opacity-80"
                />
              </div>
            </div>
          ) : (
            <div className="p-8 rounded-xl border border-purple-500/15 bg-[#1a103c]/20 flex flex-col items-center justify-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Activity size={20} className="text-stone opacity-20" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-stone opacity-60 uppercase tracking-widest">Awaiting Resonance</p>
                <p className="text-[9px] text-stone opacity-40 leading-relaxed">
                  Atlas is monitoring for patterns of significance across your inquiries.
                </p>
              </div>
            </div>
          )}
        </motion.section>

        {/* Attention signals (app state — not fabricated) */}
        <motion.section variants={itemVariants} className="space-y-4">
          <h3 className="text-[9px] uppercase tracking-[0.4em] text-stone flex items-center gap-3 font-bold">
            <ShieldAlert size={14} className="text-gold-500 opacity-50" /> Pulse · attention
          </h3>
          {pulseAttention.length > 0 ? (
            <div className="space-y-2">
              {pulseAttention.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[var(--atlas-surface-panel)]/60"
                >
                  <p className="text-[11px] text-ivory/80 leading-relaxed">{item.content}</p>
                  <span className="text-[8px] text-stone/45 font-mono mt-2 block">{item.timestamp}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-subtle)] text-[10px] text-stone/55 leading-relaxed">
              No high-stakes pulse items in app state. For SQLite-backed tensions and friction, use the substrate links
              below (Friction map, Truth chamber).
            </div>
          )}
        </motion.section>

        {/* Pending decisions & ripening (real local state) */}
        <motion.section variants={itemVariants} className="space-y-4">
          <h3 className="text-[9px] uppercase tracking-[0.4em] text-stone flex items-center gap-3 font-bold">
            <Clock size={14} className="text-gold-500 opacity-50" /> Decisions & ripening
          </h3>
          {pendingDecisions.length === 0 && pulseRipening.length === 0 ? (
            <p className="text-[10px] text-stone/50 leading-relaxed px-1">
              No pending decisions or ripening items in local state. Open the Decision ledger or Today in Atlas to add
              signal here.
            </p>
          ) : (
            <div className="space-y-2">
              {pendingDecisions.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      activeMode: coerceActiveMode('decisions', prev.activeMode),
                    }))
                  }
                  className="w-full text-left p-4 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] hover:border-[color:var(--border-emphasis)] transition-colors"
                >
                  <span className="text-[10px] uppercase tracking-widest text-gold/50 block mb-1">Decision</span>
                  <span className="text-[11px] text-ivory/85 line-clamp-2">{d.title}</span>
                </button>
              ))}
              {pulseRipening.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-gold-500/[0.04]"
                >
                  <span className="text-[9px] uppercase text-gold/50 block mb-1">Ripening</span>
                  <p className="text-[11px] text-ivory/80 leading-relaxed">{item.content}</p>
                </div>
              ))}
            </div>
          )}
        </motion.section>

        {/* Sovereign substrate (operational navigation) */}
        <motion.section variants={itemVariants} className="space-y-3">
          <h3 className="text-[9px] uppercase tracking-[0.4em] text-stone mb-2 flex items-center gap-3 font-bold">
            <Compass size={14} className="text-teal-400/60" /> Substrate
          </h3>
          <p className="text-[9px] text-stone/50 leading-relaxed px-1 mb-3">
            Inspectable governance lives outside chat. Jump to durable artifacts.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { mode: 'sovereign-atrium' as const, label: 'Atrium', icon: Compass },
                { mode: 'constitution' as const, label: 'Constitution', icon: Scale },
                { mode: 'mind-cartography' as const, label: 'Mind map', icon: Brain },
                { mode: 'trajectory-observatory' as const, label: 'Observatory', icon: Radar },
                { mode: 'decisions' as const, label: 'Decisions', icon: Target },
                { mode: 'friction-cartography' as const, label: 'Friction', icon: Orbit },
              ] as const
            ).map(({ mode, label, icon: Icon }) => (
              <button
                key={mode}
                type="button"
                onClick={() =>
                  setState((prev) => ({
                    ...prev,
                    activeMode: coerceActiveMode(mode, prev.activeMode),
                  }))
                }
                className="flex items-center gap-2 px-3 py-2.5 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[var(--atlas-surface-panel)]/80 text-left text-[10px] text-stone/80 hover:text-ivory hover:border-[color:var(--border-emphasis)] transition-colors duration-[var(--atlas-motion-fast)]"
              >
                <Icon size={12} className="text-gold/50 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </motion.section>

        {/* Doctrine anchor (from personal constitution in app state) */}
        <motion.section variants={itemVariants} className="space-y-3">
          <h3 className="text-[9px] uppercase tracking-[0.4em] text-stone flex items-center gap-3 font-bold">
            <Link2 size={14} className="text-gold-500 opacity-50" /> Doctrine anchor
          </h3>
          {constitutionTension || primaryValue ? (
            <div className="p-5 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[var(--atlas-surface-panel)]/50 space-y-3">
              {primaryValue && (
                <div>
                  <span className="text-[9px] uppercase tracking-widest text-teal-200/60">Value</span>
                  <p className="text-[11px] text-ivory/85 leading-relaxed mt-1">{primaryValue.title}</p>
                </div>
              )}
              {constitutionTension && (
                <div className="pt-2 border-t border-[color:var(--border-subtle)]">
                  <span className="text-[9px] uppercase tracking-widest text-amber-200/50">Active tension</span>
                  <p className="text-[11px] text-stone/75 leading-relaxed mt-1">{constitutionTension.description}</p>
                </div>
              )}
              <button
                type="button"
                onClick={() =>
                  setState((prev) => ({
                    ...prev,
                    activeMode: coerceActiveMode('constitution', prev.activeMode),
                  }))
                }
                className="text-[9px] uppercase tracking-widest text-gold/70 hover:text-gold flex items-center gap-1 mt-2"
              >
                Open constitutional core <ChevronRight size={10} />
              </button>
            </div>
          ) : (
            <p className="text-[10px] text-stone/50 leading-relaxed px-1">
              No constitutional tension or value surfaced in local state. Populate doctrine in Constitution or Local
              doctrine to anchor this rail.
            </p>
          )}
        </motion.section>
      </motion.div>
    </motion.aside>
  );
}
