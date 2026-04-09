import React from 'react';
import { AppState, MemoryEntry } from '../types';
import { motion } from 'motion/react';
import { Database, Clock, Zap, Shield, Search, Filter, ArrowUpRight, Trash2, Plus } from 'lucide-react';
import { cn } from '../lib/utils';

interface MemoryViewProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function MemoryView({ state, setState }: MemoryViewProps) {
  const { memoryArchitecture } = state;

  const renderMemoryList = (entries: MemoryEntry[], title: string, icon: any, color: string) => (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {React.createElement(icon, { className: color, size: 20 })}
          <h2 className="text-lg font-serif">{title}</h2>
        </div>
        <span className="text-[10px] text-stone font-mono">{entries.length} Entries</span>
      </div>
      <div className="space-y-3">
        {entries.map((entry) => (
          <motion.div 
            key={entry.id}
            layout
            className="p-4 bg-titanium/5 border border-titanium/10 rounded hover:border-gold/30 transition-all group"
          >
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-2 flex-1">
                <p className="text-sm text-ivory leading-relaxed">{entry.content}</p>
                <div className="flex flex-wrap gap-2">
                  {entry.tags.map(tag => (
                    <span key={tag} className="text-[8px] text-stone uppercase tracking-widest bg-titanium/10 px-2 py-0.5 rounded">#{tag}</span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="text-[9px] font-mono text-stone">{new Date(entry.timestamp).toLocaleDateString()}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-1.5 hover:text-gold transition-colors" title="Promote Layer">
                    <ArrowUpRight size={14} />
                  </button>
                  <button className="p-1.5 hover:text-oxblood transition-colors" title="Purge Memory">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
        {entries.length === 0 && (
          <div className="p-8 border border-dashed border-titanium/20 rounded text-center text-stone text-xs italic">
            No memories in this layer.
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-obsidian text-ivory overflow-hidden">
      <header className="p-8 border-b border-titanium/10 flex items-center justify-between bg-obsidian/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 border border-gold/40 flex items-center justify-center bg-gold/5">
            <Database className="text-gold" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-serif tracking-tight">Multi-Layer Memory Vault</h1>
            <p className="text-[10px] text-stone uppercase tracking-widest opacity-60">Sovereign Cognitive Storage • Layered Context</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-gold text-obsidian text-[10px] uppercase tracking-widest font-bold hover:bg-gold/80 transition-all">
            <Plus size={14} /> New Entry
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Transient Memory */}
          <section className="space-y-6">
            <div className="p-4 bg-titanium/5 border border-titanium/10 rounded-sm">
              <p className="text-[10px] text-stone uppercase tracking-widest leading-relaxed">
                <span className="text-ivory font-bold">Transient Layer:</span> Ephemeral context and short-term observations. Automatically purged after session expiry unless promoted.
              </p>
            </div>
            {renderMemoryList(memoryArchitecture.transient, 'Transient', Clock, 'text-stone')}
          </section>

          {/* Working Memory */}
          <section className="space-y-6">
            <div className="p-4 bg-gold/5 border border-gold/20 rounded-sm">
              <p className="text-[10px] text-gold uppercase tracking-widest leading-relaxed">
                <span className="text-gold font-bold">Working Layer:</span> Active project context, strategic goals, and current operational parameters.
              </p>
            </div>
            {renderMemoryList(memoryArchitecture.working, 'Working', Zap, 'text-gold')}
          </section>

          {/* Sovereign Memory */}
          <section className="space-y-6">
            <div className="p-4 bg-teal/5 border border-teal/20 rounded-sm">
              <p className="text-[10px] text-teal uppercase tracking-widest leading-relaxed">
                <span className="text-teal font-bold">Sovereign Layer:</span> Core identity, immutable values, and long-term architectural principles.
              </p>
            </div>
            {renderMemoryList(memoryArchitecture.sovereign, 'Sovereign', Shield, 'text-teal')}
          </section>
        </div>

        {/* Memory Metrics */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-8 pt-12 mt-12 border-t border-titanium/10">
          <div className="space-y-2">
            <h3 className="text-[10px] uppercase tracking-widest text-stone font-bold">Total Capacity</h3>
            <div className="text-3xl font-serif text-ivory">1.2 GB</div>
          </div>
          <div className="space-y-2">
            <h3 className="text-[10px] uppercase tracking-widest text-stone font-bold">Retention Rate</h3>
            <div className="text-3xl font-serif text-teal">94%</div>
          </div>
          <div className="space-y-2">
            <h3 className="text-[10px] uppercase tracking-widest text-stone font-bold">Context Density</h3>
            <div className="text-3xl font-serif text-gold">High</div>
          </div>
          <div className="space-y-2">
            <h3 className="text-[10px] uppercase tracking-widest text-stone font-bold">Purge Efficiency</h3>
            <div className="text-3xl font-serif text-oxblood">0.98</div>
          </div>
        </section>
      </main>
    </div>
  );
}
