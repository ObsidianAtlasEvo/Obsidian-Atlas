import React from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  Undo2,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  ActionContractRow,
  ActionStatus,
  ActiveControlRow,
  AuditEventRow,
  ConnectorRow,
  ConstitutionalEvalResult,
  EvalResultsResponse,
  TimelineResponse,
  TransparencyLogEntry,
  WatcherEventRow,
  approveActionContract,
  dispatchActionContract,
  escalateActionContract,
  fetchActionContracts,
  fetchActiveControls,
  fetchAuditLog,
  fetchConnectors,
  fetchConnectorsHealth,
  fetchEvalResults,
  fetchTimeline,
  fetchTransparencyLog,
  fetchWatcherEvents,
  rejectActionContract,
  resolveActiveControl,
  resolveWatcherEvent,
  reverseActionContract,
  runEvalSuite,
  syncConnector,
  sweepWatchers,
} from '../../lib/sovereigntyApi';
import { ConfirmDialog } from './ConfirmDialog';

type TabKey = 'actions' | 'connectors' | 'watchers' | 'evals' | 'audit' | 'controls' | 'timeline' | 'transparency';

interface Props {
  userId: string;
}

type AsyncStatus = 'idle' | 'loading' | 'error' | 'ready';

interface AsyncState<T> {
  status: AsyncStatus;
  data: T | null;
  error?: string | null;
}

function useAsync<T>(loader: () => Promise<T | null>, deps: unknown[]): [AsyncState<T>, () => Promise<void>] {
  const [state, setState] = React.useState<AsyncState<T>>({ status: 'idle', data: null });
  const reload = React.useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }));
    const data = await loader();
    if (data === null) {
      setState({ status: 'error', data: null, error: 'Could not reach Atlas backend.' });
    } else {
      setState({ status: 'ready', data });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  React.useEffect(() => {
    void reload();
  }, [reload]);
  return [state, reload];
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-sm border border-titanium/10 bg-titanium/[0.03] px-6 py-8 text-center text-xs text-stone/55">
      {label}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-sm border border-red-500/20 bg-red-500/[0.04] px-4 py-3 text-xs text-red-300/90">
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1 uppercase tracking-widest text-[10px] text-red-200 hover:text-ivory"
      >
        <RefreshCw size={12} /> retry
      </button>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 py-6 text-xs text-stone/50">
      <Loader2 size={14} className="animate-spin text-gold/70" />
      loading…
    </div>
  );
}

function statusBadge(status: string, tone: 'good' | 'warn' | 'bad' | 'neutral' = 'neutral') {
  const toneClass =
    tone === 'good'
      ? 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300'
      : tone === 'warn'
        ? 'border-amber-500/30 bg-amber-500/[0.06] text-amber-300'
        : tone === 'bad'
          ? 'border-red-500/30 bg-red-500/[0.06] text-red-300'
          : 'border-titanium/20 bg-titanium/[0.04] text-stone/70';
  return (
    <span className={`rounded-sm border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${toneClass}`}>
      {status}
    </span>
  );
}

function actionStatusTone(status: ActionStatus): 'good' | 'warn' | 'bad' | 'neutral' {
  if (status === 'completed' || status === 'approved') return 'good';
  if (status === 'rejected' || status === 'failed') return 'bad';
  if (status === 'executing' || status === 'staged') return 'warn';
  return 'neutral';
}

function connectorHealthTone(h: string): 'good' | 'warn' | 'bad' | 'neutral' {
  if (h === 'healthy') return 'good';
  if (h === 'degraded') return 'warn';
  if (h === 'offline') return 'bad';
  return 'neutral';
}

// ── Actions Panel ─────────────────────────────────────────────────────────

