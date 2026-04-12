// ─── Obsidian Atlas — Evolution Types ──────────────────────────────────────
// Types shared across the MindProfile and EvolutionTimeline chambers.

// ── Archetype ────────────────────────────────────────────────────────────────

export type CommunicationArchetype =
  | 'unknown'
  | 'philosopher'
  | 'engineer'
  | 'strategist'
  | 'storyteller'
  | 'analyst'
  | 'visionary'
  | 'pragmatist'
  | 'scholar';

// ── Cognitive Style ───────────────────────────────────────────────────────────

export interface CognitiveStyle {
  systemsThinker: boolean;
  firstPrinciplesReasoner: boolean;
  analogicalThinker: boolean;
  sovereignCommunicator: boolean;
  socraticDisposition: boolean;
  patternRecognizer: boolean;
  convergentThinker: boolean;
  divergentThinker: boolean;
}

// ── Domain Interest ───────────────────────────────────────────────────────────

export interface DomainInterest {
  name: string;
  score: number;           // 0–1 interest strength
  visitCount: number;
  relatedDomains: string[];
  color: string;           // hex color for constellation rendering
  category: 'science' | 'philosophy' | 'technology' | 'arts' | 'society' | 'mathematics';
}

// ── Communication Profile ─────────────────────────────────────────────────────

export interface CommunicationProfile {
  vocabularyLevel: number;          // 1–10
  formality: number;                // 0–1
  directness: number;               // 0–1
  warmth: number;                   // 0–1
  seriousness: number;              // 0–1
  preferredFormat: 'prose' | 'bullets' | 'code' | 'tables';
  preferredDepth: 'surface' | 'moderate' | 'deep' | 'exhaustive';
}

// ── Cognitive Radar ───────────────────────────────────────────────────────────

export interface CognitiveRadarValues {
  formality: number;               // 0–1
  directness: number;              // 0–1
  philosophicalBias: number;       // 0–1
  abstractTolerance: number;       // 0–1
  depthPreference: number;         // 0–1
  vocabularyLevel: number;         // 0–1 (normalized)
}

// ── System Prompt Mutation ────────────────────────────────────────────────────

export interface SystemPromptMutation {
  id: string;
  description: string;
  type: 'addition' | 'removal' | 'adjustment';
  sourceSignal: string;
  confidence: number;              // 0–1
  appliedAt: number;               // Unix timestamp (ms)
}

// ── Correction Log ────────────────────────────────────────────────────────────

export interface CorrectionLogEntry {
  id: string;
  timestamp: number;               // Unix timestamp (ms)
  description: string;
  incorporated: boolean;
}

// ── User Evolution Profile ────────────────────────────────────────────────────

export interface UserEvolutionProfile {
  userId: string;
  archetype: CommunicationArchetype;
  archetypeConfidence: number;     // 0–1
  profileVersion: number;
  lastUpdated: number;             // Unix timestamp (ms)
  firstContact: number;            // Unix timestamp (ms)
  totalInteractions: number;
  totalSignalsProcessed: number;

  cognitiveRadar: CognitiveRadarValues;
  cognitiveStyle: CognitiveStyle;
  domainInterests: DomainInterest[];
  communicationProfile: CommunicationProfile;

  activeMutations: SystemPromptMutation[];
  bannedPatterns: string[];
  preferredOpenings: string[];
  customInstructionsExcerpt: string;

  correctionLog: CorrectionLogEntry[];

  generatedTagline: string;
  archetypeDescription: string;
}

// ── Mutation Event ────────────────────────────────────────────────────────────

export interface MutationEvent {
  id: string;
  timestamp: number;               // Unix timestamp (ms)
  versionFrom: number;
  versionTo: number;
  triggerSignals: string[];        // human-readable signal descriptions
  mutations: string[];             // human-readable change list (prefix +/-/~)
  confidenceAtTime: number;        // 0–1, Atlas confidence at the moment of mutation
  archetype: CommunicationArchetype;
}

// ── Evolution Signals ─────────────────────────────────────────────────────────
// Used by TraitExtractor and EvolutionMutator. Kept separate from the UI-facing
// types above to avoid coupling the frontend to backend signal terminology.

export type SignalType =
  | 'vocabulary_sample'
  | 'question_pattern'
  | 'depth_request'
  | 'simplify_request'
  | 'format_preference'
  | 'domain_signal'
  | 'correction_issued'
  | 'praise_issued'
  | 'engagement_long'
  | 'engagement_short'
  | 'code_requested'
  | 'philosophical_tangent'
  | 'contrarian_push'
  | 'assumption_challenged';

export type CollectedSignalKind =
  | SignalType
  | 'message_sent'
  | 'domain_cluster'
  | 'sentiment_shift'
  | 'response_received'
  | 'response_regenerated'
  | 'session_length';

export interface EvolutionSignal {
  id: string;
  userId: string;
  sessionId: string;
  type: CollectedSignalKind;
  timestamp: Date;
  weight: number;
  processed: boolean;
  payload?: Record<string, unknown>;
  vocabularyLevel?: number;
  complexityScore?: number;
  messageLength?: number;
  rawText?: string;
  prefersProse?: boolean;
  prefersBullets?: boolean;
  prefersCode?: boolean;
  usesMarkdown?: boolean;
  domain?: string;
  isShortDirect?: boolean;
  correctionTopic?: string;
  correctionText?: string;
}

