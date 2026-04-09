// Atlas-Audit: [EXEC-MF] Verified — Mirrorforge dialogue uses conductMirrorforgeReflection (ollama path) instead of canned setTimeout text.
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  Zap, 
  Target, 
  Activity, 
  Brain, 
  TrendingUp, 
  AlertCircle, 
  ArrowRight,
  ChevronRight,
  Fingerprint,
  Compass,
  Layers,
  History,
  Plus
} from 'lucide-react';
import { AppState, MirrorforgeModel } from '../types';
import { cn } from '../lib/utils';
import { conductMirrorforgeReflection } from '../services/ollamaService';
import { ATLAS_TRACE_CHANNEL, atlasTraceUserId } from '../lib/atlasTraceContext';

interface MirrorforgeProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function Mirrorforge({ state, setState }: MirrorforgeProps) {
  const [selectedModeId, setSelectedModeId] = useState<string | null>(
    state.mirrorforge.activeModes.find(m => m.isCurrent)?.id || null
  );
  const [newPatternTitle, setNewPatternTitle] = useState('');
  const [newPatternDesc, setNewPatternDesc] = useState('');
  const [isAddingPattern, setIsAddingPattern] = useState(false);
  const [mirrorInput, setMirrorInput] = useState('');
  const [mirrorLog, setMirrorLog] = useState<{role: 'user'|'atlas', text: string}[]>([]);
  const [isProcessingMirror, setIsProcessingMirror] = useState(false);

  const activeMode = state.mirrorforge.activeModes.find(m => m.id === selectedModeId) || state.mirrorforge.activeModes[0];

