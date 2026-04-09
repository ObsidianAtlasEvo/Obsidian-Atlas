import React, { useCallback, useEffect, useState } from 'react';
import { Anchor, Orbit, Radar, RefreshCw } from 'lucide-react';
import { atlasApiUrl, atlasHttpEnabled } from '../../lib/atlasApi';
import { useAtlasAuth } from '../Auth/atlasAuthContext';
import { AtlasPanel, AtlasPanelHeader } from '../ui/AtlasPanel';
import { cn } from '../../lib/utils';

function useUserId(): string {
  return useAtlasAuth()?.databaseUserId ?? 'local-anonymous';
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(atlasApiUrl(path), {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? res.statusText);
  }
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

type TrajectoryDomain = {
  domain: string;
  label: string;
  classification: string;
  momentum: number;
  markers: string[];
  explanation: string;
};

export function TrajectoryObservatoryView(): React.ReactElement {
  const userId = useUserId();
  const [live, setLive] = useState<{
    overall_classification: string;
    confidence: number;
    summary_text: string;
    domains: TrajectoryDomain[];
    contributing_factors: string[];
    drift_warnings: string[];
    projections: { if_unchanged: string; if_corrected: string };
    correction_leverage: string[];
    explanation_text: string;
  } | null>(null);
  const [snapshots, setSnapshots] = useState<{ id: string; summary_text: string; created_at: string; confidence: number }[]>(
    []
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(
    async (persist: boolean) => {
      if (!atlasHttpEnabled()) return;
      setBusy(true);
      setErr(null);
      try {
        const r = await apiJson<{ live: typeof live; snapshotId?: string }>('/v1/cognitive/trajectory/compute', {
          method: 'POST',
          body: JSON.stringify({ userId, horizon: 'medium', persist }),
        });
        setLive(r.live);
        const list = await apiJson<{ snapshots: typeof snapshots }>(
          `/v1/cognitive/trajectory/snapshots?userId=${encodeURIComponent(userId)}`
        );
        setSnapshots(list.snapshots);
        if (r.snapshotId) setSelected(r.snapshotId);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    void run(true);
  }, [run]);

  useEffect(() => {
    if (!selected || !atlasHttpEnabled()) {
      setDetail(null);
      return;
    }
    void apiJson<{ snapshot: Record<string, unknown> }>(
      `/v1/cognitive/trajectory/snapshots/${encodeURIComponent(selected)}?userId=${encodeURIComponent(userId)}`
    )
      .then((r) => setDetail(r.snapshot))
      .catch(() => setDetail(null));
  }, [selected, userId]);

  if (!atlasHttpEnabled()) {
    return (
      <div className="p-[var(--space-8)] text-stone text-sm font-serif">
        Connect the Atlas API to use Trajectory Observatory.
      </div>
    );
  }

  const domains = (detail?.domains as TrajectoryDomain[]) ?? live?.domains ?? [];
  const horizonY = 52;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[var(--atlas-canvas-max)] mx-auto px-[var(--space-5)] md:px-[var(--space-6)] py-[var(--space-6)] space-y-[var(--space-6)]">
        <header className="space-y-[var(--space-2)]">
          <div className="flex items-center gap-[var(--space-2)] text-gold/60">
            <Radar className="w-5 h-5" strokeWidth={1.25} />
            <span className="font-mono text-[11px] uppercase tracking-[0.28em]">Trajectory observatory</span>
          </div>
          <h1 className="font-serif text-3xl md:text-[2.25rem] font-semibold text-ivory/95 tracking-tight leading-[1.15]">
            Directional truth
          </h1>
          <p className="text-sm text-stone/75 max-w-[52rem] leading-relaxed">
            Where your structured patterns suggest you are heading — not chat sentiment. Momentum is inferred from
            decisions, unfinished loops, graph tensions, twin calibration, and evolution taxonomy.
          </p>
        </header>

        {err && (
          <div className="text-sm text-amber-200/90 border border-[color:var(--border-warning)] rounded-[var(--radius-md)] px-[var(--space-4)] py-[var(--space-3)] bg-black/30">
            {err}
          </div>
        )}

        <div className="flex flex-wrap gap-[var(--space-2)]">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(true)}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-[var(--radius-md)] border border-[color:var(--border-default)] text-xs uppercase tracking-widest text-ivory/85 hover:border-[color:var(--border-emphasis)] transition-colors duration-[var(--atlas-motion-standard)] disabled:opacity-40"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', busy && 'animate-spin')} />
            Recompute &amp; persist
          </button>
        </div>

        <AtlasPanel tier="elevated">
          <AtlasPanelHeader
            kicker="Horizon instrument"
            title={live?.summary_text ?? 'Awaiting first computation'}
            aside={
              live && (
                <span className="font-mono text-xs text-stone/55 tabular-nums">
                  conf {(live.confidence * 100).toFixed(0)}%
                </span>
              )
            }
          />
          <div className="relative h-36 w-full rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-black/25 overflow-hidden">
            <svg viewBox="0 0 400 120" className="w-full h-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="traj-horizon" x1="0" y1="0" x2="400" y2="0">
                  <stop offset="0%" stopColor="rgba(88,28,135,0.15)" />
                  <stop offset="45%" stopColor="rgba(201,162,39,0.12)" />
                  <stop offset="100%" stopColor="rgba(26,61,68,0.12)" />
                </linearGradient>
              </defs>
              <rect x="0" y="0" width="400" height="120" fill="url(#traj-horizon)" opacity="0.9" />
              <line x1="0" y1={horizonY} x2="400" y2={horizonY} stroke="rgba(201,162,39,0.35)" strokeWidth="1" />
              {domains.slice(0, 9).map((d, i) => {
                const x = 24 + i * 40;
                const h = 20 + d.momentum * 28;
                const y = horizonY - h;
                const fill =
                  d.momentum > 0.12
                    ? 'rgba(31,92,75,0.55)'
                    : d.momentum < -0.12
                      ? 'rgba(139,41,66,0.45)'
                      : 'rgba(88,28,135,0.35)';
                return <rect key={d.domain} x={x} y={y} width="10" height={h} rx="2" fill={fill} />;
              })}
            </svg>
            <p className="absolute bottom-2 left-3 font-mono text-[10px] uppercase tracking-widest text-stone/45">
              Domain columns · height ∝ momentum
            </p>
          </div>
          {live?.explanation_text && (
            <p className="mt-[var(--space-4)] text-sm text-ivory/80 leading-relaxed editorial-body">{live.explanation_text}</p>
          )}
        </AtlasPanel>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--space-4)]">
          <AtlasPanel tier="standard">
            <AtlasPanelHeader kicker="Domains" title="Trajectory bands" />
            <ul className="space-y-[var(--space-3)]">
              {domains.map((d) => (
                <li
                  key={d.domain}
                  className="border-l-2 border-[color:var(--border-emphasis)]/30 pl-[var(--space-3)] py-[var(--space-1)]"
                >
                  <div className="flex justify-between gap-2">
                    <span className="text-sm font-medium text-ivory/90">{d.label}</span>
                    <span className="font-mono text-[11px] text-stone/50 uppercase">{d.classification.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="text-xs text-stone/70 mt-1 leading-relaxed">{d.explanation}</p>
                </li>
              ))}
            </ul>
          </AtlasPanel>
          <AtlasPanel tier="standard">
            <AtlasPanelHeader kicker="Leverage" title="Correction window" />
            <ul className="space-y-[var(--space-3)] text-sm text-ivory/85">
              {(live?.correction_leverage ?? []).map((x, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-gold/50 font-mono text-xs">{String(i + 1).padStart(2, '0')}</span>
                  <span className="leading-relaxed">{x}</span>
                </li>
              ))}
            </ul>
            <div className="mt-[var(--space-6)] pt-[var(--space-4)] border-t border-[color:var(--border-subtle)]">
              <p className="text-[11px] font-mono uppercase tracking-widest text-stone/45 mb-2">If unchanged / if corrected</p>
              <p className="text-xs text-stone/75 leading-relaxed mb-3">{live?.projections?.if_unchanged ?? '—'}</p>
              <p className="text-xs text-teal-200/70 leading-relaxed">{live?.projections?.if_corrected ?? '—'}</p>
            </div>
          </AtlasPanel>
        </div>

        <AtlasPanel tier="standard">
          <AtlasPanelHeader kicker="History" title="Trajectory scrubber" />
          <div className="flex flex-wrap gap-2">
            {snapshots.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelected(s.id)}
                className={cn(
                  'px-3 py-2 rounded-[var(--radius-sm)] border text-left transition-colors duration-[var(--atlas-motion-fast)]',
                  selected === s.id
                    ? 'border-[color:var(--border-emphasis)] bg-gold/5'
                    : 'border-[color:var(--border-subtle)] hover:border-[color:var(--border-default)]'
                )}
              >
                <span className="block font-mono text-[10px] text-stone/50">{s.created_at.slice(0, 16)}</span>
                <span className="block text-xs text-ivory/85 line-clamp-2">{s.summary_text}</span>
              </button>
            ))}
          </div>
        </AtlasPanel>
      </div>
    </div>
  );
}

