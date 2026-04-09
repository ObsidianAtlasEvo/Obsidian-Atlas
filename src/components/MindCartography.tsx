// Atlas-Audit: [EXEC-MODE] Verified — system→chamber links validated with tryCoerceActiveMode; navigation uses coerceActiveMode fallback.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  RefreshCw,
  Camera,
  Pin,
  Archive,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronRight,
  ExternalLink,
  Layers,
  AlertTriangle,
  GitCompare,
  Clock,
  Sparkles,
  Focus,
  Pencil,
  Eye,
} from 'lucide-react';
import type { AppState } from '../types';
import { coerceActiveMode, tryCoerceActiveMode } from '../lib/atlasWayfinding';
import { cn } from '../lib/utils';
import { atlasApiUrl, atlasHttpEnabled } from '../lib/atlasApi';
import { useAtlasAuth } from './Auth/atlasAuthContext';

interface MindCartographyProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

type MapUiMode = 'explore' | 'inspect' | 'edit' | 'time' | 'pattern' | 'tension' | 'focus' | 'compare';

type MindNodeRow = {
  id: string;
  user_id: string;
  node_kind: string;
  category: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  source_type: string;
  source_refs_json: string;
  confidence: number;
  importance: number;
  recurrence_score: number;
  emotional_weight: number | null;
  volatility: number;
  status: string;
  visibility: string;
  archived: number;
  pinned: number;
  user_confirmed: number | null;
  layout_x: number;
  layout_y: number;
  layout_ring: number;
  cluster_key: string | null;
  explainability_json: string;
  created_at: string;
  updated_at: string;
  last_reinforced_at: string | null;
  last_challenged_at: string | null;
};

type MindEdgeRow = {
  id: string;
  user_id: string;
  source_id: string;
  target_id: string;
  edge_type: string;
  weight: number;
  confidence: number;
  directional: number;
  symmetric: number;
  justification: string | null;
  explainability_json: string;
  source_refs_json: string;
  archived: number;
  created_at: string;
  updated_at: string;
};

type Insights = {
  dominantKinds: { kind: string; count: number }[];
  tensionEdges: number;
  avgImportanceByDomain: Record<string, number>;
  structuralNotes: string[];
};

const MODE_TABS: { id: MapUiMode; label: string; Icon: typeof Compass }[] = [
  { id: 'explore', label: 'Explore', Icon: Compass },
  { id: 'inspect', label: 'Inspect', Icon: Eye },
  { id: 'edit', label: 'Edit', Icon: Pencil },
  { id: 'time', label: 'Time', Icon: Clock },
  { id: 'pattern', label: 'Pattern', Icon: Sparkles },
  { id: 'tension', label: 'Tension', Icon: AlertTriangle },
  { id: 'focus', label: 'Focus', Icon: Focus },
  { id: 'compare', label: 'Compare', Icon: GitCompare },
];

function systemToMode(system: string): AppState['activeMode'] | null {
  const m: Record<string, string> = {
    constitution: 'constitution',
    epistemic_claims: 'core-systems',
    decision_ledger: 'decisions',
    unfinished_business: 'strategic-modeling',
    identity_goals: 'strategic-modeling',
    cognitive_twin: 'mirrorforge',
    friction_cartography: 'friction-cartography',
    legacy: 'strategic-modeling',
    evolution_timeline: 'mirrorforge',
    simulation_forge: 'strategic-modeling',
    claim_contradictions: 'red-team',
    self_revision: 'strategic-modeling',
  };
  const resolved = tryCoerceActiveMode(m[system]);
  return resolved ?? null;
}

function parseRefs(json: string): { system: string; id: string }[] {
  try {
    const v = JSON.parse(json) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is { system: string; id: string } => x && typeof x === 'object' && 'system' in x && 'id' in x);
  } catch {
    return [];
  }
}

function neighborSet(selectedId: string | null, edges: MindEdgeRow[]): Set<string> {
  const s = new Set<string>();
  if (!selectedId) return s;
  s.add(selectedId);
  for (const e of edges) {
    if (e.source_id === selectedId) s.add(e.target_id);
    if (e.target_id === selectedId) s.add(e.source_id);
  }
  return s;
}

