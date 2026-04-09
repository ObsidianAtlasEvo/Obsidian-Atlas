import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AppState, Decision } from '../types';
import { ShieldCheck, AlertTriangle, ArrowRight, Scale, Info, Layers, Plus, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface DecisionsViewProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export const DecisionsView: React.FC<DecisionsViewProps> = ({ state, setState }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContext, setNewContext] = useState('');

  const handleAddDecision = () => {
    if (!newTitle.trim() || !newContext.trim()) return;

    const newDecision: Decision = {
      id: Math.random().toString(36).substring(7),
      title: newTitle,
      context: newContext,
      dossier: 'Newly initialized decision dossier.',
      status: 'pending',
      options: [
        { id: 'opt1', label: 'Option A', tradeoffs: ['Tradeoff 1'], consequences: ['Consequence 1'], reversibility: 0.5, uncertainty: 0.5 },
        { id: 'opt2', label: 'Option B', tradeoffs: ['Tradeoff 2'], consequences: ['Consequence 2'], reversibility: 0.5, uncertainty: 0.5 }
      ],
      stakeholders: [],
      principlesChecked: [],
      emotionalContamination: []
    };

    setState(prev => ({
      ...prev,
      decisions: [newDecision, ...prev.decisions]
    }));

    setNewTitle('');
    setNewContext('');
    setIsAdding(false);
  };

  const handleSelectOption = (decisionId: string, optionId: string) => {
    setState(prev => ({
      ...prev,
      decisions: prev.decisions.map(dec => 
        dec.id === decisionId ? { ...dec, status: 'resolved' as const } : dec
      )
    }));
  };

  return (
    <div className="p-4 md:p-16 space-y-8 md:space-y-16 max-w-6xl mx-auto h-full overflow-y-auto custom-scrollbar">
      <div className="space-y-6 border-b border-titanium/5 pb-8 md:pb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4 text-gold"
          >
            <Scale size={32} className="shrink-0" />
            <h2 className="text-3xl md:text-5xl font-serif text-ivory tracking-tight">Decision Architecture</h2>
          </motion.div>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-stone font-sans opacity-60 max-w-2xl text-base md:text-lg leading-relaxed font-light italic mt-4 md:mt-6"
          >
            Structured clarity for high-stakes choices. Converting ambiguity into deliberate movement through tradeoff mapping, consequence analysis, and alignment with core doctrine.
          </motion.p>
        </div>
        {!isAdding && (
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-6 py-3 bg-gold/10 hover:bg-gold/20 text-gold border border-gold/20 rounded-sm text-[10px] uppercase tracking-widest transition-all"
          >
            <Plus size={14} /> Initialize Decision
          </button>
        )}
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="glass-panel p-10 border-gold/30 mb-12 space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-serif text-ivory">New Decision Dossier</h3>
                <button onClick={() => setIsAdding(false)} className="text-stone hover:text-ivory">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-4">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Decision Title (e.g., Strategic Pivot: Open Source)"
                  className="w-full bg-obsidian/40 border border-titanium/10 rounded-sm p-4 text-sm text-ivory placeholder:text-stone/40 focus:border-gold/50 outline-none font-serif"
                />
                <textarea
                  value={newContext}
                  onChange={(e) => setNewContext(e.target.value)}
                  placeholder="Provide the context and core tension of this decision..."
                  className="w-full bg-obsidian/40 border border-titanium/10 rounded-sm p-4 text-sm text-ivory placeholder:text-stone/40 focus:border-gold/50 outline-none resize-none h-32 font-serif italic"
                />
              </div>

              <div className="flex justify-end">
                <button 
                  onClick={handleAddDecision}
                  disabled={!newTitle.trim() || !newContext.trim()}
                  className="px-8 py-3 bg-gold text-obsidian font-bold uppercase tracking-[0.2em] text-[10px] hover:bg-ivory transition-all disabled:opacity-50"
                >
                  Initialize Dossier
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-12 pb-24">
        {state.decisions.map((dec, idx) => (
          <motion.div 
            key={dec.id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.1 }}
            className="glass-panel p-6 md:p-12 space-y-8 md:space-y-12 border-titanium/10 relative overflow-hidden group hover:border-gold/20 transition-all duration-700 shadow-2xl"
          >
            {/* Status Badge */}
            <div className="relative md:absolute md:top-10 md:right-10 flex items-center gap-3 mb-6 md:mb-0">
              <div className={cn(
                "w-2 h-2 rounded-full",
                dec.status === 'pending' ? "bg-gold animate-pulse" : "bg-teal"
              )} />
              <span className="text-[10px] text-stone uppercase tracking-[0.4em] font-bold opacity-60">
                Dossier Status: {dec.status}
              </span>
            </div>

            {/* Header */}
            <div className="space-y-4">
              <span className="text-[9px] text-gold uppercase tracking-[0.5em] font-bold block">Decision Dossier #{dec.id}</span>
              <h3 className="text-4xl font-serif text-ivory group-hover:text-gold transition-colors duration-500">{dec.title}</h3>
              <p className="text-lg text-stone font-light leading-relaxed max-w-3xl opacity-80">{dec.context}</p>
            </div>

            {/* Options Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              {dec.options.map((opt, optIdx) => (
                <motion.div 
                  key={opt.id}
                  whileHover={{ y: -5 }}
                  className={cn(
                    "space-y-8 p-10 bg-titanium/5 rounded-sm border transition-all duration-500 relative group/option",
                    dec.status === 'resolved' ? "border-titanium/10 opacity-50" : "border-titanium/10 hover:border-gold/30"
                  )}
                >
                  <div className="flex justify-between items-center border-b border-titanium/10 pb-6">
                    <h4 className="text-xl font-serif text-ivory tracking-wide">{opt.label}</h4>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-stone uppercase tracking-widest opacity-40">Uncertainty</span>
                      <div className="w-16 h-1 bg-titanium/20 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${opt.uncertainty * 100}%` }}
                          className="h-full bg-gold/40"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-8">
                    <div className="space-y-4">
                      <span className="text-[9px] uppercase tracking-[0.3em] text-stone font-bold opacity-40 flex items-center gap-2">
                        <Scale size={12} className="text-gold" /> Tradeoffs
                      </span>
                      <ul className="space-y-3">
                        {opt.tradeoffs.map((t, i) => (
                          <li key={i} className="text-xs text-stone/80 flex items-start gap-3 group/item">
                            <ArrowRight size={12} className="mt-0.5 text-gold/40 group-hover/item:text-gold transition-colors" />
                            <span className="font-serif italic">{t}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-4">
                      <span className="text-[9px] uppercase tracking-[0.3em] text-stone font-bold opacity-40 flex items-center gap-2">
                        <Layers size={12} className="text-gold" /> Consequences
                      </span>
                      <ul className="space-y-3">
                        {opt.consequences.map((c, i) => (
                          <li key={i} className="text-xs text-stone/80 flex items-start gap-3 group/item">
                            <div className="w-1 h-1 rounded-full bg-gold/20 mt-2 group-hover/item:bg-gold transition-all" />
                            <span className="font-serif italic">{c}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="pt-6 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <span className="text-[9px] text-stone uppercase tracking-widest opacity-40">Reversibility</span>
                      <span className={cn(
                        "text-[10px] font-bold tracking-widest uppercase",
                        opt.reversibility > 0.7 ? "text-teal" : opt.reversibility > 0.4 ? "text-gold" : "text-oxblood"
                      )}>
                        {opt.reversibility > 0.7 ? 'High' : opt.reversibility > 0.4 ? 'Moderate' : 'Low'}
                      </span>
                    </div>
                    {dec.status === 'pending' && (
                      <motion.button 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleSelectOption(dec.id, opt.id)}
                        className="px-6 py-2 bg-gold/10 hover:bg-gold text-gold hover:text-obsidian border border-gold/30 rounded-sm text-[9px] uppercase tracking-[0.3em] font-bold transition-all duration-500"
                      >
                        Select Path
                      </motion.button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Footer Metadata */}
            <div className="pt-10 border-t border-titanium/10 flex flex-wrap gap-12">
              <div className="space-y-3">
                <span className="text-[9px] uppercase tracking-[0.3em] text-stone font-bold opacity-40 flex items-center gap-2">
                  <ShieldCheck size={14} className="text-gold" /> Principles Checked
                </span>
                <div className="flex gap-3">
                  {dec.principlesChecked.length > 0 ? dec.principlesChecked.map(p => (
                    <span key={p} className="text-[9px] px-3 py-1 bg-gold/5 text-gold/80 rounded-sm border border-gold/20 uppercase tracking-widest">
                      {p}
                    </span>
                  )) : <span className="text-[9px] text-stone/40 italic">None</span>}
                </div>
              </div>
              <div className="space-y-3">
                <span className="text-[9px] uppercase tracking-[0.3em] text-stone font-bold opacity-40 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-oxblood" /> Emotional Contamination
                </span>
                <div className="flex gap-3">
                  {dec.emotionalContamination.length > 0 ? dec.emotionalContamination.map(e => (
                    <span key={e} className="text-[9px] px-3 py-1 bg-oxblood/5 text-oxblood/80 rounded-sm border border-oxblood/20 uppercase tracking-widest">
                      {e}
                    </span>
                  )) : <span className="text-[9px] text-stone/40 italic">None</span>}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
