// Atlas-Audit: [EXEC-MODE] Verified — prefetchChamberForMode resolves mode through tryCoerceActiveMode before CHAMBER_PREFETCH (invalid / widened strings no-op).
// Atlas-Audit: [PERF-P9] Verified — Single-flight prefetch: Chrysalis, CoreSystemsView, RelationshipDynamics, ResonanceChamber (resonance + threads); intelligence trio unchanged.
// Atlas-Audit: [EXEC-EVO] Verified — evolution-layer prefetch loads Chrysalis (matches App routing).
// Atlas-Audit: [EXEC-ROUTE] Verified — Prefetch map covers reality-engine, systems, evolution-layer, people, threads (aligned with App switch).
// Atlas-Audit: [EXEC-QL] Verified — reality-ledger + memory-vault prefetch entries load CoreSystemsView (same chunk as core-systems).
// Atlas-Audit: [PERF-P6] Verified — Shell prefetch helpers (search, rail, settings, codex, bug hunter) mirror Lazy* import specifiers for intent/hover and conditional-mount warming.
// Atlas-Audit: [PERF-P5] Verified — prefetchChamberForMode mirrors lazy import graph so Sidebar hover warms chunks before navigation (no duplicate path drift).
// Atlas-Audit: [PERF-P4] Verified — Lazy GlobalSearch + IntelligenceRail (command/search surfaces) to shrink App entry graph.
// Atlas-Audit: [PERF-P3] Verified — Lazy BugHunter, SettingsMenu, SovereignCodex (shell overlays) alongside chamber lazy map + ChamberSuspenseFallback.
// Atlas-Audit: [PERF-P2] Verified — React.lazy wrappers for App workspace chambers (named exports → default) + Suspense fallback; HomeView/AuthView stay eager in App.
// Atlas-Audit: [INTEGRATION] Chamber dynamic imports resolve through `src/chambers/*` bridges (same chunk targets as `../components/*`).
import { lazy, type ComponentType } from 'react';
import type { AppState } from '../types';
import { tryCoerceActiveMode } from '../lib/atlasWayfinding';

/** `src/chambers/*` may use a named bridge export or `export default function Name`. */
type ChamberModule = Record<string, ComponentType<unknown> | undefined> & {
  default?: ComponentType<unknown>;
};

function pickChamberExport(mod: ChamberModule, name: string): { default: ComponentType<unknown> } {
  const C = mod[name] ?? mod.default;
  if (!C) throw new Error(`Lazy chamber "${name}": missing named export and default`);
  return { default: C };
}

const chamberPrefetchRan = new Set<string>();

const prefetchIntelligenceChambers = () => import('../chambers/IntelligenceChambersViews');

let chrysalisChunkPrefetchStarted = false;
function prefetchChrysalisChunk(): Promise<unknown> {
  if (chrysalisChunkPrefetchStarted) return Promise.resolve();
  chrysalisChunkPrefetchStarted = true;
  return import('../chambers/Chrysalis');
}

let coreSystemsChunkPrefetchStarted = false;
function prefetchCoreSystemsChunk(): Promise<unknown> {
  if (coreSystemsChunkPrefetchStarted) return Promise.resolve();
  coreSystemsChunkPrefetchStarted = true;
  return import('../chambers/CoreSystemsView');
}

let relationshipDynamicsChunkPrefetchStarted = false;
function prefetchRelationshipDynamicsChunk(): Promise<unknown> {
  if (relationshipDynamicsChunkPrefetchStarted) return Promise.resolve();
  relationshipDynamicsChunkPrefetchStarted = true;
  return import('../chambers/RelationshipDynamics');
}

let resonanceChamberChunkPrefetchStarted = false;
function prefetchResonanceChamberChunk(): Promise<unknown> {
  if (resonanceChamberChunkPrefetchStarted) return Promise.resolve();
  resonanceChamberChunkPrefetchStarted = true;
  return import('../chambers/ResonanceChamber');
}

