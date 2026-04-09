import React from 'react';
import { Target, ShieldAlert, Zap, ArrowRight, Trophy, BookOpen, Activity } from 'lucide-react';
import { motion } from 'motion/react';
import { AppState } from '../types';

interface MasteryTheaterProps {
  state: AppState;
}

export function MasteryTheater({ state }: MasteryTheaterProps) {
  return (
    <div className="p-12 space-y-12 max-w-6xl mx-auto">
      <header className="space-y-4">
        <div className="flex items-center gap-3 text-gold">
          <Target size={24} />
          <h2 className="text-4xl font-serif text-ivory tracking-tight">Mastery Arenas</h2>
        </div>
        <p className="text-stone font-sans opacity-60 max-w-2xl leading-relaxed">
          High-stakes environments for pressure-testing knowledge, refining language, and sharpening authority. Proving grounds for what you claim to know.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-panel p-10 border-gold/20 bg-gold/5 space-y-8"
        >
          <div className="flex items-center gap-4 text-gold">
            <Zap size={20} />
            <span className="instrument-label uppercase tracking-widest">Active Arena: Strategic Architecture</span>
          </div>
          <div className="space-y-6">
            <h3 className="text-2xl font-serif text-ivory">The Art of the Pivot</h3>
            <p className="text-sm text-stone opacity-80 leading-relaxed">
              Rehearsing the explanation of the "Great Decoupling" to a skeptical board. Focus on precision, gravity, and the avoidance of technical jargon.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-titanium/20">
              <div className="space-y-2">
                <span className="text-[10px] text-stone uppercase tracking-widest">Pressure Level</span>
                <div className="h-1 bg-gold/20 rounded-full overflow-hidden">
                  <div className="h-full bg-gold w-[85%]" />
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-[10px] text-stone uppercase tracking-widest">Authority Score</span>
                <div className="h-1 bg-teal/20 rounded-full overflow-hidden">
                  <div className="h-full bg-teal w-[72%]" />
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-[10px] text-stone uppercase tracking-widest">Precision Score</span>
                <div className="h-1 bg-oxblood/20 rounded-full overflow-hidden">
                  <div className="h-full bg-oxblood w-[64%]" />
                </div>
              </div>
            </div>
            <button className="w-full py-4 border border-gold/30 bg-gold/10 text-gold hover:bg-gold/20 transition-all text-xs font-mono uppercase tracking-[0.3em]">
              Enter Arena
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-panel p-10 border-titanium/20 space-y-8"
        >
          <div className="flex items-center gap-4 text-stone">
            <Trophy size={20} />
            <span className="instrument-label uppercase tracking-widest">Recent Mastery Achievements</span>
          </div>
          <div className="space-y-6">
            <div className="flex items-start gap-4 p-4 bg-titanium/5 border border-titanium/10 rounded group hover:border-gold/30 transition-all">
              <BookOpen size={16} className="text-gold mt-1" />
              <div className="space-y-1">
                <h4 className="text-sm text-ivory">Epistemic Resilience: Level 4</h4>
                <p className="text-[10px] text-stone opacity-60">Successfully defended the "Sovereign Archive" thesis against 3 adversarial audits.</p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 bg-titanium/5 border border-titanium/10 rounded group hover:border-gold/30 transition-all">
              <Activity size={16} className="text-gold mt-1" />
              <div className="space-y-1">
                <h4 className="text-sm text-ivory">Strategic Precision: Level 3</h4>
                <p className="text-[10px] text-stone opacity-60">Reduced semantic drift in technical documentation by 42% over the last quarter.</p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 bg-titanium/5 border border-titanium/10 rounded group hover:border-gold/30 transition-all">
              <ShieldAlert size={16} className="text-gold mt-1" />
              <div className="space-y-1">
                <h4 className="text-sm text-ivory">Adversarial Awareness: Level 5</h4>
                <p className="text-[10px] text-stone opacity-60">Identified 12 structural failure points in the current platform hegemony model.</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
