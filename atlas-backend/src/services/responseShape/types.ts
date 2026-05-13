/**
 * Canonical types for the Atlas response-shape redesign.
 *
 * Spec: `/home/user/workspace/atlas_response_shape_spec.md` § 3 (router types)
 * and §§ 4–5 (personalization + gap detector types).
 *
 * This module is the type-only single source of truth for the feature.
 * Waves B (mode library), C (personalization), D (gap detector), and E
 * (overseer integration) all import from here. Do not re-declare these
 * types elsewhere — extend this module.
 */

export type IntentClass =
  | 'factual'
  | 'decision'
  | 'claim'
  | 'positioning'
  | 'gap'
  | 'artifact'
  | 'mixed';

export type ModeId =
  | 'factual-quick'
  | 'decision-support'
  | 'claim-audit'
  | 'positioning-comparison'
  | 'gap-identifier'
  | 'artifact-generator';

/** Free-form per mode; the modeLibrary catalog is the source of truth for valid ids. */
export type SectionId = string;

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  /** ISO 8601 timestamp. Optional — turns persisted from chat history will have it. */
  createdAt?: string;
}

export interface RouterDecision {
  primaryIntent: IntentClass;
  mode: ModeId;
  condensed: boolean;
  /** 0..1 inclusive. */
  confidence: number;
  /** ≤ 200 chars; consumed by training-record logging. */
  reasonTrace: string;
  /**
   * Section ids to force on/off. A bare id appends a required section; a
   * `!`-prefixed id (e.g. `!self_governance_audit`) tells modeLibrary to
   * suppress that section even if the mode would normally include it.
   */
  sectionOverrides?: SectionId[];
  /** unfinished_business row id when the router detected a continuation. */
  continuedThread?: string;
}

export interface DoctrineDirective {
  id: string;
  directiveType: 'always_include_section' | 'never_include_section' | 'force_mode' | 'default';
  payload: Record<string, unknown>;
}

export interface PersonalizationContext {
  verbosity: 'low' | 'medium' | 'high';
  tone: 'direct' | 'professional' | 'warm' | 'analytical';
  structurePreference: 'minimal' | 'balanced' | 'structured';
  vocabLevel: 'accessible' | 'intermediate' | 'expert';
  /** Up to 3 short memory excerpts to ground "Strategic Utility"-style sections. */
  memoryExemplars: string[];
  doctrineDirectives: DoctrineDirective[];
  /** -1..+1 — negative = user is under-confident, hedge less; positive = over-confident, hedge more. */
  confidenceCalibration: number;
}
