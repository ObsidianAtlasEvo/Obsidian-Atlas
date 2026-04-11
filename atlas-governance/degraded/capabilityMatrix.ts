/**
 * Capability Matrix
 * Phase 4 Section 3 — Defines which Atlas features are available at each
 * degradation level. Used by the UI to disable controls and inform users.
 */

/** All Atlas features subject to degraded-mode gating. */
export type AtlasFeature =
  | 'MUTATION'
  | 'LLM_QUERIES'
  | 'EVOLUTION'
  | 'BUG_HUNTER'
  | 'CONSOLE_COMMANDS'
  | 'AUDIT_LOG'
  | 'FEATURE_FLAGS'
  | 'MIND_PROFILES'
  | 'DOMAIN_SYNC'
  | 'SOVEREIGN_CONSOLE';

/** Degraded mode levels mirroring the backend oracle. */
export type DegradedMode =
  | 'NOMINAL'
  | 'DEGRADED_1'
  | 'DEGRADED_2'
  | 'DEGRADED_3'
  | 'OFFLINE';

/** Complete list of features for iteration. */
const ALL_FEATURES: readonly AtlasFeature[] = [
  'MUTATION',
  'LLM_QUERIES',
  'EVOLUTION',
  'BUG_HUNTER',
  'CONSOLE_COMMANDS',
  'AUDIT_LOG',
  'FEATURE_FLAGS',
  'MIND_PROFILES',
  'DOMAIN_SYNC',
  'SOVEREIGN_CONSOLE',
] as const;

/**
 * The capability matrix: maps each mode to the set of enabled features.
 *
 * - NOMINAL: all features enabled
 * - DEGRADED_1: EVOLUTION disabled, LLM_QUERIES degraded (still listed but flagged)
 * - DEGRADED_2: additionally disables MUTATION, BUG_HUNTER, CONSOLE_COMMANDS
 * - DEGRADED_3: only AUDIT_LOG and SOVEREIGN_CONSOLE remain
 * - OFFLINE: nothing available
 */
export const CAPABILITY_MATRIX: Readonly<Record<DegradedMode, readonly AtlasFeature[]>> = {
  NOMINAL: ALL_FEATURES,
  DEGRADED_1: [
    'MUTATION',
    'LLM_QUERIES',
    'BUG_HUNTER',
    'CONSOLE_COMMANDS',
    'AUDIT_LOG',
    'FEATURE_FLAGS',
    'MIND_PROFILES',
    'DOMAIN_SYNC',
    'SOVEREIGN_CONSOLE',
  ],
  DEGRADED_2: [
    'LLM_QUERIES',
    'AUDIT_LOG',
    'FEATURE_FLAGS',
    'MIND_PROFILES',
    'DOMAIN_SYNC',
    'SOVEREIGN_CONSOLE',
  ],
  DEGRADED_3: ['AUDIT_LOG', 'SOVEREIGN_CONSOLE'],
  OFFLINE: [],
} as const;

/** Check whether a specific feature is enabled for a given degraded mode. */
export function isCapabilityEnabled(feature: AtlasFeature, mode: DegradedMode): boolean {
  return CAPABILITY_MATRIX[mode].includes(feature);
}

/** Return all features enabled for a given degraded mode. */
export function getCapabilitiesForMode(mode: DegradedMode): AtlasFeature[] {
  return [...CAPABILITY_MATRIX[mode]];
}

/** Return features that are disabled (absent) for a given degraded mode. */
export function getDisabledFeatures(mode: DegradedMode): AtlasFeature[] {
  const enabled = CAPABILITY_MATRIX[mode];
  return ALL_FEATURES.filter((f) => !enabled.includes(f));
}
