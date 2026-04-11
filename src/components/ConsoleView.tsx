import React, { useState, useEffect, useCallback } from 'react';
import { AppState, EmergencyContainment, Gap, ChangeProposal, AuditLog } from '../types';
import { db, auth, logAudit, handleFirestoreError, OperationType } from '../services/firebase';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, orderBy, limit, Timestamp, addDoc, where, getDocs } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldAlert, 
  Activity, 
  Target, 
  Zap, 
  Lock, 
  ShieldCheck, 
  Settings, 
  Eye, 
  GitBranch, 
  AlertTriangle, 
  RefreshCw, 
  Search, 
  Database, 
  Fingerprint, 
  Key, 
  Smartphone,
  ChevronRight,
  ArrowRight,
  Layers,
  Brain,
  History,
  Terminal,
  Bug
} from 'lucide-react';
import { ATLAS_TRACE_CHANNEL, atlasTraceUserId } from '../lib/atlasTraceContext';
import { atlasApiUrl, atlasHttpEnabled } from '../lib/atlasApi';
import { cn } from '../lib/utils';
import { EmergencyActivationFlow } from './EmergencyActivationFlow';
import { GapLedger } from './GapLedger';
import { ChangeControl } from './ChangeControl';
import { AuditLogView } from './AuditLogView';
import { BugHunter } from './BugHunter';
import { SovereigntyControls } from './Settings/SovereigntyControls';

