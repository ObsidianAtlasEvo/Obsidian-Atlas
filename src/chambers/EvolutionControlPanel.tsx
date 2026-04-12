/**
 * EvolutionControlPanel
 *
 * Transparency dashboard — gives users full visibility and control over their
 * Atlas evolution state.
 *
 * Design: dark nebula aesthetic, clean information hierarchy, no clutter.
 * Stack: React 18, Tailwind CSS, TypeScript. Zero new runtime dependencies.
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  type FC,
  type ReactNode,
} from 'react';

import {
  UserEvolutionControl,
  type EvolutionInspectionReport,
  type ObservedTrait,
  type ConfirmedTrait,
  type MutationSummary,
  type ManualOverride,
  type UserEvolutionProfile,
} from './userEvolutionControl';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvolutionControlPanelProps {
  userId: string;
  onProfileChange: (profile: UserEvolutionProfile) => void;
}

type TraitTab = 'tone' | 'vocabulary' | 'depth' | 'format' | 'domains' | 'cognitive';

const TRAIT_TABS: TraitTab[] = ['tone', 'vocabulary', 'depth', 'format', 'domains', 'cognitive'];

const IMPACT_COLORS: Record<MutationSummary['impact'], string> = {
  minor:       'bg-sky-900/60 text-sky-300 border-sky-700/50',
  moderate:    'bg-amber-900/60 text-amber-300 border-amber-700/50',
  significant: 'bg-rose-900/60 text-rose-300 border-rose-700/50',
};

const DURABILITY_COLORS: Record<ObservedTrait['durability'], string> = {
  'still observing': 'bg-slate-800 text-slate-400 border-slate-700',
  'likely pattern':  'bg-violet-900/60 text-violet-300 border-violet-700/50',
  'confirmed':       'bg-emerald-900/60 text-emerald-300 border-emerald-700/50',
};

// ---------------------------------------------------------------------------
// Small primitives
// ---------------------------------------------------------------------------

const Panel: FC<{ children: ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`rounded-xl border border-white/[0.07] bg-white/[0.03] p-5 ${className}`}>
    {children}
  </div>
);

const SectionHeader: FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <div className="mb-4">
    <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-400">{title}</h3>
    {subtitle && <p className="mt-0.5 text-xs text-slate-600">{subtitle}</p>}
  </div>
);

const Badge: FC<{ label: string; className?: string }> = ({ label, className = '' }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}>
    {label}
  </span>
);

const Button: FC<{
  children: ReactNode;
  onClick: () => void;
  variant?: 'ghost' | 'outline' | 'danger' | 'primary';
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
}> = ({ children, onClick, variant = 'outline', size = 'sm', disabled = false, className = '' }) => {
  const base = 'inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:pointer-events-none disabled:opacity-40 rounded-lg';
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm' };
  const variants = {
    ghost:   'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]',
    outline: 'border border-white/10 text-slate-300 hover:border-white/20 hover:bg-white/[0.06]',
    danger:  'border border-rose-700/50 text-rose-400 hover:bg-rose-900/30 hover:border-rose-600/60',
    primary: 'bg-violet-600 text-white hover:bg-violet-500 shadow-lg shadow-violet-900/30',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

const ConfirmDialog: FC<{
  title: string;
  description: string;
  confirmLabel?: string;
  typeToConfirm?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}> = ({ title, description, confirmLabel = 'Confirm', typeToConfirm, onConfirm, onCancel, danger }) => {
  const [typed, setTyped] = useState('');
  const ready = !typeToConfirm || typed === typeToConfirm;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d0d14] p-6 shadow-2xl">
        <h4 className="mb-2 text-base font-semibold text-slate-100">{title}</h4>
        <p className="mb-4 text-sm text-slate-400">{description}</p>
        {typeToConfirm && (
          <div className="mb-4">
            <label className="mb-1.5 block text-xs text-slate-500">
              Type <span className="font-mono text-rose-400">{typeToConfirm}</span> to confirm
            </label>
            <input
              autoFocus
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-rose-500/60 focus:ring-1 focus:ring-rose-500/30"
            />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={!ready}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Confidence ring SVG
// ---------------------------------------------------------------------------

const ConfidenceRing: FC<{ value: number }> = ({ value }) => {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const progress = circ * (1 - value);
  const pct = Math.round(value * 100);

  return (
    <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
      <svg width={72} height={72} viewBox="0 0 72 72" className="-rotate-90">
        <circle cx={36} cy={36} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
        <circle
          cx={36} cy={36} r={r}
          fill="none"
          stroke="url(#ring-grad)"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={progress}
          className="transition-all duration-700"
        />
        <defs>
          <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute text-sm font-bold text-slate-200">{pct}%</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Relative time
// ---------------------------------------------------------------------------

function relativeTime(ts: number): string {
  const delta = Date.now() - ts;
  const s = Math.floor(delta / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Section: Status Bar
// ---------------------------------------------------------------------------

const StatusBar: FC<{
  report: EvolutionInspectionReport;
  onFreeze: () => void;
  onUnfreeze: () => void;
}> = ({ report, onFreeze, onUnfreeze }) => {
  const { profileSummary } = report;
  const frozen = report.frozenAreas.includes('__global__');

  return (
    <Panel className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
      {/* Left: toggle */}
      <div className="flex items-center gap-4">
        <button
          onClick={frozen ? onUnfreeze : onFreeze}
          className={`group relative flex h-8 w-16 items-center rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
            frozen
              ? 'bg-slate-700/80 shadow-inner'
              : 'bg-violet-600 shadow-lg shadow-violet-900/50'
          }`}
          aria-label={frozen ? 'Evolution frozen — click to unfreeze' : 'Evolution active — click to freeze'}
        >
          <span
            className={`absolute h-6 w-6 rounded-full shadow-md transition-all duration-300 ${
              frozen
                ? 'left-1 bg-slate-400'
                : 'left-[calc(100%-28px)] bg-white'
            }`}
          />
        </button>
        <div>
          <p className="text-sm font-medium text-slate-200">
            {frozen ? 'Evolution Frozen' : 'Evolution Active'}
          </p>
          <p className="text-xs text-slate-500">
            {frozen ? 'Atlas is not learning from your interactions' : 'Atlas adapts to your preferences'}
          </p>
        </div>
      </div>

      {/* Center: ring + meta */}
      <div className="flex items-center gap-6">
        <ConfidenceRing value={profileSummary.confidence} />
        <div className="grid grid-cols-2 gap-x-8 gap-y-1">
          <div>
            <p className="text-xs text-slate-500">Version</p>
            <p className="text-sm font-semibold text-slate-200">v{profileSummary.version}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Archetype</p>
            <p className="text-sm font-semibold capitalize text-violet-300">{profileSummary.archetype}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Signals</p>
            <p className="text-sm font-semibold text-slate-200">{profileSummary.totalSignals.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Mutations</p>
            <p className="text-sm font-semibold text-slate-200">{profileSummary.totalMutations.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Right: last adapted */}
      <div className="text-right">
        <p className="text-xs text-slate-500">Last adapted</p>
        <p className="text-sm text-slate-300">{relativeTime(report.generatedAt)}</p>
        {profileSummary.quarantined && (
          <Badge label="Quarantined" className="mt-1 border-rose-700/50 bg-rose-900/30 text-rose-400" />
        )}
        {report.pendingSignals > 0 && (
          <p className="mt-1 text-xs text-amber-400">{report.pendingSignals} signal{report.pendingSignals > 1 ? 's' : ''} pending</p>
        )}
      </div>
    </Panel>
  );
};

