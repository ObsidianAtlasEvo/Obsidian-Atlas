import React, { useCallback, useEffect, useState } from 'react';
import { GitBranch, Layers, Library, Target, Sparkles } from 'lucide-react';
import { atlasApiUrl, atlasHttpEnabled } from '../lib/atlasApi';
import { useAtlasAuth } from './Auth/atlasAuthContext';
import { cn } from '../lib/utils';

type TabId = 'forge' | 'graph' | 'identity' | 'revision' | 'legacy';

function useEffectiveUserId(): string {
  const session = useAtlasAuth();
  return session?.databaseUserId ?? 'local-anonymous';
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(atlasApiUrl(path), {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(err.error ?? err.message ?? res.statusText);
  }
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

export function StrategicModelingWorkbench(): React.ReactElement {
  const userId = useEffectiveUserId();
  const [tab, setTab] = useState<TabId>('forge');
  const [err, setErr] = useState<string | null>(null);
  const httpOff = !atlasHttpEnabled();

  const clearErr = () => setErr(null);

  if (httpOff) {
    return (
      <div className="h-full overflow-y-auto custom-scrollbar bg-obsidian p-8 text-stone text-sm font-serif">
        <p className="text-ivory/80 text-lg mb-2">Strategic Modeling</p>
        <p>
          Connect the Atlas API (Vite proxy to backend or <code className="text-gold/80">VITE_ATLAS_API_URL</code>) to
          use the Simulation Forge, Reality Graph, Identity→Action bridge, and Self-Revision engine.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-obsidian text-ivory overflow-hidden">
      <header className="shrink-0 border-b border-titanium/15 px-6 py-4">
        <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-gold/50 mb-1">Consequence preview &amp; structure</p>
        <h1 className="text-2xl font-serif tracking-tight text-ivory">Strategic Modeling</h1>
        <p className="text-xs text-stone/70 mt-1 max-w-2xl">
          Forge pathways before you commit. Graph tensions as relationships, not decoration. Turn identity language into protocols.
          Refine the machinery of thought — without theatrics.
        </p>
        <nav className="flex flex-wrap gap-2 mt-4" role="tablist">
          {(
            [
              ['forge', 'Simulation Forge', GitBranch],
              ['graph', 'Reality Graph', Layers],
              ['identity', 'Identity → Action', Target],
              ['revision', 'Self-Revision', Sparkles],
              ['legacy', 'Legacy Codex', Library],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id);
                clearErr();
              }}
              className={cn(
                'inline-flex items-center gap-2 px-3 py-1.5 rounded-sm text-[11px] uppercase tracking-widest border transition-colors',
                tab === id
                  ? 'border-gold/40 bg-gold/10 text-gold'
                  : 'border-titanium/20 text-stone hover:text-ivory hover:border-titanium/40'
              )}
            >
              <Icon size={14} className="opacity-70" />
              {label}
            </button>
          ))}
        </nav>
      </header>

      {err && (
        <div className="mx-6 mt-3 text-xs text-red-300/90 bg-red-950/40 border border-red-900/50 px-3 py-2 rounded-sm">
          {err}
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        {tab === 'forge' && <ForgePanel userId={userId} onError={setErr} />}
        {tab === 'graph' && <GraphPanel userId={userId} onError={setErr} />}
        {tab === 'identity' && <IdentityPanel userId={userId} onError={setErr} />}
        {tab === 'revision' && <RevisionPanel userId={userId} onError={setErr} />}
        {tab === 'legacy' && <LegacyPanel userId={userId} onError={setErr} />}
      </div>
    </div>
  );
}

function ForgePanel({
  userId,
  onError,
}: {
  userId: string;
  onError: (s: string | null) => void;
}): React.ReactElement {
  const [title, setTitle] = useState('');
  const [situation, setSituation] = useState('');
  const [tags, setTags] = useState('career, tradeoff');
  const [forges, setForges] = useState<{ id: string; title: string; status: string; updated_at: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    actionable_review: Record<string, unknown> | null;
    pathways: Record<string, unknown>[];
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await apiJson<{ forges: typeof forges }>(`/v1/cognitive/forge?userId=${encodeURIComponent(userId)}`);
    setForges(r.forges);
  }, [userId]);

  useEffect(() => {
    void load().catch((e) => onError(e instanceof Error ? e.message : String(e)));
  }, [load, onError]);

  const openDetail = async (id: string) => {
    setSelected(id);
    const r = await apiJson<{ forge: Record<string, unknown> }>(
      `/v1/cognitive/forge/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`
    );
    const f = r.forge;
    setDetail({
      actionable_review: (f.actionable_review as Record<string, unknown>) ?? null,
      pathways: (f.pathways as Record<string, unknown>[]) ?? [],
    });
  };

  const create = async () => {
    onError(null);
    setBusy(true);
    try {
      const domainTags = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const r = await apiJson<{ forgeId: string }>('/v1/cognitive/forge', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          title: title.trim(),
          situationSummary: situation.trim(),
          domainTags,
        }),
      });
      setTitle('');
      setSituation('');
      await load();
      await openDetail(r.forgeId);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!selected) return;
    onError(null);
    setBusy(true);
    try {
      await apiJson(`/v1/cognitive/forge/${encodeURIComponent(selected)}/run`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      await openDetail(selected);
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pathways = detail?.pathways ?? [];
  const review = detail?.actionable_review;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
      <section className="xl:col-span-4 space-y-4 glass-panel p-5">
        <h2 className="text-xs uppercase tracking-[0.25em] text-gold/60">New simulation</h2>
        <input
          className="w-full bg-black/40 border border-titanium/25 rounded-sm px-3 py-2 text-sm"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="w-full min-h-[140px] bg-black/40 border border-titanium/25 rounded-sm px-3 py-2 text-sm"
          placeholder="Situation: stakes, actors, constraints, what you might do…"
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
        />
        <input
          className="w-full bg-black/40 border border-titanium/25 rounded-sm px-3 py-2 text-xs font-mono"
          placeholder="Domain tags (comma-separated)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <button
          type="button"
          disabled={busy || !title.trim() || !situation.trim()}
          onClick={() => void create()}
          className="w-full py-2.5 bg-gold/15 border border-gold/30 text-gold text-xs uppercase tracking-widest rounded-sm disabled:opacity-40"
        >
          Capture &amp; open
        </button>
        <ul className="space-y-2 max-h-[220px] overflow-y-auto text-xs border-t border-titanium/15 pt-3">
          {forges.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => void openDetail(f.id).catch((e) => onError(e instanceof Error ? e.message : String(e)))}
                className={cn(
                  'text-left w-full px-2 py-1.5 rounded-sm border border-transparent',
                  selected === f.id ? 'border-gold/30 bg-gold/5' : 'hover:bg-white/5'
                )}
              >
                <span className="text-ivory block truncate">{f.title}</span>
                <span className="text-stone/60 font-mono">
                  {f.status} · {f.updated_at.slice(0, 16)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="xl:col-span-8 space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            disabled={busy || !selected}
            onClick={() => void run()}
            className="px-4 py-2 border border-titanium/30 text-xs uppercase tracking-widest rounded-sm hover:border-gold/40 disabled:opacity-40"
          >
            Run consequence model
          </button>
          {!selected && <span className="text-xs text-stone/50">Select a forge to run pathways.</span>}
        </div>

        {review && typeof review.executive_summary === 'string' && (
          <div className="glass-panel p-5 border-l-2 border-gold/40">
            <h3 className="text-[10px] uppercase tracking-widest text-stone/60 mb-2">Executive read</h3>
            <p className="text-sm text-ivory/90 leading-relaxed whitespace-pre-wrap">{review.executive_summary}</p>
            {Array.isArray(review.narrative_divergence_flags) && review.narrative_divergence_flags.length > 0 && (
              <ul className="mt-3 text-xs text-amber-200/80 list-disc pl-4">
                {(review.narrative_divergence_flags as string[]).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {pathways.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pathways.map((p, i) => (
              <article
                key={i}
                className="glass-panel p-4 border border-titanium/20 flex flex-col gap-2 min-h-[200px]"
              >
                <h3 className="text-sm font-serif text-gold/90">{String(p.label ?? `Path ${i + 1}`)}</h3>
                <p className="text-xs text-ivory/80 leading-relaxed">{String(p.path_summary ?? '')}</p>
                <div className="mt-auto pt-2 flex gap-4 text-[10px] font-mono text-stone/70 uppercase">
                  <span>Emo {Number(p.emotional_driver_score).toFixed(2)}</span>
                  <span>Strat {Number(p.strategic_driver_score).toFixed(2)}</span>
                </div>
                {p.emotional_vs_strategic_diagnosis && (
                  <p className="text-[11px] text-stone/80 border-t border-titanium/15 pt-2 italic">
                    {String(p.emotional_vs_strategic_diagnosis)}
                  </p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-stone/50 italic">No modeled pathways yet — run the forge when your situation is captured.</p>
        )}
      </section>
    </div>
  );
}

function GraphPanel({
  userId,
  onError,
}: {
  userId: string;
  onError: (s: string | null) => void;
}): React.ReactElement {
  const [nodes, setNodes] = useState<{ id: string; kind: string; label: string }[]>([]);
  const [kind, setKind] = useState('goal');
  const [label, setLabel] = useState('');
  const [src, setSrc] = useState('');
  const [dst, setDst] = useState('');
  const [relation, setRelation] = useState('conflicts_with');
  const [tensions, setTensions] = useState<Record<string, unknown>[]>([]);
  const [explain, setExplain] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [n, t] = await Promise.all([
      apiJson<{ nodes: typeof nodes }>(`/v1/cognitive/graph/nodes?userId=${encodeURIComponent(userId)}`),
      apiJson<{ edges: typeof tensions }>(`/v1/cognitive/graph/tensions?userId=${encodeURIComponent(userId)}`),
    ]);
    setNodes(n.nodes as typeof nodes);
    setTensions(t.edges);
  }, [userId]);

  useEffect(() => {
    void load().catch((e) => onError(e instanceof Error ? e.message : String(e)));
  }, [load, onError]);

  const addNode = async () => {
    onError(null);
    try {
      await apiJson('/v1/cognitive/graph/nodes', {
        method: 'POST',
        body: JSON.stringify({ userId, kind, label: label.trim() }),
      });
      setLabel('');
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const addEdge = async () => {
    onError(null);
    try {
      await apiJson('/v1/cognitive/graph/edges', {
        method: 'POST',
        body: JSON.stringify({ userId, srcNodeId: src.trim(), dstNodeId: dst.trim(), relation }),
      });
      setSrc('');
      setDst('');
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const explainNode = async (id: string) => {
    onError(null);
    try {
      const r = await apiJson<{ plainLanguage: string }>(
        `/v1/cognitive/graph/nodes/${encodeURIComponent(id)}/explain?userId=${encodeURIComponent(userId)}`
      );
      setExplain(r.plainLanguage);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-4 glass-panel p-5">
        <h2 className="text-xs uppercase tracking-[0.25em] text-gold/60">Add node</h2>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-black/40 border border-titanium/25 rounded-sm px-2 py-1.5 text-xs"
            placeholder="kind (e.g. goal, person, tension)"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          />
          <input
            className="flex-[2] bg-black/40 border border-titanium/25 rounded-sm px-2 py-1.5 text-xs"
            placeholder="label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => void addNode()}
          className="text-xs uppercase tracking-widest px-3 py-2 border border-titanium/30 rounded-sm"
        >
          Insert node
        </button>
        <h2 className="text-xs uppercase tracking-[0.25em] text-gold/60 pt-4">Add edge</h2>
        <input
          className="w-full bg-black/40 border border-titanium/25 rounded-sm px-2 py-1.5 text-xs font-mono"
          placeholder="source node id"
          value={src}
          onChange={(e) => setSrc(e.target.value)}
        />
        <input
          className="w-full bg-black/40 border border-titanium/25 rounded-sm px-2 py-1.5 text-xs font-mono"
          placeholder="target node id"
          value={dst}
          onChange={(e) => setDst(e.target.value)}
        />
        <input
          className="w-full bg-black/40 border border-titanium/25 rounded-sm px-2 py-1.5 text-xs"
          placeholder="relation"
          value={relation}
          onChange={(e) => setRelation(e.target.value)}
        />
        <button
          type="button"
          onClick={() => void addEdge()}
          className="text-xs uppercase tracking-widest px-3 py-2 border border-titanium/30 rounded-sm"
        >
          Link
        </button>
      </div>
      <div className="space-y-4">
        <div className="glass-panel p-5 max-h-[280px] overflow-y-auto">
          <h2 className="text-xs uppercase tracking-[0.25em] text-gold/60 mb-2">Nodes</h2>
          <ul className="text-xs space-y-1 font-mono text-stone/80">
            {nodes.map((n) => (
              <li key={n.id} className="flex justify-between gap-2">
                <span className="truncate">
                  [{n.kind}] {n.label}
                </span>
                <button type="button" className="shrink-0 text-gold/70 hover:text-gold" onClick={() => void explainNode(n.id)}>
                  explain
                </button>
              </li>
            ))}
          </ul>
        </div>
        {explain && (
          <pre className="glass-panel p-4 text-xs text-ivory/85 whitespace-pre-wrap font-serif border-l-2 border-teal-500/40">
            {explain}
          </pre>
        )}
        <div className="glass-panel p-5 max-h-[240px] overflow-y-auto">
          <h2 className="text-xs uppercase tracking-[0.25em] text-gold/60 mb-2">Structural tensions</h2>
          <ul className="text-[11px] space-y-2 text-stone/80">
            {tensions.slice(0, 24).map((e, i) => (
              <li key={i}>
                <span className="text-amber-200/70">{String(e.relation)}</span> · {String(e.src_label ?? e.src_node_id)} ↔{' '}
                {String(e.dst_label ?? e.dst_node_id)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function IdentityPanel({
  userId,
  onError,
}: {
  userId: string;
  onError: (s: string | null) => void;
}): React.ReactElement {
  const [asp, setAsp] = useState('');
  const [trait, setTrait] = useState('discipline');
  const [goals, setGoals] = useState<{ id: string; aspiration_statement: string; trait_archetype: string }[]>([]);
  const [gid, setGid] = useState<string | null>(null);
  const [ptitle, setPtitle] = useState('');
  const [behaviors, setBehaviors] = useState('');

  const load = useCallback(async () => {
    const r = await apiJson<{ goals: typeof goals }>(
      `/v1/cognitive/identity/goals?userId=${encodeURIComponent(userId)}&status=active`
    );
    setGoals(r.goals);
  }, [userId]);

  useEffect(() => {
    void load().catch((e) => onError(e instanceof Error ? e.message : String(e)));
  }, [load, onError]);

  const addGoal = async () => {
    onError(null);
    try {
      await apiJson('/v1/cognitive/identity/goals', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          aspirationStatement: asp.trim(),
          traitArchetype: trait.trim(),
        }),
      });
      setAsp('');
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const addProtocol = async () => {
    if (!gid) return;
    onError(null);
    try {
      const observableBehaviors = behaviors
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      await apiJson('/v1/cognitive/identity/protocols', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          identityGoalId: gid,
          title: ptitle.trim(),
          observableBehaviors,
          reviewCadence: 'Weekly Sunday 20m',
        }),
      });
      setPtitle('');
      setBehaviors('');
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="glass-panel p-5 space-y-3">
        <h2 className="text-xs uppercase tracking-[0.25em] text-gold/60">Identity goal</h2>
        <input
          className="w-full bg-black/40 border border-titanium/25 rounded-sm px-2 py-1.5 text-xs"
          placeholder="Trait archetype (e.g. decisiveness)"
          value={trait}
          onChange={(e) => setTrait(e.target.value)}
        />
        <textarea
          className="w-full min-h-[100px] bg-black/40 border border-titanium/25 rounded-sm px-2 py-1.5 text-sm"
          placeholder='Aspiration in your words: "I want to be more…"'
          value={asp}
          onChange={(e) => setAsp(e.target.value)}
        />
        <button
          type="button"
          onClick={() => void addGoal()}
          className="text-xs uppercase tracking-widest px-3 py-2 border border-titanium/30 rounded-sm"
        >
          Record goal
        </button>
        <ul className="text-xs space-y-2 pt-2 border-t border-titanium/15">
          {goals.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => setGid(g.id)}
                className={cn('text-left w-full px-2 py-1 rounded-sm', gid === g.id ? 'bg-gold/10' : 'hover:bg-white/5')}
              >
                <span className="text-gold/70">{g.trait_archetype}</span>
                <span className="block text-stone/80 truncate">{g.aspiration_statement}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="glass-panel p-5 space-y-3">
        <h2 className="text-xs uppercase tracking-[0.25em] text-gold/60">Action protocol</h2>
        <p className="text-[11px] text-stone/60">Attach observable behaviors to a selected goal — one line per behavior.</p>
        <input
          className="w-full bg-black/40 border border-titanium/25 rounded-sm px-2 py-1.5 text-xs"
          placeholder="Protocol title"
          value={ptitle}
          onChange={(e) => setPtitle(e.target.value)}
        />
        <textarea
          className="w-full min-h-[120px] bg-black/40 border border-titanium/25 rounded-sm px-2 py-1.5 text-xs font-mono"
          placeholder={'e.g.\nClose laptop by 22:30\nName the decision in one sentence before asking for advice'}
          value={behaviors}
          onChange={(e) => setBehaviors(e.target.value)}
        />
        <button
          type="button"
          disabled={!gid}
          onClick={() => void addProtocol()}
          className="text-xs uppercase tracking-widest px-3 py-2 border border-titanium/30 rounded-sm disabled:opacity-40"
        >
          Save protocol
        </button>
      </div>
    </div>
  );
}

function RevisionPanel({
  userId,
  onError,
}: {
  userId: string;
  onError: (s: string | null) => void;
}): React.ReactElement {
  const [records, setRecords] = useState<{ id: string; severity: string; category: string; recommendation_title: string }[]>(
    []
  );

  const load = useCallback(async () => {
    const r = await apiJson<{ records: typeof records }>(
      `/v1/cognitive/self-revision?userId=${encodeURIComponent(userId)}&status=open`
    );
    setRecords(r.records);
  }, [userId]);

  useEffect(() => {
    void load().catch((e) => onError(e instanceof Error ? e.message : String(e)));
  }, [load, onError]);

  const runTriggers = async () => {
    onError(null);
    try {
      await apiJson('/v1/cognitive/self-revision/run-triggers', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-3 items-center">
        <button
          type="button"
          onClick={() => void runTriggers()}
          className="text-xs uppercase tracking-widest px-4 py-2 border border-teal-500/30 text-teal-200/90 rounded-sm"
        >
          Run heuristic triggers
        </button>
        <span className="text-[11px] text-stone/55">Creates open records from unfinished business &amp; low-confidence twin traits (deduped).</span>
      </div>
      <ul className="space-y-3">
        {records.map((r) => (
          <li key={r.id} className="glass-panel p-4 border-l-2 border-titanium/30">
            <span className="text-[10px] font-mono uppercase text-stone/50">
              {r.severity} · {r.category}
            </span>
            <p className="text-sm text-ivory/90 mt-1">{r.recommendation_title}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LegacyPanel({
  userId,
  onError,
}: {
  userId: string;
  onError: (s: string | null) => void;
}): React.ReactElement {
  const [kind, setKind] = useState('principle_codex');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [note, setNote] = useState('');
  const [artifacts, setArtifacts] = useState<
    { id: string; artifact_kind: string; title: string; body: string; durability_score: number; provenance: string }[]
  >([]);
  const [probe, setProbe] = useState('');
  const [hint, setHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await apiJson<{ artifacts: typeof artifacts }>(
      `/v1/cognitive/legacy/artifacts?userId=${encodeURIComponent(userId)}`
    );
    setArtifacts(r.artifacts as typeof artifacts);
  }, [userId]);

  useEffect(() => {
    void load().catch((e) => onError(e instanceof Error ? e.message : String(e)));
  }, [load, onError]);

  const save = async () => {
    onError(null);
    try {
      await apiJson('/v1/cognitive/legacy/artifacts', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          artifactKind: kind,
          title: title.trim(),
          body: body.trim(),
          provenance: 'user_authored',
          fleetingVsPrincipleNote: note.trim(),
          reviewCadenceHint: 'Quarterly review',
        }),
      });
      setTitle('');
      setBody('');
      setNote('');
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const evalExtraction = async () => {
    onError(null);
    setHint(null);
    try {
      const r = await apiJson<{ suggest: boolean; reasons: string[] }>('/v1/cognitive/legacy/evaluate-extraction', {
        method: 'POST',
        body: JSON.stringify({ text: probe }),
      });
      setHint(r.suggest ? `Signals detected: ${r.reasons.join(', ')}` : 'No strong legacy signals in that fragment.');
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-4 glass-panel p-5">
        <h2 className="text-xs uppercase tracking-[0.25em] text-gold/60">Codify durable thought</h2>
        <p className="text-[11px] text-stone/60 leading-relaxed">
          Legacy is not chat. Capture principles, laws, and distilled lessons you want to survive the stream.
        </p>
        <input
          className="w-full bg-black/40 border border-titanium/25 rounded-sm px-2 py-1.5 text-xs font-mono"
          placeholder="artifact kind (e.g. principle_codex, personal_law, refined_lesson)"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        />
        <input
          className="w-full bg-black/40 border border-titanium/25 rounded-sm px-2 py-1.5 text-sm"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="w-full min-h-[140px] bg-black/40 border border-titanium/25 rounded-sm px-2 py-1.5 text-sm"
          placeholder="Body — tight, self-authored, revisable"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <textarea
          className="w-full min-h-[60px] bg-black/40 border border-titanium/25 rounded-sm px-2 py-1.5 text-xs"
          placeholder="Why this is principle vs fleeting vent (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          type="button"
          onClick={() => void save()}
          className="text-xs uppercase tracking-widest px-3 py-2 border border-gold/30 text-gold rounded-sm"
        >
          Commit to legacy
        </button>
        {hint && <p className="text-xs text-teal-200/90 font-serif">{hint}</p>}
        <div className="border-t border-titanium/15 pt-4 space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-stone/50">Extraction signal probe</p>
          <textarea
            className="w-full min-h-[72px] bg-black/30 border border-titanium/20 rounded-sm px-2 py-1.5 text-xs"
            placeholder="Paste a reflection; heuristic scan for principle-language (no auto-save)"
            value={probe}
            onChange={(e) => setProbe(e.target.value)}
          />
          <button
            type="button"
            onClick={() => void evalExtraction()}
            className="text-[10px] uppercase tracking-widest px-2 py-1.5 border border-titanium/30 rounded-sm"
          >
            Evaluate signals
          </button>
        </div>
      </div>
      <div className="glass-panel p-5 max-h-[560px] overflow-y-auto space-y-4">
        <h2 className="text-xs uppercase tracking-[0.25em] text-gold/60">Active artifacts</h2>
        <ul className="space-y-4">
          {artifacts.map((a) => (
            <li key={a.id} className="border-l-2 border-gold/25 pl-3">
              <span className="text-[10px] font-mono text-stone/50">
                {a.artifact_kind} · dur {a.durability_score.toFixed(2)} · {a.provenance}
              </span>
              <h3 className="text-sm font-serif text-ivory mt-1">{a.title}</h3>
              <p className="text-xs text-stone/75 mt-1 whitespace-pre-wrap">{a.body.slice(0, 1200)}{a.body.length > 1200 ? '…' : ''}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
