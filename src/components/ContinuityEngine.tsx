import React from 'react';
import { RefreshCw, ArrowRight, History, Compass, Clock, Target, Shield } from 'lucide-react';
import { motion } from 'motion/react';
import { AppState } from '../types';

interface ContinuityEngineProps {
  state: AppState;
}

export function ContinuityEngine({ state }: ContinuityEngineProps) {
  return (
    <div className="p-12 space-y-12 max-w-6xl mx-auto">
      <header className="space-y-4">
        <div className="flex items-center gap-3 text-gold">
          <RefreshCw size={24} />
          <h2 className="text-4xl font-serif text-ivory tracking-tight">Future Self Continuity</h2>
        </div>
        <p className="text-stone font-sans opacity-60 max-w-2xl leading-relaxed">
          Preserving continuity between past, present, and future selves. Tracking evolving beliefs, promises, questions, and the long-wave themes of your life.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-8 space-y-6 border-gold/10 group hover:border-gold/30 transition-all"
        >
          <div className="flex justify-between items-center">
            <span className="instrument-label text-gold uppercase tracking-[0.2em] flex items-center gap-2">
              <History size={12} /> Past Self
            </span>
            <span className="text-[10px] text-stone opacity-40">2 Years Ago</span>
          </div>
          <div className="space-y-4">
            <h4 className="text-lg font-serif text-ivory italic leading-relaxed opacity-90">"The goal is to build a tool that organizes information."</h4>
            <div className="pt-4 border-t border-titanium/20 space-y-2">
              <span className="text-[10px] text-stone uppercase tracking-widest">Evolved Into</span>
              <p className="text-xs text-gold">"The goal is to build an instrument that extends human agency."</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-panel p-8 space-y-6 border-gold/10 group hover:border-gold/30 transition-all"
        >
          <div className="flex justify-between items-center">
            <span className="instrument-label text-gold uppercase tracking-[0.2em] flex items-center gap-2">
              <Compass size={12} /> Future Self
            </span>
            <span className="text-[10px] text-stone opacity-40">5 Years Out</span>
          </div>
          <div className="space-y-4">
            <h4 className="text-lg font-serif text-ivory italic leading-relaxed opacity-90">"Will the current focus on 'sovereignty' still be relevant in a world of post-AGI abundance?"</h4>
            <div className="pt-4 border-t border-titanium/20 space-y-2">
              <span className="text-[10px] text-stone uppercase tracking-widest">Strategic Commitment</span>
              <p className="text-xs text-gold">"Focus on local-first, encrypted architecture to ensure resilience."</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-panel p-8 space-y-6 border-gold/10 group hover:border-gold/30 transition-all"
        >
          <div className="flex justify-between items-center">
            <span className="instrument-label text-gold uppercase tracking-[0.2em] flex items-center gap-2">
              <Clock size={12} /> Life Patterns
            </span>
            <span className="text-[10px] text-stone opacity-40">Active</span>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="text-sm text-ivory">Pattern: The 3-Year Strategic Reset</h4>
              <p className="text-[10px] text-stone opacity-60">Every 3 years, you tend to question the foundational architecture of your projects. This is a feature, not a bug.</p>
            </div>
            <div className="pt-4 border-t border-titanium/20 space-y-2">
              <span className="text-[10px] text-stone uppercase tracking-widest">Current Status</span>
              <p className="text-xs text-teal">Reset Cycle: 82% Complete</p>
            </div>
          </div>
        </motion.div>
      </div>

      <section className="pt-12 border-t border-titanium/10 space-y-8">
        <h3 className="instrument-label text-stone">The Map of Becoming</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="space-y-6">
            <h4 className="text-xs font-mono text-gold uppercase tracking-widest">Evolving Standards</h4>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-titanium/5 border border-titanium/10 rounded group hover:border-gold/30 transition-all">
                <span className="text-sm text-ivory">Design Elegance</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-stone opacity-40">Was: 0.4</span>
                  <ArrowRight size={10} className="text-gold" />
                  <span className="text-[10px] text-gold font-bold">Now: 0.85</span>
                </div>
              </div>
              <div className="flex justify-between items-center p-4 bg-titanium/5 border border-titanium/10 rounded group hover:border-gold/30 transition-all">
                <span className="text-sm text-ivory">Strategic Precision</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-stone opacity-40">Was: 0.6</span>
                  <ArrowRight size={10} className="text-gold" />
                  <span className="text-[10px] text-gold font-bold">Now: 0.92</span>
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <h4 className="text-xs font-mono text-gold uppercase tracking-widest">Foundational Questions</h4>
            <div className="space-y-4">
              <div className="p-4 bg-titanium/5 border border-titanium/10 rounded group hover:border-gold/30 transition-all">
                <p className="text-sm text-ivory italic">"How do we maintain the dignity of the individual in a world of collective intelligence?"</p>
                <div className="pt-2 flex justify-between items-center">
                  <span className="text-[10px] text-stone opacity-40">First Asked: 2024</span>
                  <span className="text-[10px] text-gold uppercase tracking-widest">Active Thread</span>
                </div>
              </div>
              <div className="p-4 bg-titanium/5 border border-titanium/10 rounded group hover:border-gold/30 transition-all">
                <p className="text-sm text-ivory italic">"What is the relationship between aesthetic restraint and cognitive clarity?"</p>
                <div className="pt-2 flex justify-between items-center">
                  <span className="text-[10px] text-stone opacity-40">First Asked: 2025</span>
                  <span className="text-[10px] text-gold uppercase tracking-widest">Active Thread</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
