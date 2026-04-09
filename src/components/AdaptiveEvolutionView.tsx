import React, { useState } from 'react';
import { AppState, AdaptiveEvolutionModel, InferredTrait } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, Activity, Sliders, Shield, History, Target, Zap, Settings, ArrowRight, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

interface AdaptiveEvolutionViewProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function AdaptiveEvolutionView({ state, setState }: AdaptiveEvolutionViewProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'traits' | 'calibration' | 'log'>('overview');
  const evolution = state.adaptiveEvolution;

  const renderOverview = () => (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-obsidian/60 border border-titanium/20 p-6 rounded-sm">
          <div className="flex items-center gap-3 mb-4">
            <Brain className="text-blue-400" size={20} />
            <h3 className="text-sm font-medium text-ivory tracking-wide uppercase">Cognitive Fit</h3>
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs text-stone mb-1">
                <span>Structure Tolerance</span>
                <span>{Math.round(evolution.explicitSettings.structureTolerance * 100)}%</span>
              </div>
              <div className="h-1 bg-titanium/10 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500/50" style={{ width: `${evolution.explicitSettings.structureTolerance * 100}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-stone mb-1">
                <span>Explanation Depth</span>
                <span>Tier {evolution.explicitSettings.preferredExplanationDepth}</span>
              </div>
              <div className="h-1 bg-titanium/10 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500/50" style={{ width: `${(evolution.explicitSettings.preferredExplanationDepth / 5) * 100}%` }} />
              </div>
            </div>
            <div className="pt-2 border-t border-titanium/10">
              <p className="text-xs text-stone">
                <span className="text-ivory">Primary Mode:</span> {evolution.proactiveAssistance.mode}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-obsidian/60 border border-titanium/20 p-6 rounded-sm">
          <div className="flex items-center gap-3 mb-4">
            <Activity className="text-emerald-400" size={20} />
            <h3 className="text-sm font-medium text-ivory tracking-wide uppercase">Behavioral Stats</h3>
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs text-stone mb-1">
                <span>Workflow Completion</span>
                <span>{Math.round(evolution.behavioralStatistics.workflowCompletionRate * 100)}%</span>
              </div>
              <div className="h-1 bg-titanium/10 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500/50" style={{ width: `${evolution.behavioralStatistics.workflowCompletionRate * 100}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-stone mb-1">
                <span>Suggestion Acceptance</span>
                <span>{Math.round(evolution.behavioralStatistics.suggestionAcceptanceRate * 100)}%</span>
              </div>
              <div className="h-1 bg-titanium/10 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500/50" style={{ width: `${evolution.behavioralStatistics.suggestionAcceptanceRate * 100}%` }} />
              </div>
            </div>
            <div className="pt-2 border-t border-titanium/10">
              <p className="text-xs text-stone">
                <span className="text-ivory">Preferred Structure:</span> {evolution.workflowCalibration.preferredStructure}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-obsidian/60 border border-titanium/20 p-6 rounded-sm">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="text-amber-400" size={20} />
            <h3 className="text-sm font-medium text-ivory tracking-wide uppercase">Identity Anchors</h3>
          </div>
          {evolution.identityAnchors.length === 0 ? (
            <div className="text-xs text-stone italic py-4 text-center">
              No durable identity anchors established yet. Atlas is still observing.
            </div>
          ) : (
            <div className="space-y-3">
              {evolution.identityAnchors.map(anchor => (
                <div key={anchor.id} className="p-2 bg-titanium/5 rounded-sm border border-titanium/10">
                  <p className="text-xs text-ivory font-medium">{anchor.name}</p>
                  <p className="text-[10px] text-stone mt-1">{anchor.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-obsidian/60 border border-titanium/20 p-6 rounded-sm">
        <h3 className="text-sm font-medium text-ivory tracking-wide uppercase mb-4">Systemic Alignment Status</h3>
        <p className="text-sm text-stone leading-relaxed max-w-3xl">
          Atlas is currently operating in <span className="text-ivory font-medium">{evolution.proactiveAssistance.mode}</span> mode, 
          with a communication density set to <span className="text-ivory font-medium">{evolution.explicitSettings.preferredCommunicationDensity}</span>. 
          The system has detected {evolution.inferredTraits.length} emerging traits and has made {evolution.decisionsLog.length} adaptive decisions 
          to better fit your operational rhythm.
        </p>
      </div>
    </div>
  );

  const renderTraits = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ivory tracking-wide uppercase">Inferred Traits & Patterns</h3>
        <button className="text-xs text-stone hover:text-ivory transition-colors flex items-center gap-1">
          <Settings size={14} /> Configure Thresholds
        </button>
      </div>

      {evolution.inferredTraits.length === 0 ? (
        <div className="p-12 border border-dashed border-titanium/20 rounded-sm text-center">
          <Brain className="mx-auto text-titanium/40 mb-4" size={32} />
          <p className="text-sm text-stone">Atlas is gathering behavioral signals.</p>
          <p className="text-xs text-titanium/60 mt-2">Traits will appear here once confidence thresholds are met.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {evolution.inferredTraits.map(trait => (
            <div key={trait.id} className="bg-obsidian/60 border border-titanium/20 p-4 rounded-sm flex flex-col">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="text-sm font-medium text-ivory">{trait.traitName}</h4>
                  <p className="text-xs text-stone mt-1">Value: <span className="text-ivory">{String(trait.currentValue)}</span></p>
                </div>
                <div className={cn(
                  "px-2 py-1 rounded-sm text-[10px] font-mono uppercase tracking-wider",
                  trait.confidenceScore > 0.8 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                  trait.confidenceScore > 0.5 ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                  "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                )}>
                  {Math.round(trait.confidenceScore * 100)}% Conf
                </div>
              </div>
              
              <div className="mt-auto pt-3 border-t border-titanium/10 flex justify-between items-center text-xs text-stone">
                <span>{trait.evidenceCount} signals</span>
                <span className="capitalize">{trait.reversibilityTag.replace('-', ' ')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderCalibration = () => (
    <div className="space-y-8">
      <div className="bg-obsidian/60 border border-titanium/20 p-6 rounded-sm">
        <h3 className="text-sm font-medium text-ivory tracking-wide uppercase mb-6 flex items-center gap-2">
          <Sliders size={16} className="text-blue-400" />
          Communication Calibration
        </h3>
        
        <div className="space-y-6">
          {[
            { label: 'Verbosity', value: evolution.communicationCalibration.verbosity, left: 'Concise', right: 'Detailed' },
            { label: 'Precision', value: evolution.communicationCalibration.precision, left: 'Fluid', right: 'Exact' },
            { label: 'Warmth', value: evolution.communicationCalibration.warmth, left: 'Clinical', right: 'Empathetic' },
            { label: 'Challenge Intensity', value: evolution.communicationCalibration.challengeIntensity, left: 'Supportive', right: 'Adversarial' },
          ].map((slider, idx) => (
            <div key={idx}>
              <div className="flex justify-between text-xs text-stone mb-2">
                <span className="w-20 text-left">{slider.left}</span>
                <span className="text-ivory font-medium">{slider.label}</span>
                <span className="w-20 text-right">{slider.right}</span>
              </div>
              <div className="relative h-2 bg-titanium/10 rounded-full">
                <div 
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-400 rounded-full shadow-[0_0_10px_rgba(96,165,250,0.5)]"
                  style={{ left: `calc(${slider.value * 100}% - 6px)` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-obsidian/60 border border-titanium/20 p-6 rounded-sm">
        <h3 className="text-sm font-medium text-ivory tracking-wide uppercase mb-6 flex items-center gap-2">
          <Target size={16} className="text-emerald-400" />
          Proactive Assistance
        </h3>
        
        <div className="grid grid-cols-5 gap-2">
          {['passive', 'responsive', 'assistive', 'anticipatory', 'directive'].map((mode) => (
            <div 
              key={mode}
              className={cn(
                "p-3 rounded-sm border text-center transition-all",
                evolution.proactiveAssistance.mode === mode 
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                  : "bg-titanium/5 border-titanium/10 text-stone hover:bg-titanium/10"
              )}
            >
              <span className="text-xs uppercase tracking-wider block mb-1">{mode}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-stone mt-4 text-center">
          Atlas is currently tuned to intervene only when explicitly requested or when confidence in a helpful action is extremely high.
        </p>
      </div>
    </div>
  );

  const renderLog = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-medium text-ivory tracking-wide uppercase">Adaptive Decision Log</h3>
        <span className="text-xs text-stone font-mono">{evolution.decisionsLog.length} Records</span>
      </div>

      {evolution.decisionsLog.length === 0 ? (
        <div className="p-12 border border-dashed border-titanium/20 rounded-sm text-center">
          <History className="mx-auto text-titanium/40 mb-4" size={32} />
          <p className="text-sm text-stone">No adaptive decisions have been made yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {evolution.decisionsLog.map(log => (
            <div key={log.id} className="bg-obsidian/60 border border-titanium/20 p-4 rounded-sm">
              <div className="flex justify-between items-start mb-2">
                <h4 className="text-sm font-medium text-ivory">{log.whatChanged}</h4>
                <span className="text-[10px] text-stone font-mono">{new Date(log.timestamp).toLocaleDateString()}</span>
              </div>
              <p className="text-xs text-stone mb-3">{log.whyItChanged}</p>
              
              <div className="flex items-center gap-4 pt-3 border-t border-titanium/10">
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-titanium/60">
                  <Zap size={12} />
                  {log.confidenceThresholdMet} threshold
                </div>
                
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider">
                  {log.userValidation === 'validated' ? (
                    <span className="text-emerald-400 flex items-center gap-1"><CheckCircle size={12} /> Validated</span>
                  ) : log.userValidation === 'rejected' ? (
                    <span className="text-red-400 flex items-center gap-1"><XCircle size={12} /> Rejected</span>
                  ) : (
                    <span className="text-amber-400 flex items-center gap-1"><AlertTriangle size={12} /> Pending Validation</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-graphite text-ivory overflow-hidden">
      <div className="p-6 border-b border-titanium/10 bg-obsidian/40 flex-shrink-0">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <Brain className="text-blue-400" size={24} />
            <h1 className="text-2xl font-serif tracking-tight">Adaptive Evolution Layer</h1>
          </div>
          <p className="text-sm text-stone max-w-3xl">
            Atlas does not merely respond; it progressively learns, understands, and calibrates itself to your specific cognitive architecture. 
            This layer governs how the system transforms its structure, behavior, and workflows to achieve precision-fit alignment.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex gap-6 mb-8 border-b border-titanium/10">
            {[
              { id: 'overview', label: 'System Overview' },
              { id: 'traits', label: 'Inferred Traits' },
              { id: 'calibration', label: 'Calibration Engines' },
              { id: 'log', label: 'Decision Log' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "pb-3 text-sm font-medium tracking-wide transition-colors relative",
                  activeTab === tab.id ? "text-ivory" : "text-stone hover:text-titanium"
                )}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div 
                    layoutId="evolution-tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"
                  />
                )}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'overview' && renderOverview()}
              {activeTab === 'traits' && renderTraits()}
              {activeTab === 'calibration' && renderCalibration()}
              {activeTab === 'log' && renderLog()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
