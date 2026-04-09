// Atlas-Audit: [EXEC-MODE] Verified — Return to Full Atlas uses coerceActiveMode('atlas', prev.activeMode).
import React from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, Target, Zap, ArrowRight, Info, CheckCircle2 } from 'lucide-react';
import { coerceActiveMode } from '../lib/atlasWayfinding';
import { AppState } from '../types';

interface EssentialModeProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function EssentialMode({ state, setState }: EssentialModeProps) {
  const { essentialMode } = state;

  return (
    <div className="p-12 space-y-12 max-w-4xl mx-auto h-full flex flex-col justify-center items-center text-center">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="space-y-8"
      >
        <div className="flex flex-col items-center gap-6">
          <div className="p-4 bg-oxblood/10 rounded-full border border-oxblood/20">
            <ShieldAlert className="w-12 h-12 text-oxblood animate-pulse" />
          </div>
          <div className="space-y-2">
            <h2 className="text-6xl font-serif text-ivory tracking-tight">Only What Is Essential</h2>
            <p className="text-oxblood font-sans opacity-60 tracking-widest uppercase text-[12px] font-bold">
              Austere Mode Active • Eliminate All Cognitive Noise
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 mt-12">
          <div className="glass-panel p-12 border-gold/20 bg-gold/5 space-y-6 text-left">
            <div className="flex items-center gap-3 text-gold">
              <Target className="w-6 h-6" />
              <h3 className="instrument-label uppercase tracking-widest text-sm">The Central Truth</h3>
            </div>
            <p className="text-3xl font-serif text-ivory italic leading-tight">
              "The current strategic pivot is not about code; it is about the future of individual sovereignty."
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="glass-panel p-8 border-titanium/20 bg-titanium/5 space-y-4 text-left">
              <h4 className="text-[10px] text-stone uppercase tracking-widest">Decisive Variable</h4>
              <p className="text-lg font-serif text-ivory">Open Source adoption velocity vs. control.</p>
            </div>
            <div className="glass-panel p-8 border-titanium/20 bg-titanium/5 space-y-4 text-left">
              <h4 className="text-[10px] text-stone uppercase tracking-widest">Strongest Tension</h4>
              <p className="text-lg font-serif text-ivory">Privacy vs. Network Effects.</p>
            </div>
          </div>

          <div className="glass-panel p-10 border-gold/20 bg-gold/10 space-y-6 text-left">
            <div className="flex items-center gap-3 text-gold">
              <Zap className="w-6 h-6" />
              <h3 className="instrument-label uppercase tracking-widest text-sm">High-Leverage Next Move</h3>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-2xl font-serif text-ivory">Execute final tradeoff analysis for Q2 roadmap.</p>
              <button className="p-4 bg-gold text-obsidian rounded-full hover:bg-ivory transition-all">
                <ArrowRight className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        <div className="pt-12">
          <button 
            onClick={() =>
              setState((prev) => ({
                ...prev,
                activeMode: coerceActiveMode('atlas', prev.activeMode),
              }))
            }
            className="text-[10px] text-stone uppercase tracking-widest hover:text-ivory transition-all flex items-center gap-2 mx-auto"
          >
            <ArrowRight className="w-3 h-3 rotate-180" />
            Return to Full Atlas
          </button>
        </div>
      </motion.div>
    </div>
  );
}
