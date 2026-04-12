// Atlas-Audit: [EXEC-MODE] Verified — coerceActiveMode / tryCoerceActiveMode harden shell navigators (Codex, sidebar, capabilities) against widened route strings.
// Atlas-Audit: [EXEC-MODE] Verified — isKnownActiveMode is the gate for programmatic set-mode navigation (App listener).
// Atlas-Audit: [EXEC-GUARD] Verified — getAtlasWayfindingFromState + isKnownActiveMode harden App/header against runtime-widened or corrupted mode strings.
// Atlas-Audit: [QA-WAYFIND] Verified — MODE_WAYFINDING typed as Record<ActiveMode,…> so missing union members fail tsc; getAtlasWayfinding assumes valid ActiveMode.
// Atlas-Audit: [IX-WAYFIND] Verified — Full activeMode coverage for arena/forge/mirror/signals, map stack, roadmap, filters, and manuals (no Workspace slug for real chambers).
// Atlas-Audit: [EXEC-EVO] Verified — evolution-layer wayfinding titles Chrysalis lab (routing target), distinct from roadmap.
// Atlas-Audit: [EXEC-ROUTE] Verified — Wayfinding entries for reality-engine, systems, evolution-layer, people, threads match App routing (no generic Workspace slug fallbacks).
// Atlas-Audit: [INTEGRATION] Wayfinding now distinguishes scaffold graph vs persisted mind map, names Command/Directive/Governance modes consistently, and maps common modes to shared domains so breadcrumbs read as one OS—not unrelated products.
import type { AppState } from '../types';

export type ActiveMode = AppState['activeMode'];

