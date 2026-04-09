import React from 'react';
import { Brain, Target, Zap, Layers, HelpCircle, Sparkles, Network, Fingerprint, Compass, Activity } from 'lucide-react';
import { motion } from 'motion/react';
import { AppState } from '../types';

interface TopologyViewProps {
  state: AppState;
}

export function TopologyView({ state }: TopologyViewProps) {
  const { topology, latentPatterns } = state.userModel.thoughtStructure;

  const dimensions = [
    { label: 'Abstraction', value: topology.abstractionLevel, color: 'text-gold', bg: 'bg-gold' },
    { label: 'Rigor', value: topology.appetiteForRigor, color: 'text-gold', bg: 'bg-gold' },
    { label: 'Ambiguity', value: topology.appetiteForAmbiguity, color: 'text-gold', bg: 'bg-gold' },
    { label: 'Systems', value: topology.fascinationWithSystems, color: 'text-gold', bg: 'bg-gold' },
    { label: 'Contradiction', value: topology.fascinationWithContradiction, color: 'text-gold', bg: 'bg-gold' },
    { label: 'Motive', value: topology.fascinationWithMotive, color: 'text-gold', bg: 'bg-gold' },
    { label: 'Symbolism', value: topology.attractionToSymbolism, color: 'text-gold', bg: 'bg-gold' },
    { label: 'Elegance', value: (topology.eleganceVsUtility + 1) / 2, color: 'text-gold', bg: 'bg-gold' },
  ];

  return (
    <div className="h-full flex flex-col bg-obsidian overflow-y-auto custom-scrollbar obsidian-surface">
      <header className="p-12 border-b border-titanium/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-10">
          <Fingerprint size={120} className="text-gold" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-4 text-gold mb-4">
            <Compass size={32} strokeWidth={1.5} />
            <h2 className="text-4xl font-serif tracking-tight text-ivory">Cognitive Topology</h2>
          </div>
          <p className="editorial-body text-stone max-w-2xl">
            The architectural map of your inquiry style and cognitive orientation. This model evolves as you interrogate the Atlas, surfacing the latent structures of your interrogation.
          </p>
        </div>
      </header>

      <div className="p-12 grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Left Column: Dimensions & Styles */}
        <div className="lg:col-span-8 space-y-16">
          <section>
            <div className="flex items-center justify-between mb-8">
              <h3 className="instrument-label text-stone flex items-center gap-3">
                <Activity size={16} className="text-gold" />
                Cognitive Dimensions
              </h3>
              <span className="text-[10px] font-mono text-stone/40 uppercase tracking-widest">Real-time Synthesis</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              {dimensions.map((d, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-panel p-8 space-y-4 border-titanium/30 hover:border-gold/30 transition-colors group"
                >
                  <div className="flex justify-between items-end">
                    <div>
                      <span className="instrument-label text-stone block mb-1">Dimension {i + 1}</span>
                      <span className="text-xl font-serif text-ivory">{d.label}</span>
                    </div>
                    <span className="text-gold font-mono text-sm">{(d.value * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full h-px bg-titanium/30 relative">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${d.value * 100}%` }}
                      transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute inset-y-0 left-0 bg-gold shadow-[0_0_10px_rgba(176,138,67,0.5)]" 
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="instrument-label text-stone flex items-center gap-3 mb-8">
              <Brain size={16} className="text-gold" />
              Primary Inquiry Styles
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {topology.primaryStyles.map((style, i) => (
                <motion.div 
                  key={style}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  className="glass-panel p-8 border-t-2 border-gold/40 flex flex-col gap-2"
                >
                  <span className="instrument-label text-stone">Dominant Style {i + 1}</span>
                  <span className="text-2xl font-serif text-ivory capitalize">{style}</span>
                  <p className="text-[10px] text-stone/60 leading-relaxed mt-2">
                    High resonance with {style} inquiry patterns detected in recent interrogations.
                  </p>
                </motion.div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column: Patterns & Orientation */}
        <div className="lg:col-span-4 space-y-12">
          <section className="glass-panel p-8 border-gold/20 gold-glow">
            <h3 className="instrument-label text-gold flex items-center gap-3 mb-8">
              <Sparkles size={16} />
              Latent Patterns
            </h3>
            <div className="space-y-6">
              {latentPatterns.length > 0 ? (
                latentPatterns.map((pattern, i) => (
                  <div key={pattern.id} className="space-y-3 pb-6 border-b border-titanium/20 last:border-0">
                    <div className="flex justify-between items-center">
                      <span className="instrument-label text-stone">Inferred Center</span>
                      <span className="text-gold font-mono text-[10px]">{(pattern.confidence * 100).toFixed(0)}% Confidence</span>
                    </div>
                    <p className="text-ivory font-serif leading-relaxed italic">"{pattern.inferredCenter}"</p>
                  </div>
                ))
              ) : (
                <div className="py-12 border border-dashed border-titanium/30 rounded-sm text-center space-y-4">
                  <p className="instrument-label text-stone italic">Insufficient data for latent pattern synthesis.</p>
                  <p className="text-[10px] text-stone/40 uppercase tracking-widest px-4">Continue interrogating the Atlas to surface hidden centers.</p>
                </div>
              )}
            </div>
          </section>

          <section className="glass-panel p-8 border-titanium/30">
            <h3 className="instrument-label text-stone flex items-center gap-3 mb-8">
              <Network size={16} className="text-gold" />
              Cognitive Orientation
            </h3>
            <div className="space-y-8">
              <div className="space-y-2">
                <p className="instrument-label text-stone">Thinking Style</p>
                <p className="text-xl font-serif text-ivory capitalize">{state.userModel.thoughtStructure.thinkingStyle}</p>
              </div>
              <div className="space-y-2">
                <p className="instrument-label text-stone">Learning Cadence</p>
                <p className="text-xl font-serif text-ivory capitalize">{state.userModel.thoughtStructure.learningCadence}</p>
              </div>
              <div className="space-y-2">
                <p className="instrument-label text-stone">Instruction Mode</p>
                <p className="text-xl font-serif text-ivory capitalize">{state.userModel.thoughtStructure.preferredInstructionMode.replace('-', ' ')}</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
