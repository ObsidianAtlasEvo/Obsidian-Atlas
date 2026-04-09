// Atlas-Audit: [EXEC-MODE] Verified — onNavigate payloads pass coerceActiveMode(route, 'capabilities') so invalid slugs keep the catalog surface.
// Atlas-Audit: [PERF-P5] Verified — Capability cards and footer quick links prefetch chamber chunks on pointer enter before onNavigate.
// Atlas-Audit: [EXEC-CAP] Verified — Capability cards route to real activeMode chambers; footer removes fake metrics; catalog is an entry surface not a decorative brochure.
import React from 'react';
import { motion } from 'motion/react';
import {
  Fingerprint,
  Globe,
  Sparkles,
  Network,
  Waves,
  ScrollText,
  Compass,
  ChevronRight,
  Info,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { coerceActiveMode } from '../lib/atlasWayfinding';
import type { AppState } from '../types';
import { prefetchChamberForMode } from './lazyChamberModules';

export interface CapabilitiesViewProps {
  onNavigate: (mode: AppState['activeMode']) => void;
}

const CAPABILITIES: {
  id: string;
  title: string;
  description: string;
  icon: typeof Fingerprint;
  color: string;
  route: AppState['activeMode'];
  features: string[];
}[] = [
  {
    id: 'mirrorforge',
    title: 'Mirrorforge',
    description:
      'Cognitive mirror and pattern ledger. Reflection runs through the inference layer when the backend is available.',
    icon: Fingerprint,
    color: 'text-gold',
    route: 'mirrorforge',
    features: ['Live reflection', 'Pattern ledger', 'Divergence view'],
  },
  {
    id: 'reality-engine',
    title: 'Reality Engine',
    description:
      'Systems and consequence views live under Core Systems (Reality Engine tab), not a separate route.',
    icon: Globe,
    color: 'text-blue-400',
    route: 'core-systems',
    features: ['Reality Engine', 'Truth ledger', 'Evolution & memory tabs'],
  },
  {
    id: 'chrysalis',
    title: 'Chrysalis',
    description: 'Mutation and experiment surface for Atlas refinement — backed by governance-aware requests.',
    icon: Sparkles,
    color: 'text-purple-400',
    route: 'chrysalis',
    features: ['Mutations', 'Experiments', 'Weakness visibility'],
  },
  {
    id: 'atlas-graph',
    title: 'Atlas Graph',
    description:
      'Force-directed graph: uses Mind Cartography API when HTTP is enabled, otherwise a labeled scaffold dataset.',
    icon: Network,
    color: 'text-emerald-400',
    route: 'atlas',
    features: ['Live map (API)', 'Scaffold fallback', 'Node detail panel'],
  },
  {
    id: 'leviathan',
    title: 'Leviathan',
    description: 'Deep exploratory chamber for extended, low-distraction inquiry.',
    icon: Waves,
    color: 'text-cyan-400',
    route: 'leviathan',
    features: ['Deep context', 'Extended sessions'],
  },
  {
    id: 'doctrine',
    title: 'Doctrine',
    description: 'Principles stored in your user model; persisted with workspace when signed in to Firestore.',
    icon: ScrollText,
    color: 'text-amber-400',
    route: 'doctrine',
    features: ['Principles', 'Linked to directives & pulse'],
  },
  {
    id: 'mind-cartography',
    title: 'Mind Cartography',
    description: 'API-backed nodes and edges — canonical cognitive map; pair with Atlas Graph for the same substrate.',
    icon: Compass,
    color: 'text-signal-amber',
    route: 'mind-cartography',
    features: ['CRUD nodes', 'Snapshots', 'Compare over time'],
  },
];

export function CapabilitiesView({ onNavigate }: CapabilitiesViewProps) {
  return (
    <div className="p-6 md:p-12 space-y-12 md:space-y-16 max-w-6xl mx-auto min-h-[100dvh] pb-32">
      <header className="space-y-4 md:space-y-6 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 text-gold"
        >
          <Info size={20} />
          <span className="instrument-label uppercase tracking-[0.3em]">Capabilities Directory</span>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl md:text-6xl font-serif text-ivory tracking-tight leading-tight"
        >
          Chambers you can <span className="italic">open</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-xl text-stone font-sans leading-relaxed opacity-70"
        >
          Each card jumps to a real route in this app. This is not a marketing site: it is a wayfinding layer for
          the sovereign estate. Use the sidebar for the full list, including governance and advanced chambers.
        </motion.p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {CAPABILITIES.map((cap, index) => (
          <motion.button
            key={cap.id}
            type="button"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 + index * 0.06 }}
            onPointerEnter={() => prefetchChamberForMode(cap.route)}
            onClick={() => onNavigate(coerceActiveMode(cap.route, 'capabilities'))}
            className="glass-panel p-10 border-titanium/20 hover:border-gold/40 transition-all duration-300 group relative overflow-hidden text-left w-full cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-gold/50"
          >
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
              <cap.icon size={120} />
            </div>

            <div className="space-y-6 relative z-10">
              <div className={cn('p-3 rounded-sm bg-titanium/10 w-fit', cap.color)}>
                <cap.icon size={24} />
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-serif text-ivory group-hover:text-gold transition-colors">{cap.title}</h3>
                <p className="text-sm text-stone leading-relaxed opacity-80">{cap.description}</p>
              </div>

              <div className="pt-6 border-t border-titanium/10">
                <h4 className="text-[10px] font-mono uppercase tracking-widest text-stone mb-4">In this chamber</h4>
                <div className="flex flex-wrap gap-2">
                  {cap.features.map((feature) => (
                    <span
                      key={feature}
                      className="px-3 py-1 bg-titanium/5 border border-titanium/20 rounded-full text-[10px] text-stone/70 font-sans"
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-gold pt-2">
                Open chamber <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      <footer className="pt-16 border-t border-titanium/10 space-y-6 text-center md:text-left">
        <p className="text-stone font-serif italic opacity-50 max-w-2xl mx-auto md:mx-0">
          Metrics like “reliability scores” are not shown here unless they are computed from your live state.
        </p>
        <p className="text-[11px] text-stone/60 font-mono uppercase tracking-widest max-w-2xl mx-auto md:mx-0">
          Quick links: use sidebar · Home for inquiry · Pulse for orientation · Directives for command posture
        </p>
        <div className="flex flex-wrap justify-center md:justify-start gap-3">
          {(
            [
              ['Home', 'today-in-atlas' as const],
              ['Pulse', 'pulse' as const],
              ['Directives', 'directive-center' as const],
              ['Constitution', 'constitution' as const],
            ] as const
          ).map(([label, mode]) => (
            <button
              key={label}
              type="button"
              onPointerEnter={() => prefetchChamberForMode(mode)}
              onClick={() => onNavigate(coerceActiveMode(mode, 'capabilities'))}
              className="px-4 py-2 text-[10px] uppercase tracking-widest border border-titanium/25 text-stone hover:text-ivory hover:border-gold/30 rounded-sm transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
}
