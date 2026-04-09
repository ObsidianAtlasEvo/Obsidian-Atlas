import { z } from 'zod';

export const constitutionClauseTypeSchema = z.enum([
  'core_value',
  'anti_value',
  'non_negotiable',
  'standard',
  'red_line',
  'long_term_aim',
  'identity_commitment',
  'strategic_priority',
  'success_definition',
  'failure_definition',
  'operating_principle',
  'protected_principle',
]);

export type ConstitutionClauseType = z.infer<typeof constitutionClauseTypeSchema>;

export const epistemicStateSchema = z.enum([
  'raw_intuition',
  'plausible',
  'partially_supported',
  'strongly_supported',
  'contested',
  'weakly_grounded',
  'disconfirmed',
  'aspirational',
  'emotionally_preferred',
  'constitutionally_aligned_uncertain',
]);

export type EpistemicState = z.infer<typeof epistemicStateSchema>;

export const claimTypeSchema = z.enum([
  'hypothesis',
  'fact_assertion',
  'preference',
  'aspiration',
  'intuition',
  'interpretation',
]);

export type ClaimType = z.infer<typeof claimTypeSchema>;

export const evidenceSourceClassSchema = z.enum([
  'primary_document',
  'user_testimony',
  'web_retrieval',
  'measurement',
  'expert_authority',
  'memory_trace',
  'logical_inference',
  'constitution',
]);

export type EvidenceSourceClass = z.infer<typeof evidenceSourceClassSchema>;

export const provenanceSchema = z.enum(['user_declared', 'system_inferred', 'hybrid']);
export type Provenance = z.infer<typeof provenanceSchema>;

export const linkRoleSchema = z.enum(['supports', 'contradicts', 'contextualizes']);
export type LinkRole = z.infer<typeof linkRoleSchema>;

export const contradictionStatusSchema = z.enum(['open', 'resolved', 'deferred']);
export type ContradictionStatus = z.infer<typeof contradictionStatusSchema>;

export const decisionStatusSchema = z.enum(['draft', 'committed', 'reviewed', 'superseded']);
export type DecisionStatus = z.infer<typeof decisionStatusSchema>;

export const alignmentVerdictSchema = z.enum(['aligned', 'tension', 'violation', 'insufficient_context']);
export type AlignmentVerdict = z.infer<typeof alignmentVerdictSchema>;

export const cognitiveCommandKindSchema = z.enum([
  'freeform_query',
  'constitution_amend',
  'claim_register',
  'evidence_attach',
  'decision_open',
  'decision_review',
  'contradiction_register',
  'legacy_extract',
  'evolution_record',
  'twin_trait_set',
  'truth_chamber',
  'open_loop_register',
  'simulation_forge',
  'reality_graph_mutate',
  'identity_bridge',
  'self_revision_record',
]);

export type CognitiveCommandKind = z.infer<typeof cognitiveCommandKindSchema>;
