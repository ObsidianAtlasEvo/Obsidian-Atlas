// Reality Spine — canonical implementation-state registry.
//
// Doctrine (Canonical Master Vision §IX, §IV, §XXXII):
//   "Atlas must distinguish vision, doctrine, specification, design, prompt,
//    mockup, schema, scaffold, partial implementation, integrated implementation,
//    runtime-confirmed behavior, evaluated behavior, and production-ready behavior.
//    These categories must never be collapsed into 'done.'"
//   "The interface, documentation, and product claims must reflect the actual state."
//
// This registry is the single source of truth for what each Atlas surface
// actually is. It is typed as a total Record over ActiveMode so that adding a
// mode without declaring its reality state fails `tsc` — a feature cannot
// enter the interface without an honest classification.
//
// Rules for maintaining this file:
//   1. States are downgraded freely and upgraded only with evidence.
//   2. `evidence` cites the file, route, or behavior that justifies the state.
//   3. `gaps` names what prevents the next state. Empty gaps are suspicious.
//   4. Never mark RUNTIME_CONFIRMED or above from memory — only from a
//      verified run. Nothing in this file currently claims either.

import type { AppState } from '../types';

export type ActiveMode = AppState['activeMode'];

/** Canonical implementation states, in ascending order of reality (§IX). */
export const IMPLEMENTATION_STATES = [
  'VISION_ONLY',
  'DOCTRINE_DEFINED',
  'DESIGN_SPECIFIED',
  'SCAFFOLDED',
  'BACKEND_ONLY',
  'FRONTEND_ONLY',
  'PARTIALLY_INTEGRATED',
  'INTEGRATED_UNVERIFIED',
  'RUNTIME_CONFIRMED',
  'EVALUATED',
  'PRODUCTION_READY',
  'DEGRADED',
  'RETIRED',
] as const;

export type ImplementationState = (typeof IMPLEMENTATION_STATES)[number];

export interface FeatureRecord {
  /** Route mode this record governs. */
  mode: ActiveMode;
  /** Human title, matching wayfinding where one exists. */
  title: string;
  /** Experience domain used for grouping. */
  domain: string;
  /** Honest implementation state. See maintenance rules above. */
  state: ImplementationState;
  /** What justifies the state — file paths, registered routes, observed behavior. */
  evidence: string;
  /** What prevents the next state. */
  gaps: string[];
}

/**
 * Ordering tier for display: how much of the promise is real.
 * 0 = idea only · 1 = code exists somewhere · 2 = usable surface · 3 = verified.
 */
export function stateTier(state: ImplementationState): 0 | 1 | 2 | 3 {
  switch (state) {
    case 'VISION_ONLY':
    case 'DOCTRINE_DEFINED':
    case 'DESIGN_SPECIFIED':
      return 0;
    case 'SCAFFOLDED':
    case 'BACKEND_ONLY':
    case 'RETIRED':
      return 1;
    case 'FRONTEND_ONLY':
    case 'PARTIALLY_INTEGRATED':
    case 'INTEGRATED_UNVERIFIED':
    case 'DEGRADED':
      return 2;
    case 'RUNTIME_CONFIRMED':
    case 'EVALUATED':
    case 'PRODUCTION_READY':
      return 3;
  }
}

const LOCAL_ONLY_GAP =
  'Persists to local store only; atlas-backend never sees this data (no memory extraction, no governance, no provenance).';
const NO_UI_GAP = 'No user-facing surface; route renders PlaceholderChamber.';

/**
 * The ledger. First audited 2026-07-19 against ChamberView routing, chamber source,
 * and atlas-backend registered routes (src/index.ts). Updated same day: the Atlas
 * chamber (mode `atlas`) now streams through the governed backend (`atlasOmniStream.ts`
 * → `/v1/chat/omni-stream`) instead of calling Ollama directly from the browser — see
 * its entry below for the current, unverified-at-runtime state. ModelHubChamber and
 * Atlas are the two chambers now known to call atlas-backend; most others remain
 * local-only (LOCAL_ONLY_GAP below).
 */