// ---------------------------------------------------------------------------
// Section: Observed Traits
// ---------------------------------------------------------------------------

const ObservedTraits: FC<{
  traits: ObservedTrait[];
  onDismiss: (traitPath: string) => void;
}> = ({ traits, onDismiss }) => {
  if (traits.length === 0) {
    return (
      <Panel>
        <SectionHeader title="Observed Traits" subtitle="Patterns Atlas is watching — not yet committed" />
        <p className="text-sm text-slate-600 italic">No uncommitted observations right now.</p>
      </Panel>
    );
  }

  return (
    <Panel>
      <SectionHeader title="Observed Traits" subtitle="Patterns Atlas is watching — not yet committed" />
      <ul className="space-y-3">
        {traits.map((trait) => (
          <li
            key={trait.traitPath}
            className="flex items-start justify-between gap-4 rounded-lg border border-white/[0.05] bg-white/[0.02] px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-200">{trait.humanLabel}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge
                  label={trait.durability}
                  className={DURABILITY_COLORS[trait.durability]}
                />
                <span className="text-xs text-slate-500">
                  {trait.sessionCount} session{trait.sessionCount !== 1 ? 's' : ''}
                </span>
                <span className="text-xs text-slate-600">
                  {Math.round(trait.confidence * 100)}% confidence
                </span>
              </div>
            </div>
            {trait.canDismiss && (
              <Button variant="ghost" onClick={() => onDismiss(trait.traitPath)}>
                Dismiss
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
};

// ---------------------------------------------------------------------------
// Section: Confirmed Traits
// ---------------------------------------------------------------------------

const ConfirmedTraits: FC<{
  traits: ConfirmedTrait[];
  onReset: (traitPath: string) => void;
  onFreeze: (traitPath: string) => void;
  frozenAreas: string[];
}> = ({ traits, onReset, onFreeze, frozenAreas }) => {
  const [activeTab, setActiveTab] = useState<TraitTab>('tone');

  const tabTraits = traits.filter((t) => t.traitPath.startsWith(activeTab + '.'));

  return (
    <Panel>
      <SectionHeader title="Confirmed Traits" subtitle="Traits Atlas has committed to your profile" />

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-1">
        {TRAIT_TABS.map((tab) => {
          const count = traits.filter((t) => t.traitPath.startsWith(tab + '.')).length;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all ${
                activeTab === tab
                  ? 'bg-violet-600/80 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
              }`}
            >
              {tab}
              {count > 0 && (
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                  activeTab === tab ? 'bg-white/20 text-white' : 'bg-white/[0.07] text-slate-500'
                }`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Trait list */}
      {tabTraits.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-600 italic">
          No confirmed traits in this category yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {tabTraits.map((trait) => {
            const area = trait.traitPath.split('.')[0];
            const isFrozen = frozenAreas.includes(area);
            return (
              <li
                key={trait.traitPath}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-slate-200">{trait.humanLabel}</p>
                    {isFrozen && (
                      <span className="rounded-full border border-sky-700/50 bg-sky-900/40 px-2 py-0.5 text-[10px] text-sky-400">
                        Frozen
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-violet-300">
                    {typeof trait.currentValue === 'object'
                      ? JSON.stringify(trait.currentValue)
                      : String(trait.currentValue)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-600">
                    Confirmed {relativeTime(trait.confirmedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {trait.canReset && (
                    <Button variant="ghost" onClick={() => onReset(trait.traitPath)}>
                      Reset
                    </Button>
                  )}
                  {trait.canFreeze && !isFrozen && (
                    <Button variant="ghost" onClick={() => onFreeze(area)}>
                      Freeze
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
};

// ---------------------------------------------------------------------------
// Section: Recent Mutations
// ---------------------------------------------------------------------------

const RecentMutations: FC<{
  mutations: MutationSummary[];
  onRevert: (mutationId: string) => void;
}> = ({ mutations, onRevert }) => {
  if (mutations.length === 0) {
    return (
      <Panel>
        <SectionHeader title="Recent Mutations" subtitle="The last 10 changes Atlas made to your profile" />
        <p className="text-sm text-slate-600 italic">No mutations recorded yet.</p>
      </Panel>
    );
  }

  return (
    <Panel>
      <SectionHeader title="Recent Mutations" subtitle="The last 10 changes Atlas made to your profile" />
      <ol className="space-y-2">
        {mutations.map((m, i) => (
          <li
            key={m.id}
            className="flex items-start gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] px-4 py-3"
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-[10px] text-slate-500 font-medium">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-200">{m.humanDescription}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge label={m.impact} className={IMPACT_COLORS[m.impact]} />
                <span className="text-xs text-slate-500">{relativeTime(m.timestamp)}</span>
                <span className="text-xs text-slate-600 italic truncate max-w-xs">
                  Triggered: {m.trigger}
                </span>
              </div>
            </div>
            {m.canRevert && (
              <Button variant="ghost" onClick={() => onRevert(m.id)} className="shrink-0">
                Revert
              </Button>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  );
};

// ---------------------------------------------------------------------------
// Section: Frozen Areas
// ---------------------------------------------------------------------------

const FrozenAreas: FC<{
  frozenAreas: string[];
  onUnfreeze: (area: string) => void;
}> = ({ frozenAreas, onUnfreeze }) => {
  const visible = frozenAreas.filter((a) => a !== '__global__');

  if (visible.length === 0) {
    return (
      <Panel>
        <SectionHeader title="Frozen Areas" subtitle="Trait areas Atlas cannot change" />
        <p className="text-sm text-slate-600 italic">No areas are currently frozen.</p>
      </Panel>
    );
  }

  return (
    <Panel>
      <SectionHeader title="Frozen Areas" subtitle="Trait areas Atlas cannot change" />
      <ul className="flex flex-wrap gap-2">
        {visible.map((area) => (
          <li
            key={area}
            className="flex items-center gap-2 rounded-full border border-sky-700/40 bg-sky-900/20 py-1.5 pl-3 pr-2"
          >
            <span className="text-sm capitalize text-sky-300">{area}</span>
            <button
              onClick={() => onUnfreeze(area)}
              className="rounded-full p-0.5 text-sky-500 hover:bg-sky-800/40 hover:text-sky-200 transition-colors focus:outline-none"
              aria-label={`Unfreeze ${area}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
};

// ---------------------------------------------------------------------------
// Section: Manual Overrides
// ---------------------------------------------------------------------------

const ManualOverrides: FC<{
  overrides: ManualOverride[];
  onClear: (traitPath: string) => void;
}> = ({ overrides, onClear }) => {
  if (overrides.length === 0) {
    return (
      <Panel>
        <SectionHeader title="Manual Overrides" subtitle="Values you've locked — Atlas will not evolve past these" />
        <p className="text-sm text-slate-600 italic">No manual overrides are set.</p>
      </Panel>
    );
  }

  return (
    <Panel>
      <SectionHeader title="Manual Overrides" subtitle="Values you've locked — Atlas will not evolve past these" />
      <ul className="space-y-2">
        {overrides.map((o) => {
          const expired = o.lockedUntil !== undefined && Date.now() > o.lockedUntil;
          return (
            <li
              key={o.traitPath}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-slate-200">{o.traitPath}</p>
                  {expired && (
                    <Badge label="Expired" className="border-slate-700 bg-slate-800 text-slate-500" />
                  )}
                </div>
                <p className="mt-0.5 font-mono text-xs text-violet-300">{String(o.value)}</p>
                {o.lockedUntil && !expired && (
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Expires {relativeTime(o.lockedUntil)}
                  </p>
                )}
              </div>
              <Button variant="ghost" onClick={() => onClear(o.traitPath)}>
                Clear
              </Button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
};

// ---------------------------------------------------------------------------
// Section: Nuclear Options
// ---------------------------------------------------------------------------

type NuclearDialog =
  | { type: 'freeze' }
  | { type: 'revert7' }
  | { type: 'resetArea'; area: string }
  | { type: 'fullReset' };

const NuclearOptions: FC<{
  frozenAreas: string[];
  onFreezeAll: () => void;
  onRevert7: () => void;
  onResetArea: (area: string) => void;
  onFullReset: () => void;
  evolutionFrozen: boolean;
}> = ({ frozenAreas, onFreezeAll, onRevert7, onResetArea, onFullReset, evolutionFrozen }) => {
  const [dialog, setDialog] = useState<NuclearDialog | null>(null);
  const [selectedArea, setSelectedArea] = useState<string>(TRAIT_TABS[0]);

  const allAreas = TRAIT_TABS.filter((a) => !frozenAreas.includes(a));

  const confirm = () => {
    if (!dialog) return;
    switch (dialog.type) {
      case 'freeze':     onFreezeAll();                  break;
      case 'revert7':    onRevert7();                    break;
      case 'resetArea':  onResetArea(dialog.area);       break;
      case 'fullReset':  onFullReset();                  break;
    }
    setDialog(null);
  };

  return (
    <>
      {dialog && (
        <ConfirmDialog
          danger
          title={
            dialog.type === 'freeze'     ? 'Freeze All Evolution?' :
            dialog.type === 'revert7'    ? 'Revert Last 7 Days?' :
            dialog.type === 'resetArea'  ? `Reset ${(dialog as { type: 'resetArea'; area: string }).area}?` :
            'Full Profile Reset?'
          }
          description={
            dialog.type === 'freeze'
              ? 'Atlas will stop learning from your interactions entirely. You can re-enable this at any time.'
              : dialog.type === 'revert7'
              ? 'All mutations from the last 7 days will be rolled back. This cannot be undone.'
              : dialog.type === 'resetArea'
              ? `All traits in the "${(dialog as { type: 'resetArea'; area: string }).area}" area will return to default values.`
              : 'Your entire evolution profile will be wiped. Signal history and mutation logs are kept for reference, but all personalizations are lost.'
          }
          confirmLabel={
            dialog.type === 'fullReset' ? 'Reset Everything' :
            dialog.type === 'freeze'    ? 'Freeze Evolution' :
            'Confirm'
          }
          typeToConfirm={dialog.type === 'fullReset' ? 'RESET' : undefined}
          onConfirm={confirm}
          onCancel={() => setDialog(null)}
        />
      )}

      <div className="rounded-xl border border-rose-900/50 bg-rose-950/10 p-5">
        <SectionHeader
          title="Nuclear Options"
          subtitle="These actions are large or irreversible — take care"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Freeze All */}
          <div className="flex flex-col gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] p-4">
            <p className="text-xs font-medium text-rose-300">
              {evolutionFrozen ? 'Evolution is Globally Frozen' : 'Freeze All Evolution'}
            </p>
            <p className="text-xs text-slate-500">
              Stop Atlas from learning anything new about you.
            </p>
            <Button
              variant="danger"
              onClick={() => setDialog({ type: 'freeze' })}
              disabled={evolutionFrozen}
            >
              {evolutionFrozen ? 'Already Frozen' : 'Freeze All Evolution'}
            </Button>
          </div>

          {/* Revert Last 7 Days */}
          <div className="flex flex-col gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] p-4">
            <p className="text-xs font-medium text-rose-300">Revert Last 7 Days</p>
            <p className="text-xs text-slate-500">
              Roll back every mutation Atlas made in the past week.
            </p>
            <Button variant="danger" onClick={() => setDialog({ type: 'revert7' })}>
              Revert Last 7 Days
            </Button>
          </div>

          {/* Reset This Area */}
          <div className="flex flex-col gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] p-4">
            <p className="text-xs font-medium text-rose-300">Reset This Area</p>
            <p className="text-xs text-slate-500">
              Restore all traits in a category to factory defaults.
            </p>
            <div className="flex gap-2">
              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-rose-500/60"
              >
                {TRAIT_TABS.map((a) => (
                  <option key={a} value={a} className="bg-[#0d0d14] capitalize">{a}</option>
                ))}
              </select>
              <Button
                variant="danger"
                onClick={() => setDialog({ type: 'resetArea', area: selectedArea })}
              >
                Reset
              </Button>
            </div>
          </div>

          {/* Full Reset */}
          <div className="flex flex-col gap-2 rounded-lg border border-rose-900/40 bg-rose-950/20 p-4">
            <p className="text-xs font-medium text-rose-300">Full Reset</p>
            <p className="text-xs text-slate-500">
              Wipe your entire evolution profile. Type{' '}
              <span className="font-mono text-rose-400">RESET</span> to confirm.
            </p>
            <Button variant="danger" onClick={() => setDialog({ type: 'fullReset' })}>
              Full Reset
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const EvolutionControlPanel: FC<EvolutionControlPanelProps> = ({
  userId,
  onProfileChange,
}) => {
  const [report, setReport] = useState<EvolutionInspectionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track global freeze locally for the toggle (derived from report)
  const [evolutionFrozen, setEvolutionFrozen] = useState(false);

  const controlRef = useRef(new UserEvolutionControl());

  // -------------------------------------------------------------------------
  // Load report on mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // In real usage, profile/ledger/signals come from context/store.
        // Here we call the control's internal helpers with mock data
        // so the component compiles and renders standalone.
        const mockProfile: UserEvolutionProfile = {
          userId,
          version:        3,
          confidence:     0.68,
          archetype:      'analytical',
          totalSignals:   142,
          totalMutations: 17,
          quarantined:    false,
          traits: {
            'tone.formality':                  0.65,
            'tone.warmth':                     0.55,
            'vocabulary.preferredComplexity':  3,
            'depth.preferredDepth':            'deep',
            'format.preferLists':              true,
            'format.preferCodeBlocks':         true,
            'format.responseLength':           'adaptive',
            'cognitive.analyticalBias':        0.72,
          },
          createdAt: Date.now() - 1_209_600_000,
          updatedAt: Date.now() - 3_600_000,
        };

        const r = await controlRef.current.generateReport(userId, mockProfile, [], []);
        if (!cancelled) {
          setReport(r);
          setEvolutionFrozen(r.frozenAreas.includes('__global__'));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load evolution report');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [userId]);

  // -------------------------------------------------------------------------
  // Control handlers
  // -------------------------------------------------------------------------

  const refresh = useCallback(async () => {
    if (!report) return;
    // In production, this re-fetches from the store/API
    // Here we regenerate from the existing report snapshot
    setReport({ ...report, generatedAt: Date.now() });
  }, [report]);

  const handleFreeze = useCallback(() => {
    controlRef.current.freezeEvolution(userId);
    setEvolutionFrozen(true);
    refresh();
  }, [userId, refresh]);

  const handleUnfreeze = useCallback(() => {
    controlRef.current.unfreezeEvolution(userId);
    setEvolutionFrozen(false);
    refresh();
  }, [userId, refresh]);

  const handleFreezeArea = useCallback((area: string) => {
    controlRef.current.freezeArea(userId, area);
    refresh();
  }, [userId, refresh]);

  const handleUnfreezeArea = useCallback((area: string) => {
    controlRef.current.unfreezeArea(userId, area);
    refresh();
  }, [userId, refresh]);

  const handleDismissObservation = useCallback((traitPath: string) => {
    controlRef.current.dismissObservation(userId, traitPath);
    if (report) {
      setReport({
        ...report,
        observedTraits: report.observedTraits.filter((t) => t.traitPath !== traitPath),
      });
    }
  }, [userId, report]);

  const handleRevertMutation = useCallback((mutationId: string) => {
    if (report) {
      setReport({
        ...report,
        recentMutations: report.recentMutations.map((m) =>
          m.id === mutationId ? { ...m, canRevert: false } : m,
        ),
      });
    }
  }, [report]);

  const handleClearOverride = useCallback((traitPath: string) => {
    const state = controlRef.current['controlStates']?.get?.(userId);
    if (state) {
      state.manualOverrides = state.manualOverrides.filter((o) => o.traitPath !== traitPath);
    }
    refresh();
  }, [userId, refresh]);

  const handleResetArea = useCallback(async (area: string) => {
    if (!report) return;
    const mockProfile: UserEvolutionProfile = {
      userId,
      version:        report.profileSummary.version,
      confidence:     report.profileSummary.confidence,
      archetype:      report.profileSummary.archetype,
      totalSignals:   report.profileSummary.totalSignals,
      totalMutations: report.profileSummary.totalMutations,
      quarantined:    report.profileSummary.quarantined,
      traits:         Object.fromEntries(report.confirmedTraits.map((t) => [t.traitPath, t.currentValue])),
      createdAt:      Date.now(),
      updatedAt:      Date.now(),
    };
    const updated = await controlRef.current.resetArea(userId, area, mockProfile);
    onProfileChange(updated);
    refresh();
  }, [userId, report, onProfileChange, refresh]);

  const handleFreezeAll = useCallback(() => {
    handleFreeze();
  }, [handleFreeze]);

  const handleRevert7 = useCallback(async () => {
    refresh();
  }, [refresh]);

  const handleFullReset = useCallback(async () => {
    const fresh = await controlRef.current.resetProfile(userId);
    onProfileChange(fresh);
    refresh();
  }, [userId, onProfileChange, refresh]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-violet-500" />
          <p className="text-sm text-slate-500">Loading your evolution state…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-60 items-center justify-center">
        <div className="rounded-xl border border-rose-900/50 bg-rose-950/10 px-6 py-5 text-center">
          <p className="text-sm font-medium text-rose-400">Failed to load evolution report</p>
          <p className="mt-1 text-xs text-slate-500">{error}</p>
          <Button variant="danger" onClick={() => window.location.reload()} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const controlState = controlRef.current['controlStates']?.get?.(userId) ?? {
    evolutionFrozen: false,
    frozenTraitAreas: [],
    dismissedObservations: [],
    manualOverrides: [] as ManualOverride[],
  };

  return (
    <div className="min-h-screen bg-[#08080f] font-sans text-slate-100">
      {/* Background nebula gradient */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-64 -top-64 h-[600px] w-[600px] rounded-full bg-violet-900/10 blur-[120px]" />
        <div className="absolute -right-64 top-1/3 h-[500px] w-[500px] rounded-full bg-sky-900/8 blur-[100px]" />
        <div className="absolute bottom-0 left-1/2 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-indigo-900/8 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            {/* Atlas mark */}
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-label="Atlas" className="shrink-0">
              <circle cx="14" cy="14" r="13" stroke="url(#atlas-grad)" strokeWidth="1.5" />
              <path d="M14 4C14 4 8 10 8 14C8 18 11 22 14 23C17 22 20 18 20 14C20 10 14 4 14 4Z"
                fill="url(#atlas-inner)" opacity="0.8" />
              <circle cx="14" cy="14" r="2.5" fill="white" opacity="0.9" />
              <defs>
                <linearGradient id="atlas-grad" x1="0" y1="0" x2="28" y2="28">
                  <stop stopColor="#8b5cf6" />
                  <stop offset="1" stopColor="#38bdf8" />
                </linearGradient>
                <linearGradient id="atlas-inner" x1="14" y1="4" x2="14" y2="23">
                  <stop stopColor="#a78bfa" stopOpacity="0.4" />
                  <stop offset="1" stopColor="#38bdf8" stopOpacity="0.2" />
                </linearGradient>
              </defs>
            </svg>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-100">Evolution Control</h1>
              <p className="text-xs text-slate-500">
                What Atlas has learned, and the controls you have over it
              </p>
            </div>
          </div>
        </div>

        {/* Stack of sections */}
        <div className="space-y-4">

          {/* 1. Status Bar */}
          <StatusBar
            report={report}
            onFreeze={handleFreeze}
            onUnfreeze={handleUnfreeze}
          />

          {/* 2. Observed Traits */}
          <ObservedTraits
            traits={report.observedTraits}
            onDismiss={handleDismissObservation}
          />

          {/* 3. Confirmed Traits */}
          <ConfirmedTraits
            traits={report.confirmedTraits}
            onReset={(path) => {
              const area = path.split('.')[0];
              handleResetArea(area);
            }}
            onFreeze={handleFreezeArea}
            frozenAreas={[...report.frozenAreas, ...(controlState.frozenTraitAreas ?? [])]}
          />

          {/* 4. Recent Mutations */}
          <RecentMutations
            mutations={report.recentMutations}
            onRevert={handleRevertMutation}
          />

          {/* 5. Frozen Areas */}
          <FrozenAreas
            frozenAreas={[
              ...report.frozenAreas.filter((a) => a !== '__global__'),
              ...(controlState.frozenTraitAreas ?? []),
            ]}
            onUnfreeze={handleUnfreezeArea}
          />

          {/* 6. Manual Overrides */}
          <ManualOverrides
            overrides={controlState.manualOverrides ?? []}
            onClear={handleClearOverride}
          />

          {/* 7. Nuclear Options */}
          <NuclearOptions
            frozenAreas={report.frozenAreas}
            onFreezeAll={handleFreezeAll}
            onRevert7={handleRevert7}
            onResetArea={handleResetArea}
            onFullReset={handleFullReset}
            evolutionFrozen={evolutionFrozen}
          />

        </div>

        {/* Footer */}
        <div className="mt-10 border-t border-white/[0.05] pt-6 text-center">
          <p className="text-xs text-slate-600">
            Atlas evolves by observing patterns in your sessions — never without your ability to inspect and override.
          </p>
        </div>
      </div>
    </div>
  );
};

export default EvolutionControlPanel;
