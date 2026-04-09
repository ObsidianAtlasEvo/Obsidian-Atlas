import React from 'react';
import { motion } from 'motion/react';
import { AppState, Scenario } from '../types';
import { GitBranch, Target, Zap, AlertTriangle, ArrowUpRight, Info, Layers } from 'lucide-react';
import { cn } from '../lib/utils';

interface ScenariosViewProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export const ScenariosView: React.FC<ScenariosViewProps> = ({ state, setState }) => {
  return (
    <div className="p-4 md:p-16 space-y-8 md:space-y-16 max-w-6xl mx-auto h-full overflow-y-auto custom-scrollbar">
      <div className="space-y-6 border-b border-titanium/5 pb-8 md:pb-12">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 text-gold"
        >
          <GitBranch size={32} className="shrink-0" />
          <h2 className="text-3xl md:text-5xl font-serif text-ivory tracking-tight">Scenario Modeling</h2>
        </motion.div>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-stone font-sans opacity-60 max-w-2xl text-base md:text-lg leading-relaxed font-light italic"
        >
          Simulating plausible futures and failure paths. Distinguishing between grounded inference and speculation to identify strategic leverage points and systemic vulnerabilities.
        </motion.p>
      </div>

      <div className="grid grid-cols-1 gap-16 pb-24">
        {state.scenarios.map((scen, idx) => (
          <motion.div 
            key={scen.id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.1 }}
            className="glass-panel p-6 md:p-12 space-y-8 md:space-y-12 border-titanium/10 relative overflow-hidden group hover:border-gold/20 transition-all duration-700 shadow-2xl"
          >
            {/* Header */}
            <div className="space-y-4">
              <span className="text-[9px] text-gold uppercase tracking-[0.5em] font-bold block">Simulation Model #{scen.id}</span>
              <h3 className="text-2xl md:text-4xl font-serif text-ivory group-hover:text-gold transition-colors duration-500">{scen.title}</h3>
            </div>

            {/* Branches Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-16">
              {scen.branches.map((b, bIdx) => (
                <motion.div 
                  key={b.id}
                  whileHover={{ y: -5 }}
                  className="space-y-6 md:space-y-10 p-6 md:p-10 bg-titanium/5 rounded-sm border border-titanium/10 hover:border-gold/30 transition-all duration-500 relative group/branch"
                >
                  <div className="flex justify-between items-end border-b border-titanium/10 pb-4 md:pb-6">
                    <h4 className="text-xl md:text-2xl font-serif text-ivory tracking-wide max-w-[70%]">{b.description}</h4>
                    <div className="flex flex-col items-end">
                      <span className="text-[9px] text-stone uppercase tracking-widest opacity-40 mb-2">Probability</span>
                      <span className="text-2xl md:text-4xl font-serif text-gold">{(b.probability * 100).toFixed(0)}%</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 md:gap-10">
                    <div className="space-y-6">
                      <span className="text-[9px] uppercase tracking-[0.3em] text-stone font-bold opacity-40 flex items-center gap-2">
                        <Target size={12} className="text-teal" /> Leverage Points
                      </span>
                      <div className="flex flex-wrap gap-3">
                        {b.leveragePoints.map((lp, i) => (
                          <span key={i} className="text-[9px] px-3 py-1.5 bg-teal/5 text-teal/80 rounded-sm border border-teal/20 uppercase tracking-widest font-bold">
                            {lp}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-6">
                      <span className="text-[9px] uppercase tracking-[0.3em] text-stone font-bold opacity-40 flex items-center gap-2">
                        <AlertTriangle size={12} className="text-oxblood" /> Failure Paths
                      </span>
                      <div className="flex flex-wrap gap-3">
                        {b.failurePaths.map((fp, i) => (
                          <span key={i} className="text-[9px] px-3 py-1.5 bg-oxblood/5 text-oxblood/80 rounded-sm border border-oxblood/20 uppercase tracking-widest font-bold">
                            {fp}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-6">
                      <span className="text-[9px] uppercase tracking-[0.3em] text-stone font-bold opacity-40 flex items-center gap-2">
                        <Zap size={12} className="text-gold" /> Strategic Pivots
                      </span>
                      <div className="flex flex-wrap gap-3">
                        {b.strategicPivots.map((sp, i) => (
                          <span key={i} className="text-[9px] px-3 py-1.5 bg-gold/5 text-gold/80 rounded-sm border border-gold/20 uppercase tracking-widest font-bold">
                            {sp}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Footer Metadata */}
            <div className="pt-10 border-t border-titanium/10 grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-4">
                <span className="text-[9px] uppercase tracking-[0.3em] text-stone font-bold opacity-40 flex items-center gap-2">
                  <Layers size={14} className="text-gold" /> Grounded Inference
                </span>
                <ul className="space-y-3">
                  {scen.groundedInference.map((gi, i) => (
                    <li key={i} className="text-xs text-stone/80 flex items-center gap-3 group/item">
                      <div className="w-1 h-1 rounded-full bg-gold/20 group-hover/item:bg-gold transition-all" />
                      <span className="font-serif italic">{gi}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-4">
                <span className="text-[9px] uppercase tracking-[0.3em] text-stone font-bold opacity-40 flex items-center gap-2">
                  <ArrowUpRight size={14} className="text-gold" /> Speculative Horizon
                </span>
                <ul className="space-y-3">
                  {scen.speculation.map((s, i) => (
                    <li key={i} className="text-xs text-stone/80 flex items-center gap-3 group/item">
                      <div className="w-1 h-1 rounded-full bg-gold/20 group-hover/item:bg-gold transition-all" />
                      <span className="font-serif italic">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
