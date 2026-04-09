import { z } from 'zod';

export const legacyArtifactKindSchema = z.enum([
  'doctrine_entry',
  'principle_codex',
  'refined_lesson',
  'strategic_framework',
  'worldview_statement',
  'decision_philosophy',
  'personal_law',
  'enduring_standard',
  'distilled_meaning',
]);

export type LegacyArtifactKind = z.infer<typeof legacyArtifactKindSchema>;

export const legacyArtifactStatusSchema = z.enum(['draft', 'active', 'archived']);
export type LegacyArtifactStatus = z.infer<typeof legacyArtifactStatusSchema>;

export const legacyProvenanceSchema = z.enum(['user_authored', 'ai_suggested', 'hybrid', 'extracted_pipeline']);
export type LegacyProvenance = z.infer<typeof legacyProvenanceSchema>;

export const legacyExtractionTriggerSchema = z.enum([
  'manual',
  'repeated_insight',
  'post_decision_review',
  'truth_chamber_echo',
  'evolution_milestone',
  'user_explicit_save',
  'pipeline_groq',
]);

export type LegacyExtractionTrigger = z.infer<typeof legacyExtractionTriggerSchema>;
