import React from 'react';
import { motion } from 'motion/react';
import { AppState } from '../types';
import { ShieldAlert, Activity, Zap, AlertTriangle, ArrowRight, Info, Layers, Target, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';

interface RedTeamViewProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export const RedTeamView: React.FC<RedTeamViewProps> = ({ state, setState }) => {
  return (
    <div className="p-16 space-y-16 max-w-6xl mx-auto h-full overflow-y-auto custom-scrollbar">
      <div className="space-y-6 border-b border-oxblood/10 pb-12">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 text-oxblood"
        >
          <ShieldAlert size={32} className="animate-pulse" />
          <h2 className="text-5xl font-serif text-ivory tracking-tight">Red Team Mode</h2>
        </motion.div>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-stone font-sans opacity-60 max-w-2xl text-lg leading-relaxed font-light italic"
        >
          Adversarial cognitive stress-testing. Identifying blind spots, challenging assumptions, and simulating counter-arguments to ensure epistemic resilience and systemic integrity.
        </motion.p>
      </div>

      <div className="grid grid-cols-1 gap-16 pb-24">
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel p-12 space-y-12 border-oxblood/20 bg-oxblood/5 relative overflow-hidden group hover:border-oxblood/40 transition-all duration-700 shadow-2xl"
        >
          {/* Atmospheric Background */}
          <div className="absolute top-0 right-0 p-12 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-700 pointer-events-none">
            <ShieldAlert size={120} className="text-oxblood" />
          </div>

          <div className="flex items-center gap-4 text-oxblood">
            <Activity size={24} />
            <span className="text-[10px] uppercase tracking-[0.5em] font-bold">Active Stress Test: Project Atlas Architecture</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              { 
                title: 'Over-reliance', 
                description: 'The system may create a "cognitive echo chamber" where inferred patterns reinforce existing biases rather than challenging them.', 
                severity: 75 
              },
              { 
                title: 'Epistemic Drift', 
                description: 'Synthesis velocity may outpace verification rigor, leading to a gradual accumulation of "inference-as-fact".', 
                severity: 45 
              },
              { 
                title: 'Complexity Collapse', 
                description: 'The sheer number of relationships may lead to a loss of signal, where everything appears connected but nothing is prioritized.', 
                severity: 60 
              }
            ].map((v, i) => (
              <motion.div 
                key={v.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="space-y-6 p-8 bg-oxblood/5 rounded-sm border border-oxblood/10 hover:border-oxblood/30 transition-all duration-500 group/vulnerability"
              >
                <div className="flex justify-between items-center">
                  <h4 className="text-[10px] font-mono text-stone uppercase tracking-[0.3em] font-bold opacity-60">Vulnerability: {v.title}</h4>
                  <span className="text-[10px] text-oxblood font-bold tracking-widest">{v.severity}%</span>
                </div>
                <p className="text-sm text-ivory/80 font-serif italic leading-relaxed">{v.description}</p>
                <div className="h-[1px] bg-oxblood/10 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${v.severity}%` }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className="h-full bg-oxblood shadow-[0_0_10px_rgba(153,27,27,0.4)]" 
                  />
                </div>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-12 border-t border-oxblood/10">
            <div className="space-y-6">
              <h4 className="text-[10px] text-stone uppercase tracking-[0.3em] flex items-center gap-3 font-bold opacity-60">
                <Target size={14} className="text-oxblood" /> Attack Vectors
              </h4>
              <ul className="space-y-4">
                {[
                  'Inference injection via biased input streams',
                  'Pattern exhaustion through noise saturation',
                  'Doctrine subversion via semantic drift'
                ].map((av, i) => (
                  <li key={i} className="text-xs text-stone/80 flex items-center gap-3 group/item">
                    <div className="w-1 h-1 rounded-full bg-oxblood/20 group-hover/item:bg-oxblood transition-all" />
                    <span className="font-serif italic">{av}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-6">
              <h4 className="text-[10px] text-stone uppercase tracking-[0.3em] flex items-center gap-3 font-bold opacity-60">
                <ShieldCheck size={14} className="text-teal" /> Counter-Measures
              </h4>
              <ul className="space-y-4">
                {[
                  'Cross-validation with adversarial models',
                  'Strict entropy checks on synthesis layers',
                  'Manual doctrine ratification protocols'
                ].map((cm, i) => (
                  <li key={i} className="text-xs text-stone/80 flex items-center gap-3 group/item">
                    <div className="w-1 h-1 rounded-full bg-teal/20 group-hover/item:bg-teal transition-all" />
                    <span className="font-serif italic">{cm}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <motion.button 
            whileHover={{ scale: 1.02, backgroundColor: '#991B1B', color: '#FFFFFF' }}
            whileTap={{ scale: 0.98 }}
            className="w-full py-5 border border-oxblood/30 bg-oxblood/10 text-oxblood hover:bg-oxblood text-[10px] font-mono uppercase tracking-[0.5em] font-bold transition-all duration-700 shadow-xl"
          >
            Execute Full Adversarial Audit
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
};
