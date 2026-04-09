import React from 'react';
import { Heart, Users, ArrowRight, Shield, Zap, Target, Eye, Activity } from 'lucide-react';
import { motion } from 'motion/react';
import { AppState } from '../types';

interface RelationshipDynamicsProps {
  state: AppState;
}

export function RelationshipDynamics({ state }: RelationshipDynamicsProps) {
  return (
    <div className="p-12 space-y-12 max-w-6xl mx-auto">
      <header className="space-y-4">
        <div className="flex items-center gap-3 text-gold">
          <Heart size={24} />
          <h2 className="text-4xl font-serif text-ivory tracking-tight">Deep Human Dynamics</h2>
        </div>
        <p className="text-stone font-sans opacity-60 max-w-2xl leading-relaxed">
          A living memory layer for human dynamics. Tracking what matters to individuals, how they think, and how trust and authority evolve in your relationships.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {state.relationships.map((rel, index) => (
          <motion.div
            key={rel.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
            className="glass-panel p-8 space-y-6 border-gold/10 group hover:border-gold/30 transition-all"
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center text-gold font-serif">
                  {rel.name[0]}
                </div>
                <div className="space-y-1">
                  <h4 className="text-lg font-serif text-ivory">{rel.name}</h4>
                  <p className="text-[10px] text-stone uppercase tracking-widest">{rel.role}</p>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-stone opacity-40">Trust Level</span>
                <span className="text-sm font-serif text-gold">{(rel.trust * 100).toFixed(0)}%</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <span className="text-[10px] text-stone uppercase tracking-widest">Core Drivers</span>
                <div className="flex flex-wrap gap-2">
                  {rel.drivers.map(driver => (
                    <span key={driver} className="text-[9px] px-2 py-1 bg-titanium/10 text-stone rounded border border-titanium/20">{driver}</span>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-stone uppercase tracking-widest">Intellectual Resonance</span>
                <div className="h-1 bg-teal/20 rounded-full overflow-hidden">
                  <div className="h-full bg-teal" style={{ width: `${rel.resonance * 100}%` }} />
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-titanium/20 space-y-4">
              <h5 className="text-[10px] text-stone uppercase tracking-widest">Recent Authority Moment</h5>
              <p className="text-xs text-stone italic opacity-80 leading-relaxed">
                "{rel.recentAuthorityMoment}"
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      <section className="pt-12 border-t border-titanium/10 space-y-8">
        <h3 className="instrument-label text-stone">Network Topology</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="space-y-6">
            <h4 className="text-xs font-mono text-gold uppercase tracking-widest">Influence & Presence</h4>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-titanium/5 border border-titanium/10 rounded group hover:border-gold/30 transition-all">
                <div className="flex items-center gap-3">
                  <Eye size={14} className="text-gold" />
                  <span className="text-sm text-ivory">Perceived Authority</span>
                </div>
                <span className="text-[10px] text-gold font-bold">High (0.88)</span>
              </div>
              <div className="flex justify-between items-center p-4 bg-titanium/5 border border-titanium/10 rounded group hover:border-gold/30 transition-all">
                <div className="flex items-center gap-3">
                  <Zap size={14} className="text-gold" />
                  <span className="text-sm text-ivory">Strategic Gravity</span>
                </div>
                <span className="text-[10px] text-gold font-bold">Calibrated (0.74)</span>
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <h4 className="text-xs font-mono text-gold uppercase tracking-widest">Dynamic Shifts</h4>
            <div className="space-y-4">
              <div className="p-4 bg-titanium/5 border border-titanium/10 rounded group hover:border-gold/30 transition-all">
                <div className="flex items-center gap-3 text-teal">
                  <Activity size={14} />
                  <span className="text-sm text-ivory">Converging Themes</span>
                </div>
                <p className="text-[10px] text-stone opacity-60 mt-2">Increasing resonance with "Aurelius" on the "Sovereign Archive" thesis.</p>
              </div>
              <div className="p-4 bg-titanium/5 border border-titanium/10 rounded group hover:border-gold/30 transition-all">
                <div className="flex items-center gap-3 text-oxblood">
                  <Shield size={14} />
                  <span className="text-sm text-ivory">Trust Divergence</span>
                </div>
                <p className="text-[10px] text-stone opacity-60 mt-2">Minor divergence with "Cassian" regarding the "Open Source" pivot.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