/** Human-readable chamber titles and breadcrumb trails for wayfinding. */
const MODE_WAYFINDING: Record<ActiveMode, { domain: string; title: string }> = {
  'sovereign-atrium': { domain: 'Command', title: 'Sovereign atrium' },
  'today-in-atlas': { domain: 'Command', title: 'Home — prepared center' },
  'directive-center': { domain: 'Command', title: 'Directive center' },
  constitution: { domain: 'Doctrine', title: 'Personal constitution' },
  doctrine: { domain: 'Doctrine', title: 'Doctrine hall' },
  decisions: { domain: 'Doctrine', title: 'Decision ledger' },
  scenarios: { domain: 'Doctrine', title: 'Scenario chamber' },
  resonance: { domain: 'Bridge', title: 'Resonance engine' },
  pulse: { domain: 'Bridge', title: 'Intelligence pulse' },
  journal: { domain: 'Continuity', title: 'Journal chamber' },
  'deep-work': { domain: 'Continuity', title: 'Deep work chamber' },
  continuity: { domain: 'Continuity', title: 'Continuity engine' },
  mastery: { domain: 'Continuity', title: 'Mastery theater' },
  /** D3 scaffold + mock substrate; not the API-backed mind map */
  atlas: { domain: 'Map', title: 'Atlas graph (scaffold)' },
  'mind-cartography': { domain: 'Map', title: 'Mind cartography (live map)' },
  crucible: { domain: 'Pressure', title: 'Crucible' },
  mirrorforge: { domain: 'Pressure', title: 'Mirrorforge' },
  'red-team': { domain: 'Pressure', title: 'Red team' },
  chrysalis: { domain: 'Evolution', title: 'Chrysalis lab' },
  'core-systems': { domain: 'Evidence', title: 'Core systems' },
  'reality-engine': { domain: 'Evidence', title: 'Reality engine' },
  systems: { domain: 'Evidence', title: 'Core systems' },
  'memory-vault': { domain: 'Evidence', title: 'Memory vault' },
  'reality-ledger': { domain: 'Evidence', title: 'Reality ledger' },
  'evolution-layer': { domain: 'Evolution', title: 'Evolution control' },
  explainability: { domain: 'Evidence', title: 'Explainability' },
  people: { domain: 'Continuity', title: 'People & relationships' },
  threads: { domain: 'Bridge', title: 'Resonance threads' },
  canon: { domain: 'Evidence', title: 'Canon' },
  'drift-center': { domain: 'Governance', title: 'Drift center' },
  'privacy-center': { domain: 'Governance', title: 'Privacy center' },
  'audit-logs': { domain: 'Governance', title: 'Audit logs' },
  'change-control': { domain: 'Governance', title: 'Change control' },
  'creator-console': { domain: 'Governance', title: 'Creator console' },
  'gap-ledger': { domain: 'Governance', title: 'Gap ledger' },
  capabilities: { domain: 'System', title: 'Capabilities library' },
  onboarding: { domain: 'System', title: 'Onboarding' },
  auth: { domain: 'System', title: 'Authentication' },
  'strategic-modeling': { domain: 'Strategy', title: 'Strategic modeling' },
  'trajectory-observatory': { domain: 'Intelligence', title: 'Trajectory observatory' },
  'friction-cartography': { domain: 'Intelligence', title: 'Friction cartography' },
  'threshold-forge': { domain: 'Intelligence', title: 'Threshold forge' },
  council: { domain: 'Bridge', title: 'Inner council' },
  relationships: { domain: 'Continuity', title: 'Relationships' },
  leviathan: { domain: 'Pressure', title: 'Leviathan' },
  vault: { domain: 'Evidence', title: 'Sovereign vault' },
  arena: { domain: 'Pressure', title: 'Arena mode' },
  chambers: { domain: 'Map', title: 'Knowledge chambers' },
  discussion: { domain: 'Bridge', title: 'Discussion board' },
  'essential-mode': { domain: 'Command', title: 'Essential mode' },
  'final-filter': { domain: 'Pressure', title: 'Final filter' },
  forge: { domain: 'Pressure', title: 'Forge mode' },
  'forge-artifact': { domain: 'Pressure', title: 'Forge artifact' },
  'humanization-controls': { domain: 'System', title: 'Humanization controls' },
  lineage: { domain: 'Map', title: 'Lineage mode' },
  'life-domains': { domain: 'Doctrine', title: 'Life domains' },
  mirror: { domain: 'Pressure', title: 'Mirror mode' },
  'operating-manual': { domain: 'Doctrine', title: 'Operating manual' },
  roadmap: { domain: 'Evolution', title: 'Product roadmap' },
  salon: { domain: 'Continuity', title: 'Salon' },
  'second-sun': { domain: 'Strategy', title: 'Second sun' },
  signature: { domain: 'Continuity', title: 'Cognitive signature' },
  signals: { domain: 'Bridge', title: 'Signals mode' },
  topology: { domain: 'Map', title: 'Topology view' },
};

function titleCaseFromSlug(mode: string): string {
  return mode
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function isKnownActiveMode(mode: string): mode is ActiveMode {
  return Object.prototype.hasOwnProperty.call(MODE_WAYFINDING, mode);
}

/** Narrow unknown route payloads to a registered mode, or `undefined` if not a known slug. */
export function tryCoerceActiveMode(raw: unknown): ActiveMode | undefined {
  if (typeof raw !== 'string') return undefined;
  const m = raw.trim();
  if (!m || !isKnownActiveMode(m)) return undefined;
  return m;
}

/** Shell navigation boundary: invalid strings keep `fallback` (typically `prev.activeMode`). */
export function coerceActiveMode(raw: unknown, fallback: ActiveMode): ActiveMode {
  return tryCoerceActiveMode(raw) ?? fallback;
}

/** Use where `activeMode` may be widened at runtime (e.g. persisted JSON); falls back to Workspace titling. */
export function getAtlasWayfindingFromState(mode: string): { domain: string; title: string; crumb: string[] } {
  if (isKnownActiveMode(mode)) {
    return getAtlasWayfinding(mode);
  }
  const title = titleCaseFromSlug(mode);
  return {
    domain: 'Workspace',
    title,
    crumb: ['Atlas', 'Workspace', title],
  };
}

export function getAtlasWayfinding(mode: ActiveMode): { domain: string; title: string; crumb: string[] } {
  const row = MODE_WAYFINDING[mode];
  return {
    domain: row.domain,
    title: row.title,
    crumb: ['Atlas', row.domain, row.title],
  };
}
