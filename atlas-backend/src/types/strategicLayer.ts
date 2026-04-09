import { z } from 'zod';

export const simulationForgeStatusSchema = z.enum(['draft', 'running', 'complete', 'failed']);
export type SimulationForgeStatus = z.infer<typeof simulationForgeStatusSchema>;

/** Branch / pathway inside a forge run — also persisted in pathways_json. */
export const simulationPathwaySchema = z.object({
  label: z.string(),
  path_summary: z.string(),
  emotional_driver_score: z.number().min(0).max(1),
  strategic_driver_score: z.number().min(0).max(1),
  short_term_relief_vs_long_term_cost: z.string(),
  second_order_effects: z.array(z.string()),
  delayed_consequences: z.array(z.string()),
  reversibility: z.string(),
  reputational_risk: z.string(),
  identity_impact: z.string(),
  likely_reactions: z.array(z.object({ actor: z.string(), reaction: z.string() })),
  hidden_tradeoffs: z.array(z.string()),
  downside_stress_notes: z.string(),
  opportunity_notes: z.string(),
  emotional_vs_strategic_diagnosis: z.string(),
});

export type SimulationPathway = z.infer<typeof simulationPathwaySchema>;

/** Full structured output from the Simulation Forge model pass. */
export const simulationForgeReviewSchema = z.object({
  executive_summary: z.string(),
  scenario_axes: z.array(z.string()),
  pathways: z.array(simulationPathwaySchema),
  recommended_further_tests: z.array(z.string()),
  narrative_divergence_flags: z.array(z.string()),
});

export type SimulationForgeReview = z.infer<typeof simulationForgeReviewSchema>;

export const atlasRgNodeKindSchema = z.enum([
  'person',
  'goal',
  'project',
  'value',
  'standard',
  'belief',
  'evidence',
  'decision',
  'risk',
  'habit',
  'obligation',
  'opportunity',
  'unresolved_tension',
  'doctrine',
  'identity_target',
]);

export type AtlasRgNodeKind = z.infer<typeof atlasRgNodeKindSchema>;

export const atlasRgRelationSchema = z.enum([
  'supports',
  'conflicts_with',
  'depends_on',
  'strengthens',
  'weakens',
  'distorts',
  'is_evidenced_by',
  'is_contradicted_by',
  'advances',
  'drains',
  'threatens',
  'remains_unresolved_by',
  'reinforces',
]);

export type AtlasRgRelation = z.infer<typeof atlasRgRelationSchema>;

export const identityGoalStatusSchema = z.enum(['active', 'paused', 'archived']);
export type IdentityGoalStatus = z.infer<typeof identityGoalStatusSchema>;

export const selfRevisionCategorySchema = z.enum([
  'weak_reasoning_structure',
  'vague_language',
  'impulsive_certainty',
  'interpretation_instability',
  'poor_reflection_process',
  'emotional_contamination',
  'weak_self_correction',
  'low_fidelity_framing',
  'degrading_mental_shortcut',
]);

export type SelfRevisionCategory = z.infer<typeof selfRevisionCategorySchema>;

export const selfRevisionSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type SelfRevisionSeverity = z.infer<typeof selfRevisionSeveritySchema>;

export const selfRevisionStatusSchema = z.enum(['open', 'adopted', 'rejected', 'superseded']);
export type SelfRevisionStatus = z.infer<typeof selfRevisionStatusSchema>;
