import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PenTool, FileText, Layout, Book, Briefcase, Search, Plus, ArrowRight, CheckCircle2, Download, Share2, Zap } from 'lucide-react';
import { AppState, BuildArtifact } from '../types';

interface ForgeArtifactProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

const ARTIFACT_ICONS: Record<string, any> = {
  'strategy-brief': Briefcase,
  'doctrine-book': Book,
  'deck': Layout,
  'essay': FileText,
  'research-memo': Search,
  'teaching-module': Book,
  'issue-map': Search,
  'playbook': Zap,
  'manual': Book,
  'manuscript': FileText,
};

export function ForgeArtifact({ state, setState }: ForgeArtifactProps) {
  const { buildWithAtlas } = state;
  const [isCreating, setIsCreating] = useState(false);
  const [newArtifactType, setNewArtifactType] = useState<BuildArtifact['type']>('strategy-brief');
  const [newArtifactTitle, setNewArtifactTitle] = useState('');

  const handleCreateArtifact = () => {
    if (!newArtifactTitle.trim()) return;

    const newArtifact: BuildArtifact = {
      id: Math.random().toString(36).substring(7),
      type: newArtifactType,
      title: newArtifactTitle,
      status: 'draft',
      content: 'New artifact initialized...'
    };

    setState(prev => ({
      ...prev,
      buildWithAtlas: {
        ...prev.buildWithAtlas,
        artifacts: [newArtifact, ...prev.buildWithAtlas.artifacts]
      }
    }));

    setNewArtifactTitle('');
    setIsCreating(false);
  };

  return (
    <div className="p-12 space-y-12 max-w-6xl mx-auto h-full overflow-y-auto custom-scrollbar">
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gold/10 rounded-sm border border-gold/20">
            <PenTool className="w-8 h-8 text-gold" />
          </div>
          <div>
            <h2 className="text-4xl font-serif text-ivory tracking-tight">Build With Atlas</h2>
            <p className="text-stone font-sans opacity-60 tracking-widest uppercase text-[10px]">
              Converting Cognition into Durable Intellectual Creation
            </p>
          </div>
        </div>
        <p className="text-stone font-sans opacity-80 max-w-3xl leading-relaxed">
          Atlas is not only a place for insight, but a forge for durable outputs. 
          Convert your thoughts, decisions, and doctrines into strategy briefs, books, and playbooks.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-1 space-y-6">
          <h3 className="instrument-label text-gold uppercase tracking-widest text-xs">Forge New Artifact</h3>
          <div className="grid grid-cols-1 gap-3">
            {[
              { type: 'strategy-brief', label: 'Strategy Brief' },
              { type: 'doctrine-book', label: 'Doctrine Book' },
              { type: 'deck', label: 'Presentation Deck' },
              { type: 'essay', label: 'Essay' },
              { type: 'research-memo', label: 'Research Memo' },
              { type: 'playbook', label: 'Playbook' },
              { type: 'manual', label: 'Manual' },
              { type: 'manuscript', label: 'Manuscript' },
            ].map((item) => {
              const Icon = ARTIFACT_ICONS[item.type] || FileText;
              return (
                <button
                  key={item.type}
                  onClick={() => {
                    setNewArtifactType(item.type as BuildArtifact['type']);
                    setIsCreating(true);
                  }}
                  className="flex items-center gap-3 p-4 bg-titanium/5 border border-titanium/20 rounded-sm text-stone hover:text-ivory hover:border-gold/30 hover:bg-gold/5 transition-all text-left group"
                >
                  <Icon className="w-4 h-4 text-gold/40 group-hover:text-gold" />
                  <span className="text-[10px] uppercase tracking-widest font-bold">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="md:col-span-3 space-y-6">
          <h3 className="instrument-label text-gold uppercase tracking-widest text-xs">Active Artifacts</h3>
          <div className="grid grid-cols-1 gap-6">
            <AnimatePresence>
              {isCreating && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="glass-panel p-8 border-gold/30 mb-6 space-y-4">
                    <h4 className="text-sm font-bold text-ivory uppercase tracking-widest">New {newArtifactType.replace('-', ' ')}</h4>
                    <input
                      type="text"
                      value={newArtifactTitle}
                      onChange={(e) => setNewArtifactTitle(e.target.value)}
                      placeholder="Artifact Title..."
                      className="w-full bg-obsidian/40 border border-titanium/10 rounded-sm p-3 text-xs text-ivory placeholder:text-stone/40 focus:border-gold/50 outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => setIsCreating(false)}
                        className="px-4 py-2 text-[10px] uppercase tracking-widest text-stone hover:text-ivory transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={handleCreateArtifact}
                        className="px-6 py-2 bg-gold/20 text-gold hover:bg-gold/30 text-[10px] uppercase tracking-widest rounded-sm transition-colors"
                      >
                        Initialize
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {buildWithAtlas.artifacts.length > 0 ? (
              buildWithAtlas.artifacts.map((artifact, index) => {
                const Icon = ARTIFACT_ICONS[artifact.type] || FileText;
                return (
                  <motion.div
                    key={artifact.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="glass-panel p-8 border-gold/10 relative group hover:border-gold/30 transition-all flex items-start gap-8"
                  >
                    <div className="p-4 bg-gold/10 rounded-sm group-hover:bg-gold/20 transition-all">
                      <Icon className="w-8 h-8 text-gold" />
                    </div>
                    <div className="flex-1 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-2xl font-serif text-ivory">{artifact.title}</h4>
                        <span className={`text-[8px] uppercase tracking-[0.2em] px-2 py-1 border rounded-sm ${
                          artifact.status === 'finished' ? 'text-gold border-gold/20 bg-gold/5' : 'text-stone border-titanium/20 bg-titanium/5'
                        }`}>
                          {artifact.status}
                        </span>
                      </div>
                      <p className="text-sm text-stone opacity-60 line-clamp-2 leading-relaxed">
                        {artifact.content}
                      </p>
                      <div className="flex items-center gap-6 pt-4 border-t border-titanium/10">
                        <button className="flex items-center gap-2 text-[10px] text-stone hover:text-ivory uppercase tracking-widest transition-all">
                          <Download className="w-3 h-3" /> Download
                        </button>
                        <button className="flex items-center gap-2 text-[10px] text-stone hover:text-ivory uppercase tracking-widest transition-all">
                          <Share2 className="w-3 h-3" /> Share
                        </button>
                        <button className="flex items-center gap-2 text-[10px] text-gold hover:text-ivory uppercase tracking-widest transition-all ml-auto">
                          Continue Forging <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="p-24 border border-dashed border-titanium/20 rounded-sm flex flex-col items-center justify-center gap-6 text-center">
                <div className="p-6 bg-titanium/5 rounded-full">
                  <PenTool className="w-12 h-12 text-stone opacity-20" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-xl font-serif text-stone opacity-40 italic">The Forge is Silent</h4>
                  <p className="text-xs text-stone opacity-30 max-w-xs mx-auto">
                    Select an artifact type from the left to begin converting your thoughts into durable form.
                  </p>
                </div>
                <button 
                  onClick={() => setIsCreating(true)}
                  className="px-8 py-3 bg-gold/10 hover:bg-gold/20 text-gold border border-gold/20 rounded-sm text-[10px] uppercase tracking-widest transition-all flex items-center gap-3"
                >
                  <Plus className="w-4 h-4" /> Start New Project
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