interface CreatorConsoleProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function ConsoleView({ state, setState }: CreatorConsoleProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'ai-governance' | 'gaps' | 'changes' | 'audit' | 'emergency' | 'console' | 'diagnostics'>('console');
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aiCommand, setAiCommand] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [isProcessingCommand, setIsProcessingCommand] = useState(false);
  
  // Console state
  const [consoleInput, setConsoleInput] = useState('');
  const [consoleHistory, setConsoleHistory] = useState<{ type: 'input' | 'output' | 'error', text: string, timestamp: string }[]>([
    { type: 'output', text: 'OBSIDIAN ATLAS KERNEL v4.2.0-STABLE', timestamp: new Date().toISOString() },
    { type: 'output', text: 'SECURE LINK ESTABLISHED. WELCOME, CREATOR.', timestamp: new Date().toISOString() },
  ]);

  // Fix 8: live Firestore metrics for Overview tab
  const [overviewMetrics, setOverviewMetrics] = useState<{ gaps: number | null; changes: number | null; audits: number | null }>({ gaps: null, changes: null, audits: null });

  useEffect(() => {
    if (activeTab !== 'overview') return;
    let cancelled = false;

    (async () => {
      try {
        // Active Gaps: gaps collection where status == 'open'
        const gapsSnap = await getDocs(query(collection(db, 'gaps'), where('status', '==', 'open')));
        const gapCount = gapsSnap.docs.length;

        // Pending Changes: change_control collection where status == 'pending'
        const changesSnap = await getDocs(query(collection(db, 'change_control'), where('status', '==', 'pending')));
        const changeCount = changesSnap.docs.length;

        // Audit Events: audit_log collection, total count
        const auditSnap = await getDocs(query(collection(db, 'audit_log')));
        const auditCount = auditSnap.docs.length;

        if (!cancelled) {
          setOverviewMetrics({ gaps: gapCount, changes: changeCount, audits: auditCount });
        }
      } catch {
        // Firestore unavailable — leave as null
      }
    })();

    return () => { cancelled = true; };
  }, [activeTab]);

  useEffect(() => {
    if (state.creatorConsoleState) {
      setActiveTab(state.creatorConsoleState.activeTab);
      if (state.creatorConsoleState.initialCommand) {
        setAiCommand(state.creatorConsoleState.initialCommand);
      }
      
      // Clear the state so it doesn't trigger again on subsequent renders
      setState(prev => ({
        ...prev,
        creatorConsoleState: undefined
      }));
    }
  }, [state.creatorConsoleState, setState]);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'console', label: 'System Console', icon: Terminal },
    { id: 'ai-governance', label: 'AI Governance', icon: Brain },
    { id: 'gaps', label: 'Gap Ledger', icon: Target },
    { id: 'changes', label: 'Change Control', icon: GitBranch },
    { id: 'audit', label: 'Audit Logs', icon: History },
    { id: 'diagnostics', label: 'Diagnostics', icon: Bug },
    { id: 'emergency', label: 'Emergency', icon: ShieldAlert },
  ];

  const handleConsoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consoleInput.trim()) return;

    // Fix 10: auth check
    if (!state.currentUser) {
      setConsoleHistory(prev => [...prev, { type: 'error', text: 'Authentication required. Please sign in to use the Sovereign Console.', timestamp: new Date().toLocaleTimeString() }]);
      return;
    }

    const input = consoleInput.trim();
    setConsoleInput('');

    // Add to history
    const timestamp = new Date().toLocaleTimeString();
    setConsoleHistory(prev => [...prev, { type: 'input', text: input, timestamp }]);

    // Fix 5: Route sys.status, vault.audit, atlas.reboot to backend like any other command.
    // Only show simulated output when the backend is unavailable (offline mode).
    const isSystemCommand = ['sys.status', 'vault.audit', 'atlas.reboot'].includes(input.toLowerCase());

    if (!atlasHttpEnabled() && isSystemCommand) {
      // Offline fallback: simulated output
      const simulated: Record<string, string> = {
        'sys.status': 'SYSTEM STATUS: NOMINAL\nCOGNITIVE LOAD: 14%\nMEMORY INTEGRITY: 99.9%\nACTIVE THREADS: 4\nUPTIME: 156:24:12\n(Simulated — backend offline)',
        'vault.audit': 'INITIATING VAULT AUDIT...\nSCANNING ENCRYPTED SECTORS...\nNO ANOMALIES DETECTED.\nALL SOVEREIGN DATA SECURE.\n(Simulated — backend offline)',
        'atlas.reboot': 'REBOOT COMMAND RECEIVED.\nWARM RESTART INITIATED...\nRELOADING COGNITIVE MODULES...\nSYSTEM RESTORED.\n(Simulated — backend offline)',
      };
      setConsoleHistory(prev => [...prev, { type: 'output', text: simulated[input.toLowerCase()] ?? '', timestamp }]);
      return;
    }

    // Unknown command check for sys/vault/atlas prefixes (only non-system commands)
    if (!isSystemCommand && input.includes('.') && (input.startsWith('sys') || input.startsWith('vault') || input.startsWith('atlas'))) {
      setConsoleHistory(prev => [...prev, { type: 'error', text: `COMMAND NOT RECOGNIZED: ${input}`, timestamp }]);
      return;
    }

    // Route to Atlas backend
    try {
      if (atlasHttpEnabled()) {
        const res = await fetch(atlasApiUrl('/v1/governance/console-command'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: `[CONTEXT: system_console] ${input}`,
            userId: atlasTraceUserId(state),
            userEmail: state.currentUser?.email,
            channel: ATLAS_TRACE_CHANNEL.consoleTerminal,
          }),
        });
        if (res.ok) {
          const data = await res.json() as { response?: string };
          setConsoleHistory(prev => [...prev, { type: 'output', text: data.response ?? 'Command received.', timestamp }]);
        } else {
          // Fallback to local service if backend endpoint not yet deployed
          throw new Error(`Backend returned ${res.status}`);
        }
      } else {
        throw new Error('No backend available');
      }
    } catch {
      // Graceful fallback: try ollamaService, then surface a clear error
      try {
        const { processGovernanceCommand } = await import('../services/ollamaService');
        const result = await processGovernanceCommand(
          `[CONTEXT: system_console] ${input}`,
          state.currentUser?.email || undefined,
          { userId: atlasTraceUserId(state), channel: ATLAS_TRACE_CHANNEL.consoleTerminal }
        );
        setConsoleHistory(prev => [...prev, { type: 'output', text: result.response, timestamp }]);
      } catch {
        setConsoleHistory(prev => [...prev, {
          type: 'error',
          text: 'COMMUNICATION ERROR: Backend unreachable. Ensure VITE_ATLAS_API_URL is set and the server is running.',
          timestamp
        }]);
      }
    }
  };

  const handleAiCommand = useCallback(async () => {
    if (!aiCommand.trim()) return;

    // Fix 10: auth check
    if (!state.currentUser) {
      setAiResponse('Authentication required. Please sign in to use the Sovereign Console.');
      return;
    }

    setIsProcessingCommand(true);
    setAiResponse(null);

    const executeCommand = async (): Promise<{
      response: string;
      proposalTitle: string;
      proposalDescription: string;
      proposalClass: 0 | 1 | 2 | 3 | 4;
      isImmediateUpgrade: boolean;
      upgradeImpact: string;
    }> => {
      // Try Atlas backend first (works in production)
      if (atlasHttpEnabled()) {
        const res = await fetch(atlasApiUrl('/v1/governance/ai-command'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: aiCommand,
            userId: atlasTraceUserId(state),
            userEmail: state.currentUser?.email,
            channel: ATLAS_TRACE_CHANNEL.consoleGovernance,
          }),
        });
        if (res.ok) {
          return res.json() as Promise<{
            response: string;
            proposalTitle: string;
            proposalDescription: string;
            proposalClass: 0 | 1 | 2 | 3 | 4;
            isImmediateUpgrade: boolean;
            upgradeImpact: string;
          }>;
        }
        // Non-2xx: fall through to local service
      }
      // Fallback: local Ollama (dev only)
      const { processGovernanceCommand } = await import('../services/ollamaService');
      return processGovernanceCommand(aiCommand, state.currentUser?.email || undefined, {
        userId: atlasTraceUserId(state),
        channel: ATLAS_TRACE_CHANNEL.consoleGovernance,
      });
    };

    try {
      const result = await executeCommand();
      // Fix 7: Display AI response immediately — Firestore write is best-effort
      setAiResponse(result.response);

      if (result.isImmediateUpgrade) {
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
                impact: result.upgradeImpact,
              },
            ],
          },
        }));
        // Firestore write is best-effort — never clobbers the displayed response
        addDoc(collection(db, 'change_control'), {
          title: result.proposalTitle,
          description: result.proposalDescription,
          class: result.proposalClass,
          status: 'deployed',
          proposedBy: state.currentUser?.uid || 'system',
          approvedBy: state.currentUser?.uid || 'system',
          createdAt: Timestamp.now(),
          rollbackSafe: true,
        }).catch((firestoreErr) => {
          console.warn('[ConsoleView] Firestore write failed (non-fatal):', firestoreErr);
        });
        logAudit('Governance Command Implemented', 'critical', {
          command: aiCommand,
          proposalTitle: result.proposalTitle,
        });
      } else {
        // Firestore write is best-effort — never clobbers the displayed response
        addDoc(collection(db, 'change_control'), {
          title: result.proposalTitle,
          description: result.proposalDescription,
          class: result.proposalClass,
          status: 'proposed',
          proposedBy: state.currentUser?.uid || 'system',
          createdAt: Timestamp.now(),
          rollbackSafe: true,
        }).catch((firestoreErr) => {
          console.warn('[ConsoleView] Firestore write failed (non-fatal):', firestoreErr);
        });
        logAudit('Governance Command Executed', 'high', {
          command: aiCommand,
          proposalTitle: result.proposalTitle,
        });
      }
      setAiCommand('');
    } catch (error) {
      console.error('Error executing governance command:', error);
      setAiResponse(
        'Command could not be processed. Ensure the Atlas backend is reachable and your sovereign session is active.'
      );
    } finally {
      setIsProcessingCommand(false);
    }
  }, [aiCommand, state, setState]);

  return (
    <div className="h-full flex flex-col bg-obsidian overflow-hidden">
      {/* Header */}
      <header className="p-8 border-b border-titanium/10 flex items-center justify-between bg-graphite/40">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gold/10 border border-gold/20 rounded-sm">
            <ShieldCheck size={24} className="text-gold" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-serif text-ivory tracking-tight">Sovereign Creator Console</h1>
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-stone">Governance & Architectural Control</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-mono uppercase tracking-widest text-stone">System Health</span>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
              <span className="text-xs text-ivory font-medium">Nominal</span>
            </div>
          </div>
          <div className="h-8 w-px bg-titanium/10" />
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-mono uppercase tracking-widest text-stone">Creator Session</span>
            <div className="flex items-center gap-2">
              <ShieldCheck size={12} className="text-gold" />
              <span className="text-xs text-gold font-bold uppercase tracking-widest">Sovereign</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sub-navigation */}
        <nav className="w-64 border-r border-titanium/10 p-6 space-y-2 bg-graphite/20">
          <AnimatePresence>
            {tabs.map((tab, index) => (
              <motion.button
                key={tab.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "w-full flex items-center gap-4 p-3 rounded-sm transition-all duration-300 group",
                  activeTab === tab.id 
                    ? "bg-gold-500/5 border border-gold-500/20 text-gold-500 shadow-[0_0_15px_rgba(212,175,55,0.03)]" 
                    : "text-stone hover:text-ivory hover:bg-stone-800/20 hover:border-stone-700 border border-transparent"
                )}
              >
                <tab.icon size={18} className={cn(
                  "transition-all duration-300",
                  activeTab === tab.id ? "text-gold-500" : "text-stone group-hover:text-ivory"
                )} />
                <span className="text-[10px] font-mono uppercase tracking-widest font-bold">{tab.label}</span>
              </motion.button>
            ))}
          </AnimatePresence>
        </nav>

        {/* View Area */}
        <main className="flex-1 overflow-y-auto p-12 custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-6xl mx-auto space-y-12"
            >
              {activeTab === 'console' && (
                <div className="h-[70vh] flex flex-col bg-obsidian/40 border border-titanium/10 rounded-sm overflow-hidden">
                  {/* Console History */}
                  <div className="flex-1 p-6 font-mono text-xs space-y-3 overflow-y-auto custom-scrollbar">
                    {consoleHistory.map((entry, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center gap-3 opacity-30">
                          <span className="text-[8px] tracking-widest">{entry.timestamp}</span>
                          <div className="h-px flex-1 bg-titanium/10" />
                        </div>
                        <div className={cn(
                          "leading-relaxed whitespace-pre-wrap",
                          entry.type === 'input' ? "text-gold" : entry.type === 'error' ? "text-red-500" : "text-stone"
                        )}>
                          {entry.type === 'input' && <span className="mr-2 opacity-50">$</span>}
                          {entry.text}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Terminal Input */}
                  <form onSubmit={handleConsoleSubmit} className="p-4 bg-graphite/60 border-t border-titanium/10 flex items-center gap-4">
                    <Terminal size={14} className="text-gold opacity-50" />
                    <input
                      type="text"
                      value={consoleInput}
                      onChange={(e) => setConsoleInput(e.target.value)}
                      placeholder="ENTER SYSTEM COMMAND..."
                      className="flex-1 bg-transparent border-none focus:outline-none text-xs font-mono text-ivory tracking-widest placeholder:text-stone/30"
                    />
                    <button 
                      type="submit"
                      className="text-[10px] font-mono text-stone hover:text-gold transition-colors uppercase tracking-widest"
                    >
                      Execute
                    </button>
                  </form>
                </div>
              )}

              {activeTab === 'overview' && (
                <div className="space-y-12">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="p-8 bg-titanium/5 border border-titanium/10 rounded-sm space-y-6">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-stone">Active Gaps</span>
                        <Target size={16} className="text-gold" />
                      </div>
                      <div className="flex items-end gap-3">
                        <span className="text-4xl font-serif text-ivory">
                          {overviewMetrics.gaps !== null ? overviewMetrics.gaps : (
                            <RefreshCw size={24} className="animate-spin text-stone/40" />
                          )}
                        </span>
                        <span className="text-[10px] text-stone mb-1 uppercase tracking-widest">Identified</span>
                      </div>
                      <div className="pt-4 border-t border-titanium/10">
                        <p className="text-[10px] text-stone leading-relaxed">
                          {overviewMetrics.gaps !== null ? `${overviewMetrics.gaps} open gaps in the ledger.` : 'Loading...'}
                        </p>
                      </div>
                    </div>
                    <div className="p-8 bg-titanium/5 border border-titanium/10 rounded-sm space-y-6">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-stone">Pending Changes</span>
                        <GitBranch size={16} className="text-gold" />
                      </div>
                      <div className="flex items-end gap-3">
                        <span className="text-4xl font-serif text-ivory">
                          {overviewMetrics.changes !== null ? overviewMetrics.changes : (
                            <RefreshCw size={24} className="animate-spin text-stone/40" />
                          )}
                        </span>
                        <span className="text-[10px] text-stone mb-1 uppercase tracking-widest">In Queue</span>
                      </div>
                      <div className="pt-4 border-t border-titanium/10">
                        <p className="text-[10px] text-stone leading-relaxed">
                          {overviewMetrics.changes !== null ? `${overviewMetrics.changes} pending proposals awaiting review.` : 'Loading...'}
                        </p>
                      </div>
                    </div>
                    <div className="p-8 bg-titanium/5 border border-titanium/10 rounded-sm space-y-6">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-stone">Audit Events</span>
                        <History size={16} className="text-gold" />
                      </div>
                      <div className="flex items-end gap-3">
                        <span className="text-4xl font-serif text-ivory">
                          {overviewMetrics.audits !== null ? overviewMetrics.audits : (
                            <RefreshCw size={24} className="animate-spin text-stone/40" />
                          )}
                        </span>
                        <span className="text-[10px] text-stone mb-1 uppercase tracking-widest">Total</span>
                      </div>
                      <div className="pt-4 border-t border-titanium/10">
                        <p className="text-[10px] text-stone leading-relaxed">
                          {overviewMetrics.audits !== null ? `${overviewMetrics.audits} events logged.` : 'Loading...'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <SovereigntyControls userId={atlasTraceUserId(state)} className="max-w-3xl" />

                  <section className="space-y-6">
                    <h3 className="text-xs font-bold text-gold uppercase tracking-[0.3em] flex items-center gap-3">
                      <Layers size={16} /> Architecture Health Map
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {['Identity', 'Auth', 'Memory', 'Reasoning', 'Privacy', 'Security', 'UI/UX', 'System'].map(module => (
                        <div key={module} className="p-6 bg-graphite/40 border border-titanium/10 rounded-sm flex flex-col items-center gap-4 group hover:border-gold/30 transition-all">
                          <div className="w-2 h-2 rounded-full bg-teal shadow-[0_0_8px_rgba(20,184,166,0.4)]" />
                          <span className="text-[10px] font-mono uppercase tracking-widest text-ivory">{module}</span>
                          <span className="text-[8px] text-stone uppercase tracking-widest">Operational</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {activeTab === 'ai-governance' && (
                <div className="space-y-8 max-w-4xl mx-auto">
                  <div className="p-8 bg-titanium/5 border border-titanium/10 rounded-sm space-y-6">
                    <div className="flex items-center gap-3 border-b border-titanium/10 pb-4">
                      <Terminal size={24} className="text-gold" />
                      <div>
                        <h2 className="text-lg font-serif text-ivory tracking-tight">AI Governance Tool</h2>
                        <p className="text-[10px] font-mono uppercase tracking-widest text-stone">Direct System Modification via Natural Language</p>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <p className="text-xs text-stone leading-relaxed">
                        Issue commands to Atlas to modify system architecture, adjust parameters, or draft new directives. Atlas will analyze the request and propose safe changes.
                      </p>
                      
                      <div className="relative">
                        <textarea
                          value={aiCommand}
                          onChange={(e) => setAiCommand(e.target.value)}
                          placeholder="e.g., 'Increase the strictness of the synthesis layer to prevent hallucinated personalization' or 'Add a new directive for handling contradictory evidence'"
                          className="w-full h-32 bg-graphite/50 border border-titanium/20 rounded-sm p-4 text-sm text-ivory placeholder:text-stone/50 focus:outline-none focus:border-gold/50 transition-colors resize-none"
                        />
                        <button
                          onClick={handleAiCommand}
                          disabled={isProcessingCommand || !aiCommand.trim()}
                          className="absolute bottom-4 right-4 px-4 py-2 bg-gold text-obsidian text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-ivory transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {isProcessingCommand ? (
                            <>
                              <RefreshCw size={14} className="animate-spin" /> Processing
                            </>
                          ) : (
                            <>
                              Execute <ArrowRight size={14} />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {aiResponse && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-6 bg-gold/5 border border-gold/20 rounded-sm space-y-4"
                    >
                      <div className="flex items-center gap-2 text-gold">
                        <Brain size={16} />
                        <span className="text-[10px] font-mono uppercase tracking-widest font-bold">Atlas Response</span>
                      </div>
                      <p className="text-sm text-ivory/90 leading-relaxed whitespace-pre-wrap">
                        {aiResponse}
                      </p>
                    </motion.div>
                  )}
                </div>
              )}

              {activeTab === 'gaps' && (
                <div className="h-[80vh]">
                  <GapLedger state={state} setState={setState} />
                </div>
              )}

              {activeTab === 'changes' && (
                <div className="h-[80vh]">
                  <ChangeControl state={state} setState={setState} />
                </div>
              )}

              {activeTab === 'audit' && (
                <div className="h-[80vh]">
                  <AuditLogView state={state} setState={setState} />
                </div>
              )}

              {activeTab === 'diagnostics' && (
                <div className="h-[80vh]">
                  <BugHunter state={state} setState={setState} embedded />
                </div>
              )}

              {activeTab === 'emergency' && (
                <div className="space-y-12">
                  <div className="p-12 bg-red-500/5 border border-red-500/20 rounded-sm space-y-8 text-center max-w-3xl mx-auto">
                    <ShieldAlert size={64} className="text-red-500 mx-auto" />
                    <div className="space-y-4">
                      <h2 className="text-3xl font-serif text-ivory tracking-tight uppercase tracking-[0.2em]">Emergency Containment Switch</h2>
                      <p className="text-stone text-[10px] uppercase tracking-widest leading-relaxed opacity-60">
                        This is a high-security mechanism for catastrophic scenarios. Activating containment will immediately suspend all non-creator access, freeze data writes, and lock down the architecture.
                      </p>
                    </div>

                    {state.emergencyStatus?.active ? (
                      <div className="space-y-6">
                        <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-sm space-y-4">
                          <div className="flex items-center justify-center gap-3 text-red-500">
                            <Activity size={20} className="animate-pulse" />
                            <span className="text-lg font-bold uppercase tracking-widest">Containment Active</span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-[10px] uppercase tracking-widest text-stone">
                            <div className="text-left">Level: <span className="text-ivory">{state.emergencyStatus.level}</span></div>
                            <div className="text-right">Activated: <span className="text-ivory">{new Date(state.emergencyStatus.activatedAt!).toLocaleString()}</span></div>
                          </div>
                        </div>
                        <button 
                          onClick={() => setShowEmergencyModal(true)}
                          disabled={loading}
                          className="w-full py-4 bg-emerald-500/10 border border-emerald-500/40 text-emerald-500 font-bold uppercase tracking-widest text-xs hover:bg-emerald-500/20 transition-all"
                        >
                          Initiate Recovery Protocol
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setShowEmergencyModal(true)}
                        className="w-full py-4 bg-red-500/10 border border-red-500/40 text-red-500 font-bold uppercase tracking-widest text-xs hover:bg-red-500/20 transition-all"
                      >
                        Initiate Emergency Containment
                      </button>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Emergency Activation Modal */}
      <AnimatePresence>
        {showEmergencyModal && (
          <EmergencyActivationFlow 
            state={state} 
            onClose={() => setShowEmergencyModal(false)} 
            isLifting={state.emergencyStatus?.active}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
