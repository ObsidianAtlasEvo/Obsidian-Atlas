// Atlas-Audit: [EXEC-EVO] Verified — Roadmap CTA copy matches evolution-layer → Chrysalis routing (no “675-point” mislabel).
import React from 'react';
import { Rocket, CheckCircle, Circle, ArrowRight, Globe, Zap, Shield, BookOpen } from 'lucide-react';
import { motion } from 'motion/react';
import { EvolutionPhase } from '../types';

const PHASES: EvolutionPhase[] = [
  { id: 1, title: 'Daily Utility & Orientation', description: 'Immediate daily utility, Daily Orientation layer, signal vs. noise ranking.', status: 'completed' },
  { id: 2, title: 'Structured Memory & Entity Modeling', description: 'Memory statuses, right-moment recall, entity-level modeling.', status: 'active' },
  { id: 3, title: 'Chambers, Graph, & Forge', description: 'Multilingual chambers, knowledge graph, and doctrine forge.', status: 'active' },
  { id: 4, title: 'Cognitive Signature & Adaptive UI', description: 'Learning-style inference, inquiry-style modeling, and adaptive UI density.', status: 'planned' },
  { id: 5, title: 'Decision Engine & Scenario Modeling', description: 'Decision dossiers, tradeoff maps, and branch modeling.', status: 'planned' },
  { id: 6, title: 'Doctrine Forge & Inner Council', description: 'Living principles, red lines, and multi-lens thinking.', status: 'planned' },
  { id: 7, title: 'Multilingual & Civilizational Synthesis', description: 'Semantic-fidelity translation and cross-civilizational comparison.', status: 'planned' },
  { id: 8, title: 'Practice & Mastery Theaters', description: 'Deliberate practice architecture and applied mastery arenas.', status: 'planned' },
  { id: 9, title: 'Covenants & Shared Chambers', description: 'Rare resonance matching and collaborative knowledge environments.', status: 'planned' },
  { id: 10, title: 'Universal Knowledge Commons', description: 'Public canonical chambers and platform ecosystem.', status: 'planned' },
];

export function EvolutionRoadmap() {
  return (
    <div className="p-12 space-y-12 max-w-6xl mx-auto">
      <header className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-gold">
            <Rocket size={24} />
            <h2 className="text-4xl font-serif text-ivory tracking-tight">Product Roadmap</h2>
          </div>
          <button 
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('set-mode', { detail: 'evolution-layer' }))}
            title="Open Chrysalis — mutation, experiments, and refinement requests"
            className="flex items-center gap-2 text-[10px] text-gold uppercase tracking-widest font-bold hover:text-ivory transition-colors"
          >
            Open Chrysalis lab <ArrowRight size={12} />
          </button>
        </div>
        <p className="text-stone font-sans opacity-60 max-w-2xl leading-relaxed">
          Staged build staging and product evolution doctrine. Moving from daily utility to universal cognitive infrastructure.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <section className="space-y-8">
          <h3 className="instrument-label text-gold uppercase tracking-[0.2em] flex items-center gap-2">
            <Globe size={14} /> Staged Build Staging
          </h3>
          <div className="space-y-4">
            {PHASES.map((phase) => (
              <div key={phase.id} className={`p-6 glass-panel border-gold/10 flex items-start gap-4 ${phase.status === 'completed' ? 'opacity-60' : 'opacity-100'}`}>
                <div className="mt-1">
                  {phase.status === 'completed' ? <CheckCircle size={16} className="text-gold" /> : 
                   phase.status === 'active' ? <Zap size={16} className="text-gold animate-pulse" /> : 
                   <Circle size={16} className="text-stone opacity-40" />}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-stone opacity-40 font-mono">PHASE {phase.id}</span>
                    <h4 className="text-sm text-ivory">{phase.title}</h4>
                  </div>
                  <p className="text-xs text-stone opacity-60 leading-relaxed">{phase.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-12">
          <div className="space-y-6">
            <h3 className="instrument-label text-gold uppercase tracking-[0.2em] flex items-center gap-2">
              <Shield size={14} /> Product Evolution Doctrine
            </h3>
            <div className="grid grid-cols-1 gap-4">
              <div className="p-6 bg-titanium/5 border border-titanium/10 rounded space-y-2">
                <h4 className="text-sm text-ivory">Category-Defining System</h4>
                <p className="text-xs text-stone opacity-60">Build Obsidian Atlas as a default layer of thought, not a destination tool.</p>
              </div>
              <div className="p-6 bg-titanium/5 border border-titanium/10 rounded space-y-2">
                <h4 className="text-sm text-ivory">Continuity Engine</h4>
                <p className="text-xs text-stone opacity-60">Design for decades of accumulation, not short-term sessions.</p>
              </div>
              <div className="p-6 bg-titanium/5 border border-titanium/10 rounded space-y-2">
                <h4 className="text-sm text-ivory">Epistemic Discipline</h4>
                <p className="text-xs text-stone opacity-60">Preserve rigor even at mass-market simplicity.</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="instrument-label text-gold uppercase tracking-[0.2em] flex items-center gap-2">
              <BookOpen size={14} /> The Final Standard
            </h3>
            <div className="p-8 bg-gold/5 border border-gold/20 rounded space-y-4">
              <p className="text-sm text-ivory font-serif italic leading-relaxed">
                "Build it so that they quietly come to feel they would not want to think, decide, learn, remember, grow, or become without it."
              </p>
              <div className="flex items-center justify-between text-[10px] text-stone uppercase tracking-widest">
                <span>Doctrine 675</span>
                <span>Universal Intelligence Environment</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