  const handleMirrorSubmit = async () => {
    if (!mirrorInput.trim() || isProcessingMirror) return;
    const input = mirrorInput.trim();
    setMirrorLog((prev) => [...prev, { role: 'user', text: input }]);
    setMirrorInput('');
    setIsProcessingMirror(true);

    try {
      const { atlasResponse } = await conductMirrorforgeReflection(
        input,
        activeMode.label,
        state.userModel,
        { userId: atlasTraceUserId(state), channel: ATLAS_TRACE_CHANNEL.mirrorforge }
      );
      setMirrorLog((prev) => [...prev, { role: 'atlas', text: atlasResponse || '(empty response)' }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMirrorLog((prev) => [
        ...prev,
        {
          role: 'atlas',
          text: `Mirrorforge could not reach the inference layer: ${msg}. Check Atlas API / backend and retry.`,
        },
      ]);
    } finally {
      setIsProcessingMirror(false);
    }
  };

  const handleAddPattern = () => {
    if (!newPatternTitle.trim() || !newPatternDesc.trim()) return;
    
    setState(prev => ({
      ...prev,
      mirrorforge: {
        ...prev.mirrorforge,
        patternLedger: [
          ...prev.mirrorforge.patternLedger,
          {
            id: `pattern-${Date.now()}`,
            title: newPatternTitle,
            description: newPatternDesc,
            recurrence: 1,
            trend: 'stable',
            lastSeen: new Date().toISOString()
          }
        ]
      }
    }));
    
    setNewPatternTitle('');
    setNewPatternDesc('');
    setIsAddingPattern(false);
  };

  const handleBridgeGap = () => {
    setState(prev => ({
      ...prev,
      mirrorforge: {
        ...prev.mirrorforge,
        decisionDivergence: {
          ...prev.mirrorforge.decisionDivergence,
          divergenceScore: Math.max(0, prev.mirrorforge.decisionDivergence.divergenceScore - 10)
        }
      }
    }));
  };

  return (
    <div className="h-full flex flex-col gap-8 p-8 overflow-y-auto custom-scrollbar bg-obsidian">
      {/* Header Section */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 text-violet-400">
          <Fingerprint size={24} />
          <h1 className="text-3xl font-serif text-ivory tracking-tight">Mirrorforge</h1>
        </div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-stone opacity-60">
          How Atlas understands you in motion
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
        {/* Left Column: Cognitive Modes Constellation */}
        <div className="lg:col-span-7 space-y-8">
          <div className="glass-panel p-8 min-h-[400px] relative overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-violet-400 uppercase tracking-[0.3em]">Active Internal Modes</h3>
                <p className="text-[10px] text-stone uppercase tracking-widest opacity-40">Atlas's current model of how you are thinking</p>
              </div>
              <Activity size={16} className="text-violet-400 opacity-40" />
            </div>

            {/* Radial Constellation Field */}
            <div className="flex-1 relative flex items-center justify-center">
              {/* Central Node */}
              <div className="relative z-10 flex flex-col items-center gap-3">
                <div className="w-24 h-24 rounded-full bg-violet-500/10 border border-violet-500/30 flex items-center justify-center shadow-[0_0_30px_rgba(139,92,246,0.1)]">
                  <Brain size={32} className="text-violet-400" />
                </div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-ivory font-bold">Current You</span>
              </div>

              {/* Orbiting Nodes */}
              {state.mirrorforge.activeModes.map((mode, index) => {
                const angle = (index * (360 / state.mirrorforge.activeModes.length)) * (Math.PI / 180);
                const radius = 140;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;

                return (
                  <motion.div
                    key={mode.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute cursor-pointer group"
                    style={{ x, y }}
                    onClick={() => setSelectedModeId(mode.id)}
                  >
                    <div className={cn(
                      "relative flex flex-col items-center gap-2 transition-all duration-500",
                      selectedModeId === mode.id ? "scale-110" : "opacity-40 hover:opacity-100"
                    )}>
                      <div className={cn(
                        "w-16 h-16 rounded-full border flex items-center justify-center transition-all duration-500",
                        selectedModeId === mode.id 
                          ? "bg-violet-500/20 border-violet-500/50 shadow-[0_0_20px_rgba(139,92,246,0.2)]" 
                          : "bg-titanium/5 border-titanium/20"
                      )}>
                        <div className="absolute inset-0 rounded-full border border-violet-500/20 animate-ping opacity-20" />
                        <span className="text-[8px] font-mono text-ivory text-center px-2 leading-tight">{mode.label}</span>
                      </div>
                      
                      {selectedModeId === mode.id && (
                        <div className="absolute -bottom-12 w-48 text-center bg-obsidian/90 backdrop-blur-md border border-violet-500/20 p-2 rounded-sm z-20">
                          <p className="text-[8px] text-stone uppercase tracking-widest leading-relaxed">
                            {mode.description}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Connection Line */}
                    <div 
                      className={cn(
                        "absolute top-1/2 left-1/2 h-px origin-left -z-10 transition-all duration-500",
                        selectedModeId === mode.id ? "bg-violet-500/30 w-[140px]" : "bg-titanium/10 w-[140px]"
                      )}
                      style={{ transform: `rotate(${angle + Math.PI}rad)` }}
                    />
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Lower Left: Pattern Ledger */}
          <div className="glass-panel p-8 space-y-8">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-violet-400 uppercase tracking-[0.3em]">Recurring Patterns</h3>
                <p className="text-[10px] text-stone uppercase tracking-widest opacity-40">Cognitive loops and behavioral signatures</p>
              </div>
              <button 
                onClick={() => setIsAddingPattern(!isAddingPattern)}
                className="p-2 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 rounded-sm transition-all"
              >
                <Plus size={16} />
              </button>
            </div>

            <AnimatePresence>
              {isAddingPattern && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4 overflow-hidden"
                >
                  <input
                    type="text"
                    value={newPatternTitle}
                    onChange={(e) => setNewPatternTitle(e.target.value)}
                    placeholder="Pattern Title..."
                    className="w-full bg-obsidian/40 border border-titanium/10 rounded-sm p-3 text-xs text-ivory placeholder:text-stone/40 focus:border-violet-500/50 outline-none"
                  />
                  <textarea
                    value={newPatternDesc}
                    onChange={(e) => setNewPatternDesc(e.target.value)}
                    placeholder="Describe the pattern..."
                    className="w-full bg-obsidian/40 border border-titanium/10 rounded-sm p-3 text-xs text-ivory placeholder:text-stone/40 focus:border-violet-500/50 outline-none h-20 resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => setIsAddingPattern(false)}
                      className="px-4 py-2 text-[10px] uppercase tracking-widest text-stone hover:text-ivory transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleAddPattern}
                      className="px-4 py-2 bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 text-[10px] uppercase tracking-widest rounded-sm transition-colors"
                    >
                      Log Pattern
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {state.mirrorforge.patternLedger.map(pattern => (
                <div 
                  key={pattern.id}
                  className="p-4 bg-titanium/5 border border-titanium/10 rounded-sm hover:border-violet-500/30 transition-all group cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="text-[11px] font-bold text-ivory uppercase tracking-widest">{pattern.title}</h4>
                    <div className={cn(
                      "px-1.5 py-0.5 rounded-full text-[8px] font-mono uppercase tracking-widest",
                      pattern.trend === 'improving' ? "bg-teal/10 text-teal" : "bg-oxblood/10 text-oxblood"
                    )}>
                      {pattern.trend}
                    </div>
                  </div>
                  <p className="text-[10px] text-stone leading-relaxed opacity-60 group-hover:opacity-100 transition-opacity">
                    {pattern.description}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-[8px] font-mono uppercase tracking-widest text-stone/40">
                    <span>Recurrence: {pattern.recurrence}%</span>
                    <span>Last: {new Date(pattern.lastSeen).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Interpretive Read & Decision Divergence */}
        <div className="lg:col-span-5 space-y-8">
          {/* Upper Right: Current Interpretive Read */}
          <div className="glass-panel p-8 space-y-8 border-violet-500/20 bg-violet-500/5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-violet-400 uppercase tracking-[0.3em]">Current Interpretive Read</h3>
                <p className="text-[10px] text-stone uppercase tracking-widest opacity-40">What Atlas thinks is driving you right now</p>
              </div>
              <Shield size={16} className="text-violet-400 opacity-40" />
            </div>

            <div className="space-y-6">
              <div className="p-6 bg-obsidian/40 border border-violet-500/10 rounded-sm">
                <p className="text-lg font-serif text-ivory italic leading-relaxed">
                  "{state.mirrorforge.currentRead.dominantInsight}"
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <span className="text-[8px] font-mono uppercase tracking-widest text-stone">Surface Driver</span>
                  <p className="text-xs text-ivory opacity-80">{state.mirrorforge.currentRead.surfaceDriver}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[8px] font-mono uppercase tracking-widest text-stone">Deeper Driver</span>
                  <p className="text-xs text-ivory opacity-80">{state.mirrorforge.currentRead.deeperDriver}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[8px] font-mono uppercase tracking-widest text-stone">Hidden Tension</span>
                  <p className="text-xs text-violet-400">{state.mirrorforge.currentRead.hiddenTension}</p>
                </div>
              </div>

              <div className="pt-6 border-t border-titanium/10 space-y-3">
                <span className="text-[8px] font-mono uppercase tracking-widest text-stone">Evidence Basis</span>
                <div className="flex flex-wrap gap-2">
                  {state.mirrorforge.currentRead.evidence.map((ev, i) => (
                    <span key={i} className="px-2 py-1 bg-titanium/5 border border-titanium/10 rounded-sm text-[8px] text-stone uppercase tracking-widest">
                      {ev}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Lower Right: Decision Divergence Panel */}
          <div className="glass-panel p-8 space-y-8">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-violet-400 uppercase tracking-[0.3em]">Decision Divergence</h3>
                <p className="text-[10px] text-stone uppercase tracking-widest opacity-40">Likely You vs Highest-Order You</p>
              </div>
              <TrendingUp size={16} className="text-violet-400 opacity-40" />
            </div>

            <div className="space-y-8">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-6 bg-titanium/5 border border-titanium/10 rounded-sm space-y-4">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-stone">Most Likely Move</span>
                  <h4 className="text-xs font-bold text-ivory uppercase tracking-widest">{state.mirrorforge.decisionDivergence.mostLikely.action}</h4>
                  <p className="text-[10px] text-stone leading-relaxed opacity-60">
                    {state.mirrorforge.decisionDivergence.mostLikely.reasoning}
                  </p>
                </div>
                <div className="p-6 bg-violet-500/5 border border-violet-500/20 rounded-sm space-y-4">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-violet-400">Highest-Order Move</span>
                  <h4 className="text-xs font-bold text-ivory uppercase tracking-widest">{state.mirrorforge.decisionDivergence.highestOrder.action}</h4>
                  <p className="text-[10px] text-stone leading-relaxed opacity-60">
                    {state.mirrorforge.decisionDivergence.highestOrder.reasoning}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-stone">Divergence Meter</span>
                  <span className="text-[9px] font-mono text-violet-400">{state.mirrorforge.decisionDivergence.divergenceScore}%</span>
                </div>
                <div className="h-1 bg-titanium/10 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${state.mirrorforge.decisionDivergence.divergenceScore}%` }}
                    className="h-full bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.5)]"
                  />
                </div>
                <p className="text-[9px] text-stone text-center uppercase tracking-widest opacity-40">
                  Current divergence between instinct and best-self strategy
                </p>
              </div>

              <button 
                onClick={handleBridgeGap}
                className="w-full py-4 border border-violet-500/30 text-violet-400 hover:bg-violet-500/10 transition-all text-[10px] font-bold uppercase tracking-[0.3em] flex items-center justify-center gap-2"
              >
                Bridge the Gap <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {/* Mirror Session Chat */}
          <div className="glass-panel p-8 space-y-6 flex flex-col h-[400px]">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-violet-400 uppercase tracking-[0.3em]">Mirror Session</h3>
                <p className="text-[10px] text-stone uppercase tracking-widest opacity-40">Talk to your reflection</p>
              </div>
              <Activity size={16} className="text-violet-400 opacity-40" />
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-2">
              {mirrorLog.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center">
                  <p className="text-xs text-stone opacity-50">Speak to Atlas. It will respond not as an assistant, but as a mirror reflecting your cognitive patterns.</p>
                </div>
              ) : (
                mirrorLog.map((entry, i) => (
                  <div key={i} className={cn(
                    "p-4 rounded-sm max-w-[85%]",
                    entry.role === 'user' 
                      ? "bg-titanium/10 border border-titanium/20 ml-auto" 
                      : "bg-violet-500/10 border border-violet-500/20 mr-auto"
                  )}>
                    <span className={cn(
                      "text-[8px] font-mono uppercase tracking-widest mb-2 block",
                      entry.role === 'user' ? "text-stone" : "text-violet-400"
                    )}>
                      {entry.role === 'user' ? 'You' : 'Atlas Reflection'}
                    </span>
                    <p className="text-xs text-ivory leading-relaxed">{entry.text}</p>
                  </div>
                ))
              )}
              {isProcessingMirror && (
                <div className="p-4 rounded-sm max-w-[85%] bg-violet-500/5 border border-violet-500/10 mr-auto">
                  <Activity size={14} className="text-violet-400 animate-pulse" />
                </div>
              )}
            </div>

            <div className="relative mt-auto pt-4 border-t border-titanium/10">
              <input
                type="text"
                value={mirrorInput}
                onChange={(e) => setMirrorInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleMirrorSubmit()}
                placeholder="Type your thoughts..."
                className="w-full bg-obsidian/40 border border-titanium/10 rounded-sm py-3 pl-4 pr-12 text-sm text-ivory placeholder:text-stone/40 focus:border-violet-500/50 outline-none"
              />
              <button
                onClick={handleMirrorSubmit}
                disabled={!mirrorInput.trim() || isProcessingMirror}
                className="absolute right-2 top-1/2 -translate-y-1/2 mt-2 p-2 text-violet-400 hover:text-violet-300 disabled:opacity-50 transition-colors"
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
