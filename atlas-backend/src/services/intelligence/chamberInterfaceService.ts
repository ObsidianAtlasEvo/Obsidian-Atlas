/**
 * chamberInterfaceService.ts — Phase 0.98: Pure chamber interface definitions.
 */

export interface ChamberLayout {
  chamber: string;
  layout_variant: string;
  panels: string[];
}

const LAYOUTS: Record<string, ChamberLayout> = {
  directive_center: {
    chamber: 'directive_center',
    layout_variant: 'command_grid',
    panels: ['workstreams', 'fronts', 'chains', 'commitments', 'decisions'],
  },
  crucible: {
    chamber: 'crucible',
    layout_variant: 'friction_split',
    panels: ['assumptions', 'contradictions', 'false_fronts', 'pressure'],
  },
  reality_engine: {
    chamber: 'reality_engine',
    layout_variant: 'observatory',
    panels: ['claims', 'evidence', 'drift_events', 'decay_queue'],
  },
  mirrorforge: {
    chamber: 'mirrorforge',
    layout_variant: 'reflection_stack',
    panels: ['identity_domains', 'evolution_timeline', 'self_model', 'narrative'],
  },
  default: {
    chamber: 'default',
    layout_variant: 'standard',
    panels: ['home_summary', 'directive_state', 'transparency'],
  },
};

const INFO_HIERARCHY: Record<string, string[]> = {
  directive_center: [
    'active_workstreams',
    'open_fronts',
    'blocked_chains',
    'open_commitments',
    'pending_decisions',
  ],
  crucible: [
    'challenged_assumptions',
    'unresolved_contradictions',
    'false_fronts',
    'fragile_beliefs',
  ],
  reality_engine: [
    'supported_claims',
    'stale_claims',
    'recent_drift',
    'evidence_quality',
  ],
  mirrorforge: [
    'active_identity_signals',
    'recent_evolution',
    'self_model_tensions',
    'narrative_distortions',
  ],
  default: ['home_summary', 'directive_state', 'transparency_log'],
};

const AFFORDANCES: Record<string, string[]> = {
  directive_center: [
    'create_workstream',
    'log_commitment',
    'record_decision',
    'resolve_chain',
    'freeze_front',
  ],
  crucible: [
    'challenge_assumption',
    'surface_contradiction',
    'mark_false_front',
    'apply_pressure',
  ],
  reality_engine: [
    'submit_claim',
    'add_evidence',
    'log_drift',
    'revalidate_claim',
  ],
  mirrorforge: [
    'inspect_identity',
    'freeze_signal',
    'revert_change',
    'reflect_on_evolution',
  ],
  default: ['inspect', 'pin_module', 'navigate_chamber'],
};

export function getChamberLayout(chamber: string): ChamberLayout {
  return LAYOUTS[chamber] ?? LAYOUTS.default!;
}

export function getInformationHierarchy(chamber: string): string[] {
  return INFO_HIERARCHY[chamber] ?? INFO_HIERARCHY.default!;
}

export function getActionAffordances(chamber: string): string[] {
  return AFFORDANCES[chamber] ?? AFFORDANCES.default!;
}
