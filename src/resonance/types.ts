/**
 * Resonance System Types
 * Defines the core data structures for the significance engine and adaptive response system.
 */

export const RESONANCE_SCHEMA_VERSION = '1.1.0';

export enum ResonanceTier {
  FLEETING = 'fleeting',
  EMERGING = 'emerging',
  ESTABLISHED = 'established',
  CORE = 'core',
  SACRED = 'sacred'
}

export enum ResonanceConfidence {
  OBSERVED = 'observed',
  INFERRED = 'inferred',
  WEAKLY_INFERRED = 'weakly_inferred',
  STRONGLY_INFERRED = 'strongly_inferred',
  USER_CONFIRMED = 'user_confirmed',
  STALE = 'stale',
  CONTESTED = 'contested',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

export enum ResponseDepth {
  CONCISE = 'concise',
  STANDARD = 'standard',
  EXPANDED = 'expanded',
  DEEP = 'deep',
  EXPERT_DENSE = 'expert-dense'
}

export enum StructureStyle {
  ANSWER_FIRST = 'answer-first',
  LAYERED = 'layered',
  STRUCTURED = 'structured',
  NARRATIVE_COMPACT = 'narrative-compact',
  DIRECT = 'direct'
}

export enum ResonanceEdgeType {
  CO_OCCURRENCE = 'co_occurrence',
  REINFORCEMENT = 'reinforcement',
  CONTRADICTION = 'contradiction',
  EVOLUTION = 'evolution',
  CAUSALITY = 'causality',
  SYMBOLIC_RELATION = 'symbolic_relation',
  MOTIVATIONAL_DEPENDENCY = 'motivational_dependency',
  EMOTIONAL_ASSOCIATION = 'emotional_association'
}

export enum ResonanceDomain {
  GENERAL = 'general',
  SELF_CONCEPT = 'self_concept',
  AMBITION = 'ambition',
  WORK = 'work',
  CREATIVITY = 'creativity',
  RELATIONSHIPS = 'relationships',
  AESTHETICS = 'aesthetics',
  DISCIPLINE = 'discipline',
  INSECURITY = 'insecurity',
  MEANING = 'meaning',
  LOYALTY = 'loyalty',
  MASTERY = 'mastery',
  HEALING = 'healing',
  IDENTITY_CONSTRUCTION = 'identity_construction',
  TECHNICAL = 'technical',
  STRATEGIC = 'strategic',
  WRITING = 'writing',
  IMPLEMENTATION = 'implementation',
  REFLECTIVE = 'reflective',
  FACTUAL = 'factual',
  ANALYTICAL = 'analytical'
}

/**
 * SECTION B: PROFILE METADATA
 */
export interface ProfileMetadata {
  createdAt: string;
  updatedAt: string;
  firstSeenAt: string;
  lastInteractionAt: string;
  lastPreferenceUpdateAt?: string;
  lastInferenceUpdateAt?: string;
  profileMaturityLevel: number; // 0-1
  adaptationStage: 'early' | 'developing' | 'stable' | 'highly-individualized';
  dataCompletenessScore: number; // 0-1
  sourceIntegrityState: 'healthy' | 'sparse' | 'stale' | 'degraded';
  interactionCount: number;
}

/**
 * SECTION C & D & E: RESPONSE POSTURE
 */
export interface ResponsePosture {
  responseDepth: ResponseDepth;
  responseDensity: number; // 0-1
  explanationBreadth: number; // 0-1
  structureStyle: StructureStyle;
  directnessLevel: number; // 0-1
  contextInclusionLevel: number; // 0-1
  precisionBias: number; // 0-1
  expansionThreshold: number; // 0-1
  concisenessDiscipline: number; // 0-1
  useOfExamples: boolean;
  useOfBreakdowns: boolean;
  implementationSpecificity: number; // 0-1
}

/**
 * SECTION F: CONFIDENCE MODEL
 */
export interface ConfidenceEntry<T> {
  value: T;
  confidence: number; // 0-1
  evidenceCount: number;
  lastReinforcedAt: string;
  stability: 'low' | 'medium' | 'high';
  driftRisk: 'low' | 'medium' | 'high';
}

/**
 * SECTION G: DOMAIN ADAPTATION
 */
export interface DomainOverride extends Partial<ResponsePosture> {
  domain: ResonanceDomain;
  confidence: number;
  evidenceCount: number;
  lastUpdatedAt: string;
}

/**
 * SECTION K: EXPORT SHAPE FOR RESPONSE ENGINE
 */
export interface EffectiveResponseProfile {
  depth: ResponseDepth;
  density: number;
  breadth: number;
  style: StructureStyle;
  directness: number;
  contextInclusion: number;
  precision: number;
  expansionThreshold: number;
  conciseness: number;
  examples: boolean;
  breakdowns: boolean;
  implementationDepth: number;
  personalizationConfidence: number;
  profileMaturity: number;
  isEarlyStageBoostActive: boolean;
}

/**
 * THE ADAPTIVE RESPONSE PROFILE (CANONICAL SOURCE OF TRUTH)
 */
export interface AdaptiveResponseProfile {
  schemaVersion: string;
  metadata: ProfileMetadata;
  
  // Baseline defaults for new/low-context users
  baselineDefaults: ResponsePosture;
  
  // Explicit user-stated preferences
  explicitPreferences: Partial<ResponsePosture>;
  
  // Inferred behavioral tendencies
  inferredPreferences: {
    [K in keyof ResponsePosture]?: ConfidenceEntry<ResponsePosture[K]>;
  };
  
