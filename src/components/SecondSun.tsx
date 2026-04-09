import React, { useState } from 'react';
import { Sun, Sparkles, Eye, Brain, Activity, Compass, Flame, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function SecondSun() {
  const [isIntegrated, setIsIntegrated] = useState(false);

  return (
    <div className="h-full flex flex-col bg-obsidian overflow-y-auto custom-scrollbar relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(176,138,67,0.15),transparent_70%)] pointer-events-none" />
      
      <header className="p-12 border-b border-gold/20 relative overflow-hidden flex flex-col items-center text-center justify-center min-h-[40vh]">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 120, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 opacity-20 flex items-center justify-center"
        >
          <Sun size={400} className="text-gold blur-3xl" />
        </motion.div>
        
        <div className="relative z-10 space-y-6">
          <div className="flex items-center justify-center gap-4 text-gold mb-4">
            <Sun size={48} strokeWidth={1} className="animate-pulse-subtle" />
          </div>
          <h2 className="text-6xl font-serif tracking-tight text-ivory">The Second Sun</h2>
          <p className="text-gold font-mono uppercase tracking-[0.4em] text-xs">Total Illumination Event</p>
          <p className="editorial-body text-stone max-w-2xl mx-auto text-lg">
            A rare, high-order synthesis revealing the hidden center governing your seemingly unrelated interests, contradictions, and ambitions.
          </p>
        </div>
      </header>

      <div className="p-12 max-w-4xl mx-auto w-full space-y-16 relative z-10">
        <section className="space-y-8">
          <div className="glass-panel p-12 border-gold/30 bg-gold/5 space-y-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-gold shadow-[0_0_20px_rgba(176,138,67,0.8)]" />
            
            <div className="space-y-4">
              <h3 className="instrument-label text-gold flex items-center gap-3">
                <Compass size={16} />
                The Gravitational Center
              </h3>
              <p className="text-2xl font-serif text-ivory leading-relaxed">
                Your recent inquiries across philosophy, system design, and personal discipline are not separate pursuits. They are all orbiting a single, unarticulated demand: <span className="text-gold">The desire to build structures that survive your own weaknesses.</span>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-gold/10">
              <div className="space-y-4">
                <h4 className="text-[10px] uppercase tracking-widest text-stone font-bold">What Has Become Undeniable</h4>
                <ul className="space-y-3">
                  <li className="flex gap-3 text-sm text-ivory/80">
                    <Sparkles size={14} className="text-gold shrink-0 mt-0.5" />
                    You cannot out-think a lack of structural discipline.
                  </li>
                  <li className="flex gap-3 text-sm text-ivory/80">
                    <Sparkles size={14} className="text-gold shrink-0 mt-0.5" />
                    Your aesthetic refinement is occasionally masking strategic avoidance.
                  </li>
                </ul>
              </div>
              <div className="space-y-4">
                <h4 className="text-[10px] uppercase tracking-widest text-stone font-bold">The Next Evolutionary Threshold</h4>
                <ul className="space-y-3">
                  <li className="flex gap-3 text-sm text-ivory/80">
                    <Flame size={14} className="text-oxblood shrink-0 mt-0.5" />
                    Moving from understanding complexity to enforcing simplicity.
                  </li>
                  <li className="flex gap-3 text-sm text-ivory/80">
                    <Flame size={14} className="text-oxblood shrink-0 mt-0.5" />
                    Metabolizing your recent failure into a permanent architectural law.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <div className="flex justify-center h-16">
          <AnimatePresence mode="wait">
            {!isIntegrated ? (
              <motion.button 
                key="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={() => setIsIntegrated(true)}
                className="px-12 py-4 bg-gold text-obsidian font-bold uppercase tracking-[0.3em] text-xs hover:bg-ivory transition-all shadow-[0_0_30px_rgba(176,138,67,0.3)]"
              >
                Acknowledge & Integrate
              </motion.button>
            ) : (
              <motion.div 
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-3 text-gold"
              >
                <CheckCircle2 size={24} />
                <span className="font-mono uppercase tracking-widest text-sm">Integration Complete</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
