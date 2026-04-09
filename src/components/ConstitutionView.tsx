import React from 'react';
import { AppState, PersonalConstitution, ConstitutionValue, ConstitutionStandard, ConstitutionGoal, ConstitutionTension } from '../types';
import { motion } from 'motion/react';
import { Shield, Target, Zap, Scale, Brain, Palette, Plus, Trash2, Save, History } from 'lucide-react';
import { cn } from '../lib/utils';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

interface ConstitutionViewProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function ConstitutionView({ state, setState }: ConstitutionViewProps) {
  const { constitution } = state;

  const saveConstitution = async (newConstitution: PersonalConstitution) => {
    setState(prev => ({ ...prev, constitution: newConstitution }));
    if (state.currentUser) {
      const userDocRef = doc(db, 'users', state.currentUser.uid);
      await updateDoc(userDocRef, { constitution: newConstitution });
    }
  };

  const addValue = () => {
    const newValue: ConstitutionValue = {
      id: Math.random().toString(36).substr(2, 9),
      title: 'New Value',
      description: 'Describe the principle...',
      priority: 5
    };
    saveConstitution({
      ...constitution,
      values: [...constitution.values, newValue],
      lastUpdated: new Date().toISOString()
    });
  };

  const removeValue = (id: string) => {
    saveConstitution({
      ...constitution,
      values: constitution.values.filter(v => v.id !== id),
      lastUpdated: new Date().toISOString()
    });
  };

  return (
    <div className="h-full flex flex-col bg-obsidian text-ivory overflow-hidden">
      <header className="p-8 border-b border-titanium/10 flex items-center justify-between bg-obsidian/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 border border-gold/40 flex items-center justify-center bg-gold/5">
            <Shield className="text-gold" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-serif tracking-tight">Personal Constitution</h1>
            <p className="text-[10px] text-stone uppercase tracking-widest opacity-60">Version {constitution.version} • Last Ratified: {new Date(constitution.lastUpdated).toLocaleDateString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 border border-titanium/20 text-[10px] uppercase tracking-widest text-stone hover:text-ivory hover:border-titanium/40 transition-all">
            <History size={14} /> Version History
          </button>
          <button className="flex items-center gap-2 px-6 py-2 bg-gold text-obsidian text-[10px] uppercase tracking-widest font-bold hover:bg-ivory transition-all">
            <Save size={14} /> Ratify Changes
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8 space-y-12 max-w-6xl mx-auto w-full">
        {/* Core Values Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="text-gold" size={20} />
              <h2 className="text-lg font-serif">Core Values & Non-Negotiables</h2>
            </div>
            <button onClick={addValue} className="p-2 hover:bg-gold/10 text-gold transition-all rounded">
              <Plus size={20} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {constitution.values.map((value) => (
              <motion.div 
                key={value.id}
                layout
                className="glass-panel p-6 border-titanium/20 hover:border-gold/30 transition-all group relative"
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-ivory font-medium">{value.title}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-gold bg-gold/10 px-2 py-1 rounded">P{value.priority}</span>
                    <button onClick={() => removeValue(value.id)} className="opacity-0 group-hover:opacity-100 p-1 text-oxblood hover:bg-oxblood/10 transition-all rounded">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-stone leading-relaxed">{value.description}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Standards & Thresholds */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <Zap className="text-gold" size={20} />
            <h2 className="text-lg font-serif">Standards & Thresholds</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {constitution.standards.map((standard) => (
              <div key={standard.id} className="p-6 bg-titanium/5 border border-titanium/10 rounded space-y-3">
                <div className="text-[10px] uppercase tracking-widest text-gold font-bold">{standard.domain}</div>
                <div className="text-sm font-medium text-ivory">{standard.threshold}</div>
                <p className="text-xs text-stone leading-relaxed">{standard.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Tensions & Balances */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <Scale className="text-gold" size={20} />
            <h2 className="text-lg font-serif">Tensions & Balances</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {constitution.tensions.map((tension) => (
              <div key={tension.id} className="space-y-4">
                <div className="flex justify-between text-[10px] uppercase tracking-widest font-bold">
                  <span className={cn(tension.currentBalance < 0.5 ? "text-gold" : "text-stone")}>{tension.poleA}</span>
                  <span className={cn(tension.currentBalance > 0.5 ? "text-gold" : "text-stone")}>{tension.poleB}</span>
                </div>
                <div className="h-1 bg-titanium/20 relative rounded-full">
                  <div 
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-gold rounded-full border-2 border-obsidian shadow-[0_0_10px_rgba(212,175,55,0.5)] transition-all"
                    style={{ left: `${tension.currentBalance * 100}%`, transform: 'translate(-50%, -50%)' }}
                  />
                </div>
                <p className="text-xs text-stone italic">{tension.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Reasoning & Aesthetics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <Brain className="text-gold" size={20} />
              <h2 className="text-lg font-serif">Reasoning Style</h2>
            </div>
            <div className="glass-panel p-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-stone uppercase tracking-widest">Primary Preference</span>
                <span className="text-sm text-ivory capitalize">{constitution.reasoningStyle.preference.replace('-', ' ')}</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] uppercase tracking-widest text-stone">
                  <span>Rigor Level</span>
                  <span>{Math.round(constitution.reasoningStyle.rigorLevel * 100)}%</span>
                </div>
                <div className="h-1 bg-titanium/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gold" style={{ width: `${constitution.reasoningStyle.rigorLevel * 100}%` }} />
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <Palette className="text-gold" size={20} />
              <h2 className="text-lg font-serif">Aesthetic Model</h2>
            </div>
            <div className="glass-panel p-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-stone uppercase tracking-widest">Visual Vibe</span>
                <span className="text-sm text-ivory capitalize">{constitution.aestheticModel.vibe}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-stone uppercase tracking-widest">Tonality</span>
                <span className="text-sm text-ivory capitalize">{constitution.aestheticModel.tonality}</span>
              </div>
              <div className="flex gap-2 pt-2">
                {constitution.aestheticModel.colorPreference.map((color, i) => (
                  <div key={i} className="w-6 h-6 rounded border border-titanium/20" style={{ backgroundColor: color }} />
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
