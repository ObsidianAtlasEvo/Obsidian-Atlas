// Atlas-Audit: [EXEC-PULSE] Verified — Successful live Resonance lab prepends pulse.items with lab summary + omni route (merged from routing/done SSE) for Firestore/workspace parity with Home.
// Atlas-Audit: [EXEC-OMNI] Verified — Lab terminal logs `routing` SSE (mode, posture, lineOfInquiry) for omni provenance; stream body sends posture + resonance-chamber tag.
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Waves, 
  Brain, 
  PenTool, 
  Heart, 
  Target, 
  Zap, 
  ShieldCheck, 
  Info, 
  History, 
  Sparkles,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Lock,
  ArrowRight,
  Activity,
  Shield,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  Clock
} from 'lucide-react';
import { cn } from '../lib/utils';
import { AppState, ResonanceMode, ResonanceModel } from '../types';
import { ResonanceInsightCard } from '../resonance/ui/ResonanceInsightCard';
import { ThemeEvolutionView } from '../resonance/ui/ThemeEvolutionView';
import { ResonanceThread } from '../resonance/types';
import { QuietPowerQuotaModal } from './Settings/SovereigntyControls';
import { atlasTraceUserId } from '../lib/atlasTraceContext';
import { atlasApiUrl, atlasHttpEnabled, sanitizeAtlasError } from '../lib/atlasApi';

function atlasPostureFromAdaptiveDepth(depth: number): 1 | 2 | 3 | 4 | 5 {
  const n = Math.round(Number.isFinite(depth) ? depth : 3);
  return Math.min(5, Math.max(1, n)) as 1 | 2 | 3 | 4 | 5;
}

interface ResonanceChamberProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function ResonanceChamber({ state, setState }: ResonanceChamberProps) {
  const { resonance } = state;
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [maximumClarity, setMaximumClarity] = useState(false);
  const [consensusMode, setConsensusMode] = useState(false);
  const [swarmActive, setSwarmActive] = useState(false);
  const [clarityTerminalLines, setClarityTerminalLines] = useState<string[]>([]);
  const [quotaModalOpen, setQuotaModalOpen] = useState(false);
  const [quotaModalMessage, setQuotaModalMessage] = useState<string | undefined>(undefined);
  const streamAccRef = useRef('');
  const omniRoutingRef = useRef<{
    mode?: string;
    posture?: number;
    lineOfInquiry?: string | null;
  }>({});
  const [labStreamText, setLabStreamText] = useState('');
  const labStreamEndRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'model' | 'lab' | 'history' | 'significance'>('model');
  const LIVE_STREAM_TIMEOUT_MS = 300_000;

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [showRipple, setShowRipple] = useState(false);

  useEffect(() => {
    if (analysisProgress >= 100 && isAnalyzing) {
      setIsAnalyzing(false);
      setShowRipple(true);
      setTimeout(() => setShowRipple(false), 1500);
      // Update state with slightly randomized values to simulate learning
      setState(prevApp => ({
        ...prevApp,
        resonance: {
          ...prevApp.resonance,
          model: {
            ...prevApp.resonance.model,
            reasoningArchitecture: {
              ...prevApp.resonance.model.reasoningArchitecture,
              abstractionLevel: Math.min(1, prevApp.resonance.model.reasoningArchitecture.abstractionLevel + (Math.random() * 0.1 - 0.05))
            }
          }
        }
      }));
    }
  }, [analysisProgress, isAnalyzing, setState]);

