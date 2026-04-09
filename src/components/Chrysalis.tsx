import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  Target, 
  Activity, 
  TrendingUp, 
  AlertCircle, 
  ArrowRight,
  ChevronRight,
  FlaskConical,
  Dna,
  Shield,
  Cpu,
  History,
  Clock,
  ExternalLink,
  Search,
  Wrench,
  Code,
  Sparkles,
  Eye,
  EyeOff,
  Plus
} from 'lucide-react';
import { AppState, ChrysalisModel } from '../types';
import { cn } from '../lib/utils';
import { EvolutionView } from './EvolutionView';

import { db, logAudit } from '../services/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';

interface ChrysalisProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function Chrysalis({ state, setState }: ChrysalisProps) {
  const [activeTab, setActiveTab] = useState<'lab' | 'evolution' | 'governance'>('lab');
  const [isAddingExperiment, setIsAddingExperiment] = useState(false);
  const [newExpTitle, setNewExpTitle] = useState('');
  const [newExpTarget, setNewExpTarget] = useState('');
  const [mutationInput, setMutationInput] = useState('');
  const [mutationLog, setMutationLog] = useState<{role: 'user'|'atlas', text: string}[]>([]);
  const [isProcessingMutation, setIsProcessingMutation] = useState(false);

  const handleMutationSubmit = async () => {
    if (!mutationInput.trim()) return;
    setMutationLog(prev => [...prev, { role: 'user', text: mutationInput }]);
    setIsProcessingMutation(true);
    const input = mutationInput;
    setMutationInput('');

    try {
      const { processMutationRequest } = await import('../services/ollamaService');
      const result = await processMutationRequest(input);
      
      setMutationLog(prev => [...prev, { 
        role: 'atlas', 
        text: result.response
      }]);
      
      if (result.isImmediateUpgrade) {
        // Apply immediate upgrade to state
        setState(prev => ({
          ...prev,
          chrysalis: {
            ...prev.chrysalis,
            implementedUpgrades: [
              ...(prev.chrysalis.implementedUpgrades || []),
              {
                id: `upgrade-${Date.now()}`,
                title: result.proposalTitle,
                description: result.proposalDescription,
                timestamp: new Date().toISOString(),
                impact: result.upgradeImpact
              }
            ]
          }
        }));
        
        // Also log it to change control as deployed
        const newProposal = {
          title: result.proposalTitle,
          description: result.proposalDescription,
          class: result.proposalClass,
          status: 'deployed',
          proposedBy: state.currentUser?.uid || 'system',
          approvedBy: state.currentUser?.uid || 'system',
          createdAt: Timestamp.now(),
          rollbackSafe: true
        };
        await addDoc(collection(db, 'change_control'), newProposal);
        logAudit('Mutation Implemented', 'critical', { mutation: input, proposalTitle: result.proposalTitle });
      } else {
        // Add the proposal to Firestore
        const newProposal = {
          title: result.proposalTitle,
          description: result.proposalDescription,
          class: result.proposalClass,
          status: 'proposed',
          proposedBy: state.currentUser?.uid || 'system',
          createdAt: Timestamp.now(),
          rollbackSafe: true
        };
        
        await addDoc(collection(db, 'change_control'), newProposal);
        logAudit('Mutation Proposed', 'high', { mutation: input, proposalTitle: result.proposalTitle });
      }
      
    } catch (error) {
      console.error("Error processing mutation:", error);
      setMutationLog(prev => [...prev, { 
        role: 'atlas', 
        text: "An error occurred while analyzing the mutation. Please try again."
      }]);
    } finally {
      setIsProcessingMutation(false);
    }
  };

  const handleAddExperiment = async () => {
    if (!newExpTitle.trim() || !newExpTarget.trim()) return;

    const expId = `exp-${Date.now()}`;
    
    // Add pending experiment
    setState(prev => ({
      ...prev,
      chrysalis: {
        ...prev.chrysalis,
        experiments: [
          ...prev.chrysalis.experiments,
          {
            id: expId,
            title: newExpTitle,
            type: 'synthetic_user',
            status: 'running',
            targetWeakness: newExpTarget,
            impact: 'Simulating...',
            privacyScore: 100,
            safetyScore: 100
          }
        ]
      }
    }));

    const title = newExpTitle;
    const target = newExpTarget;
    
    setNewExpTitle('');
    setNewExpTarget('');
    setIsAddingExperiment(false);

    try {
      const { simulateExperiment } = await import('../services/ollamaService');
      const result = await simulateExperiment(title, target);
      
      setState(prev => ({
        ...prev,
        chrysalis: {
          ...prev.chrysalis,
          experiments: prev.chrysalis.experiments.map(exp => 
            exp.id === expId 
              ? { 
                  ...exp, 
                  status: 'passed', 
                  impact: result.impact, 
                  privacyScore: result.privacyScore, 
                  safetyScore: result.safetyScore 
                } 
              : exp
          )
        }
      }));
    } catch (error) {
      console.error("Error running experiment:", error);
      setState(prev => ({
        ...prev,
        chrysalis: {
          ...prev.chrysalis,
          experiments: prev.chrysalis.experiments.map(exp => 
            exp.id === expId 
              ? { ...exp, status: 'failed', impact: 'Simulation failed.' } 
              : exp
          )
        }
      }));
    }
  };