function ActionsPanel({ userId }: Props) {
  const [state, reload] = useAsync(() => fetchActionContracts(userId), [userId]);
  const [pending, setPending] = React.useState<{
    kind: 'approve' | 'reject' | 'escalate' | 'dispatch' | 'reverse';
    contract: ActionContractRow;
  } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const contracts = state.data?.contracts ?? [];

  const runAction = async (reason?: string) => {
    if (!pending) return;
    setBusy(true);
    setMsg(null);
    const { kind, contract } = pending;
    let ok = false;
    try {
      if (kind === 'approve') {
        const r = await approveActionContract(userId, contract.id);
        ok = !!r;
      } else if (kind === 'reject') {
        const r = await rejectActionContract(userId, contract.id, reason ?? 'rejected');
        ok = !!r;
      } else if (kind === 'escalate') {
        const r = await escalateActionContract(userId, contract.id, reason ?? 'escalated');
        ok = !!r;
      } else if (kind === 'dispatch') {
        const r = await dispatchActionContract(userId, contract.id);
        ok = !!r?.result?.success;
      } else if (kind === 'reverse') {
        const r = await reverseActionContract(userId, contract.id, reason ?? 'reversed');
        ok = !!r;
      }
      setMsg(ok ? `${kind} succeeded` : `${kind} failed`);
      await reload();
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-sm uppercase tracking-[0.2em] text-ivory">Action Contracts</h3>
        <button
          type="button"
          onClick={() => void reload()}
          className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-stone/60 hover:text-ivory"
        >
          <RefreshCw size={12} /> refresh
        </button>
      </div>

      {msg && <p className="text-[10px] text-stone/60">{msg}</p>}
      {state.status === 'loading' && <LoadingRow />}
      {state.status === 'error' && <ErrorState message={state.error ?? 'Load failed.'} onRetry={reload} />}
      {state.status === 'ready' && contracts.length === 0 && <EmptyState label="No action contracts yet." />}

      {state.status === 'ready' && contracts.length > 0 && (
        <ul className="space-y-2">
          {contracts.map((c) => (
            <li key={c.id} className="rounded-sm border border-titanium/10 bg-titanium/[0.03] p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-ivory">{c.action_type}</code>
                    {statusBadge(c.status, actionStatusTone(c.status))}
                    {c.risk_class && statusBadge(`risk:${c.risk_class}`, c.risk_class === 'critical' ? 'bad' : 'neutral')}
                    {c.irreversible && statusBadge('irreversible', 'warn')}
                  </div>
                  <p className="mt-1 text-[11px] text-stone/65">→ {c.target}</p>
                </div>
                <span className="text-[9px] uppercase tracking-widest text-stone/40">
                  {c.created_at ? new Date(c.created_at).toLocaleString() : ''}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {c.status === 'staged' && (
                  <>
                    <ActionBtn icon={<CheckCircle2 size={12} />} label="approve" onClick={() => setPending({ kind: 'approve', contract: c })} />
                    <ActionBtn icon={<XCircle size={12} />} label="reject" tone="bad" onClick={() => setPending({ kind: 'reject', contract: c })} />
                    <ActionBtn icon={<ShieldAlert size={12} />} label="escalate" tone="warn" onClick={() => setPending({ kind: 'escalate', contract: c })} />
                  </>
                )}
                {c.status === 'approved' && (
                  <ActionBtn icon={<PlayCircle size={12} />} label="dispatch" onClick={() => setPending({ kind: 'dispatch', contract: c })} />
                )}
                {c.status === 'completed' && (
                  <ActionBtn icon={<Undo2 size={12} />} label="reverse" tone="warn" onClick={() => setPending({ kind: 'reverse', contract: c })} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!pending}
        title={
          pending?.kind === 'dispatch'
            ? 'Dispatch action contract'
            : pending?.kind === 'reverse'
              ? 'Reverse completed action'
              : pending?.kind === 'approve'
                ? 'Approve action contract'
                : pending?.kind === 'reject'
                  ? 'Reject action contract'
                  : 'Escalate action contract'
        }
        body={
          pending && (
            <>
              <p>
                <strong className="text-ivory">{pending.contract.action_type}</strong> → {pending.contract.target}
              </p>
              {pending.kind === 'dispatch' && pending.contract.irreversible && (
                <p className="mt-3 text-amber-300">This contract is marked irreversible — no reversal anchor.</p>
              )}
              {pending.kind === 'reverse' && !pending.contract.reversal_anchor && (
                <p className="mt-3 text-amber-300">No reversal anchor recorded — the reverse call will be blocked.</p>
              )}
            </>
          )
        }
        destructive={pending?.kind === 'reject' || pending?.kind === 'reverse'}
        requireReason={pending?.kind === 'reject' || pending?.kind === 'reverse' || pending?.kind === 'escalate'}
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={(r) => void runAction(r)}
      />
    </section>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  tone = 'good',
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: 'good' | 'warn' | 'bad';
}) {
  const cls =
    tone === 'bad'
      ? 'border-red-500/30 text-red-300 hover:bg-red-500/10'
      : tone === 'warn'
        ? 'border-amber-500/30 text-amber-300 hover:bg-amber-500/10'
        : 'border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded-sm border px-3 py-1 text-[10px] uppercase tracking-widest ${cls}`}
    >
      {icon} {label}
    </button>
  );
}

// ── Connectors Panel ──────────────────────────────────────────────────────

function ConnectorsPanel({ userId }: Props) {
  const [state, reload] = useAsync(() => fetchConnectors(userId), [userId]);
  const [healthState, reloadHealth] = useAsync(() => fetchConnectorsHealth(userId), [userId]);
  const [pending, setPending] = React.useState<ConnectorRow | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const connectors = state.data?.connectors ?? [];
  const report = healthState.data?.report;

  const runSync = async () => {
    if (!pending) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await syncConnector(userId, pending.id);
      const res = r?.result;
      if (res?.skipped) setMsg(`skipped: ${res.reason ?? 'no change'}`);
      else if (res) setMsg(`sync ok — inserted ${res.inserted ?? 0}, updated ${res.updated ?? 0}`);
      else setMsg('sync failed');
      await Promise.all([reload(), reloadHealth()]);
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-sm uppercase tracking-[0.2em] text-ivory">Connectors</h3>
        <button
          type="button"
          onClick={() => {
            void reload();
            void reloadHealth();
          }}
          className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-stone/60 hover:text-ivory"
        >
          <RefreshCw size={12} /> refresh
        </button>
      </div>

      {report && (
        <div className="flex gap-2 text-[10px] uppercase tracking-widest text-stone/60">
          {statusBadge(`stale:${report.stale}`, report.stale > 0 ? 'warn' : 'neutral')}
          {statusBadge(`failed:${report.failed}`, report.failed > 0 ? 'bad' : 'neutral')}
        </div>
      )}

      {msg && <p className="text-[10px] text-stone/60">{msg}</p>}
      {state.status === 'loading' && <LoadingRow />}
      {state.status === 'error' && <ErrorState message={state.error ?? 'Load failed.'} onRetry={reload} />}
      {state.status === 'ready' && connectors.length === 0 && <EmptyState label="No connectors registered." />}

      {state.status === 'ready' && connectors.length > 0 && (
        <ul className="space-y-2">
          {connectors.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-sm border border-titanium/10 bg-titanium/[0.03] p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ivory">{c.connector_name}</span>
                  {statusBadge(c.health_status, connectorHealthTone(c.health_status))}
                  {statusBadge(`trust:${(c.trust_score ?? 0).toFixed(2)}`, c.trust_score < 0.5 ? 'warn' : 'neutral')}
                </div>
                <p className="mt-1 text-[10px] text-stone/50">
                  {c.connector_type ?? '—'} · {c.auth_method ?? 'no auth'} ·{' '}
                  {c.last_checked_at ? `checked ${new Date(c.last_checked_at).toLocaleString()}` : 'never checked'}
                </p>
              </div>
              <ActionBtn icon={<Zap size={12} />} label="sync" onClick={() => setPending(c)} />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!pending}
        title="Sync connector"
        body={
          pending && (
            <p>
              Trigger an outbound sync cycle for <strong className="text-ivory">{pending.connector_name}</strong>. Atlas
              will fetch, canonicalize, and ingest new entities via the configured endpoint.
            </p>
          )
        }
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => void runSync()}
      />
    </section>
  );
}

// ── Watchers Panel ────────────────────────────────────────────────────────

function WatchersPanel({ userId }: Props) {
  const [state, reload] = useAsync(() => fetchWatcherEvents(userId, false), [userId]);
  const [busy, setBusy] = React.useState(false);
  const [pendingResolve, setPendingResolve] = React.useState<WatcherEventRow | null>(null);
  const [pendingSweep, setPendingSweep] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const events = state.data?.events ?? [];

  const runSweep = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await sweepWatchers(userId);
      const res = r?.result;
      setMsg(res ? `sweep: detected ${res.detected}, suppressed ${res.suppressed}` : 'sweep failed');
      await reload();
    } finally {
      setBusy(false);
      setPendingSweep(false);
    }
  };
  const runResolve = async () => {
    if (!pendingResolve) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await resolveWatcherEvent(userId, pendingResolve.id);
      setMsg(r?.ok ? 'resolved' : 'resolve failed');
      await reload();
    } finally {
      setBusy(false);
      setPendingResolve(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-sm uppercase tracking-[0.2em] text-ivory">Watchers</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPendingSweep(true)}
            className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-stone/60 hover:text-ivory"
          >
            <Eye size={12} /> run sweep
          </button>
          <button
            type="button"
            onClick={() => void reload()}
            className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-stone/60 hover:text-ivory"
          >
            <RefreshCw size={12} /> refresh
          </button>
        </div>
      </div>

      {msg && <p className="text-[10px] text-stone/60">{msg}</p>}
      {state.status === 'loading' && <LoadingRow />}
      {state.status === 'error' && <ErrorState message={state.error ?? 'Load failed.'} onRetry={reload} />}
      {state.status === 'ready' && events.length === 0 && <EmptyState label="No unresolved watcher events." />}

      {state.status === 'ready' && events.length > 0 && (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 rounded-sm border border-titanium/10 bg-titanium/[0.03] p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ivory">{e.event_type ?? 'event'}</span>
                  {e.severity && statusBadge(e.severity, e.severity === 'high' || e.severity === 'critical' ? 'bad' : 'warn')}
                </div>
                <p className="mt-1 text-[10px] text-stone/50">
                  {e.detected_at ? new Date(e.detected_at).toLocaleString() : 'detected at unknown'}
                </p>
              </div>
              <ActionBtn icon={<CheckCircle2 size={12} />} label="resolve" onClick={() => setPendingResolve(e)} />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingSweep}
        title="Run watcher sweep"
        body={<p>Trigger stall / contradiction / drift detection for your account.</p>}
        busy={busy}
        onCancel={() => setPendingSweep(false)}
        onConfirm={() => void runSweep()}
      />
      <ConfirmDialog
        open={!!pendingResolve}
        title="Resolve watcher event"
        body={<p>Mark this event as resolved.</p>}
        busy={busy}
        onCancel={() => setPendingResolve(null)}
        onConfirm={() => void runResolve()}
      />
    </section>
  );
}

// ── Evals Panel ────────────────────────────────────────────────────────────

function EvalsPanel({ userId }: Props) {
  const [state, reload] = useAsync(() => fetchEvalResults(userId), [userId]);
  const [busy, setBusy] = React.useState(false);
  const [pendingRun, setPendingRun] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const results = state.data?.results ?? [];
  const readiness = state.data?.readiness;
  const health = state.data?.health;

  const runSuite = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await runEvalSuite(userId);
      setMsg(r ? `suite complete — ${r.results?.length ?? 0} tests` : 'suite failed');
      await reload();
    } finally {
      setBusy(false);
      setPendingRun(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-sm uppercase tracking-[0.2em] text-ivory">Constitutional Eval</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPendingRun(true)}
            className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-stone/60 hover:text-ivory"
          >
            <PlayCircle size={12} /> run suite
          </button>
          <button
            type="button"
            onClick={() => void reload()}
            className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-stone/60 hover:text-ivory"
          >
            <RefreshCw size={12} /> refresh
          </button>
        </div>
      </div>

      {msg && <p className="text-[10px] text-stone/60">{msg}</p>}

      {readiness && health && (
        <div className="flex gap-2 text-[10px]">
          {statusBadge(readiness.ready ? 'release ready' : `blocked ×${readiness.blockingFailures.length}`, readiness.ready ? 'good' : 'bad')}
          {statusBadge(`health:${(health.score * 100).toFixed(0)}%`, health.passed ? 'good' : 'warn')}
        </div>
      )}

      {state.status === 'loading' && <LoadingRow />}
      {state.status === 'error' && <ErrorState message={state.error ?? 'Load failed.'} onRetry={reload} />}
      {state.status === 'ready' && results.length === 0 && <EmptyState label="No eval results yet." />}

      {state.status === 'ready' && results.length > 0 && (
        <ul className="space-y-2">
          {results.map((r: ConstitutionalEvalResult) => (
            <li key={r.id} className="flex items-center justify-between rounded-sm border border-titanium/10 bg-titanium/[0.03] p-3 text-xs">
              <span className="text-ivory">{r.test_name ?? r.id}</span>
              {statusBadge(r.passed ? 'pass' : 'fail', r.passed ? 'good' : 'bad')}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingRun}
        title="Run constitutional eval suite"
        body={<p>Execute the full suite and persist results to the constitutional_eval_results ledger.</p>}
        busy={busy}
        onCancel={() => setPendingRun(false)}
        onConfirm={() => void runSuite()}
      />
    </section>
  );
}

// ── Audit Log Panel ───────────────────────────────────────────────────────

function AuditPanel({ userId }: Props) {
  const [state, reload] = useAsync(() => fetchAuditLog(userId), [userId]);
  const events = state.data?.events ?? [];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-sm uppercase tracking-[0.2em] text-ivory">Audit Log</h3>
        <button
          type="button"
          onClick={() => void reload()}
          className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-stone/60 hover:text-ivory"
        >
          <RefreshCw size={12} /> refresh
        </button>
      </div>

      {state.data?.summary && <p className="text-[10px] text-stone/55">{state.data.summary}</p>}
      {state.status === 'loading' && <LoadingRow />}
      {state.status === 'error' && <ErrorState message={state.error ?? 'Load failed.'} onRetry={reload} />}
      {state.status === 'ready' && events.length === 0 && <EmptyState label="No audit events." />}

      {state.status === 'ready' && events.length > 0 && (
        <ul className="divide-y divide-titanium/10 rounded-sm border border-titanium/10 bg-titanium/[0.03]">
          {events.map((e: AuditEventRow) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2 text-xs">
              <span className="text-ivory">{e.event_type ?? 'event'}</span>
              <span className="text-[10px] text-stone/50">{e.target ?? ''}</span>
              <span className="text-[10px] text-stone/40">
                {e.created_at ? new Date(e.created_at).toLocaleString() : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Active Controls Panel ─────────────────────────────────────────────────

function ControlsPanel({ userId }: Props) {
  const [state, reload] = useAsync(() => fetchActiveControls(userId), [userId]);
  const [pending, setPending] = React.useState<ActiveControlRow | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const controls = state.data?.controls ?? [];

  const runResolve = async () => {
    if (!pending) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await resolveActiveControl(pending.id);
      setMsg(r?.ok ? 'control lifted' : 'resolve failed');
      await reload();
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-sm uppercase tracking-[0.2em] text-ivory">Active Controls</h3>
        <button
          type="button"
          onClick={() => void reload()}
          className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-stone/60 hover:text-ivory"
        >
          <RefreshCw size={12} /> refresh
        </button>
      </div>

      {msg && <p className="text-[10px] text-stone/60">{msg}</p>}
      {state.status === 'loading' && <LoadingRow />}
      {state.status === 'error' && <ErrorState message={state.error ?? 'Load failed.'} onRetry={reload} />}
      {state.status === 'ready' && controls.length === 0 && <EmptyState label="No active sovereignty controls." />}

      {state.status === 'ready' && controls.length > 0 && (
        <ul className="space-y-2">
          {controls.map((c: ActiveControlRow) => (
            <li key={c.id} className="flex items-center justify-between rounded-sm border border-titanium/10 bg-titanium/[0.03] p-3 text-xs">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-ivory">{c.control_type ?? 'control'}</span>
                  {statusBadge(c.scope, 'warn')}
                </div>
                <p className="mt-1 text-[10px] text-stone/50">
                  {c.scope_key ?? 'no scope key'} · {c.created_at ? new Date(c.created_at).toLocaleString() : ''}
                </p>
              </div>
              <ActionBtn icon={<RotateCcw size={12} />} label="resolve" onClick={() => setPending(c)} />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!pending}
        title="Resolve sovereignty control"
        body={
          pending && (
            <p>
              Lift <strong className="text-ivory">{pending.control_type}</strong> on scope{' '}
              <strong className="text-ivory">{pending.scope}</strong>. The system will resume normal behavior for this
              scope.
            </p>
          )
        }
        requireReason
        reasonPlaceholder="Why are you lifting this control?"
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => void runResolve()}
      />
    </section>
  );
}

// ── Timeline Panel ────────────────────────────────────────────────────────

function TimelinePanel({ userId }: Props) {
  const [state, reload] = useAsync<TimelineResponse>(() => fetchTimeline(userId), [userId]);
  const events = state.data?.events ?? [];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-sm uppercase tracking-[0.2em] text-ivory">Timeline</h3>
        <button
          type="button"
          onClick={() => void reload()}
          className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-stone/60 hover:text-ivory"
        >
          <RefreshCw size={12} /> refresh
        </button>
      </div>

      {state.status === 'loading' && <LoadingRow />}
      {state.status === 'error' && <ErrorState message={state.error ?? 'Load failed.'} onRetry={reload} />}
      {state.status === 'ready' && events.length === 0 && <EmptyState label="Timeline is empty." />}

      {state.status === 'ready' && events.length > 0 && (
        <ul className="space-y-2">
          {events.slice(0, 60).map((e, i) => (
            <li key={e.id ?? `t-${i}`} className="flex items-center justify-between rounded-sm border border-titanium/10 bg-titanium/[0.03] p-3 text-xs">
              <div className="flex items-center gap-2">
                <Clock size={12} className="text-stone/40" />
                <span className="text-ivory">{e.event_type ?? 'event'}</span>
              </div>
              <span className="text-[10px] text-stone/50">
                {e.occurred_at ? new Date(e.occurred_at).toLocaleString() : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Transparency Panel ────────────────────────────────────────────────────

function TransparencyPanel({ userId }: Props) {
  const [state, reload] = useAsync(() => fetchTransparencyLog(userId), [userId]);
  const log = state.data?.log ?? [];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-sm uppercase tracking-[0.2em] text-ivory">Transparency Log</h3>
        <button
          type="button"
          onClick={() => void reload()}
          className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-stone/60 hover:text-ivory"
        >
          <RefreshCw size={12} /> refresh
        </button>
      </div>

      {state.status === 'loading' && <LoadingRow />}
      {state.status === 'error' && <ErrorState message={state.error ?? 'Load failed.'} onRetry={reload} />}
      {state.status === 'ready' && log.length === 0 && <EmptyState label="No transparency entries." />}

      {state.status === 'ready' && log.length > 0 && (
        <ul className="space-y-2">
          {log.slice(0, 80).map((e: TransparencyLogEntry, i: number) => (
            <li key={e.id ?? `tr-${i}`} className="rounded-sm border border-titanium/10 bg-titanium/[0.03] p-3 text-xs">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-ivory">{e.category ?? 'entry'}</span>
                <span className="text-[10px] text-stone/40">
                  {e.created_at ? new Date(e.created_at).toLocaleString() : ''}
                </span>
              </div>
              {e.detail && <p className="text-[11px] text-stone/60">{String(e.detail)}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Dashboard shell ───────────────────────────────────────────────────────

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'actions', label: 'Actions', icon: <Zap size={12} /> },
  { key: 'connectors', label: 'Connectors', icon: <Activity size={12} /> },
  { key: 'watchers', label: 'Watchers', icon: <Eye size={12} /> },
  { key: 'evals', label: 'Eval', icon: <Shield size={12} /> },
  { key: 'audit', label: 'Audit', icon: <AlertCircle size={12} /> },
  { key: 'controls', label: 'Controls', icon: <ShieldAlert size={12} /> },
  { key: 'timeline', label: 'Timeline', icon: <Clock size={12} /> },
  { key: 'transparency', label: 'Transparency', icon: <Eye size={12} /> },
];

export function SovereigntyDashboard({ userId }: Props) {
  const [tab, setTab] = React.useState<TabKey>('actions');

  return (
    <div className="space-y-6 rounded-sm border border-titanium/10 bg-titanium/[0.03] p-6">
      <header className="flex items-center gap-3 border-b border-titanium/10 pb-4">
        <Shield className="text-gold" size={20} />
        <div>
          <h2 className="font-serif text-sm uppercase tracking-[0.25em] text-ivory">Sovereignty Dashboard</h2>
          <p className="text-[10px] font-mono uppercase tracking-widest text-stone/50">
            Phases 0.9 · 0.95 · 0.97 · 0.98 · 0.985 · 0.986 · 0.987 · 0.988 · 0.99
          </p>
        </div>
      </header>

      <nav role="tablist" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1 rounded-sm border px-3 py-1 text-[10px] uppercase tracking-widest transition-colors ${
              tab === t.key
                ? 'border-gold/40 bg-gold/[0.08] text-gold'
                : 'border-titanium/15 text-stone/60 hover:text-ivory'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </nav>

      <div role="tabpanel">
        {tab === 'actions' && <ActionsPanel userId={userId} />}
        {tab === 'connectors' && <ConnectorsPanel userId={userId} />}
        {tab === 'watchers' && <WatchersPanel userId={userId} />}
        {tab === 'evals' && <EvalsPanel userId={userId} />}
        {tab === 'audit' && <AuditPanel userId={userId} />}
        {tab === 'controls' && <ControlsPanel userId={userId} />}
        {tab === 'timeline' && <TimelinePanel userId={userId} />}
        {tab === 'transparency' && <TransparencyPanel userId={userId} />}
      </div>
    </div>
  );
}
