import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AppState, PersonalDoctrine } from '../types';
import { Shield, BookOpen, Stars, Layers, Info, ArrowRight, Plus, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface DoctrineViewProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export const DoctrineView: React.FC<DoctrineViewProps> = ({ state, setState }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<PersonalDoctrine['category']>('principle');

  const handleAddDoctrine = () => {
    if (!newTitle.trim() || !newContent.trim()) return;

    const newDoctrine: PersonalDoctrine = {
      id: Math.random().toString(36).substring(7),
      title: newTitle,
      category: newCategory,
      content: newContent,
      version: 1.0,
      connections: { decisions: [], patterns: [], contradictions: [] }
    };

    setState(prev => ({
      ...prev,
      userModel: {
        ...prev.userModel,
        doctrine: [newDoctrine, ...prev.userModel.doctrine]
      }
    }));

    setNewTitle('');
    setNewContent('');
    setIsAdding(false);
  };

  return (
    <div className="p-16 space-y-16 max-w-6xl mx-auto h-full overflow-y-auto custom-scrollbar">
      <div className="space-y-6 border-b border-titanium/5 pb-12 flex justify-between items-end">
        <div>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4 text-gold"
          >
            <Shield size={32} />
            <h2 className="text-5xl font-serif text-ivory tracking-tight">Personal Doctrine</h2>
          </motion.div>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-stone font-sans opacity-60 max-w-2xl text-lg leading-relaxed font-light italic mt-6"
          >
            Living principles and aesthetic convictions. Understanding not only what you know, but what you stand on. The foundational architecture of your cognitive sovereignty.
          </motion.p>
        </div>
        {!isAdding && (
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-6 py-3 bg-gold/10 hover:bg-gold/20 text-gold border border-gold/20 rounded-sm text-[10px] uppercase tracking-widest transition-all"
          >
            <Plus size={14} /> Add Doctrine
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
                <h3 className="text-xl font-serif text-ivory">Forge New Doctrine</h3>
                <button onClick={() => setIsAdding(false)} className="text-stone hover:text-ivory">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-4">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Doctrine Title (e.g., The Principle of Epistemic Humility)"
                  className="w-full bg-obsidian/40 border border-titanium/10 rounded-sm p-4 text-sm text-ivory placeholder:text-stone/40 focus:border-gold/50 outline-none font-serif"
                />
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                  className="w-full bg-obsidian/40 border border-titanium/10 rounded-sm p-4 text-xs text-stone focus:border-gold/50 outline-none uppercase tracking-widest"
                >
                  <option value="principle">Principle</option>
                  <option value="value">Value</option>
                  <option value="decision-rule">Decision Rule</option>
                  <option value="standard">Standard</option>
                  <option value="red-line">Red Line</option>
                  <option value="aesthetic">Aesthetic</option>
                  <option value="strategic">Strategic</option>
                </select>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="State the doctrine clearly and unequivocally..."
                  className="w-full bg-obsidian/40 border border-titanium/10 rounded-sm p-4 text-sm text-ivory placeholder:text-stone/40 focus:border-gold/50 outline-none resize-none h-32 font-serif italic"
                />
              </div>

              <div className="flex justify-end">
                <button 
                  onClick={handleAddDoctrine}
                  disabled={!newTitle.trim() || !newContent.trim()}
                  className="px-8 py-3 bg-gold text-obsidian font-bold uppercase tracking-[0.2em] text-[10px] hover:bg-ivory transition-all disabled:opacity-50"
                >
                  Ratify Doctrine
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pb-24">
        {state.userModel.doctrine.map((doc, idx) => (
          <motion.div 
            key={doc.id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.1 }}
            className="glass-panel p-12 space-y-10 border-titanium/10 relative group hover:border-gold/20 transition-all duration-700 shadow-2xl overflow-hidden"
          >
            {/* Atmospheric Background */}
            <div className="absolute top-0 right-0 p-12 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-700 pointer-events-none">
              <Shield size={120} className="text-gold" />
            </div>

            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-gold shadow-[0_0_10px_rgba(212,175,55,0.5)]" />
                <span className="text-[10px] text-gold uppercase tracking-[0.4em] font-bold">{doc.category}</span>
              </div>
              <span className="text-[9px] text-stone opacity-40 font-mono tracking-widest uppercase">Version {doc.version}</span>
            </div>

            <div className="space-y-6">
              <h3 className="text-3xl font-serif text-ivory group-hover:text-gold transition-colors duration-500 leading-tight tracking-tight">{doc.title}</h3>
              <p className="text-2xl font-serif text-stone italic leading-relaxed opacity-90 border-l-2 border-gold/20 pl-8 py-2 group-hover:border-gold transition-all duration-700">
                "{doc.content}"
              </p>
            </div>

            <div className="pt-10 border-t border-titanium/10 grid grid-cols-2 gap-8">
              <div className="space-y-4">
                <span className="text-[9px] uppercase tracking-[0.3em] text-stone font-bold opacity-40 flex items-center gap-2">
                  <Layers size={14} className="text-gold" /> Linked Decisions
                </span>
                <div className="flex flex-wrap gap-2">
                  {doc.connections.decisions.length > 0 ? doc.connections.decisions.map(id => (
                    <span key={id} className="text-[9px] px-2 py-1 bg-titanium/10 text-stone/60 rounded-sm border border-titanium/20 uppercase tracking-widest">
                      #{id}
                    </span>
                  )) : <span className="text-[9px] text-stone/40 italic">None</span>}
                </div>
              </div>
              <div className="space-y-4">
                <span className="text-[9px] uppercase tracking-[0.3em] text-stone font-bold opacity-40 flex items-center gap-2">
                  <Stars size={14} className="text-gold" /> Patterns
                </span>
                <div className="flex flex-wrap gap-2">
                  {doc.connections.patterns.length > 0 ? doc.connections.patterns.map(id => (
                    <span key={id} className="text-[9px] px-2 py-1 bg-titanium/10 text-stone/60 rounded-sm border border-titanium/20 uppercase tracking-widest">
                      {id}
                    </span>
                  )) : <span className="text-[9px] text-stone/40 italic">None</span>}
                </div>
              </div>
            </div>

            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-4 bg-titanium/5 hover:bg-gold/10 text-stone hover:text-gold border border-titanium/10 hover:border-gold/30 transition-all duration-500 uppercase tracking-[0.3em] text-[10px] font-bold"
            >
              Refine Doctrine
            </motion.button>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
