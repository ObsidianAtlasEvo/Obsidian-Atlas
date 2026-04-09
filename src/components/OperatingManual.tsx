import React from 'react';
import { motion } from 'motion/react';
import { BookOpen, Brain, AlertTriangle, Shield, Target, Zap, Sliders, Info, CheckCircle2 } from 'lucide-react';
import { AppState } from '../types';

interface OperatingManualProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function OperatingManual({ state, setState }: OperatingManualProps) {
  const { operatingManual } = state;

  const sections = [
    { title: 'How I Think Best', items: operatingManual.thinkingPatterns, icon: Brain },
    { title: 'How I Fail', items: operatingManual.failureModes, icon: AlertTriangle },
    { title: 'Judgment Distortions', items: operatingManual.judgmentDistortions, icon: Shield },
    { title: 'Clarity Drivers', items: operatingManual.clarityDrivers, icon: Zap },
    { title: 'Standards I Live By', items: operatingManual.standards, icon: Target },
    { title: 'Learning Methods', items: operatingManual.learningMethods, icon: BookOpen },
    { title: 'Decision Rules', items: operatingManual.decisionRules, icon: Sliders },
    { title: 'Pressure Reminders', items: operatingManual.pressureReminders, icon: Info },
    { title: 'Flourishing Environments', items: operatingManual.flourishingEnvironments, icon: CheckCircle2 },
    { title: 'Blind Spots', items: operatingManual.blindSpots, icon: AlertTriangle },
  ];

  return (
    <div className="p-12 space-y-12 max-w-6xl mx-auto h-full overflow-y-auto custom-scrollbar">
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gold/10 rounded-sm border border-gold/20">
            <BookOpen className="w-8 h-8 text-gold" />
          </div>
          <div>
            <h2 className="text-4xl font-serif text-ivory tracking-tight">Personal Operating Manual</h2>
            <p className="text-stone font-sans opacity-60 tracking-widest uppercase text-[10px]">
              A Refined Record of Self-Knowledge and Cognitive Function
            </p>
          </div>
        </div>
        <p className="text-stone font-sans opacity-80 max-w-3xl leading-relaxed">
          This manual is a living document, built over time by Atlas to help you understand your own thinking, 
          failures, distortions, and drivers. It is your most valuable output.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {sections.map((section, index) => {
          const Icon = section.icon;
          return (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="glass-panel p-8 border-gold/10 relative group hover:border-gold/30 transition-all space-y-6"
            >
              <div className="flex items-center gap-3 text-gold">
                <Icon className="w-5 h-5" />
                <h3 className="instrument-label uppercase tracking-widest text-xs">{section.title}</h3>
              </div>
              <ul className="space-y-3">
                {section.items.map((item, i) => (
                  <li key={i} className="text-sm text-ivory opacity-70 flex items-start gap-3">
                    <span className="text-gold mt-1">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          );
        })}
      </div>

      <div className="p-8 bg-titanium/5 border border-titanium/20 rounded-sm space-y-4">
        <div className="flex items-center gap-3 text-stone">
          <Info className="w-5 h-5" />
          <h4 className="instrument-label uppercase tracking-widest text-xs">Manual Evolution</h4>
        </div>
        <p className="text-xs text-stone opacity-60 leading-relaxed">
          This manual is updated based on your decisions, journals, and crucible sessions. 
          It represents the system's current best model of your cognitive architecture.
        </p>
      </div>
    </div>
  );
}
