/**
 * Shared chamber catalog — single source of truth for every navigation surface
 * (desktop NavRail, mobile bottom tabs, mobile accordion drawer, Home pinned
 * grid, universal search / command palette).
 *
 * Structure (post-Refine.txt):
 *   - Primary surfaces        (Home, Atlas, Journal)            → bottom nav + Home layout
 *   - Sections                (Strategy, Identity, Intelligence, Evolution,
 *                              Memory, Control Center)          → drawer accordion + desktop rail
 *   - Each section has children; Labs (inside Strategy) has grandchildren.
 *
 * The `activeMode` type in `src/types.ts` stays authoritative for every id used
 * here, so no migration of persisted state is needed — we only narrow/rename
 * what's exposed in navigation.
 *
 * Rename / merge rules applied (from Refine.txt):
 *   - Topology         → Cognition Map (id stays 'topology')
 *   - Chrysalis        → Refinement    (id stays 'chrysalis')
 *   - Meta             → Control Center
 *   - Adaptive         → Evolution
 *   - Resonance        → folded into MirrorForge (removed from nav)
 *   - Pulse            → folded into Home + Journal (removed from nav)
 *   - Crucible + Forge → nested under Labs
 */

import React from 'react';
import type { AppState } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────

export type ChamberId = AppState['activeMode'];

export interface ChamberDef {
  id: ChamberId;
  label: string;
  icon: string;
  /** Short one-liner used in the drawer / pinned grid / command palette. */
  description?: string;
  /** Parent section id; absent for primary surfaces. */
  section?: SectionId;
  /** Parent subgroup id inside a section (e.g. 'labs' inside Strategy). */
  subgroup?: string;
  /** Only shown to sovereign_creator users. */
  creatorOnly?: boolean;
}

export type SectionId =
  | 'strategy'
  | 'identity'
  | 'intelligence'
  | 'evolution'
  | 'memory'
  | 'control';

export interface SectionDef {
  id: SectionId;
  label: string;
  icon: string;
  description: string;
}

// ── SVG icon paths (24x24 viewBox). Keys referenced by icon strings below. ──

export const ICONS: Record<string, string> = {
  // Brand / primary
  atlas:         'M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.5L20 9l-8 4-8-4 8-4.5zm9 10.5-9 4.5-9-4.5V9.5l9 4.5 9-4.5v5.5z',
  home:          'M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10',
  journal:       'M4 2h12l4 4v16H4V2zm12 0v4h4M8 10h8M8 14h8M8 18h5',
  search:        'M11 2a9 9 0 100 18 9 9 0 000-18zm10 20l-5.5-5.5',
  menu:          'M3 6h18M3 12h18M3 18h18',

  // Section headers
  strategy:      'M12 2v4m0 12v4M2 12h4m12 0h4M12 2a10 10 0 100 20 10 10 0 000-20zM12 8a4 4 0 100 8 4 4 0 000-8z',
  identity:      'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  intelligence:  'M12 2a6 6 0 00-6 6v2a4 4 0 00-2 3.46V16a3 3 0 003 3h10a3 3 0 003-3v-2.54A4 4 0 0018 10V8a6 6 0 00-6-6zm-3 9h6m-5 4h4',
  evolution:     'M12 3l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z',
  memory:        'M4 6h16v4H4zM4 14h16v4H4zM7 8h.01M7 16h.01',
  control:       'M4 6h10m4 0h2M4 12h2m4 0h10M4 18h14m4 0h0M8 6a2 2 0 11-4 0 2 2 0 014 0zm8 6a2 2 0 11-4 0 2 2 0 014 0zM20 18a2 2 0 11-4 0 2 2 0 014 0z',

  // Strategy children
  decisions:     'M4 4h16v4H4zm0 6h10v4H4zm0 6h16v4H4z',
  scenarios:     'M4 6h6v12H4zm10 0h6v4h-6zm0 8h6v4h-6z',
  labs:          'M9 2h6v4l4 10a3 3 0 01-3 4H8a3 3 0 01-3-4L9 6z M9 2v4M15 2v4',
  crucible:      'M9 3H5l-2 9h4l1 9 4-4 4 4 1-9h4L19 3h-4l-3 7-3-7z',
  forge:         'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',

  // Identity children
  doctrine:      'M4 4h14a2 2 0 012 2v14H6a2 2 0 01-2-2V4zm0 0v14a2 2 0 002 2M8 8h8M8 12h8M8 16h5',
  constitution:  'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  continuity:    'M6 12a6 6 0 016-6c4 0 6 2 6 6s-2 6-6 6-6-2-6-6zm6-6a6 6 0 110 12',
  relationships: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',

  // Intelligence children
  signals:       'M2 12h4l3-8 4 16 3-8h6',
  canon:         'M4 4h12a4 4 0 014 4v12H8a4 4 0 01-4-4V4zm0 0v12a4 4 0 004 4',
  council:       'M17 11a3 3 0 100-6 3 3 0 000 6zm-10 0a3 3 0 100-6 3 3 0 000 6zm5 8a3 3 0 100-6 3 3 0 000 6zm5 0h5v-2a3 3 0 00-5-2M2 19h5v-2a3 3 0 015-2',
  cognitionMap:  'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15',
  mastery:       'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',

  // Evolution children
  modelHub:      'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6zM10 7h4M10 17h4M7 10v4M17 10v4',
  mirrorforge:   'M12 3a9 9 0 019 9 9 9 0 01-9 9 9 9 0 01-9-9 9 9 0 019-9zm0 3v12m-6-6h12',
  realityEngine: 'M12 3a9 9 0 100 18 9 9 0 000-18zm0 0a4 4 0 010 18m0-18a4 4 0 000 18M3 12h18',
  refinement:    'M4 19l6-6 4 4 6-6m0 0v4m0-4h-4',

  // Memory children
  memoryVault:   'M4 4h16v16H4zM4 9h16M9 4v16',

  // Control children
  directives:    'M4 6h14M4 12h14M4 18h10M20 6l-2 2M20 12l-2 2M20 18l-2 2',
  console:       'M3 5h18v14H3zM7 10l4 4-4 4M13 18h6',
  gapLedger:     'M4 4h16v16H4zM4 10h16M10 4v16M14 7l-2 2 2 2M18 7l-2 2 2 2',
  auditLogs:     'M9 4h10v16H5V8l4-4zm0 0v4H5',

  // Utility
  settings:      'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  pin:           'M12 2v8l4 4-8 0 4-4V2zM12 14v8',
};

