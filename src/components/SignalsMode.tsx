import React from 'react';
import { Radio, Activity, TrendingUp, Users, MessageSquare, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { MOCK_SIGNALS } from '../constants';
import { cn } from '../lib/utils';

export function SignalsMode() {
  const softSignals = MOCK_SIGNALS.filter(s => s.type === 'soft');
  const hardSignals = MOCK_SIGNALS.filter(s => s.type === 'hard');

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-12">
      <header className="space-y-2">
        <div className="flex items-center gap-3 text-gold">
          <Radio size={24} />
          <h2 className="text-2xl font-medium tracking-tight">Signal Engine</h2>
        </div>
        <p className="text-stone text-sm tracking-wide">Interpreting Hard & Soft Intelligence Patterns</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Soft Signals Module */}
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-titanium pb-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-ivory flex items-center gap-2">
              <Users size={14} className="text-amber" /> Soft Signals
            </h3>
            <span className="text-[9px] text-stone uppercase tracking-widest">Psychology & Dynamics</span>
          </div>

          <div className="space-y-4">
            {softSignals.map((signal, i) => (
              <motion.div 
                key={signal.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                className="glass-panel p-5 space-y-4 hover:border-amber/30 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] px-2 py-0.5 bg-amber/10 text-amber rounded uppercase font-bold tracking-tighter border border-amber/20">
                    {signal.category}
                  </span>
                  <span className="text-[9px] text-stone">{new Date(signal.timestamp).toLocaleDateString()}</span>
                </div>
                
                <div className="space-y-2">
                  <p className="text-xs text-stone italic leading-relaxed">"{signal.content}"</p>
                  <div className="p-3 bg-amber/5 border-l-2 border-amber rounded-r-sm">
                    <p className="text-sm text-ivory font-medium leading-relaxed">
                      <Zap size={12} className="inline mr-2 text-amber" />
                      {signal.insight}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-titanium/30">
                  <div className="flex gap-2">
                    {signal.entities.map(e => (
                      <span key={e} className="text-[8px] text-stone uppercase tracking-tighter">#{e}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-16 h-1 bg-titanium rounded-full overflow-hidden">
                      <div className="h-full bg-amber" style={{ width: `${signal.strength * 100}%` }} />
                    </div>
                    <span className="text-[9px] text-amber font-bold">{(signal.strength * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Hard Signals Module */}
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-titanium pb-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-ivory flex items-center gap-2">
              <Activity size={14} className="text-teal" /> Hard Signals
            </h3>
            <span className="text-[9px] text-stone uppercase tracking-widest">Metrics & Engagement</span>
          </div>

          <div className="space-y-4">
            {hardSignals.map((signal, i) => (
              <motion.div 
                key={signal.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                className="glass-panel p-5 space-y-4 hover:border-teal/30 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] px-2 py-0.5 bg-teal/10 text-teal rounded uppercase font-bold tracking-tighter border border-teal/20">
                    {signal.category}
                  </span>
                  <span className="text-[9px] text-stone">{new Date(signal.timestamp).toLocaleDateString()}</span>
                </div>
                
                <div className="space-y-2">
                  <p className="text-xs text-stone leading-relaxed">{signal.content}</p>
                  <div className="p-3 bg-teal/5 border-l-2 border-teal rounded-r-sm">
                    <p className="text-sm text-ivory font-medium leading-relaxed">
                      <TrendingUp size={12} className="inline mr-2 text-teal" />
                      {signal.insight}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-titanium/30">
                  <div className="flex gap-2">
                    {signal.entities.map(e => (
                      <span key={e} className="text-[8px] text-stone uppercase tracking-tighter">#{e}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-16 h-1 bg-titanium rounded-full overflow-hidden">
                      <div className="h-full bg-teal" style={{ width: `${signal.strength * 100}%` }} />
                    </div>
                    <span className="text-[9px] text-teal font-bold">{(signal.strength * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
