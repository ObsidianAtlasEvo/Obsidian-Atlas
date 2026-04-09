import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, 
  Brain, 
  Info, 
  TrendingUp, 
  AlertCircle, 
  ArrowRight, 
  Eye, 
  Zap, 
  Target, 
  BookOpen, 
  Library,
  Layers,
  ChevronRight,
  ShieldCheck,
  Link as LinkIcon,
  ExternalLink,
  Scale,
  CheckCircle,
  HelpCircle,
  AlertTriangle,
  RefreshCw,
  GitBranch,
  Clock,
  Globe,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { LayeredResponse as LayeredResponseType, SourceMetadata, InteractionSignal } from '../types';
import { cn } from '../lib/utils';

import { useSettingsStore } from '../services/state/settingsStore';

interface LayeredResponseProps {
  data: LayeredResponseType;
  suggestedChambers?: string[];
  cognitiveSignatureImpact?: string;
  epistemicStatus?: string;
  onInteraction?: (signal: InteractionSignal) => void;
}

export const LayeredResponse = React.memo(function LayeredResponse({ 
  data, 
  suggestedChambers, 
  cognitiveSignatureImpact, 
  epistemicStatus,
  onInteraction
}: LayeredResponseProps) {
  const settings = useSettingsStore();
  const [activeTab, setActiveTab] = useState<string>('answer');
  const [answerSpineOpen, setAnswerSpineOpen] = useState(true);

  const showAnswerSpine = useMemo(
    () => typeof data.answer === 'string' && data.answer.trim().length > 0,
    [data.answer]
  );

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    if (onInteraction) {
      onInteraction({
        type: 'layer_expansion',
        value: 1, // Expansion event
        timestamp: Date.now(),
        context: { layerId: tabId }
      });
    }
  };

  const handleSourceClick = (source: SourceMetadata) => {
    if (onInteraction) {
      onInteraction({
        type: 'source_deep_dive',
        value: source.authority,
        timestamp: Date.now(),
        context: { sourceTitle: source.title, sourceType: source.type }
      });
    }
  };

  const tabs = [
    { id: 'answer', label: 'Answer', icon: MessageSquare, content: data.answer, visible: true },
    { id: 'truthFacing', label: 'Truth Facing', icon: Scale, content: data.truthFacing, visible: !!data.truthFacing },
    { id: 'interpretation', label: 'Interpretation', icon: Eye, content: data.interpretation, visible: !!data.interpretation },
    { id: 'reasoning', label: 'Reasoning', icon: Brain, content: data.reasoning, visible: !!data.reasoning },
    { id: 'verification', label: 'Verification', icon: ShieldCheck, content: data.verification, visible: !!data.verification },
    { id: 'sources', label: 'Sources', icon: LinkIcon, content: data.sources, visible: (!!data.sources && data.sources.length > 0) || (!!data.groundingUrls && data.groundingUrls.length > 0) },
    { id: 'capabilities', label: 'Capabilities', icon: Zap, content: data.capabilities, visible: !!data.capabilities },
    { id: 'context', label: 'Context', icon: Info, content: data.context, visible: !!data.context },
    { id: 'purpose', label: 'Purpose', icon: Target, content: data.purpose, visible: !!data.purpose },
    { id: 'implications', label: 'Implications', icon: TrendingUp, content: data.implications, visible: !!data.implications && data.implications.length > 0 },
    { id: 'nuance', label: 'Nuance', icon: AlertCircle, content: data.nuance, visible: !!data.nuance },
    { id: 'begin', label: 'How to Begin', icon: BookOpen, content: data.entryPoints, visible: !!data.entryPoints && data.entryPoints.length > 0 },
    { id: 'nextSteps', label: 'Next Steps', icon: ArrowRight, content: data.nextSteps, visible: !!data.nextSteps && data.nextSteps.length > 0 },
    { id: 'evolution', label: 'Evolution', icon: Zap, content: data.userSpecificSolution, visible: !!data.userSpecificSolution },
    { id: 'chambers', label: 'Suggested Chambers', icon: Library, content: suggestedChambers, visible: !!suggestedChambers && suggestedChambers.length > 0 },
  ].filter(tab => tab.visible);

  const renderTabContent = (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return null;

    if (tab.id === 'truthFacing' && data.truthFacing) {
      const tf = data.truthFacing;
      return (
        <div className="space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <section className="space-y-4">
              <h4 className="text-xs font-bold text-teal uppercase tracking-widest flex items-center gap-2">
                <CheckCircle size={14} /> Directly Supported
              </h4>
              <ul className="space-y-2">
                {tf.directlySupported?.map((s, i) => (
                  <li key={i} className="text-sm text-ivory/80 flex items-start gap-2">
                    <span className="text-teal mt-1">•</span> {s}
                  </li>
                ))}
              </ul>
            </section>
            <section className="space-y-4">
              <h4 className="text-xs font-bold text-gold-500 uppercase tracking-widest flex items-center gap-2">
                <Brain size={14} /> Inferred
              </h4>
              <ul className="space-y-2">
                {tf.inferred?.map((s, i) => (
                  <li key={i} className="text-sm text-ivory/80 flex items-start gap-2">
                    <span className="text-gold-500 mt-1">•</span> {s}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <section className="space-y-4">
              <h4 className="text-xs font-bold text-stone uppercase tracking-widest flex items-center gap-2">
                <HelpCircle size={14} /> Uncertain
              </h4>
              <ul className="space-y-2">
                {tf.uncertain?.map((s, i) => (
                  <li key={i} className="text-sm text-stone flex items-start gap-2 italic">
                    <span className="text-stone mt-1">•</span> {s}
                  </li>
                ))}
              </ul>
            </section>
            <section className="space-y-4">
              <h4 className="text-xs font-bold text-oxblood uppercase tracking-widest flex items-center gap-2">
                <AlertTriangle size={14} /> Disputed
              </h4>
              <ul className="space-y-2">
                {tf.disputed?.map((s, i) => (
                  <li key={i} className="text-sm text-oxblood/80 flex items-start gap-2">
                    <span className="text-oxblood mt-1">•</span> {s}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="p-6 bg-gold-500/5 border border-gold-500/20 rounded-sm space-y-6">
            <h4 className="text-xs font-bold text-gold-500 uppercase tracking-widest flex items-center gap-2">
              <RefreshCw size={14} /> Corrigibility & Caution
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <span className="text-[10px] uppercase tracking-widest text-stone">What would change the conclusion?</span>
                <ul className="space-y-1">
                  {tf.whatWouldChangeConclusion?.map((s, i) => (
                    <li key={i} className="text-xs text-ivory/70">• {s}</li>
                  ))}
                </ul>
              </div>
              <div className="space-y-2">
                <span className="text-[10px] uppercase tracking-widest text-stone">User Caution</span>
                <ul className="space-y-1">
                  {tf.userCaution?.map((s, i) => (
                    <li key={i} className="text-xs text-oxblood/70">• {s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-teal/5 border border-teal/10 rounded-sm">
              <span className="text-[9px] uppercase tracking-widest text-teal/60 block mb-1">Strongest Point</span>
              <p className="text-sm text-ivory/90">{tf.strongestPoint}</p>
            </div>
            <div className="p-4 bg-oxblood/5 border border-oxblood/10 rounded-sm">
              <span className="text-[9px] uppercase tracking-widest text-oxblood/60 block mb-1">Weakest Point</span>
              <p className="text-sm text-ivory/90">{tf.weakestPoint}</p>
            </div>
          </div>
        </div>
      );
    }

    if (tab.id === 'evolution') {
      return (
        <div className="space-y-12">
          {/* Two-Level Intelligence */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4 p-6 bg-purple-500/5 border border-purple-500/20 rounded-sm">
              <h4 className="text-xs font-bold text-stone uppercase tracking-widest flex items-center gap-2">
                <Globe size={14} /> General Optimal Solution
              </h4>
              <p className="text-sm text-ivory/70 leading-relaxed italic">
                {data.generalOptimalSolution || "Standard optimal response for a generic context."}
              </p>
            </div>
            <div className="space-y-4 p-6 bg-gold-500/5 border border-gold-500/20 rounded-sm">
              <h4 className="text-xs font-bold text-gold-500 uppercase tracking-widest flex items-center gap-2">
                <Zap size={14} /> User-Specific Solution
              </h4>
              <p className="text-sm text-ivory/90 leading-relaxed font-medium">
                {data.userSpecificSolution}
              </p>
            </div>
          </div>

          {/* Probability-Ranked Forecasts */}
          {data.userForecasts && data.userForecasts.length > 0 && (
            <div className="space-y-6">
              <h4 className="text-xs font-bold text-gold-500 uppercase tracking-widest flex items-center gap-2">
                <TrendingUp size={14} /> Probability-Ranked Forecasts
              </h4>
              <div className="grid grid-cols-1 gap-4">
                {data.userForecasts?.map((f, i) => (
                  <div key={i} className="p-6 bg-purple-500/5 border border-purple-500/10 rounded-sm space-y-4 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4">
                      <span className="text-2xl font-serif text-gold-500/40">{(f.probability * 100).toFixed(0)}%</span>
                    </div>
                    <div className="space-y-2">
                      <h5 className="text-sm font-bold text-ivory">{f.action}</h5>
                      <p className="text-xs text-stone leading-relaxed">{f.reasoning}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {f.signals?.map((s, j) => (
                        <span key={j} className="text-[9px] px-2 py-0.5 bg-teal/10 text-teal rounded-full border border-teal/20">{s}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Systemic Mapping */}
          {data.systemicMapping && (
            <div className="space-y-6">
              <h4 className="text-xs font-bold text-gold-500 uppercase tracking-widest flex items-center gap-2">
                <GitBranch size={14} /> Systemic Mapping
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <span className="text-[10px] uppercase tracking-widest text-stone">Incentives & Inputs</span>
                  <ul className="space-y-1">
                    {data.systemicMapping.incentives?.map((s, i) => <li key={i} className="text-xs text-ivory/70">• {s}</li>)}
                  </ul>
                </div>
                <div className="space-y-3">
                  <span className="text-[10px] uppercase tracking-widest text-stone">Constraints & Tradeoffs</span>
                  <ul className="space-y-1">
                    {data.systemicMapping.tradeoffs?.map((s, i) => <li key={i} className="text-xs text-ivory/70">• {s}</li>)}
                  </ul>
                </div>
                <div className="space-y-3">
                  <span className="text-[10px] uppercase tracking-widest text-stone">Feedback Loops</span>
                  <ul className="space-y-1">
                    {data.systemicMapping.feedbackLoops?.map((s, i) => <li key={i} className="text-xs text-ivory/70">• {s}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Meta-Learning */}
          {data.metaLearning && (
            <div className="p-8 bg-gold-500/5 border border-gold-500/20 rounded-sm space-y-8">
              <h4 className="text-xs font-bold text-gold-500 uppercase tracking-widest flex items-center gap-2">
                <Brain size={14} /> Meta-Learning: Model Refinement
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <span className="text-[10px] uppercase tracking-widest text-stone">Revealed Patterns</span>
                  <ul className="space-y-2">
                    {data.metaLearning.revealedAboutUser?.map((s, i) => (
                      <li key={i} className="text-xs text-ivory/80 flex items-start gap-2">
                        <CheckCircle size={12} className="text-teal mt-0.5" /> {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-4">
                  <span className="text-[10px] uppercase tracking-widest text-stone">Model Updates</span>
                  <ul className="space-y-2">
                    {data.metaLearning.modelUpdates?.map((s, i) => (
                      <li key={i} className="text-xs text-ivory/80 flex items-start gap-2">
                        <RefreshCw size={12} className="text-gold-500 mt-0.5" /> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (tab.id === 'verification' && data.verification) {
      const v = data.verification;
      return (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gold-500/5 border border-gold-500/10 rounded-sm space-y-1">
              <span className="text-[9px] uppercase tracking-widest text-stone">Status</span>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  v.status === 'verified' ? "bg-green-500" : "bg-gold-500"
                )} />
                <span className="text-sm text-ivory font-medium capitalize">{v.status}</span>
              </div>
            </div>
            <div className="p-4 bg-gold-500/5 border border-gold-500/10 rounded-sm space-y-1">
              <span className="text-[9px] uppercase tracking-widest text-stone">Confidence</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-ivory font-medium">{(v.confidence * 100).toFixed(0)}%</span>
                <div className="flex-1 h-1 bg-purple-500/20 rounded-full overflow-hidden">
                  <div className="h-full bg-gold-500" style={{ width: `${v.confidence * 100}%` }} />
                </div>
              </div>
            </div>
            <div className="p-4 bg-gold-500/5 border border-gold-500/10 rounded-sm space-y-1">
              <span className="text-[9px] uppercase tracking-widest text-stone">Octuple-Check</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-ivory font-medium">{v.octupleCheckCount} / 8</span>
                <span className="text-[10px] text-stone italic">Sources Compared</span>
              </div>
            </div>
          </div>

          {v.unresolvedDisputes && v.unresolvedDisputes.length > 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-oxblood uppercase tracking-widest flex items-center gap-2">
                  <GitBranch size={14} /> Disagreement View
                </h4>
                <p className="text-[10px] text-stone uppercase tracking-widest">Major conflicting theories or evidence points</p>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {v.unresolvedDisputes?.map((d, i) => (
                  <div key={i} className="p-4 bg-oxblood/5 border border-oxblood/20 rounded-sm relative overflow-hidden group">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-oxblood/40 group-hover:bg-oxblood transition-colors" />
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={16} className="text-oxblood/60 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-ivory/90 leading-relaxed">
                        {d}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {v.assumptions && v.assumptions.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-gold-500 uppercase tracking-widest flex items-center gap-2">
                <Scale size={14} /> Underlying Assumptions
              </h4>
              <ul className="space-y-2">
                {v.assumptions?.map((a, i) => (
                  <li key={i} className="text-sm text-stone flex items-start gap-2">
                    <span className="text-gold-500 mt-1">•</span> {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }

    if (tab.id === 'sources') {
      return (
        <div className="space-y-8">
          {data.groundingUrls && data.groundingUrls.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-teal uppercase tracking-widest flex items-center gap-2">
                <LinkIcon size={14} /> Live Internet Sources (Grounding)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.groundingUrls?.map((url, i) => (
                  <a key={i} href={url.uri} target="_blank" rel="noopener noreferrer" 
                    onClick={() => onInteraction?.({
                      type: 'source_deep_dive',
                      value: 0.5,
                      timestamp: Date.now(),
                      context: { sourceTitle: url.title, sourceType: 'grounding' }
                    })}
                    className="p-4 bg-teal/5 border border-teal/10 rounded-sm flex items-center justify-between group hover:border-teal/30 transition-all">
                    <span className="text-sm text-ivory group-hover:text-teal transition-colors truncate max-w-[80%]">{url.title}</span>
                    <ExternalLink size={14} className="text-stone group-hover:text-teal transition-colors" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {data.sources && data.sources.length > 0 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-gold-500 uppercase tracking-widest flex items-center gap-2">
                  <Library size={14} /> Evidence Ladder
                </h4>
                <p className="text-[10px] text-stone uppercase tracking-widest">Sources ranked by epistemic strength</p>
              </div>
              <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-4 before:w-px before:bg-purple-500/20">
                {[...data.sources].sort((a, b) => {
                  const typeWeight = { 'primary': 4, 'real-time': 3, 'secondary': 2, 'tertiary': 1, 'media': 1, 'user-provided': 0 };
                  const weightA = (typeWeight[a.type] || 0) + a.authority;
                  const weightB = (typeWeight[b.type] || 0) + b.authority;
                  return weightB - weightA;
                }).map((source: SourceMetadata, i: number) => (
                  <div key={i} className="relative pl-12 group">
                    <div className={cn(
                      "absolute left-[13px] top-4 w-2 h-2 rounded-full border-2 border-obsidian",
                      source.type === 'primary' ? "bg-gold-500" : 
                      source.type === 'secondary' ? "bg-teal" : 
                      source.type === 'real-time' ? "bg-blue-400" : "bg-stone"
                    )} />
                    <div className="p-4 bg-purple-500/5 border border-purple-500/10 rounded-sm space-y-3 hover:border-gold-500/30 transition-all">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <span className={cn(
                            "text-[9px] uppercase tracking-widest",
                            source.type === 'primary' ? "text-gold-500" : 
                            source.type === 'secondary' ? "text-teal" : 
                            source.type === 'real-time' ? "text-blue-400" : "text-stone"
                          )}>{source.type} Source</span>
                          <h4 className="text-sm font-medium text-ivory group-hover:text-gold-500 transition-colors">{source.title}</h4>
                        </div>
                        {source.uri && (
                          <a href={source.uri} target="_blank" rel="noopener noreferrer" 
                            onClick={() => handleSourceClick(source)}
                            className="p-2 text-stone hover:text-gold-500 transition-colors">
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-[9px] uppercase tracking-widest text-stone">
                        <span className="flex items-center gap-1" title="Authority Score"><ShieldCheck size={10} /> {(source.authority * 100).toFixed(0)}%</span>
                        <span className="flex items-center gap-1" title="Reliability Score"><CheckCircle size={10} /> {(source.reliability * 100).toFixed(0)}%</span>
                        <span className="flex items-center gap-1" title="Freshness"><Clock size={10} /> {source.recency}</span>
                      </div>
                      {source.distortions && source.distortions.length > 0 && (
                        <div className="pt-2 border-t border-purple-500/10">
                          <span className="text-[8px] uppercase tracking-widest text-red-400/60 block mb-1">Potential Distortions</span>
                          <div className="flex flex-wrap gap-1">
                            {source.distortions?.map((d, j) => (
                              <span key={j} className="px-1.5 py-0.5 bg-red-500/5 border border-red-500/10 text-[8px] text-red-400/80 rounded-sm">
                                {d}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (tab.id === 'capabilities' && Array.isArray(tab.content)) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {tab.content?.map((cap: any, i: number) => (
            <div key={i} className="p-6 bg-purple-500/5 border border-purple-500/10 rounded-sm space-y-3">
              <h4 className="text-xs font-bold text-gold-500 uppercase tracking-widest">{cap.category}</h4>
              <ul className="space-y-2">
                {cap.items?.map((item: string, j: number) => (
                  <li key={j} className="text-xs text-stone flex items-start gap-2">
                    <span className="text-gold-500 mt-1">•</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      );
    }

    if (Array.isArray(tab.content)) {
      return (
        <ul className="space-y-4">
          {(tab.content as any[])?.map((item: any, i: number) => (
            <motion.li 
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-start gap-3 p-4 bg-purple-500/5 border border-purple-500/10 rounded-sm group hover:border-gold-500/20 transition-all"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2 shrink-0 group-hover:scale-125 transition-transform" />
              <p className="text-sm text-ivory/80 leading-relaxed">
                {typeof item === 'string' ? item : JSON.stringify(item)}
              </p>
            </motion.li>
          ))}
        </ul>
      );
    }

    if (tab.id === 'verification') {
      return renderTruthProfile();
    }

    if (tab.id === 'truthFacing') {
      return (
        <div className="space-y-4">
          <p className="text-sm text-ivory/80">{JSON.stringify(tab.content)}</p>
        </div>
      );
    }

    if (tab.id === 'answer' && showAnswerSpine) {
      return renderAnswerAugmentations();
    }

    return (
      <div className="prose prose-invert max-w-none space-y-6">
        {tab.id === 'answer' && (
          <div className="flex items-center gap-2 mb-4">
            <div
              className={cn(
                'px-2 py-0.5 rounded-[var(--radius-sm)] text-[10px] font-bold uppercase tracking-widest',
                settings.isCrisisMode ? 'bg-oxblood text-ivory' : 'bg-gold-500/20 text-gold-500'
              )}
            >
              Direct answer
            </div>
            <div className="h-px flex-1 bg-[color:var(--border-subtle)]" />
          </div>
        )}
        <p
          className={cn(
            'text-lg leading-relaxed text-ivory/90',
            tab.id === 'answer' ? 'font-serif text-xl' : 'font-sans italic opacity-80'
          )}
        >
          {typeof tab.content === 'string' ? tab.content : JSON.stringify(tab.content)}
        </p>
      </div>
    );
  };

  const renderTruthProfile = () => {
    const v = data.verification;
    if (!v) return null;
    return (
      <div className="p-6 bg-oxblood/5 border border-oxblood/20 rounded-sm space-y-6 mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-gold-500" size={18} />
            <h3 className="text-sm font-serif text-ivory tracking-tight">Epistemic Truth Profile</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-2 py-0.5 bg-gold-500/10 border border-gold-500/20 rounded-full">
              <span className="text-[9px] text-gold-500 uppercase tracking-widest font-bold">{v.status}</span>
            </div>
            {data.integrityLabel && (
              <div className="px-2 py-0.5 bg-teal/10 border border-teal/20 rounded-full">
                <span className="text-[9px] text-teal uppercase tracking-widest font-bold">{data.integrityLabel.replace(/-/g, ' ')}</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8">
          <div className="space-y-2">
            <span className="instrument-label text-stone">Confidence Score</span>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-serif text-ivory">{(v.confidence * 100).toFixed(0)}%</span>
              <span className="text-[10px] text-stone mb-1 uppercase tracking-widest">Certainty</span>
            </div>
          </div>
          <div className="space-y-2">
            <span className="instrument-label text-stone">Verification Depth</span>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-serif text-ivory">{v.octupleCheckCount}</span>
              <span className="text-[10px] text-stone mb-1 uppercase tracking-widest">/ 8 Checks</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <span className="instrument-label text-stone">Epistemic Status</span>
          <p className="text-xs text-ivory/80 italic leading-relaxed">
            This response is classified as <span className="text-gold-500 font-bold uppercase">{epistemicStatus || 'Inferred'}</span>. 
            {v.unresolvedDisputes && v.unresolvedDisputes.length > 0 ? 
              ` There are ${v.unresolvedDisputes.length} active tensions in the truth graph.` : 
              " The truth graph shows high systemic coherence."}
          </p>
        </div>

        {cognitiveSignatureImpact && (
          <div className="space-y-3 pt-4 border-t border-oxblood/10">
            <span className="instrument-label text-stone flex items-center gap-2">
              <Brain size={12} /> Why This Answer Structure?
            </span>
            <p className="text-xs text-ivory/70 leading-relaxed">
              {cognitiveSignatureImpact}
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderAnswerAugmentations = () => (
    <div className="space-y-6">
      {data.evidenceNote && data.evidenceNote.length > 0 && (
        <div className="p-4 bg-teal/5 border border-teal/20 rounded-[var(--radius-md)]">
          <h4 className="text-[10px] font-bold text-teal uppercase tracking-widest mb-2 flex items-center gap-2">
            <Info size={12} /> Evidence note
          </h4>
          <ul className="space-y-1">
            {data.evidenceNote.map((note, i) => (
              <li key={i} className="text-xs text-ivory/70">
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.uncertainty && data.uncertainty.length > 0 && (
        <div className="p-4 bg-oxblood/5 border border-oxblood/20 rounded-[var(--radius-md)]">
          <h4 className="text-[10px] font-bold text-oxblood uppercase tracking-widest mb-2 flex items-center gap-2">
            <AlertTriangle size={12} /> Uncertainty
          </h4>
          <ul className="space-y-1">
            {data.uncertainty.map((note, i) => (
              <li key={i} className="text-xs text-ivory/70">
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.claimHighlights && data.claimHighlights.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-[10px] font-bold text-gold-500 uppercase tracking-widest flex items-center gap-2">
            <ShieldCheck size={12} /> Claim highlights
          </h4>
          <div className="grid grid-cols-1 gap-2">
            {data.claimHighlights.map((highlight, i) => (
              <div
                key={i}
                className="p-3 bg-purple-500/5 border border-purple-500/10 rounded-[var(--radius-md)] flex items-start justify-between gap-4"
              >
                <span className="text-sm text-ivory/90">{highlight.claim}</span>
                <span className="text-[8px] uppercase tracking-widest text-stone px-2 py-1 bg-purple-500/10 rounded-full whitespace-nowrap">
                  {highlight.type.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderMainContent = () => {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {showAnswerSpine && (
          <section className="shrink-0 border-b border-[color:var(--border-subtle)] bg-[var(--atlas-surface-panel)]/40">
            <button
              type="button"
              onClick={() => setAnswerSpineOpen((o) => !o)}
              className="w-full flex items-center justify-between gap-3 px-4 md:px-8 py-3 text-left hover:bg-white/[0.02] transition-colors duration-[var(--atlas-motion-fast)]"
            >
              <div className="flex items-center gap-2 min-w-0">
                <MessageSquare size={14} className="text-gold/60 shrink-0" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-stone/60 font-semibold truncate">
                  Primary synthesis
                </span>
                <span className="text-[9px] text-stone/40 hidden sm:inline truncate">
                  — direct answer spine; depth layers below
                </span>
              </div>
              {answerSpineOpen ? <ChevronUp size={16} className="text-stone/50" /> : <ChevronDown size={16} className="text-stone/50" />}
            </button>
            {answerSpineOpen && (
              <div className="max-h-[min(42vh,400px)] overflow-y-auto custom-scrollbar px-4 md:px-8 pb-5 pt-0">
                <div className="max-w-4xl mx-auto prose prose-invert prose-sm prose-p:leading-relaxed prose-headings:text-ivory/90 prose-a:text-teal-300/90">
                  <ReactMarkdown>{data.answer as string}</ReactMarkdown>
                </div>
              </div>
            )}
          </section>
        )}

        <div className="flex border-b border-[color:var(--border-subtle)] overflow-x-auto no-scrollbar bg-obsidian/30">
          <AnimatePresence>
            {tabs.map((tab) => (
              <motion.button
                key={tab.id}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 md:px-5 py-3 text-[10px] uppercase tracking-[0.18em] font-semibold transition-colors border-b-2 whitespace-nowrap',
                  activeTab === tab.id
                    ? settings.isCrisisMode
                      ? 'text-oxblood border-oxblood bg-oxblood/[0.06]'
                      : 'text-gold-500 border-gold-500/80 bg-gold-500/[0.06]'
                    : 'text-stone border-transparent hover:text-ivory/90 hover:bg-white/[0.03]'
                )}
              >
                <tab.icon
                  size={14}
                  className={cn(
                    activeTab === tab.id
                      ? settings.isCrisisMode
                        ? 'text-oxblood'
                        : 'text-gold-500'
                      : 'text-stone/70'
                  )}
                />
                {tab.label}
              </motion.button>
            ))}
          </AnimatePresence>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-10 custom-scrollbar min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-4xl mx-auto space-y-6"
            >
              <div className="flex items-center gap-2 text-stone/45 pb-2 border-b border-[color:var(--border-subtle)]/60">
                <Layers size={14} />
                <span className="text-[10px] uppercase tracking-[0.2em]">Depth layer · {activeTab.replace(/-/g, ' ')}</span>
              </div>

              {activeTab === 'answer' && renderTruthProfile()}

              {renderTabContent(activeTab)}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-obsidian/50 backdrop-blur-md rounded-[var(--radius-lg)] border border-[color:var(--border-default)] overflow-hidden">
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {renderMainContent()}
      </div>

      {/* Footer / Context */}
      <div className="p-4 md:p-6 border-t border-[color:var(--border-subtle)] bg-obsidian/70 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 md:gap-8 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                data.verification?.status === 'verified'
                  ? 'bg-green-500'
                  : settings.isCrisisMode
                    ? 'bg-oxblood'
                    : 'bg-gold-500'
              )}
            />
            <span className="text-[9px] uppercase tracking-widest text-stone">
              Epistemic Integrity: <span className="text-ivory">{data.integrityLabel}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-widest text-stone">Depth Tier</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((t) => (
                <div 
                  key={t} 
                  className={cn(
                    "w-3 h-1 rounded-full",
                    t <= data.depthTier ? settings.isCrisisMode ? "bg-oxblood" : "bg-gold-500" : "bg-purple-500/20"
                  )} 
                />
              ))}
            </div>
          </div>
          {cognitiveSignatureImpact && (
            <div className="flex items-center gap-2 border-l border-[color:var(--border-subtle)] pl-0 sm:pl-8">
              <Brain size={12} className="text-gold-500/60" />
              <span className="text-[9px] uppercase tracking-widest text-stone">
                Signature Impact: <span className="text-ivory italic">{cognitiveSignatureImpact}</span>
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-[9px] uppercase tracking-widest text-stone italic hidden sm:flex">
          "Direct answer first, depth second."
        </div>
      </div>
    </div>
  );
});
