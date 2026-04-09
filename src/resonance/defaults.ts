import { 
  AdaptiveResponseProfile, 
  ResponseDepth, 
  StructureStyle, 
  RESONANCE_SCHEMA_VERSION 
} from "./types";

export const DEFAULT_ADAPTIVE_PROFILE: AdaptiveResponseProfile = {
  schemaVersion: RESONANCE_SCHEMA_VERSION,
  metadata: {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    firstSeenAt: new Date().toISOString(),
    lastInteractionAt: new Date().toISOString(),
    profileMaturityLevel: 0.1,
    adaptationStage: 'early',
    dataCompletenessScore: 0.1,
    sourceIntegrityState: 'healthy',
    interactionCount: 0
  },
  baselineDefaults: {
    responseDepth: ResponseDepth.STANDARD,
    responseDensity: 0.5,
    explanationBreadth: 0.5,
    structureStyle: StructureStyle.LAYERED,
    directnessLevel: 0.7,
    contextInclusionLevel: 0.5,
    precisionBias: 0.9,
    expansionThreshold: 0.6,
    concisenessDiscipline: 0.6,
    useOfExamples: true,
    useOfBreakdowns: true,
    implementationSpecificity: 0.5
  },
  explicitPreferences: {},
  inferredPreferences: {},
  domainAdaptations: {},
  signals: {
    asksForMoreDetailFrequency: 0,
    asksForShorterRewriteFrequency: 0,
    asksForClarificationFrequency: 0,
    asksForExamplesFrequency: 0,
    asksForImplementationDetailFrequency: 0,
    asksForSimplificationFrequency: 0,
    acceptsLongResponsesWell: 0.5,
    rejectsOverlyLongResponses: 0,
    engagesWithStructuredOutputs: 0.5,
    recurringPreferenceForDirectAnswerFirst: 0.5
  },
  calibration: {
    readiness: 0.1,
    profileMaturityLevel: 0.1,
    overallConfidence: 0.2,
    personalizationStrength: 0.1,
    adaptationMomentum: 0.1,
    preferenceVolatility: 0.5,
    recentBehaviorShiftDetected: false,
    earlyStageBoostActive: true, // Start with boost active for new users
    needsRebalancing: false,
    staleInferenceRisk: false,
    profileConsistencyScore: 0.8
  },
  guardrails: {
    minimumAnswerQualityFloor: 0.7,
    minimumDepthFloorForComplexQueries: ResponseDepth.STANDARD,
    maximumBloatTolerance: 0.8,
    antiRedundancyBias: 0.7,
    antiUnderdevelopmentBias: 0.8,
    precisionPreservationBias: 0.9
  }
};