export interface ProfileStats {
  version: number;
  confidence: number;
  totalSignals: number;
}

export interface InteractionParams {
  userId: string;
  sessionId: string;
  userMessage: string;
  assistantMessage: string;
}

// ── Adaptation Output ─────────────────────────────────────────────────────────

export type ToneModifierKind =
  | 'increase_directness'
  | 'decrease_directness'
  | 'increase_formality'
  | 'decrease_formality'
  | 'add_warmth'
  | 'remove_warmth'
  | 'philosophical_register'
  | 'clinical_register'
  | 'technical_register'
  | 'narrative_register';

export interface ToneModifier {
  kind: ToneModifierKind;
  strength: number;               // 0–1
  rationale: string;
}

export type MutationTarget =
  | 'preamble'
  | 'depth_instruction'
  | 'tone_instruction'
  | 'format_instruction'
  | 'banned_patterns'
  | 'domain_context'
  | 'error_memory'
  | 'archetype_register';

export interface PromptMutation {
  target: MutationTarget;
  instruction: string;
  priority: number;               // 1–10
  condition?: string;
}

export interface AtlasAdaptationState {
  userId: string;
  generatedAt: Date;
  profileConfidence: number;
  archetype: CommunicationArchetype;
  customInstructions: string;
  toneModifiers: ToneModifier[];
  promptMutations: PromptMutation[];
  bannedPatterns: string[];
  openingStyles: string[];
  referenceBank: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Atlas CognitionMap + ConceptGraph supplemental types
// (added by CognitionMap.tsx / ConceptGraph.tsx)
// ─────────────────────────────────────────────────────────────────────────────

export type DomainKey =
  | 'philosophy'
  | 'technology'
  | 'strategy'
  | 'psychology'
  | 'science'
  | 'history'
  | 'culture'
  | 'economics'
  | 'mathematics'
  | 'art'
  | 'language'
  | 'ethics';

export interface DomainProfile {
  key: DomainKey;
  label: string;
  weight: number;
  firstEngaged: number;
  lastEngaged: number;
  sessionCount: number;
  topConcepts: string[];
}

export interface IntellectualReference {
  name: string;
  category: 'person' | 'text' | 'theory' | 'movement' | 'framework';
  domain: DomainKey;
  mentionCount: number;
  firstMentioned: number;
  sentiment: 'admired' | 'critical' | 'neutral' | 'conflicted';
}

export interface CorrectionEntry {
  id: string;
  timestamp: number;
  sessionId: string;
  originalClaim: string;
  correction: string;
  domain: DomainKey;
  severity: 'minor' | 'significant' | 'fundamental';
}

export interface AtlasAdjustment {
  id: string;
  timestamp: number;
  type:
    | 'toneShift'
    | 'depthIncrease'
    | 'depthDecrease'
    | 'domainExpansion'
    | 'styleAdaptation'
    | 'paceChange'
    | 'formatChange';
  description: string;
  trigger: string;
  domain?: DomainKey;
}

/** AtlasAdaptationSnapshot — snapshots of Atlas behavioral tuning over time (ConceptGraph use) */
export interface AtlasAdaptationSnapshot {
  id: string;
  timestamp: number;
  sessionId: string;
  changes: AtlasAdjustment[];
  toneVector: {
    formality: number;
    warmth: number;
    directness: number;
    challengingness: number;
    playfulness: number;
  };
  depthVector: {
    conceptualDepth: number;
    detailLevel: number;
    exampleFrequency: number;
    citationFrequency: number;
  };
  summary: string;
  trigger: string;
}

/** Concept Node — a single concept star in the CognitionMap */
export interface ConceptNode {
  id: string;
  label: string;
  domain: DomainKey | string;
  weight: number;
  visitCount: number;
  firstSeen: number;
  lastSeen: number;
  connections: string[];
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  glowColor: string;
  pulsePhase: number;
  isCluster: boolean;
  clusterChildren: string[];
}

export interface ConceptEdge {
  source: string;
  target: string;
  strength: number;
  type: 'semantic' | 'temporal' | 'causal' | 'contradictory';
}

export interface ConceptCluster {
  id: string;
  label: string;
  domain: DomainKey | string;
  nodeIds: string[];
  centroid: { x: number; y: number };
  radius: number;
  color: string;
}

export interface CognitionMapData {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  clusters: ConceptCluster[];
  lastUpdated: number;
}

// ── Overseer Enhancement Type ─────────────────────────────────────────────────
// Shared by AtlasOverseer and OverseerTrainer. Lives here so both modules
// import from a single source of truth.

export type EnhancementType =
  | 'none'              // response is already good, only light voice polish needed
  | 'depth_expansion'   // response is too shallow — expand with substance
  | 'voice_translation' // correct content but wrong voice/tone for this user
  | 'truth_arbitration' // models disagreed significantly — arbitrate
  | 'structural_reform' // content is fine but badly formatted for this user
  | 'full_rewrite';     // synthesis is inadequate — use models as raw material
