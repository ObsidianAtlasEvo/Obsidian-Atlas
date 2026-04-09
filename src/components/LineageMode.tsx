import React from 'react';
import { History, ArrowRight, GitBranch, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { MOCK_ENTITIES } from '../constants';

import { AppState } from '../types';

interface LineageModeProps {
  state: AppState;
}

export function LineageMode({ state }: LineageModeProps) {
  const lineageEntities = MOCK_ENTITIES.filter(e => e.relationships.some(r => r.lineage));

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-12">
      <header className="space-y-2">
        <div className="flex items-center gap-3 text-amber">
          <History size={24} />
          <h2 className="text-2xl font-medium tracking-tight">Knowledge Lineage</h2>
        </div>
        <p className="text-stone text-sm tracking-wide">Tracing the historical development and conceptual evolution of ideas.</p>
      </header>

      <div className="space-y-16">
        {lineageEntities.map((entity, i) => (
          <motion.div 
            key={entity.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: i * 0.2 }}
            className="relative"
          >
            <div className="flex items-start gap-8">
              {/* Origin */}
              <div className="w-1/3 space-y-4">
                <div className="flex items-center gap-2 text-stone text-[10px] uppercase tracking-widest font-bold">
                  <Clock size={12} /> Origin Point
                </div>
                <div className="glass-panel p-6 border-l-2 border-amber/50">
                  <h3 className="text-lg font-medium text-ivory mb-2">{entity.title}</h3>
                  <p className="text-xs text-stone leading-relaxed">{entity.description}</p>
                </div>
              </div>

              {/* Evolution Arrow */}
              <div className="flex-1 flex items-center justify-center pt-12">
                <div className="w-full h-px bg-gradient-to-r from-amber/50 to-teal/50 relative">
                  <div className="absolute right-0 -top-1.5 text-teal">
                    <ArrowRight size={16} />
                  </div>
                  <div className="absolute left-1/2 -translate-x-1/2 -top-6 text-[8px] uppercase tracking-widest text-stone font-bold">
                    Conceptual Shift
                  </div>
                </div>
              </div>

              {/* Descendant */}
              <div className="w-1/3 space-y-4">
                <div className="flex items-center gap-2 text-stone text-[10px] uppercase tracking-widest font-bold">
                  <GitBranch size={12} /> Modern Synthesis
                </div>
                {entity.relationships.filter(r => r.lineage).map(rel => {
                  const target = MOCK_ENTITIES.find(e => e.id === rel.targetId);
                  if (!target) return null;
                  return (
                    <div key={target.id} className="glass-panel p-6 border-l-2 border-teal/50">
                      <h3 className="text-lg font-medium text-ivory mb-2">{target.title}</h3>
                      <p className="text-xs text-stone leading-relaxed">{target.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="pt-12 border-t border-titanium/30 text-center">
        <p className="text-[10px] uppercase tracking-widest text-stone font-bold">
          The OS identifies 12 additional lineage threads currently forming in your map.
        </p>
      </div>
    </div>
  );
}
