// Atlas-Audit: [EXEC-MODE] Verified — Zone cards + dialogue CTA use coerceActiveMode(..., prev.activeMode).
import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Brain,
  Compass,
  GitBranch,
  Library,
  MessageSquare,
  Scale,
  ScrollText,
  Shield,
  Sparkles,
  Target,
  History,
  Radar,
  Orbit,
  Anchor,
} from 'lucide-react';
import { atlasApiUrl, atlasHttpEnabled } from '../lib/atlasApi';
import { useAtlasAuth } from './Auth/atlasAuthContext';
import type { AppState } from '../types';
import { coerceActiveMode } from '../lib/atlasWayfinding';
import { cn } from '../lib/utils';

type Overview = {
  constitutionalClausesActive: number;
  epistemicClaimsActive: number;
  evidenceItems: number;
  openContradictions: number;
  decisionsTotal: number;
  decisionsDraft: number;
  evolutionEventsRecorded: number;
  cognitiveTwinTraitsActive: number;
  adversarialChamberSessions: number;
  unfinishedBusinessOpen: number;
  simulationForges: number;
  realityGraphNodes: number;
  realityGraphEdges: number;
  identityGoalsActive: number;
  selfRevisionOpen: number;
  legacyArtifactsActive: number;
  distortionObservationsActive: number;
  chatTracesStored: number;
};

const ZONES: {
  mode: AppState['activeMode'];
  label: string;
  sub: string;
  icon: typeof Scale;
}[] = [
  { mode: 'constitution', label: 'Constitutional Core', sub: 'Clauses & doctrine spine', icon: Scale },
  { mode: 'core-systems', label: 'Truth & Evidence', sub: 'Claims, ledger, memory vault', icon: Shield },
  { mode: 'decisions', label: 'Decisions', sub: 'History, options, reviews', icon: Target },
  { mode: 'mirrorforge', label: 'Evolution & Twin', sub: 'Timeline, cognitive model', icon: Brain },
  { mode: 'red-team', label: 'Truth Pressure', sub: 'Challenge posture & chamber', icon: Activity },
  {
    mode: 'strategic-modeling',
    label: 'Strategic substrate',
    sub: 'Simulation forge, graph, identity protocols, legacy codex, self-revision',
    icon: GitBranch,
  },
  {
    mode: 'trajectory-observatory',
    label: 'Trajectory observatory',
    sub: 'Directional momentum, drift, and “if unchanged” projections',
    icon: Radar,
  },
  {
    mode: 'friction-cartography',
    label: 'Friction cartography',
    sub: 'Resistance map — root drag, clusters, smallest release points',
    icon: Orbit,
  },
  {
    mode: 'threshold-forge',
    label: 'Threshold protocol forge',
    sub: 'Pre-authored protocols for destabilized states',
    icon: Anchor,
  },
  { mode: 'today-in-atlas', label: 'Command dialogue', sub: 'Inquiry entry — not the whole product', icon: MessageSquare },
  { mode: 'journal', label: 'Continuity notes', sub: 'Private reflection room', icon: ScrollText },
  { mode: 'doctrine', label: 'Local doctrine hall', sub: 'Principles surface (app state)', icon: Library },
];

