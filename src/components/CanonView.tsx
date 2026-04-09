import React from 'react';
import { Book, ScrollText, ShieldAlert, ArrowRight, Library, History, Star } from 'lucide-react';
import { motion } from 'motion/react';
import { AppState } from '../types';

interface CanonViewProps {
  state: AppState;
}

export function CanonView({ state }: CanonViewProps) {
  return (
    <div className="p-12 space-y-12 max-w-6xl mx-auto">
      <header className="space-y-4">
        <div className="flex items-center gap-3 text-gold">
          <Book size={24} />
          <h2 className="text-4xl font-serif text-ivory tracking-tight">Personal Canon & Living Library</h2>
        </div>
        <p className="text-stone font-sans opacity-60 max-w-2xl leading-relaxed">
          Your curated intellectual inheritance. A hierarchy of sources, foundational texts, and the "anti-canon" of flawed but influential ideas.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <section className="space-y-8">
          <h3 className="instrument-label text-gold uppercase tracking-[0.2em] flex items-center gap-2">
            <Star size={14} /> The Foundational Canon
          </h3>
          <div className="grid grid-cols-1 gap-6">
            {state.canon.items.filter(item => item.status === 'canon').map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="glass-panel p-8 space-y-4 border-gold/10 group hover:border-gold/30 transition-all"
              >
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-stone uppercase tracking-widest">{item.author}</span>
                  <span className="text-[10px] text-gold font-bold">Resonance: {item.resonanceScore}</span>
                </div>
                <h4 className="text-xl font-serif text-ivory group-hover:text-gold transition-colors">{item.title}</h4>
                <p className="text-sm text-stone italic opacity-80">"{item.significance}"</p>
                <div className="pt-4 flex flex-wrap gap-2">
                  {item.tags.map(tag => (
                    <span key={tag} className="text-[9px] px-2 py-1 bg-titanium/10 text-stone rounded border border-titanium/20">{tag}</span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="space-y-8">
          <h3 className="instrument-label text-oxblood uppercase tracking-[0.2em] flex items-center gap-2">
            <ShieldAlert size={14} /> The Anti-Canon
          </h3>
          <div className="grid grid-cols-1 gap-6">
            {state.canon.items.filter(item => item.status === 'anti-canon').map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="glass-panel p-8 space-y-4 border-oxblood/10 group hover:border-oxblood/30 transition-all"
              >
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-stone uppercase tracking-widest">{item.author}</span>
                  <span className="text-[10px] text-oxblood font-bold">Resonance: {item.resonanceScore}</span>
                </div>
                <h4 className="text-xl font-serif text-ivory group-hover:text-oxblood transition-colors">{item.title}</h4>
                <p className="text-sm text-stone italic opacity-80">"{item.significance}"</p>
                <div className="pt-4 flex flex-wrap gap-2">
                  {item.tags.map(tag => (
                    <span key={tag} className="text-[9px] px-2 py-1 bg-oxblood/10 text-oxblood rounded border border-oxblood/20">{tag}</span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      </div>

      <section className="pt-12 border-t border-titanium/10 space-y-8">
        <h3 className="instrument-label text-stone">Source Hierarchy</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-4 p-6 bg-titanium/5 border border-titanium/10 rounded group hover:border-gold/30 transition-all">
            <Library size={16} className="text-gold" />
            <h4 className="text-sm text-ivory">Primary Sources</h4>
            <p className="text-[10px] text-stone opacity-60">Direct, unmediated access to original thought and data. Priority 1.</p>
          </div>
          <div className="space-y-4 p-6 bg-titanium/5 border border-titanium/10 rounded group hover:border-gold/30 transition-all">
            <ScrollText size={16} className="text-gold" />
            <h4 className="text-sm text-ivory">Expert Synthesis</h4>
            <p className="text-[10px] text-stone opacity-60">Refined interpretations by recognized authorities. Priority 2.</p>
          </div>
          <div className="space-y-4 p-6 bg-titanium/5 border border-titanium/10 rounded group hover:border-gold/30 transition-all">
            <History size={16} className="text-gold" />
            <h4 className="text-sm text-ivory">Historical Context</h4>
            <p className="text-[10px] text-stone opacity-60">Long-wave analysis of evolving ideas. Priority 3.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
