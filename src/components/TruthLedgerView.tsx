import React from 'react';
import { AppState, TruthEntry, Contradiction, EpistemicStatus } from '../types';
import { motion } from 'motion/react';
import { Radio, CheckCircle2, AlertCircle, HelpCircle, Info, Link as LinkIcon, ShieldCheck, Search, Filter, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

interface TruthLedgerViewProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function TruthLedgerView({ state, setState }: TruthLedgerViewProps) {
  const { truthLedger } = state;

  const getStatusIcon = (status: EpistemicStatus) => {
    switch (status) {
      case 'verified-fact': return <ShieldCheck className="text-teal" size={16} />;
      case 'strong-evidence': return <CheckCircle2 className="text-gold" size={16} />;
      case 'reasoned-inference': return <Info className="text-ivory/60" size={16} />;
      case 'probabilistic-assumption': return <HelpCircle className="text-stone" size={16} />;
      case 'unresolved-ambiguity': return <AlertCircle className="text-oxblood" size={16} />;
      default: return <Info className="text-stone" size={16} />;
    }
  };

  const getStatusColor = (status: EpistemicStatus) => {
    switch (status) {
      case 'verified-fact': return 'border-teal/30 bg-teal/5 text-teal';
      case 'strong-evidence': return 'border-gold/30 bg-gold/5 text-gold';
      case 'unresolved-ambiguity': return 'border-oxblood/30 bg-oxblood/5 text-oxblood';
      default: return 'border-titanium/20 bg-titanium/5 text-stone';
    }
  };

  return (
    <div className="h-full flex flex-col bg-obsidian text-ivory overflow-hidden">
      <header className="p-8 border-b border-titanium/10 flex items-center justify-between bg-obsidian/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 border border-gold/40 flex items-center justify-center bg-gold/5">
            <Radio className="text-gold" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-serif tracking-tight">Truth & Evidence Ledger</h1>
            <p className="text-[10px] text-stone uppercase tracking-widest opacity-60">Epistemic Integrity Audit • Last Updated: {new Date(truthLedger.lastAudit).toLocaleTimeString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone" size={14} />
            <input 
              type="text" 
              placeholder="Filter claims..."
              className="bg-titanium/5 border border-titanium/20 pl-10 pr-4 py-2 text-[10px] uppercase tracking-widest text-ivory focus:border-gold outline-none transition-all w-64"
            />
          </div>
          <button className="p-2 border border-titanium/20 text-stone hover:text-ivory transition-all">
            <Filter size={16} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8 space-y-12 max-w-6xl mx-auto w-full">
        {/* Contradictions Alert */}
        {truthLedger.contradictions.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-oxblood">
              <AlertTriangle size={20} />
              <h2 className="text-sm font-bold uppercase tracking-widest">Active Contradictions Detected</h2>
            </div>
            <div className="space-y-2">
              {truthLedger.contradictions.map(c => (
                <div key={c.id} className="p-4 bg-oxblood/10 border border-oxblood/20 rounded flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-xs text-ivory">{c.description}</p>
                    <p className="text-[10px] text-oxblood uppercase tracking-widest font-bold">Severity: {c.severity}</p>
                  </div>
                  <button className="px-4 py-2 bg-oxblood text-ivory text-[10px] uppercase tracking-widest font-bold hover:bg-oxblood/80 transition-all">
                    Resolve Tension
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Ledger Entries */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-serif">Epistemic Claims</h2>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-teal" />
                <span className="text-[10px] text-stone uppercase tracking-widest">Verified</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gold" />
                <span className="text-[10px] text-stone uppercase tracking-widest">Evidence</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-oxblood" />
                <span className="text-[10px] text-stone uppercase tracking-widest">Ambiguous</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {truthLedger.entries.map((entry) => (
              <motion.div 
                key={entry.id}
                layout
                className="glass-panel p-6 border-titanium/20 hover:border-gold/30 transition-all group"
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="space-y-4 flex-1">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(entry.status)}
                      <span className={cn("text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 border rounded", getStatusColor(entry.status))}>
                        {entry.status.replace('-', ' ')}
                      </span>
                      <span className="text-[10px] text-stone font-mono">Confidence: {Math.round(entry.confidence * 100)}%</span>
                    </div>
                    <p className="text-lg font-serif text-ivory leading-tight">{entry.claim}</p>
                    <div className="flex flex-wrap gap-2">
                      {entry.tags.map(tag => (
                        <span key={tag} className="text-[9px] text-stone uppercase tracking-widest bg-titanium/10 px-2 py-0.5 rounded">#{tag}</span>
                      ))}
                    </div>
                  </div>
                  <div className="w-64 space-y-3 pt-1">
                    <div className="text-[10px] uppercase tracking-widest text-stone font-bold flex items-center gap-2">
                      <LinkIcon size={12} /> Evidence Trail
                    </div>
                    <div className="space-y-1">
                      {entry.evidenceTrail.map((source, i) => (
                        <div key={i} className="text-[10px] text-stone hover:text-gold cursor-pointer transition-colors flex items-center gap-2">
                          <div className="w-1 h-1 rounded-full bg-gold/40" />
                          {source}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Epistemic Distribution */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-8 border-t border-titanium/10">
          <div className="space-y-4">
            <h3 className="text-[10px] uppercase tracking-widest text-stone font-bold">Integrity Score</h3>
            <div className="text-4xl font-serif text-gold">0.88</div>
            <p className="text-xs text-stone leading-relaxed">Overall confidence in the system's current model of reality based on verified inputs.</p>
          </div>
          <div className="space-y-4">
            <h3 className="text-[10px] uppercase tracking-widest text-stone font-bold">Contestation Rate</h3>
            <div className="text-4xl font-serif text-oxblood">12%</div>
            <p className="text-xs text-stone leading-relaxed">Percentage of claims currently marked as contested or requiring adversarial review.</p>
          </div>
          <div className="space-y-4">
            <h3 className="text-[10px] uppercase tracking-widest text-stone font-bold">Evidence Density</h3>
            <div className="text-4xl font-serif text-ivory">4.2</div>
            <p className="text-xs text-stone leading-relaxed">Average number of supporting evidence points per claim in the ledger.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
