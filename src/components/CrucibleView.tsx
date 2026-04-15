// Atlas-Audit: [EXEC-MODE] Verified — Post-session journal save + dialogue layer jump use coerceActiveMode(..., prev.activeMode).
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { 
  ShieldAlert, 
  Zap, 
  Scale, 
  AlertCircle, 
  Lock, 
  Eye, 
  Target, 
  Flame,
  Gavel,
  Search,
  ShieldCheck,
  RefreshCw,
  X,
  Play
} from 'lucide-react';
import { cn } from '../lib/utils';
import { coerceActiveMode } from '../lib/atlasWayfinding';
import { AppState, CrucibleMode, CrucibleIntensity, CrucibleSession, CrucibleExchange } from '../types';
import { ATLAS_TRACE_CHANNEL, atlasTraceUserId } from '../lib/atlasTraceContext';
import { conductCrucibleSession } from '../lib/atlasCrucible';

interface CrucibleViewProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

const CRUCIBLE_LS = 'atlas_crucible_last_v1';

export function CrucibleView({ state, setState }: CrucibleViewProps) {
  const [selectedMode, setSelectedMode] = useState<CrucibleMode>('pressure-test');
  const [intensity, setIntensity] = useState<CrucibleIntensity>('intensive');
  const [topic, setTopic] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CRUCIBLE_LS);
      if (!raw) return;
      const o = JSON.parse(raw) as { topic?: string; result?: string; mode?: CrucibleMode; intensity?: CrucibleIntensity; at?: string };
      if (o.topic) setTopic(o.topic);
      if (o.result) setResult(o.result);
      if (o.mode) setSelectedMode(o.mode);
      if (o.intensity) setIntensity(o.intensity);
      if (o.at) setLastRunAt(o.at);
    } catch {
      /* ignore */
    }
  }, []);

  const modes: { id: CrucibleMode; label: string; description: string; icon: any }[] = [
    { id: 'pressure-test', label: 'Pressure Test', description: 'Standard stress test of logic and evidence', icon: Zap },
    { id: 'adversarial-review', label: 'Adversarial Review', description: 'Maximize opposition from the smartest critic', icon: Gavel },
    { id: 'reality-check', label: 'Reality Check', description: 'Focus on constraints, incentives, and hard truths', icon: ShieldAlert },
    { id: 'contradiction-scan', label: 'Contradiction Scan', description: 'Prioritize internal inconsistency', icon: Search },
    { id: 'blind-spot-finder', label: 'Blind Spot Finder', description: 'Identify ignored variables and tradeoffs', icon: Eye },
    { id: 'decision-forge', label: 'Decision Forge', description: 'Analyze stakes, reversibility, and downside', icon: Target },
    { id: 'narrative-deconstruction', label: 'Narrative Deconstruction', description: 'Separate what happened from the story', icon: Scale },
    { id: 'self-deception-audit', label: 'Self-Deception Audit', description: 'Examine ego protection and fear avoidance', icon: AlertCircle },
    { id: 'hard-truth', label: 'Hard Truth', description: 'Maximum logical honesty with disciplined restraint', icon: Flame },
    { id: 'reforge', label: 'Reforge', description: 'Reconstruct and strengthen after critique', icon: ShieldCheck },
  ];

  const intensities: { id: CrucibleIntensity; label: string; color: string; textColor?: string }[] = [
    { id: 'calibrated', label: 'Calibrated', color: 'bg-teal' },
    { id: 'intensive', label: 'Intensive', color: 'bg-gold', textColor: 'text-obsidian' },
    { id: 'ruthless', label: 'Ruthless', color: 'bg-oxblood' },
  ];

  const handleExecute = async () => {
    if (!topic.trim() || isProcessing) return;
    
    setIsProcessing(true);
    setResult(null);
    
    const session: CrucibleSession = {
      id: Math.random().toString(36).substring(7),
      startTime: new Date().toISOString(),
      mode: selectedMode,
      intensity,
      topic,
      exchanges: []
    };

    try {
      const response = await conductCrucibleSession(session, state.userModel, topic);
      setResult(response.atlasResponse);
      const at = new Date().toISOString();
      setLastRunAt(at);
      try {
        localStorage.setItem(
          CRUCIBLE_LS,
          JSON.stringify({
            topic,
            mode: selectedMode,
            intensity,
            result: response.atlasResponse,
            at,
          })
        );
      } catch {
        /* quota / private mode */
      }
    } catch (error) {
      console.error("Crucible error:", error);
      setResult("An error occurred during the Crucible analysis.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-obsidian text-ivory overflow-hidden">
      {/* Crucible Header & Control Layer */}
      <header className="p-8 border-b border-titanium/10 shrink-0 bg-graphite/20">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 text-gold">
              <Flame size={24} />
              <div>
                <h1 className="text-3xl font-serif tracking-tight">Crucible</h1>
                <p className="text-[10px] uppercase tracking-[0.25em] text-stone/55 mt-1 max-w-xl">
                  Pressure chamber for doctrine and decisions — outputs persist locally until you clear them.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-oxblood/10 border border-oxblood/20 rounded-sm">
              <Lock size={14} className="text-oxblood" />
              <span className="text-[10px] uppercase tracking-widest text-stone">Private by Default</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-4 md:col-span-2">
              <label className="text-[10px] text-gold font-bold uppercase tracking-[0.3em]">Mode of Confrontation</label>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                {modes.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setSelectedMode(mode.id)}
                    className={cn(
                      "p-3 border transition-all text-left flex flex-col items-center text-center gap-2 group",
                      selectedMode === mode.id 
                        ? "bg-gold/10 border-gold shadow-[0_0_10px_rgba(212,175,55,0.1)]" 
                        : "bg-titanium/5 border-titanium/20 hover:border-gold/30"
                    )}
                  >
                    <mode.icon size={16} className={selectedMode === mode.id ? "text-gold" : "text-stone group-hover:text-gold"} />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-ivory">{mode.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] text-gold font-bold uppercase tracking-[0.3em]">Intensity</label>
              <div className="flex flex-col gap-2">
                {intensities.map((lvl) => (
                  <button
                    key={lvl.id}
                    onClick={() => setIntensity(lvl.id)}
                    className={cn(
                      "py-3 border text-[10px] uppercase tracking-[0.2em] font-bold transition-all",
                      intensity === lvl.id 
                        ? cn(lvl.textColor || "text-ivory", "border-transparent", lvl.color) 
                        : "text-stone border-titanium/20 hover:border-ivory/30"
                    )}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Input Chamber & Findings Workspace */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-5xl mx-auto space-y-8">
          
          {/* Input Chamber */}
          <section className="space-y-4">
            <label className="text-[10px] text-gold font-bold uppercase tracking-[0.3em]">Subject of Inquiry</label>
            <div className="relative">
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="State the view, argument, doctrine, or decision to be pressure-tested..."
                className="w-full h-32 bg-graphite/40 border border-titanium/20 p-6 text-ivory font-serif text-lg focus:outline-none focus:border-gold/50 transition-all resize-none placeholder:text-stone/30"
              />
              <button
                onClick={handleExecute}
                disabled={!topic.trim() || isProcessing}
                className={cn(
                  "absolute right-4 bottom-4 px-6 py-3 text-xs font-bold uppercase tracking-[0.2em] transition-all flex items-center gap-2",
                  topic.trim() && !isProcessing
                    ? "bg-ivory text-obsidian hover:bg-gold" 
                    : "bg-titanium/10 text-stone cursor-not-allowed"
                )}
              >
                {isProcessing ? (
                  <><RefreshCw size={14} className="animate-spin" /> Processing</>
                ) : (
                  <><Play size={14} /> Execute</>
                )}
              </button>
            </div>
          </section>

          {/* Findings Workspace */}
          <AnimatePresence>
            {result && (
              <motion.section 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between border-b border-titanium/10 pb-4 gap-3 flex-wrap">
                  <div>
                    <label className="text-[10px] text-gold font-bold uppercase tracking-[0.3em] block">Findings workspace</label>
                    {lastRunAt && (
                      <span className="text-[9px] text-stone/50 font-mono mt-1 block">Last run {new Date(lastRunAt).toLocaleString()}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setResult(null);
                      try {
                        localStorage.removeItem(CRUCIBLE_LS);
                      } catch {
                        /* */
                      }
                      setLastRunAt(null);
                    }}
                    className="text-[10px] uppercase tracking-widest text-stone hover:text-ivory transition-all flex items-center gap-1"
                  >
                    <X size={12} /> Clear
                  </button>
                </div>
                
                <div className="p-8 bg-graphite/40 border border-titanium/10 rounded-sm relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-oxblood" />
                  <div className="prose prose-invert prose-sm max-w-none text-ivory/90 leading-relaxed font-serif">
                    <ReactMarkdown>{result}</ReactMarkdown>
                  </div>
                </div>

                {/* Post-Run Actions */}
                <div className="flex justify-end gap-4 pt-4 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      if (!result?.trim()) return;
                      const entry = {
                        id: `crucible-${Date.now()}`,
                        title: `Crucible · ${selectedMode.replace(/-/g, ' ')}`,
                        content: `**Subject:** ${topic}\n\n${result}`,
                        tags: ['crucible', selectedMode],
                        timestamp: new Date().toISOString(),
                        assistanceEnabled: false,
                        assistanceMode: 'reflective-mirror' as const,
                        isUnresolved: true,
                      };
                      setState((prev) => ({
                        ...prev,
                        journal: [entry, ...prev.journal],
                        activeMode: coerceActiveMode('journal', prev.activeMode),
                      }));
                    }}
                    className="px-6 py-3 border border-titanium/20 text-[10px] uppercase tracking-widest text-stone hover:text-ivory hover:bg-titanium/5 transition-all"
                  >
                    Save to journal
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setState((prev) => ({
                        ...prev,
                        activeMode: coerceActiveMode('resonance', prev.activeMode),
                      }))
                    }
                    className="px-6 py-3 bg-ivory text-obsidian text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-gold transition-all"
                  >
                    Open dialogue layer
                  </button>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

        </div>
      </div>
    </div>
  );
}
