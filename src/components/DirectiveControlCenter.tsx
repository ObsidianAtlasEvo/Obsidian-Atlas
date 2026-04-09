// Atlas-Audit: [EXEC-GOV] Verified — Surfaces constitution alignment hint while drafting directives (Command ↔ Doctrine linkage).
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  CheckCircle2, 
  AlertCircle, 
  XCircle, 
  Clock, 
  Trash2, 
  Plus, 
  ChevronRight, 
  Shield, 
  Info,
  Layers,
  Activity,
  Target,
  Settings
} from 'lucide-react';
import { AppState, Directive, DirectiveOutcome, DirectiveScope, ComputePosture, UIPosture } from '../types';
import { cn } from '../lib/utils';
import { validateDirective, applyDirectivesToPosture, constitutionAlignmentHint } from '../lib/directiveProcessor';
import { atlasCache } from '../services/ollamaService';

interface DirectiveControlCenterProps {
  state: AppState;
  onUpdateState: (updates: Partial<AppState>) => void;
}

export function DirectiveControlCenter({ state, onUpdateState }: DirectiveControlCenterProps) {
  const [inputText, setInputText] = useState('');
  const constitutionHint = useMemo(
    () => constitutionAlignmentHint(state.constitution, inputText),
    [state.constitution, inputText]
  );
  const [selectedScope, setSelectedScope] = useState<DirectiveScope>('persistent');
  const [activeTab, setActiveTab] = useState<'directives' | 'geometry'>('directives');
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePostureChange = (type: 'compute' | 'ui', value: string) => {
    onUpdateState({
      cognitiveLoad: {
        ...state.cognitiveLoad,
        [type === 'compute' ? 'computePosture' : 'uiPosture']: value
      }
    });
  };

  const handleAddDirective = () => {
    if (!inputText.trim()) return;
    setIsProcessing(true);

    setTimeout(() => {
      const validation = validateDirective(inputText);
      const newDirective: Directive = {
        id: Math.random().toString(36).substring(7),
        text: inputText,
        type: validation.types,
        outcome: validation.outcome,
        explanation: validation.explanation,
        scope: selectedScope,
        timestamp: new Date().toISOString(),
        isActive: validation.outcome !== 'rejected',
      };

      const updatedDirectives = [newDirective, ...state.directives];
      const updatedPosture = applyDirectivesToPosture(updatedDirectives, state.activePosture);

      onUpdateState({ 
        directives: updatedDirectives,
        activePosture: updatedPosture
      });
      
      atlasCache.invalidateAll(); // Event-Driven Re-Indexing
      
      setInputText('');
      setIsProcessing(false);
    }, 800);
  };

  const toggleDirective = (id: string) => {
    const updatedDirectives = state.directives.map(d => 
      d.id === id ? { ...d, isActive: !d.isActive } : d
    );
    const updatedPosture = applyDirectivesToPosture(updatedDirectives, state.activePosture);
    onUpdateState({ 
      directives: updatedDirectives,
      activePosture: updatedPosture
    });
    atlasCache.invalidateAll();
  };

  const deleteDirective = (id: string) => {
    const updatedDirectives = state.directives.filter(d => d.id !== id);
    const updatedPosture = applyDirectivesToPosture(updatedDirectives, state.activePosture);
    onUpdateState({ 
      directives: updatedDirectives,
      activePosture: updatedPosture
    });
    atlasCache.invalidateAll();
  };

  const getOutcomeIcon = (outcome: DirectiveOutcome) => {
    switch (outcome) {
      case 'fully-accepted': return <CheckCircle2 className="text-teal" size={14} />;
      case 'accepted-with-bounds': return <AlertCircle className="text-gold" size={14} />;
      case 'context-limited': return <Layers className="text-gold" size={14} />;
      case 'rejected': return <XCircle className="text-oxblood" size={14} />;
    }
  };

  const getOutcomeLabel = (outcome: DirectiveOutcome) => {
    switch (outcome) {
      case 'fully-accepted': return 'Fully Accepted';
      case 'accepted-with-bounds': return 'Accepted with Bounds';
      case 'context-limited': return 'Context-Limited';
      case 'rejected': return 'Rejected';
    }
  };

  return (
    <div className="p-6 md:p-12 space-y-8 md:space-y-12 max-w-6xl mx-auto pb-32">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-8">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Settings size={32} className="text-gold shrink-0" />
            <h2 className="text-3xl md:text-4xl font-serif text-ivory tracking-tight">Command & Control Surface</h2>
          </div>
          <p className="text-sm text-stone font-sans opacity-60 max-w-2xl leading-relaxed">
            Shape Atlas's behavior, set explicit directives, and tune the Cognitive Load Geometry for optimal performance and clarity.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-titanium/10 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab('directives')}
            className={cn(
              "px-4 py-2 text-xs font-mono uppercase tracking-widest rounded transition-all",
              activeTab === 'directives' ? "bg-gold/10 text-gold border border-gold/20" : "text-stone hover:text-ivory"
            )}
          >
            Directives
          </button>
          <button
            onClick={() => setActiveTab('geometry')}
            className={cn(
              "px-4 py-2 text-xs font-mono uppercase tracking-widest rounded transition-all",
              activeTab === 'geometry' ? "bg-gold/10 text-gold border border-gold/20" : "text-stone hover:text-ivory"
            )}
          >
            Load Geometry
          </button>
        </div>
      </div>

      {activeTab === 'directives' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Left: Directive Input */}
        <div className="lg:col-span-2 space-y-8">
          <div className="glass-panel p-8 space-y-6 border-gold/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4">
              <Shield size={16} className="text-gold/20" />
            </div>
            <h3 className="instrument-label text-gold uppercase tracking-widest">Issue New Directive</h3>
            <div className="space-y-4">
              <textarea 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="e.g., 'Be more direct with me', 'Challenge me harder in the Argument Chamber', 'Simplify your language'..."
                className="w-full h-32 bg-titanium/5 border border-titanium/20 rounded-sm p-4 text-ivory font-sans focus:border-gold/40 focus:outline-none transition-all resize-none"
              />
              {constitutionHint && (
                <p className="text-[11px] text-gold/90 border border-gold/20 bg-gold/5 rounded-sm px-3 py-2 leading-relaxed">
                  {constitutionHint}
                </p>
              )}
              <div className="flex flex-wrap gap-4 items-center justify-between">
                <div className="flex gap-2">
                  {(['once', 'session', 'persistent', 'default'] as DirectiveScope[]).map(scope => (
                    <button
                      key={scope}
                      onClick={() => setSelectedScope(scope)}
                      className={cn(
                        "px-3 py-1 text-[10px] uppercase tracking-widest border rounded-full transition-all",
                        selectedScope === scope 
                          ? "bg-gold/10 border-gold/40 text-gold" 
                          : "border-titanium/20 text-stone hover:border-titanium/40"
                      )}
                    >
                      {scope}
                    </button>
                  ))}
                </div>
                <button 
                  onClick={handleAddDirective}
                  disabled={isProcessing || !inputText.trim()}
                  className={cn(
                    "px-8 py-3 bg-gold text-obsidian font-bold uppercase tracking-widest text-[10px] hover:bg-ivory transition-all flex items-center gap-2",
                    (isProcessing || !inputText.trim()) && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isProcessing ? <Activity size={14} className="animate-spin" /> : <Plus size={14} />}
                  Execute Directive
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="instrument-label text-stone uppercase tracking-widest">Directive History</h3>
            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {state.directives.length === 0 ? (
                  <div className="p-12 border border-dashed border-titanium/20 rounded-lg text-center">
                    <p className="text-stone opacity-40 text-sm italic">No active directives. Atlas is operating in standard posture.</p>
                  </div>
                ) : (
                  state.directives.map(directive => (
                    <motion.div 
                      key={directive.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className={cn(
                        "glass-panel p-6 border transition-all group",
                        directive.isActive ? "border-gold/20" : "border-titanium/10 opacity-60"
                      )}
                    >
                      <div className="flex justify-between items-start gap-4">
                        <div className="space-y-3 flex-1">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "px-2 py-0.5 text-[8px] uppercase tracking-widest rounded-full border",
                              directive.outcome === 'rejected' ? "bg-oxblood/10 border-oxblood/30 text-oxblood" : "bg-gold/10 border-gold/30 text-gold"
                            )}>
                              {directive.scope}
                            </div>
                            <span className="text-[10px] text-stone opacity-40">
                              {new Date(directive.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-ivory font-serif text-lg">"{directive.text}"</p>
                          <div className="flex items-center gap-2 py-2 px-3 bg-titanium/5 rounded border border-titanium/10">
                            {getOutcomeIcon(directive.outcome)}
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-widest",
                              directive.outcome === 'rejected' ? "text-oxblood" : "text-gold"
                            )}>
                              {getOutcomeLabel(directive.outcome)}
                            </span>
                            <div className="h-3 w-px bg-titanium/20 mx-2" />
                            <p className="text-[10px] text-stone leading-relaxed">{directive.explanation}</p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          {directive.outcome !== 'rejected' && (
                            <button 
                              onClick={() => toggleDirective(directive.id)}
                              className={cn(
                                "p-2 rounded border transition-all",
                                directive.isActive ? "bg-gold/10 border-gold/40 text-gold" : "bg-titanium/5 border-titanium/20 text-stone"
                              )}
                            >
                              <Settings size={14} />
                            </button>
                          )}
                          <button 
                            onClick={() => deleteDirective(directive.id)}
                            className="p-2 bg-oxblood/5 border border-oxblood/20 text-oxblood/60 hover:text-oxblood transition-all rounded"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Right: Active Posture & Stats */}
        <div className="space-y-8">
          <div className="glass-panel p-8 space-y-8 border-gold/20 bg-gold/5">
            <h3 className="instrument-label text-gold uppercase tracking-widest">Active Posture</h3>
            <div className="space-y-6">
              {[
                { label: 'Tone', value: state.activePosture.tone, icon: Activity },
                { label: 'Language Level', value: state.activePosture.languageLevel, icon: Layers },
                { label: 'UI Density', value: state.activePosture.uiDensity, icon: Target },
                { label: 'Directness', value: `${(state.activePosture.directness * 100).toFixed(0)}%`, icon: ChevronRight },
                { label: 'Challenge', value: `${(state.activePosture.challenge * 100).toFixed(0)}%`, icon: Zap },
              ].map(stat => (
                <div key={stat.label} className="flex justify-between items-center border-b border-titanium/10 pb-2">
                  <div className="flex items-center gap-2 text-stone">
                    <stat.icon size={12} />
                    <span className="text-[10px] uppercase tracking-widest">{stat.label}</span>
                  </div>
                  <span className="text-xs text-ivory font-mono uppercase">{stat.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 border border-titanium/20 rounded-lg space-y-4">
            <h3 className="instrument-label text-stone uppercase tracking-widest">System Constraints</h3>
            <div className="space-y-2">
              {[
                "Truth-Seeking Primacy",
                "Epistemic Integrity",
                "Privacy Sovereignty",
                "Anti-Manipulation Protocol",
                "Non-Negotiable Safety"
              ].map(law => (
                <div key={law} className="flex items-center gap-3 text-[10px] text-stone/60">
                  <CheckCircle2 size={10} className="text-teal/40" />
                  <span>{law}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel p-6 border-gold/20 space-y-4">
            <div className="flex items-center gap-2 text-gold">
              <Info size={14} />
              <h4 className="text-[10px] uppercase tracking-widest font-bold">Evolution Note</h4>
            </div>
            <p className="text-[10px] text-stone leading-relaxed">
              Directives are integrated into your user model over time. Repeated requests for specific postures (e.g., "be more direct") will eventually become the system default.
            </p>
          </div>
        </div>
      </div>
      ) : (
        <div className="space-y-8">
          <div className="bg-titanium/5 border border-titanium/20 p-6 rounded-lg">
            <h2 className="text-lg font-serif text-ivory mb-4 flex items-center gap-2">
              <Activity className="text-gold" size={18} />
              Cognitive Load Geometry
            </h2>
            <p className="text-sm text-stone mb-6">
              Atlas dynamically allocates compute, retrieval depth, and interface complexity based on the shape of the demand. You can manually override the current posture here.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="text-xs font-mono uppercase tracking-widest text-stone/60">Compute Posture</h3>
                {(['minimal', 'standard', 'deep-retrieval', 'leviathan-class'] as ComputePosture[]).map(posture => (
                  <button
                    key={posture}
                    onClick={() => handlePostureChange('compute', posture)}
                    className={cn(
                      "w-full text-left p-4 rounded border transition-all flex items-center justify-between",
                      state.cognitiveLoad.computePosture === posture
                        ? "bg-gold/5 border-gold/30 text-ivory"
                        : "bg-titanium/5 border-titanium/20 text-stone hover:border-titanium/40"
                    )}
                  >
                    <span className="font-mono text-sm capitalize">{posture.replace('-', ' ')}</span>
                    {state.cognitiveLoad.computePosture === posture && <CheckCircle2 size={16} className="text-gold" />}
                  </button>
                ))}
              </div>
              
              <div className="space-y-4">
                <h3 className="text-xs font-mono uppercase tracking-widest text-stone/60">UI Posture</h3>
                {(['essential', 'focused', 'expansive', 'cartographic'] as UIPosture[]).map(posture => (
                  <button
                    key={posture}
                    onClick={() => handlePostureChange('ui', posture)}
                    className={cn(
                      "w-full text-left p-4 rounded border transition-all flex items-center justify-between",
                      state.cognitiveLoad.uiPosture === posture
                        ? "bg-gold/5 border-gold/30 text-ivory"
                        : "bg-titanium/5 border-titanium/20 text-stone hover:border-titanium/40"
                    )}
                  >
                    <span className="font-mono text-sm capitalize">{posture}</span>
                    {state.cognitiveLoad.uiPosture === posture && <CheckCircle2 size={16} className="text-gold" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          <div className="bg-titanium/5 border border-titanium/20 p-6 rounded-lg">
            <h2 className="text-lg font-serif text-ivory mb-4 flex items-center gap-2">
              <Layers className="text-gold" size={18} />
              System State
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-obsidian border border-titanium/10 rounded">
                <div className="text-xs font-mono uppercase tracking-widest text-stone/60 mb-1">Active Tier</div>
                <div className="text-lg font-serif text-ivory">Tier {state.cognitiveLoad.activeTier}</div>
              </div>
              <div className="p-4 bg-obsidian border border-titanium/10 rounded">
                <div className="text-xs font-mono uppercase tracking-widest text-stone/60 mb-1">Latent Context</div>
                <div className="text-lg font-serif text-ivory">{state.cognitiveLoad.latentContextLoaded ? 'Loaded' : 'Deferred'}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