export function SovereignAtrium({
  setState,
}: {
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}): React.ReactElement {
  const session = useAtlasAuth();
  const userId = session?.databaseUserId ?? 'local-anonymous';
  const [overview, setOverview] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!atlasHttpEnabled()) {
      setErr(null);
      setOverview(null);
      return;
    }
    try {
      const res = await fetch(`${atlasApiUrl('/v1/cognitive/sovereign-overview')}?userId=${encodeURIComponent(userId)}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      setOverview((await res.json()) as Overview);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pulse = overview
    ? [
        { k: 'Constitution', v: overview.constitutionalClausesActive, hint: 'active clauses' },
        { k: 'Claims', v: overview.epistemicClaimsActive, hint: 'structured' },
        { k: 'Tensions', v: overview.openContradictions, hint: 'open contradictions' },
        { k: 'Unfinished', v: overview.unfinishedBusinessOpen, hint: 'open loops' },
        { k: 'Legacy', v: overview.legacyArtifactsActive, hint: 'codified' },
      ]
    : [];

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-obsidian text-ivory">
      <div className="max-w-6xl mx-auto px-8 py-10 space-y-10">
        <header className="space-y-3 border-b border-gold/10 pb-8">
          <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-gold/50">Sovereign command environment</p>
          <h1 className="text-3xl md:text-4xl font-serif tracking-tight">Obsidian Atlas</h1>
          <p className="text-sm text-stone/80 max-w-2xl leading-relaxed">
            You are not inside a chatbot. You are inside a private system for cognition, evidence, decisions, continuity,
            and self-governance. Dialogue is one entry point; the substrate is structural.
          </p>
          {err && <p className="text-xs text-amber-200/80 font-mono">Overview API: {err}</p>}
        </header>

        {pulse.length > 0 && (
          <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {pulse.map((p) => (
              <div
                key={p.k}
                className="glass-panel px-4 py-3 border border-titanium/15 rounded-sm bg-black/20"
              >
                <p className="text-[9px] uppercase tracking-widest text-stone/45">{p.k}</p>
                <p className="text-2xl font-serif text-gold/90 tabular-nums">{p.v}</p>
                <p className="text-[9px] text-stone/50 mt-0.5">{p.hint}</p>
              </div>
            ))}
          </section>
        )}

        <section>
          <h2 className="text-xs uppercase tracking-[0.3em] text-stone/50 mb-4 flex items-center gap-2">
            <Compass size={14} className="text-gold/60" />
            Systems &amp; artifacts
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ZONES.map((z, i) => (
              <button
                key={`${z.mode}-${z.label}-${i}`}
                type="button"
                onClick={() =>
                  setState((prev) => ({
                    ...prev,
                    activeMode: coerceActiveMode(z.mode, prev.activeMode),
                  }))
                }
                className={cn(
                  'text-left glass-panel p-5 rounded-sm border border-titanium/15',
                  'hover:border-gold/35 hover:bg-gold/[0.03] transition-all group'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <z.icon size={18} className="text-gold/50 mt-0.5 shrink-0" />
                  <ArrowRight
                    size={16}
                    className="text-stone/30 group-hover:text-gold/60 transition-colors shrink-0"
                  />
                </div>
                <h3 className="text-sm font-serif text-ivory mt-3">{z.label}</h3>
                <p className="text-[11px] text-stone/60 mt-1 leading-relaxed">{z.sub}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="glass-panel p-6 border-l-2 border-teal-500/30 rounded-sm">
          <div className="flex items-center gap-2 text-teal-200/80 mb-2">
            <History size={16} />
            <span className="text-xs uppercase tracking-widest">Separation of concerns</span>
          </div>
          <p className="text-sm text-stone/75 leading-relaxed">
            Structured cognition lives in SQLite governance tables (constitution, claims, evidence, decisions, evolution,
            twin, chamber, unfinished, forge, graph, identity protocols, self-revision, legacy). Chat traces are stored
            separately for continuity — they do not replace inspectable artifacts.
          </p>
        </section>

        <section className="flex flex-wrap gap-3 pb-12">
          <button
            type="button"
            onClick={() =>
              setState((prev) => ({
                ...prev,
                activeMode: coerceActiveMode('resonance', prev.activeMode),
              }))
            }
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-sm border border-gold/25 text-xs uppercase tracking-widest text-gold/90 hover:bg-gold/10"
          >
            <Sparkles size={14} />
            Open dialogue layer
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-sm border border-titanium/25 text-xs uppercase tracking-widest text-stone/70 hover:text-ivory"
          >
            Refresh overview
          </button>
        </section>
      </div>
    </div>
  );
}
