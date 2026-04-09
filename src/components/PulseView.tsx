// Atlas-Audit: [XI] Replaced fictional “market intel” demo with AppState-driven pulse items, doctrine hook, and honest empty states. More inspectable: data path matches `state.pulse` and user doctrine. Unresolved: no automated pulse generation service yet; sidebar metrics are still derived, not persisted metrics.
import React, { useMemo } from 'react';
import { Sparkles, Target, Shield, ArrowRight, Clock, AlertCircle, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import type { AppState, PulseItem } from '../types';

function pulseTypeIcon(type: PulseItem['type']) {
  switch (type) {
    case 'ripening':
      return <Clock size={12} />;
    case 'neglected':
      return <AlertCircle size={12} />;
    case 'attention':
      return <Target size={12} />;
    case 'pattern':
      return <TrendingUp size={12} />;
    default:
      return <Sparkles size={12} />;
  }
}

export function PulseView({ state }: { state: AppState }) {
  const items = useMemo(
    () => [...state.pulse.items].sort((a, b) => a.priority - b.priority),
    [state.pulse.items]
  );
  const primaryDoctrine = state.userModel?.doctrine?.[0];

  return (
    <div className="h-full flex flex-col bg-obsidian overflow-y-auto no-scrollbar">
      <header className="p-12 border-b border-titanium/20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gold/5 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-3 text-gold">
            <Sparkles size={24} />
            <span className="text-[10px] uppercase tracking-[0.3em] font-bold">Intelligence Pulse</span>
          </div>
          <h1 className="text-4xl font-serif italic text-ivory max-w-2xl">
            Orientation from your Atlas state
          </h1>
          <p className="text-stone text-sm max-w-xl leading-relaxed">
            This surface renders <span className="text-ivory/80">live pulse items</span> from application state—not placeholder corporate narratives. Items can be enriched by a future pulse service; today they reflect seeded and user-driven updates only.
          </p>
          <p className="text-[10px] font-mono text-stone/50 uppercase tracking-widest">
            Last pulse update: {new Date(state.pulse.lastUpdate).toLocaleString()}
          </p>
        </div>
      </header>

      <div className="p-12 grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-12">
          <section className="space-y-6">
            <div className="flex items-center justify-between border-b border-titanium/20 pb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-ivory flex items-center gap-2">
                <Target size={14} className="text-gold" /> Pulse items
              </h2>
              <span className="text-[10px] text-stone uppercase tabular-nums">{items.length} active</span>
            </div>

            {items.length === 0 ? (
              <div className="glass-panel p-10 border-titanium/20 text-center space-y-4">
                <p className="text-sm text-stone leading-relaxed">
                  No pulse items yet. Use <span className="text-ivory">Home</span> inquiries, directives, and journal work to
                  populate context—upstream automation can append items here when wired.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {items.map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="glass-panel p-8 space-y-6 border-gold/10 group hover:border-gold/30 transition-all"
                  >
                    <div className="flex justify-between items-center">
                      <span className="instrument-label text-gold uppercase tracking-[0.2em] flex items-center gap-2">
                        {pulseTypeIcon(item.type)}
                        {item.type}
                      </span>
                      <span className="text-[10px] text-stone opacity-40">
                        {new Date(item.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-lg font-serif text-ivory italic leading-relaxed opacity-90 group-hover:text-gold transition-colors">
                      &ldquo;{item.content}&rdquo;
                    </p>
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-stone">
                      <span>Priority {item.priority}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-6">
            <div className="flex items-center justify-between border-b border-titanium/20 pb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-ivory flex items-center gap-2">
                <Shield size={14} className="text-gold" /> Doctrine anchor
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 border border-gold/10 bg-gold/5 rounded space-y-4">
                <span className="text-[10px] text-gold uppercase tracking-widest font-bold">Primary principle</span>
                {primaryDoctrine ? (
                  <>
                    <p className="text-sm font-serif text-ivory leading-relaxed">{primaryDoctrine.title}</p>
                    <p className="text-xs text-stone leading-relaxed">{primaryDoctrine.content}</p>
                  </>
                ) : (
                  <p className="text-xs text-stone leading-relaxed">
                    No doctrine entries in your model yet. Open <span className="text-ivory">Doctrine</span> to define
                    non-negotiables.
                  </p>
                )}
                <div className="pt-2 flex items-center gap-2 text-stone hover:text-gold cursor-pointer transition-colors">
                  <span className="text-[10px] uppercase tracking-widest">Ground decisions against this</span>
                  <ArrowRight size={12} />
                </div>
              </div>
              <div className="p-6 border border-titanium/20 bg-titanium/5 rounded space-y-4">
                <span className="text-[10px] text-stone uppercase tracking-widest font-bold">Operational note</span>
                <p className="text-xs text-stone leading-relaxed">
                  Directives in state: <span className="text-ivory tabular-nums">{state.directives.filter((d) => d.isActive).length}</span>{' '}
                  active of <span className="text-ivory tabular-nums">{state.directives.length}</span>. Journal entries:{' '}
                  <span className="text-ivory tabular-nums">{state.journal.length}</span>.
                </p>
                <p className="text-[10px] text-stone/60 leading-relaxed">
                  These counts are real slices of AppState—use them as integrity checks until dedicated analytics land.
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-12">
          <section className="space-y-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-stone">Resonance posture</h2>
            <div className="space-y-4 text-xs text-stone leading-relaxed">
              <div className="p-4 border border-titanium/15 rounded-sm space-y-2">
                <span className="text-[10px] uppercase tracking-widest text-gold">Compute</span>
                <p>{state.cognitiveLoad.computePosture}</p>
              </div>
              <div className="p-4 border border-titanium/15 rounded-sm space-y-2">
                <span className="text-[10px] uppercase tracking-widest text-gold">UI</span>
                <p>{state.cognitiveLoad.uiPosture}</p>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-stone">Global intelligence tags</h2>
            <div className="flex flex-wrap gap-2">
              {state.globalIntelligence.trendingTopics.map((t) => (
                <span
                  key={t}
                  className={cn(
                    'text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-titanium/20 text-stone'
                  )}
                >
                  {t}
                </span>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
