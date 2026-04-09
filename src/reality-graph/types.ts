/**
 * Frontend types for the Sovereign Reality Graph (aligned with atlas-backend SQLite SRG tables).
 * UI layers consume these for citations, graph highlights, and module boundaries.
 */

export type SrgTruthStatus = 'provisional' | 'verified' | 'superseded' | 'revoked';

export type SrgGraphEntityType =
  | 'memory'
  | 'truth'
  | 'doctrine_node'
  | 'srg_decision'
  | 'drift_event'
  | 'trace'
  | 'evolution_gap';

export type SrgGraphRelation =
  | 'supports'
  | 'contradicts'
  | 'derives_from'
  | 'supersedes'
  | 'exemplifies'
  | 'grounds'
  | 'ripples_to'
  | 'linked';

export interface SrgCitationRef {
  entityType: SrgGraphEntityType;
  id: string;
  label: string;
}

export interface SovereignRealityGraphSnapshot {
  /** Monotonic token for cache busting when backend graph mutates. */
  revision: number;
  lastSyncedAt: string | null;
}
