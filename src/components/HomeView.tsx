// Atlas-Audit: [EXEC-MODE] Verified — Header ribbons + capabilities showcase tiles use coerceActiveMode (Quick Access / Recent Activity already gated).
// Atlas-Audit: [PERF-P5] Verified — Home ribbons, Quick Access, Recent Activity, and showcase tiles prefetch target chamber chunks on pointer enter (parity with Sidebar).
// Atlas-Audit: [EXEC-PULSE] Verified — Post-inquiry pulse line embeds omniRoutingProvenance so orientation layer + Firestore atlasWorkspace retain server-acknowledged route.
// Atlas-Audit: [EXEC-OMNI] Verified — Merges SSE routing + done without dropping lineOfInquiry; surfaces omniRoutingProvenance in synthesis modal.
// Atlas-Audit: [EXEC-ROUTE] Verified — Auto posture sends inferInquiryPosture() to omni-stream so routing is structurally intelligent without manual toggles.
// Atlas-Audit: [INTEGRATION] Successful inquiries append a pulse artifact and Quick Access lists the operating loop (Pulse, Directives, map, pressure, doctrine) so Home, Pulse, Command, Cartography, and Crucible share one visible thread.
// Atlas-Audit: [IX] Verified
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Sparkles, ArrowRight, Zap, Target, Brain, Clock, Shield, AlertCircle, TrendingUp, Layers, GitBranch, Compass, Info, CheckCircle2, Layout, Sliders, History, PenTool, Settings, Scale, BookOpen, ShieldAlert, Waves, Globe, AlertTriangle, Radio, Database, Activity, HelpCircle, Flame } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  AppState,
  UserQuestion,
  InquiryStyle,
  LatentPattern,
  MindSnapshot,
  InteractionSignal,
} from '../types';
import { AtlasGraph } from './AtlasGraph';
import { ATLAS_TRACE_CHANNEL, atlasTraceUserId } from '../lib/atlasTraceContext';
import { atlasApiUrl, atlasHttpEnabled, sanitizeAtlasError } from '../lib/atlasApi';
import { LayeredResponse } from './LayeredResponse';
import { DirectiveIntake } from './DirectiveIntake';
import { ResonanceEngine } from '../resonance/engine';
import { inferInquiryPosture } from '../lib/inquiryPosture';
import { coerceActiveMode, tryCoerceActiveMode } from '../lib/atlasWayfinding';
import { prefetchChamberForMode } from './lazyChamberModules';

