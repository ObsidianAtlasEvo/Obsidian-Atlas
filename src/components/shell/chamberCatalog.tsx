/**
 * Shared chamber catalog for every navigation surface (desktop NavRail,
 * mobile bottom tabs, mobile sidebar drawer).
 *
 * Extracted out of NavRail.tsx so the mobile drawer can render the exact same
 * list the desktop rail renders without duplicating the icon dictionary.
 */

import React from 'react';
import type { AppState } from '@/types';

export interface ChamberDef {
  id: AppState['activeMode'];
  label: string;
  icon: string;
  group?: string;
  creatorOnly?: boolean;
}

// SVG icon paths (24x24 viewBox). Keys referenced by ChamberDef.icon.
export const ICONS: Record<string, string> = {
  atlas:        'M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.5L20 9l-8 4-8-4 8-4.5zm9 10.5-9 4.5-9-4.5V9.5l9 4.5 9-4.5v5.5z',
  journal:      'M4 2h12l4 4v16H4V2zm12 0v4h4M8 10h8M8 14h8M8 18h5',
  pulse:        'M2 12h4l3-8 4 16 3-8h6',
  decisions:    'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18',
  doctrine:     'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  crucible:     'M9 3H5l-2 9h4l1 9 4-4 4 4 1-9h4L19 3h-4l-3 7-3-7z',
  mirror:       'M12 4a4 4 0 110 8 4 4 0 010-8zm0 10c4.42 0 8 1.79 8 4v2H4v-2c0-2.21 3.58-4 8-4z',
  signals:      'M22 12h-4l-3 9L9 3l-3 9H2',
  canon:        'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  constitution: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  memory:       'M9 3v11l3 3 3-3V3M6 21h12M3 3h18',
  relationships:'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  scenarios:    'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  topology:     'M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z M4 4a2 2 0 100 4 2 2 0 000-4z',
  council:      'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  forge:        'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
  settings:     'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  console:      'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18',
};

export const CHAMBERS: ReadonlyArray<ChamberDef> = [
  // ── Core ────────────────────────────────────────────────────────────
  { id: 'atlas',          label: 'Atlas',          icon: 'atlas',        group: 'Core' },
  { id: 'pulse',          label: 'Pulse',          icon: 'pulse',        group: 'Core' },
  { id: 'journal',        label: 'Journal',        icon: 'journal',      group: 'Core' },

  // ── Strategy ────────────────────────────────────────────────────────
  { id: 'decisions',      label: 'Decisions',      icon: 'decisions',    group: 'Strategy' },
  { id: 'scenarios',      label: 'Scenarios',      icon: 'scenarios',    group: 'Strategy' },
  { id: 'crucible',       label: 'Crucible',       icon: 'crucible',     group: 'Strategy' },
  { id: 'forge',          label: 'Forge',          icon: 'forge',        group: 'Strategy' },

  // ── Identity ─────────────────────────────────────────────────────────
  { id: 'doctrine',       label: 'Doctrine',       icon: 'doctrine',     group: 'Identity' },
  { id: 'constitution',   label: 'Constitution',   icon: 'constitution', group: 'Identity' },
  { id: 'continuity',     label: 'Continuity',     icon: 'memory',       group: 'Identity' },
  { id: 'relationships',  label: 'Relationships',  icon: 'relationships',group: 'Identity' },

  // ── Intelligence ─────────────────────────────────────────────────────
  { id: 'signals',        label: 'Signals',        icon: 'signals',      group: 'Intelligence' },
  { id: 'canon',          label: 'Canon',          icon: 'canon',        group: 'Intelligence' },
  { id: 'council',        label: 'Council',        icon: 'council',      group: 'Intelligence' },
  { id: 'topology',       label: 'Topology',       icon: 'topology',     group: 'Intelligence' },
  { id: 'mastery',        label: 'Mastery',        icon: 'canon',        group: 'Intelligence' },

  // ── Adaptive ────────────────────────────────────────────────────────
  { id: 'core-systems',   label: 'Model Hub',      icon: 'atlas',        group: 'Adaptive' },
  { id: 'resonance',      label: 'Resonance',      icon: 'signals',      group: 'Adaptive' },
  { id: 'mirrorforge',    label: 'MirrorForge',    icon: 'forge',        group: 'Adaptive' },
  { id: 'reality-engine', label: 'Reality Engine', icon: 'topology',     group: 'Adaptive' },
  { id: 'chrysalis',      label: 'Chrysalis',      icon: 'settings',     group: 'Adaptive' },

  // ── Memory ───────────────────────────────────────────────────────────
  { id: 'memory-vault',    label: 'Memory Vault',  icon: 'memory',       group: 'Memory' },

  // ── Meta ─────────────────────────────────────────────────────────────
  { id: 'directive-center', label: 'Directives',   icon: 'settings',     group: 'Meta' },
  { id: 'creator-console',  label: 'Console',      icon: 'console',      group: 'Meta', creatorOnly: true },
  { id: 'gap-ledger',       label: 'Gap Ledger',   icon: 'console',      group: 'Meta', creatorOnly: true },
  { id: 'audit-logs',       label: 'Audit Logs',   icon: 'console',      group: 'Meta', creatorOnly: true },
  { id: 'change-control',   label: 'Changes',      icon: 'console',      group: 'Meta', creatorOnly: true },
];

// Subset shown in the always-visible mobile bottom tab bar.
export const MOBILE_TAB_IDS: ReadonlyArray<AppState['activeMode']> = [
  'atlas', 'pulse', 'journal', 'decisions', 'doctrine',
];

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
