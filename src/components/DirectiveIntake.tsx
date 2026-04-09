import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Plus, Settings, Activity, Shield } from 'lucide-react';
import { AppState, Directive, DirectiveScope } from '../types';
import { cn } from '../lib/utils';
import { validateDirective, applyDirectivesToPosture } from '../lib/directiveProcessor';

interface DirectiveIntakeProps {
  state: AppState;
  onUpdateState: (updates: Partial<AppState>) => void;
  inline?: boolean;
}

export function DirectiveIntake({ state, onUpdateState, inline = false }: DirectiveIntakeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAddDirective = () => {
    if (!inputText.trim()) return;
    setIsProcessing(true);

    setTimeout(() => {
      const validation = validateDirective(inputText);
      const newDirective: Directive = {
        id: Math.random().toString(36).substring(7),
        text: inputText,
        type: validation.types,
        outcome: validation.outcome,
        explanation: validation.explanation,
        scope: 'session',
        timestamp: new Date().toISOString(),
        isActive: validation.outcome !== 'rejected',
      };

      const updatedDirectives = [newDirective, ...state.directives];
      const updatedPosture = applyDirectivesToPosture(updatedDirectives, state.activePosture);

      onUpdateState({ 
        directives: updatedDirectives,
        activePosture: updatedPosture
      });
      
      setInputText('');
      setIsProcessing(false);
      setIsOpen(false);
    }, 800);
  };

  return (
    <div className={cn("relative", inline ? "w-full" : "")}>
      {!isOpen ? (
        <button 
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-gold hover:text-ivory transition-all group"
        >
          <Zap size={12} className="group-hover:scale-110 transition-transform" />
          <span>Shape Atlas Posture</span>
        </button>
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-4 border-gold/30 space-y-4 w-full max-w-md"
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 text-gold">
              <Zap size={14} />
              <span className="text-[10px] uppercase tracking-widest font-bold">New Directive</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-stone hover:text-ivory">
              <Settings size={12} />
            </button>
          </div>
          
          <div className="space-y-3">
            <input 
              autoFocus
              value={inputText}
              onChange={(e) => {
                console.log('DirectiveIntake Input Change:', e.target.value);
                setInputText(e.target.value);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleAddDirective()}
              placeholder="e.g., 'Be more direct', 'Challenge me'..."
              className="w-full bg-titanium/5 border border-titanium/20 rounded-sm px-3 py-2 text-xs text-ivory focus:border-gold/40 focus:outline-none"
            />
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1 text-[8px] text-stone uppercase tracking-widest">
                <Shield size={8} />
                <span>Validated against core laws</span>
              </div>
              <button 
                onClick={handleAddDirective}
                disabled={isProcessing || !inputText.trim()}
                className="bg-gold text-obsidian px-3 py-1 text-[9px] font-bold uppercase tracking-widest rounded-sm hover:bg-ivory transition-all flex items-center gap-2"
              >
                {isProcessing ? <Activity size={10} className="animate-spin" /> : <Plus size={10} />}
                Apply
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
