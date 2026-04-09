import React from 'react';
import { Zap, MapPin, Users, MessageSquare, Target, ShieldAlert, AlertCircle, Globe, Shield } from 'lucide-react';
import { motion } from 'motion/react';

export function ArenaMode() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-12">
      <header className="space-y-2">
        <div className="flex items-center gap-3 text-gold">
          <Zap size={24} />
          <h2 className="text-2xl font-medium tracking-tight">Arena Briefing</h2>
        </div>
        <p className="text-stone text-sm tracking-wide">Best Buy, Dublin — Field Intelligence</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Key Encounters */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="glass-panel p-6 space-y-4"
        >
          <h3 className="text-xs font-bold uppercase tracking-widest text-stone flex items-center gap-2">
            <Users size={14} /> Likely Encounters
          </h3>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-titanium flex items-center justify-center text-ivory text-xs font-bold">SM</div>
              <div>
                <p className="text-sm text-ivory font-medium">Sarah Miller (GM)</p>
                <p className="text-xs text-stone leading-relaxed mt-1 italic">
                  "Asked last visit for cleaner explanation of MicroRGB vs OLED. Expect follow-up."
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-titanium flex items-center justify-center text-ivory text-xs font-bold">JD</div>
              <div>
                <p className="text-sm text-ivory font-medium">James (Designer)</p>
                <p className="text-xs text-stone leading-relaxed mt-1">
                  Consistently brings you into premium TV closes when customer hesitation appears.
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Opportunities */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="glass-panel p-6 space-y-4"
        >
          <h3 className="text-xs font-bold uppercase tracking-widest text-gold flex items-center gap-2">
            <Target size={14} /> Strategic Opportunities
          </h3>
          <ul className="space-y-3">
            <li className="text-xs text-ivory/80 flex gap-2">
              <span className="text-gold">•</span>
              Reinforce authority by clarifying one technical concept cleanly rather than flooding with specs.
            </li>
            <li className="text-xs text-ivory/80 flex gap-2">
              <span className="text-gold">•</span>
              Develop new employee who responded to simplified contrast explanation into a local advocate.
            </li>
          </ul>
        </motion.div>

        {/* Dynamics */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="glass-panel p-6 space-y-4 md:col-span-2"
        >
          <h3 className="text-xs font-bold uppercase tracking-widest text-teal flex items-center gap-2">
            <ShieldAlert size={14} /> Social Dynamics
          </h3>
          <p className="text-sm text-stone leading-relaxed">
            Sony-heavy bias still appears strongest in older HT staff, but two recent signals suggest openness when framed through anti-reflection and near-black detail.
          </p>
          <div className="flex gap-4 pt-2">
            <div className="px-3 py-1.5 bg-titanium/30 border border-titanium rounded text-[10px] uppercase tracking-widest text-ivory">
              Recommended Tone: Composed
            </div>
            <div className="px-3 py-1.5 bg-titanium/30 border border-titanium rounded text-[10px] uppercase tracking-widest text-ivory">
              Style: Concise
            </div>
          </div>
        </motion.div>

        {/* Tension Layer Analysis */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="glass-panel p-6 space-y-6 md:col-span-2 border-oxblood/30"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-oxblood flex items-center gap-2">
              <AlertCircle size={14} /> Tension Layer Analysis
            </h3>
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <span className="text-[8px] text-stone uppercase">Truth</span>
                <span className="text-xs text-teal font-bold">0.82</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[8px] text-stone uppercase">Weight</span>
                <span className="text-xs text-gold font-bold">0.91</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[8px] text-stone uppercase">Timing</span>
                <span className="text-xs text-amber font-bold">0.88</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[8px] text-stone uppercase">Tension</span>
                <span className="text-xs text-oxblood font-bold">0.74</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h4 className="text-[10px] uppercase tracking-widest text-ivory font-bold border-b border-titanium pb-2">Unresolved Conflicts</h4>
              <ul className="space-y-3">
                <li className="text-xs text-stone leading-relaxed">
                  <span className="text-oxblood font-bold mr-2">!</span>
                  Technical primer contradicts recent field reports on MicroRGB peak brightness stability in high-heat environments.
                </li>
                <li className="text-xs text-stone leading-relaxed">
                  <span className="text-oxblood font-bold mr-2">!</span>
                  GM Sarah Miller's public support for OLED contradicts her private requests for MicroRGB "objective clarity."
                </li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="text-[10px] uppercase tracking-widest text-ivory font-bold border-b border-titanium pb-2">Strategic Ambiguity</h4>
              <ul className="space-y-3">
                <li className="text-xs text-stone leading-relaxed">
                  <span className="text-teal font-bold mr-2">?</span>
                  The "unofficial authority" role is currently undefined. Leverage this by maintaining a consultative tone without seeking formal recognition yet.
                </li>
                <li className="text-xs text-stone leading-relaxed">
                  <span className="text-teal font-bold mr-2">?</span>
                  Designer James's deference pattern suggests he is waiting for a "permission signal" to fully pivot his department's focus.
                </li>
              </ul>
            </div>
          </div>
        </motion.div>

        {/* Counterworld Capability */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="glass-panel p-8 space-y-8 md:col-span-2 border-gold/20 bg-gold/5"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gold flex items-center gap-2">
              <Globe size={14} /> Counterworld Construction
            </h3>
            <span className="text-[10px] text-stone uppercase tracking-widest">Adversarial Interpretation: Active</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-6">
              <h4 className="instrument-label text-stone">Your Current Stance</h4>
              <div className="p-6 bg-titanium/10 border border-titanium/20 rounded space-y-4">
                <p className="text-sm text-ivory font-serif italic">"MicroRGB is the inevitable successor to OLED due to inorganic stability and superior luminance."</p>
                <div className="flex gap-2">
                  <span className="text-[9px] px-2 py-0.5 bg-gold/20 text-gold rounded uppercase font-bold tracking-widest">Foundational</span>
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <h4 className="instrument-label text-oxblood">The Counterworld (Strongest Rival)</h4>
              <div className="p-6 bg-oxblood/5 border border-oxblood/20 rounded space-y-4">
                <p className="text-sm text-ivory font-serif italic">"OLED's manufacturing maturity and 'good enough' performance for 99% of use cases makes MicroRGB a redundant luxury that will fail to achieve mass-market scale."</p>
                <div className="flex gap-2">
                  <span className="text-[9px] px-2 py-0.5 bg-oxblood/20 text-oxblood rounded uppercase font-bold tracking-widest">Adversarial</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-titanium/20">
            <h4 className="text-[10px] uppercase tracking-widest text-stone font-bold mb-4">Synthesis & Pressure Points</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-titanium/5 border border-titanium/10 rounded space-y-2">
                <p className="text-[9px] text-gold uppercase tracking-widest">The "OLED Trap"</p>
                <p className="text-xs text-stone leading-relaxed">If OLED yields continue to improve, the price gap may never close enough for MicroRGB to survive.</p>
              </div>
              <div className="p-4 bg-titanium/5 border border-titanium/10 rounded space-y-2">
                <p className="text-[9px] text-gold uppercase tracking-widest">The "MiniLED" Threat</p>
                <p className="text-xs text-stone leading-relaxed">MiniLED with 10k+ zones might offer 95% of MicroRGB's quality at 20% of the cost.</p>
              </div>
              <div className="p-4 bg-titanium/5 border border-titanium/10 rounded space-y-2">
                <p className="text-[9px] text-gold uppercase tracking-widest">The "Authority" Risk</p>
                <p className="text-xs text-stone leading-relaxed">Over-committing to MicroRGB early could damage credibility if adoption stalls.</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