// ── Primary surfaces (bottom nav + Home page) ─────────────────────────────

export const PRIMARY_CHAMBERS: ReadonlyArray<ChamberDef> = [
  { id: 'today-in-atlas', label: 'Home',    icon: 'home',    description: 'Today in Atlas — pulse, recents, pinned' },
  { id: 'atlas',          label: 'Atlas',   icon: 'atlas',   description: 'Primary conversational core' },
  { id: 'journal',        label: 'Journal', icon: 'journal', description: 'Entries, reflection timeline, pulse check-ins' },
];

// ── Sections (drawer accordion + desktop rail groups) ─────────────────────

export const SECTIONS: ReadonlyArray<SectionDef> = [
  { id: 'strategy',     label: 'Strategy',       icon: 'strategy',     description: 'Decisions, scenarios, and labs' },
  { id: 'identity',     label: 'Identity',       icon: 'identity',     description: 'Doctrine, constitution, continuity, relationships' },
  { id: 'intelligence', label: 'Intelligence',   icon: 'intelligence', description: 'Signals, canon, council, cognition map, mastery' },
  { id: 'evolution',    label: 'Evolution',      icon: 'evolution',    description: 'Model hub, mirrorforge, reality engine, refinement' },
  { id: 'memory',       label: 'Memory',         icon: 'memory',       description: 'Memory vault and retrieval' },
  { id: 'control',      label: 'Control Center', icon: 'control',      description: 'Directives, console, gap ledger, audit logs' },
];

// ── Section children (chambers grouped under a section, optionally in a subgroup) ─

export const CHAMBERS: ReadonlyArray<ChamberDef> = [
  // Strategy
  { id: 'decisions',       label: 'Decisions',      icon: 'decisions',    description: 'Strategic choices and tradeoffs',       section: 'strategy' },
  { id: 'scenarios',       label: 'Scenarios',      icon: 'scenarios',    description: 'Branching paths and simulations',        section: 'strategy' },
  { id: 'crucible',        label: 'Crucible',       icon: 'crucible',     description: 'Adversarial pressure testing',           section: 'strategy', subgroup: 'labs' },
  { id: 'forge',           label: 'Forge',          icon: 'forge',        description: 'Creation and build mode',                section: 'strategy', subgroup: 'labs' },

  // Identity
  { id: 'doctrine',        label: 'Doctrine',       icon: 'doctrine',     description: 'Operating principles',                   section: 'identity' },
  { id: 'constitution',    label: 'Constitution',   icon: 'constitution', description: 'The governing spine',                    section: 'identity' },
  { id: 'continuity',      label: 'Continuity',     icon: 'continuity',   description: 'Lineage and sovereignty over time',       section: 'identity' },
  { id: 'relationships',   label: 'Relationships',  icon: 'relationships',description: 'People, roles, and dynamics',            section: 'identity' },

  // Intelligence
  { id: 'signals',         label: 'Signals',        icon: 'signals',      description: 'Live streams and inputs',                section: 'intelligence' },
  { id: 'canon',           label: 'Canon',          icon: 'canon',        description: 'Reference knowledge you trust',          section: 'intelligence' },
  { id: 'council',         label: 'Council',        icon: 'council',      description: 'Deliberation with specialized voices',   section: 'intelligence' },
  { id: 'topology',        label: 'Cognition Map',  icon: 'cognitionMap', description: 'Map of how Atlas thinks',                section: 'intelligence' },
  { id: 'mastery',         label: 'Mastery',        icon: 'mastery',      description: 'Progression and skill tracking',         section: 'intelligence' },

  // Evolution
  { id: 'core-systems',    label: 'Model Hub',      icon: 'modelHub',     description: 'Model orchestration and routing',        section: 'evolution' },
  { id: 'mirrorforge',     label: 'MirrorForge',    icon: 'mirrorforge',  description: 'Pattern recognition and resonance',      section: 'evolution' },
  { id: 'reality-engine',  label: 'Reality Engine', icon: 'realityEngine',description: 'System modeling and simulation',         section: 'evolution' },
  { id: 'chrysalis',       label: 'Refinement',     icon: 'refinement',   description: 'System evolution and polishing',         section: 'evolution' },

  // Memory
  { id: 'memory-vault',    label: 'Memory Vault',   icon: 'memoryVault',  description: 'Archive, timeline, retrieval',           section: 'memory' },

  // Control Center
  { id: 'directive-center',label: 'Directives',     icon: 'directives',   description: 'Command posture and active laws',        section: 'control' },
  { id: 'creator-console', label: 'Console',        icon: 'console',      description: 'Root governance and control',            section: 'control', creatorOnly: true },
  { id: 'gap-ledger',      label: 'Gap Ledger',     icon: 'gapLedger',    description: 'Ranked architectural weaknesses',        section: 'control', creatorOnly: true },
  { id: 'audit-logs',      label: 'Audit Logs',     icon: 'auditLogs',    description: 'Governance event stream',                section: 'control', creatorOnly: true },
];

