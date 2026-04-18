// Atlas-Audit: [EXEC-MODE] Verified — Sign-out sets activeMode via coerceActiveMode('onboarding', prev.activeMode) with cleared user.
// Atlas-Audit: [PERF-P6] Verified — Search Mind + Show Advanced pointer-enter prefetch GlobalSearch / IntelligenceRail shell chunks (aligned with App command bar).
// Atlas-Audit: [PERF-P5] Verified — Pointer-enter on nav items prefetches the target chamber chunk (lazyChamberModules.prefetchChamberForMode) for faster mode switches.
// Atlas-Audit: [INTEGRATION] Graph + Cartography are adjacent and described as one map stack; Pulse + Audit join System rail so orientation and governance are reachable without hunting—reduces “feature collage” navigation.
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Globe, 
  Zap, 
  Hammer, 
  Eye, 
  Radio, 
  Users, 
  Layers, 
  Lock, 
  GitBranch, 
  Library,
  Fingerprint,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
  History,
  Scale,
  Compass,
  ScrollText,
  ShieldAlert,
  Brain,
  Sparkles,
  Shield,
  Target,
  RefreshCw,
  Book,
  Heart,
  AlertTriangle,
  Rocket,
  Flame,
  PenTool,
  Layout,
  BookOpen,
  Calendar,
  Sun,
  Filter,
  BrainCircuit,
  Search,
  Waves,
  LogOut,
  ShieldCheck,
  Activity,
  Network,
  Info,
  Database,
  Radar,
  Orbit,
  Anchor,
  Bug,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { coerceActiveMode } from '../lib/atlasWayfinding';
import { AppState } from '../types';
import { auth, logAudit } from '../services/firebase';
import { signOut } from 'firebase/auth';
import { SOVEREIGN_CREATOR_EMAIL } from '../config/sovereignCreator';

interface SidebarProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  activeMode: AppState['activeMode'];
  setActiveMode: (mode: AppState['activeMode']) => void;
  absoluteSignalMode?: boolean;
  onOpenSearch?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

const NAV_ITEMS: { id: AppState['activeMode']; label: string; description: string; icon: any; category: 'Primary' | 'Secondary' | 'Governance' | 'Advanced' | 'System'; role?: string }[] = [
  // Primary Navigation - High Frequency
  {
    id: 'sovereign-atrium',
    label: 'Sovereign Atrium',
    description: 'Command environment — systems, not chat-first',
    icon: ShieldCheck,
    category: 'Primary',
  },
  { id: 'today-in-atlas', label: 'Home', description: 'Prepared command center — inquiry, directives, quick loop', icon: Layout, category: 'Primary' },
  { id: 'atlas', label: 'Graph', description: 'Scaffold topology (explore structure; pair with Cartography for live data)', icon: Network, category: 'Primary' },
  { id: 'mind-cartography', label: 'Cartography', description: 'Persisted mind map — API-backed nodes & edges', icon: Compass, category: 'Primary' },
  { id: 'directive-center', label: 'Directives', description: 'Command posture, active laws, cache invalidation', icon: Settings, category: 'Primary' },
  
  // Secondary Navigation - Specialized Chambers
  { id: 'mirrorforge', label: 'Mirrorforge', description: 'Cognitive modeling and pattern recognition', icon: Fingerprint, category: 'Secondary' },
  { id: 'core-systems', label: 'Core Systems', description: 'Reality Engine, Truth Ledger, Evolution & Memory', icon: Globe, category: 'Secondary' },
  {
    id: 'strategic-modeling',
    label: 'Strategic Model',
    description: 'Simulation forge, reality graph, identity protocols, self-revision',
    icon: BrainCircuit,
    category: 'Secondary',
  },
  {
    id: 'trajectory-observatory',
    label: 'Observatory',
    description: 'Trajectory, momentum, and directional coherence',
    icon: Radar,
    category: 'Secondary',
  },
  {
    id: 'friction-cartography',
    label: 'Friction Map',
    description: 'Resistance, drag, and root-cause cartography',
    icon: Orbit,
    category: 'Secondary',
  },
  {
    id: 'threshold-forge',
    label: 'Threshold Forge',
    description: 'Protocols for destabilized states',
    icon: Anchor,
    category: 'Secondary',
  },
  { id: 'chrysalis', label: 'Chrysalis', description: 'System evolution and refinement', icon: Sparkles, category: 'Secondary' },
  { id: 'crucible', label: 'Crucible', description: 'Dedicated pressure-forging system', icon: Flame, category: 'Secondary' },
  { id: 'journal', label: 'Journal', description: 'Private room for reflection', icon: Calendar, category: 'Secondary' },
  { id: 'resonance', label: 'Resonance', description: 'Identity-aligned expression modeling', icon: Waves, category: 'Secondary' },

  // Advanced & Specialized
  { id: 'vault', label: 'Archive', description: 'Sovereign archive below', icon: Lock, category: 'Advanced' },
  { id: 'drift-center', label: 'Drift Center', description: 'Alignment monitoring and rituals', icon: Activity, category: 'Advanced' },
  { id: 'doctrine', label: 'Doctrine', description: 'Structural hall of principles', icon: ScrollText, category: 'Advanced' },
  { id: 'decisions', label: 'Decisions', description: 'Strategic room for choices', icon: Target, category: 'Advanced' },
  { id: 'deep-work', label: 'Deep Work', description: 'Immense focus chamber', icon: BrainCircuit, category: 'Advanced' },
  { id: 'constitution', label: 'Constitution', description: 'The governing spine', icon: Scale, category: 'Advanced' },
  
  // Governance
  { id: 'creator-console', label: 'Console', description: 'Root governance and control', icon: ShieldCheck, category: 'Governance', role: 'sovereign_creator' },
  { id: 'gap-ledger', label: 'Gaps', description: 'Ranked architectural weaknesses', icon: Target, category: 'Governance', role: 'sovereign_creator' },

  // System
  { id: 'pulse', label: 'Pulse', description: 'Orientation layer tied to AppState — doctrine, posture, pulse items', icon: Sparkles, category: 'System' },
  { id: 'audit-logs', label: 'Audit', description: 'Governance event stream (Firestore when enabled)', icon: History, category: 'System' },
  { id: 'privacy-center', label: 'Privacy', description: 'Consent and data minimization controls', icon: Shield, category: 'System' },
  { id: 'capabilities', label: 'Capabilities', description: 'Capability catalog — links to chambers', icon: Library, category: 'System' },
];

