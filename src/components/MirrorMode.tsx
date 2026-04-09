import React from 'react';
import { UserCircle, TrendingUp, Brain, Target, Compass, Sparkles, Eye, Shield } from 'lucide-react';
import { motion } from 'motion/react';

export function MirrorMode() {
  return (
    <div className="p-8 max-w-5xl mx-auto space-y-12">
      <header className="space-y-2">
        <div className="flex items-center gap-3 text-gold">
          <UserCircle size={24} />
          <h2 className="text-2xl font-medium tracking-tight">The Mirror</h2>
        </div>
        <p className="text-stone text-sm tracking-wide">Self-Mastery & Pattern Recognition</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Effectiveness Snapshot */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="glass-panel p-6 space-y-6 md:col-span-2"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-stone flex items-center gap-2">
              <TrendingUp size={14} /> Effectiveness Snapshot
            </h3>
            <span className="text-[10px] text-teal font-bold uppercase tracking-tighter">Peak Performance: Consultative Mode</span>
          </div>
          
          <div className="h-48 flex items-end gap-2 px-2">
            {[40, 65, 45, 90, 70, 85, 60].map((h, i) => (
              <div key={i} className="flex-1 bg-titanium/30 relative group">
                <motion.div 
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={{ duration: 1.5, delay: i * 0.1 }}
                  className="absolute bottom-0 left-0 right-0 bg-gold/40 group-hover:bg-gold/60 transition-all"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[9px] text-stone uppercase tracking-widest px-2">
            <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
          </div>
        </motion.div>

        {/* Self-Observation Prompts */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="glass-panel p-6 space-y-6"
        >
          <h3 className="text-xs font-bold uppercase tracking-widest text-amber flex items-center gap-2">
            <Brain size={14} /> Pattern Laboratory
          </h3>
          <div className="space-y-4">
            <div className="p-3 bg-amber/5 border border-amber/20 rounded">
              <p className="text-xs text-ivory/80 italic leading-relaxed">
                "I noticed I was more effective when I opened with empathy before moving into technical depth."
              </p>
              <p className="text-[9px] text-stone mt-2 uppercase tracking-tighter">Logged 3h ago</p>
            </div>
            <div className="p-3 bg-titanium/20 border border-titanium/50 rounded">
              <p className="text-xs text-ivory/80 italic leading-relaxed">
                "I compress complexity best when I use contrast framing instead of feature listing."
              </p>
              <p className="text-[9px] text-stone mt-2 uppercase tracking-tighter">Logged Yesterday</p>
            </div>
          </div>
        </motion.div>

        {/* Growth Curves */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="glass-panel p-6 space-y-4"
        >
          <h3 className="text-xs font-bold uppercase tracking-widest text-stone flex items-center gap-2">
            <Target size={14} /> Authority Growth
          </h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] text-stone uppercase">
                <span>Technical Credibility</span>
                <span className="text-gold">88%</span>
              </div>
              <div className="h-1 bg-titanium rounded-full overflow-hidden">
                <div className="h-full bg-gold w-[88%]" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] text-stone uppercase">
                <span>Strategic Influence</span>
                <span className="text-gold">64%</span>
              </div>
              <div className="h-1 bg-titanium rounded-full overflow-hidden">
                <div className="h-full bg-gold w-[64%]" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Intuition Log */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="glass-panel p-6 space-y-4 md:col-span-2"
        >
          <h3 className="text-xs font-bold uppercase tracking-widest text-teal flex items-center gap-2">
            <Compass size={14} /> Intuition Alignment
          </h3>
          <p className="text-sm text-stone leading-relaxed">
            "I was correct about the shift in store respect three weeks before explicit confirmation. Pattern: Senior staff no longer frame involvement as optional support."
          </p>
          <div className="pt-2 flex items-center gap-2">
            <span className="text-[9px] px-2 py-0.5 bg-teal/20 text-teal rounded uppercase font-bold tracking-widest">Verified Outcome</span>
          </div>
        </motion.div>

        {/* Taste Engine */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="glass-panel p-8 space-y-8 md:col-span-3 border-gold/20 bg-gold/5"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gold flex items-center gap-2">
              <Sparkles size={14} /> Rare Taste Architecture
            </h3>
            <span className="text-[10px] text-stone uppercase tracking-widest">Refinement Vector: Elegance & Precision</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-6">
              <h4 className="instrument-label text-stone">Aesthetic & Intellectual Resonance</h4>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-titanium/5 border border-titanium/10 rounded group hover:border-gold/30 transition-all">
                  <div className="flex items-center gap-3">
                    <Eye size={14} className="text-gold" />
                    <span className="text-sm text-ivory">Minimalist Restraint</span>
                  </div>
                  <span className="text-[10px] text-gold font-bold">Resonance: 0.92</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-titanium/5 border border-titanium/10 rounded group hover:border-gold/30 transition-all">
                  <div className="flex items-center gap-3">
                    <Shield size={14} className="text-gold" />
                    <span className="text-sm text-ivory">Structural Integrity</span>
                  </div>
                  <span className="text-[10px] text-gold font-bold">Resonance: 0.88</span>
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <h4 className="instrument-label text-stone">Taste Mapping: Vulgar vs Refined</h4>
              <div className="space-y-4">
                <div className="p-4 bg-titanium/5 border border-titanium/10 rounded space-y-2">
                  <p className="text-[10px] text-stone uppercase tracking-widest">Avoid (Vulgar/Cheap)</p>
                  <p className="text-xs text-oxblood italic">"Inflated claims, excessive ornamentation, commodity phrasing, performative complexity."</p>
                </div>
                <div className="p-4 bg-titanium/5 border border-titanium/10 rounded space-y-2">
                  <p className="text-[10px] text-stone uppercase tracking-widest">Seek (Refined/Timeless)</p>
                  <p className="text-xs text-teal italic">"Understated authority, structural clarity, calibrated silence, instrument-grade precision."</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