// ── Subgroups (e.g. Labs inside Strategy) ─────────────────────────────────

export interface SubgroupDef {
  id: string;
  section: SectionId;
  label: string;
  icon: string;
  description: string;
}

export const SUBGROUPS: ReadonlyArray<SubgroupDef> = [
  { id: 'labs', section: 'strategy', label: 'Labs', icon: 'labs', description: 'Crucible + Forge' },
];

// ── Bottom nav (mobile) ───────────────────────────────────────────────────

export type BottomNavId = 'home' | 'atlas' | 'journal' | 'search' | 'menu';

export interface BottomNavItem {
  id: BottomNavId;
  label: string;
  icon: string;
  /** activeMode this maps to, if any. Search/Menu are overlays (no mode). */
  mode?: ChamberId;
}

export const BOTTOM_NAV: ReadonlyArray<BottomNavItem> = [
  { id: 'home',    label: 'Home',    icon: 'home',    mode: 'today-in-atlas' },
  { id: 'atlas',   label: 'Atlas',   icon: 'atlas',   mode: 'atlas' },
  { id: 'journal', label: 'Journal', icon: 'journal', mode: 'journal' },
  { id: 'search',  label: 'Search',  icon: 'search' },
  { id: 'menu',    label: 'Menu',    icon: 'menu' },
];

// ── Lookups ───────────────────────────────────────────────────────────────

export const ALL_CHAMBERS: ReadonlyArray<ChamberDef> = [
  ...PRIMARY_CHAMBERS,
  ...CHAMBERS,
];

const CHAMBER_BY_ID: ReadonlyMap<ChamberId, ChamberDef> = new Map(
  ALL_CHAMBERS.map((c) => [c.id, c]),
);

export function getChamber(id: ChamberId | null | undefined): ChamberDef | undefined {
  if (!id) return undefined;
  return CHAMBER_BY_ID.get(id);
}

export function getChambersInSection(section: SectionId): ChamberDef[] {
  return CHAMBERS.filter((c) => c.section === section);
}

export function getChambersInSubgroup(section: SectionId, subgroup: string): ChamberDef[] {
  return CHAMBERS.filter((c) => c.section === section && c.subgroup === subgroup);
}

/** Children of a section that live directly under the section (not in a subgroup). */
export function getDirectSectionChildren(section: SectionId): ChamberDef[] {
  return CHAMBERS.filter((c) => c.section === section && !c.subgroup);
}

export function getSubgroupsInSection(section: SectionId): SubgroupDef[] {
  return SUBGROUPS.filter((g) => g.section === section);
}

/** True if this mode is a pinnable chamber (i.e. appears in the catalog). */
export function isPinnableChamber(id: ChamberId): boolean {
  return CHAMBER_BY_ID.has(id);
}

// ── Icon component ────────────────────────────────────────────────────────

export function Icon({ path, size = 18 }: { path: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path.split('M').filter(Boolean).map((seg, i) => (
        <path key={i} d={`M${seg}`} />
      ))}
    </svg>
  );
}

// ── Back-compat alias (legacy) ────────────────────────────────────────────
// Older code references MOBILE_TAB_IDS; keep the export so imports don't break
// during transition. Maps to the bottom-nav primary modes only.
export const MOBILE_TAB_IDS: ReadonlyArray<ChamberId> = BOTTOM_NAV
  .map((b) => b.mode)
  .filter((m): m is ChamberId => !!m);