/** Fire-and-forget dynamic import; same module specifiers as Lazy* above so Vite reuses the chunk. */
const CHAMBER_PREFETCH: Partial<Record<AppState['activeMode'], () => Promise<unknown>>> = {
  atlas: () => import('../chambers/AtlasGraphView'),
  capabilities: () => import('../chambers/CapabilitiesView'),
  journal: () => import('../chambers/JournalChamber'),
  'directive-center': () => import('../chambers/DirectiveControlCenter'),
  crucible: () => import('../chambers/CrucibleView'),
  'mind-cartography': () => import('../chambers/MindCartography'),
  'creator-console': () => import('../chambers/ConsoleView'),
  'gap-ledger': () => import('../chambers/GapLedger'),
  'audit-logs': () => import('../chambers/AuditLogView'),
  resonance: prefetchResonanceChamberChunk,
  'change-control': () => import('../chambers/ChangeControl'),
  arena: () => import('../chambers/ArenaMode'),
  forge: () => import('../chambers/ForgeMode'),
  mirror: () => import('../chambers/MirrorMode'),
  signals: () => import('../chambers/SignalsMode'),
  chambers: () => import('../chambers/KnowledgeChamber'),
  lineage: () => import('../chambers/LineageMode'),
  topology: () => import('../chambers/TopologyView'),
  salon: () => import('../chambers/SalonView'),
  signature: () => import('../chambers/CognitiveSignature'),
  discussion: () => import('../chambers/DiscussionBoard'),
  decisions: () => import('../chambers/DecisionsView'),
  scenarios: () => import('../chambers/ScenariosView'),
  doctrine: () => import('../chambers/DoctrineView'),
  'red-team': () => import('../chambers/RedTeamView'),
  pulse: () => import('../chambers/PulseView'),
  council: () => import('../chambers/InnerCouncil'),
  mastery: () => import('../chambers/MasteryTheater'),
  continuity: () => import('../chambers/ContinuityEngine'),
  canon: () => import('../chambers/CanonView'),
  relationships: prefetchRelationshipDynamicsChunk,
  'privacy-center': () => import('../chambers/PrivacyCenter'),
  constitution: () => import('../chambers/ConstitutionView'),
  'life-domains': () => import('../chambers/LifeDomainMap'),
  'operating-manual': () => import('../chambers/OperatingManual'),
  'essential-mode': () => import('../chambers/EssentialMode'),
  'forge-artifact': () => import('../chambers/ForgeArtifact'),
  mirrorforge: () => import('../chambers/Mirrorforge'),
  'core-systems': prefetchCoreSystemsChunk,
  'reality-engine': prefetchCoreSystemsChunk,
  systems: prefetchCoreSystemsChunk,
  'reality-ledger': prefetchCoreSystemsChunk,
  'memory-vault': prefetchCoreSystemsChunk,
  'evolution-layer': prefetchChrysalisChunk,
  people: prefetchRelationshipDynamicsChunk,
  threads: prefetchResonanceChamberChunk,
  'strategic-modeling': () => import('../chambers/StrategicModelingWorkbench'),
  'sovereign-atrium': () => import('../chambers/SovereignAtrium'),
  'trajectory-observatory': prefetchIntelligenceChambers,
  'friction-cartography': prefetchIntelligenceChambers,
  'threshold-forge': prefetchIntelligenceChambers,
  chrysalis: prefetchChrysalisChunk,
  vault: () => import('../chambers/VaultView'),
  'drift-center': () => import('../chambers/DriftView'),
  roadmap: () => import('../chambers/EvolutionRoadmap'),
  'second-sun': () => import('../chambers/SecondSun'),
  'final-filter': () => import('../chambers/FinalFilter'),
  'deep-work': () => import('../chambers/DeepWorkChamber'),
  leviathan: () => import('../chambers/LeviathanMode'),
  onboarding: () => import('../chambers/Onboarding'),
  'humanization-controls': () => import('../chambers/HumanizationControls'),
};

