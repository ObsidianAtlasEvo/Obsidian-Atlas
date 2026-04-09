import React, { useState } from 'react';
import { Filter, ShieldAlert, Check, X, AlertOctagon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function FinalFilter() {
  const [proposition, setProposition] = useState('');
  const [isGauntletActive, setIsGauntletActive] = useState(false);
  const [answers, setAnswers] = useState({ q1: '', q2: '', q3: '', q4: '' });
  const [status, setStatus] = useState<'idle' | 'rejected' | 'ratified'>('idle');

  const handleInitiate = () => {
    if (proposition.trim()) {
      setIsGauntletActive(true);
      setStatus('idle');
    }
  };

  const handleReject = () => {
    setStatus('rejected');
    setTimeout(() => {
      setIsGauntletActive(false);
      setProposition('');
      setAnswers({ q1: '', q2: '', q3: '', q4: '' });
      setStatus('idle');
    }, 2000);
  };

  const handleRatify = () => {
    setStatus('ratified');
    setTimeout(() => {
      setIsGauntletActive(false);
      setProposition('');
      setAnswers({ q1: '', q2: '', q3: '', q4: '' });
      setStatus('idle');
    }, 2000);
  };

  return (
    <div className="h-full flex flex-col bg-obsidian overflow-y-auto custom-scrollbar">
      <header className="p-12 border-b border-oxblood/20 flex flex-col gap-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(139,0,0,0.1),transparent_50%)] pointer-events-none" />
        <div className="flex items-center gap-4 text-oxblood relative z-10">
          <Filter size={32} strokeWidth={1.5} />
          <h2 className="text-4xl font-serif tracking-tight text-ivory">The Final Filter</h2>
        </div>
        <p className="text-stone font-sans max-w-2xl text-lg leading-relaxed relative z-10">
          The purification stage for serious thoughts, plans, or decisions. A gauntlet of uncompromising questions designed to destroy weak logic and expose hidden costs.
        </p>
      </header>

      <div className="p-12 max-w-4xl mx-auto w-full space-y-16">
        <div className="glass-panel p-10 border-titanium/20 space-y-8">
          <div className="space-y-4">
            <label className="text-[10px] uppercase tracking-widest text-stone font-bold">The Proposition</label>
            <textarea 
              value={proposition}
              onChange={(e) => setProposition(e.target.value)}
              disabled={isGauntletActive}
              className="w-full bg-titanium/5 border border-titanium/20 rounded p-6 text-ivory font-serif text-xl focus:outline-none focus:border-gold/50 transition-colors resize-none h-32 disabled:opacity-50"
              placeholder="State the decision, plan, or belief you are subjecting to the filter..."
            />
          </div>
          
          {!isGauntletActive && (
            <div className="flex justify-end">
              <button 
                onClick={handleInitiate}
                disabled={!proposition.trim()}
                className="px-8 py-3 bg-oxblood text-ivory font-bold uppercase tracking-[0.2em] text-xs hover:bg-red-900 transition-all shadow-[0_0_20px_rgba(139,0,0,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Initiate Gauntlet
              </button>
            </div>
          )}
        </div>

        <AnimatePresence>
          {isGauntletActive && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <h3 className="text-2xl font-serif text-ivory border-b border-titanium/20 pb-4 flex items-center gap-3">
                <ShieldAlert size={20} className="text-gold" />
                The Gauntlet
              </h3>

              <div className="space-y-6">
                {/* Question 1 */}
                <div className="glass-panel p-8 border-gold/20 space-y-6 relative group hover:border-gold/40 transition-colors">
                  <div className="absolute top-0 left-0 w-1 h-full bg-gold/50 group-hover:bg-gold transition-colors" />
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase tracking-widest text-gold font-bold">Question I: The Deception Check</span>
                    <h4 className="text-xl font-serif text-ivory">What is the most likely way you are currently lying to yourself about this?</h4>
                  </div>
                  <textarea 
                    value={answers.q1}
                    onChange={(e) => setAnswers({ ...answers, q1: e.target.value })}
                    className="w-full bg-transparent border-b border-titanium/20 p-2 text-ivory font-sans text-sm focus:outline-none focus:border-gold transition-colors resize-none h-20"
                    placeholder="Confront the avoidance..."
                  />
                </div>

                {/* Question 2 */}
                <div className="glass-panel p-8 border-oxblood/20 space-y-6 relative group hover:border-oxblood/40 transition-colors">
                  <div className="absolute top-0 left-0 w-1 h-full bg-oxblood/50 group-hover:bg-oxblood transition-colors" />
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase tracking-widest text-oxblood font-bold">Question II: The Cost Analysis</span>
                    <h4 className="text-xl font-serif text-ivory">If you execute this, what must you permanently destroy, abandon, or sacrifice?</h4>
                  </div>
                  <textarea 
                    value={answers.q2}
                    onChange={(e) => setAnswers({ ...answers, q2: e.target.value })}
                    className="w-full bg-transparent border-b border-titanium/20 p-2 text-ivory font-sans text-sm focus:outline-none focus:border-oxblood transition-colors resize-none h-20"
                    placeholder="Name the true cost..."
                  />
                </div>

                {/* Question 3 */}
                <div className="glass-panel p-8 border-teal/20 space-y-6 relative group hover:border-teal/40 transition-colors">
                  <div className="absolute top-0 left-0 w-1 h-full bg-teal/50 group-hover:bg-teal transition-colors" />
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase tracking-widest text-teal font-bold">Question III: The Leverage Test</span>
                    <h4 className="text-xl font-serif text-ivory">Is this the absolute highest-leverage action available, or are you choosing it because it is familiar or comfortable?</h4>
                  </div>
                  <textarea 
                    value={answers.q3}
                    onChange={(e) => setAnswers({ ...answers, q3: e.target.value })}
                    className="w-full bg-transparent border-b border-titanium/20 p-2 text-ivory font-sans text-sm focus:outline-none focus:border-teal transition-colors resize-none h-20"
                    placeholder="Assess the leverage..."
                  />
                </div>
                
                {/* Question 4 */}
                <div className="glass-panel p-8 border-titanium/40 space-y-6 relative group hover:border-ivory/40 transition-colors">
                  <div className="absolute top-0 left-0 w-1 h-full bg-titanium/50 group-hover:bg-ivory transition-colors" />
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase tracking-widest text-stone font-bold">Question IV: The Inversion</span>
                    <h4 className="text-xl font-serif text-ivory">If you were forced to achieve the opposite outcome, what would you do? How does that inform your current plan?</h4>
                  </div>
                  <textarea 
                    value={answers.q4}
                    onChange={(e) => setAnswers({ ...answers, q4: e.target.value })}
                    className="w-full bg-transparent border-b border-titanium/20 p-2 text-ivory font-sans text-sm focus:outline-none focus:border-ivory transition-colors resize-none h-20"
                    placeholder="Invert the problem..."
                  />
                </div>
              </div>

              <div className="flex justify-center gap-6 pt-8 border-t border-titanium/20">
                {status === 'idle' ? (
                  <>
                    <button 
                      onClick={handleReject}
                      className="flex items-center gap-3 px-8 py-4 bg-transparent border border-oxblood/50 text-oxblood font-bold uppercase tracking-[0.2em] text-xs hover:bg-oxblood/10 transition-all"
                    >
                      <X size={16} />
                      Reject & Discard
                    </button>
                    <button 
                      onClick={handleRatify}
                      className="flex items-center gap-3 px-8 py-4 bg-gold text-obsidian font-bold uppercase tracking-[0.2em] text-xs hover:bg-ivory transition-all shadow-[0_0_20px_rgba(176,138,67,0.2)]"
                    >
                      <Check size={16} />
                      Ratify & Execute
                    </button>
                  </>
                ) : (
                  <div className={`flex items-center gap-3 px-8 py-4 font-bold uppercase tracking-[0.2em] text-xs ${status === 'ratified' ? 'text-gold' : 'text-oxblood'}`}>
                    {status === 'ratified' ? <Check size={16} /> : <X size={16} />}
                    {status === 'ratified' ? 'Proposition Ratified' : 'Proposition Rejected'}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