export const REALITY_SPINE: Record<ActiveMode, FeatureRecord> = {
  // ── Command ──────────────────────────────────────────────────────────────
  'sovereign-atrium': {
    mode: 'sovereign-atrium', title: 'Sovereign atrium', domain: 'Command',
    state: 'BACKEND_ONLY',
    evidence: 'GET /v1/cognitive/sovereign-overview registered (sovereignOverviewRoutes.ts); UI is a placeholder.',
    gaps: ['No chamber consumes the overview endpoint.', NO_UI_GAP],
  },
  'today-in-atlas': {
    mode: 'today-in-atlas', title: 'Home — prepared center', domain: 'Command',
    state: 'FRONTEND_ONLY',
    evidence: 'Routed to PulseChamber (ChamberView.tsx), which renders from local store state only.',
    gaps: [
      LOCAL_ONLY_GAP,
      'Home does not read priorities, unfinished business, or memory from any governed source.',
      'A richer alternative (src/components/HomeView.tsx, omni-stream wired) was found and evaluated, then deleted: it depended on a Tailwind utility design system (gold-500/ivory/stone/obsidian-surface/glass-obsidian/instrument-label) with zero definitions anywhere in this repo\'s CSS, so mounting it would have rendered unstyled. See atlas-governance/REALITY_AUDIT_2026-07-19.md §11. A real richer Home (priorities, unfinished business, memory, inquiry) remains open work — build it against the live design system (CSS custom properties in atlas-tokens.css), not by reviving the deleted file.',
    ],
  },
  'directive-center': {
    mode: 'directive-center', title: 'Directive center', domain: 'Command',
    state: 'FRONTEND_ONLY',
    evidence: 'DirectiveCenterChamber; directives held in Zustand (persisted to IDB).',
    gaps: [LOCAL_ONLY_GAP, 'Directives do not condition model behavior — the chat path never reads them.'],
  },
  'essential-mode': {
    mode: 'essential-mode', title: 'Essential mode', domain: 'Command',
    state: 'DOCTRINE_DEFINED',
    evidence: 'Vision §XXVI (progressive complexity). Placeholder only.',
    gaps: [NO_UI_GAP],
  },

  // ── Conversation core ────────────────────────────────────────────────────
  atlas: {
    mode: 'atlas', title: 'Atlas chamber (chat)', domain: 'Core',
    state: 'INTEGRATED_UNVERIFIED',
    evidence:
      'Streams through the governed backend via src/lib/atlasOmniStream.ts → POST /v1/chat/omni-stream. ' +
      'Runtime pass 2026-07-19 (local: tsx src/index.ts + Ollama): the exact request shape this chamber sends ' +
      'was confirmed end-to-end over SSE — status → routing → route → delta tokens → done {traceId, requestId, ' +
      'reply, surface: god_mode_local, model, evolution: scheduled}; 200 after ~39s of real local inference; ' +
      'async Overseer lens ran post-response and degraded non-fatally on a dead Groq key exactly as coded. ' +
      'The backend CONTRACT is runtime-confirmed; the chamber UI itself has not been clicked through (auth ' +
      'gate requires a local account), so the feature stays below RUNTIME_CONFIRMED.',
    gaps: [
      'UI click-through pending: send/stream/abort/persist in the real browser behind the local auth gate.',
      'npm run dev starts atlas-backend/src/server.ts (lite server, no omni-stream); the governed pipeline only runs via src/index.ts — dev script fixed this pass, see audit §14.',
      'Cloud lanes unverifiable here: Groq and Supabase keys on this machine return 401 (dead credentials, not code defects).',
      'Corrections do not yet mutate memory state client-side (§VII) — that lives entirely in the Overseer/evolution backend loop.',
    ],
  },

  // ── Doctrine ─────────────────────────────────────────────────────────────
  constitution: {
    mode: 'constitution', title: 'Personal constitution', domain: 'Doctrine',
    state: 'FRONTEND_ONLY',
    evidence: 'ConstitutionChamber with local state. Backend constitutionalCoreService (versioned, supersession-aware, SQLite) exists and is routed — but this chamber never calls it.',
    gaps: ['Two constitutions exist: a local UI one and a governed backend one, disconnected.', LOCAL_ONLY_GAP],
  },
  doctrine: {
    mode: 'doctrine', title: 'Doctrine hall', domain: 'Doctrine',
    state: 'FRONTEND_ONLY',
    evidence: 'DoctrineChamber with local store.',
    gaps: ['No doctrine graduation lifecycle (§XIII: signal→pattern→theory→principle→law).', LOCAL_ONLY_GAP],
  },
  decisions: {
    mode: 'decisions', title: 'Decision ledger', domain: 'Doctrine',
    state: 'FRONTEND_ONLY',
    evidence: 'DecisionsChamber with local store. Backend decisionLedgerService exists, unconnected.',
    gaps: ['No outcome/retrospective loop.', LOCAL_ONLY_GAP],
  },
  scenarios: {
    mode: 'scenarios', title: 'Scenario chamber', domain: 'Doctrine',
    state: 'FRONTEND_ONLY',
    evidence: 'ScenariosChamber with local store.',
    gaps: [LOCAL_ONLY_GAP],
  },
  'life-domains': {
    mode: 'life-domains', title: 'Life domains', domain: 'Doctrine',
    state: 'DOCTRINE_DEFINED',
    evidence: 'LifeDomainMap.tsx exists but is not routed; mode renders placeholder.',
    gaps: [NO_UI_GAP],
  },
  'operating-manual': {
    mode: 'operating-manual', title: 'Operating manual', domain: 'Doctrine',
    state: 'DOCTRINE_DEFINED',
    evidence: 'OperatingManual.tsx exists but is not routed; mode renders placeholder.',
    gaps: [NO_UI_GAP],
  },

  // ── Bridge / intelligence ────────────────────────────────────────────────
  resonance: {
    mode: 'resonance', title: 'Resonance engine', domain: 'Bridge',
    state: 'FRONTEND_ONLY',
    evidence: 'ResonanceChamber with local resonance state slice.',
    gaps: [LOCAL_ONLY_GAP],
  },
  pulse: {
    mode: 'pulse', title: 'Intelligence pulse', domain: 'Bridge',
    state: 'FRONTEND_ONLY',
    evidence: 'PulseChamber renders local pulse items. Still aliased with `today-in-atlas` in ChamberView.tsx — same component serves both entry points today; splitting them requires a real, distinct Home surface first (see `today-in-atlas` gaps).',
    gaps: ['Pulse items are not derived from any signal pipeline.', LOCAL_ONLY_GAP],
  },
  council: {
    mode: 'council', title: 'Inner council', domain: 'Bridge',
    state: 'FRONTEND_ONLY',
    evidence: 'CouncilChamber; lenses run client-side.',
    gaps: ['Lens disagreement/synthesis not persisted as claims or doctrine (§XIV).', LOCAL_ONLY_GAP],
  },
  signals: {
    mode: 'signals', title: 'Signals mode', domain: 'Bridge',
    state: 'FRONTEND_ONLY',
    evidence: 'SignalsChamber with local store.',
    gaps: ['No detection pipeline; signals are hand-entered.', LOCAL_ONLY_GAP],
  },
  threads: {
    mode: 'threads', title: 'Resonance threads', domain: 'Bridge',
    state: 'DOCTRINE_DEFINED',
    evidence: 'Placeholder only.',
    gaps: [NO_UI_GAP],
  },
  salon: {
    mode: 'salon', title: 'Salon', domain: 'Bridge',
    state: 'DOCTRINE_DEFINED',
    evidence: 'SalonView.tsx exists unrouted; mode renders placeholder.',
    gaps: [NO_UI_GAP],
  },
  discussion: {
    mode: 'discussion', title: 'Discussion board', domain: 'Bridge',
    state: 'DOCTRINE_DEFINED',
    evidence: 'DiscussionBoard.tsx exists unrouted; mode renders placeholder.',
    gaps: [NO_UI_GAP],
  },

  // ── Continuity ───────────────────────────────────────────────────────────
  journal: {
    mode: 'journal', title: 'Journal chamber', domain: 'Continuity',
    state: 'FRONTEND_ONLY',
    evidence: 'JournalChamber with persisted local entries.',
    gaps: ['Entries yield no memory candidates; journal-derived inference layer absent (§XI).', LOCAL_ONLY_GAP],
  },
  'deep-work': {
    mode: 'deep-work', title: 'Deep work chamber', domain: 'Continuity',
    state: 'DOCTRINE_DEFINED',
    evidence: 'DeepWorkChamber.tsx exists unrouted; mode renders placeholder.',
    gaps: [NO_UI_GAP],
  },
  continuity: {
    mode: 'continuity', title: 'Continuity engine', domain: 'Continuity',
    state: 'FRONTEND_ONLY',
    evidence: 'ContinuityChamber with local store.',
    gaps: ['No longitudinal change detection; backend longitudinalRoutes exist, unconnected.', LOCAL_ONLY_GAP],
  },
  mastery: {
    mode: 'mastery', title: 'Mastery theater', domain: 'Continuity',
    state: 'FRONTEND_ONLY',
    evidence: 'MasteryChamber with local store.',
    gaps: [LOCAL_ONLY_GAP],
  },
  relationships: {
    mode: 'relationships', title: 'Relationships', domain: 'Continuity',
    state: 'FRONTEND_ONLY',
    evidence: 'RelationshipsChamber with local store.',
    gaps: [LOCAL_ONLY_GAP],
  },
  people: {
    mode: 'people', title: 'People & relationships', domain: 'Continuity',
    state: 'FRONTEND_ONLY',
    evidence: 'Alias of RelationshipsChamber.',
    gaps: [LOCAL_ONLY_GAP],
  },
  signature: {
    mode: 'signature', title: 'Cognitive signature', domain: 'Continuity',
    state: 'DOCTRINE_DEFINED',
    evidence: 'CognitiveSignature.tsx exists unrouted; mode renders placeholder. Backend cognitiveTwinService exists, unconnected.',
    gaps: ['Signature dimensions (§VIII) have no evidence-linked model.', NO_UI_GAP],
  },

  // ── Map ──────────────────────────────────────────────────────────────────
  'mind-cartography': {
    mode: 'mind-cartography', title: 'Mind cartography', domain: 'Map',
    state: 'FRONTEND_ONLY',
    evidence: 'TopologyChamber; backend mindMapRoutes + /v1/cognitive/graph/* exist, unconnected.',
    gaps: ['Graph edges are untyped relative to §XIV (supports/contradicts/supersedes…).', LOCAL_ONLY_GAP],
  },
  topology: {
    mode: 'topology', title: 'Topology view', domain: 'Map',
    state: 'FRONTEND_ONLY',
    evidence: 'Alias of TopologyChamber.',
    gaps: [LOCAL_ONLY_GAP],
  },
  chambers: {
    mode: 'chambers', title: 'Knowledge chambers', domain: 'Map',
    state: 'DOCTRINE_DEFINED',
    evidence: 'Placeholder only.',
    gaps: [NO_UI_GAP],
  },
  lineage: {
    mode: 'lineage', title: 'Lineage mode', domain: 'Map',
    state: 'FRONTEND_ONLY',
    evidence: 'Routed to ContinuityChamber.',
    gaps: [LOCAL_ONLY_GAP],
  },

  // ── Pressure ─────────────────────────────────────────────────────────────
  crucible: {
    mode: 'crucible', title: 'Crucible', domain: 'Pressure',
    state: 'FRONTEND_ONLY',
    evidence: 'CrucibleChamber with local store.',
    gaps: ['Pressure-testing does not attack via model calls; adversarial output is not persisted as claims.', LOCAL_ONLY_GAP],
  },
  'red-team': {
    mode: 'red-team', title: 'Red team', domain: 'Pressure',
    state: 'FRONTEND_ONLY',
    evidence: 'Alias of CrucibleChamber.',
    gaps: [LOCAL_ONLY_GAP],
  },
  mirrorforge: {
    mode: 'mirrorforge', title: 'Mirrorforge', domain: 'Pressure',
    state: 'FRONTEND_ONLY',
    evidence: 'MirrorForgeChamber with local store.',
    gaps: ['Reflections are not evidence-bound to recorded patterns (§XV).', LOCAL_ONLY_GAP],
  },
  mirror: {
    mode: 'mirror', title: 'Mirror mode', domain: 'Pressure',
    state: 'FRONTEND_ONLY',
    evidence: 'Alias of MirrorForgeChamber.',
    gaps: [LOCAL_ONLY_GAP],
  },
  forge: {
    mode: 'forge', title: 'Forge mode', domain: 'Pressure',
    state: 'FRONTEND_ONLY',
    evidence: 'ForgeChamber with local store. Backend /v1/cognitive/forge exists, unconnected.',
    gaps: [LOCAL_ONLY_GAP],
  },
  'forge-artifact': {
    mode: 'forge-artifact', title: 'Forge artifact', domain: 'Pressure',
    state: 'FRONTEND_ONLY',
    evidence: 'Alias of ForgeChamber.',
    gaps: [LOCAL_ONLY_GAP],
  },
  'final-filter': {
    mode: 'final-filter', title: 'Final filter', domain: 'Pressure',
    state: 'DOCTRINE_DEFINED',
    evidence: 'FinalFilter.tsx exists unrouted; mode renders placeholder.',
    gaps: [NO_UI_GAP],
  },
  leviathan: {
    mode: 'leviathan', title: 'Leviathan', domain: 'Pressure',
    state: 'DOCTRINE_DEFINED',
    evidence: 'LeviathanMode.tsx exists unrouted; mode renders placeholder.',
    gaps: [NO_UI_GAP],
  },
  arena: {
    mode: 'arena', title: 'Arena mode', domain: 'Pressure',
    state: 'DOCTRINE_DEFINED',
    evidence: 'ArenaMode.tsx exists unrouted; mode renders placeholder.',
    gaps: [NO_UI_GAP],
  },

  // ── Evidence ─────────────────────────────────────────────────────────────
  'reality-engine': {
    mode: 'reality-engine', title: 'Reality engine', domain: 'Evidence',
    state: 'FRONTEND_ONLY',
    evidence: 'RealityEngineChamber with local store.',
    gaps: ['Prediction→outcome comparison not linked to decisions or claims.', LOCAL_ONLY_GAP],
  },
  systems: {
    mode: 'systems', title: 'Core systems', domain: 'Evidence',
    state: 'FRONTEND_ONLY',
    evidence: 'Alias of RealityEngineChamber.',
    gaps: [LOCAL_ONLY_GAP],
  },
  'memory-vault': {
    mode: 'memory-vault', title: 'Memory vault', domain: 'Evidence',
    state: 'FRONTEND_ONLY',
    evidence: 'MemoryVaultChamber with local store. Backend memories table + context assembler exist, unconnected.',
    gaps: [
      'Vault does not display backend memories; provenance/confidence/state metadata (§VII) absent.',
      'Correction here does not alter what any model sees.',
    ],
  },
  'reality-ledger': {
    mode: 'reality-ledger', title: 'Reality ledger', domain: 'Evidence',
    state: 'FRONTEND_ONLY',
    evidence: 'RealityLedgerChamber renders this registry (src/reality/realitySpine.ts). States hand-audited 2026-07-19.',
    gaps: [
      'States are maintained by audit, not derived from runtime probes.',
      'No backend persistence; the ledger cannot yet record state transitions over time.',
    ],
  },
  canon: {
    mode: 'canon', title: 'Canon', domain: 'Evidence',
    state: 'FRONTEND_ONLY',
    evidence: 'CanonChamber with local store.',
    gaps: ['No source lineage, trust maps, or citation memory (§X).', LOCAL_ONLY_GAP],
  },
  vault: {
    mode: 'vault', title: 'Sovereign vault', domain: 'Evidence',
    state: 'DOCTRINE_DEFINED',
    evidence: 'VaultView re-export exists unrouted; mode renders placeholder.',
    gaps: [NO_UI_GAP],
  },
  'core-systems': {
    mode: 'core-systems', title: 'Model hub', domain: 'System',
    state: 'PARTIALLY_INTEGRATED',
    evidence: 'ModelHubChamber calls atlas-backend model routes — the only chamber that talks to the backend.',
    gaps: ['Routing preferences set here do not govern the Atlas chat path, which calls Ollama directly.'],
  },
  capabilities: {
    mode: 'capabilities', title: 'Capabilities library', domain: 'System',
    state: 'PARTIALLY_INTEGRATED',
    evidence: 'Alias of ModelHubChamber.',
    gaps: ['Capability claims are not linked to this ledger’s states.'],
  },

  // ── Evolution ────────────────────────────────────────────────────────────
  chrysalis: {
    mode: 'chrysalis', title: 'Chrysalis lab', domain: 'Evolution',
    state: 'FRONTEND_ONLY',
    evidence: 'ChrysalisChamber with local store. Backend evolution pipeline (datasetWriter, evalEngine, LoRA staging) exists, unconnected.',
    gaps: [LOCAL_ONLY_GAP],
  },
  'evolution-layer': {
    mode: 'evolution-layer', title: 'Evolution layer', domain: 'Evolution',
    state: 'DOCTRINE_DEFINED',
    evidence: 'Placeholder only.',
    gaps: [NO_UI_GAP],
  },
  roadmap: {
    mode: 'roadmap', title: 'Product roadmap', domain: 'Evolution',
    state: 'DOCTRINE_DEFINED',
    evidence: 'EvolutionRoadmap.tsx exists unrouted; mode renders placeholder.',
    gaps: [NO_UI_GAP],
  },

  // ── Strategy / intelligence chambers ─────────────────────────────────────
  'strategic-modeling': {
    mode: 'strategic-modeling', title: 'Strategic modeling', domain: 'Strategy',
    state: 'BACKEND_ONLY',
    evidence: 'strategicModelingRoutes registered; StrategicModelingWorkbench.tsx exists unrouted; mode renders placeholder.',
    gaps: ['Workbench is not routed and does not call its routes.', NO_UI_GAP],
  },
  'second-sun': {
    mode: 'second-sun', title: 'Second sun', domain: 'Strategy',
    state: 'DOCTRINE_DEFINED',
    evidence: 'SecondSun.tsx exists unrouted; mode renders placeholder.',
    gaps: [NO_UI_GAP],
  },
  'trajectory-observatory': {
    mode: 'trajectory-observatory', title: 'Trajectory observatory', domain: 'Intelligence',
    state: 'BACKEND_ONLY',
    evidence: '/v1/cognitive/trajectory/* registered (compute, snapshots); UI is a placeholder.',
    gaps: [NO_UI_GAP],
  },
  'friction-cartography': {
    mode: 'friction-cartography', title: 'Friction cartography', domain: 'Intelligence',
    state: 'BACKEND_ONLY',
    evidence: '/v1/cognitive/friction/* registered (items, rebuild); UI is a placeholder.',
    gaps: [NO_UI_GAP],
  },
  'threshold-forge': {
    mode: 'threshold-forge', title: 'Threshold forge', domain: 'Intelligence',
    state: 'BACKEND_ONLY',
    evidence: '/v1/cognitive/threshold/* registered (protocols, match, activations); UI is a placeholder.',
    gaps: [NO_UI_GAP],
  },
  'drift-center': {
    mode: 'drift-center', title: 'Drift center', domain: 'Governance',
    state: 'SCAFFOLDED',
    evidence: 'services/driftDetection.ts and DriftView.tsx exist; neither is wired to a route or registered endpoint.',
    gaps: ['Detection logic has no data source and no surface.', NO_UI_GAP],
  },

  // ── Governance ───────────────────────────────────────────────────────────
  'privacy-center': {
    mode: 'privacy-center', title: 'Privacy center', domain: 'Governance',
    state: 'BACKEND_ONLY',
    evidence: '/api/governance/retention/* registered (status, holds, erasure, audit); PrivacyCenter.tsx exists unrouted; mode renders placeholder.',
    gaps: ['Retention, erasure, and holds are invisible to the user (§XXVII requires inspectability).', NO_UI_GAP],
  },
  'audit-logs': {
    mode: 'audit-logs', title: 'Audit logs', domain: 'Governance',
    state: 'FRONTEND_ONLY',
    evidence: 'AuditLogsChamber with local store. Backend governanceAudit exists, unconnected.',
    gaps: ['Displays local events only; backend governance audit trail not surfaced.', LOCAL_ONLY_GAP],
  },
  'change-control': {
    mode: 'change-control', title: 'Change control', domain: 'Governance',
    state: 'FRONTEND_ONLY',
    evidence: 'ChangeControlChamber with local store.',
    gaps: ['Proposals do not gate any actual system change.', LOCAL_ONLY_GAP],
  },
  'creator-console': {
    mode: 'creator-console', title: 'Creator console', domain: 'Governance',
    state: 'FRONTEND_ONLY',
    evidence: 'CreatorConsoleChamber with local store.',
    gaps: ['Console does not read real system health, provider status, or degraded state.', LOCAL_ONLY_GAP],
  },
  'gap-ledger': {
    mode: 'gap-ledger', title: 'Gap ledger', domain: 'Governance',
    state: 'FRONTEND_ONLY',
    evidence: 'GapLedgerChamber with local store; user-entered gaps.',
    gaps: ['Not seeded from this registry; gap entries carry no evidence links.', LOCAL_ONLY_GAP],
  },

  // ── System ───────────────────────────────────────────────────────────────
  onboarding: {
    mode: 'onboarding', title: 'Onboarding', domain: 'System',
    state: 'DOCTRINE_DEFINED',
    evidence: 'Onboarding.tsx exists unrouted; mode renders placeholder.',
    gaps: [NO_UI_GAP],
  },
  'humanization-controls': {
    mode: 'humanization-controls', title: 'Humanization controls', domain: 'System',
    state: 'DOCTRINE_DEFINED',
    evidence: 'HumanizationControls.tsx exists unrouted; mode renders placeholder.',
    gaps: [NO_UI_GAP],
  },
  auth: {
    mode: 'auth', title: 'Authentication', domain: 'System',
    state: 'FRONTEND_ONLY',
    evidence: 'AuthChamber gates the shell; local identity via IDB. Backend authRoutes exist, unconnected.',
    gaps: ['Local identity is not linked to backend user isolation; sessions carry no server authority.'],
  },
};

/** All records as a list, stable order: lowest tier first within domain grouping. */
export function listFeatureRecords(): FeatureRecord[] {
  return Object.values(REALITY_SPINE);
}

/** Count of features per implementation state (only states that occur). */
export function summarizeStates(): Array<{ state: ImplementationState; count: number }> {
  const counts = new Map<ImplementationState, number>();
  for (const record of listFeatureRecords()) {
    counts.set(record.state, (counts.get(record.state) ?? 0) + 1);
  }
  return IMPLEMENTATION_STATES
    .filter((s) => counts.has(s))
    .map((s) => ({ state: s, count: counts.get(s) as number }));
}

/** Spine entry for a mode. Total record — always defined. */
export function getFeatureRecord(mode: ActiveMode): FeatureRecord {
  return REALITY_SPINE[mode];
}
