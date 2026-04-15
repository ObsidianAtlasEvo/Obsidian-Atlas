import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HelpCircle, ChevronRight, Shield, Brain, Target, Zap, Activity, BookOpen, Database, Scale, Compass } from 'lucide-react';
import { cn } from '../lib/utils';
import { globalEvolutionEngine } from '../lib/atlasEvolution';

interface SovereignCodexProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (route: string) => void;
}

const CODEX_FEATURES = [
  {
    id: 'crucible',
    title: 'The Crucible',
    icon: Shield,
    route: 'crucible',
    objective: 'The proof-ground where ideas are tested for logical fallacies and "True-North" alignment.',
    intent: 'To prevent confirmation bias and ensure decisions are forged under rigorous epistemic pressure.',
    guidelines: 'Submit high-stakes decisions or beliefs. Atlas will red-team them, searching for structural weaknesses before you commit.'
  },
  {
    id: 'mirrorforge',
    title: 'Mirrorforge',
    icon: Brain,
    route: 'mirrorforge',
    objective: 'A high-fidelity reality engine for simulating strategic outcomes and social dynamics.',
    intent: 'To allow safe exploration of complex, multi-agent scenarios before executing them in reality.',
    guidelines: 'Define the actors, the tension, and the stakes. Atlas will simulate the cascading consequences of your proposed actions.'
  },
  {
    id: 'gaps',
    title: 'The Gaps',
    icon: Target,
    route: 'gap-ledger',
    objective: 'An autonomous diagnostic layer that identifies architectural weaknesses in your current intelligence state.',
    intent: 'To proactively surface blind spots and vulnerabilities in your reasoning, strategy, or knowledge base.',
    guidelines: 'Review the ledger regularly. Address identified gaps by initiating structural repairs or deep-dive inquiries.'
  },
  {
    id: 'chrysalis',
    title: 'Chrysalis',
    icon: Zap,
    route: 'chrysalis',
    objective: 'The evolution tracker where your Atlas\'s neural synthesis becomes visible.',
    intent: 'To provide transparency into how Atlas is adapting its reasoning and communication to your unique cognitive signature.',
    guidelines: 'Monitor your evolution profile. Engage with suggested alignment rituals to refine Atlas\'s understanding of your sovereign intent.'
  },
  {
    id: 'graph',
    title: 'Atlas Graph',
    icon: Activity,
    route: 'atlas',
    objective: 'A visual representation of your interconnected knowledge, decisions, and patterns.',
    intent: 'To reveal the hidden topology of your thought, showing how disparate ideas cluster and influence each other.',
    guidelines: 'Use the graph to identify central nodes, isolated concepts, and emerging structural tensions.'
  },
  {
    id: 'journal',
    title: 'Journal Chamber',
    icon: BookOpen,
    route: 'journal',
    objective: 'A secure space for unstructured reflection and cognitive anchoring.',
    intent: 'To capture raw thought before it is structured into doctrine or decisions, providing vital context for Atlas\'s evolution.',
    guidelines: 'Log daily reflections, unresolved tensions, and nascent ideas. Atlas will use this to calibrate its understanding of your internal state.'
  },
  {
    id: 'console',
    title: 'Sovereign Console',
    icon: Database,
    route: 'creator-console',
    objective: 'The administrative interface for managing your Atlas instance and reviewing system telemetry.',
    intent: 'To provide total control and visibility over the system\'s operations, ensuring it remains aligned with your directives.',
    guidelines: 'Review audit logs, manage system settings, and monitor the health of your intelligence architecture.'
  },
  {
    id: 'decisions',
    title: 'Decisions & Doctrine',
    icon: Scale,
    route: 'decisions',
    objective: 'The repository for your finalized strategic choices and foundational principles.',
    intent: 'To codify your sovereign intent, creating a stable foundation for future reasoning and action.',
    guidelines: 'Record major decisions and the rationale behind them. Distill recurring truths into personal doctrine.'
  }
];

