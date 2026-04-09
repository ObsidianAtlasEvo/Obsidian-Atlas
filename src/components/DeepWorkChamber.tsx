// Atlas-Audit: [XI] Persist objective and timer preset in localStorage so the chamber survives refresh; session active state intentionally not restored (avoid silent “sealed” UX). More interoperable: same browser profile keeps intent aligned with Atlas. Unresolved: no server sync, no enforcement of “restricted navigation” described in copy—copy should stay honest or behavior must follow in a later pass.
import React, { useState, useEffect } from 'react';
import { Focus, Lock, Unlock, Play, Square, Settings, BrainCircuit } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const DEEP_WORK_LS = 'atlas_deep_work_chamber_v1';

export function DeepWorkChamber() {
  const [isActive, setIsActive] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(90 * 60); // 90 minutes default
  const [objective, setObjective] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DEEP_WORK_LS);
      if (!raw) return;
      const o = JSON.parse(raw) as { objective?: string; timeRemaining?: number };
      if (typeof o.objective === 'string') setObjective(o.objective);
      if (typeof o.timeRemaining === 'number' && o.timeRemaining > 0) setTimeRemaining(o.timeRemaining);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (isActive) return;
    try {
      localStorage.setItem(DEEP_WORK_LS, JSON.stringify({ objective, timeRemaining }));
    } catch {
      /* ignore */
    }
  }, [objective, timeRemaining, isActive]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isActive && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining((prev) => prev - 1);
      }, 1000);
    } else if (timeRemaining === 0) {
      setIsActive(false);
    }
    return () => clearInterval(interval);
  }, [isActive, timeRemaining]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const toggleSession = () => {
    if (!isActive && !objective) {
      setError("You must define a singular objective before entering the chamber.");
      return;
    }
    setError('');
    setIsActive(!isActive);
  };

  return (
    <div className={`h-full flex flex-col transition-colors duration-1000 ${isActive ? 'bg-black' : 'bg-obsidian'} overflow-y-auto custom-scrollbar relative`}>
      {/* Active State Background Effects */}
      <AnimatePresence>
        {isActive && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2 }}
            className="absolute inset-0 pointer-events-none"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(212,175,55,0.05),transparent_60%)]" />
            <div className="absolute top-0 left-0 w-full h-1 bg-gold-500 shadow-[0_0_15px_rgba(212,175,55,0.5)]" />
            <div className="absolute bottom-0 left-0 w-full h-1 bg-gold-500 shadow-[0_0_15px_rgba(212,175,55,0.5)]" />
          </motion.div>
        )}
      </AnimatePresence>

      <header className={`p-12 border-b transition-colors duration-1000 ${isActive ? 'border-transparent' : 'border-purple-500/10'} flex flex-col items-center text-center justify-center min-h-[30vh] relative z-10`}>
        <div className={`flex items-center gap-4 transition-colors duration-1000 ${isActive ? 'text-gold-500' : 'text-stone'}`}>
          <BrainCircuit size={48} strokeWidth={1} className={isActive ? 'animate-pulse-subtle' : ''} />
        </div>
        <h2 className={`text-5xl font-serif tracking-tight mt-6 transition-colors duration-1000 ${isActive ? 'text-ivory drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]' : 'text-ivory/80'}`}>Deep Work Chamber</h2>
        <p className={`font-mono uppercase tracking-[0.3em] text-xs mt-4 transition-colors duration-1000 ${isActive ? 'text-gold-500 opacity-100' : 'text-stone opacity-60'}`}>
          {isActive ? 'Immense Focus Engaged' : 'Prepare for Isolation'}
        </p>
      </header>

      <div className="p-12 max-w-3xl mx-auto w-full space-y-16 flex-1 flex flex-col justify-center relative z-10">
        <AnimatePresence mode="wait">
          {!isActive ? (
            <motion.div 
              key="setup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-stone font-bold flex items-center gap-2">
                    <Focus size={12} />
                    Singular Objective
                  </label>
                  <input 
                    type="text"
                    value={objective}
                    onChange={(e) => {
                      setObjective(e.target.value);
                      if (error) setError('');
                    }}
                    className={`w-full bg-transparent border-b-2 p-4 text-ivory font-serif text-2xl focus:outline-none transition-colors placeholder:text-stone/30 ${error ? 'border-oxblood focus:border-oxblood' : 'border-purple-500/30 focus:border-gold-500'}`}
                    placeholder="What is the one thing that must be done?"
                  />
                  {error && (
                    <motion.p 
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-oxblood text-xs font-mono uppercase tracking-widest mt-2"
                    >
                      {error}
                    </motion.p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <button onClick={() => setTimeRemaining(45 * 60)} className={`p-4 border rounded font-mono text-sm transition-colors ${timeRemaining === 45 * 60 ? 'border-gold-500 text-gold-500 bg-gold-500/5' : 'border-purple-500/20 text-stone hover:border-purple-500/50'}`}>45m</button>
                  <button onClick={() => setTimeRemaining(90 * 60)} className={`p-4 border rounded font-mono text-sm transition-colors ${timeRemaining === 90 * 60 ? 'border-gold-500 text-gold-500 bg-gold-500/5' : 'border-purple-500/20 text-stone hover:border-purple-500/50'}`}>90m</button>
                  <button onClick={() => setTimeRemaining(120 * 60)} className={`p-4 border rounded font-mono text-sm transition-colors ${timeRemaining === 120 * 60 ? 'border-gold-500 text-gold-500 bg-gold-500/5' : 'border-purple-500/20 text-stone hover:border-purple-500/50'}`}>120m</button>
                </div>
              </div>

              <div className="glass-panel p-6 border-oxblood/20 bg-oxblood/5 space-y-4">
                <h4 className="text-[10px] uppercase tracking-widest text-oxblood font-bold flex items-center gap-2">
                  <Lock size={12} />
                  Chamber Protocols
                </h4>
                <ul className="space-y-2 text-sm text-ivory/70">
                  <li className="flex items-center gap-3"><span className="w-1 h-1 rounded-full bg-oxblood" /> Timer and objective persist locally across refresh until you clear storage.</li>
                  <li className="flex items-center gap-3"><span className="w-1 h-1 rounded-full bg-oxblood" /> Discipline is yours: Atlas does not block other routes in this build.</li>
                  <li className="flex items-center gap-3"><span className="w-1 h-1 rounded-full bg-oxblood" /> The session cannot be paused, only aborted.</li>
                </ul>
              </div>

              <div className="flex justify-center pt-8">
                <button 
                  onClick={toggleSession}
                  disabled={!objective}
                  className="flex items-center gap-3 px-12 py-5 bg-gold-500 text-obsidian font-bold uppercase tracking-[0.3em] text-sm hover:bg-ivory transition-all shadow-[0_0_30px_rgba(212,175,55,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play size={18} fill="currentColor" />
                  Seal Chamber
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="active"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 1, ease: "easeInOut" }}
              className="flex flex-col items-center justify-center space-y-16 h-full"
            >
              <div className="text-center space-y-6">
                <span className="text-[10px] uppercase tracking-[0.4em] text-gold-500 font-bold">Current Objective</span>
                <h3 className="text-4xl md:text-5xl font-serif text-ivory max-w-2xl leading-tight">{objective}</h3>
              </div>

              <div className="text-[8rem] md:text-[12rem] font-mono text-ivory tracking-tighter leading-none tabular-nums" style={{ textShadow: '0 0 40px rgba(255,255,255,0.1)' }}>
                {formatTime(timeRemaining)}
              </div>

              <div className="flex justify-center pt-12">
                <button 
                  onClick={toggleSession}
                  className="group flex items-center gap-3 px-8 py-3 bg-transparent border border-oxblood/30 text-oxblood/70 font-bold uppercase tracking-[0.2em] text-xs hover:bg-oxblood/10 hover:text-oxblood hover:border-oxblood transition-all"
                >
                  <Square size={14} className="group-hover:fill-oxblood transition-colors" />
                  Abort Session
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