import { useSettingsStore } from '../services/state/settingsStore';
import {
  prefetchBugHunterModule,
  prefetchChamberForMode,
  prefetchGlobalSearchModule,
  prefetchIntelligenceRailModule,
} from './lazyChamberModules';

export function Sidebar({ state, setState, activeMode, setActiveMode, absoluteSignalMode, onOpenSearch, isOpen, onClose }: SidebarProps) {
  const [isExpanded, setIsExpanded] = React.useState(true);
  const settings = useSettingsStore();

  const showAdvanced = settings.isAdvancedMode;
  const setShowAdvanced = settings.setAdvancedMode;
  const isCrisisMode = settings.isCrisisMode;
  const setCrisisMode = settings.setCrisisMode;

  // Force collapse in absolute signal mode
  const effectiveIsExpanded = absoluteSignalMode ? false : isExpanded;

  const handleSignOut = async () => {
    try {
      logAudit('User Sign Out', 'low');
      await signOut(auth);
      setState((prev) => ({
        ...prev,
        currentUser: undefined,
        activeMode: coerceActiveMode('onboarding', prev.activeMode),
      }));
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const categories: ('Primary' | 'Secondary' | 'Governance' | 'Advanced' | 'System')[] = ['Primary', 'Secondary', 'Advanced', 'Governance', 'System'];
  const filteredCategories = categories.filter(cat => {
    if (cat === 'Governance') return state.currentUser?.role === 'sovereign_creator';
    if (cat === 'Advanced') return showAdvanced;
    return true;
  });

  return (
    <>
      {/* Mobile Scrim */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] lg:hidden"
          onClick={onClose}
        />
      )}
      <motion.aside 
        className={cn(
          "h-[100dvh] glass-obsidian border-r flex flex-col z-[100] fixed lg:static top-0 left-0",
          effectiveIsExpanded ? "w-[var(--atlas-nav-expanded)]" : "w-[var(--atlas-nav-collapsed)]"
        )}
        initial={false}
        animate={{
          x: isOpen || (typeof window !== 'undefined' && window.innerWidth >= 1024) ? 0 : '-100%',
          width: effectiveIsExpanded ? 'var(--atlas-nav-expanded)' : 'var(--atlas-nav-collapsed)',
        }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
      <div className="p-6 flex items-center justify-between h-24 border-b border-purple-500/15">
        {effectiveIsExpanded ? (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col"
          >
            <span className="font-serif text-lg tracking-[0.2em] text-ivory uppercase font-light">
              Obsidian <span className="text-gold-500 font-bold">Atlas</span>
            </span>
            <span className="text-[8px] uppercase tracking-[0.4em] text-stone opacity-30 font-mono">Sovereign OS v4.2</span>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-10 h-10 border border-gold-500/20 flex items-center justify-center bg-gold-500/5 mx-auto rounded-sm group hover:border-gold-500/50 transition-all duration-500"
          >
            <span className="text-gold-500 font-serif text-sm font-bold group-hover:scale-110 transition-transform duration-500">OA</span>
          </motion.div>
        )}
      </div>

      <div className="px-4 py-4">
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onPointerEnter={prefetchGlobalSearchModule}
          onClick={onOpenSearch}
          className={cn(
            "w-full flex items-center p-3 rounded-sm transition-all duration-500 border border-purple-500/15 bg-[#1a103c]/40 hover:bg-[#1a103c]/60 hover:border-gold-500/20 text-stone hover:text-ivory group",
            !effectiveIsExpanded && "justify-center"
          )}
        >
          <Search size={16} className={cn("shrink-0 transition-all duration-500 group-hover:text-gold-500", effectiveIsExpanded ? "mr-3" : "")} />
          {effectiveIsExpanded && (
            <div className="flex flex-1 items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-widest opacity-60">Search Mind</span>
              <div className="flex items-center gap-1 opacity-20 group-hover:opacity-40 transition-opacity duration-500">
                <span className="text-[8px] px-1 py-0.5 bg-[#1a103c]/20 rounded border border-purple-500/20">⌘</span>
                <span className="text-[8px] px-1 py-0.5 bg-[#1a103c]/20 rounded border border-purple-500/20">K</span>
              </div>
            </div>
          )}
        </motion.button>
      </div>

      <nav className="flex-1 py-2 space-y-6 overflow-y-auto no-scrollbar px-3">
        {filteredCategories.map(category => (
          <div key={category} className="space-y-1">
            {effectiveIsExpanded && (
              <div className="px-3 py-2 text-[9px] font-mono uppercase tracking-[0.3em] text-stone/60 flex items-center justify-between">
                {category}
              </div>
            )}
            <AnimatePresence mode="popLayout">
              {NAV_ITEMS.filter(item => item.category === category).map((item, index) => {
                if (item.category === 'Governance' && state.currentUser?.email !== SOVEREIGN_CREATOR_EMAIL) return null;
                if (item.role && state.currentUser?.role !== item.role) return null;
                return (
                  <motion.button
                    key={item.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.5, delay: index * 0.05 }}
                    onPointerEnter={() => prefetchChamberForMode(item.id)}
                    onClick={() => setActiveMode(item.id)}
                    className={cn(
                      "w-full flex items-center py-2.5 transition-all duration-300 group relative rounded-sm px-3",
                      activeMode === item.id 
                        ? "text-gold-500 bg-gold-500/5 border border-gold-500/20 shadow-[0_0_15px_rgba(212,175,55,0.03)]" 
                        : "text-stone hover:text-ivory hover:bg-[#1a103c]/40 hover:border-purple-500/20 border border-transparent"
                    )}
                  >
                    {activeMode === item.id && (
                      <motion.div 
                        layoutId="active-nav-indicator"
                        className="absolute left-0 w-0.5 h-4 bg-gold-500 rounded-full"
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      />
                    )}
                    <item.icon 
                      size={14} 
                      className={cn(
                        "shrink-0 transition-all duration-300",
                        activeMode === item.id ? "stroke-[2px] text-gold-500" : "stroke-[1.5px] group-hover:stroke-[2px] group-hover:text-ivory"
                      )} 
                      title={item.label}
                    />
                    <motion.span 
                      initial={false}
                      animate={{ opacity: effectiveIsExpanded ? 1 : 0, x: effectiveIsExpanded ? 0 : -10 }}
                      className={cn(
                        "ml-4 text-[10px] font-mono uppercase tracking-[0.2em] font-medium transition-colors duration-300",
                        activeMode === item.id ? "text-gold-500" : "text-stone group-hover:text-ivory group-hover:brightness-110"
                      )}
                    >
                      {item.label}
                    </motion.span>
                    {!effectiveIsExpanded && (
                      <div className="absolute left-16 px-3 py-2 bg-obsidian border border-purple-500/15 text-[10px] font-mono text-ivory uppercase tracking-widest opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-300 translate-x-2 group-hover:translate-x-0 z-50 whitespace-nowrap flex flex-col gap-1 shadow-2xl">
                        <span className="text-gold-500 font-bold">{item.label}</span>
                        <span className="text-stone lowercase tracking-normal text-[9px] normal-case">{item.description}</span>
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </AnimatePresence>
            {category === 'Governance' && state.currentUser?.role === 'sovereign_creator' && (
              <motion.button
                type="button"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                onPointerEnter={prefetchBugHunterModule}
                onClick={() =>
                  setState((prev) => ({
                    ...prev,
                    bugHunter: { ...prev.bugHunter, isPanelOpen: true },
                  }))
                }
                className={cn(
                  'group relative flex w-full items-center rounded-sm border border-transparent px-3 py-2.5 transition-all duration-300 hover:border-purple-500/20 hover:bg-[#1a103c]/40',
                  state.bugHunter.isPanelOpen
                    ? 'border-gold-500/20 bg-gold-500/5 text-gold-500'
                    : 'text-stone hover:text-ivory'
                )}
              >
                <Bug
                  size={14}
                  className={cn(
                    'shrink-0 transition-all duration-300',
                    state.bugHunter.isPanelOpen
                      ? 'stroke-[2px] text-gold-500'
                      : 'stroke-[1.5px] group-hover:stroke-[2px] group-hover:text-ivory'
                  )}
                />
                <motion.span
                  initial={false}
                  animate={{ opacity: effectiveIsExpanded ? 1 : 0, x: effectiveIsExpanded ? 0 : -10 }}
                  className={cn(
                    'ml-4 text-[10px] font-medium font-mono uppercase tracking-[0.2em] transition-colors duration-300',
                    state.bugHunter.isPanelOpen
                      ? 'text-gold-500'
                      : 'text-stone group-hover:text-ivory group-hover:brightness-110'
                  )}
                >
                  System Diagnostics
                </motion.span>
                {!effectiveIsExpanded && (
                  <div className="pointer-events-none absolute left-16 z-50 flex translate-x-2 flex-col gap-1 whitespace-nowrap border border-purple-500/15 bg-obsidian px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-ivory opacity-0 shadow-2xl transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
                    <span className="font-bold text-gold-500">System Diagnostics</span>
                    <span className="text-[9px] font-normal normal-case lowercase tracking-normal text-stone">
                      Stress tests & weakness ledger
                    </span>
                  </div>
                )}
              </motion.button>
            )}
          </div>
        ))}

        {effectiveIsExpanded && (
          <div className="px-3 pt-4">
            <button 
              onPointerEnter={() => {
                if (!showAdvanced) prefetchIntelligenceRailModule();
              }}
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between p-2 text-[9px] font-mono uppercase tracking-widest text-stone/60 hover:text-ivory transition-colors duration-300 border-t border-purple-500/15"
            >
              <span>{showAdvanced ? 'Hide Advanced' : 'Show Advanced'}</span>
              <ChevronRight size={12} className={cn("transition-transform duration-500", showAdvanced ? "rotate-90" : "")} />
            </button>
          </div>
        )}
      </nav>

      <div className="p-6 border-t border-purple-500/15 space-y-4">
        <button 
          onClick={() => setCrisisMode(!isCrisisMode)}
          className={cn(
            "w-full flex items-center py-2 transition-all duration-300 group",
            isCrisisMode ? "text-crimson-900" : "text-stone hover:text-crimson-900"
          )}
        >
          <AlertTriangle size={16} className={cn("shrink-0", isCrisisMode && "animate-pulse")} />
          {effectiveIsExpanded && (
            <div className="ml-4 flex flex-col items-start">
              <span className="instrument-label">Crisis Mode</span>
              <span className="text-[8px] opacity-40 uppercase tracking-widest">{isCrisisMode ? 'Active' : 'Off'}</span>
            </div>
          )}
        </button>
        <button 
          onClick={handleSignOut}
          className="w-full flex items-center py-2 text-stone hover:text-ivory transition-colors duration-300 group"
        >
          <LogOut size={16} className={cn("shrink-0", effectiveIsExpanded ? "" : "mx-auto")} />
          {effectiveIsExpanded && <span className="ml-4 instrument-label">Sign Out</span>}
        </button>
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            "w-full flex items-center py-2 text-stone hover:text-gold-500 transition-colors duration-300 group",
            absoluteSignalMode && "opacity-50 cursor-not-allowed hover:text-stone"
          )}
          disabled={absoluteSignalMode}
        >
          {effectiveIsExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} className="mx-auto" />}
          {effectiveIsExpanded && <span className="ml-4 instrument-label">Collapse Rail</span>}
        </button>
      </div>
    </motion.aside>
    </>
  );
}