export function prefetchChamberForMode(mode: AppState['activeMode']): void {
  const resolved =
    typeof mode === 'string' ? tryCoerceActiveMode(mode) : undefined;
  if (!resolved) return;
  if (resolved === 'today-in-atlas' || resolved === 'auth') return;
  if (chamberPrefetchRan.has(resolved)) return;
  const fn = CHAMBER_PREFETCH[resolved];
  if (!fn) return;
  chamberPrefetchRan.add(resolved);
  void fn();
}

export function ChamberSuspenseFallback() {
  return (
    <div className="flex h-full w-full min-h-[12rem] items-center justify-center bg-obsidian obsidian-surface">
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-8 w-8 rounded-full border-2 border-gold/20 border-t-gold animate-spin"
          aria-hidden
        />
        <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-gold/60">
          Loading chamber…
        </span>
      </div>
    </div>
  );
}

export const LazyAtlasGraphView = lazy(() =>
  import('../chambers/AtlasGraphView').then((m) => pickChamberExport(m, 'AtlasGraphView'))
);
export const LazyCapabilitiesView = lazy(() =>
  import('../chambers/CapabilitiesView').then((m) => pickChamberExport(m, 'CapabilitiesView'))
);
export const LazyJournalChamber = lazy(() =>
  import('../chambers/JournalChamber').then((m) => pickChamberExport(m, 'JournalChamber'))
);
export const LazyDirectiveControlCenter = lazy(() =>
  import('../chambers/DirectiveControlCenter').then((m) => pickChamberExport(m, 'DirectiveControlCenter'))
);
export const LazyCrucibleView = lazy(() =>
  import('../chambers/CrucibleView').then((m) => pickChamberExport(m, 'CrucibleView'))
);
export const LazyMindCartography = lazy(() =>
  import('../chambers/MindCartography').then((m) => pickChamberExport(m, 'MindCartography'))
);
export const LazyConsoleView = lazy(() =>
  import('../chambers/ConsoleView').then((m) => pickChamberExport(m, 'ConsoleView'))
);
export const LazyGapLedger = lazy(() =>
  import('../chambers/GapLedger').then((m) => pickChamberExport(m, 'GapLedger'))
);
export const LazyAuditLogView = lazy(() =>
  import('../chambers/AuditLogView').then((m) => pickChamberExport(m, 'AuditLogView'))
);
export const LazyResonanceChamber = lazy(() =>
  import('../chambers/ResonanceChamber').then((m) => pickChamberExport(m, 'ResonanceChamber'))
);
export const LazyChangeControl = lazy(() =>
  import('../chambers/ChangeControl').then((m) => pickChamberExport(m, 'ChangeControl'))
);
export const LazyArenaMode = lazy(() =>
  import('../chambers/ArenaMode').then((m) => pickChamberExport(m, 'ArenaMode'))
);
export const LazyForgeMode = lazy(() =>
  import('../chambers/ForgeMode').then((m) => pickChamberExport(m, 'ForgeMode'))
);
export const LazyMirrorMode = lazy(() =>
  import('../chambers/MirrorMode').then((m) => pickChamberExport(m, 'MirrorMode'))
);
export const LazySignalsMode = lazy(() =>
  import('../chambers/SignalsMode').then((m) => pickChamberExport(m, 'SignalsMode'))
);
export const LazyKnowledgeChamber = lazy(() =>
  import('../chambers/KnowledgeChamber').then((m) => pickChamberExport(m, 'KnowledgeChamber'))
);
export const LazyLineageMode = lazy(() =>
  import('../chambers/LineageMode').then((m) => pickChamberExport(m, 'LineageMode'))
);
export const LazyTopologyView = lazy(() =>
  import('../chambers/TopologyView').then((m) => pickChamberExport(m, 'TopologyView'))
);
export const LazySalonView = lazy(() =>
  import('../chambers/SalonView').then((m) => pickChamberExport(m, 'SalonView'))
);
export const LazyCognitiveSignature = lazy(() =>
  import('../chambers/CognitiveSignature').then((m) => pickChamberExport(m, 'CognitiveSignature'))
);
export const LazyDiscussionBoard = lazy(() =>
  import('../chambers/DiscussionBoard').then((m) => pickChamberExport(m, 'DiscussionBoard'))
);
export const LazyDecisionsView = lazy(() =>
  import('../chambers/DecisionsView').then((m) => pickChamberExport(m, 'DecisionsView'))
);
export const LazyScenariosView = lazy(() =>
  import('../chambers/ScenariosView').then((m) => pickChamberExport(m, 'ScenariosView'))
);
export const LazyDoctrineView = lazy(() =>
  import('../chambers/DoctrineView').then((m) => pickChamberExport(m, 'DoctrineView'))
);
export const LazyRedTeamView = lazy(() =>
  import('../chambers/RedTeamView').then((m) => pickChamberExport(m, 'RedTeamView'))
);
export const LazyPulseView = lazy(() =>
  import('../chambers/PulseView').then((m) => pickChamberExport(m, 'PulseView'))
);
export const LazyInnerCouncil = lazy(() =>
  import('../chambers/InnerCouncil').then((m) => pickChamberExport(m, 'InnerCouncil'))
);
export const LazyMasteryTheater = lazy(() =>
  import('../chambers/MasteryTheater').then((m) => pickChamberExport(m, 'MasteryTheater'))
);
export const LazyContinuityEngine = lazy(() =>
  import('../chambers/ContinuityEngine').then((m) => pickChamberExport(m, 'ContinuityEngine'))
);
export const LazyCanonView = lazy(() =>
  import('../chambers/CanonView').then((m) => pickChamberExport(m, 'CanonView'))
);
export const LazyRelationshipDynamics = lazy(() =>
  import('../chambers/RelationshipDynamics').then((m) => pickChamberExport(m, 'RelationshipDynamics'))
);
export const LazyPrivacyCenter = lazy(() =>
  import('../chambers/PrivacyCenter').then((m) => pickChamberExport(m, 'PrivacyCenter'))
);
export const LazyConstitutionView = lazy(() =>
  import('../chambers/ConstitutionView').then((m) => pickChamberExport(m, 'ConstitutionView'))
);
export const LazyLifeDomainMap = lazy(() =>
  import('../chambers/LifeDomainMap').then((m) => pickChamberExport(m, 'LifeDomainMap'))
);
export const LazyOperatingManual = lazy(() =>
  import('../chambers/OperatingManual').then((m) => pickChamberExport(m, 'OperatingManual'))
);
export const LazyEssentialMode = lazy(() =>
  import('../chambers/EssentialMode').then((m) => pickChamberExport(m, 'EssentialMode'))
);
export const LazyForgeArtifact = lazy(() =>
  import('../chambers/ForgeArtifact').then((m) => pickChamberExport(m, 'ForgeArtifact'))
);
export const LazyMirrorforge = lazy(() =>
  import('../chambers/Mirrorforge').then((m) => pickChamberExport(m, 'Mirrorforge'))
);
export const LazyCoreSystemsView = lazy(() =>
  import('../chambers/CoreSystemsView').then((m) => pickChamberExport(m, 'CoreSystemsView'))
);
export const LazyStrategicModelingWorkbench = lazy(() =>
  import('../chambers/StrategicModelingWorkbench').then((m) => pickChamberExport(m, 'StrategicModelingWorkbench'))
);
export const LazySovereignAtrium = lazy(() =>
  import('../chambers/SovereignAtrium').then((m) => pickChamberExport(m, 'SovereignAtrium'))
);
export const LazyTrajectoryObservatoryView = lazy(() =>
  import('../chambers/IntelligenceChambersViews').then((m) => pickChamberExport(m, 'TrajectoryObservatoryView'))
);
export const LazyFrictionCartographyView = lazy(() =>
  import('../chambers/IntelligenceChambersViews').then((m) => pickChamberExport(m, 'FrictionCartographyView'))
);
export const LazyThresholdProtocolForgeView = lazy(() =>
  import('../chambers/IntelligenceChambersViews').then((m) => pickChamberExport(m, 'ThresholdProtocolForgeView'))
);
export const LazyChrysalis = lazy(() =>
  import('../chambers/Chrysalis').then((m) => pickChamberExport(m, 'Chrysalis'))
);
export const LazyVaultView = lazy(() =>
  import('../chambers/VaultView').then((m) => pickChamberExport(m, 'VaultView'))
);
export const LazyDriftView = lazy(() =>
  import('../chambers/DriftView').then((m) => pickChamberExport(m, 'DriftView'))
);
export const LazyEvolutionRoadmap = lazy(() =>
  import('../chambers/EvolutionRoadmap').then((m) => pickChamberExport(m, 'EvolutionRoadmap'))
);
export const LazySecondSun = lazy(() =>
  import('../chambers/SecondSun').then((m) => pickChamberExport(m, 'SecondSun'))
);
export const LazyFinalFilter = lazy(() =>
  import('../chambers/FinalFilter').then((m) => pickChamberExport(m, 'FinalFilter'))
);
export const LazyDeepWorkChamber = lazy(() =>
  import('../chambers/DeepWorkChamber').then((m) => pickChamberExport(m, 'DeepWorkChamber'))
);
export const LazyLeviathanMode = lazy(() =>
  import('../chambers/LeviathanMode').then((m) => pickChamberExport(m, 'LeviathanMode'))
);
export const LazyOnboarding = lazy(() =>
  import('../chambers/Onboarding').then((m) => pickChamberExport(m, 'Onboarding'))
);
export const LazyHumanizationControls = lazy(() =>
  import('../chambers/HumanizationControls').then((m) => pickChamberExport(m, 'HumanizationControls'))
);