  const handleInitiateEvolution = () => {
    setState(prev => ({
      ...prev,
      chrysalis: {
        ...prev.chrysalis,
        weaknessLedger: prev.chrysalis.weaknessLedger.filter(w => w.severity !== 'critical')
      }
    }));
  };

  return (
    <div className="h-full flex flex-col gap-8 p-8 overflow-y-auto custom-scrollbar bg-obsidian">
      {/* Header Section */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 text-gold">
          <Sparkles size={24} />
          <h1 className="text-3xl font-serif text-ivory tracking-tight">Chrysalis</h1>
        </div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-stone opacity-60">
          The self-evolution and refinement of Atlas
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-8 border-b border-titanium/10">
        {['lab', 'evolution', 'governance'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={cn(
              "pb-4 text-[10px] font-bold uppercase tracking-[0.3em] transition-all relative",
              activeTab === tab ? "text-gold" : "text-stone opacity-40 hover:opacity-100"
            )}
          >
            {tab}
            {activeTab === tab && (
              <motion.div 
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold shadow-[0_0_10px_rgba(255,215,0,0.5)]"
              />
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
        {/* Left Column: Active Experiments & Weakness Ledger */}
        <div className="lg:col-span-8 space-y-8">
          <AnimatePresence mode="wait">
            {activeTab === 'lab' && (
              <motion.div
                key="lab"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* Active Experiments */}
                <div className="glass-panel p-8 space-y-8">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold text-gold uppercase tracking-[0.3em]">Active Experiments</h3>
                      <p className="text-[10px] text-stone uppercase tracking-widest opacity-40">Synthetic users, scenarios, and architecture tests</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setIsAddingExperiment(!isAddingExperiment)}
                        className="p-2 bg-gold/10 text-gold hover:bg-gold/20 rounded-sm transition-all"
                      >
                        <Plus size={16} />
                      </button>
                      <FlaskConical size={16} className="text-gold opacity-40" />
                    </div>
                  </div>

                  <AnimatePresence>
                    {isAddingExperiment && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-4 overflow-hidden"
                      >
                        <input
                          type="text"
                          value={newExpTitle}
                          onChange={(e) => setNewExpTitle(e.target.value)}
                          placeholder="Experiment Title..."
                          className="w-full bg-obsidian/40 border border-titanium/10 rounded-sm p-3 text-xs text-ivory placeholder:text-stone/40 focus:border-gold/50 outline-none"
                        />
                        <input
                          type="text"
                          value={newExpTarget}
                          onChange={(e) => setNewExpTarget(e.target.value)}
                          placeholder="Target Weakness..."
                          className="w-full bg-obsidian/40 border border-titanium/10 rounded-sm p-3 text-xs text-ivory placeholder:text-stone/40 focus:border-gold/50 outline-none"
                        />
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => setIsAddingExperiment(false)}
                            className="px-4 py-2 text-[10px] uppercase tracking-widest text-stone hover:text-ivory transition-colors"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={handleAddExperiment}
                            className="px-4 py-2 bg-gold/20 text-gold hover:bg-gold/30 text-[10px] uppercase tracking-widest rounded-sm transition-colors"
                          >
                            Launch Experiment
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {state.chrysalis.experiments.map(exp => (
                      <div 
                        key={exp.id}
                        className="p-6 bg-titanium/5 border border-titanium/10 rounded-sm hover:border-gold/30 transition-all group cursor-pointer"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="space-y-1">
                            <h4 className="text-[11px] font-bold text-ivory uppercase tracking-widest">{exp.title}</h4>
                            <span className="text-[8px] font-mono uppercase tracking-widest text-stone opacity-60">{exp.type}</span>
                          </div>
                          <div className={cn(
                            "px-2 py-1 rounded-full text-[8px] font-mono uppercase tracking-widest",
                            exp.status === 'running' ? "bg-gold/10 text-gold animate-pulse" : "bg-titanium/10 text-stone"
                          )}>
                            {exp.status}
                          </div>
                        </div>
                        <p className="text-[10px] text-stone leading-relaxed opacity-60 group-hover:opacity-100 transition-opacity mb-4">
                          Targeting: {exp.targetWeakness}
                        </p>
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-titanium/10">
                          <div className="space-y-1">
                            <span className="text-[8px] font-mono uppercase tracking-widest text-stone">Privacy</span>
                            <div className="h-1 bg-titanium/10 rounded-full overflow-hidden">
                              <div className="h-full bg-teal" style={{ width: `${exp.privacyScore}%` }} />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[8px] font-mono uppercase tracking-widest text-stone">Safety</span>
                            <div className="h-1 bg-titanium/10 rounded-full overflow-hidden">
                              <div className="h-full bg-gold" style={{ width: `${exp.safetyScore}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Weakness Ledger */}
                <div className="glass-panel p-8 space-y-8">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold text-gold uppercase tracking-[0.3em]">Weakness Ledger</h3>
                      <p className="text-[10px] text-stone uppercase tracking-widest opacity-40">Known and emerging system vulnerabilities</p>
                    </div>
                    <AlertCircle size={16} className="text-gold opacity-40" />
                  </div>

                  <div className="space-y-4">
                    {state.chrysalis.weaknessLedger.map(weakness => (
                      <div 
                        key={weakness.id}
                        className="flex items-center gap-6 p-4 bg-titanium/5 border border-titanium/10 rounded-sm group"
                      >
                        <div className={cn(
                          "w-10 h-10 rounded-sm flex items-center justify-center border",
                          weakness.severity === 'critical' ? "bg-oxblood/10 border-oxblood/30 text-oxblood" : "bg-titanium/10 border-titanium/20 text-stone"
                        )}>
                          <AlertCircle size={16} />
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-3">
                            <h4 className="text-[11px] font-bold text-ivory uppercase tracking-widest">{weakness.title}</h4>
                            <span className="text-[8px] font-mono uppercase tracking-widest text-stone opacity-40">{weakness.domain}</span>
                          </div>
                          <p className="text-[10px] text-stone opacity-60 italic">{weakness.proposedAction}</p>
                        </div>
                        <div className="text-right space-y-1">
                          <span className="text-[8px] font-mono uppercase tracking-widest text-stone">Visibility Risk</span>
                          <div className="text-[10px] font-bold text-ivory">{weakness.visibilityRisk}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
            {activeTab === 'evolution' && (
              <motion.div
                key="evolution"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <EvolutionView state={state} setState={setState} />
              </motion.div>
            )}
            {activeTab === 'governance' && (
              <motion.div
                key="governance"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="glass-panel p-8 space-y-8">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold text-gold uppercase tracking-[0.3em]">Governance Policies</h3>
                      <p className="text-[10px] text-stone uppercase tracking-widest opacity-40">Rules governing system autonomy</p>
                    </div>
                    <Shield size={16} className="text-gold opacity-40" />
                  </div>
                  <div className="space-y-4">
                    <div className="p-4 bg-titanium/5 border border-titanium/10 rounded-sm">
                      <p className="text-[10px] text-stone italic">Governance policies are currently operating under default parameters.</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Column: Model Comparisons & System Health */}
        <div className="lg:col-span-4 space-y-8">
          <div className="glass-panel p-8 space-y-8 border-gold/20 bg-gold/5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-gold uppercase tracking-[0.3em]">Model Comparisons</h3>
                <p className="text-[10px] text-stone uppercase tracking-widest opacity-40">Side-by-side architectural evaluations</p>
              </div>
              <Cpu size={16} className="text-gold opacity-40" />
            </div>

            <div className="space-y-8">
              {state.chrysalis.modelComparisons.map(comp => (
                <div key={comp.id} className="space-y-6">
                  {comp.architectures.map(arch => (
                    <div 
                      key={arch.name}
                      className={cn(
                        "p-6 rounded-sm border transition-all duration-500",
                        arch.isSelected ? "bg-gold/10 border-gold/30 shadow-[0_0_20px_rgba(255,215,0,0.1)]" : "bg-titanium/5 border-titanium/10 opacity-60"
                      )}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-[11px] font-bold text-ivory uppercase tracking-widest">{arch.name}</h4>
                        {arch.isSelected && <div className="px-2 py-0.5 bg-gold text-obsidian text-[8px] font-bold uppercase tracking-widest rounded-full">Active</div>}
                      </div>
                      <p className="text-[10px] text-stone leading-relaxed mb-4">{arch.performance}</p>
                      <div className="space-y-2">
                        <span className="text-[8px] font-mono uppercase tracking-widest text-stone">Elegance Score</span>
                        <div className="h-1 bg-titanium/10 rounded-full overflow-hidden">
                          <div className="h-full bg-gold" style={{ width: `${arch.elegance}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              <div className="pt-8 border-t border-titanium/10 space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-stone">System Integrity</span>
                  <span className="text-[9px] font-mono text-gold">99.9%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-stone">Evolution Rate</span>
                  <span className="text-[9px] font-mono text-gold">+12.4% / wk</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-stone">Privacy Lockdown</span>
                  <span className="text-[9px] font-mono text-teal">Absolute</span>
                </div>

                <button 
                  onClick={handleInitiateEvolution}
                  className="w-full py-4 border border-gold/30 text-gold hover:bg-gold/10 transition-all text-[10px] font-bold uppercase tracking-[0.3em] flex items-center justify-center gap-2"
                >
                  Initiate Evolution <Zap size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Governance Snapshot */}
          <div className="glass-panel p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-gold uppercase tracking-[0.3em]">Governance Snapshot</h3>
              <Shield size={16} className="text-gold opacity-40" />
            </div>
            <div className="space-y-4">
              <div className="p-4 bg-titanium/5 border border-titanium/10 rounded-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-stone">Creator Sovereignty</span>
                  <Eye size={12} className="text-teal" />
                </div>
                <p className="text-[10px] text-stone opacity-60">Full administrative override active</p>
              </div>
              <div className="p-4 bg-titanium/5 border border-titanium/10 rounded-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-stone">Autonomous Refinement</span>
                  <EyeOff size={12} className="text-oxblood" />
                </div>
                <p className="text-[10px] text-stone opacity-60">Manual approval required for core changes</p>
              </div>
            </div>
          </div>

          {/* Mutation Console Chat */}
          <div className="glass-panel p-8 space-y-6 flex flex-col h-[400px]">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-gold uppercase tracking-[0.3em]">Mutation Console</h3>
                <p className="text-[10px] text-stone uppercase tracking-widest opacity-40">Direct architectural evolution</p>
              </div>
              <Code size={16} className="text-gold opacity-40" />
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-2">
              {mutationLog.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center">
                  <p className="text-xs text-stone opacity-50">Propose structural changes or new directives to Atlas. It will analyze the impact before implementation.</p>
                </div>
              ) : (
                mutationLog.map((entry, i) => (
                  <div key={i} className={cn(
                    "p-4 rounded-sm max-w-[85%]",
                    entry.role === 'user' 
                      ? "bg-titanium/10 border border-titanium/20 ml-auto" 
                      : "bg-gold/10 border border-gold/20 mr-auto"
                  )}>
                    <span className={cn(
                      "text-[8px] font-mono uppercase tracking-widest mb-2 block",
                      entry.role === 'user' ? "text-stone" : "text-gold"
                    )}>
                      {entry.role === 'user' ? 'Creator' : 'Atlas Core'}
                    </span>
                    <p className="text-xs text-ivory leading-relaxed">{entry.text}</p>
                  </div>
                ))
              )}
              {isProcessingMutation && (
                <div className="p-4 rounded-sm max-w-[85%] bg-gold/5 border border-gold/10 mr-auto">
                  <Activity size={14} className="text-gold animate-pulse" />
                </div>
              )}
            </div>

            <div className="relative mt-auto pt-4 border-t border-titanium/10">
              <input
                type="text"
                value={mutationInput}
                onChange={(e) => setMutationInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleMutationSubmit()}
                placeholder="Propose a mutation..."
                className="w-full bg-obsidian/40 border border-titanium/10 rounded-sm py-3 pl-4 pr-12 text-sm text-ivory placeholder:text-stone/40 focus:border-gold/50 outline-none"
              />
              <button
                onClick={handleMutationSubmit}
                disabled={!mutationInput.trim() || isProcessingMutation}
                className="absolute right-2 top-1/2 -translate-y-1/2 mt-2 p-2 text-gold hover:text-yellow-300 disabled:opacity-50 transition-colors"
              >
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
