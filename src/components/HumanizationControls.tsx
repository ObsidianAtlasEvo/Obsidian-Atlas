import React from 'react';
import { AppState } from '../types';
import { motion } from 'motion/react';
import { Settings, Shield, User, Zap, Activity, Eye, RefreshCw, Trash2, Download } from 'lucide-react';

interface HumanizationControlsProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export const HumanizationControls: React.FC<HumanizationControlsProps> = ({ state, setState }) => {
  const { userModel } = state;

  return (
    <div className="p-12 space-y-12 max-w-6xl mx-auto">
      <div className="space-y-4">
        <div className="flex items-center gap-3 text-gold">
          <Settings size={24} />
          <h2 className="text-4xl font-serif text-ivory tracking-tight">Humanization Control Center</h2>
        </div>
        <p className="text-stone font-sans opacity-60 max-w-2xl leading-relaxed">
          Manage your cognitive fit. Inspect, adjust, or reset the adaptive systems that align Atlas to your mind.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {/* Module Controls */}
        <section className="space-y-8">
          <h3 className="instrument-label text-stone uppercase tracking-widest flex items-center gap-2">
            <Shield size={14} className="text-gold" />
            Adaptive Modules
          </h3>
          <div className="space-y-4">
            {[
              { id: 'user-modeling', label: 'User Modeling', description: 'Builds a private model of your cognitive style.' },
              { id: 'response-adaptation', label: 'Response Adaptation', description: 'Shapes answers to fit your preferred depth.' },
              { id: 'tone-calibration', label: 'Tone Calibration', description: 'Calibrates Atlas\'s voice to your resonance.' },
              { id: 'ui-adaptation', label: 'UI Adaptation', description: 'Adapts the interface to your behavior.' },
              { id: 'cadence-matching', label: 'Cadence Matching', description: 'Aligns interaction timing to your tempo.' },
              { id: 'challenge-counterbalance', label: 'Challenge & Counterbalance', description: 'Decides when to mirror or challenge you.' },
              { id: 'absolute-signal', label: 'Absolute Signal Mode', description: 'Aggressive removal of noise. Maximum signal purity.' },
            ].map(module => (
              <div key={module.id} className="glass-panel p-6 border-titanium/20 flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="text-ivory font-medium">{module.label}</h4>
                  <p className="text-xs text-stone opacity-60">{module.description}</p>
                </div>
                <div 
                  className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${module.id === 'absolute-signal' && state.absoluteSignalMode ? 'bg-gold/20' : 'bg-titanium/20'}`}
                  onClick={() => {
                    if (module.id === 'absolute-signal') {
                      setState(prev => ({ ...prev, absoluteSignalMode: !prev.absoluteSignalMode }));
                    }
                  }}
                >
                  <div className={`w-4 h-4 rounded-full transition-transform ${module.id === 'absolute-signal' && state.absoluteSignalMode ? 'translate-x-6 bg-gold' : 'translate-x-0 bg-stone'}`} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Preference Inspection */}
        <section className="space-y-8">
          <h3 className="instrument-label text-stone uppercase tracking-widest flex items-center gap-2">
            <User size={14} className="text-teal" />
            Cognitive Fit Profile
          </h3>
          <div className="glass-panel p-8 border-titanium/20 space-y-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] uppercase tracking-widest text-stone">
                  <span>Abstraction Preference</span>
                  <span className="text-ivory">{(userModel.cognitiveStyle.abstractionPreference * 100).toFixed(0)}%</span>
                </div>
                <div className="h-1 bg-titanium/20 rounded-full overflow-hidden">
                  <div className="h-full bg-ivory w-[70%]" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] uppercase tracking-widest text-stone">
                  <span>Appetite for Rigor</span>
                  <span className="text-ivory">{(userModel.challenge.appetiteForNuance * 100).toFixed(0)}%</span>
                </div>
                <div className="h-1 bg-titanium/20 rounded-full overflow-hidden">
                  <div className="h-full bg-ivory w-[90%]" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] uppercase tracking-widest text-stone">
                  <span>Synthesis Velocity</span>
                  <span className="text-ivory">{(userModel.thoughtStructure.synthesisVelocity * 100).toFixed(0)}%</span>
                </div>
                <div className="h-1 bg-titanium/20 rounded-full overflow-hidden">
                  <div className="h-full bg-ivory w-[54%]" />
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-titanium/20 space-y-4">
              <h4 className="text-xs uppercase tracking-widest text-stone">Recurring Themes</h4>
              <div className="flex flex-wrap gap-2">
                {userModel.identity.recurringThemes.map(theme => (
                  <span key={theme} className="text-[10px] px-2 py-1 bg-gold/10 text-gold rounded border border-gold/20">#{theme}</span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Sovereignty Actions */}
      <section className="space-y-8">
        <h3 className="instrument-label text-stone uppercase tracking-widest flex items-center gap-2">
          <Shield size={14} className="text-oxblood" />
          Data & Memory Sovereignty
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <button className="glass-panel p-6 border-titanium/20 hover:border-gold/30 transition-all flex items-center gap-4 group">
            <div className="p-3 rounded bg-gold/10 text-gold group-hover:bg-gold group-hover:text-obsidian transition-all">
              <Download size={20} />
            </div>
            <div className="text-left">
              <h4 className="text-sm font-medium text-ivory">Export Model</h4>
              <p className="text-[10px] text-stone opacity-60">Download your cognitive profile.</p>
            </div>
          </button>
          <button className="glass-panel p-6 border-titanium/20 hover:border-teal/30 transition-all flex items-center gap-4 group">
            <div className="p-3 rounded bg-teal/10 text-teal group-hover:bg-teal group-hover:text-obsidian transition-all">
              <RefreshCw size={20} />
            </div>
            <div className="text-left">
              <h4 className="text-sm font-medium text-ivory">Reset Adaptation</h4>
              <p className="text-[10px] text-stone opacity-60">Restore Atlas to baseline fit.</p>
            </div>
          </button>
          <button className="glass-panel p-6 border-titanium/20 hover:border-oxblood/30 transition-all flex items-center gap-4 group">
            <div className="p-3 rounded bg-oxblood/10 text-oxblood group-hover:bg-oxblood group-hover:text-obsidian transition-all">
              <Trash2 size={20} />
            </div>
            <div className="text-left">
              <h4 className="text-sm font-medium text-ivory">Delete All Memory</h4>
              <p className="text-[10px] text-stone opacity-60">Permanent removal of all continuity.</p>
            </div>
          </button>
        </div>
      </section>
    </div>
  );
};
