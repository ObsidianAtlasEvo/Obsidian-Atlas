// Atlas-Audit: [EXEC-MODE] Verified — handleSelect + capability tiles use coerceActiveMode(..., prev.activeMode) so palette navigation matches shell governance.
// Atlas-Audit: [IX-SEARCH] Verified — Trajectory / Friction / Threshold appear only under Intelligence instruments; System capabilities grid drops duplicate tiles to reduce palette spam.
// Atlas-Audit: [EXEC-QL] Verified — System capabilities grid routes Truth ledger / Memory vault / Core systems to reality-ledger, memory-vault, core-systems (parity with Home Quick Access).
// Atlas-Audit: [PERF-P8] Verified — ⌘/Ctrl+K skips toggle when search is closed and focus is in an editable field; palette input can still close via chord when open.
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  BookOpen,
  Brain,
  Scale,
  GitBranch,
  Zap,
  FileText,
  X,
  ChevronRight,
  MessageSquare,
  Activity,
  Users,
  Layers,
  Heart,
  Filter,
  Command,
  Shield,
  Radar,
  Orbit,
  Anchor,
  Compass,
  Flame,
  Globe,
  Radio,
  Database,
  type LucideIcon,
} from 'lucide-react';
import { AppState } from '../types';
import { cn } from '../lib/utils';
import { isEditableDocumentActiveElement } from '../lib/atlasKeyboardGuards';
import { coerceActiveMode } from '../lib/atlasWayfinding';

interface GlobalSearchProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

type SearchResult = {
  id: string;
  type: 'journal' | 'inquiry' | 'decision' | 'scenario' | 'directive' | 'canon' | 'salon' | 'pulse' | 'council' | 'pattern' | 'relationship';
  title: string;
  subtitle?: string;
  mode: AppState['activeMode'];
  icon: any;
};