type FrictionItem = {
  id: string;
  friction_type: string;
  severity: number;
  title: string;
  description: string;
  smallest_release_hint: string;
  cluster_key: string | null;
};

export function FrictionCartographyView(): React.ReactElement {
  const userId = useUserId();
  const [items, setItems] = useState<FrictionItem[]>([]);
  const [clusters, setClusters] = useState<{ cluster_key: string; count: number; max_severity: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!atlasHttpEnabled()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await apiJson<{ items: FrictionItem[]; clusters: typeof clusters }>(
        `/v1/cognitive/friction/items?userId=${encodeURIComponent(userId)}`
      );
      setItems(r.items);
      setClusters(r.clusters);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [userId]);

  useEffect(() => {
    void (async () => {
      if (!atlasHttpEnabled()) return;
      try {
        await apiJson('/v1/cognitive/friction/rebuild', {
          method: 'POST',
          body: JSON.stringify({ userId }),
        });
      } catch {
        /* non-fatal */
      }
      await load();
    })();
  }, [userId, load]);

  if (!atlasHttpEnabled()) {
    return <div className="p-8 text-stone text-sm">Connect API for Friction Cartography.</div>;
  }

  const positions = items.map((it, i) => {
    const angle = (i / Math.max(items.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const r = 38 + it.severity * 12;
    return { x: 50 + Math.cos(angle) * r, y: 50 + Math.sin(angle) * r };
  });

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[var(--atlas-canvas-max)] mx-auto px-[var(--space-5)] md:px-[var(--space-6)] py-[var(--space-6)] space-y-[var(--space-6)]">
        <header className="space-y-[var(--space-2)]">
          <div className="flex items-center gap-2 text-gold/60">
            <Orbit className="w-5 h-5" strokeWidth={1.25} />
            <span className="font-mono text-[11px] uppercase tracking-[0.28em]">Friction cartography</span>
          </div>
          <h1 className="font-serif text-3xl md:text-[2.25rem] font-semibold text-ivory/95 tracking-tight">Resistance field</h1>
          <p className="text-sm text-stone/75 max-w-[48rem] leading-relaxed">
            Diagnostic map of what is actually resisting movement — surfaced from unfinished business, drafts, twin calibration,
            and open contradictions. Not advice; structure.
          </p>
        </header>

        {err && <p className="text-sm text-amber-200/90">{err}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void load()}
            className="h-10 px-4 rounded-[var(--radius-md)] border border-[color:var(--border-default)] text-xs uppercase tracking-widest"
          >
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-[var(--space-4)]">
          <AtlasPanel tier="elevated" className="xl:col-span-2 min-h-[320px]">
            <AtlasPanelHeader kicker="Constellation" title="Drag field" />
            <div className="relative aspect-square max-w-md mx-auto">
              <svg viewBox="0 0 100 100" className="w-full h-full">
                <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(88,28,135,0.12)" strokeWidth="0.4" />
                <circle cx="50" cy="50" r="28" fill="none" stroke="rgba(201,162,39,0.08)" strokeWidth="0.3" />
                {items.slice(0, 16).map((it, i) => {
                  const p = positions[i] ?? { x: 50, y: 50 };
                  const sz = 2 + it.severity * 2.2;
                  return (
                    <circle
                      key={it.id}
                      cx={p.x}
                      cy={p.y}
                      r={sz}
                      fill={
                        it.severity > 0.65 ? 'rgba(139,41,66,0.65)' : it.severity > 0.45 ? 'rgba(201,162,39,0.45)' : 'rgba(88,28,135,0.4)'
                      }
                    />
                  );
                })}
              </svg>
              <p className="text-center font-mono text-[10px] text-stone/45 mt-2">Node size ∝ severity · ring = relational scaffold</p>
            </div>
          </AtlasPanel>
          <AtlasPanel tier="standard" className="xl:col-span-3">
            <AtlasPanelHeader kicker="Clusters" title="Reinforcing resistance" />
            <div className="flex flex-wrap gap-2 mb-4">
              {clusters.map((c) => (
                <span
                  key={c.cluster_key}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] text-xs text-stone/80"
                >
                  <span className="font-mono text-[10px] text-gold/50">{c.count}×</span>
                  {c.cluster_key}
                </span>
              ))}
            </div>
            <ul className="space-y-[var(--space-3)] max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
              {items.map((it) => (
                <li key={it.id} className="border border-[color:var(--border-subtle)] rounded-[var(--radius-md)] p-[var(--space-3)]">
                  <div className="flex justify-between gap-2">
                    <span className="text-sm text-ivory/90">{it.title}</span>
                    <span className="font-mono text-[10px] text-stone/50">{(it.severity * 100).toFixed(0)}</span>
                  </div>
                  <p className="text-xs text-stone/65 mt-1 line-clamp-3">{it.description}</p>
                  <p className="text-[11px] text-teal-200/75 mt-2">
                    <span className="text-stone/50 font-mono uppercase tracking-wider mr-2">Release</span>
                    {it.smallest_release_hint}
                  </p>
                </li>
              ))}
            </ul>
          </AtlasPanel>
        </div>
      </div>
    </div>
  );
}

