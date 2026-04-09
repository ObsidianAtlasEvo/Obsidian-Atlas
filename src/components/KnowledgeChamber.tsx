import React, { useState } from 'react';
import { BookOpen, Layers, History, ShieldCheck, Zap, HelpCircle, GraduationCap, Compass, MessageSquare, Target, Globe, Languages, Scale, ShieldAlert, FileText, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppState, Entity, KnowledgeLayer, EpistemicFramework } from '../types';
import { MOCK_ENTITIES } from '../constants';

interface KnowledgeChamberProps {
  state: AppState;
}

export function KnowledgeChamber({ state }: KnowledgeChamberProps) {
  const [selectedDiscipline, setSelectedDiscipline] = useState<Entity | null>(
    MOCK_ENTITIES.find(e => e.type === 'discipline') || null
  );
  const [activeTab, setActiveTab] = useState<'blueprint' | 'layers' | 'lineage' | 'pressure' | 'multilingual' | 'civilizational'>('blueprint');

  if (!selectedDiscipline) return <div className="p-8 text-stone">No discipline selected for study.</div>;

  const blueprint = selectedDiscipline.blueprint;
  const epistemic = selectedDiscipline.epistemic;

  return (
    <div className="h-full flex flex-col bg-obsidian">
      {/* Header */}
      <header className="p-8 border-b border-titanium/30 flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-gold">
            <BookOpen size={24} />
            <h2 className="text-2xl font-medium tracking-tight">Knowledge Chamber</h2>
          </div>
          <p className="text-stone text-sm tracking-wide">Deep Study: {selectedDiscipline.title}</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {['blueprint', 'layers', 'lineage', 'pressure', 'multilingual', 'civilizational'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${
                activeTab === tab 
                  ? 'bg-gold/10 text-gold border border-gold/30' 
                  : 'text-stone hover:text-ivory border border-transparent'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <AnimatePresence mode="wait">
          {activeTab === 'blueprint' && blueprint && (
            <motion.div
              key="blueprint"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-8"
            >
              {/* First Principles & Foundations */}
              <div className="space-y-8 md:col-span-2">
                <section className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-teal flex items-center gap-2">
                    <Zap size={14} /> First Principles
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {blueprint.firstPrinciples.map((p, i) => (
                      <div key={i} className="glass-panel p-4 text-sm text-ivory/90 leading-relaxed group relative">
                        <span className="absolute -top-2 -right-2 text-[8px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded border text-teal border-teal/30 bg-teal/5 opacity-0 group-hover:opacity-100 transition-opacity">
                          Fact
                        </span>
                        {p}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gold flex items-center gap-2">
                    <Layers size={14} /> Conceptual Frameworks
                  </h3>
                  <div className="space-y-4">
                    {blueprint.conceptualFrameworks.map((f, i) => (
                      <div key={i} className="glass-panel p-6 group relative">
                        <span className="absolute -top-2 -right-2 text-[8px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded border text-gold border-gold/30 bg-gold/5 opacity-0 group-hover:opacity-100 transition-opacity">
                          Inference
                        </span>
                        <h4 className="text-sm font-medium text-ivory mb-2">{f}</h4>
                        <p className="text-xs text-stone leading-relaxed">
                          Core framework used to organize and interpret information within this discipline.
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-oxblood flex items-center gap-2">
                    <HelpCircle size={14} /> Unresolved Debates & Frontier Questions
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {blueprint.unresolvedDebates.map((d, i) => (
                      <div key={i} className="p-4 border-l-2 border-oxblood/30 bg-oxblood/5 text-xs text-stone italic group relative">
                        <span className="absolute -top-2 -right-2 text-[8px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded border text-oxblood border-oxblood/30 bg-oxblood/5 opacity-0 group-hover:opacity-100 transition-opacity">
                          Hypothesis
                        </span>
                        {d}
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {/* Sidebar Details */}
              <div className="space-y-8">
                <section className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-stone">Core Vocabulary</h3>
                  <div className="flex flex-wrap gap-2">
                    {blueprint.coreVocabulary.map((v, i) => (
                      <span key={i} className="px-2 py-1 bg-titanium/20 border border-titanium/30 text-[10px] text-ivory rounded">
                        {v}
                      </span>
                    ))}
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-stone">Influential Figures</h3>
                  <div className="space-y-2">
                    {blueprint.influentialFigures.map((f, i) => (
                      <div key={i} className="text-xs text-stone flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-gold" />
                        {f}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-stone">Common Misconceptions</h3>
                  <div className="space-y-3">
                    {blueprint.commonMisconceptions.map((m, i) => (
                      <div key={i} className="text-[10px] text-oxblood/80 bg-oxblood/5 p-2 border border-oxblood/10 rounded">
                        {m}
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </motion.div>
          )}

          {activeTab === 'layers' && selectedDiscipline.layers && (
            <motion.div
              key="layers"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-12"
            >
              <div className="max-w-2xl space-y-4">
                <h3 className="text-xl font-medium text-ivory">Mastery Trajectory</h3>
                <p className="text-stone text-sm leading-relaxed">
                  The path from foundational literacy to frontier-level ambiguity. Track your progress across the cognitive layers of this discipline.
                </p>
              </div>

              <div className="relative space-y-8">
                <div className="absolute left-[15px] top-0 bottom-0 w-px bg-titanium/30" />
                {selectedDiscipline.layers.map((layer, i) => (
                  <div key={i} className="relative pl-12">
                    <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-obsidian border-2 border-gold flex items-center justify-center z-10">
                      <GraduationCap size={14} className="text-gold" />
                    </div>
                    <div className="glass-panel p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold uppercase tracking-widest text-gold">{layer.level}</h4>
                        <span className="text-[10px] text-stone">Layer {i + 1}</span>
                      </div>
                      <p className="text-sm text-ivory/80 leading-relaxed">{layer.description}</p>
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase tracking-widest text-stone font-bold">Mastery Indicators</p>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {layer.masteryIndicators.map((indicator, j) => (
                            <li key={j} className="text-xs text-stone flex items-center gap-2">
                              <ShieldCheck size={12} className="text-teal" />
                              {indicator}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'lineage' && blueprint && (
            <motion.div
              key="lineage"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-8"
            >
              <div className="flex items-center gap-3 text-amber">
                <History size={20} />
                <h3 className="text-lg font-medium">Historical Lineage</h3>
              </div>
              <div className="grid grid-cols-1 gap-6">
                {blueprint.historicalDevelopment.map((era, i) => (
                  <div key={i} className="flex gap-6">
                    <div className="w-24 shrink-0 text-[10px] uppercase tracking-widest text-stone font-bold pt-1">
                      {era.era}
                    </div>
                    <div className="glass-panel p-6 flex-1">
                      <p className="text-sm text-ivory/90 leading-relaxed">{era.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'multilingual' && (
            <motion.div
              key="multilingual"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              <div className="max-w-2xl space-y-4">
                <div className="flex items-center gap-3 text-gold">
                  <Languages size={20} />
                  <h3 className="text-xl font-medium text-ivory">Multilingual Synthesis Layer</h3>
                </div>
                <p className="text-stone text-sm leading-relaxed">
                  Ingesting, comparing, and synthesizing knowledge across linguistic boundaries. Preserving semantic fidelity while uncovering cross-cultural framing differences.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                {/* Source Material */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-titanium/20 pb-2">
                    <h4 className="instrument-label text-stone">Original Source Material</h4>
                    <span className="text-[10px] text-gold uppercase tracking-widest">German (Original)</span>
                  </div>
                  <div className="glass-panel p-8 space-y-6 bg-titanium/5">
                    <p className="text-lg font-serif text-ivory italic leading-relaxed opacity-90">
                      "Die Grenze meiner Sprache bedeuten die Grenzen meiner Welt."
                    </p>
                    <div className="pt-4 border-t border-titanium/10 space-y-2">
                      <span className="text-[10px] text-stone uppercase tracking-widest">Transliteration</span>
                      <p className="text-xs text-stone opacity-60">Dee gren-tse my-ner shprah-khe be-doy-ten dee gren-tsen my-ner velt.</p>
                    </div>
                  </div>
                </div>

                {/* Synthesis & Analysis */}
                <div className="space-y-8">
                  <div className="space-y-4">
                    <h4 className="instrument-label text-stone">Semantic Fidelity Analysis</h4>
                    <div className="glass-panel p-6 space-y-4 border-teal/20 bg-teal/5">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-ivory">Fidelity Score</span>
                        <span className="text-sm font-serif text-teal">0.94</span>
                      </div>
                      <div className="h-1 bg-teal/20 rounded-full overflow-hidden">
                        <div className="h-full bg-teal w-[94%]" />
                      </div>
                      <p className="text-[10px] text-stone opacity-80 leading-relaxed">
                        High fidelity maintained. The concept of "Grenze" (boundary/limit) is preserved in its philosophical context, avoiding the common drift toward "restriction".
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="instrument-label text-stone">Translation Risk Zones</h4>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-[10px] px-2 py-1 bg-oxblood/10 text-oxblood rounded border border-oxblood/20">Semantic Drift: High</span>
                      <span className="text-[10px] px-2 py-1 bg-gold/10 text-gold rounded border border-gold/20">Cultural Context: Critical</span>
                      <span className="text-[10px] px-2 py-1 bg-titanium/10 text-stone rounded border border-titanium/20">Technical Nuance: Stable</span>
                    </div>
                  </div>
                </div>
              </div>

              <section className="pt-12 border-t border-titanium/10 space-y-8">
                <h4 className="instrument-label text-stone">Comparative Framing Analysis</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="p-6 bg-titanium/5 border border-titanium/10 rounded space-y-4">
                    <span className="text-[10px] text-gold uppercase tracking-widest">Anglo-American Lens</span>
                    <p className="text-xs text-stone leading-relaxed">Focuses on the logical structure of language and its relationship to empirical reality.</p>
                  </div>
                  <div className="p-6 bg-titanium/5 border border-titanium/10 rounded space-y-4">
                    <span className="text-[10px] text-gold uppercase tracking-widest">Continental Lens</span>
                    <p className="text-xs text-stone leading-relaxed">Emphasizes the existential and phenomenological boundaries of the self through speech.</p>
                  </div>
                  <div className="p-6 bg-titanium/5 border border-titanium/10 rounded space-y-4">
                    <span className="text-[10px] text-gold uppercase tracking-widest">Eastern/Vedic Lens</span>
                    <p className="text-xs text-stone leading-relaxed">Views language as a veil (Maya) that both reveals and conceals the ultimate reality (Brahman).</p>
                  </div>
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'civilizational' && (
            <motion.div
              key="civilizational"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-12"
            >
              <div className="max-w-2xl space-y-4">
                <div className="flex items-center gap-3 text-gold">
                  <Scale size={20} />
                  <h3 className="text-xl font-medium text-ivory">Civilizational Lens</h3>
                </div>
                <p className="text-stone text-sm leading-relaxed">
                  Comparative analysis of foundational concepts across civilizations. Understanding how different traditions frame the same human tensions.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-8">
                  <h4 className="instrument-label text-stone">Concept: Authority</h4>
                  <div className="space-y-6">
                    <div className="p-6 glass-panel border-gold/10 space-y-3">
                      <h5 className="text-sm font-medium text-ivory">Roman (Auctoritas)</h5>
                      <p className="text-xs text-stone leading-relaxed">Authority derived from prestige, character, and historical continuity. Distinct from raw power (Potestas).</p>
                    </div>
                    <div className="p-6 glass-panel border-gold/10 space-y-3">
                      <h5 className="text-sm font-medium text-ivory">Confucian (Li/Mandate)</h5>
                      <p className="text-xs text-stone leading-relaxed">Authority as a reflection of cosmic order and moral rectitude. The "Mandate of Heaven".</p>
                    </div>
                    <div className="p-6 glass-panel border-gold/10 space-y-3">
                      <h5 className="text-sm font-medium text-ivory">Modern Technocratic</h5>
                      <p className="text-xs text-stone leading-relaxed">Authority derived from specialized knowledge, data, and institutional position.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-8">
                  <h4 className="instrument-label text-stone">Synthesis & Divergence</h4>
                  <div className="glass-panel p-8 border-gold/20 bg-gold/5 space-y-6">
                    <div className="space-y-2">
                      <h5 className="text-sm font-bold uppercase tracking-widest text-gold">Converging Themes</h5>
                      <p className="text-xs text-stone leading-relaxed">All traditions link true authority to a source beyond the individual (History, Heaven, or Data).</p>
                    </div>
                    <div className="space-y-2">
                      <h5 className="text-sm font-bold uppercase tracking-widest text-oxblood">Critical Divergence</h5>
                      <p className="text-xs text-stone leading-relaxed">The Modern Technocratic model is the only one that decouples authority from character (Virtue/Prestige).</p>
                    </div>
                    <div className="pt-4 border-t border-titanium/20">
                      <span className="text-[10px] text-stone uppercase tracking-widest">Strategic Insight</span>
                      <p className="text-sm text-ivory italic mt-2">"The current crisis of authority is a crisis of decoupling. Restoring 'Auctoritas' requires a return to character-based prestige."</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