export function GlobalSearch({ state, setState }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.isSearchOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [state.isSearchOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if ((e.metaKey || e.ctrlKey) && k === 'k') {
        if (!state.isSearchOpen && isEditableDocumentActiveElement()) return;
        e.preventDefault();
        setState(prev => ({ ...prev, isSearchOpen: !prev.isSearchOpen }));
      }
      if (e.key === 'Escape' && state.isSearchOpen) {
        setState(prev => ({ ...prev, isSearchOpen: false }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.isSearchOpen, setState]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const q = query.toLowerCase();
    const newResults: SearchResult[] = [];

    // Search Journals
    state.journal.forEach(entry => {
      if (entry.title.toLowerCase().includes(q) || entry.content.toLowerCase().includes(q) || entry.tags.some(t => t.toLowerCase().includes(q))) {
        newResults.push({
          id: entry.id,
          type: 'journal',
          title: entry.title,
          subtitle: entry.content.substring(0, 60) + '...',
          mode: 'journal',
          icon: BookOpen
        });
      }
    });

    // Search Inquiries
    state.recentQuestions.forEach(qItem => {
      if (qItem.text.toLowerCase().includes(q) || (qItem.response?.synthesis && qItem.response.synthesis.toLowerCase().includes(q))) {
        newResults.push({
          id: qItem.id,
          type: 'inquiry',
          title: qItem.text,
          subtitle: qItem.response?.synthesis.substring(0, 60) + '...',
          mode: 'atlas',
          icon: Brain
        });
      }
    });

    // Search Decisions
    state.decisions.forEach(dec => {
      if (dec.title.toLowerCase().includes(q) || dec.context.toLowerCase().includes(q)) {
        newResults.push({
          id: dec.id,
          type: 'decision',
          title: dec.title,
          subtitle: dec.context.substring(0, 60) + '...',
          mode: 'decisions',
          icon: Scale
        });
      }
    });

    // Search Scenarios
    state.scenarios.forEach(scen => {
      if (scen.title.toLowerCase().includes(q) || scen.groundedInference.some(i => i.toLowerCase().includes(q))) {
        newResults.push({
          id: scen.id,
          type: 'scenario',
          title: scen.title,
          subtitle: scen.groundedInference.join(', ').substring(0, 60) + '...',
          mode: 'scenarios',
          icon: GitBranch
        });
      }
    });

    // Search Directives
    state.directives.forEach(dir => {
      if (dir.text.toLowerCase().includes(q)) {
        newResults.push({
          id: dir.id,
          type: 'directive',
          title: dir.text,
          subtitle: `Scope: ${dir.scope}`,
          mode: 'directive-center',
          icon: Zap
        });
      }
    });

    // Search Canon
    state.canon.items.forEach(item => {
      if (item.title.toLowerCase().includes(q) || item.author.toLowerCase().includes(q) || item.significance.toLowerCase().includes(q)) {
        newResults.push({
          id: item.id,
          type: 'canon',
          title: item.title,
          subtitle: `By ${item.author} - ${item.significance.substring(0, 40)}...`,
          mode: 'canon',
          icon: FileText
        });
      }
    });

    // Search Salons
    state.salons.forEach(salon => {
      if (salon.title.toLowerCase().includes(q) || salon.topic.toLowerCase().includes(q)) {
        newResults.push({
          id: salon.id,
          type: 'salon',
          title: salon.title,
          subtitle: salon.topic.substring(0, 60) + '...',
          mode: 'salon',
          icon: MessageSquare
        });
      }
    });

    // Search Pulse
    state.pulse.items.forEach(item => {
      if (item.content.toLowerCase().includes(q)) {
        newResults.push({
          id: item.id,
          type: 'pulse',
          title: item.content.substring(0, 40) + '...',
          subtitle: `Type: ${item.type}`,
          mode: 'pulse',
          icon: Activity
        });
      }
    });

    // Search Council
    state.council.forEach(lens => {
      if (lens.name.toLowerCase().includes(q) || lens.description.toLowerCase().includes(q)) {
        newResults.push({
          id: lens.id,
          type: 'council',
          title: lens.name,
          subtitle: lens.description.substring(0, 60) + '...',
          mode: 'council',
          icon: Users
        });
      }
    });

    // Search Life Patterns
    state.lifePatterns.forEach(pattern => {
      if (pattern.title.toLowerCase().includes(q) || pattern.description.toLowerCase().includes(q)) {
        newResults.push({
          id: pattern.id,
          type: 'pattern',
          title: pattern.title,
          subtitle: pattern.description.substring(0, 60) + '...',
          mode: 'lineage',
          icon: Layers
        });
      }
    });

    // Search Relationships
    state.relationships.forEach(rel => {
      if (rel.name.toLowerCase().includes(q) || rel.role.toLowerCase().includes(q)) {
        newResults.push({
          id: rel.id,
          type: 'relationship',
          title: rel.name,
          subtitle: `Role: ${rel.role}`,
          mode: 'relationships',
          icon: Heart
        });
      }
    });

    // Search Capabilities / Help
    const helpKeywords = ['help', 'capabilities', 'what can you do', 'features', 'guide', 'how to', 'atlas features'];
    if (helpKeywords.some(k => k.includes(q) || q.includes(k))) {
      newResults.push({
        id: 'capabilities-guide',
        type: 'directive',
        title: 'Atlas Capabilities Directory',
        subtitle: 'Explore the core chambers and instruments of Atlas.',
        mode: 'capabilities',
        icon: Zap
      });
    }

    setResults(newResults.slice(0, 20)); // Limit to 20 results
    setSelectedIndex(0);
  }, [query, state]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    }
  };

  const handleSelect = (result: SearchResult) => {
    setState((prev) => ({
      ...prev,
      activeMode: coerceActiveMode(result.mode, prev.activeMode),
      isSearchOpen: false,
    }));
  };

  return (
    <AnimatePresence>
      {state.isSearchOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[5vh] md:pt-[15vh] px-4 bg-obsidian/80 backdrop-blur-xl"
          onClick={() => setState(prev => ({ ...prev, isSearchOpen: false }))}
        >
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.95, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -20, scale: 0.98, filter: 'blur(10px)' }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-3xl glass-obsidian border border-stone-800 rounded-sm shadow-2xl overflow-hidden relative"
            onClick={e => e.stopPropagation()}
          >
            {/* Background Texture */}
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />

            <div className="p-4 md:p-10 space-y-6 md:space-y-10 relative z-10">
              <div className="relative flex items-center group">
                <Search className="absolute left-4 md:left-6 text-gold/40 group-focus-within:text-gold transition-colors duration-500" size={20} />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search your mind..."
                  className="w-full bg-obsidian/40 border-b border-gold/10 py-4 md:py-6 pl-12 md:pl-16 pr-10 md:pr-12 text-lg md:text-2xl font-serif text-ivory placeholder:text-stone/30 focus:outline-none focus:border-gold/40 transition-all duration-700"
                />
                <div className="absolute right-6 flex items-center gap-3">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gold-500/5 border border-gold-500/10 rounded-sm">
                    <Command size={12} className="text-gold-500/40" />
                    <span className="text-[10px] text-gold-500/40 font-mono font-bold">K</span>
                  </div>
                  <button 
                    onClick={() => setState(prev => ({ ...prev, isSearchOpen: false }))}
                    className="p-2 text-stone/40 hover:text-gold-500 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="max-h-[60vh] overflow-y-auto custom-scrollbar pr-4 -mr-4">
                <AnimatePresence mode="wait">
                  {!query.trim() ? (
                    <motion.div
                      key="initial"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-10 py-4"
                    >
                      <div className="space-y-6">
                        <h4 className="text-[10px] uppercase tracking-[0.4em] text-stone/40 font-bold px-4">Intelligence instruments</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {[
                            { icon: Radar, label: 'Trajectory observatory', mode: 'trajectory-observatory' as const },
                            { icon: Orbit, label: 'Friction cartography', mode: 'friction-cartography' as const },
                            { icon: Anchor, label: 'Threshold forge', mode: 'threshold-forge' as const },
                          ].map((cap, i) => (
                            <motion.button
                              key={cap.label}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.04, duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                              onClick={() => {
                                setState((prev) => ({
                                  ...prev,
                                  activeMode: coerceActiveMode(cap.mode, prev.activeMode),
                                  isSearchOpen: false,
                                }));
                              }}
                              className="flex items-center gap-4 p-4 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[var(--atlas-surface-panel)] hover:border-[color:var(--border-emphasis)] transition-[border-color,background-color] duration-[var(--atlas-motion-standard)] text-left group"
                            >
                              <div className="p-2.5 rounded-[var(--radius-sm)] bg-purple-500/10 text-stone-400 group-hover:text-gold-500/90 transition-colors">
                                <cap.icon size={18} />
                              </div>
                              <span className="text-sm text-stone/90 group-hover:text-ivory font-medium tracking-tight">
                                {cap.label}
                              </span>
                            </motion.button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div className="px-4 space-y-1">
                          <h4 className="text-[10px] uppercase tracking-[0.4em] text-stone/40 font-bold">System capabilities</h4>
                          <p className="text-[9px] text-stone/35 font-mono uppercase tracking-widest">
                            Observatory · friction map · threshold forge live above
                          </p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto custom-scrollbar pr-1">
                          {(
                            [
                              { icon: Compass, label: 'Sovereign atrium', mode: 'sovereign-atrium' },
                              { icon: FileText, label: 'Constitutional core', mode: 'constitution' },
                              { icon: Radio, label: 'Truth ledger', mode: 'reality-ledger' },
                              { icon: Database, label: 'Memory vault', mode: 'memory-vault' },
                              { icon: Globe, label: 'Core systems', mode: 'core-systems' },
                              { icon: Brain, label: 'Mind cartography', mode: 'mind-cartography' },
                              { icon: Layers, label: 'Strategic modeling', mode: 'strategic-modeling' },
                              { icon: Flame, label: 'Crucible', mode: 'crucible' },
                              { icon: MessageSquare, label: 'Dialogue layer', mode: 'resonance' },
                              { icon: Zap, label: 'Today in Atlas', mode: 'today-in-atlas' },
                              { icon: GitBranch, label: 'Scenario modeling', mode: 'scenarios' },
                              { icon: Scale, label: 'Decisions', mode: 'decisions' },
                              { icon: Shield, label: 'Truth chamber', mode: 'red-team' },
                              { icon: BookOpen, label: 'Personal doctrine', mode: 'doctrine' },
                            ] satisfies ReadonlyArray<{
                              icon: LucideIcon;
                              label: string;
                              mode: AppState['activeMode'];
                            }>
                          ).map((cap, i) => (
                            <motion.button
                              key={cap.label}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.05 }}
                              onClick={() => {
                                setState((prev) => ({
                                  ...prev,
                                  activeMode: coerceActiveMode(cap.mode, prev.activeMode),
                                  isSearchOpen: false,
                                }));
                              }}
                              className="flex items-center gap-6 p-6 rounded-sm border border-purple-500/15 bg-[#1a103c]/20 hover:bg-[#1a103c]/40 hover:border-gold-500/20 transition-all duration-500 group text-left"
                            >
                              <div className="p-3 bg-purple-500/10 rounded-sm group-hover:bg-gold-500/10 transition-colors">
                                <cap.icon size={20} className="text-stone-500 group-hover:text-gold-500" />
                              </div>
                              <span className="text-sm text-stone group-hover:text-ivory transition-colors font-serif">{cap.label}</span>
                            </motion.button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-6">
                        <h4 className="text-[10px] uppercase tracking-[0.4em] text-stone/40 font-bold px-4">Recent Inquiries</h4>
                        <div className="space-y-2">
                          {state.recentQuestions.slice(0, 3).map((q, i) => (
                            <button
                              key={q.id}
                              onClick={() => {
                                setQuery(q.text);
                                inputRef.current?.focus();
                              }}
                              className="w-full flex items-center gap-6 p-4 rounded-sm hover:bg-[#1a103c]/30 transition-all group text-left"
                            >
                              <Activity size={16} className="text-purple-500/40 group-hover:text-gold-500/60" />
                              <span className="text-sm text-stone/60 group-hover:text-ivory transition-colors truncate">{q.text}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  ) : results.length > 0 ? (
                    <motion.div
                      key="results"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-2 py-4"
                    >
                      {results.map((result, i) => (
                        <motion.button
                          key={result.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.03 }}
                          onClick={() => handleSelect(result)}
                          className={cn(
                            "w-full flex items-start gap-6 p-6 rounded-sm border transition-all duration-500 group text-left relative overflow-hidden",
                            selectedIndex === i 
                              ? "bg-[#1a103c]/40 border-gold-500/30 shadow-lg" 
                              : "bg-transparent border-transparent hover:bg-[#1a103c]/20 hover:border-purple-500/20"
                          )}
                          onMouseEnter={() => setSelectedIndex(i)}
                        >
                          {selectedIndex === i && (
                            <motion.div 
                              layoutId="active-bg"
                              className="absolute inset-0 bg-gold-500/[0.02] pointer-events-none"
                            />
                          )}
                          <div className={cn(
                            "p-4 rounded-sm transition-all duration-500",
                            selectedIndex === i ? "bg-gold-500/20 text-gold-500" : "bg-purple-500/10 text-stone-500"
                          )}>
                            <result.icon size={24} />
                          </div>
                          <div className="space-y-2 flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h3 className={cn(
                                "text-xl font-serif transition-colors duration-500 truncate",
                                selectedIndex === i ? "text-gold-500" : "text-ivory/80"
                              )}>
                                {result.title}
                              </h3>
                              <span className="text-[9px] uppercase tracking-widest text-stone/40 font-bold">{result.type}</span>
                            </div>
                            {result.subtitle && (
                              <p className="text-sm text-stone/60 line-clamp-1 italic font-serif">{result.subtitle}</p>
                            )}
                          </div>
                          <ChevronRight size={20} className={cn(
                            "mt-4 transition-all duration-500",
                            selectedIndex === i ? "text-gold-500 opacity-100 translate-x-0" : "text-stone/20 opacity-0 -translate-x-4"
                          )} />
                        </motion.button>
                      ))}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="no-results"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="py-20 text-center space-y-6"
                    >
                      <div className="w-20 h-20 bg-purple-500/5 rounded-full flex items-center justify-center mx-auto border border-purple-500/10">
                        <Search size={32} className="text-purple-500/40" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-ivory/60 font-serif text-xl">No resonance found for "{query}"</p>
                        <p className="text-sm text-stone/40">Try searching for broader concepts or system modes.</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Footer / Shortcuts */}
            <div className="bg-[#050505]/40 border-t border-purple-500/15 p-4 flex items-center justify-between px-10">
              <div className="flex items-center gap-8">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-purple-500/10 border border-purple-500/20 rounded-sm">
                    <span className="text-[9px] text-stone-400 font-mono font-bold">↑↓</span>
                  </div>
                  <span className="text-[10px] text-stone/40 uppercase tracking-widest font-bold">Navigate</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-purple-500/10 border border-purple-500/20 rounded-sm">
                    <span className="text-[9px] text-stone-400 font-mono font-bold">ENTER</span>
                  </div>
                  <span className="text-[10px] text-stone/40 uppercase tracking-widest font-bold">Open</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-stone/40 uppercase tracking-widest font-bold">Escape to close</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
