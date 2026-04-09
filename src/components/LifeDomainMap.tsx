import React from 'react';
import { motion } from 'motion/react';
import { Layout, User, Briefcase, Heart, Book, Target, DollarSign, Activity, Zap, Clock, Compass } from 'lucide-react';
import { AppState, LifeTheater } from '../types';

interface LifeDomainMapProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

const THEATER_ICONS: Record<LifeTheater, any> = {
  'self': User,
  'work': Briefcase,
  'relationships': Heart,
  'doctrine': Book,
  'mastery': Target,
  'money': DollarSign,
  'health': Activity,
  'creative-output': Zap,
  'long-arc-future': Compass,
};

export function LifeDomainMap({ state, setState }: LifeDomainMapProps) {
  const { lifeDomains } = state;

  return (
    <div className="p-12 space-y-12 max-w-6xl mx-auto h-full overflow-y-auto custom-scrollbar">
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gold/10 rounded-sm border border-gold/20">
            <Layout className="w-8 h-8 text-gold" />
          </div>
          <div>
            <h2 className="text-4xl font-serif text-ivory tracking-tight">Life-Domain Operating Layer</h2>
            <p className="text-stone font-sans opacity-60 tracking-widest uppercase text-[10px]">
              Organizing Reality into Living Major Theaters
            </p>
          </div>
        </div>
        <p className="text-stone font-sans opacity-80 max-w-3xl leading-relaxed">
          Reducing fragmentation by relating questions, decisions, patterns, and chambers back to major domains of life. 
          See your life as a structured totality.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {lifeDomains.map((domain, index) => {
          const Icon = THEATER_ICONS[domain.theater];
          return (
            <motion.div
              key={domain.theater}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="glass-panel p-8 border-gold/10 relative group hover:border-gold/30 transition-all flex flex-col gap-6"
            >
              <div className="flex items-center justify-between">
                <div className="p-3 bg-gold/10 rounded-sm group-hover:bg-gold/20 transition-all">
                  <Icon className="w-6 h-6 text-gold" />
                </div>
                <span className={`text-[8px] uppercase tracking-[0.2em] px-2 py-1 border rounded-sm ${
                  domain.status === 'active' ? 'text-gold border-gold/20 bg-gold/5' : 
                  domain.status === 'evolving' ? 'text-ivory border-ivory/20 bg-ivory/5' : 
                  'text-stone border-titanium/20 bg-titanium/5'
                }`}>
                  {domain.status}
                </span>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-2xl font-serif text-ivory capitalize">{domain.theater.replace('-', ' ')}</h3>
                <p className="text-xs text-stone opacity-60 leading-relaxed">
                  {domain.patterns.length} Patterns • {domain.decisions.length} Decisions • {domain.doctrines.length} Doctrines
                </p>
              </div>

              <div className="space-y-4 pt-4 border-t border-titanium/10">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-stone">
                    <span>Cognitive Alignment</span>
                    <span className="text-gold">82%</span>
                  </div>
                  <div className="h-1 bg-titanium/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gold w-[82%]" />
                  </div>
                </div>
                <button className="w-full py-3 bg-titanium/10 hover:bg-titanium/20 text-stone hover:text-ivory text-[10px] uppercase tracking-widest transition-all border border-titanium/20 rounded-sm">
                  Enter Theater
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="p-8 bg-gold/5 border border-gold/20 rounded-sm space-y-6">
        <div className="flex items-center gap-3 text-gold">
          <Clock className="w-5 h-5" />
          <h4 className="instrument-label uppercase tracking-widest text-xs">Temporal Intelligence</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-2">
            <h5 className="text-[10px] text-stone uppercase tracking-widest">Ripening</h5>
            <p className="text-xs text-ivory">Strategic Pivot: Open Source decision is ripening.</p>
          </div>
          <div className="space-y-2">
            <h5 className="text-[10px] text-stone uppercase tracking-widest">Decaying</h5>
            <p className="text-xs text-ivory">Legacy platform dependency is decaying.</p>
          </div>
          <div className="space-y-2">
            <h5 className="text-[10px] text-stone uppercase tracking-widest">Urgent</h5>
            <p className="text-xs text-ivory">Final tradeoff analysis for Q2 roadmap.</p>
          </div>
          <div className="space-y-2">
            <h5 className="text-[10px] text-stone uppercase tracking-widest">Mature Necessity</h5>
            <p className="text-xs text-ivory">Epistemic security protocol implementation.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
