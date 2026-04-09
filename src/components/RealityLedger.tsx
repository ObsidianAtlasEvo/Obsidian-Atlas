import React, { useState } from 'react';
import { Target, Scale, Activity, ArrowRight, AlertTriangle, CheckCircle2, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function RealityLedger() {
  const [isAdding, setIsAdding] = useState(false);
  const [newPrediction, setNewPrediction] = useState('');

  return (
    <div className="h-full flex flex-col bg-obsidian overflow-y-auto custom-scrollbar">
      <header className="p-12 border-b border-titanium/20 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-gold">
            <Scale size={32} strokeWidth={1.5} />
            <h2 className="text-4xl font-serif tracking-tight text-ivory">Prediction, Reality & Consequence</h2>
          </div>
          <button 
            onClick={() => setIsAdding(true)}
            className="px-4 py-2 bg-gold/10 text-gold border border-gold/20 hover:bg-gold hover:text-obsidian transition-all uppercase tracking-widest text-[10px] font-bold flex items-center gap-2"
          >
            <Plus size={14} />
            Log Prediction
          </button>
        </div>
        <p className="text-stone font-sans max-w-2xl text-lg leading-relaxed">
          The ledger where your expectations are ruthlessly calibrated against actual outcomes. A mechanism for destroying self-deception in forecasting.
        </p>
      </header>

      <div className="p-12 max-w-5xl mx-auto w-full space-y-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-panel p-6 border-gold/20 flex flex-col gap-2">
            <span className="text-[10px] uppercase tracking-widest text-stone">Calibration Score</span>
            <span className="text-4xl font-serif text-gold">68%</span>
            <span className="text-xs text-stone opacity-60">Accuracy of your last 10 predictions</span>
          </div>
          <div className="glass-panel p-6 border-oxblood/20 flex flex-col gap-2">
            <span className="text-[10px] uppercase tracking-widest text-stone">Primary Bias Detected</span>
            <span className="text-xl font-serif text-oxblood">Optimism in Execution Speed</span>
            <span className="text-xs text-stone opacity-60">You consistently underestimate friction.</span>
          </div>
          <div className="glass-panel p-6 border-teal/20 flex flex-col gap-2">
            <span className="text-[10px] uppercase tracking-widest text-stone">Highest Leverage Correction</span>
            <span className="text-xl font-serif text-teal">Multiply timelines by 1.5x</span>
            <span className="text-xs text-stone opacity-60">Based on historical variance.</span>
          </div>
        </div>

        <div className="space-y-6">
          <h3 className="text-2xl font-serif text-ivory border-b border-titanium/20 pb-4">The Ledger</h3>
          
          <AnimatePresence>
            {isAdding && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="glass-panel p-8 border-gold/30 mb-6 space-y-4">
                  <h4 className="text-sm font-bold text-ivory uppercase tracking-widest">New Prediction</h4>
                  <textarea
                    value={newPrediction}
                    onChange={(e) => setNewPrediction(e.target.value)}
                    placeholder="State your prediction clearly. What will happen, when, and why?"
                    className="w-full h-32 bg-obsidian/40 border border-titanium/10 rounded-sm p-4 text-sm text-ivory placeholder:text-stone/40 focus:border-gold/50 outline-none resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => setIsAdding(false)}
                      className="px-4 py-2 text-[10px] uppercase tracking-widest text-stone hover:text-ivory transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => {
                        setNewPrediction('');
                        setIsAdding(false);
                      }}
                      className="px-6 py-2 bg-gold/20 text-gold hover:bg-gold/30 text-[10px] uppercase tracking-widest rounded-sm transition-colors"
                    >
                      Commit to Ledger
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-4">
            {/* Entry 1 */}
            <div className="glass-panel p-8 border-oxblood/30 space-y-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-oxblood" />
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h4 className="text-lg font-medium text-ivory">Launch Q3 Initiative</h4>
                  <span className="text-xs text-stone uppercase tracking-widest">Logged: 3 months ago</span>
                </div>
                <span className="px-3 py-1 bg-oxblood/10 text-oxblood text-[10px] uppercase tracking-widest rounded border border-oxblood/20 flex items-center gap-2">
                  <AlertTriangle size={12} />
                  Reality Divergence
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <span className="text-[10px] uppercase tracking-widest text-stone font-bold">Your Prediction</span>
                  <p className="text-sm text-ivory/80 italic border-l-2 border-titanium/30 pl-4 py-1">
                    "This will take 4 weeks of focused effort. The team is aligned, and the technical debt is manageable."
                  </p>
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] uppercase tracking-widest text-stone font-bold">Actual Reality</span>
                  <p className="text-sm text-ivory/80 border-l-2 border-oxblood/50 pl-4 py-1">
                    Took 9 weeks. Technical debt was severely underestimated, and alignment fractured under pressure.
                  </p>
                </div>
              </div>

              <div className="bg-titanium/5 p-4 rounded border border-titanium/10 space-y-2">
                <span className="text-[10px] uppercase tracking-widest text-gold font-bold flex items-center gap-2">
                  <ArrowRight size={12} />
                  Extracted Truth
                </span>
                <p className="text-sm text-ivory/90">
                  You conflated 'team enthusiasm' with 'structural alignment'. Never estimate timelines based on the best-case scenario of legacy code.
                </p>
              </div>
            </div>

            {/* Entry 2 */}
            <div className="glass-panel p-8 border-teal/30 space-y-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-teal" />
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h4 className="text-lg font-medium text-ivory">Hiring Lead Engineer</h4>
                  <span className="text-xs text-stone uppercase tracking-widest">Logged: 1 month ago</span>
                </div>
                <span className="px-3 py-1 bg-teal/10 text-teal text-[10px] uppercase tracking-widest rounded border border-teal/20 flex items-center gap-2">
                  <CheckCircle2 size={12} />
                  Calibrated
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <span className="text-[10px] uppercase tracking-widest text-stone font-bold">Your Prediction</span>
                  <p className="text-sm text-ivory/80 italic border-l-2 border-titanium/30 pl-4 py-1">
                    "It will take 3 months to find someone who meets the bar. We will likely have to compromise on domain experience for raw talent."
                  </p>
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] uppercase tracking-widest text-stone font-bold">Actual Reality</span>
                  <p className="text-sm text-ivory/80 border-l-2 border-teal/50 pl-4 py-1">
                    Hired in 2.5 months. Compromised on domain experience, prioritized raw architectural thinking.
                  </p>
                </div>
              </div>

              <div className="bg-titanium/5 p-4 rounded border border-titanium/10 space-y-2">
                <span className="text-[10px] uppercase tracking-widest text-gold font-bold flex items-center gap-2">
                  <ArrowRight size={12} />
                  Extracted Truth
                </span>
                <p className="text-sm text-ivory/90">
                  Your assessment of the talent market and your willingness to hold the line on core requirements was accurate.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
