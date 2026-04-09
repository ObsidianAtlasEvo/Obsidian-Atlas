// Atlas-Audit: [EXEC-COUNCIL] Verified — Adversarial / strategic panels derive from live workspace (directives, pulse, journal, decisions, constitution); empty paths state honest gaps instead of symbolic filler.
import React, { useMemo, useState } from 'react';
import { Shield, Zap, Scale, Compass, ScrollText, ShieldAlert, Eye, Target, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { AppState, CouncilLens, Directive, PulseItem, JournalEntry, Decision } from '../types';

interface InnerCouncilProps {
  state: AppState;
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function primaryDirective(state: AppState): Directive | null {
  const active = state.directives.filter((d) => d.isActive);
  const pool = active.length ? active : state.directives;
  if (!pool.length) return null;
  return [...pool].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
}

function topPulseItem(state: AppState): PulseItem | null {
  const items = state.pulse?.items ?? [];
  if (!items.length) return null;
  return [...items].sort((a, b) => b.priority - a.priority || new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
}

function latestJournal(state: AppState): JournalEntry | null {
  const j = state.journal ?? [];
  if (!j.length) return null;
  return [...j].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
}

function focalDecision(state: AppState): Decision | null {
  const pending = state.decisions.filter((d) => d.status === 'pending');
  const pool = pending.length ? pending : state.decisions;
  if (!pool.length) return null;
  return pool[0];
}

function constitutionAnchor(state: AppState): { title: string; line: string } | null {
  const v = state.constitution?.values?.[0];
  if (!v) return null;
  return { title: v.title, line: truncate(v.description, 160) };
}

type PressureTag = 'Hypothesis' | 'Inference' | 'Fact';

function buildLensPressure(lens: CouncilLens, state: AppState): {
  adversarial: { tag: PressureTag; text: string }[];
  strategic: { tag: PressureTag; text: string }[];
} {
  const dir = primaryDirective(state);
  const pulse = topPulseItem(state);
  const journal = latestJournal(state);
  const decision = focalDecision(state);
  const canon = constitutionAnchor(state);

  const hypothesis = dir
    ? `${lens.name} treats your active directive as a falsifiable claim: “${truncate(dir.text, 140)}”. What evidence would overturn it?`
    : `${lens.name} has no directive to stress-test. Activate or create a directive in Directive Center so pressure attaches to something you govern.`;

  const inference = pulse
    ? `${lens.name} reads Pulse (${pulse.type}): “${truncate(pulse.content, 160)}”. Does this reinforce or undermine the stance implied by your directives?`
    : journal
      ? `${lens.name} reads your latest journal “${truncate(journal.title, 80)}”: ${truncate(journal.content, 140)}`
      : `${lens.name} finds no pulse line or journal entry—capture a signal in Pulse or Journal so inference is tied to your trail, not a generic scenario.`;

  const strategicA = decision
    ? `${lens.name} pressures decision “${truncate(decision.title, 100)}” (${decision.status}). ${truncate(lens.perspective, 200)}`
    : `${lens.name} has no open decision dossier. Record a decision in Decisions to give this lens structural leverage beyond rhetoric.`;

  const strategicB = canon
    ? `Constitution anchor “${canon.title}”: ${lens.name} checks recent moves against “${canon.line}”.`
    : `Constitution layer is empty or unavailable—define values in Constitution so strategic leverage cites your declared non‑negotiables.`;

  return {
    adversarial: [
      { tag: 'Hypothesis', text: hypothesis },
      { tag: 'Inference', text: inference },
    ],
    strategic: [
      { tag: 'Inference', text: strategicA },
      { tag: 'Fact', text: strategicB },
    ],
  };
}

export function InnerCouncil({ state }: InnerCouncilProps) {
  const [selectedLens, setSelectedLens] = useState<CouncilLens | null>(null);

  const pressure = useMemo(
    () => (selectedLens ? buildLensPressure(selectedLens, state) : null),
    [selectedLens, state],
  );

  return (
    <div className="p-12 space-y-12 max-w-6xl mx-auto">
      <header className="space-y-4">
        <div className="flex items-center gap-3 text-gold">
          <Shield size={24} />
          <h2 className="text-4xl font-serif text-ivory tracking-tight">The Inner Council</h2>
        </div>
        <p className="text-stone font-sans opacity-60 max-w-2xl leading-relaxed">
          Pressure-testing reality through multiple refined interpretive modes. Not more answers, but multiple refined angles on the same problem.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
        {state.council.map((lens, index) => (
          <motion.button
            key={lens.id}
            onClick={() => setSelectedLens(lens)}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
            className={`glass-panel p-6 space-y-4 border-gold/10 group hover:border-gold/30 transition-all text-left ${selectedLens?.id === lens.id ? 'border-gold/50 bg-gold/5' : ''}`}
          >
            <div className="text-gold group-hover:scale-110 transition-transform">
              {lens.icon === 'strategist' && <Zap size={20} />}
              {lens.icon === 'skeptic' && <ShieldAlert size={20} />}
              {lens.icon === 'historian' && <RefreshCw size={20} />}
              {lens.icon === 'ethicist' && <Scale size={20} />}
              {lens.icon === 'engineer' && <Target size={20} />}
              {lens.icon === 'litigator' && <Shield size={20} />}
              {lens.icon === 'editor' && <ScrollText size={20} />}
              {lens.icon === 'critic' && <Eye size={20} />}
              {lens.icon === 'adversary' && <ShieldAlert size={20} />}
              {lens.icon === 'future' && <Compass size={20} />}
            </div>
            <div className="space-y-1">
              <h4 className="instrument-label text-ivory uppercase tracking-widest">{lens.name}</h4>
              <p className="text-[10px] text-stone opacity-60 leading-tight">{lens.description}</p>
            </div>
          </motion.button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {selectedLens && (
          <motion.div
            key={selectedLens.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="glass-panel p-10 border-gold/20 bg-gold/5 space-y-8"
          >
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <h3 className="text-2xl font-serif text-ivory italic">Perspective: {selectedLens.name}</h3>
                <p className="text-stone font-sans opacity-80 max-w-2xl leading-relaxed">
                  {selectedLens.perspective}
                </p>
              </div>
              <button onClick={() => setSelectedLens(null)} className="text-stone hover:text-ivory transition-colors">
                <ShieldAlert size={16} />
              </button>
            </div>

            {pressure && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-8 border-t border-titanium/20">
              <div className="space-y-6">
                <h4 className="text-xs font-mono text-gold uppercase tracking-widest">Adversarial Pressure</h4>
                <p className="text-[10px] text-stone/70 font-sans leading-relaxed max-w-xl">
                  Synthesized from your directives, pulse, and journal—same lens, different workspace yields different pressure.
                </p>
                <div className="space-y-4">
                  {pressure.adversarial.map((block, i) => (
                    <div key={`adv-${i}`} className="group relative">
                      <span
                        className={cn(
                          'absolute -left-16 top-0.5 text-[8px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded border opacity-0 group-hover:opacity-100 transition-opacity',
                          block.tag === 'Hypothesis' && 'text-oxblood border-oxblood/30 bg-oxblood/5',
                          block.tag === 'Inference' && 'text-gold border-gold/30 bg-gold/5',
                          block.tag === 'Fact' && 'text-teal border-teal/30 bg-teal/5',
                        )}
                      >
                        {block.tag}
                      </span>
                      <p className="text-sm text-stone italic leading-relaxed">
                        {block.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-6">
                <h4 className="text-xs font-mono text-gold uppercase tracking-widest">Strategic Leverage</h4>
                <p className="text-[10px] text-stone/70 font-sans leading-relaxed max-w-xl">
                  Grounded in decisions and constitution values you have declared in Atlas.
                </p>
                <div className="space-y-4">
                  {pressure.strategic.map((block, i) => (
                    <div key={`str-${i}`} className="group relative">
                      <span
                        className={cn(
                          'absolute -left-16 top-0.5 text-[8px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded border opacity-0 group-hover:opacity-100 transition-opacity',
                          block.tag === 'Hypothesis' && 'text-oxblood border-oxblood/30 bg-oxblood/5',
                          block.tag === 'Inference' && 'text-gold border-gold/30 bg-gold/5',
                          block.tag === 'Fact' && 'text-teal border-teal/30 bg-teal/5',
                        )}
                      >
                        {block.tag}
                      </span>
                      <p className="text-sm text-stone italic leading-relaxed">
                        {block.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
