import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Book, 
  PenTool, 
  Shield, 
  User, 
  Target, 
  Scale, 
  AlertTriangle, 
  TrendingUp, 
  Settings, 
  ChevronLeft, 
  Plus, 
  Save, 
  Trash2, 
  Sparkles,
  Search,
  Calendar,
  Lock,
  Eye,
  EyeOff,
  MessageSquare,
  ArrowRight,
  Pin,
  Link,
  History,
  FileText,
  MoreHorizontal,
  Maximize2,
  Minimize2,
  Filter,
  Archive,
  ChevronRight,
  Hash,
  Zap,
  Activity,
  Compass
} from 'lucide-react';
import { JournalEntry, JournalAssistanceMode, AppState } from '../types';
import { cn } from '../lib/utils';
import { analyzeJournalEntry } from '../services/ollamaService';

interface JournalChamberProps {
  state: AppState;
  onUpdateState: (updates: Partial<AppState>) => void;
}

export function JournalChamber({ state, onUpdateState }: JournalChamberProps) {
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLeftRailOpen, setIsLeftRailOpen] = useState(false);
  const [isRightRailOpen, setIsRightRailOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'pinned' | 'unresolved' | 'doctrine'>('all');
  
  useEffect(() => {
    setIsLeftRailOpen(window.innerWidth > 768);
    setIsRightRailOpen(window.innerWidth > 1024);
  }, []);

  const selectedEntry = state.journal.find(e => e.id === selectedEntryId);

  const handleCreateEntry = () => {
    const newEntry: JournalEntry = {
      id: Math.random().toString(36).substring(7),
      title: '',
      content: '',
      timestamp: new Date().toISOString(),
      tags: [],
      assistanceEnabled: false,
      assistanceMode: 'reflective-mirror',
      isUnresolved: true
    };
    onUpdateState({ journal: [newEntry, ...state.journal] });
    setSelectedEntryId(newEntry.id);
    setIsEditing(true);
  };

  const handleUpdateEntry = (updates: Partial<JournalEntry>) => {
    if (!selectedEntryId) return;
    const updatedJournal = state.journal.map(e => 
      e.id === selectedEntryId ? { ...e, ...updates } : e
    );
    onUpdateState({ journal: updatedJournal });
  };

  const handleDeleteEntry = (id: string) => {
    const updatedJournal = state.journal.filter(e => e.id !== id);
    onUpdateState({ journal: updatedJournal });
    if (selectedEntryId === id) setSelectedEntryId(null);
  };

  const handleAnalyze = async () => {
    if (!selectedEntry || !selectedEntry.content) return;
    
    setIsAnalyzing(true);
    try {
      const analysis = await analyzeJournalEntry(
        selectedEntry.content, 
        selectedEntry.assistanceMode,
        state.userModel,
        selectedEntry.customAssistancePrompt
      );
      handleUpdateEntry({ analysis });
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const filteredEntries = state.journal.filter(e => {
    const matchesSearch = e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         e.content.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (activeFilter === 'pinned') return matchesSearch && e.isPinned;
    if (activeFilter === 'unresolved') return matchesSearch && e.isUnresolved;
    if (activeFilter === 'doctrine') return matchesSearch && (e.doctrineLinks?.length || 0) > 0;
    
    return matchesSearch;
  });

  const assistanceModes: { id: JournalAssistanceMode; label: string; icon: any; description: string; sigil: string; color: string }[] = [
    { 
      id: 'reflective-mirror', 
      label: 'Reflective Mirror', 
      icon: User, 
      sigil: '◈',
      color: 'text-blue-400',
      description: 'Pattern recognition, emotional clarity, and internal contradictions.' 
    },
    { 
      id: 'strategic-analyst', 
      label: 'Strategic Analyst', 
      icon: Target, 
      sigil: '▲',
      color: 'text-amber-400',
      description: 'Leverage points, decision implications, and structural patterns.' 
    },
    { 
      id: 'doctrine-standards', 
      label: 'Doctrine & Standards', 
      icon: Scale, 
      sigil: '🏛',
      color: 'text-ivory',
      description: 'Alignment with principles, values, and internal law.' 
    },
    { 
      id: 'adversarial-red-team', 
      label: 'Adversarial / Red-Team', 
      icon: AlertTriangle, 
      sigil: '⚔',
      color: 'text-oxblood',
      description: 'Identifying self-deception, weak reasoning, and avoidance.' 
    },
    { 
      id: 'growth-mastery', 
      label: 'Growth & Mastery', 
      icon: TrendingUp, 
      sigil: '↗',
      color: 'text-teal-400',
      description: 'Identity evolution, skill-building, and long-term trajectory.' 
    },
    { 
      id: 'custom', 
      label: 'Custom Assistance', 
      icon: Settings, 
      sigil: '⚙',
      color: 'text-stone',
      description: 'Define your own interpretive lens or specific framing.' 
    }
  ];

  return (
    <div className="flex h-full bg-obsidian text-ivory font-sans overflow-hidden relative">
      {/* Left Rail: Journal Navigation */}
      <div className={cn(
        "w-64 border-r border-titanium/10 flex flex-col bg-graphite/30 transition-all duration-500 absolute md:relative z-30 h-full",
        isLeftRailOpen ? "translate-x-0" : "-translate-x-full md:w-0 md:opacity-0"
      )}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex flex-col">
              <h2 className="text-xs font-bold uppercase tracking-[0.3em] text-ivory/90">Journal</h2>
              <span className="text-[9px] text-stone mt-1 font-serif italic">A chamber for thought</span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleCreateEntry}
                className="p-2 hover:bg-gold/10 text-gold transition-colors rounded-full border border-gold/20"
                title="New Entry"
              >
                <Plus size={16} />
              </button>
              <button 
                onClick={() => setIsLeftRailOpen(false)}
                className="p-2 hover:bg-titanium/10 text-stone md:hidden"
              >
                <ChevronLeft size={16} />
              </button>
            </div>
          </div>
          
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone" size={12} />
            <input 
              type="text"
              placeholder="Search chamber..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-titanium/5 border border-titanium/10 rounded-sm py-1.5 pl-9 pr-4 text-[10px] focus:outline-none focus:border-gold/30 transition-all placeholder:text-stone/50"
            />
          </div>

          <nav className="space-y-1">
            {[
              { id: 'all', label: 'Recent Entries', icon: History },
              { id: 'pinned', label: 'Pinned Entries', icon: Pin },
              { id: 'unresolved', label: 'Unresolved', icon: Activity },
              { id: 'doctrine', label: 'Doctrine Linked', icon: Shield },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setActiveFilter(item.id as any)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-sm text-[10px] uppercase tracking-widest transition-all",
                  activeFilter === item.id 
                    ? "bg-gold/10 text-gold font-bold" 
                    : "text-stone hover:text-ivory hover:bg-titanium/5"
                )}
              >
                <item.icon size={12} />
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-6 space-y-1">
          <div className="px-3 py-2 text-[9px] uppercase tracking-[0.2em] text-stone/50 font-bold">Reflections</div>
          {filteredEntries.map(entry => (
            <button
              key={entry.id}
              onClick={() => {
                setSelectedEntryId(entry.id);
                setIsEditing(false);
              }}
              className={cn(
                "w-full text-left p-3 rounded-sm transition-all group border",
                selectedEntryId === entry.id 
                  ? "bg-gold/5 border-gold/20" 
                  : "hover:bg-titanium/5 border-transparent"
              )}
            >
              <div className="flex justify-between items-start mb-1">
                <h3 className={cn(
                  "text-[11px] font-medium truncate pr-2",
                  selectedEntryId === entry.id ? "text-gold" : "text-ivory/70"
                )}>
                  {entry.title || 'Untitled'}
                </h3>
                {entry.isPinned && <Pin size={8} className="text-gold shrink-0 mt-1" />}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[8px] text-stone uppercase tracking-tighter">
                  {new Date(entry.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
                {entry.isUnresolved && <div className="w-1 h-1 rounded-full bg-amber-500/50" />}
              </div>
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-titanium/10 bg-graphite/40 space-y-4">
          <div className="px-3 py-1 text-[9px] uppercase tracking-[0.2em] text-stone/50 font-bold">Writing Rituals</div>
          <div className="space-y-1">
            {[
              { label: 'The Unspoken', prompt: 'What is currently being avoided?', icon: AlertTriangle },
              { label: 'Doctrine Check', prompt: 'Evaluate a recent event against a core principle.', icon: Shield },
              { label: 'Continuity Bridge', prompt: 'Connect today’s state to a goal from 6 months ago.', icon: History },
              { label: 'Red-Team Self', prompt: 'Argue against one’s own recent conclusion.', icon: Zap }
            ].map(ritual => (
              <button
                key={ritual.label}
                onClick={() => {
                  const newEntry: JournalEntry = {
                    id: Math.random().toString(36).substring(7),
                    title: ritual.label,
                    content: ritual.prompt + '\n\n',
                    timestamp: new Date().toISOString(),
                    tags: ['ritual', ritual.label.toLowerCase().replace(' ', '-')],
                    assistanceEnabled: false,
                    assistanceMode: 'reflective-mirror'
                  };
                  onUpdateState({ journal: [newEntry, ...state.journal] });
                  setSelectedEntryId(newEntry.id);
                  setIsEditing(true);
                }}
                className="w-full text-left px-3 py-2 rounded-sm text-[10px] text-stone hover:text-gold hover:bg-gold/5 transition-all flex items-center gap-2 group"
              >
                <ritual.icon size={10} className="opacity-40 group-hover:opacity-100" />
                <span>{ritual.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Center Workspace: Writing Surface */}
      <div className="flex-1 flex flex-col bg-obsidian relative overflow-hidden">
        <AnimatePresence mode="wait">
          {selectedEntry ? (
            <motion.div 
              key={selectedEntry.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              {/* Header / Toolbar */}
              <div className="h-14 border-b border-titanium/10 flex items-center justify-between px-4 md:px-8 bg-graphite/10 backdrop-blur-sm z-10">
                <div className="flex items-center gap-2 md:gap-6">
                  {!isLeftRailOpen && (
                    <button 
                      onClick={() => setIsLeftRailOpen(true)}
                      className="p-2 hover:bg-titanium/10 text-stone"
                    >
                      <Book size={16} />
                    </button>
                  )}
                  <div className="flex items-center gap-3 text-stone overflow-hidden">
                    <Calendar size={12} className="shrink-0" />
                    <span className="text-[9px] uppercase tracking-[0.2em] font-medium truncate">
                      {new Date(selectedEntry.timestamp).toLocaleString(undefined, { 
                        weekday: 'short', 
                        month: 'short', 
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 md:gap-4">
                  <button 
                    onClick={() => handleUpdateEntry({ isPinned: !selectedEntry.isPinned })}
                    className={cn(
                      "p-2 transition-colors",
                      selectedEntry.isPinned ? "text-gold" : "text-stone hover:text-ivory"
                    )}
                    title={selectedEntry.isPinned ? "Unpin" : "Pin"}
                  >
                    <Pin size={14} />
                  </button>
                  <button 
                    onClick={() => setIsEditing(!isEditing)}
                    className={cn(
                      "flex items-center gap-2 px-3 md:px-4 py-1.5 rounded-sm text-[9px] uppercase tracking-widest font-bold transition-all",
                      isEditing 
                        ? "bg-gold text-obsidian" 
                        : "text-stone hover:text-ivory"
                    )}
                  >
                    {isEditing ? <Save size={12} /> : <PenTool size={12} />}
                    <span className="hidden sm:inline">{isEditing ? 'Save' : 'Edit'}</span>
                  </button>
                  <button 
                    onClick={() => setIsRightRailOpen(!isRightRailOpen)}
                    className={cn(
                      "p-2 transition-colors",
                      isRightRailOpen ? "text-gold" : "text-stone hover:text-ivory"
                    )}
                  >
                    {isRightRailOpen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </button>
                </div>
              </div>

              <div className="flex-1 flex overflow-hidden">
                {/* Writing Surface */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-obsidian">
                  <div className="max-w-3xl mx-auto px-12 py-20 min-h-full flex flex-col">
                    {isEditing ? (
                      <div className="space-y-12 flex-1 flex flex-col">
                        <input 
                          type="text"
                          value={selectedEntry.title}
                          onChange={(e) => handleUpdateEntry({ title: e.target.value })}
                          placeholder="Untitled Reflection"
                          className="w-full bg-transparent text-4xl font-serif text-ivory/90 border-none focus:outline-none placeholder:text-stone/20 tracking-tight"
                        />
                        <textarea 
                          value={selectedEntry.content}
                          onChange={(e) => handleUpdateEntry({ content: e.target.value })}
                          placeholder="What is ripening? What must be faced clearly?"
                          className="w-full flex-1 bg-transparent text-xl leading-[1.8] text-ivory/80 font-serif border-none focus:outline-none resize-none placeholder:text-stone/10"
                        />
                      </div>
                    ) : (
                      <div className="space-y-12">
                        <div className="space-y-4">
                          <h1 className="text-5xl font-serif text-ivory/95 tracking-tight leading-tight">
                            {selectedEntry.title || 'Untitled Reflection'}
                          </h1>
                          <div className="flex flex-wrap gap-2">
                            {selectedEntry.tags.map(tag => (
                              <span key={tag} className="px-2 py-0.5 bg-titanium/5 border border-titanium/10 rounded-sm text-[8px] uppercase tracking-widest text-stone">
                                #{tag}
                              </span>
                            ))}
                            {selectedEntry.isUnresolved && (
                              <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-sm text-[8px] uppercase tracking-widest text-amber-500/70 flex items-center gap-1">
                                <Activity size={8} /> Unresolved
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="prose prose-invert max-w-none">
                          <p className="text-xl leading-[1.9] text-ivory/85 font-serif whitespace-pre-wrap selection:bg-gold/20">
                            {selectedEntry.content || <span className="italic text-stone/30">The page is silent.</span>}
                          </p>
                        </div>

                        {/* Continuity / Context Footer */}
                        {!isEditing && (
                          <div className="mt-20 pt-12 border-t border-titanium/5 space-y-8">
                            <div className="grid grid-cols-2 gap-8">
                              <div className="space-y-4">
                                <h4 className="text-[9px] uppercase tracking-[0.3em] text-stone font-bold flex items-center gap-2">
                                  <Link size={10} /> Linked Doctrine
                                </h4>
                                <div className="space-y-2">
                                  {selectedEntry.doctrineLinks?.map(link => (
                                    <div key={link} className="p-3 bg-titanium/5 border border-titanium/10 rounded-sm text-[10px] text-ivory/60 hover:border-gold/30 transition-all cursor-pointer">
                                      {link}
                                    </div>
                                  )) || <p className="text-[10px] text-stone/40 italic">No doctrine linked.</p>}
                                </div>
                              </div>
                              <div className="space-y-4">
                                <h4 className="text-[9px] uppercase tracking-[0.3em] text-stone font-bold flex items-center gap-2">
                                  <Compass size={10} /> Continuity
                                </h4>
                                <div className="space-y-2">
                                  {selectedEntry.continuityReferences?.map(ref => (
                                    <div key={ref} className="p-3 bg-titanium/5 border border-titanium/10 rounded-sm text-[10px] text-ivory/60">
                                      {ref}
                                    </div>
                                  )) || <p className="text-[10px] text-stone/40 italic">No continuity references.</p>}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Rail: Assistance / Context Panel */}
                <AnimatePresence>
                  {isRightRailOpen && (
                    <motion.div 
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: window.innerWidth < 768 ? '100%' : 400, opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      className={cn(
                        "border-l border-titanium/10 bg-graphite/20 flex flex-col overflow-hidden absolute md:relative right-0 top-0 h-full z-30",
                        window.innerWidth < 768 ? "w-full" : "w-[400px]"
                      )}
                    >
                      <div className="p-6 md:p-8 flex-1 flex flex-col overflow-hidden">
                        <div className="flex justify-between items-center mb-6 md:hidden">
                          <h4 className="text-[9px] uppercase tracking-[0.3em] text-stone font-bold">Assistance Panel</h4>
                          <button onClick={() => setIsRightRailOpen(false)} className="p-2 text-stone">
                            <ChevronRight size={16} />
                          </button>
                        </div>
                        {/* Ceremonial Assistance Toggle */}
                        <div className="mb-6 md:mb-10">
                          <button 
                            onClick={() => handleUpdateEntry({ assistanceEnabled: !selectedEntry.assistanceEnabled })}
                            className={cn(
                              "w-full p-6 rounded-sm border transition-all flex flex-col items-center gap-4 group",
                              selectedEntry.assistanceEnabled 
                                ? "bg-gold/5 border-gold/30 shadow-[0_0_20px_rgba(212,175,55,0.05)]" 
                                : "bg-titanium/5 border-titanium/10 hover:border-gold/20"
                            )}
                          >
                            <div className={cn(
                              "p-3 rounded-full transition-all duration-700",
                              selectedEntry.assistanceEnabled ? "bg-gold text-obsidian scale-110 shadow-[0_0_15px_rgba(212,175,55,0.3)]" : "bg-titanium/10 text-stone group-hover:text-gold/50"
                            )}>
                              <Sparkles size={20} />
                            </div>
                            <div className="text-center">
                              <div className="text-[10px] font-bold uppercase tracking-[0.3em] mb-1">
                                {selectedEntry.assistanceEnabled ? 'Assistance Active' : 'Private Writing'}
                              </div>
                              <div className="text-[9px] text-stone font-serif italic">
                                {selectedEntry.assistanceEnabled ? 'Atlas is present in the chamber' : 'Invite Atlas into this entry'}
                              </div>
                            </div>
                          </button>
                        </div>

                        <AnimatePresence mode="wait">
                          {selectedEntry.assistanceEnabled ? (
                            <motion.div 
                              key="assistance-on"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="flex-1 flex flex-col overflow-hidden"
                            >
                              <div className="mb-8">
                                <h4 className="text-[9px] uppercase tracking-[0.3em] text-stone font-bold mb-4">Interpretive Stance</h4>
                                <div className="grid grid-cols-2 gap-2">
                                  {assistanceModes.map(mode => (
                                    <button
                                      key={mode.id}
                                      onClick={() => handleUpdateEntry({ assistanceMode: mode.id })}
                                      className={cn(
                                        "p-3 rounded-sm text-left transition-all border flex flex-col gap-2",
                                        selectedEntry.assistanceMode === mode.id
                                          ? "bg-gold/10 border-gold/30"
                                          : "bg-titanium/5 border-titanium/10 hover:border-gold/20"
                                      )}
                                    >
                                      <div className="flex items-center justify-between">
                                        <mode.icon size={12} className={cn(selectedEntry.assistanceMode === mode.id ? "text-gold" : "text-stone")} />
                                        <span className={cn("text-xs", mode.color)}>{mode.sigil}</span>
                                      </div>
                                      <div className="text-[9px] font-bold uppercase tracking-widest">{mode.label}</div>
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {selectedEntry.assistanceMode === 'custom' && (
                                <div className="mb-8 p-4 bg-titanium/5 border border-titanium/10 rounded-sm">
                                  <textarea 
                                    value={selectedEntry.customAssistancePrompt || ''}
                                    onChange={(e) => handleUpdateEntry({ customAssistancePrompt: e.target.value })}
                                    placeholder="Define your own interpretive lens..."
                                    className="w-full bg-transparent text-[10px] text-ivory border-none focus:outline-none resize-none h-16 placeholder:text-stone/30 font-serif"
                                  />
                                </div>
                              )}

                              <button
                                onClick={handleAnalyze}
                                disabled={isAnalyzing || !selectedEntry.content}
                                className={cn(
                                  "w-full py-3 rounded-sm flex items-center justify-center gap-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-all mb-8",
                                  isAnalyzing 
                                    ? "bg-titanium/10 text-stone cursor-not-allowed" 
                                    : "bg-gold text-obsidian hover:shadow-[0_0_15px_rgba(212,175,55,0.2)]"
                                )}
                              >
                                {isAnalyzing ? 'Analyzing...' : 'Invite Analysis'}
                              </button>

                              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                                {selectedEntry.analysis ? (
                                  <div className="space-y-8 pb-8">
                                    <div className="p-5 bg-gold/5 border border-gold/10 rounded-sm space-y-3">
                                      <div className="flex items-center gap-2 text-gold">
                                        <Zap size={12} />
                                        <span className="text-[9px] font-bold uppercase tracking-widest">Synthesis</span>
                                      </div>
                                      <p className="text-xs text-ivory/80 leading-relaxed font-serif italic">
                                        "{selectedEntry.analysis.summary}"
                                      </p>
                                    </div>

                                    <div className="space-y-6">
                                      {[
                                        { label: 'Observations', items: selectedEntry.analysis.observation, color: 'text-stone', sigil: '○' },
                                        { label: 'Interpretations', items: selectedEntry.analysis.interpretation, color: 'text-blue-400', sigil: '◈' },
                                        { label: 'Inferences', items: selectedEntry.analysis.inference, color: 'text-teal-400', sigil: '▲' },
                                        { label: 'Hypotheses', items: selectedEntry.analysis.hypothesis, color: 'text-oxblood', sigil: '⚔' },
                                        { label: 'Tension Points', items: selectedEntry.analysis.tensionPoints || [], color: 'text-amber-400', sigil: '⚡' },
                                        { label: 'Doctrine Implications', items: selectedEntry.analysis.doctrineImplications || [], color: 'text-ivory', sigil: '🏛' }
                                      ].map(section => section.items.length > 0 && (
                                        <div key={section.label} className="space-y-3">
                                          <h5 className={cn("text-[9px] uppercase tracking-widest font-bold flex items-center gap-2", section.color)}>
                                            <span>{section.sigil}</span>
                                            {section.label}
                                          </h5>
                                          <ul className="space-y-3">
                                            {section.items.map((item, i) => (
                                              <li key={i} className="text-[11px] text-ivory/70 leading-relaxed pl-4 border-l border-titanium/10">
                                                {item}
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      ))}
                                    </div>

                                    {/* Challenge Prompts */}
                                    {(selectedEntry.analysis.challengePrompts?.length || 0) > 0 && (
                                      <div className="pt-8 border-t border-titanium/10 space-y-4">
                                        <h5 className="text-[9px] uppercase tracking-widest text-oxblood font-bold flex items-center gap-2">
                                          <AlertTriangle size={10} /> Challenge Prompts
                                        </h5>
                                        <div className="space-y-3">
                                          {selectedEntry.analysis.challengePrompts?.map((prompt, i) => (
                                            <div key={i} className="p-4 bg-oxblood/5 border border-oxblood/10 rounded-sm text-xs text-ivory/80 font-serif italic leading-relaxed">
                                              {prompt}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Next Reflective Questions */}
                                    {(selectedEntry.analysis.nextReflectiveQuestions?.length || 0) > 0 && (
                                      <div className="pt-8 border-t border-titanium/10 space-y-4">
                                        <h5 className="text-[9px] uppercase tracking-widest text-teal-400 font-bold flex items-center gap-2">
                                          <MessageSquare size={10} /> Future Reflection
                                        </h5>
                                        <div className="space-y-3">
                                          {selectedEntry.analysis.nextReflectiveQuestions?.map((q, i) => (
                                            <div key={i} className="p-4 bg-titanium/5 border border-titanium/10 rounded-sm text-xs text-ivory/80 font-serif leading-relaxed">
                                              {q}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4 opacity-30">
                                    <div className="w-12 h-12 border border-titanium/20 rounded-full flex items-center justify-center">
                                      <Sparkles size={20} className="text-stone" />
                                    </div>
                                    <p className="text-[10px] text-stone font-serif italic leading-relaxed">
                                      Select an interpretive stance and invite Atlas to begin the reading.
                                    </p>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div 
                              key="assistance-off"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="flex-1 flex flex-col"
                            >
                              <div className="space-y-8">
                                <div className="space-y-4">
                                  <h4 className="text-[9px] uppercase tracking-[0.3em] text-stone font-bold">Metadata</h4>
                                  <div className="space-y-2">
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-stone">Word Count</span>
                                      <span className="text-ivory/60">{selectedEntry.content.split(/\s+/).filter(Boolean).length}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-stone">Status</span>
                                      <span className={cn(selectedEntry.isUnresolved ? "text-amber-500" : "text-teal-500")}>
                                        {selectedEntry.isUnresolved ? 'Unresolved' : 'Settled'}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-4">
                                  <h4 className="text-[9px] uppercase tracking-[0.3em] text-stone font-bold">Tags</h4>
                                  <div className="flex flex-wrap gap-2">
                                    {selectedEntry.tags.map(tag => (
                                      <span key={tag} className="px-2 py-1 bg-titanium/5 border border-titanium/10 rounded-sm text-[9px] text-stone">
                                        {tag}
                                      </span>
                                    ))}
                                    <button className="p-1 text-stone hover:text-gold transition-colors">
                                      <Plus size={12} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-obsidian"
            >
              <div className="max-w-md space-y-10">
                <div className="relative">
                  <div className="w-24 h-24 bg-gold/5 border border-gold/10 rounded-full flex items-center justify-center mx-auto relative z-10">
                    <PenTool className="text-gold" size={32} />
                  </div>
                  <div className="absolute inset-0 bg-gold/5 blur-3xl rounded-full scale-150 opacity-50" />
                </div>
                <div className="space-y-4">
                  <h2 className="text-3xl font-serif text-ivory tracking-tight">The Journal Chamber</h2>
                  <p className="text-sm text-stone leading-relaxed italic font-serif">
                    "A quiet record of the inner life of the mind. Enter for reflection, thought capture, and the formation of doctrine."
                  </p>
                </div>
                <div className="flex flex-col items-center gap-6">
                  <button 
                    onClick={handleCreateEntry}
                    className="px-10 py-4 bg-gold text-obsidian text-[10px] font-bold uppercase tracking-[0.3em] rounded-sm hover:scale-105 transition-all active:scale-95 shadow-[0_0_20px_rgba(212,175,55,0.2)]"
                  >
                    New Reflection
                  </button>
                  <div className="flex items-center gap-8 text-stone/40">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-lg font-serif">{state.journal.length}</span>
                      <span className="text-[8px] uppercase tracking-widest">Entries</span>
                    </div>
                    <div className="w-px h-6 bg-titanium/10" />
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-lg font-serif">{state.journal.filter(e => e.isUnresolved).length}</span>
                      <span className="text-[8px] uppercase tracking-widest">Unresolved</span>
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

function Brain({ size, className }: { size: number, className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.54Z"/>
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.54Z"/>
    </svg>
  );
}
