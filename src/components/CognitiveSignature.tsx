import React from 'react';
import { motion } from 'motion/react';
import { Brain, Target, Zap, Activity, Compass } from 'lucide-react';
import { AppState } from '../types';

interface CognitiveSignatureProps {
  state: AppState;
}

export function CognitiveSignature({ state }: CognitiveSignatureProps) {
  const { thoughtStructure } = state.userModel;

  return (
    <div className="h-full p-12 overflow-y-auto custom-scrollbar">
      <div className="max-w-5xl mx-auto space-y-16">
        <header className="space-y-4">
          <div className="flex items-center gap-3 text-gold">
            <Brain size={24} />
            <h1 className="text-4xl font-serif text-ivory">Cognitive Signature</h1>
          </div>
          <p className="text-stone font-sans opacity-60 max-w-2xl leading-relaxed">
            An emergent model of your intellectual topology. Obsidian Atlas maps the recurring patterns, 
            tensions, and structural signatures of your inquiry over time.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-12">
          {/* Primary Metrics */}
          <section className="space-y-8">
            <h2 className="instrument-label text-gold tracking-widest uppercase">Structural Metrics</h2>
            <div className="space-y-6">
              {[
                { label: 'Intellectual Altitude', value: thoughtStructure.intellectualAltitude, icon: Compass },
                { label: 'Ambiguity Tolerance', value: thoughtStructure.ambiguityTolerance, icon: Activity },
                { label: 'Systemic Coherence', value: thoughtStructure.systemicCoherence, icon: Target },
                { label: 'Synthesis Velocity', value: thoughtStructure.synthesisVelocity, icon: Zap },
              ].map((metric) => (
                <div key={metric.label} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 text-ivory/80">
                      <metric.icon size={14} className="text-gold/60" />
                      <span className="text-xs font-mono uppercase tracking-wider">{metric.label}</span>
                    </div>
                    <span className="text-xs font-mono text-gold">{(metric.value * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-1 bg-titanium/20 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${metric.value * 100}%` }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                      className="h-full bg-gold/40"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Latent Patterns */}
          <section className="space-y-8">
            <h2 className="instrument-label text-gold tracking-widest uppercase">Latent Patterns</h2>
            <div className="space-y-4">
              {thoughtStructure.latentPatterns.map((pattern) => (
                <div key={pattern.id} className="glass-panel p-6 border-titanium/20 hover:border-gold/30 transition-all group">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-serif text-ivory group-hover:text-gold transition-colors">{pattern.inferredCenter}</h3>
                    <span className="text-[10px] font-mono text-gold/60">{(pattern.confidence * 100).toFixed(0)}% Confidence</span>
                  </div>
                  <p className="text-xs text-stone opacity-60 leading-relaxed">
                    Emerging resonance detected across {pattern.supportingSignals.length} distinct inquiries. 
                    This pattern suggests a recurring focus on structural integrity and systemic leverage.
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Intellectual Tensions */}
        <section className="space-y-8">
          <h2 className="instrument-label text-gold tracking-widest uppercase">Intellectual Tensions</h2>
          <div className="grid grid-cols-3 gap-6">
            {[
              { label: 'Abstraction vs. Application', value: 0.65 },
              { label: 'Rigor vs. Intuition', value: 0.42 },
              { label: 'Novelty vs. Tradition', value: 0.78 },
            ].map((tension) => (
              <div key={tension.label} className="glass-panel p-6 border-titanium/10 text-center space-y-4">
                <span className="text-[10px] font-mono text-stone uppercase tracking-widest">{tension.label}</span>
                <div className="relative h-12 flex items-center justify-center">
                  <div className="absolute w-full h-px bg-titanium/20" />
                  <motion.div 
                    initial={{ x: 0 }}
                    animate={{ x: (tension.value - 0.5) * 100 }}
                    className="w-3 h-3 bg-gold rotate-45 z-10 shadow-[0_0_10px_rgba(176,138,67,0.4)]"
                  />
                </div>
                <p className="text-[10px] text-stone opacity-40 italic">
                  Current equilibrium favors {tension.value > 0.5 ? tension.label.split(' vs. ')[1] : tension.label.split(' vs. ')[0]}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