  // Domain-specific overrides
  domainAdaptations: Record<string, DomainOverride>;
  
  // SECTION H: INTERACTION SIGNALS SUMMARY
  signals: {
    asksForMoreDetailFrequency: number;
    asksForShorterRewriteFrequency: number;
    asksForClarificationFrequency: number;
    asksForExamplesFrequency: number;
    asksForImplementationDetailFrequency: number;
    asksForSimplificationFrequency: number;
    acceptsLongResponsesWell: number;
    rejectsOverlyLongResponses: number;
    engagesWithStructuredOutputs: number;
    recurringPreferenceForDirectAnswerFirst: number;
  };
  
  // SECTION I: CALIBRATION STATE
  calibration: {
    readiness: number;
    profileMaturityLevel: number;
    overallConfidence: number;
    personalizationStrength: number;
    adaptationMomentum: number;
    preferenceVolatility: number;
    recentBehaviorShiftDetected: boolean;
    earlyStageBoostActive: boolean;
    needsRebalancing: boolean;
    staleInferenceRisk: boolean;
    profileConsistencyScore: number;
  };
  
  // SECTION J: ADAPTATION GUARDRAILS
  guardrails: {
    minimumAnswerQualityFloor: number;
    minimumDepthFloorForComplexQueries: ResponseDepth;
    maximumBloatTolerance: number;
    antiRedundancyBias: number;
    antiUnderdevelopmentBias: number;
    precisionPreservationBias: number;
  };
}

export interface ResonanceProfile {
  profileId: string;
  subjectType: 'theme' | 'project' | 'person' | 'value' | 'goal' | 'identity' | 'tension' | 'memory';
  subjectId: string;
  
  // Dimensions (0-1)
  emotionalIntensity: number;
  identityRelevance: number;
  goalRelevance: number;
  recurrenceStrength: number;
  narrativeCentrality: number;
  decisionImpact: number;
  tensionWeight: number;
  relationalWeight: number;
  aestheticWeight: number;
  longevityPotential: number;
  fragilityIndex: number;
  transformationalPotential: number;
  
  confidence: ResonanceConfidence;
  privacySensitivity: number; // 0-1
  lastUpdatedAt: string;
}

export interface ResonanceObservation {
  observationId: string;
  sourceMessageId: string;
  excerptReference: string;
  inferredTheme: string;
  extractedSignals: {
    type: string;
    value: any;
    evidence: string;
  }[];
  confidence: ResonanceConfidence;
  observedAt: string;
  linkedEntities: string[];
  linkedProjects: string[];
  linkedValues: string[];
  linkedMemories: string[];
}

export interface ResonanceThread {
  threadId: string;
  canonicalTheme: string;
  aliases: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  status: 'active' | 'dormant' | 'resolved' | 'archived';
  trendDirection: 'rising' | 'stable' | 'fading' | 'oscillating';
  strengthScore: number; // 0-1
  identityLinkStrength: number; // 0-1
  goalLinkStrength: number; // 0-1
  tensionSummary?: string;
  relatedPeople: string[];
  relatedProjects: string[];
  relatedValues: string[];
  relatedMemories: string[];
  tier: ResonanceTier;
  confidence: ResonanceConfidence;
}

export interface ResonanceEdge {
  edgeId: string;
  fromNode: string; // ID of theme, project, etc.
  toNode: string;
  edgeType: ResonanceEdgeType;
  weight: number; // 0-1
  confidence: number; // 0-1
  evidenceCount: number;
}

export interface ResonanceAdjustmentLog {
  adjustmentId: string;
  entityId: string;
  previousState: any;
  newState: any;
  cause: string;
  userConfirmed: boolean;
  changedAt: string;
}

export interface ResonanceGraph {
  nodes: Record<string, {
    id: string;
    type: 'theme' | 'project' | 'person' | 'value' | 'goal' | 'identity' | 'tension' | 'memory';
    label: string;
    weight: number;
  }>;
  edges: ResonanceEdge[];
}

/**
 * A distilled resonance context packet for downstream reasoning.
 */
export interface ResonanceContextPacket {
  topThemes: ResonanceThread[];
  activeTensions: string[];
  highCareTopics: string[];
  linkedValues: string[];
  confidenceLevels: Record<string, ResonanceConfidence>;
  staleAssumptionWarnings: string[];
  identitySignificantProjects: string[];
  modulationCues: {
    tone: string;
    directness: number;
    softness: number;
    precision: number;
  };
  // New: Adaptive Response Profile for the engine
  responseProfile?: EffectiveResponseProfile;
}

/**
 * SECTION L: INTERACTION SIGNALS (INPUT CONTRACT)
 */
export interface InteractionSignal {
  type: 'query_complexity' | 'layer_expansion' | 'source_deep_dive' | 'follow_up' | 'abandonment' | 'explicit_preference';
  value: number; // 0-1
  timestamp: number;
  context?: {
    query?: string;
    intent?: string;
    layerId?: string;
    sourceTitle?: string;
    sourceType?: string;
    domain?: ResonanceDomain;
  };
}

/**
 * SECTION M: INFERENCE ENGINE TYPES
 */

export interface EvidenceVector {
  [key: string]: number;
}

export interface TraitUpdateResult {
  newValue: number;
  newConfidence: number;
  newStability: number;
  driftRisk: number;
}

export interface CalibrationStateUpdate {
  maturityIncrement: number;
  volatilityAdjustment: number;
  personalizationStrengthAdjustment: number;
}
