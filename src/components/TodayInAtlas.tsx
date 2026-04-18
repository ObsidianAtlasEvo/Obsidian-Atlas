// Atlas-Audit: [EXEC-MODE] Verified — Estate Center CTAs use coerceActiveMode(..., prev.activeMode) for directive / capabilities / atlas graph entry.
import React from 'react';
import { AppState, PulseItem } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Zap, RefreshCw, HelpCircle, Box, Scale, Users, ShieldCheck, Activity, Layers, Target, CheckCircle2, ArrowRight } from 'lucide-react';
import { coerceActiveMode } from '../lib/atlasWayfinding';
import { cn } from '../lib/utils';

interface TodayInAtlasProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export const TodayInAtlas: React.FC<TodayInAtlasProps> = ({ state, setState }) => {
  const ripeningItems = state.pulse.items.filter(item => item.type === 'ripening');
  const neglectedItems = state.pulse.items.filter(item => item.type === 'neglected');
  const attentionItems = state.pulse.items.filter(item => item.type === 'attention');

  const [completingId, setCompletingId] = React.useState<string | null>(null);

  const handleComplete = (id: string) => {
    setCompletingId(id);
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        pulse: {
          ...prev.pulse,
          items: prev.pulse.items.filter(i => i.id !== id)
        }
      }));
      setCompletingId(null);
    }, 600);
  };

  return (
    <div className="p-16 space-y-16 max-w-7xl mx-auto h-full overflow-y-auto custom-scrollbar">
      {/* Header Section */}
      <div className="flex items-start justify-between border-b border-titanium/5 pb-12">
        <div className="space-y-8">
          <div className="space-y-4">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-4 text-gold"
            >
              <Calendar size={28} className="opacity-50" />
              <h2 className="text-5xl font-serif text-ivory tracking-tight">The Estate Center</h2>
            </motion.div>
            <p className="text-stone font-sans opacity-60 max-w-2xl text-lg leading-relaxed font-light italic">
              The strategic center of your intellectual estate. A high-signal synthesis of what is ripening, what is decaying, and the current posture of Atlas.
            </p>
          </div>

          {/* Daily Doctrine / Sovereign Quote */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-8 bg-gold/[0.03] border border-gold/10 rounded-sm relative overflow-hidden group max-w-2xl"
          >
            <div className="absolute top-0 right-0 p-4 opacity-[0.05] group-hover:opacity-[0.1] transition-opacity duration-700">
              <ShieldCheck size={64} className="text-gold" />
            </div>
            <div className="space-y-3">
              <span className="text-[9px] text-gold uppercase tracking-[0.4em] font-bold opacity-60">Daily Doctrine</span>
              <p className="text-xl font-serif text-ivory/90 italic leading-relaxed">
                "Clarity is not the absence of complexity, but the mastery of it."
              </p>
            </div>
          </motion.div>
        </div>
        
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex flex-col items-end gap-6"
        >
          <div className="flex items-center gap-8 bg-titanium/5 border border-titanium/10 px-8 py-4 rounded-sm backdrop-blur-md shadow-2xl">
            <div className="flex flex-col items-end gap-1">
              <span className="text-[9px] font-mono uppercase tracking-[0.3em] text-stone opacity-40 font-bold">Compute Posture</span>
              <span className="text-xs font-mono text-ivory capitalize tracking-widest">{state.cognitiveLoad.computePosture.replace('-', ' ')}</span>
            </div>
            <div className="w-px h-10 bg-titanium/10" />
            <div className="flex flex-col items-end gap-1">
              <span className="text-[9px] font-mono uppercase tracking-[0.3em] text-stone opacity-40 font-bold">UI Posture</span>
              <span className="text-xs font-mono text-teal capitalize tracking-widest">{state.cognitiveLoad.uiPosture}</span>
            </div>
          </div>
          <motion.button 
            whileHover={{ scale: 1.02, x: -4 }}
            onClick={() =>
              setState((prev) => ({
                ...prev,
                activeMode: coerceActiveMode('directive-center', prev.activeMode),
              }))
            }
            className="text-[10px] font-mono uppercase tracking-[0.3em] text-gold hover:text-ivory transition-all flex items-center gap-3 group"
          >
            <Target size={14} className="group-hover:rotate-90 transition-transform duration-700" /> Adjust System Posture
          </motion.button>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">
        {/* Ripening & Attention */}
        <div className="lg:col-span-2 space-y-16">
          <section className="space-y-10">
            <div className="flex justify-between items-end">
              <h3 className="text-[10px] uppercase tracking-[0.4em] text-stone flex items-center gap-4 font-bold">
                <Zap size={16} className="text-gold opacity-50" />
                Ripening for Synthesis
              </h3>
              <span className="text-[9px] text-stone opacity-40 uppercase tracking-widest">{ripeningItems.length} Items Pending</span>
            </div>
            <div className="grid grid-cols-1 gap-8">
              <AnimatePresence mode="popLayout">
                {ripeningItems.map((item, index) => (
                  <motion.div 
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ 
                      opacity: completingId === item.id ? 0 : 1, 
                      y: completingId === item.id ? -20 : 0,
                      scale: completingId === item.id ? 0.95 : 1,
                      filter: completingId === item.id ? 'blur(10px)' : 'blur(0px)'
                    }}
                    exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.4 } }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: completingId === item.id ? 0 : index * 0.1 }}
                    className={cn(
                      "glass-panel p-10 border-gold/10 bg-gold/[0.01] flex items-start gap-8 cursor-pointer group hover:bg-gold/[0.04] hover:border-gold/30 transition-all duration-700 relative overflow-hidden shadow-lg",
                      completingId === item.id && "pointer-events-none"
                    )}
                    onClick={() => handleComplete(item.id)}
                  >
                    <div className="absolute left-0 top-0 w-[2px] h-0 bg-gold/40 group-hover:h-full transition-all duration-700" />
                    <motion.button 
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleComplete(item.id);
                      }}
                      className="p-4 rounded-sm bg-gold/5 text-gold hover:bg-gold/10 transition-all relative overflow-hidden border border-gold/10 group-hover:border-gold/30"
                    >
                      <Box size={24} className="group-hover:opacity-0 transition-opacity duration-500" />
                      <CheckCircle2 size={24} className="absolute inset-0 m-auto opacity-0 group-hover:opacity-100 transition-opacity duration-500 text-teal" />
                    </motion.button>
                    <div className="space-y-4 flex-1">
                      <p className="text-ivory/90 text-2xl font-serif leading-relaxed group-hover:text-ivory transition-colors duration-500">{item.content}</p>
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] text-stone font-mono opacity-40 uppercase tracking-[0.2em]">{item.timestamp}</span>
                        <div className="w-1 h-1 rounded-full bg-gold/20" />
                        <span className="text-[9px] text-gold/60 uppercase tracking-[0.3em] font-bold">Priority Synthesis</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>

          <section className="space-y-10">
            <div className="flex justify-between items-end">
              <h3 className="text-[10px] uppercase tracking-[0.4em] text-stone flex items-center gap-4 font-bold">
                <ShieldCheck size={16} className="text-oxblood opacity-50" />
                High-Stakes Attention
              </h3>
              <span className="text-[9px] text-stone opacity-40 uppercase tracking-widest">{attentionItems.length} Critical Points</span>
            </div>
            <div className="grid grid-cols-1 gap-8">
              <AnimatePresence mode="popLayout">
                {attentionItems.map((item, index) => (
                  <motion.div 
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ 
                      opacity: completingId === item.id ? 0 : 1, 
                      y: completingId === item.id ? -20 : 0,
                      scale: completingId === item.id ? 0.95 : 1,
                      filter: completingId === item.id ? 'blur(10px)' : 'blur(0px)'
                    }}
                    exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.4 } }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: completingId === item.id ? 0 : index * 0.1 }}
                    whileHover={{ x: 8 }}
                    className={cn(
                      "glass-panel p-10 border-oxblood/10 bg-oxblood/[0.01] flex items-start gap-8 cursor-pointer group hover:bg-oxblood/[0.04] hover:border-oxblood/30 transition-all duration-700 relative overflow-hidden shadow-lg",
                      completingId === item.id && "pointer-events-none"
                    )}
                    onClick={() => handleComplete(item.id)}
                  >
                    <div className="absolute left-0 top-0 w-[2px] h-0 bg-oxblood/40 group-hover:h-full transition-all duration-700" />
                    <div className="p-4 rounded-sm bg-oxblood/5 text-oxblood border border-oxblood/10 group-hover:border-oxblood/30 transition-all">
                      <Scale size={24} />
                    </div>
                    <div className="space-y-4 flex-1">
                      <p className="text-ivory/90 text-2xl font-serif leading-relaxed group-hover:text-ivory transition-colors duration-500">{item.content}</p>
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] text-stone font-mono opacity-40 uppercase tracking-[0.2em]">{item.timestamp}</span>
                        <div className="w-1 h-1 rounded-full bg-oxblood/20" />
                        <span className="text-[9px] text-oxblood/60 uppercase tracking-[0.3em] font-bold">Critical Path</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>
        </div>

        {/* Side Actions & Context */}
        <div className="space-y-16">
          <section className="space-y-10">
            <h3 className="text-[10px] uppercase tracking-[0.4em] text-stone flex items-center gap-4 font-bold">
              <RefreshCw size={16} className="text-teal opacity-50" />
              Neglected Foundations
            </h3>
            <div className="space-y-8">
              {neglectedItems.map(item => (
                <motion.div 
                  key={item.id} 
                  whileHover={{ scale: 1.02, y: -4 }}
                  className="p-8 border border-titanium/10 rounded-sm bg-titanium/5 space-y-6 group hover:border-teal/30 transition-all duration-700 shadow-lg"
                >
                  <p className="text-sm text-stone/70 leading-relaxed font-serif italic group-hover:text-stone transition-colors">"{item.content}"</p>
                  <button className="text-[10px] text-teal uppercase tracking-[0.4em] font-bold hover:text-ivory transition-colors flex items-center gap-3 group/btn">
                    Revisit Foundation <ArrowRight size={12} className="group-hover/btn:translate-x-2 transition-transform duration-500" />
                  </button>
                </motion.div>
              ))}
            </div>
          </section>

          <section className="glass-panel p-10 border-titanium/10 bg-obsidian/50 space-y-10 shadow-2xl">
            <h3 className="text-[10px] uppercase tracking-[0.4em] text-stone font-bold">Active Tensions</h3>
            {state.constitution.tensions.length === 0 ? (
              <p className="text-[10px] text-stone/40 font-serif italic">
                No tensions defined. Add tensions in your Constitution to track balance here.
              </p>
            ) : (
              <div className="space-y-10">
                {state.constitution.tensions.slice(0, 3).map((tension) => {
                  const pct = Math.round(tension.currentBalance * 100);
                  const color = pct > 60 ? 'bg-gold' : pct < 40 ? 'bg-teal' : 'bg-violet-400';
                  const shadowColor = pct > 60
                    ? 'shadow-[0_0_12px_rgba(212,175,55,0.5)]'
                    : pct < 40
                    ? 'shadow-[0_0_12px_rgba(20,184,166,0.5)]'
                    : 'shadow-[0_0_12px_rgba(139,92,246,0.5)]';
                  return (
                    <div key={tension.id} className="space-y-4">
                      <div className="flex justify-between text-[10px] uppercase tracking-[0.4em] text-stone font-bold">
                        <span>{tension.poleA} vs {tension.poleB}</span>
                        <span className={pct > 60 ? 'text-gold' : pct < 40 ? 'text-teal' : 'text-violet-400'}>{pct}%</span>
                      </div>
                      <div className="h-[2px] bg-titanium/10 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 2, ease: 'easeOut' }}
                          className={`h-full ${color} ${shadowColor}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <motion.section 
            whileHover={{ scale: 1.02 }}
            className="glass-panel p-10 border-gold/20 bg-gold/[0.01] space-y-8 group cursor-pointer hover:bg-gold/[0.03] transition-all duration-700 shadow-2xl" 
            onClick={() =>
              setState((prev) => ({
                ...prev,
                activeMode: coerceActiveMode('capabilities', prev.activeMode),
              }))
            }
          >
            <div className="flex items-center gap-4 text-gold">
              <HelpCircle size={24} className="opacity-50" />
              <h3 className="text-[10px] uppercase tracking-[0.4em] font-bold">Discover Capabilities</h3>
            </div>
            <p className="text-sm text-stone/60 leading-relaxed font-serif italic group-hover:text-stone transition-colors">
              Explore the core chambers of Atlas and discover how to extend your cognitive agency through specialized intelligence modules.
            </p>
            <div className="flex items-center gap-4 text-[10px] font-mono text-gold uppercase tracking-[0.4em] font-bold group-hover:gap-6 transition-all duration-500">
              Open Directory <ArrowRight size={14} />
            </div>
          </motion.section>

          <motion.button 
            whileHover={{ scale: 1.02, backgroundColor: '#D4AF37', color: '#0A0A0A' }}
            whileTap={{ scale: 0.98 }}
            onClick={() =>
              setState((prev) => ({
                ...prev,
                activeMode: coerceActiveMode('atlas', prev.activeMode),
              }))
            }
            className="w-full py-6 bg-ivory text-obsidian font-bold uppercase tracking-[0.5em] text-[11px] transition-all duration-700 rounded-sm shadow-2xl"
          >
            Return to Clarity
          </motion.button>
        </div>
      </div>
    </div>
  );
};