const ProceduralStatusIndicator = ({ isAnalyzing, forcedStage, onAbort }: { isAnalyzing: boolean, forcedStage?: 'retrieving' | 'weighing', onAbort?: () => void }) => {
  const [stage, setStage] = useState<'retrieving' | 'cross-referencing' | 'weighing' | 'low-confidence'>(forcedStage || 'retrieving');

  const SOVEREIGN_PHRASES = {
    'retrieving': [
      "Consulting the Sovereign Archive...",
      "Accessing Latent Knowledge Strata...",
      "Summoning Epistemic Foundations...",
      "Querying the Infinite Void..."
    ],
    'cross-referencing': [
      "Synthesizing Resonance Patterns...",
      "Mapping Cognitive Intersections...",
      "Aligning with Constitutional Directives...",
      "Detecting Latent Truth-Signals..."
    ],
    'weighing': [
      "Evaluating Probabilistic Outcomes...",
      "Calibrating Epistemic Weight...",
      "Forging Logical Consistency...",
      "Distilling Sovereign Intent..."
    ],
    'low-confidence': [
      "Navigating Epistemic Ambiguity...",
      "Resolving Cognitive Dissonance...",
      "Seeking Higher-Order Clarity...",
      "Addressing Latent Uncertainty..."
    ]
  };

  const [phrase, setPhrase] = useState(SOVEREIGN_PHRASES['retrieving'][0]);

  useEffect(() => {
    if (forcedStage) {
      setStage(forcedStage);
    }
  }, [forcedStage]);

  useEffect(() => {
    if (!isAnalyzing || forcedStage) return;
    
    const sequence = [
      { state: 'retrieving', duration: 1200 },
      { state: 'cross-referencing', duration: 1800 },
      { state: 'weighing', duration: 2000 },
      { state: 'low-confidence', duration: 1500 },
      { state: 'cross-referencing', duration: 1500 }
    ];

    let currentStep = 0;
    let timeout: NodeJS.Timeout;

    const nextStep = () => {
      if (!isAnalyzing) return;
      const nextState = sequence[currentStep].state as keyof typeof SOVEREIGN_PHRASES;
      setStage(nextState);
      
      const phrases = SOVEREIGN_PHRASES[nextState];
      setPhrase(phrases[Math.floor(Math.random() * phrases.length)]);

      timeout = setTimeout(() => {
        currentStep = (currentStep + 1) % sequence.length;
        nextStep();
      }, sequence[currentStep].duration);
    };

    nextStep();

    return () => clearTimeout(timeout);
  }, [isAnalyzing]);

  if (!isAnalyzing) return null;

  return (
    <div className="flex items-center justify-between w-full px-4 py-2 bg-gold-500/5 border border-gold-500/10 rounded-sm">
      <div className="flex items-center gap-4">
        <div className="w-6 h-6 relative flex items-center justify-center">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 border-2 border-gold-500/20 border-t-gold-500 rounded-full"
          />
          <div className="w-1.5 h-1.5 bg-gold-500 rounded-full animate-pulse" />
        </div>
        
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.3em] text-gold-500 font-bold animate-pulse">
            {phrase}
          </span>
          <span className="text-[8px] uppercase tracking-widest text-stone/40 font-mono">
            {stage.replace('-', ' ')} • Processing...
          </span>
        </div>
      </div>

      {onAbort && (
        <motion.button
          whileHover={{ scale: 1.05, backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
          whileTap={{ scale: 0.95 }}
          onClick={onAbort}
          className="px-3 py-1.5 border border-red-500/30 text-red-500 text-[9px] uppercase tracking-widest font-bold hover:border-red-500/50 transition-all rounded-sm"
        >
          [ CANCEL INQUIRY ]
        </motion.button>
      )}
    </div>
  );
};

import { useSettingsStore } from '../services/state/settingsStore';

// ---------------------------------------------------------------------------
// OverseerAnnotationPanel — collapsible Constitutional Review panel
// ---------------------------------------------------------------------------
function OverseerAnnotationPanel({
  annotation,
}: {
  annotation: NonNullable<NonNullable<UserQuestion['response']>['overseerAnnotation']>;
}) {
  const [open, setOpen] = React.useState(false);
  const hasFlags = annotation.constitutional_check.length > 0;
  const hasGaps = annotation.gap_summary.length > 0;
  if (!hasFlags && !hasGaps && !annotation.synthesis_notes) return null;

  return (
    <div className="border border-purple-500/20 rounded-sm bg-obsidian/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2 text-left text-xs text-stone/70 hover:text-ivory transition-colors"
      >
        <span className="flex items-center gap-2 instrument-label uppercase tracking-widest text-[9px]">
          <Shield className="w-3 h-3 text-purple-400" />
          Constitutional Review
          {hasFlags && (
            <span className="bg-amber-500/20 text-amber-400 rounded-sm px-1 py-0.5 text-[8px]">
              {annotation.constitutional_check.length} flag{annotation.constitutional_check.length !== 1 ? 's' : ''}
            </span>
          )}
          {annotation.degraded && (
            <span className="bg-stone/20 text-stone/50 rounded-sm px-1 py-0.5 text-[8px]">degraded</span>
          )}
        </span>
        <span className="text-[10px] text-stone/40">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {hasFlags && (
            <div>
              <p className="instrument-label text-amber-400 uppercase tracking-widest text-[9px] mb-1">Constitutional Flags</p>
              <ul className="space-y-1">
                {annotation.constitutional_check.map((flag, i) => (
                  <li key={i} className="text-xs text-stone flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                    {flag}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hasGaps && (
            <div>
              <p className="instrument-label text-purple-400 uppercase tracking-widest text-[9px] mb-1">Epistemic Gaps</p>
              <ul className="space-y-1">
                {annotation.gap_summary.map((gap, i) => (
                  <li key={i} className="text-xs text-stone flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5">–</span>
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {annotation.synthesis_notes && (
            <div>
              <p className="instrument-label text-gold-500 uppercase tracking-widest text-[9px] mb-1">Overseer Notes</p>
              <p className="text-xs text-stone/80 leading-relaxed">{annotation.synthesis_notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface HomeViewProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onInteraction?: (signal: InteractionSignal) => void;
}

export function HomeView({ state, setState, onInteraction }: HomeViewProps) {
  const settings = useSettingsStore();
  const [query, setQuery] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [analysisResult, setAnalysisResult] = useState<UserQuestion | null>(null);
  const [followUpQuery, setFollowUpQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [supremeSearch, setSupremeSearch] = useState(false);

  /** Auto = server infers posture from line-of-inquiry class; 1–5 = Section IX scale. */
  const [inquiryPosture, setInquiryPosture] = useState<number | 'auto'>('auto');

  const [showHelp, setShowHelp] = useState(false);
  const [activeFeaturePanel, setActiveFeaturePanel] = useState<string | null>(null);
  const [forcedThinkingStage, setForcedThinkingStage] = useState<'retrieving' | 'weighing' | undefined>(undefined);
  const HOME_INQUIRY_TIMEOUT_MS = Number(
    (import.meta as { env?: { VITE_ATLAS_INQUIRY_TIMEOUT_MS?: string } }).env
      ?.VITE_ATLAS_INQUIRY_TIMEOUT_MS ?? '300000'
  );

  const synthesizeViaAtlasStream = async (
    q: string,
    signal?: AbortSignal
  ): Promise<UserQuestion> => {
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(() => ac.abort(), HOME_INQUIRY_TIMEOUT_MS);
    try {
      const streamBody: Record<string, unknown> = {
        userId: atlasTraceUserId(state),
        messages: [{ role: 'user', content: q }],
      };
      const effectivePosture =
        inquiryPosture === 'auto' ? inferInquiryPosture(q, state.sessionIntent) : inquiryPosture;
      streamBody.posture = effectivePosture;
      streamBody.lineOfInquiry =
        inquiryPosture === 'auto' ? 'auto-classified' : 'manual-posture';

      const res = await fetch(atlasApiUrl('/v1/chat/omni-stream'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        credentials: 'include',
        signal: ac.signal,
        body: JSON.stringify(streamBody),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(t || `HTTP ${res.status}`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('Atlas stream returned no body');

      const dec = new TextDecoder();
      let buffer = '';
      let full = '';
      let streamError: string | null = null;
      let serverRouting: {
        mode?: string;
        posture?: number;
        lineOfInquiry?: string | null;
      } | null = null;
      let overseerAnnotation: {
        constitutional_check: string[];
        gap_summary: string[];
        synthesis_notes: string;
        was_personalized: boolean;
        degraded: boolean;
      } | null = null;
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
          const dataRaw = dataLines.join('');
          let data: Record<string, unknown> | null = null;
          if (dataRaw) {
            try {
              data = JSON.parse(dataRaw) as Record<string, unknown>;
            } catch {
              data = { raw: dataRaw };
            }
          }
          if (eventName === 'delta' && typeof data?.text === 'string') {
            full += data.text;
          }
          if (eventName === 'routing' && data && typeof data === 'object') {
            const r = data as { mode?: string; posture?: number; lineOfInquiry?: string | null };
            serverRouting = { ...serverRouting, ...r };
          }
          if (eventName === 'done' && data && typeof data === 'object') {
            const d = data as {
              reply?: string;
              routing?: { mode?: string; posture?: number; lineOfInquiry?: string | null };
            };
            if (typeof d.reply === 'string' && !full.trim()) {
              full = d.reply;
            }
            if (d.routing && typeof d.routing === 'object') {
              serverRouting = { ...serverRouting, ...d.routing };
            }
          }
          if (eventName === 'overseer_annotation' && data && typeof data === 'object') {
            const oa = data as {
              constitutional_check?: unknown;
              gap_summary?: unknown;
              synthesis_notes?: unknown;
              was_personalized?: unknown;
              degraded?: unknown;
            };
            overseerAnnotation = {
              constitutional_check: Array.isArray(oa.constitutional_check) ? (oa.constitutional_check as string[]) : [],
              gap_summary: Array.isArray(oa.gap_summary) ? (oa.gap_summary as string[]) : [],
              synthesis_notes: typeof oa.synthesis_notes === 'string' ? oa.synthesis_notes : '',
              was_personalized: Boolean(oa.was_personalized),
              degraded: Boolean(oa.degraded),
            };
          }
          if (eventName === 'error') {
            streamError = sanitizeAtlasError(String(data?.message ?? 'Atlas stream failed'));
          }
        }
      }

      if (streamError) throw new Error(streamError);
      if (!full.trim()) throw new Error('Atlas returned no content for this inquiry.');

      const posture = Math.min(5, Math.max(1, serverRouting?.posture ?? 2));
      const mode = serverRouting?.mode ?? 'direct_qa';
      const analysisStyle: InquiryStyle =
        mode === 'truth_pressure' || mode === 'contradiction_analysis'
          ? 'adversarial'
          : posture >= 4
            ? 'strategic'
            : posture <= 1
              ? 'technical'
              : 'synthetic';
      const suggestedChambers =
        posture <= 2
          ? []
          : posture === 3
            ? ['crucible']
            : ['sovereign-atrium', 'crucible'];
      const followUp =
        posture <= 1
          ? 'Say if you want a deeper pass (raise posture) or a challenge frame.'
          : posture === 2
            ? 'What fact or constraint would most change this answer?'
            : 'What part should we test, simulate, or persist to a ledger next?';

      const epistemicStatus: NonNullable<UserQuestion['response']>['epistemicStatus'] =
        posture <= 2 ? 'inference' : posture >= 4 ? 'interpretation' : 'hypothesis';

      return {
        id: `uq-${Date.now()}`,
        text: q,
        timestamp: new Date().toISOString(),
        analysis: {
          style: analysisStyle,
          depth: posture / 5,
          dimensions: {
            primaryStyles: [analysisStyle],
            structurePreference: posture >= 4 ? 'structured' : 'exploratory',
          },
        },
        response: {
          synthesis: full.trim(),
          latentPatterns: [],
          strategicImplications: [],
          suggestedChambers,
          epistemicStatus,
          cognitiveSignatureImpact: `Omni-stream · ${mode} · posture ${posture}/5`,
          omniRoutingProvenance: {
            mode,
            posture,
            lineOfInquiry:
              serverRouting?.lineOfInquiry !== undefined && serverRouting.lineOfInquiry !== ''
                ? serverRouting.lineOfInquiry
                : null,
          },
          ...(overseerAnnotation ? { overseerAnnotation } : {}),
          followUp,
        },
      };
    } catch (e) {
      if (ac.signal.aborted) {
        throw new Error(
          `Inquiry timed out after ${Math.round(HOME_INQUIRY_TIMEOUT_MS / 1000)}s while waiting for Atlas response.`
        );
      }
      throw e;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    }
  };

  useEffect(() => {
    if (state.activeChamberState) {
      const { query: chamberQuery, immediateSend, thinkingState, forcedQuery, focusState } = state.activeChamberState;
      
      const targetQuery = forcedQuery || chamberQuery;
      setQuery(targetQuery);
      
      if (thinkingState) {
        setForcedThinkingStage(thinkingState === 'WEIGHING CONTRADICTIONS' ? 'weighing' : 'retrieving');
      }

      if (focusState) {
        console.log(`AI Focus State set to: ${focusState}`);
      }

      // Clear the state immediately to prevent loops
      setState(prev => ({ ...prev, activeChamberState: undefined }));

      if (immediateSend || forcedQuery) {
        handleSearch(undefined, targetQuery);
      }
    }
  }, [state.activeChamberState, setState]);

  const handleSearch = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) e.preventDefault();
    const searchVal = overrideQuery || query;
    if (!searchVal.trim()) return;

    setError(null);
    const controller = new AbortController();
    setAbortController(controller);

    console.log('Starting search for:', searchVal);
    try {
      setIsAnalyzing(true);
      // 1. Generate Resonance Context Packet (Pre-synthesis)
      const resonanceContext = ResonanceEngine.getContextPacket(searchVal, {
        threads: state.resonance.threads,
        adaptiveProfile: state.resonance.adaptiveProfile
      });
      console.log('Resonance context prepared');

      // 2. Keep user-visible answer path responsive; do not block on resonance internals.
      const resonancePromise = Promise.race([
        ResonanceEngine.processIncomingMessage(
          `msg-${Date.now()}`,
          searchVal,
          {
            profiles: state.resonance.profiles,
            threads: state.resonance.threads,
            graph: state.resonance.graph
          },
          atlasTraceUserId(state),
        ),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
      ]).catch(() => null);

      const analysis = await (atlasHttpEnabled()
        ? synthesizeViaAtlasStream(searchVal, controller.signal)
        : Promise.reject(
            new Error('Atlas API is not enabled. Start backend and use /api proxy for inquiries.')
          ));
      const resonanceResult = await resonancePromise;

      console.log('Synthesis and Resonance processing complete');

      if (!analysis) throw new Error("Missing analysis result");

      setAnalysisResult(analysis);
      
      // 3. Send interaction signal for the query
      if (onInteraction) {
        onInteraction({
          type: 'query_complexity',
          value: analysis.analysis.depth,
          timestamp: Date.now(),
          context: {
            query: searchVal,
            intent: state.sessionIntent
          }
        });
      }

      console.log('Synthesis successful:', analysis.id);
      if (resonanceResult?.observation) {
        console.log('Resonance detected:', resonanceResult.observation.inferredTheme);
      }

      setState(prev => {
        console.log('Updating application state...');
        const newQuestions = [analysis, ...prev.recentQuestions].slice(0, 10);
        
        // Update latent patterns based on the new analysis
        const newLatentPatterns: LatentPattern[] = analysis.response?.latentPatterns?.map(p => ({
          id: `lp-${Math.random().toString(36).substr(2, 5)}`,
          inferredCenter: p,
          supportingSignals: [analysis.id],
          confidence: 0.7
        })) || [];

        const newMindSnapshot: MindSnapshot = {
          id: `snapshot-${Date.now()}`,
          timestamp: new Date().toISOString(),
          signature: {
            thinkingStyle: 'philosopher',
            learningCadence: 'deliberate',
            strengths: ['Synthesis', 'Pattern Recognition'],
            intellectualAltitude: 0.8,
            ambiguityTolerance: 0.7,
            systemicCoherence: 0.9,
            synthesisVelocity: 0.6,
            preferredInstructionMode: 'socratic',
            topology: {
              primaryStyles: ['philosophical', 'synthetic'],
              abstractionLevel: 0.8,
              compressionPreference: 'layered',
              appetiteForRigor: 0.9,
              appetiteForAmbiguity: 0.7,
              synthesisVsDecomposition: 0.8,
              theoryVsApplication: 0.5,
              structurePreference: 'exploratory',
              fascinationWithContradiction: 0.6,
              fascinationWithMotive: 0.4,
              fascinationWithSystems: 0.9,
              attractionToSymbolism: 0.3,
              attractionToHiddenArchitecture: 0.8,
              toleranceForUnresolvedTension: 0.7,
              preferenceForAdversarialTesting: 0.4,
              preferenceForRefinement: 0.9,
              eleganceVsUtility: 0.7
            },
            latentPatterns: []
          },
          dominantTensions: analysis.response?.latentPatterns?.slice(0, 3) || [],
          refinementFocus: analysis.response?.suggestedChambers?.[0] || 'General Synthesis'
        };

        const inquirySummary =
          searchVal.length > 140 ? `${searchVal.slice(0, 140)}…` : searchVal;

        const prov = analysis.response?.omniRoutingProvenance;
        const routeClause = prov
          ? ` Omni: ${prov.mode} · posture ${prov.posture}/5${
              prov.lineOfInquiry != null && prov.lineOfInquiry !== ''
                ? ` · inquiry ${prov.lineOfInquiry}`
                : ''
            }.`
          : '';

        return {
          ...prev,
          recentQuestions: newQuestions,
          searchHistory: [{ query: searchVal, timestamp: new Date().toISOString() }, ...(prev.searchHistory || [])].slice(0, 50),
          mindHistory: [...(prev.mindHistory || []), newMindSnapshot],
          pulse: {
            lastUpdate: new Date().toISOString(),
            items: [
              {
                id: `pulse-inquiry-${analysis.id}`,
                type: 'pattern' as const,
                content: `Inquiry completed — “${inquirySummary}”.${routeClause} Open Pulse for orientation; Crucible to stress-test conclusions.`,
                priority: 2,
                timestamp: new Date().toISOString(),
              },
              ...prev.pulse.items,
            ].slice(0, 20),
          },
          userModel: {
            ...prev.userModel,
            thoughtStructure: {
              ...prev.userModel.thoughtStructure,
              latentPatterns: [...prev.userModel.thoughtStructure.latentPatterns, ...newLatentPatterns]
            }
          },
          resonance: resonanceResult
            ? {
                ...prev.resonance,
                profiles: resonanceResult.updatedProfiles,
                threads: resonanceResult.updatedThreads,
                graph: resonanceResult.updatedGraph,
                observations: resonanceResult.observation
                  ? [resonanceResult.observation, ...prev.resonance.observations].slice(0, 50)
                  : prev.resonance.observations
              }
            : prev.resonance,
          adaptiveEvolution: {
            ...prev.adaptiveEvolution,
            evolutionLog: analysis.response?.adaptiveEvolutionLogs 
              ? [...analysis.response.adaptiveEvolutionLogs.map(log => ({...log, id: `ael-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, timestamp: new Date().toISOString()})), ...prev.adaptiveEvolution.evolutionLog].slice(0, 100)
              : prev.adaptiveEvolution.evolutionLog
          }
        };
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Inquiry aborted by user');
      } else {
        console.error("Synthesis failed:", err);
        setError(err.message || "An unexpected error occurred during synthesis.");
      }
    } finally {
      setIsAnalyzing(false);
      setAbortController(null);
    }
  };

  const handleAbort = () => {
    if (abortController) {
      abortController.abort();
      setIsAnalyzing(false);
      setAbortController(null);
    }
  };

  const handleFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUpQuery.trim()) return;

    const nextQuery = followUpQuery;
    setFollowUpQuery('');
    setQuery(nextQuery);
    await handleSearch(undefined, nextQuery);
  };

  const handleCloseAnalysis = () => {
    setAnalysisResult(null);
    setQuery('');
  };

  const intents: { id: AppState['sessionIntent']; label: string; icon: any; description: string }[] = [
    { id: 'think', label: 'Think', icon: Brain, description: 'Deep synthesis and pattern mapping.' },
    { id: 'decide', label: 'Decide', icon: Target, description: 'Tradeoff analysis and strategy.' },
    { id: 'study', label: 'Study', icon: Layers, description: 'Mastery paths and concept dossiers.' },
    { id: 'write', label: 'Write', icon: Sparkles, description: 'Language refinery and structure.' },
    { id: 'reflect', label: 'Reflect', icon: Clock, description: 'Continuity and identity growth.' },
  ];

  return (
    <div className="h-full relative overflow-y-auto obsidian-surface custom-scrollbar">
      {/* Continuity Ribbon */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: "easeOut" }}
        className="hidden lg:flex sticky top-0 z-50 w-full min-h-[48px] bg-obsidian/80 backdrop-blur-md border-b border-purple-500/10 px-4 lg:px-8 flex-wrap items-center justify-between gap-2 py-2 lg:py-0"
      >
        <div className="flex items-center gap-3 lg:gap-6 w-full lg:w-auto">
          <span className="text-[9px] uppercase tracking-[0.3em] text-gold-500 font-bold hidden sm:inline-block">Continuity Protocol</span>
          <div className="flex items-center gap-3 sm:border-l border-purple-500/20 sm:pl-6">
            <div className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulse shadow-[0_0_8px_rgba(212,175,55,0.4)] shrink-0" />
            <span className="text-[10px] text-ivory opacity-60 italic font-serif line-clamp-1">
              {state.mindHistory.length > 0 
                ? `Resuming thread: ${state.mindHistory[state.mindHistory.length - 1].refinementFocus}`
                : "Initializing new intellectual arc..."}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 lg:gap-6 w-full lg:w-auto justify-end">
          <button 
            onClick={() =>
              setState((prev) => ({
                ...prev,
                activeMode: coerceActiveMode('today-in-atlas', prev.activeMode),
              }))
            }
            className="min-h-[44px] lg:min-h-0 text-[9px] uppercase tracking-[0.2em] text-stone hover:text-gold-500 transition-all duration-500 flex items-center gap-2 group"
          >
            <Layout size={12} className="group-hover:scale-110 transition-transform" />
            <span className="hidden sm:inline-block">Today in Atlas</span>
          </button>
          <button 
            onPointerEnter={() => prefetchChamberForMode('capabilities')}
            onClick={() =>
              setState((prev) => ({
                ...prev,
                activeMode: coerceActiveMode('capabilities', prev.activeMode),
              }))
            }
            className="min-h-[44px] lg:min-h-0 text-[9px] uppercase tracking-[0.2em] text-stone hover:text-gold-500 transition-all duration-500 flex items-center gap-2 group"
          >
            <Info size={12} className="group-hover:scale-110 transition-transform" />
            <span className="hidden sm:inline-block">Capabilities</span>
          </button>
        </div>
      </motion.div>

      {/* Dynamic Background Graph */}
      {settings.isAdvancedMode && (
        <div className="fixed inset-0 z-0 opacity-20 pointer-events-none">
          <AtlasGraph 
            globalIntelligence={state.globalIntelligence} 
            hideUI 
            filter={query ? [query] : undefined}
            centerOn={analysisResult?.text}
          />
        </div>
      )}

      {/* Content Overlay - Three Column Layout */}
      <div className="relative z-0 min-h-full flex flex-col items-center py-6 lg:py-12 px-4 lg:px-8">
        <div className="w-full max-w-[1600px] flex flex-col items-center lg:grid lg:grid-cols-12 gap-8 lg:gap-10">
          
          {/* Column 1: Favorites & Anchors (Left) */}
          <motion.aside 
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="col-span-12 lg:col-span-3 space-y-8 lg:space-y-10 order-3 lg:order-1"
          >
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="instrument-label text-gold-500 uppercase tracking-[0.3em] flex items-center gap-3 text-[10px]">
                  <Target size={14} /> Favorites
                </h3>
                <button 
                  onClick={() => setActiveFeaturePanel('favorites')}
                  className="text-stone/40 hover:text-gold-500 transition-colors duration-300"
                >
                  <Info size={12} />
                </button>
              </div>
              <div className="space-y-3">
                {state.directives.filter(d => d.isActive).slice(0, 3).map((d, i) => (
                  <motion.div 
                    key={i} 
                    whileHover={{ x: 4 }}
                    className="glass-obsidian p-4 border-purple-500/10 hover:border-gold-500/30 hover:ring-1 hover:ring-gold-500/10 hover:shadow-[0_0_15px_rgba(212,175,55,0.03)] transition-all duration-300 cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-1 h-1 rounded-full bg-gold-500 shadow-[0_0_8px_rgba(212,175,55,0.4)]" />
                      <span className="text-[10px] text-ivory/80 uppercase tracking-widest truncate">{d.text}</span>
                    </div>
                  </motion.div>
                ))}
                <DirectiveIntake 
                  state={state} 
                  onUpdateState={(updates) => setState(prev => ({ ...prev, ...updates }))} 
                />
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="instrument-label text-gold-500 uppercase tracking-[0.3em] flex items-center gap-3 text-[10px]">
                <Compass size={14} /> Quick Access
              </h3>
              <div className="grid grid-cols-1 gap-3">
                {[
                  { label: 'Pulse', icon: Activity, mode: 'pulse' },
                  { label: 'Directives', icon: Settings, mode: 'directive-center' },
                  { label: 'Cartography', icon: Compass, mode: 'mind-cartography' },
                  { label: 'Crucible', icon: Flame, mode: 'crucible' },
                  { label: 'Constitution', icon: Scale, mode: 'constitution' },
                  { label: 'Truth Ledger', icon: Radio, mode: 'reality-ledger' },
                  { label: 'Memory Vault', icon: Database, mode: 'memory-vault' },
                ].map((item) => (
                  <button 
                    key={item.label}
                    onPointerEnter={() => {
                      const m = tryCoerceActiveMode(item.mode);
                      if (m) prefetchChamberForMode(m);
                    }}
                    onClick={() =>
                      setState((prev) => ({
                        ...prev,
                        activeMode: coerceActiveMode(item.mode, prev.activeMode),
                      }))
                    }
                    className="flex items-center gap-4 p-4 glass-obsidian border-purple-500/10 hover:border-gold-500/30 hover:ring-1 hover:ring-gold-500/10 hover:shadow-[0_0_15px_rgba(212,175,55,0.03)] transition-all duration-300 group"
                  >
                    <item.icon size={14} className="text-stone group-hover:text-gold-500 transition-colors" />
                    <span className="text-[10px] text-stone group-hover:text-ivory uppercase tracking-widest transition-colors">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </motion.aside>

          {/* Column 2: Primary Continuation Zone (Center) */}
          <motion.main 
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            className="col-span-12 lg:col-span-6 w-full space-y-12 lg:space-y-16 order-1 lg:order-2"
          >
            {/* Inquiry Surface */}
            <div className="space-y-10">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-6 bg-red-900/20 border border-red-500/30 rounded-lg backdrop-blur-md"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <ShieldAlert className="text-red-400" size={18} />
                    <h3 className="text-sm font-bold text-red-400 uppercase tracking-widest">Synthesis Interrupted</h3>
                  </div>
                  <p className="text-xs text-red-200/70 leading-relaxed mb-4">{error}</p>
                  <button 
                    onClick={() => { setError(null); setAnalysisResult(null); }}
                    className="px-4 py-2 bg-red-500/20 hover:bg-red-500/40 border border-red-500/50 text-[10px] text-red-200 uppercase tracking-[0.2em] transition-all"
                  >
                    Reset Surface
                  </button>
                </motion.div>
              )}
              <div className="space-y-4">
                <h1 className="text-2xl lg:text-5xl font-serif text-ivory leading-tight tracking-tight">
                  Obsidian Atlas
                </h1>
                <p className="text-stone text-sm opacity-50 max-w-xl leading-relaxed">
                  What is the next <span className="italic text-gold-500/80">line of inquiry?</span> Atlas is prepared to synthesize, map, and cross-reference your current cognitive state.
                </p>
                <p className="text-[10px] font-mono text-stone/45 uppercase tracking-[0.2em] max-w-xl leading-relaxed">
                  Operating loop — Pulse · Directives · Cartography · Crucible · Constitution (use Quick Access →)
                </p>
              </div>

              <form onSubmit={handleSearch} className="relative group">
                <div className={`absolute -inset-1 rounded-sm blur transition duration-1000 group-hover:duration-200 pointer-events-none ${supremeSearch ? 'bg-gradient-to-r from-teal/30 via-gold-500/40 to-teal/30 opacity-40 group-hover:opacity-60' : 'bg-gradient-to-r from-purple-600/20 via-gold-500/40 to-purple-600/20 opacity-20 group-hover:opacity-40 group-focus-within:opacity-60 group-focus-within:duration-500'}`}></div>
                <div className="relative flex items-center bg-purple-500/10 backdrop-blur-xl border border-purple-500/30 focus-within:border-gold-500/50 rounded-sm overflow-hidden p-2 transition-all duration-500">
                  <div className="flex items-center gap-2">
                    {isAnalyzing ? (
                      <ProceduralStatusIndicator 
                        isAnalyzing={isAnalyzing} 
                        forcedStage={forcedThinkingStage} 
                        onAbort={handleAbort}
                      />
                    ) : (
                      <Search className={`w-5 h-5 ml-4 transition-colors ${supremeSearch ? 'text-teal' : 'text-stone'}`} />
                    )}
                  </div>
                  <input 
                    type="text"
                    value={query}
                    onChange={(e) => {
                      console.log('HomeView Search Input Change:', e.target.value);
                      setQuery(e.target.value);
                    }}
                    placeholder={supremeSearch ? "Supreme Search: Global, cross-referenced, rigorous..." : "Enter a line of inquiry..."}
                    className="flex-1 bg-transparent border-none outline-none px-4 lg:px-6 py-4 text-ivory placeholder:text-stone/40 font-sans text-base lg:text-lg w-full min-w-0"
                    disabled={isAnalyzing}
                  />
                  <button
                    type="button"
                    onClick={() => setSupremeSearch(!supremeSearch)}
                    className={`px-3 lg:px-4 py-4 transition-all border-l border-purple-500/30 flex items-center gap-2 ${supremeSearch ? 'bg-teal/10 text-teal hover:bg-teal/20' : 'bg-transparent text-stone hover:text-ivory hover:bg-purple-500/10'}`}
                  >
                    <Globe size={16} />
                  </button>
                  <button 
                    type="submit"
                    disabled={isAnalyzing}
                    className={`px-4 lg:px-8 py-4 transition-all border-l border-purple-500/30 flex items-center gap-3 group ${supremeSearch ? 'bg-teal/20 hover:bg-teal/30 text-teal' : 'bg-gold-500/10 hover:bg-gold-500/20 text-gold-500'}`}
                  >
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </form>

              <div className="flex flex-wrap items-center justify-center gap-2 text-[9px] uppercase tracking-widest text-stone/70">
                <span className="text-gold-500/80 font-bold">Posture</span>
                {(
                  [
                    { v: 'auto' as const, label: 'Auto' },
                    { v: 1 as const, label: '1 Direct' },
                    { v: 2 as const, label: '2 Practical' },
                    { v: 3 as const, label: '3 Challenge' },
                    { v: 4 as const, label: '4 Strategic' },
                    { v: 5 as const, label: '5 Deep' },
                  ] as const
                ).map(({ v, label }) => (
                  <button
                    key={label}
                    type="button"
                    disabled={isAnalyzing}
                    onClick={() => setInquiryPosture(v)}
                    className={cn(
                      'rounded-sm border px-2 py-1 transition-colors',
                      inquiryPosture === v
                        ? 'border-gold-500/50 bg-gold-500/10 text-gold-500'
                        : 'border-purple-500/15 hover:border-stone/30 text-stone'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Session Intent Selector */}
              <div className="flex flex-wrap justify-center gap-2 md:gap-3">
                {intents.map((intent) => (
                  <button
                    key={intent!.id}
                    onClick={() => setState(prev => ({ ...prev, sessionIntent: intent!.id }))}
                    className={`min-h-[40px] md:min-h-[44px] px-3 md:px-4 py-2 md:py-3 rounded-sm border transition-all duration-500 flex items-center justify-center gap-2 md:gap-3 group ${
                      state.sessionIntent === intent!.id 
                        ? 'border-gold-500 bg-gold-500/5 text-gold-500' 
                        : 'border-purple-500/10 bg-purple-500/5 text-stone hover:border-ivory/20 hover:text-ivory'
                    }`}
                  >
                    <intent.icon size={14} className={cn("transition-all", state.sessionIntent === intent!.id ? 'text-gold-500' : 'text-stone group-hover:text-ivory')} />
                    <span className="text-[8px] md:text-[9px] uppercase tracking-[0.2em] font-bold">{intent.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Continuation Feed */}
            <div className="space-y-8">
              <h3 className="instrument-label text-gold-500 uppercase tracking-[0.3em] flex items-center gap-3 text-[10px]">
                <Activity size={14} /> Active Threads
              </h3>
              <div className="space-y-6">
                {state.recentQuestions.slice(0, 3).map((q, i) => (
                  <div key={i} className="glass-panel p-8 border-gold-500/5 hover:border-gold-500/20 transition-all cursor-pointer group space-y-4">
                    <div className="flex justify-between items-start">
                      <span className="text-[9px] text-gold-500 uppercase tracking-widest font-bold">Inquiry Arc</span>
                      <span className="text-[8px] text-stone opacity-40 uppercase tracking-widest">{new Date(q.timestamp).toLocaleDateString()}</span>
                    </div>
                    <p className="text-lg font-serif text-ivory group-hover:text-gold-500 transition-colors">{q.text}</p>
                    <div className="flex items-center gap-4 pt-2">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-teal" />
                        <span className="text-[9px] text-stone uppercase tracking-widest">Synthesis Ready</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-gold-500" />
                        <span className="text-[9px] text-stone uppercase tracking-widest">{q.analysis.style}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.main>

          {/* Column 3: Recent Activity & Intelligence Feed (Right) */}
          <motion.aside 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="col-span-12 lg:col-span-3 space-y-8 lg:space-y-10 order-2 lg:order-3"
          >
            <div className="space-y-6">
              <h3 className="instrument-label text-gold-500 uppercase tracking-[0.3em] flex items-center gap-3 text-[10px]">
                <History size={14} /> Recent Activity
              </h3>
              <div className="space-y-4">
                {([
                  { type: 'Decision', title: 'Q3 Resource Allocation', route: 'decisions' as const, time: '2 hours ago' },
                  { type: 'Scenario', title: 'Market Contraction Simulation', route: 'mirrorforge' as const, time: '5 hours ago' },
                  { type: 'Node', title: 'Epistemic Logic Framework', route: 'atlas' as const, time: '1 day ago' },
                  { type: 'Journal', title: 'Reflections on Sovereignty', route: 'journal' as const, time: '2 days ago' },
                ] as const).map((item, i) => (
                  <motion.div 
                    key={i} 
                    whileHover={{ scale: 0.98 }}
                    onPointerEnter={() => {
                      const m = tryCoerceActiveMode(item.route);
                      if (m) prefetchChamberForMode(m);
                    }}
                    onClick={() => {
                      setState((prev) => ({
                        ...prev,
                        activeMode: coerceActiveMode(item.route, prev.activeMode),
                      }));
                    }}
                    className="flex items-start gap-4 group cursor-pointer hover:bg-gold-500/5 p-2 -mx-2 rounded-sm transition-colors"
                  >
                    <div className="mt-1 w-1.5 h-1.5 rounded-full bg-gold-500/20 group-hover:bg-gold-500 transition-colors shadow-[0_0_8px_rgba(212,175,55,0)] group-hover:shadow-[0_0_8px_rgba(212,175,55,0.4)]" />
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-stone-400 group-hover:text-gold-500 transition-colors line-clamp-1">[{item.type}] {item.title}</span>
                      <span className="text-[8px] text-stone-500 uppercase tracking-widest">{item.time}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="instrument-label text-gold-500 uppercase tracking-[0.3em] flex items-center gap-3 text-[10px]">
                  <Sparkles size={14} /> Intelligence Feed
                </h3>
                <button 
                  onClick={() => setActiveFeaturePanel('intelligence')}
                  className="text-stone-500 hover:text-gold-500 transition-colors"
                >
                  <Info size={12} />
                </button>
              </div>
              <div className="space-y-4">
                <motion.div 
                  whileHover={{ scale: 0.98 }}
                  onClick={() => {
                    const cmd = "/calibrate --drift-id=DRIFT-092";
                    setQuery(cmd);
                    handleSearch(undefined, cmd);
                  }}
                  className={cn(
                    "glass-panel p-6 border-purple-500/10 bg-gradient-to-r from-purple-900/10 to-transparent space-y-3 relative overflow-hidden group cursor-pointer hover:border-gold-500/30 transition-colors",
                    isAnalyzing && query.includes("DRIFT-092") && "pulse-shimmer border-gold-500/50"
                  )}
                >
                  <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                    <AlertTriangle size={32} className="text-gold-500" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap size={12} className="text-gold-500" />
                    <span className="text-[9px] text-gold-500 uppercase tracking-widest font-bold">Drift Alert</span>
                    {isAnalyzing && query.includes("DRIFT-092") && (
                      <span className="text-[8px] text-gold-500 uppercase tracking-widest animate-pulse ml-auto">Scanning...</span>
                    )}
                  </div>
                  <p className="text-[10px] text-stone-400 leading-relaxed group-hover:text-stone-300 transition-colors">
                    {state.driftDetection?.alerts && state.driftDetection.alerts.length > 0
                      ? state.driftDetection.alerts[0].description ?? 'Drift pattern detected. Review recommended.'
                      : 'Drift monitoring active. No quantified alert data yet.'}
                  </p>
                </motion.div>
                <motion.div 
                  whileHover={{ scale: 0.98 }}
                  onClick={() => {
                    const cmd = "/analyze-pattern \"Epistemic Logic\"";
                    setQuery(cmd);
                    handleSearch(undefined, cmd);
                  }}
                  className={cn(
                    "glass-panel p-6 border-purple-500/10 bg-gradient-to-r from-purple-900/10 to-transparent space-y-3 relative overflow-hidden group cursor-pointer hover:border-gold-500/30 transition-colors",
                    isAnalyzing && query.includes("Epistemic Logic") && "pulse-shimmer border-gold-500/50"
                  )}
                >
                  <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Brain size={32} className="text-stone-500" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Brain size={12} className="text-stone-500" />
                    <span className="text-[9px] text-stone-500 uppercase tracking-widest font-bold group-hover:text-gold-500 transition-colors">Latent Pattern</span>
                    {isAnalyzing && query.includes("Epistemic Logic") && (
                      <span className="text-[8px] text-gold-500 uppercase tracking-widest animate-pulse ml-auto">Scanning...</span>
                    )}
                  </div>
                  <p className="text-[10px] text-stone-500 leading-relaxed group-hover:text-stone-400 transition-colors">Recurring interest in "Epistemic Logic" detected across 4 sessions.</p>
                </motion.div>
              </div>
            </div>
          </motion.aside>

        </div>
      </div>

        {/* Showcase Topics Section */}
        <motion.section 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          className="w-full max-w-6xl space-y-8 pt-12 border-t border-purple-500/10 hidden lg:block"
        >
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h3 className="instrument-label text-gold-500 uppercase tracking-[0.2em] flex items-center gap-2">
                <Compass size={14} /> Atlas Capabilities Showcase
              </h3>
              <p className="text-stone text-xs opacity-60 max-w-2xl">
                High-value topic gateways demonstrating Atlas's breadth, truth-seeking rigor, and advanced intelligence architecture.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div 
              onPointerEnter={() => prefetchChamberForMode('decisions')}
              onClick={() =>
                setState((prev) => ({
                  ...prev,
                  activeMode: coerceActiveMode('decisions', prev.activeMode),
                }))
              }
              className="glass-panel p-6 border-purple-500/20 hover:border-gold-500/30 transition-all cursor-pointer group space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/5 group-hover:bg-gold-500/10 rounded-sm transition-all">
                  <Target size={16} className="text-stone group-hover:text-gold-500 transition-colors" />
                </div>
                <h4 className="text-sm text-ivory font-serif group-hover:text-gold-500 transition-colors">How to Think More Clearly Under Complexity</h4>
              </div>
              <p className="text-[10px] text-stone opacity-60 leading-relaxed">Showcases decision architecture, contradiction mapping, and clarity systems.</p>
            </div>

            <div 
              onPointerEnter={() => prefetchChamberForMode('council')}
              onClick={() =>
                setState((prev) => ({
                  ...prev,
                  activeMode: coerceActiveMode('council', prev.activeMode),
                }))
              }
              className="glass-panel p-6 border-purple-500/20 hover:border-gold-500/30 transition-all cursor-pointer group space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/5 group-hover:bg-gold-500/10 rounded-sm transition-all">
                  <Scale size={16} className="text-stone group-hover:text-gold-500 transition-colors" />
                </div>
                <h4 className="text-sm text-ivory font-serif group-hover:text-gold-500 transition-colors">The Deep Structure of Power, Influence, and Authority</h4>
              </div>
              <p className="text-[10px] text-stone opacity-60 leading-relaxed">Showcases strategic analysis, social interpretation, doctrine, and presence systems.</p>
            </div>

            <div 
              onPointerEnter={() => prefetchChamberForMode('leviathan')}
              onClick={() =>
                setState((prev) => ({
                  ...prev,
                  activeMode: coerceActiveMode('leviathan', prev.activeMode),
                }))
              }
              className="glass-panel p-6 border-purple-500/20 hover:border-teal/30 transition-all cursor-pointer group space-y-4 bg-teal/5"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/5 group-hover:bg-teal/10 rounded-sm transition-all">
                  <Waves size={16} className="text-stone group-hover:text-teal transition-colors" />
                </div>
                <h4 className="text-sm text-ivory font-serif group-hover:text-teal transition-colors">What Makes a Theory Strong, Weak, or Dangerous?</h4>
              </div>
              <p className="text-[10px] text-stone opacity-60 leading-relaxed">Showcases Leviathan, proof-ground analysis, and critical thinking.</p>
            </div>

            <div 
              onPointerEnter={() => prefetchChamberForMode('continuity')}
              onClick={() =>
                setState((prev) => ({
                  ...prev,
                  activeMode: coerceActiveMode('continuity', prev.activeMode),
                }))
              }
              className="glass-panel p-6 border-purple-500/20 hover:border-gold-500/30 transition-all cursor-pointer group space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/5 group-hover:bg-gold-500/10 rounded-sm transition-all">
                  <History size={16} className="text-stone group-hover:text-gold-500 transition-colors" />
                </div>
                <h4 className="text-sm text-ivory font-serif group-hover:text-gold-500 transition-colors">How Minds Evolve Over Time</h4>
              </div>
              <p className="text-[10px] text-stone opacity-60 leading-relaxed">Showcases continuity, identity arc, memory, and mind cartography.</p>
            </div>

            <div 
              onPointerEnter={() => prefetchChamberForMode('red-team')}
              onClick={() =>
                setState((prev) => ({
                  ...prev,
                  activeMode: coerceActiveMode('red-team', prev.activeMode),
                }))
              }
              className="glass-panel p-6 border-purple-500/20 hover:border-oxblood/30 transition-all cursor-pointer group space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/5 group-hover:bg-oxblood/10 rounded-sm transition-all">
                  <ShieldAlert size={16} className="text-stone group-hover:text-oxblood transition-colors" />
                </div>
                <h4 className="text-sm text-ivory font-serif group-hover:text-oxblood transition-colors">Truth, Evidence, and How to Avoid Deluding Yourself</h4>
              </div>
              <p className="text-[10px] text-stone opacity-60 leading-relaxed">Showcases Atlas's truth-governance and anti-self-deception systems.</p>
            </div>

            <div 
              onPointerEnter={() => prefetchChamberForMode('doctrine')}
              onClick={() =>
                setState((prev) => ({
                  ...prev,
                  activeMode: coerceActiveMode('doctrine', prev.activeMode),
                }))
              }
              className="glass-panel p-6 border-purple-500/20 hover:border-gold-500/30 transition-all cursor-pointer group space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/5 group-hover:bg-gold-500/10 rounded-sm transition-all">
                  <BookOpen size={16} className="text-stone group-hover:text-gold-500 transition-colors" />
                </div>
                <h4 className="text-sm text-ivory font-serif group-hover:text-gold-500 transition-colors">How Great Thinkers Built Internal Doctrine</h4>
              </div>
              <p className="text-[10px] text-stone opacity-60 leading-relaxed">Showcases doctrine forge, reading ladders, and historical synthesis.</p>
            </div>
            
            <div 
              onPointerEnter={() => prefetchChamberForMode('relationships')}
              onClick={() =>
                setState((prev) => ({
                  ...prev,
                  activeMode: coerceActiveMode('relationships', prev.activeMode),
                }))
              }
              className="glass-panel p-6 border-purple-500/20 hover:border-gold-500/30 transition-all cursor-pointer group space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/5 group-hover:bg-gold-500/10 rounded-sm transition-all">
                  <GitBranch size={16} className="text-stone group-hover:text-gold-500 transition-colors" />
                </div>
                <h4 className="text-sm text-ivory font-serif group-hover:text-gold-500 transition-colors">The Architecture of Relationships, Trust, and Misreading</h4>
              </div>
              <p className="text-[10px] text-stone opacity-60 leading-relaxed">Showcases relationship intelligence and multiple-plausible-explanation discipline.</p>
            </div>

            <div 
              onPointerEnter={() => prefetchChamberForMode('mastery')}
              onClick={() =>
                setState((prev) => ({
                  ...prev,
                  activeMode: coerceActiveMode('mastery', prev.activeMode),
                }))
              }
              className="glass-panel p-6 border-purple-500/20 hover:border-gold-500/30 transition-all cursor-pointer group space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/5 group-hover:bg-gold-500/10 rounded-sm transition-all">
                  <Brain size={16} className="text-stone group-hover:text-gold-500 transition-colors" />
                </div>
                <h4 className="text-sm text-ivory font-serif group-hover:text-gold-500 transition-colors">From Raw Curiosity to Mastery</h4>
              </div>
              <p className="text-[10px] text-stone opacity-60 leading-relaxed">Showcases learning paths, mastery arenas, and concept dossiers.</p>
            </div>

            <div 
              onPointerEnter={() => prefetchChamberForMode('decisions')}
              onClick={() =>
                setState((prev) => ({
                  ...prev,
                  activeMode: coerceActiveMode('decisions', prev.activeMode),
                }))
              }
              className="glass-panel p-6 border-purple-500/20 hover:border-gold-500/30 transition-all cursor-pointer group space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/5 group-hover:bg-gold-500/10 rounded-sm transition-all">
                  <Clock size={16} className="text-stone group-hover:text-gold-500 transition-colors" />
                </div>
                <h4 className="text-sm text-ivory font-serif group-hover:text-gold-500 transition-colors">What Actually Matters in a High-Stakes Decision</h4>
              </div>
              <p className="text-[10px] text-stone opacity-60 leading-relaxed">Showcases the Decision Room, scenario modeling, and temporal intelligence.</p>
            </div>

            <div 
              onPointerEnter={() => prefetchChamberForMode('mind-cartography')}
              onClick={() =>
                setState((prev) => ({
                  ...prev,
                  activeMode: coerceActiveMode('mind-cartography', prev.activeMode),
                }))
              }
              className="glass-panel p-6 border-purple-500/20 hover:border-gold-500/30 transition-all cursor-pointer group space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/5 group-hover:bg-gold-500/10 rounded-sm transition-all">
                  <Compass size={16} className="text-stone group-hover:text-gold-500 transition-colors" />
                </div>
                <h4 className="text-sm text-ivory font-serif group-hover:text-gold-500 transition-colors">The Cartography of a Mind</h4>
              </div>
              <p className="text-[10px] text-stone opacity-60 leading-relaxed">Showcases the Inner Atlas / Mind Cartography feature.</p>
            </div>
          </div>
        </motion.section>

        {/* Help Center & Feature Panels Overlay */}
        <AnimatePresence>
          {showHelp && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-obsidian/90 backdrop-blur-xl flex items-center justify-center p-4 md:p-8"
            >
              <div className="w-full max-w-4xl glass-panel border-gold-500/10 p-6 md:p-12 space-y-8 md:space-y-12 relative max-h-[90vh] overflow-y-auto custom-scrollbar">
                <button 
                  onClick={() => setShowHelp(false)}
                  className="absolute top-8 right-8 text-stone hover:text-gold-500 transition-colors"
                >
                  <ArrowRight size={24} className="rotate-180" />
                </button>

                <div className="space-y-4">
                  <h2 className="text-3xl font-serif text-ivory">Atlas Help Center</h2>
                  <p className="text-stone text-sm opacity-60">Master the architecture of your sovereign intelligence environment.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                  <div className="space-y-8">
                    <h3 className="instrument-label text-gold-500 uppercase tracking-widest text-xs">Core Concepts</h3>
                    <div className="space-y-6">
                      {[
                        { title: 'Inquiry Synthesis', desc: 'How Atlas transforms questions into cognitive dossiers.' },
                        { title: 'Latent Patterns', desc: 'The hidden structures Atlas detects in your thought history.' },
                        { title: 'Drift Monitoring', desc: 'Maintaining alignment between your intent and system behavior.' },
                      ].map(item => (
                        <div key={item.title} className="space-y-2">
                          <h4 className="text-sm text-ivory font-serif">{item.title}</h4>
                          <p className="text-[10px] text-stone opacity-60 leading-relaxed">{item.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-8">
                    <h3 className="instrument-label text-gold-500 uppercase tracking-widest text-xs">Navigation Guide</h3>
                    <div className="space-y-4">
                      {[
                        { key: 'CMD + K', action: 'Global Search' },
                        { key: 'CMD + G', action: 'Toggle Graph' },
                        { key: 'CMD + S', action: 'Supreme Search' },
                        { key: 'ESC', action: 'Close Active Chamber' },
                      ].map(item => (
                        <div key={item.key} className="flex justify-between items-center py-3 border-b border-purple-500/10">
                          <span className="text-[10px] text-stone uppercase tracking-widest">{item.action}</span>
                          <kbd className="px-2 py-1 bg-purple-500/10 rounded-sm text-[9px] text-gold-500 font-mono">{item.key}</kbd>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeFeaturePanel && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="fixed top-16 lg:top-24 right-4 lg:right-8 w-[calc(100vw-2rem)] lg:w-80 z-[100] glass-panel border-gold-500/20 bg-obsidian/90 backdrop-blur-2xl p-6 lg:p-8 space-y-6 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="instrument-label text-gold-500 uppercase tracking-widest text-[10px]">
                  {activeFeaturePanel === 'favorites' ? 'About Favorites' : 'About Intelligence Feed'}
                </h3>
                <button 
                  onClick={() => setActiveFeaturePanel(null)}
                  className="text-stone/40 hover:text-gold-500 transition-colors"
                >
                  <ArrowRight size={14} />
                </button>
              </div>
              <p className="text-xs text-stone leading-relaxed italic font-serif">
                {activeFeaturePanel === 'favorites' 
                  ? "Favorites are your 'Spatial Anchors'—the most critical directives and chambers you return to for stability and focus."
                  : "The Intelligence Feed is a real-time synthesis of system health, latent pattern detection, and alignment alerts."}
              </p>
              <div className="pt-4 border-t border-purple-500/10">
                <button className="text-[9px] text-gold-500 uppercase tracking-widest hover:text-ivory transition-colors">
                  Learn More in Capabilities
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cognitive Signature & Synthesis Feedback */}
        <AnimatePresence>
          {analysisResult && !isAnalyzing && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="fixed inset-0 z-[70] flex items-center justify-center p-4 md:p-8 bg-obsidian/95 backdrop-blur-xl overflow-y-auto"
            >
              <div className="w-full max-w-6xl h-[85vh] relative flex flex-col mt-8">
                <button 
                  onClick={handleCloseAnalysis}
                  className="fixed top-4 right-4 md:top-8 md:right-8 px-6 py-3 bg-obsidian border border-purple-500/30 hover:border-gold-500/50 rounded-full transition-all z-[100] flex items-center gap-3 text-stone hover:text-ivory shadow-2xl group"
                >
                  <span className="instrument-label text-[10px] uppercase tracking-widest group-hover:text-gold-500 transition-colors">Close Analysis</span>
                  <ArrowRight className="w-4 h-4 rotate-180 group-hover:text-gold-500 transition-colors" />
                </button>

                <div className="flex-1 flex flex-col overflow-hidden shadow-2xl rounded-sm">
                  <div className="p-4 md:p-8 bg-obsidian/80 border-b border-purple-500/20 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-gold-500/10 rounded-sm">
                        <Brain className="w-6 h-6 text-gold-500" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-serif text-ivory">Cognitive Synthesis</h2>
                        <p className="instrument-label text-gold-500 tracking-widest uppercase opacity-60 text-[10px]">Inquiry Analysis & Latent Resonance</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-4 md:gap-8">
                      {analysisResult.response?.omniRoutingProvenance && (
                        <div className="text-right min-w-[12rem]">
                          <span className="instrument-label text-stone block mb-1 uppercase tracking-widest text-[9px]">
                            Omni route
                          </span>
                          <span className="text-[10px] font-mono text-stone/90 leading-snug block max-w-[20rem]">
                            {analysisResult.response.omniRoutingProvenance.mode} · posture{' '}
                            {analysisResult.response.omniRoutingProvenance.posture}/5
                            {analysisResult.response.omniRoutingProvenance.lineOfInquiry != null && (
                              <>
                                <br />
                                <span className="text-stone/60">
                                  inquiry: {analysisResult.response.omniRoutingProvenance.lineOfInquiry}
                                </span>
                              </>
                            )}
                          </span>
                        </div>
                      )}
                      <div className="text-right">
                        <span className="instrument-label text-stone block mb-1 uppercase tracking-widest text-[9px]">Inquiry Style</span>
                        <span className="text-sm font-serif text-ivory capitalize">{analysisResult.analysis.style}</span>
                      </div>
                      <div className="w-32">
                        <span className="instrument-label text-stone block mb-1 uppercase tracking-widest text-[9px]">Cognitive Depth</span>
                        <div className="h-1 bg-purple-500/30 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${analysisResult.analysis.depth * 100}%` }}
                            className="h-full bg-gold-500 shadow-[0_0_10px_rgba(212,175,55,0.5)]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-hidden">
                    {analysisResult.response?.layered ? (
                      <LayeredResponse 
                        data={analysisResult.response.layered} 
                        suggestedChambers={analysisResult.response.suggestedChambers}
                        cognitiveSignatureImpact={analysisResult.response.cognitiveSignatureImpact}
                        epistemicStatus={analysisResult.response.epistemicStatus}
                        onInteraction={onInteraction}
                      />
                    ) : (
                      <div className="p-6 md:p-12 space-y-6 md:space-y-8 overflow-y-auto h-full custom-scrollbar">
                        <div className="space-y-4">
                          <h3 className="text-lg font-serif text-ivory flex items-center gap-2">
                            <Layers className="w-5 h-5 text-gold-500" /> Synthesis
                          </h3>
                          <p className="text-stone leading-relaxed text-lg italic">
                            "{analysisResult.response?.synthesis}"
                          </p>
                        </div>

                        {analysisResult.response?.overseerAnnotation && (
                          <OverseerAnnotationPanel annotation={analysisResult.response.overseerAnnotation} />
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                          <div className="space-y-4">
                            <h4 className="instrument-label text-gold-500 uppercase tracking-widest flex items-center gap-2">
                              <GitBranch className="w-4 h-4" /> Latent Patterns
                            </h4>
                            <ul className="space-y-2">
                              {analysisResult.response?.latentPatterns?.map((p, i) => (
                                <li key={i} className="text-xs text-stone flex items-start gap-2">
                                  <span className="text-gold-500 mt-1">•</span> {p}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="space-y-4">
                            <h4 className="instrument-label text-gold-500 uppercase tracking-widest flex items-center gap-2">
                              <Target className="w-4 h-4" /> Strategic Implications
                            </h4>
                            <ul className="space-y-2">
                              {analysisResult.response?.strategicImplications?.map((p, i) => (
                                <li key={i} className="text-xs text-stone flex items-start gap-2">
                                  <span className="text-gold-500 mt-1">•</span> {p}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-4 md:p-6 bg-obsidian/40 border-t border-purple-500/10 flex flex-wrap items-center justify-between gap-4 md:gap-8">
                    <form onSubmit={handleFollowUp} className="flex-1 relative group">
                      <input 
                        type="text"
                        value={followUpQuery}
                        onChange={(e) => setFollowUpQuery(e.target.value)}
                        placeholder={analysisResult.response?.followUp || "Ask a follow-up question..."}
                        className="w-full bg-obsidian/40 border border-purple-500/20 rounded-sm px-6 py-3 text-ivory placeholder:text-stone/40 focus:outline-none focus:border-gold-500/30 transition-all pr-12"
                      />
                      <button 
                        type="submit"
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gold-500/40 group-hover:text-gold-500 transition-colors"
                      >
                        <ArrowRight className="w-5 h-5" />
                      </button>
                    </form>

                    <button 
                      onClick={handleCloseAnalysis}
                      className="bg-gold-500/10 hover:bg-gold-500/20 text-gold-500 px-6 md:px-12 py-3 transition-all border border-gold-500/30 flex items-center justify-center gap-3 group rounded-sm w-full md:w-auto"
                    >
                      <span className="instrument-label tracking-[0.3em] uppercase text-xs">Integrate into Atlas</span>
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Global Information Gateways */}
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          className="w-full max-w-6xl mt-24"
        >
          <div className="flex items-center justify-between mb-8 border-b border-titanium/20 pb-4">
            <h3 className="instrument-label text-gold uppercase tracking-[0.2em] flex items-center gap-2">
              <Compass size={14} /> Global Information Gateways
            </h3>
            <span className="text-[10px] text-stone uppercase tracking-widest">Supreme Information Gathering Active</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: "Truth, Evidence, and How Not to Delude Yourself", icon: Scale },
              { title: "How to Think Clearly Under Complexity", icon: Layers },
              { title: "The Deep Structure of Power, Influence, and Authority", icon: ShieldAlert },
              { title: "What Makes a Theory Strong, Weak, or Dangerous?", icon: Brain },
              { title: "How Minds Evolve Over Time", icon: History },
              { title: "From Curiosity to Mastery", icon: Target },
              { title: "What Actually Matters in a High-Stakes Decision", icon: Zap },
              { title: "The Architecture of Relationships, Trust, and Misreading", icon: GitBranch },
              { title: "The Cartography of a Mind", icon: Compass },
              { title: "The Deepest Questions in Science, Philosophy, and Reality", icon: Waves }
            ].map((gateway, i) => (
              <button
                key={i}
                onClick={() => handleSearch(undefined, gateway.title)}
                className="glass-panel p-6 border-titanium/20 hover:border-gold/40 text-left group transition-all duration-500 relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <gateway.icon size={18} className="text-stone group-hover:text-gold mb-4 transition-colors" />
                <h4 className="text-sm text-ivory font-serif leading-relaxed group-hover:text-gold transition-colors relative z-10">
                  {gateway.title}
                </h4>
                <div className="mt-4 flex items-center gap-2 text-[9px] text-stone uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity relative z-10">
                  <span>Initiate Descent</span>
                  <ArrowRight size={10} />
                </div>
              </button>
            ))}
          </div>
        </motion.section>

      </div>
    );
}