export function ThresholdProtocolForgeView(): React.ReactElement {
  const userId = useUserId();
  const [protocols, setProtocols] = useState<Record<string, unknown>[]>([]);
  const [acts, setActs] = useState<Record<string, unknown>[]>([]);
  const [title, setTitle] = useState('');
  const [stateDesc, setStateDesc] = useState('');
  const [warnings, setWarnings] = useState('');
  const [immediate, setImmediate] = useState('');
  const [forbidden, setForbidden] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!atlasHttpEnabled()) return;
    const [p, a] = await Promise.all([
      apiJson<{ protocols: typeof protocols }>(`/v1/cognitive/threshold/protocols?userId=${encodeURIComponent(userId)}`),
      apiJson<{ activations: typeof acts }>(`/v1/cognitive/threshold/activations?userId=${encodeURIComponent(userId)}`),
    ]);
    setProtocols(p.protocols);
    setActs(a.activations);
  }, [userId]);

  useEffect(() => {
    void load().catch((e) => setErr(String(e)));
  }, [load]);

  const save = async () => {
    setErr(null);
    try {
      await apiJson('/v1/cognitive/threshold/protocols', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          title: title.trim(),
          stateDescription: stateDesc.trim(),
          warningSigns: warnings.split('\n').map((s) => s.trim()).filter(Boolean),
          immediateSteps: immediate.split('\n').map((s) => s.trim()).filter(Boolean),
          forbiddenActions: forbidden.split('\n').map((s) => s.trim()).filter(Boolean),
          standardsApplyNote: 'Non-negotiables still bind; degraded judgment does not revoke standards.',
          recoverySteps: ['Sleep / nutrition baseline', 'Re-read constitution excerpt', 'Schedule review in 24h'],
          reflectionPrompts: ['What triggered the state?', 'What did I avoid doing?', 'What was the smallest honest next step?'],
        }),
      });
      setTitle('');
      setStateDesc('');
      setWarnings('');
      setImmediate('');
      setForbidden('');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  if (!atlasHttpEnabled()) {
    return <div className="p-8 text-stone text-sm">Connect API for Threshold Protocol Forge.</div>;
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[var(--atlas-workspace-max)] mx-auto px-[var(--space-5)] md:px-[var(--space-6)] py-[var(--space-6)] space-y-[var(--space-6)]">
        <header className="space-y-[var(--space-2)]">
          <div className="flex items-center gap-2 text-gold/60">
            <Anchor className="w-5 h-5" strokeWidth={1.25} />
            <span className="font-mono text-[11px] uppercase tracking-[0.28em]">Threshold protocol forge</span>
          </div>
          <h1 className="font-serif text-3xl md:text-[2.25rem] font-semibold text-ivory/95 tracking-tight">Safeguards under pressure</h1>
          <p className="text-sm text-stone/75 leading-relaxed">
            Pre-authored protocols for destabilized states — linked to your governing layer. Serious, controlled, not therapeutic
            theater.
          </p>
        </header>

        {err && <p className="text-sm text-amber-200/90">{err}</p>}

        <AtlasPanel tier="chamber">
          <AtlasPanelHeader kicker="Author" title="New protocol" />
          <div className="space-y-[var(--space-4)]">
            <input
              className="w-full h-11 rounded-[14px] bg-black/35 border border-[color:var(--border-default)] px-[14px] text-base"
              placeholder="Title (e.g. When I am emotionally flooded)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="w-full min-h-[100px] rounded-[var(--radius-md)] bg-black/35 border border-[color:var(--border-default)] p-[var(--space-3)] text-sm"
              placeholder="State description — what it feels like, what degrades"
              value={stateDesc}
              onChange={(e) => setStateDesc(e.target.value)}
            />
            <textarea
              className="w-full min-h-[72px] rounded-[var(--radius-md)] bg-black/35 border border-[color:var(--border-default)] p-[var(--space-3)] text-xs font-mono"
              placeholder="Warning signs (one per line)"
              value={warnings}
              onChange={(e) => setWarnings(e.target.value)}
            />
            <textarea
              className="w-full min-h-[72px] rounded-[var(--radius-md)] bg-black/35 border border-[color:var(--border-default)] p-[var(--space-3)] text-xs"
              placeholder="Immediate stabilizing steps (one per line)"
              value={immediate}
              onChange={(e) => setImmediate(e.target.value)}
            />
            <textarea
              className="w-full min-h-[72px] rounded-[var(--radius-md)] bg-black/35 border border-[color:var(--border-default)] p-[var(--space-3)] text-xs"
              placeholder="Forbidden actions while degraded (one per line)"
              value={forbidden}
              onChange={(e) => setForbidden(e.target.value)}
            />
            <button
              type="button"
              onClick={() => void save()}
              className="h-11 px-6 rounded-[var(--radius-md)] bg-gold/10 border border-gold/25 text-sm font-medium text-gold/90"
            >
              Forge protocol
            </button>
          </div>
        </AtlasPanel>

        <AtlasPanel tier="standard">
          <AtlasPanelHeader kicker="Armory" title="Active protocols" />
          <ul className="space-y-[var(--space-3)]">
            {protocols.map((p) => (
              <li key={String(p.id)} className="flex flex-wrap items-center justify-between gap-3 border border-[color:var(--border-subtle)] rounded-[var(--radius-md)] p-[var(--space-3)]">
                <div>
                  <p className="text-sm text-ivory/90">{String(p.title)}</p>
                  <p className="text-xs text-stone/60 line-clamp-2 mt-1">{String(p.state_description).slice(0, 160)}…</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void apiJson(`/v1/cognitive/threshold/protocols/${encodeURIComponent(String(p.id))}/activate`, {
                      method: 'POST',
                      body: JSON.stringify({ userId }),
                    }).then(() => load())
                  }
                  className="h-9 px-3 rounded-[var(--radius-sm)] border border-[color:var(--border-default)] text-[11px] uppercase tracking-widest"
                >
                  Activate
                </button>
              </li>
            ))}
          </ul>
        </AtlasPanel>

        <AtlasPanel tier="standard">
          <AtlasPanelHeader kicker="Log" title="Activation history" />
          <ul className="space-y-2 text-xs text-stone/75">
            {acts.map((a) => (
              <li key={String(a.id)} className="flex justify-between gap-2 border-b border-[color:var(--border-subtle)] pb-2">
                <span>{String(a.protocol_title)}</span>
                <span className="font-mono text-[10px] text-stone/50">{String(a.activated_at).slice(0, 16)}</span>
              </li>
            ))}
          </ul>
        </AtlasPanel>
      </div>
    </div>
  );
}
