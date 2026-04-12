/**
 * Mirror of backend ExplainabilityEngine public types for the React panel only.
 */

export type ExplainableAction =
  | 'mutation_committed'
  | 'trait_observed_not_confirmed'
  | 'trait_decayed'
  | 'crucible_escalated'
  | 'crucible_relented'
  | 'crucible_switched_mode'
  | 'uncertainty_injected'
  | 'claim_marked_stale'
  | 'overseer_rewrote'
  | 'goal_activated'
  | 'goal_stale'
  | 'resonance_guardrail_fired'
  | 'constitution_blocked'
  | 'quarantine_triggered'
  | 'policy_conflict_resolved'
  | 'schema_migration_ran';

export interface Explanation {
  id: string;
  action: ExplainableAction;
  userId: string;
  timestamp: number;
  headline: string;
  reasoning: string;
  evidence: string[];
  confidence: string;
  reversible: boolean;
  howToReverse?: string;
  relatedEventIds: string[];
}