export function SovereignCodex({ isOpen, onClose, onNavigate }: SovereignCodexProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
        >
          <div className="absolute inset-0 bg-[#050505]/80 backdrop-blur-2xl cursor-pointer" onClick={onClose} />
          
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col glass-obsidian border border-purple-500/15 shadow-2xl rounded-sm"
          >
          <div className="p-6 border-b border-purple-500/15 flex items-center justify-between bg-[#0f0a1e]/40">
            <div className="flex items-center gap-3">
              <Compass className="text-gold-500 w-5 h-5" />
              <h2 className="text-gold-500 uppercase tracking-[0.3em] font-mono text-sm font-bold">Sovereign Codex</h2>
            </div>
            <button onClick={onClose} className="text-stone-500 hover:text-ivory transition-colors">
              <span className="sr-only">Close</span>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-2">
            {CODEX_FEATURES.map((feature, index) => {
              const isExpanded = expandedId === feature.id;
              
              return (
                <motion.div
                  key={feature.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="border border-purple-500/15 rounded-sm overflow-hidden bg-[#1a103c]/20"
                >
                  <button
                    onClick={() => {
                      const willExpand = !isExpanded;
                      setExpandedId(willExpand ? feature.id : null);
                      if (willExpand) {
                        globalEvolutionEngine.ingestUniversalSignal({
                          sourceModule: 'Codex',
                          type: 'CapabilitySpark',
                          content: feature.id,
                          noveltyScore: 0.55,
                          stabilityEstimate: 0.72,
                          timestamp: Date.now(),
                        });
                      }
                    }}
                    className="w-full flex items-center justify-between p-4 hover:bg-[#1a103c]/50 transition-colors group"
                  >
                    <div className="flex items-center gap-4">
                      <feature.icon className="w-4 h-4 text-stone-500 group-hover:text-gold-500 transition-colors" />
                      <span className="font-mono text-xs uppercase tracking-widest text-ivory/80 group-hover:text-gold-500 transition-colors">
                        {feature.title}
                      </span>
                    </div>
                    <ChevronRight 
                      className={cn(
                        "w-4 h-4 text-stone-600 transition-transform duration-300",
                        isExpanded && "rotate-90 text-gold-500"
                      )} 
                    />
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                        className="overflow-hidden"
                      >
                        <div className="p-6 pt-2 pb-6 flex gap-4">
                          <div className="w-[1px] bg-purple-500/30 shrink-0" />
                          <div className="space-y-6">
                            <div className="space-y-2">
                              <h4 className="text-[10px] font-mono uppercase tracking-widest text-stone-500">Functional Objective</h4>
                              <p className="text-sm text-stone-300 leading-[1.6] font-sans">{feature.objective}</p>
                            </div>
                            <div className="space-y-2">
                              <h4 className="text-[10px] font-mono uppercase tracking-widest text-stone-500">Architectural Intent</h4>
                              <p className="text-sm text-stone-300 leading-[1.6] font-sans">{feature.intent}</p>
                            </div>
                            <div className="space-y-2">
                              <h4 className="text-[10px] font-mono uppercase tracking-widest text-stone-500">Operational Guidelines</h4>
                              <p className="text-sm text-stone-300 leading-[1.6] font-sans">{feature.guidelines}</p>
                            </div>
                            
                            <div className="pt-4">
                              <button
                                onClick={() => {
                                  onNavigate(feature.route);
                                  onClose();
                                }}
                                className="w-full sm:w-auto px-6 py-3 border border-purple-500/30 bg-purple-500/5 text-gold-500 text-xs font-mono tracking-widest uppercase hover:bg-gold-500/20 hover:border-gold-500/50 hover:shadow-[0_0_15px_rgba(212,175,55,0.2)] hover:scale-[1.02] transition-all duration-300 rounded-sm"
                              >
                                [ INITIATE MODULE: {feature.title} ]
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);
}