export function MindCartography({ state, setState }: MindCartographyProps): React.ReactElement {
  const session = useAtlasAuth();
  const userId = session?.databaseUserId ?? 'local-anonymous';

  const [uiMode, setUiMode] = useState<MapUiMode>('explore');
  const [nodes, setNodes] = useState<MindNodeRow[]>([]);
  const [edges, setEdges] = useState<MindEdgeRow[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [filterInferred, setFilterInferred] = useState<'all' | 'inferred' | 'user'>('all');
  const [snapshots, setSnapshots] = useState<{ id: string; label: string; created_at: string; meta_json: string }[]>([]);
  const [timeSnapId, setTimeSnapId] = useState<string | null>(null);
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);
  const [compareDetail, setCompareDetail] = useState<string | null>(null);

  const [transform, setTransform] = useState({ k: 1, x: 0, y: 0 });
  const dragRef = useRef<{ px: number; py: number; sx: number; sy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [editTitle, setEditTitle] = useState('');
  const [editSubtitle, setEditSubtitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [newNodeTitle, setNewNodeTitle] = useState('');
  const [newNodeKind, setNewNodeKind] = useState('inquiry');
  const [newCluster, setNewCluster] = useState('domain:curiosity');

  const loadGraph = useCallback(
    async (withSync: boolean) => {
      if (!atlasHttpEnabled()) {
        setErr(null);
        return;
      }
      setLoading(true);
      setErr(null);
      try {
        const q = withSync ? '?userId=' + encodeURIComponent(userId) + '&sync=1' : '?userId=' + encodeURIComponent(userId);
        const res = await fetch(atlasApiUrl('/v1/cognitive/mind-map/graph') + q, { credentials: 'include' });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { nodes: MindNodeRow[]; edges: MindEdgeRow[]; insights: Insights };
        setNodes(data.nodes);
        setEdges(data.edges);
        setInsights(data.insights);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  const loadSnapshots = useCallback(async () => {
    if (!atlasHttpEnabled()) return;
    try {
      const res = await fetch(
        atlasApiUrl('/v1/cognitive/mind-map/snapshots') + '?userId=' + encodeURIComponent(userId),
        { credentials: 'include' }
      );
      if (!res.ok) return;
      const data = (await res.json()) as { snapshots: typeof snapshots };
      setSnapshots(data.snapshots);
    } catch {
      /* ignore */
    }
  }, [userId]);

  useEffect(() => {
    void loadGraph(false);
    void loadSnapshots();
  }, [loadGraph, loadSnapshots]);

  useEffect(() => {
    const n = nodes.find((x) => x.id === selectedId);
    if (n) {
      setEditTitle(n.title);
      setEditSubtitle(n.subtitle ?? '');
      setEditDesc(n.description ?? '');
    }
  }, [selectedId, nodes]);

  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => {
      if (filterInferred === 'inferred') {
        const ex = parseRefs(n.source_refs_json);
        return n.source_type === 'governance_sync' || (ex.length === 0 && n.source_type !== 'user' && n.source_type !== 'seed');
      }
      if (filterInferred === 'user') return n.source_type === 'user' || n.user_confirmed === 1;
      return true;
    });
  }, [nodes, filterInferred]);

  const displayNodes = useMemo(() => {
    if (uiMode === 'time' && timeSnapId) {
      return filteredNodes;
    }
    return filteredNodes;
  }, [filteredNodes, uiMode, timeSnapId]);

  const loadSnapshotGraph = async (snapId: string) => {
    if (!atlasHttpEnabled()) return;
    try {
      const res = await fetch(
        atlasApiUrl('/v1/cognitive/mind-map/snapshots/' + encodeURIComponent(snapId)) +
          '?userId=' +
          encodeURIComponent(userId),
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { nodes: MindNodeRow[]; edges: MindEdgeRow[] };
      setNodes(data.nodes);
      setEdges(data.edges);
      setTimeSnapId(snapId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const restoreCurrent = () => {
    setTimeSnapId(null);
    void loadGraph(false);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const dz = e.deltaY > 0 ? 0.92 : 1.08;
    setTransform((t) => ({ ...t, k: Math.min(2.8, Math.max(0.35, t.k * dz)) }));
  };

  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) ?? null;
  const nbr = useMemo(() => neighborSet(selectedId, edges), [selectedId, edges]);

  const nodeVisual = (n: MindNodeRow) => {
    const base = 5 + n.importance * 10 + (n.node_kind === 'core_self' ? 16 : n.node_kind === 'domain_anchor' ? 8 : 0);
    let opacity = 0.35 + n.confidence * 0.55;
    if (uiMode === 'focus' && selectedId && !nbr.has(n.id)) opacity *= 0.12;
    if (uiMode === 'tension') {
      if (n.node_kind === 'tension' || n.status === 'contested') opacity = Math.max(opacity, 0.95);
      else opacity *= 0.35;
    }
    if (uiMode === 'pattern') {
      if (['pattern', 'trait'].includes(n.node_kind)) opacity = Math.max(opacity, 0.95);
      else opacity *= 0.45;
    }
    let stroke = 'rgba(139, 92, 246, 0.35)';
    if (n.node_kind === 'core_self') stroke = 'rgba(212, 175, 55, 0.65)';
    if (n.pinned) stroke = 'rgba(94, 234, 212, 0.55)';
    return { r: base, opacity, stroke };
  };

  const saveEdits = async () => {
    if (!selected || !atlasHttpEnabled()) return;
    try {
      const res = await fetch(atlasApiUrl('/v1/cognitive/mind-map/nodes/' + encodeURIComponent(selected.id)), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          title: editTitle,
          subtitle: editSubtitle || null,
          description: editDesc || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      void loadGraph(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const togglePin = async () => {
    if (!selected) return;
    try {
      await fetch(atlasApiUrl('/v1/cognitive/mind-map/nodes/' + encodeURIComponent(selected.id)), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, pinned: selected.pinned ? 0 : 1 }),
      });
      void loadGraph(false);
    } catch {
      /* */
    }
  };

  const archiveNode = async () => {
    if (!selected) return;
    try {
      const res = await fetch(
        atlasApiUrl('/v1/cognitive/mind-map/nodes/' + encodeURIComponent(selected.id)) + '?userId=' + encodeURIComponent(userId),
        { method: 'DELETE', credentials: 'include' }
      );
      if (!res.ok) throw new Error(await res.text());
      setSelectedId(null);
      void loadGraph(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const createSnapshot = async () => {
    if (!atlasHttpEnabled()) return;
    try {
      const res = await fetch(atlasApiUrl('/v1/cognitive/mind-map/snapshots'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, label: 'Manual snapshot' }),
      });
      if (!res.ok) throw new Error(await res.text());
      void loadSnapshots();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const addUserNode = async () => {
    if (!newNodeTitle.trim() || !atlasHttpEnabled()) return;
    try {
      const res = await fetch(atlasApiUrl('/v1/cognitive/mind-map/nodes'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          nodeKind: newNodeKind,
          category: newCluster.replace('domain:', '') || 'focus',
          title: newNodeTitle.trim(),
          clusterKey: newCluster,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewNodeTitle('');
      void loadGraph(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const runCompare = async () => {
    if (!compareA || !compareB || !atlasHttpEnabled()) return;
    try {
      const [ra, rb] = await Promise.all([
        fetch(
          atlasApiUrl('/v1/cognitive/mind-map/snapshots/' + encodeURIComponent(compareA)) +
            '?userId=' +
            encodeURIComponent(userId),
          { credentials: 'include' }
        ),
        fetch(
          atlasApiUrl('/v1/cognitive/mind-map/snapshots/' + encodeURIComponent(compareB)) +
            '?userId=' +
            encodeURIComponent(userId),
          { credentials: 'include' }
        ),
      ]);
      const a = (await ra.json()) as { meta?: unknown; nodes?: unknown[] };
      const b = (await rb.json()) as { meta?: unknown; nodes?: unknown[] };
      const ma = JSON.stringify(a.meta, null, 2);
      const mb = JSON.stringify(b.meta, null, 2);
      setCompareDetail(`A nodes: ${a.nodes?.length ?? 0}\nB nodes: ${b.nodes?.length ?? 0}\n\nMeta A:\n${ma}\n\nMeta B:\n${mb}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const openSystemLink = (system: string, id: string) => {
    const mode = systemToMode(system);
    if (mode) {
      setState((prev) => ({
        ...prev,
        activeMode: coerceActiveMode(mode, prev.activeMode),
      }));
    }
  };

  return (
    <div className="flex flex-col h-full bg-obsidian text-ivory relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-[0.04] bg-[radial-gradient(ellipse_at_30%_20%,rgba(88,28,135,0.4),transparent_55%),radial-gradient(ellipse_at_70%_80%,rgba(20,184,166,0.15),transparent_50%)]" />

      <header className="relative z-10 flex flex-col gap-3 border-b border-[color:var(--border-subtle)] px-[var(--space-6)] py-[var(--space-4)] bg-obsidian/85 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--atlas-surface-panel)]">
              <Compass className="w-5 h-5 text-gold/80" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight text-ivory/95 truncate">User mind map</h1>
              <p className="text-[11px] text-stone/55 uppercase tracking-[0.2em]">Living cognitive cartography</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadGraph(false)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] text-xs text-stone/80 hover:text-ivory hover:border-[color:var(--border-emphasis)] transition-colors duration-[var(--atlas-motion-standard)]"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void loadGraph(true)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] border border-gold/25 text-xs text-gold/90 hover:bg-gold/10 transition-colors"
            >
              <Layers size={14} />
              Sync from Atlas
            </button>
            <button
              type="button"
              onClick={() => void createSnapshot()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] border border-teal-500/25 text-xs text-teal-200/90 hover:bg-teal-500/10 transition-colors"
            >
              <Camera size={14} />
              Snapshot
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {MODE_TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setUiMode(id)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)] text-[11px] font-medium uppercase tracking-wider transition-colors duration-[var(--atlas-motion-fast)]',
                uiMode === id
                  ? 'bg-gold/15 text-gold border border-gold/30'
                  : 'text-stone/55 border border-transparent hover:text-stone/85 hover:bg-white/[0.03]'
              )}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-stone/50">
          <span>Show:</span>
          {(['all', 'inferred', 'user'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilterInferred(f)}
              className={cn(
                'px-2 py-1 rounded-[var(--radius-sm)]',
                filterInferred === f ? 'bg-white/10 text-ivory' : 'hover:text-stone/75'
              )}
            >
              {f === 'all' ? 'Everything' : f === 'inferred' ? 'Governance-linked' : 'User-affirmed'}
            </button>
          ))}
          <span className="text-stone/35">|</span>
          <button
            type="button"
            onClick={() => setTransform({ k: 1, x: 0, y: 0 })}
            className="inline-flex items-center gap-1 text-stone/55 hover:text-ivory"
          >
            <Maximize2 size={12} />
            Reset view
          </button>
        </div>

        {timeSnapId && (
          <div className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-100/90">
            <span>Viewing frozen snapshot — not live graph.</span>
            <button type="button" onClick={restoreCurrent} className="text-gold hover:underline">
              Return to now
            </button>
          </div>
        )}

        {err && <p className="text-xs text-red-300/90 font-mono">{err}</p>}
      </header>

      <div className="flex-1 flex min-h-0 relative z-[1]">
        <div
          className="flex-1 relative cursor-grab active:cursor-grabbing overflow-hidden"
          onWheel={onWheel}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            dragRef.current = { px: e.clientX, py: e.clientY, sx: transform.x, sy: transform.y };
          }}
          onMouseMove={(e) => {
            const d = dragRef.current;
            if (!d) return;
            setTransform((t) => ({
              ...t,
              x: d.sx + (e.clientX - d.px) / t.k,
              y: d.sy + (e.clientY - d.py) / t.k,
            }));
          }}
          onMouseUp={() => {
            dragRef.current = null;
          }}
          onMouseLeave={() => {
            dragRef.current = null;
          }}
        >
          {!atlasHttpEnabled() ? (
            <div className="h-full flex items-center justify-center p-8 text-center text-stone/60 text-sm max-w-md mx-auto">
              Connect the Atlas API to load your living mind map. The map seeds a core self plus eight cognitive sectors, then
              grows from constitution, decisions, unfinished business, twin, friction, legacy, and evolution data.
            </div>
          ) : (
            <svg
              ref={svgRef}
              className="w-full h-full touch-none select-none"
              viewBox="-420 -320 840 640"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <filter id="mmSoft" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="1.2" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
                {edges.map((ed) => {
                  const s = displayNodes.find((n) => n.id === ed.source_id);
                  const t = displayNodes.find((n) => n.id === ed.target_id);
                  if (!s || !t) return null;
                  const isTen = ed.edge_type === 'contradicts';
                  const dim =
                    uiMode === 'focus' && selectedId
                      ? !nbr.has(ed.source_id) && !nbr.has(ed.target_id)
                      : uiMode === 'tension'
                        ? !isTen
                        : uiMode === 'pattern'
                          ? ed.edge_type !== 'informs'
                          : false;
                  return (
                    <line
                      key={ed.id}
                      x1={s.layout_x}
                      y1={s.layout_y}
                      x2={t.layout_x}
                      y2={t.layout_y}
                      stroke={
                        isTen ? 'rgba(248, 113, 113, 0.55)' : 'rgba(148, 163, 184, 0.14)'
                      }
                      strokeWidth={isTen ? 1.2 : 0.55 + ed.weight * 0.5}
                      strokeDasharray={isTen ? '5 4' : undefined}
                      opacity={dim ? 0.06 : 0.2 + ed.confidence * 0.45}
                      className={uiMode === 'inspect' || uiMode === 'edit' ? 'cursor-pointer' : ''}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEdgeId(ed.id);
                        setSelectedId(null);
                      }}
                    />
                  );
                })}

                {displayNodes.map((n) => {
                  const { r, opacity, stroke } = nodeVisual(n);
                  return (
                    <g
                      key={n.id}
                      transform={`translate(${n.layout_x} ${n.layout_y})`}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(n.id);
                        setSelectedEdgeId(null);
                      }}
                    >
                      <circle
                        r={r + 6}
                        fill="rgba(15,10,30,0.25)"
                        opacity={opacity * 0.4}
                        className="pointer-events-none"
                      />
                      <circle
                        r={r}
                        fill="rgba(10,8,18,0.92)"
                        stroke={stroke}
                        strokeWidth={n.node_kind === 'core_self' ? 1.8 : 1}
                        opacity={opacity}
                        filter="url(#mmSoft)"
                      />
                      <text
                        x={r + 8}
                        y={4}
                        fill="rgba(231, 229, 228, 0.72)"
                        fontSize={n.node_kind === 'domain_anchor' ? 10 : 9}
                        fontFamily="ui-sans-serif, system-ui, sans-serif"
                        className="pointer-events-none"
                        style={{ letterSpacing: n.node_kind === 'domain_anchor' ? '0.14em' : '0.06em' }}
                      >
                        {n.title.length > 38 ? n.title.slice(0, 36) + '…' : n.title}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          )}

          <div className="absolute bottom-4 left-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setTransform((t) => ({ ...t, k: Math.min(2.8, t.k * 1.15) }))}
              className="p-2 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-obsidian/80 text-stone/70 hover:text-ivory"
            >
              <ZoomIn size={16} />
            </button>
            <button
              type="button"
              onClick={() => setTransform((t) => ({ ...t, k: Math.max(0.35, t.k / 1.15) }))}
              className="p-2 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-obsidian/80 text-stone/70 hover:text-ivory"
            >
              <ZoomOut size={16} />
            </button>
          </div>
        </div>

        <aside className="w-full max-w-[min(100%,var(--atlas-context-rail))] border-l border-[color:var(--border-subtle)] bg-obsidian/92 backdrop-blur-md flex flex-col overflow-hidden shrink-0">
          <div className="p-[var(--space-5)] border-b border-[color:var(--border-subtle)] space-y-3 max-h-[42vh] overflow-y-auto custom-scrollbar">
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-stone/45 font-semibold">Structural intelligence</h2>
            {insights ? (
              <ul className="space-y-2 text-xs text-stone/75 leading-relaxed">
                {insights.dominantKinds.slice(0, 4).map((d) => (
                  <li key={d.kind} className="flex justify-between gap-2">
                    <span className="text-stone/55">{d.kind.replace(/_/g, ' ')}</span>
                    <span className="text-ivory/80 tabular-nums">{d.count}</span>
                  </li>
                ))}
                {insights.structuralNotes.map((note, i) => (
                  <li key={i} className="text-teal-200/70 flex gap-2">
                    <ChevronRight size={14} className="shrink-0 mt-0.5 opacity-50" />
                    {note}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-stone/50">Load the graph to see dominant kinds and structural notes.</p>
            )}
          </div>

          {uiMode === 'time' && (
            <div className="p-[var(--space-4)] border-b border-[color:var(--border-subtle)] space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-stone/45">Snapshots</p>
              <select
                className="w-full bg-obsidian border border-[color:var(--border-default)] rounded-[var(--radius-md)] px-3 py-2 text-xs text-ivory"
                value={timeSnapId ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) restoreCurrent();
                  else void loadSnapshotGraph(v);
                }}
              >
                <option value="">Current (live)</option>
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label || 'Snapshot'} — {new Date(s.created_at).toLocaleString()}
                  </option>
                ))}
              </select>
            </div>
          )}

          {uiMode === 'compare' && (
            <div className="p-[var(--space-4)] border-b border-[color:var(--border-subtle)] space-y-2 text-xs">
              <p className="text-[10px] uppercase tracking-widest text-stone/45">Compare snapshots (meta)</p>
              <select
                className="w-full bg-obsidian border border-[color:var(--border-default)] rounded-[var(--radius-md)] px-2 py-1.5 text-xs"
                value={compareA ?? ''}
                onChange={(e) => setCompareA(e.target.value || null)}
              >
                <option value="">Snapshot A…</option>
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label || s.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <select
                className="w-full bg-obsidian border border-[color:var(--border-default)] rounded-[var(--radius-md)] px-2 py-1.5 text-xs"
                value={compareB ?? ''}
                onChange={(e) => setCompareB(e.target.value || null)}
              >
                <option value="">Snapshot B…</option>
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label || s.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void runCompare()}
                className="w-full py-2 rounded-[var(--radius-md)] border border-gold/25 text-gold/90 text-[11px] uppercase tracking-wider hover:bg-gold/10"
              >
                Compare
              </button>
              {compareDetail && (
                <pre className="text-[10px] text-stone/60 whitespace-pre-wrap max-h-40 overflow-y-auto">{compareDetail}</pre>
              )}
            </div>
          )}

          {(uiMode === 'edit' || newNodeTitle) && (
            <div className="p-[var(--space-4)] border-b border-[color:var(--border-subtle)] space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-stone/45">Add node</p>
              <input
                value={newNodeTitle}
                onChange={(e) => setNewNodeTitle(e.target.value)}
                placeholder="Title"
                className="w-full bg-obsidian border border-[color:var(--border-default)] rounded-[var(--radius-md)] px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <select
                  value={newNodeKind}
                  onChange={(e) => setNewNodeKind(e.target.value)}
                  className="flex-1 bg-obsidian border border-[color:var(--border-default)] rounded-[var(--radius-md)] px-2 py-1.5 text-xs"
                >
                  <option value="inquiry">Inquiry</option>
                  <option value="goal">Goal</option>
                  <option value="tension">Tension</option>
                  <option value="memory">Memory</option>
                  <option value="project">Project</option>
                </select>
                <select
                  value={newCluster}
                  onChange={(e) => setNewCluster(e.target.value)}
                  className="flex-1 bg-obsidian border border-[color:var(--border-default)] rounded-[var(--radius-md)] px-2 py-1.5 text-xs"
                >
                  <option value="domain:identity">Identity</option>
                  <option value="domain:values">Values</option>
                  <option value="domain:goals">Goals</option>
                  <option value="domain:focus">Focus</option>
                  <option value="domain:curiosity">Curiosity</option>
                  <option value="domain:tensions">Tensions</option>
                  <option value="domain:memory">Memory</option>
                  <option value="domain:patterns">Patterns</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => void addUserNode()}
                className="w-full py-2 rounded-[var(--radius-md)] bg-teal-500/15 border border-teal-500/30 text-teal-100 text-xs"
              >
                Create user node
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto custom-scrollbar p-[var(--space-5)] space-y-4">
            {selectedEdge ? (
              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-gold/60">Edge</p>
                <p className="text-sm font-medium text-ivory">{selectedEdge.edge_type.replace(/_/g, ' ')}</p>
                {selectedEdge.justification && (
                  <p className="text-xs text-stone/65 leading-relaxed">{selectedEdge.justification}</p>
                )}
                <p className="text-[10px] text-stone/45">
                  weight {selectedEdge.weight.toFixed(2)} · confidence {selectedEdge.confidence.toFixed(2)}
                </p>
              </div>
            ) : selected ? (
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-gold/60 mb-1">{selected.node_kind.replace(/_/g, ' ')}</p>
                  <h3 className="text-lg font-semibold text-ivory leading-snug">{selected.title}</h3>
                  {selected.subtitle && <p className="text-xs text-stone/55 mt-1">{selected.subtitle}</p>}
                </div>

                <p className="text-xs text-stone/70 leading-relaxed">{selected.description}</p>

                <dl className="grid grid-cols-2 gap-2 text-[11px] text-stone/55">
                  <dt>Source</dt>
                  <dd className="text-ivory/80">{selected.source_type}</dd>
                  <dt>Confidence</dt>
                  <dd className="text-ivory/80">{selected.confidence.toFixed(2)}</dd>
                  <dt>Importance</dt>
                  <dd className="text-ivory/80">{selected.importance.toFixed(2)}</dd>
                  <dt>Recurrence</dt>
                  <dd className="text-ivory/80">{selected.recurrence_score.toFixed(2)}</dd>
                  <dt>Status</dt>
                  <dd className="text-ivory/80">{selected.status}</dd>
                </dl>

                <div>
                  <p className="text-[10px] uppercase tracking-widest text-stone/45 mb-2">Why this exists</p>
                  <pre className="text-[10px] text-stone/60 whitespace-pre-wrap font-mono bg-black/30 rounded-[var(--radius-md)] p-3 border border-[color:var(--border-subtle)] max-h-40 overflow-y-auto">
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(selected.explainability_json), null, 2);
                      } catch {
                        return selected.explainability_json;
                      }
                    })()}
                  </pre>
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-widest text-stone/45 mb-2">Linked systems</p>
                  <ul className="space-y-1.5">
                    {parseRefs(selected.source_refs_json).map((r) => (
                      <li key={r.system + r.id}>
                        <button
                          type="button"
                          onClick={() => openSystemLink(r.system, r.id)}
                          className="inline-flex items-center gap-2 text-xs text-teal-200/85 hover:text-teal-100"
                        >
                          <ExternalLink size={12} />
                          {r.system} · {r.id.slice(0, 12)}…
                        </button>
                      </li>
                    ))}
                    {parseRefs(selected.source_refs_json).length === 0 && (
                      <li className="text-xs text-stone/50">Seed or structural node — no external artifact id.</li>
                    )}
                  </ul>
                </div>

                {(uiMode === 'edit' || selected.source_type !== 'seed') && (
                  <div className="space-y-3 pt-2 border-t border-[color:var(--border-subtle)]">
                    <p className="text-[10px] uppercase tracking-widest text-stone/45">Edit</p>
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full bg-obsidian border border-[color:var(--border-default)] rounded-[var(--radius-md)] px-3 py-2 text-sm"
                    />
                    <input
                      value={editSubtitle}
                      onChange={(e) => setEditSubtitle(e.target.value)}
                      placeholder="Subtitle"
                      className="w-full bg-obsidian border border-[color:var(--border-default)] rounded-[var(--radius-md)] px-3 py-2 text-xs"
                    />
                    <textarea
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      rows={3}
                      className="w-full bg-obsidian border border-[color:var(--border-default)] rounded-[var(--radius-md)] px-3 py-2 text-xs"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void saveEdits()}
                        className="px-3 py-2 rounded-[var(--radius-md)] bg-gold/15 border border-gold/30 text-xs text-gold"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => void togglePin()}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-[var(--radius-md)] border border-[color:var(--border-default)] text-xs text-stone/80"
                      >
                        <Pin size={12} />
                        {selected.pinned ? 'Unpin' : 'Pin layout'}
                      </button>
                      {selected.source_type !== 'seed' && (
                        <button
                          type="button"
                          onClick={() => void archiveNode()}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-[var(--radius-md)] border border-red-500/25 text-xs text-red-300/90"
                        >
                          <Archive size={12} />
                          Archive
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-stone/50 leading-relaxed">
                Select a node or edge. Domains are intentional scaffolding; governance sync materializes clauses, decisions,
                loops, twin traits, friction, legacy, and evolution as typed nodes with explainable provenance.
              </p>
            )}
          </div>
        </aside>
      </div>

      <footer className="relative z-10 h-11 flex items-center justify-between px-[var(--space-6)] border-t border-[color:var(--border-subtle)] text-[10px] text-stone/45 uppercase tracking-wider">
        <span>
          Nodes {displayNodes.length} · Edges {edges.length}
          {insights ? ` · Tension bridges ${insights.tensionEdges}` : ''}
        </span>
        <span className="hidden sm:inline">
          Pan drag · wheel zoom · continuity epochs in app: {state.mindHistory.length}
        </span>
      </footer>
    </div>
  );
}