  useEffect(() => {
    if (!labStreamText) return;
    labStreamEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [labStreamText]);

  const runThoughtAnalysis = () => {
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    
    const interval = setInterval(() => {
      setAnalysisProgress(prev => {
        const next = prev + 2;
        if (next >= 100) {
          clearInterval(interval);
          return 100;
        }
        return next;
      });
    }, 50);
  };

  const useLiveAtlas = atlasHttpEnabled();

  const consumeOmniSse = async (
    payload: Record<string, unknown>,
    onEvent: (event: string, data: Record<string, unknown> | null) => void
  ) => {
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), LIVE_STREAM_TIMEOUT_MS);
    try {
      const res = await fetch(atlasApiUrl('/v1/chat/omni-stream'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        credentials: 'include',
        signal: ac.signal,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');
      const dec = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          let eventName = 'message';
          const dataLines: string[] = [];
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          }
          const dataStr = dataLines.join('');
          let data: Record<string, unknown> | null = null;
          if (dataStr) {
            try {
              data = JSON.parse(dataStr) as Record<string, unknown>;
            } catch {
              data = { raw: dataStr };
            }
          }
          onEvent(eventName, data);
        }
      }
    } catch (e) {
      if (ac.signal.aborted) {
        throw new Error('Atlas stream timed out. Check backend/API keys and try again.');
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  };

  const handleProcess = async () => {
    if (!inputText.trim()) return;
    setSwarmActive(false);
    setClarityTerminalLines([]);
    streamAccRef.current = '';
    omniRoutingRef.current = {};
    setLabStreamText('');

    try {
      setIsProcessing(true);
      if (useLiveAtlas) {
        let terminalError: { code?: string; message: string } | null = null;
        await consumeOmniSse(
          {
            userId: atlasTraceUserId(state),
            messages: [{ role: 'user', content: inputText.trim() }],
            maximumClarity,
            consensusMode: maximumClarity ? false : consensusMode,
            posture: atlasPostureFromAdaptiveDepth(state.activePosture.depth),
            lineOfInquiry: 'resonance-chamber',
          },
          (event, data) => {
            if (event === 'error') {
              terminalError = {
                message: sanitizeAtlasError(String(data?.message ?? 'Request failed')),
                code: typeof data?.code === 'string' ? data.code : undefined,
              };
              return;
            }
            if (event === 'routing' && data && typeof data === 'object') {
              omniRoutingRef.current = {
                ...omniRoutingRef.current,
                ...(typeof data.mode === 'string' ? { mode: data.mode } : {}),
                ...(typeof data.posture === 'number' ? { posture: data.posture } : {}),
                ...(data.lineOfInquiry !== undefined
                  ? { lineOfInquiry: data.lineOfInquiry as string | null }
                  : {}),
              };
              const mode = typeof data.mode === 'string' ? data.mode : '?';
              const posture = typeof data.posture === 'number' ? String(data.posture) : '?';
              const loi =
                data.lineOfInquiry != null && String(data.lineOfInquiry).length > 0
                  ? String(data.lineOfInquiry)
                  : '—';
              setClarityTerminalLines((prev) => [
                ...prev,
                `[routing] ${mode} · posture ${posture} · inquiry: ${loi}`,
              ]);
            }
            if (event === 'status' && data?.message != null) {
              setClarityTerminalLines((prev) => [...prev, String(data.message)]);
            }
            if (event === 'clarity_terminal' && data?.message != null) {
              setClarityTerminalLines((prev) => [...prev, String(data.message)]);
            }
            if (event === 'swarm_ticker' && data?.message != null) {
              setClarityTerminalLines((prev) => [...prev, String(data.message)]);
            }
            if (event === 'delta' && data?.text != null) {
              const piece = String(data.text);
              streamAccRef.current += piece;
              setLabStreamText(streamAccRef.current);
            }
            if (event === 'done' && data && typeof data === 'object') {
              const r = data.routing;
              if (r && typeof r === 'object' && !Array.isArray(r)) {
                const rt = r as Record<string, unknown>;
                omniRoutingRef.current = {
                  ...omniRoutingRef.current,
                  ...(typeof rt.mode === 'string' ? { mode: rt.mode } : {}),
                  ...(typeof rt.posture === 'number' ? { posture: rt.posture } : {}),
                  ...(rt.lineOfInquiry !== undefined
                    ? { lineOfInquiry: rt.lineOfInquiry as string | null }
                    : {}),
                };
              }
              if ('cloudSwarm' in data) {
                setSwarmActive(data.cloudSwarm === true);
              }
            }
          }
        );

        if (terminalError) {
          setClarityTerminalLines((prev) => [...prev, `[error] ${terminalError!.message}`]);
          if (terminalError.code === 'deep_research_quota_exceeded') {
            setQuotaModalMessage(terminalError.message);
            setQuotaModalOpen(true);
          }
          return;
        }

        if (!streamAccRef.current.trim()) {
          throw new Error('Atlas returned no content for this request.');
        }

        const newEntry = {
          id: `res-${Date.now()}`,
          input: inputText,
          output: streamAccRef.current.trim(),
          mode: resonance.activeMode,
          confidence: Math.min(0.99, resonance.model.confidence + 0.02),
          timestamp: new Date().toISOString(),
        };

        const trimmedIn = inputText.trim();
        const labSummary = trimmedIn.length > 140 ? `${trimmedIn.slice(0, 140)}…` : trimmedIn;
        const prov = omniRoutingRef.current;
        const routeClause =
          prov.mode != null && typeof prov.posture === 'number'
            ? ` Omni: ${prov.mode} · posture ${prov.posture}/5${
                prov.lineOfInquiry != null && prov.lineOfInquiry !== ''
                  ? ` · inquiry ${prov.lineOfInquiry}`
                  : ''
              }.`
            : '';

        setState((prev) => ({
          ...prev,
          resonance: {
            ...prev.resonance,
            history: [newEntry, ...prev.resonance.history],
          },
          pulse: {
            lastUpdate: new Date().toISOString(),
            items: [
              {
                id: `pulse-resonance-${newEntry.id}`,
                type: 'relevant' as const,
                content: `Resonance lab completed — “${labSummary}”.${routeClause} Resonance mode: ${resonance.activeMode}. Open Pulse for orientation.`,
                priority: 2,
                timestamp: new Date().toISOString(),
              },
              ...prev.pulse.items,
            ].slice(0, 20),
          },
        }));
        setInputText('');
      } else {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const newEntry = {
          id: `res-${Date.now()}`,
          input: inputText,
          output: generateMockResponse(inputText, resonance.activeMode),
          mode: resonance.activeMode,
          confidence: resonance.model.confidence + (Math.random() * 0.1 - 0.05),
          timestamp: new Date().toISOString(),
        };
        setState((prev) => ({
          ...prev,
          resonance: {
            ...prev.resonance,
            history: [newEntry, ...prev.resonance.history],
          },
        }));
        setInputText('');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setClarityTerminalLines((prev) => [...prev, `[error] ${msg}`]);
      const newEntry = {
        id: `res-${Date.now()}`,
        input: inputText,
        output: `[Atlas API] ${msg}\n\nUse the Vite dev proxy (/api → backend), set VITE_ATLAS_SAME_ORIGIN=true for production same-origin, or set VITE_ATLAS_API_URL for a direct API origin. Offline mock applies when none of these apply.`,
        mode: resonance.activeMode,
        confidence: 0.2,
        timestamp: new Date().toISOString(),
      };
      setState((prev) => ({
        ...prev,
        resonance: {
          ...prev.resonance,
          history: [newEntry, ...prev.resonance.history],
        },
      }));
    } finally {
      setIsProcessing(false);
      setLabStreamText('');
    }
  };

  const generateMockResponse = (input: string, mode: ResonanceMode) => {
    const { reasoningArchitecture: ra } = resonance.model;
    switch (mode) {
      case 'writing-match':
        return `[Writing Match] ${input.split(' ').slice(0, 10).join(' ')}... I've structured this response to match your natural cadence and vocabulary range. Note the ${resonance.model.writingStructure.sentenceLength} sentence length and the specific use of em-dashes for emphasis.`;
      case 'reasoning-match':
        return `[Reasoning Match] To address your inquiry, we must first establish the ${ra.entryPoint === 'framework-first' ? 'systemic framework' : 'core conclusion'}. By analyzing the ${ra.methodology === 'contrast-driven' ? 'tensions' : 'assertions'} within ${input.slice(0, 15)}, we can derive a path that aligns with your ${ra.primaryDriver}, ${ra.progression} reasoning architecture.`;
      case 'identity-aligned':
        return `[Identity Aligned] I understand your perspective on ${input.slice(0, 20)}. Phrasing this in a way that resonates with your ${ra.framing}: the tradeoffs here are significant, but the ${ra.temporalFocus} impact favors a ${ra.intent} move toward clarity.`;
      case 'refined-self':
        return `[Refined Self] Regarding your question about ${input.slice(0, 20)}, the most grounded path forward involves a calibrated refinement of your current strategy. While your natural instinct might be ${ra.intent === 'exploratory' ? 'exploratory' : 'decisive'}, the truth constitution suggests that ${ra.epistemicStance} resilience is the higher-order goal. Let's sharpen the execution while preserving the core intent.`;
      default:
        return input;
    }
  };

  return (
    <div className="h-full flex flex-col bg-obsidian relative overflow-hidden">
      <QuietPowerQuotaModal
        open={quotaModalOpen}
        onOpenChange={setQuotaModalOpen}
        message={quotaModalMessage}
      />
      {/* Header */}
      <header className="h-20 border-b border-gold/10 px-8 flex items-center justify-between bg-obsidian/80 backdrop-blur-xl z-30">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gold/10 rounded-sm">
            <Waves size={20} className="text-gold" />
          </div>
          <div>
            <h2 className="text-sm font-serif text-ivory uppercase tracking-[0.3em] font-bold">Resonance Chamber</h2>
            <p className="text-[10px] text-stone/40 uppercase tracking-widest">Text-Based User Expression Modeling & Response Generation</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {swarmActive && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-cyan-500/40 bg-cyan-500/10"
              title="Last completed reply used the Atlas Cloud Swarm (Groq / Gemini / orchestrator), not local Ollama."
            >
              <Activity size={12} className="text-cyan-400" />
              <span className="text-[9px] text-cyan-200 uppercase tracking-widest font-mono font-bold">
                Swarm Active
              </span>
            </div>
          )}
          <div className="flex items-center gap-3 px-4 py-2 bg-titanium/5 border border-titanium/10 rounded-sm">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] text-stone uppercase tracking-widest font-mono">Learning Active</span>
          </div>
          
          <div className="flex flex-col items-end">
            <span className="text-[8px] text-stone/40 uppercase tracking-widest mb-1">Model Confidence</span>
            <div className="w-32 h-1 bg-titanium/20 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${resonance.model.confidence * 100}%` }}
                className="h-full bg-gold"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {showRipple && (
          <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none overflow-hidden">
            <div className="w-64 h-64 border border-gold/30 rounded-full animate-ripple" />
          </div>
        )}
        {/* Left Panel: Navigation & Controls */}
        <div className="w-[320px] border-r border-gold/10 flex flex-col bg-obsidian/40 relative z-10">
          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <h3 className="text-[10px] text-gold uppercase tracking-widest font-bold">Output Functions</h3>
              <div className="space-y-2">
                {[
                  { id: 'writing-match', label: 'Writing Style Match', icon: PenTool, desc: 'Mirror surface-level structure' },
                  { id: 'reasoning-match', label: 'Reasoning Style Match', icon: Brain, desc: 'Align with thought architecture' },
                  { id: 'identity-aligned', label: 'Identity Aligned', icon: Heart, desc: 'Psychological & value alignment' },
                  { id: 'refined-self', label: 'Refined Self', icon: Sparkles, desc: 'Elevated, calibrated response' },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setState(prev => ({
                      ...prev,
                      resonance: { ...prev.resonance, activeMode: mode.id as ResonanceMode }
                    }))}
                    className={cn(
                      "w-full flex flex-col p-3 rounded-sm border transition-all duration-300 text-left group",
                      resonance.activeMode === mode.id 
                        ? "bg-gold/10 border-gold/30 text-gold" 
                        : "bg-titanium/5 border-titanium/10 text-stone hover:bg-titanium/10 hover:border-gold/20"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <mode.icon size={14} className={resonance.activeMode === mode.id ? "text-gold" : "text-stone group-hover:text-gold"} />
                      <span className="text-[10px] uppercase tracking-widest font-bold">{mode.label}</span>
                    </div>
                    <span className="text-[9px] opacity-60 leading-relaxed">{mode.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-sm bg-titanium/5 border border-titanium/10 space-y-3">
              <div className="flex items-center gap-2 text-gold">
                <ShieldCheck size={14} />
                <span className="text-[10px] uppercase tracking-widest font-bold">Safeguards Active</span>
              </div>
              <ul className="space-y-2">
                {[
                  'Anti-Parody Filter',
                  'Distortion Suppression',
                  'Truth Constitution Override',
                  'Confidence-Sensitive Restraint'
                ].map(s => (
                  <li key={s} className="flex items-center gap-2 text-[9px] text-stone/60">
                    <div className="w-1 h-1 rounded-full bg-gold/40" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-auto p-6 border-t border-gold/10">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] text-stone/40 uppercase tracking-widest">Navigation</span>
            </div>
            <div className="flex flex-col gap-2">
              {[
                { id: 'model', label: 'Model Visualization', icon: Zap },
                { id: 'significance', label: 'Significance Engine', icon: Heart },
                { id: 'lab', label: 'Refinement Lab', icon: RefreshCw },
                { id: 'history', label: 'Resonance History', icon: History },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "flex items-center gap-3 p-2 rounded-sm transition-all duration-300",
                    activeTab === tab.id ? "text-gold bg-gold/5" : "text-stone hover:text-ivory"
                  )}
                >
                  <tab.icon size={14} />
                  <span className="text-[10px] uppercase tracking-widest">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Center Panel: Content Area */}
        <div className="flex-1 overflow-y-auto no-scrollbar bg-obsidian/20 p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'model' && (
              <motion.div
                key="model"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-4xl mx-auto space-y-12"
              >
                {/* Thought Construction Analysis Layer */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] uppercase tracking-[0.4em] text-gold font-bold flex items-center gap-3">
                      <Brain size={14} /> Thought Construction Analysis
                    </h3>
                    <button 
                      onClick={runThoughtAnalysis}
                      disabled={isAnalyzing}
                      className={cn(
                        "px-4 py-2 rounded-sm text-[10px] uppercase tracking-widest transition-all flex items-center gap-2",
                        isAnalyzing ? "bg-gold/20 text-gold cursor-wait" : "bg-gold text-obsidian hover:bg-ivory"
                      )}
                    >
                      {isAnalyzing ? (
                        <>
                          <RefreshCw size={12} className="animate-spin" />
                          Synthesizing Patterns ({analysisProgress}%)
                        </>
                      ) : (
                        <>
                          <Zap size={12} />
                          Run Cognitive Audit
                        </>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="glass-panel p-6 space-y-6">
                      <h4 className="text-[11px] font-bold text-ivory uppercase tracking-widest border-b border-gold/10 pb-3">Structural Tendencies</h4>
                      <div className="space-y-4">
                        {[
                          { label: 'Linear vs Systemic', value: state.resonance.model.reasoningArchitecture.progression === 'linear' ? 30 : 85, left: 'Linear', right: 'Systemic' },
                          { label: 'Intuitive vs Analytical', value: state.resonance.model.reasoningArchitecture.primaryDriver === 'intuitive' ? 40 : 75, left: 'Intuitive', right: 'Analytical' },
                          { label: 'Concise vs Layered', value: state.resonance.model.reasoningArchitecture.density === 'concise' ? 20 : 80, left: 'Concise', right: 'Layered' },
                          { label: 'Exploratory vs Decisive', value: state.resonance.model.reasoningArchitecture.intent === 'exploratory' ? 70 : 30, left: 'Exploratory', right: 'Decisive' },
                        ].map(trait => (
                          <div key={trait.label} className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-[9px] text-stone/60 uppercase tracking-widest">{trait.label}</span>
                              <span className="text-[9px] text-gold font-mono">{trait.value}%</span>
                            </div>
                            <div className="h-1 bg-gold/5 rounded-full relative overflow-hidden">
                              <div className="absolute inset-y-0 left-0 bg-gold/10 w-full" />
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${trait.value}%` }}
                                className="absolute inset-y-0 left-0 bg-gold shadow-[0_0_10px_rgba(212,175,55,0.4)]"
                              />
                            </div>
                            <div className="flex justify-between text-[8px] text-stone/30 uppercase tracking-tighter">
                              <span>{trait.left}</span>
                              <span>{trait.right}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="glass-panel p-6 space-y-6">
                      <h4 className="text-[11px] font-bold text-ivory uppercase tracking-widest border-b border-gold/10 pb-3">Epistemic Stance</h4>
                      <div className="grid grid-cols-2 gap-4">
                        {[
                          { label: 'Methodology', value: state.resonance.model.reasoningArchitecture.methodology, desc: 'How you approach contradictions' },
                          { label: 'Framing', value: state.resonance.model.reasoningArchitecture.framing, desc: 'The lens through which you view logic' },
                          { label: 'Stance', value: state.resonance.model.reasoningArchitecture.epistemicStance, desc: 'Your fundamental truth-seeking mode' },
                          { label: 'Temporal', value: state.resonance.model.reasoningArchitecture.temporalFocus, desc: 'Where your reasoning is anchored' },
                        ].map(item => (
                          <div key={item.label} className="p-3 bg-gold/[0.02] border border-gold/5 rounded-sm space-y-1">
                            <span className="text-[8px] text-stone/40 uppercase tracking-widest">{item.label}</span>
                            <p className="text-[10px] text-gold font-bold uppercase tracking-tight">{item.value.replace('-', ' ')}</p>
                            <p className="text-[8px] text-stone/30 italic">{item.desc}</p>
                          </div>
                        ))}
                      </div>
                      <div className="p-4 bg-gold/5 border border-gold/10 rounded-sm">
                        <div className="flex items-center gap-3 mb-2">
                          <Info size={12} className="text-gold/60" />
                          <span className="text-[9px] text-gold/80 uppercase tracking-widest font-bold">Resonance Insight</span>
                        </div>
                        <p className="text-[10px] text-stone/60 leading-relaxed italic font-serif">
                          "Your reasoning architecture suggests a high tolerance for systemic complexity paired with a preference for dialectical progression. Atlas will prioritize preserving tension over premature resolution in its synthesis."
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  {/* Layer 1: Writing Structure */}
                  <div className="glass-panel p-6 space-y-4 border-gold/10">
                    <div className="flex items-center gap-3 text-gold">
                      <PenTool size={18} />
                      <h4 className="text-xs uppercase tracking-[0.2em] font-bold">Writing Structure Layer</h4>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-stone/60 uppercase tracking-widest">Sentence Length</span>
                        <span className="text-[10px] text-ivory uppercase tracking-widest font-mono">{resonance.model.writingStructure.sentenceLength}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-stone/60 uppercase tracking-widest">Directness</span>
                        <div className="w-24 h-1 bg-titanium/20 rounded-full overflow-hidden">
                          <div className="h-full bg-gold" style={{ width: `${resonance.model.writingStructure.directness * 100}%` }} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-stone/60 uppercase tracking-widest block">Rhythm Pattern</span>
                        <p className="text-[10px] text-ivory/80 leading-relaxed italic">"{resonance.model.writingStructure.rhythm}"</p>
                      </div>
                    </div>
                  </div>

                  {/* Layer 2: Reasoning Architecture */}
                  <div className="glass-panel p-6 space-y-4 border-gold/10 col-span-2">
                    <div className="flex items-center gap-3 text-gold">
                      <Brain size={18} />
                      <h4 className="text-xs uppercase tracking-[0.2em] font-bold">Reasoning Architecture Layer</h4>
                    </div>
                    <div className="grid grid-cols-3 gap-x-8 gap-y-4">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] text-stone/60 uppercase tracking-widest">Progression</span>
                          <span className="text-[9px] text-ivory uppercase tracking-widest font-mono">{resonance.model.reasoningArchitecture.progression}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] text-stone/60 uppercase tracking-widest">Entry Point</span>
                          <span className="text-[9px] text-ivory uppercase tracking-widest font-mono">{resonance.model.reasoningArchitecture.entryPoint}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] text-stone/60 uppercase tracking-widest">Primary Driver</span>
                          <span className="text-[9px] text-ivory uppercase tracking-widest font-mono">{resonance.model.reasoningArchitecture.primaryDriver}</span>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] text-stone/60 uppercase tracking-widest">Density</span>
                          <span className="text-[9px] text-ivory uppercase tracking-widest font-mono">{resonance.model.reasoningArchitecture.density}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] text-stone/60 uppercase tracking-widest">Methodology</span>
                          <span className="text-[9px] text-ivory uppercase tracking-widest font-mono">{resonance.model.reasoningArchitecture.methodology}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] text-stone/60 uppercase tracking-widest">Framing</span>
                          <span className="text-[9px] text-ivory uppercase tracking-widest font-mono">{resonance.model.reasoningArchitecture.framing}</span>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] text-stone/60 uppercase tracking-widest">Intent</span>
                          <span className="text-[9px] text-ivory uppercase tracking-widest font-mono">{resonance.model.reasoningArchitecture.intent}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] text-stone/60 uppercase tracking-widest">Epistemic Stance</span>
                          <span className="text-[9px] text-ivory uppercase tracking-widest font-mono">{resonance.model.reasoningArchitecture.epistemicStance}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] text-stone/60 uppercase tracking-widest">Temporal Focus</span>
                          <span className="text-[9px] text-ivory uppercase tracking-widest font-mono">{resonance.model.reasoningArchitecture.temporalFocus}</span>
                        </div>
                      </div>
                      <div className="col-span-3 pt-2">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[9px] text-stone/60 uppercase tracking-widest">Abstraction Level</span>
                          <span className="text-[9px] text-gold font-mono">{(resonance.model.reasoningArchitecture.abstractionLevel * 100).toFixed(0)}%</span>
                        </div>
                        <div className="w-full h-1 bg-titanium/20 rounded-full overflow-hidden">
                          <div className="h-full bg-gold" style={{ width: `${resonance.model.reasoningArchitecture.abstractionLevel * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Layer 3: Emotional Expression */}
                  <div className="glass-panel p-6 space-y-4 border-gold/10">
                    <div className="flex items-center gap-3 text-gold">
                      <Heart size={18} />
                      <h4 className="text-xs uppercase tracking-[0.2em] font-bold">Emotional Expression Layer</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: 'Restraint', value: resonance.model.emotionalExpression.restraint },
                        { label: 'Warmth', value: resonance.model.emotionalExpression.warmth },
                        { label: 'Intensity', value: resonance.model.emotionalExpression.intensity },
                        { label: 'Reflection', value: resonance.model.emotionalExpression.reflection },
                      ].map(stat => (
                        <div key={stat.label} className="space-y-1">
                          <span className="text-[9px] text-stone/60 uppercase tracking-widest block">{stat.label}</span>
                          <div className="w-full h-1 bg-titanium/20 rounded-full overflow-hidden">
                            <div className="h-full bg-gold" style={{ width: `${stat.value * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Layer 4: Decision Expression */}
                  <div className="glass-panel p-6 space-y-4 border-gold/10">
                    <div className="flex items-center gap-3 text-gold">
                      <Target size={18} />
                      <h4 className="text-xs uppercase tracking-[0.2em] font-bold">Decision Expression Layer</h4>
                    </div>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <span className="text-[10px] text-stone/60 uppercase tracking-widest block">Judgment Style</span>
                        <p className="text-[10px] text-ivory/80 leading-relaxed italic">"{resonance.model.decisionExpression.judgmentStyle}"</p>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-stone/60 uppercase tracking-widest">Tradeoff Awareness</span>
                        <div className="w-24 h-1 bg-titanium/20 rounded-full overflow-hidden">
                          <div className="h-full bg-gold" style={{ width: `${resonance.model.decisionExpression.tradeoffAwareness * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-gold/5 border border-gold/20 rounded-sm space-y-4">
                  <div className="flex items-center gap-3 text-gold">
                    <Info size={16} />
                    <h4 className="text-[10px] uppercase tracking-widest font-bold">Resonance Principle</h4>
                  </div>
                  <p className="text-xs text-ivory/60 leading-relaxed font-serif italic">
                    "user expression pattern × truth constitution × calibrated refinement"
                  </p>
                  <p className="text-[10px] text-stone/60 leading-relaxed">
                    The Resonance subsystem is governed by Atlas's core truth constitution. It distinguishes between authentic written style and habitual reasoning flaws, ensuring that generated output reflects your highest-functioning mind rather than raw imitation.
                  </p>
                </div>
              </motion.div>
            )}

            {activeTab === 'significance' && (
              <motion.div
                key="significance"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-6xl mx-auto space-y-12"
              >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-12">
                    <section className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <h3 className="text-sm font-serif text-ivory uppercase tracking-[0.3em] font-bold flex items-center gap-3">
                            <Heart size={18} className="text-gold" /> Significance Threads
                          </h3>
                          <p className="text-[10px] text-stone/40 uppercase tracking-widest">Themes identified as personally meaningful across time.</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {resonance.threads.length > 0 ? (
                          resonance.threads.map((thread: ResonanceThread) => (
                            <ResonanceInsightCard 
                              key={thread.threadId} 
                              thread={thread}
                              onUpdate={(id, updates) => {
                                setState(prev => ({
                                  ...prev,
                                  resonance: {
                                    ...prev.resonance,
                                    threads: prev.resonance.threads.map(t => t.threadId === id ? { ...t, ...updates } : t)
                                  }
                                }));
                              }}
                            />
                          ))
                        ) : (
                          <div className="col-span-2 p-16 rounded-sm border border-gold/5 bg-gold/[0.02] flex flex-col items-center justify-center text-center gap-6">
                            <div className="w-20 h-20 rounded-full bg-gold/5 flex items-center justify-center">
                              <Activity size={32} className="text-gold/20" />
                            </div>
                            <div className="space-y-3 max-w-sm">
                              <p className="text-xs text-gold/60 uppercase tracking-widest font-bold">No Significance Threads Detected</p>
                              <p className="text-[10px] text-stone/40 leading-relaxed italic font-serif">
                                Atlas needs more interaction to identify patterns of meaning, identity, and psychological gravity.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>

                    <section className="glass-panel p-8 space-y-8">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-ivory uppercase tracking-widest flex items-center gap-3">
                          <Zap size={16} className="text-gold" /> Recent Observations
                        </h3>
                        <span className="text-[9px] text-stone/40 uppercase tracking-widest font-mono">{resonance.observations.length} Signals Detected</span>
                      </div>

                      <div className="space-y-4">
                        {resonance.observations.slice(0, 8).map((obs) => (
                          <div key={obs.observationId} className="p-4 rounded-sm border border-gold/5 bg-gold/[0.01] flex items-center justify-between group hover:bg-gold/[0.03] transition-all duration-500">
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-3">
                                <span className="text-[11px] font-bold text-gold uppercase tracking-tight">{obs.inferredTheme}</span>
                              </div>
                              <span className="text-[10px] text-stone/60 italic font-serif max-w-[400px] truncate">"{obs.excerptReference}"</span>
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-stone/40 uppercase tracking-widest">Confidence</span>
                                  <span className="text-[9px] text-gold font-mono">{obs.confidence}</span>
                                </div>
                                <span className="text-[8px] text-stone/30 font-mono">{new Date(obs.observedAt).toLocaleTimeString()}</span>
                              </div>
                              <ChevronRight size={14} className="text-stone/20 group-hover:text-gold/40 transition-colors" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  <div className="space-y-8">
                    <section className="glass-panel p-8">
                      <ThemeEvolutionView threads={resonance.threads} />
                    </section>

                    <section className="glass-panel p-8 space-y-6">
                      <h3 className="text-xs font-bold text-ivory uppercase tracking-widest flex items-center gap-3">
                        <ShieldCheck size={16} className="text-gold" /> Engine Integrity
                      </h3>
                      <div className="space-y-5">
                        {[
                          { label: 'Confidence Threshold', value: '0.75', color: 'text-gold' },
                          { label: 'Decay Resistance', value: 'Active', color: 'text-emerald-500' },
                          { label: 'Privacy Sensitivity', value: 'High', color: 'text-amber-500' },
                          { label: 'Guardrail Status', value: 'Nominal', color: 'text-emerald-500' },
                        ].map(item => (
                          <div key={item.label} className="flex items-center justify-between">
                            <span className="text-[10px] text-stone/40 uppercase tracking-widest">{item.label}</span>
                            <span className={cn("text-[10px] font-mono font-bold uppercase", item.color)}>{item.value}</span>
                          </div>
                        ))}
                        <div className="pt-4 border-t border-gold/10">
                          <p className="text-[10px] text-stone/40 leading-relaxed italic font-serif">
                            "Resonance is a significance engine, not a classification engine. It prioritizes meaning over keywords, ensuring that Atlas understands the gravity of your intent."
                          </p>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              </motion.div>
            )}
            {activeTab === 'lab' && (
              <motion.div
                key="lab"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-4xl mx-auto space-y-8"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-serif text-ivory uppercase tracking-widest">Refinement Lab</h3>
                    <div className="flex items-center gap-2 text-[10px] text-stone/40 uppercase tracking-widest">
                      <Lock size={12} />
                      <span>Private Cognitive Processing</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-3">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={maximumClarity}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setMaximumClarity(v);
                          if (v) setConsensusMode(false);
                        }}
                        className="rounded border-titanium/30 bg-titanium/10 text-gold focus:ring-gold/40"
                      />
                      <div>
                        <span className="text-[10px] uppercase tracking-widest text-gold font-bold">
                          Maximum Clarity
                        </span>
                        <p className="text-[9px] text-stone/50 mt-0.5">
                          Tavily deep research (BYOK or quota) → identical web context to Groq Llama 3.3 70B and Gemini
                          1.5 Pro in parallel → Gemini Chief Judge streams one unified answer.
                        </p>
                      </div>
                    </label>

                    <label
                      className={cn(
                        'flex items-center gap-3 select-none',
                        maximumClarity ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                      )}
                    >
                      <input
                        type="checkbox"
                        disabled={maximumClarity}
                        checked={consensusMode}
                        onChange={(e) => setConsensusMode(e.target.checked)}
                        className="rounded border-titanium/30 bg-titanium/10 text-cyan-400 focus:ring-cyan-500/40 disabled:opacity-40"
                      />
                      <div>
                        <span className="text-[10px] uppercase tracking-widest text-cyan-400/90 font-bold">
                          Consensus Mode
                        </span>
                        <p className="text-[9px] text-stone/50 mt-0.5">
                          Cloud Swarm only: Groq and Gemini run together on your prompt; Gemini judges and streams the
                          final truth (no Tavily). Disabled while Maximum Clarity is on.
                        </p>
                      </div>
                    </label>

                    {clarityTerminalLines.length > 0 && (
                      <div className="rounded-sm border border-gold/20 bg-obsidian/80 p-3 max-h-40 overflow-y-auto font-mono text-[9px] text-emerald-400/90 space-y-1">
                        {clarityTerminalLines.map((line, i) => (
                          <div key={`${i}-${line.slice(0, 24)}`} className="whitespace-pre-wrap break-words">
                            <span className="text-stone/40 mr-2">{'> '}</span>
                            {line}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <textarea
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Input text for Atlas to process through your Resonance Model..."
                      className="w-full h-48 bg-titanium/5 border border-titanium/10 rounded-sm p-6 text-ivory text-sm focus:outline-none focus:border-gold/30 transition-all resize-none placeholder:text-stone/20"
                    />
                    <div className="absolute bottom-4 right-4 flex items-center gap-4">
                      <span className="text-[10px] text-stone/40 font-mono">{inputText.length} characters</span>
                      <button
                        onClick={handleProcess}
                        disabled={isProcessing || !inputText.trim()}
                        className={cn(
                          "px-6 py-2 rounded-sm text-[10px] uppercase tracking-[0.2em] font-bold transition-all flex items-center gap-2",
                          isProcessing || !inputText.trim()
                            ? "bg-titanium/10 text-stone cursor-not-allowed"
                            : "bg-gold text-obsidian hover:bg-gold/80"
                        )}
                      >
                        {isProcessing ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Zap size={14} />
                            Generate Resonance
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {useLiveAtlas && isProcessing && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="glass-panel border border-gold/20 bg-obsidian/70 p-6 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-[10px] uppercase tracking-widest font-bold text-gold flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
                          Live output
                        </h4>
                        <span className="text-[9px] text-stone/50 font-mono tracking-widest">STREAMING</span>
                      </div>
                      <div className="max-h-[min(50vh,420px)] overflow-y-auto custom-scrollbar rounded-sm border border-titanium/10 bg-titanium/[0.04] p-4">
                        <div className="text-sm text-ivory/95 leading-relaxed font-serif whitespace-pre-wrap break-words min-h-[3rem]">
                          {labStreamText.length === 0 ? (
                            <span className="text-stone/45 text-xs italic">Awaiting tokens…</span>
                          ) : (
                            <>
                              {labStreamText}
                              <span
                                className="inline-block w-px h-[1.1em] bg-gold/70 ml-0.5 animate-pulse align-baseline"
                                aria-hidden
                              />
                            </>
                          )}
                          <div ref={labStreamEndRef} className="h-px w-full" aria-hidden />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>

                <AnimatePresence>
                  {resonance.history.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center gap-3 text-gold">
                        <Sparkles size={16} />
                        <h4 className="text-[10px] uppercase tracking-widest font-bold">Latest Resonance Output</h4>
                      </div>
                      <div className="glass-panel p-8 border-gold/20 bg-gold/5 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4">
                          <div className="flex items-center gap-2 px-2 py-1 bg-gold/10 border border-gold/20 rounded-sm">
                            <span className="text-[8px] text-gold uppercase tracking-widest font-bold">Confidence: {(resonance.history[0].confidence * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                        <div className="space-y-6">
                          <div className="space-y-2">
                            <span className="text-[9px] text-stone/40 uppercase tracking-widest block">Input Context</span>
                            <p className="text-xs text-stone italic">"{resonance.history[0].input}"</p>
                          </div>
                          <div className="h-[1px] w-full bg-gold/10" />
                          <div className="space-y-4">
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] text-gold uppercase tracking-widest font-bold">Atlas Response</span>
                              <span className="text-[8px] text-stone/40 uppercase tracking-widest">Mode: {resonance.history[0].mode}</span>
                            </div>
                            <p className="text-sm text-ivory leading-relaxed font-serif">
                              {resonance.history[0].output}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div
                key="history"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-4xl mx-auto space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-serif text-ivory uppercase tracking-widest">Resonance History</h3>
                  <span className="text-[10px] text-stone/40 uppercase tracking-widest">{resonance.history.length} Entries</span>
                </div>

                <div className="space-y-4">
                  {resonance.history.map((entry, idx) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="glass-panel p-6 border-titanium/10 hover:border-gold/20 transition-all group"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-titanium/5 rounded-sm">
                            <History size={14} className="text-stone group-hover:text-gold transition-colors" />
                          </div>
                          <div>
                            <span className="text-[10px] text-ivory uppercase tracking-widest block font-bold">{entry.mode}</span>
                            <span className="text-[8px] text-stone/40 uppercase tracking-widest">{new Date(entry.timestamp).toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-stone/40 uppercase tracking-widest">Confidence</span>
                          <span className="text-[10px] text-gold font-mono">{(entry.confidence * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <p className="text-[10px] text-stone line-clamp-1 italic">"{entry.input}"</p>
                        <p className="text-xs text-ivory/80 leading-relaxed line-clamp-2">{entry.output}</p>
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button className="text-[9px] text-gold uppercase tracking-widest flex items-center gap-1 hover:gap-2 transition-all">
                          View Full Resonance <ArrowRight size={10} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer / Status */}
      <footer className="h-12 border-t border-gold/10 px-8 flex items-center justify-between bg-obsidian/80 backdrop-blur-xl z-30">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-gold" />
            <span className="text-[9px] text-stone/60 uppercase tracking-widest">Model: v1.0.4-Sovereign</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[9px] text-stone/60 uppercase tracking-widest">Epistemic Integrity: Verified</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-[9px] text-stone/40 uppercase tracking-widest">
          <span>Last Model Update: {new Date(resonance.model.lastUpdated).toLocaleDateString()}</span>
        </div>
      </footer>
    </div>
  );
}
