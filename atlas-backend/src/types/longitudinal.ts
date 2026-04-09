import { z } from 'zod';

export const evolutionEventTypeSchema = z.enum([
  'belief_shift',
  'standard_change',
  'self_concept_change',
  'goal_created',
  'goal_abandoned',
  'goal_completed',
  'goal_drift',
  'recurring_failure_pattern',
  'growth_claim',
  'developmental_improvement',
  'unresolved_internal_conflict',
  'major_inflection',
  'cross_domain_tension',
  'development_phase',
  'constitutional_amendment_echo',
  'decision_outcome_echo',
]);

export type EvolutionEventType = z.infer<typeof evolutionEventTypeSchema>;

export const twinDomainSchema = z.enum([
  'reasoning_style',
  'decision_style',
  'persuasion_profile',
  'blind_spots',
  'emotional_distortion',
  'stress_response',
  'avoidance_patterns',
  'framing_preferences',
  'values_vs_enacted',
  'communication',
  'writing_tendencies',
  'self_deception_modes',
  'stability_impulsivity',
]);

export type TwinDomain = z.infer<typeof twinDomainSchema>;

export const twinSourceSchema = z.enum(['user_declared', 'system_inferred', 'hybrid']);
export type TwinSource = z.infer<typeof twinSourceSchema>;

export const chamberStatusSchema = z.enum(['draft', 'running', 'complete', 'failed']);
export type ChamberStatus = z.infer<typeof chamberStatusSchema>;

export const unfinishedKindSchema = z.enum([
  'abandoned_goal',
  'unresolved_tension',
  'recurring_insight',
  'avoided_conversation',
  'self_promise_unhonored',
  'strategic_drift',
  'emotional_avoidance',
  'unclosed_meaningful_loop',
  'high_significance_minor_task',
]);

export type UnfinishedKind = z.infer<typeof unfinishedKindSchema>;

export const unfinishedStatusSchema = z.enum(['open', 'deferred', 'resolved', 'archived']);
export type UnfinishedStatus = z.infer<typeof unfinishedStatusSchema>;

/** Structured Truth Chamber output (validated when persisting). */
export const truthChamberOutputSchema = z.object({
  unsupported_claims: z.array(z.string()),
  contradiction_map: z.array(
    z.object({
      claim_a: z.string(),
      claim_b: z.string(),
      relation: z.string(),
    })
  ),
  strongest_opposing_interpretation: z.string(),
  missing_evidence: z.array(z.string()),
  likely_distortion_flags: z.array(z.string()),
  cost_of_error_analysis: z.string(),
  confidence_downgrade_recommendation: z.string(),
  pressure_points: z.array(z.string()),
});

export type TruthChamberOutput = z.infer<typeof truthChamberOutputSchema>;