export const LazyBugHunter = lazy(() =>
  import('./BugHunter').then((m) => pickChamberExport(m, 'BugHunter'))
);
export const LazySettingsMenu = lazy(() =>
  import('./SettingsMenu').then((m) => pickChamberExport(m, 'SettingsMenu'))
);
export const LazySovereignCodex = lazy(() =>
  import('./SovereignCodex').then((m) => pickChamberExport(m, 'SovereignCodex'))
);

export const LazyGlobalSearch = lazy(() =>
  import('./GlobalSearch').then((m) => pickChamberExport(m, 'GlobalSearch'))
);
export const LazyIntelligenceRail = lazy(() =>
  import('./IntelligenceRail').then((m) => pickChamberExport(m, 'IntelligenceRail'))
);

const shellPrefetchRan = new Set<string>();

function runShellPrefetch(key: string, loader: () => Promise<unknown>): void {
  if (shellPrefetchRan.has(key)) return;
  shellPrefetchRan.add(key);
  void loader();
}

export function prefetchGlobalSearchModule(): void {
  runShellPrefetch('global-search', () => import('./GlobalSearch'));
}

export function prefetchIntelligenceRailModule(): void {
  runShellPrefetch('intelligence-rail', () => import('./IntelligenceRail'));
}

export function prefetchSettingsMenuModule(): void {
  runShellPrefetch('settings-menu', () => import('./SettingsMenu'));
}

export function prefetchSovereignCodexModule(): void {
  runShellPrefetch('sovereign-codex', () => import('./SovereignCodex'));
}

export function prefetchBugHunterModule(): void {
  runShellPrefetch('bug-hunter', () => import('./BugHunter'));
}
