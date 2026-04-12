// Atlas-Audit: [EXEC-OMNI] Verified — UserQuestion.response may carry omniRoutingProvenance (mode, posture, lineOfInquiry echoed from SSE).
// Atlas-Audit: [EXEC-MODE] Verified — Optional atlasWorkspace.activeMode for resuming last chamber after auth hydrate (sanitized at merge/build).
// Atlas-Audit: [EXEC-P1] Verified — Firestore atlasWorkspace snapshot type for sovereign continuity (journal, decisions, directives, pulse, posture, doctrine).
import type { 
  ResonanceProfile, 
  ResonanceObservation, 
  ResonanceThread, 
  ResonanceGraph, 
  ResonanceAdjustmentLog,
  AdaptiveResponseProfile,
  InteractionSignal,
  EffectiveResponseProfile
} from "./resonance/types";

export type { 
  ResonanceProfile, 
  ResonanceObservation, 
  ResonanceThread, 
  ResonanceGraph, 
  ResonanceAdjustmentLog,
  AdaptiveResponseProfile,
  InteractionSignal,
  EffectiveResponseProfile
} from "./resonance/types";

export type EntityType = 
  | 'person' 
  | 'company' 
  | 'product' 
  | 'store' 
  | 'idea' 
  | 'claim' 
  | 'event' 
  | 'trend' 
  | 'objective' 
  | 'concern' 
  | 'question' 
  | 'document' 
  | 'conversation' 
  | 'pattern'
  | 'discipline'
  | 'concept'
  | 'framework'
  | 'methodology'
  | 'decision'
  | 'scenario'
  | 'doctrine'
  | 'discussion'
  | 'signature'
  | 'canon'
  | 'pulse'
  | 'council'
  | 'mastery'
  | 'continuity'
  | 'relationship';

export type MemoryStatus = 
  | 'active' 
  | 'dormant' 
  | 'archived' 
  | 'unresolved' 
  | 'contested' 
  | 'foundational' 
  | 'seasonal' 
  | 'identity-linked';

export interface TensionLayer {
  truth: number; // 0-1
  weight: number; // 0-1
  timing: number; // 0-1
  tension: number; // 0-1
}

export interface Calibration {
  confidence: number; // 0-1
  evidenceSummary: string;
  reasoningPath: string[];
  disagreementMarkers: string[];
  confidenceDrivers: { increase: string[]; decrease: string[] };
}

export interface AuditTrail {
  id: string;
  timestamp: string;
  action: string;
  provenance: {
    sources: string[];
    observations: string[];
    reasoningModel: string;
  };
}

export interface Relationship {
  targetId: string;
  strength: number; // 0-1
  recency: string; // ISO date
  type: string;
  lineage?: boolean;
}

export interface EpistemicFramework {
  provenance: string;
  evidenceQuality: number; // 0-1
  sourceIndependence: number; // 0-1
  recency: string;
  consensus: number; // 0-1
  claimStability: number; // 0-1
  layer: 'fact' | 'inference' | 'interpretation' | 'speculation' | 'hypothesis';
  confidence: number; // 0-1
  multilingualSource?: {
    originalLanguage: string;
    originalText: string;
    transliteration?: string;
    semanticFidelityScore: number;
    translationRiskZones: string[];
    culturalNuance: string;
    domain: 'legal' | 'technical' | 'philosophical' | 'poetic' | 'medical' | 'cultural';
  };
}

export interface KnowledgeLayer {
  level: 'literacy' | 'competence' | 'fluency' | 'rigor' | 'nuance' | 'synthesis' | 'ambiguity';
  description: string;
  masteryIndicators: string[];
}

export interface DisciplineBlueprint {
  foundationalPrinciples: string[];
  coreVocabulary: string[];
  firstPrinciples: string[];
  conceptualFrameworks: string[];
  schoolsOfThought: string[];
  historicalDevelopment: { era: string; description: string }[];
  influentialFigures: string[];
  modernApplications: string[];
  unresolvedDebates: string[];
  technicalNuance: string[];
  commonMisconceptions: string[];
  edgeCases: string[];
  crossDisciplinaryImplications: string[];
  frontierQuestions: string[];
}

export interface Entity {
  id: string;
  type: EntityType;
  title: string;
  description: string;
  metadata: Record<string, any>;
  tension: TensionLayer;
  epistemic?: EpistemicFramework;
  blueprint?: DisciplineBlueprint;
  layers?: KnowledgeLayer[];
  tags: string[];
  relationships: Relationship[];
  createdAt: string;
  updatedAt: string;
  memoryStatus: MemoryStatus;
  calibration?: Calibration;
  auditTrail?: AuditTrail[];
}

export interface Decision {
  id: string;
  title: string;
  context: string;
  dossier: string;
  options: {
    id: string;
    label: string;
    tradeoffs: string[];
    consequences: string[]; // Second-order
    reversibility: number; // 0-1
    uncertainty: number; // 0-1
  }[];
  stakeholders: string[];
  principlesChecked: string[];
  emotionalContamination: string[];
  status: 'pending' | 'resolved' | 'post-mortem';
  reviewLoop?: string;
}

export interface Scenario {
  id: string;
  title: string;
  branches: {
    id: string;
    description: string;
    probability: number;
    leveragePoints: string[];
    failurePaths: string[];
    strategicPivots: string[];
  }[];
  groundedInference: string[];
  speculation: string[];
}

export interface PersonalDoctrine {
  id: string;
  title: string;
  category: 'principle' | 'value' | 'decision-rule' | 'standard' | 'red-line' | 'aesthetic' | 'strategic';
  content: string;
  version: number;
  refinementVector?: 'precision' | 'elegance' | 'authority' | 'restraint' | 'depth' | 'structural-understanding';
  connections: {
    decisions: string[];
    patterns: string[];
    contradictions: string[];
  };
}

export interface Signal {
  id: string;
  type: 'hard' | 'soft';
  category: string;
  source: string;
  content: string;
  insight: string;
  strength: number;
  timestamp: string;
  entities: string[];
}

export type InquiryStyle = 
  | 'diagnostic' 
  | 'strategic' 
  | 'philosophical' 
  | 'adversarial' 
  | 'synthetic' 
  | 'symbolic' 
  | 'technical' 
  | 'skeptical' 
  | 'comparative' 
  | 'identity-level';

export interface QuestionTopology {
  primaryStyles: InquiryStyle[];
  abstractionLevel: number;
  compressionPreference: 'distilled' | 'layered' | 'recursive';
  appetiteForRigor: number;
  appetiteForAmbiguity: number;
  synthesisVsDecomposition: number;
  theoryVsApplication: number;
  structurePreference: 'structured' | 'exploratory';
  fascinationWithContradiction: number;
  fascinationWithMotive: number;
  fascinationWithSystems: number;
  attractionToSymbolism: number;
  attractionToHiddenArchitecture: number;
  toleranceForUnresolvedTension: number;
  preferenceForAdversarialTesting: number;
  preferenceForRefinement: number;
  eleganceVsUtility: number;
}

export interface LatentPattern {
  id: string;
  inferredCenter: string;
  supportingSignals: string[];
  confidence: number;
}

export interface CognitiveSignature {
  thinkingStyle: 'strategist' | 'engineer' | 'philosopher' | 'artist' | 'diplomat';
  learningCadence: 'rapid' | 'deliberate' | 'cyclical';
  strengths: string[];
  intellectualAltitude: number;
  ambiguityTolerance: number;
  systemicCoherence: number;
  synthesisVelocity: number;
  preferredInstructionMode: 'first-principles' | 'socratic' | 'adversarial' | 'mastery';
  topology: QuestionTopology;
  latentPatterns: LatentPattern[];
}

export interface CognitiveStyleModel {
  abstractionPreference: number; // 0-1
  structurePreference: 'structured' | 'exploratory';
  analogyPreference: number; // 0-1
  synthesisPreference: number; // 0-1
  decompositionPreference: number; // 0-1
  firstPrinciplesOrientation: number; // 0-1
  precisionPreference: number; // 0-1
  ambiguityTolerance: number; // 0-1
}

export interface CommunicationPreferenceModel {
  preferredTone: string;
  preferredDensity: 'distilled' | 'layered' | 'recursive';
  preferredFramingOrder: 'direct' | 'context-first';
  preferredUseOfExamples: number; // 0-1
  directnessVsElegance: number; // 0-1
  strategicVsReflectiveVoice: number; // 0-1
}

export interface AestheticAndTasteModel {
  visualRefinement: number; // 0-1
  structuralBeauty: number; // 0-1
  clutterTolerance: number; // 0-1
  preferredMetaphors: string[];
  sourceTaste: string[];
}

export interface ChallengeAndSupportModel {
  appetiteForRedTeaming: number; // 0-1
  appetiteForNuance: number; // 0-1
  supportVsPressureFit: number; // 0-1
  unresolvedEndingTolerance: number; // 0-1
  challengeIntensityResponse: number; // 0-1
}

export interface ContinuityAndIdentityModel {
  recurringThemes: string[];
  doctrineGrowth: number; // 0-1
  identityLevelDomains: string[];
  futureSelfContinuity: number; // 0-1
  longArcDevelopment: string[];
}

export interface CadenceModel {
  sessionRhythm: 'fast' | 'slow' | 'variable';
  workMode: 'deep-work' | 'quick-clarity' | 'exploratory';
  overloadIndicators: string[];
  reflectionVsAction: number; // 0-1
  attentionPatterns: string[];
}

export interface UserCognitionModel {
  reasoningArchitecture: {
    logicVsInstinct: number; // 0-1
    patternRecognitionStrength: number; // 0-1
    personalMeaningWeight: number; // 0-1
    deductiveVsInductive: number; // 0-1
  };
  prioritizationLogic: {
    urgencyVsImportance: number; // 0-1
    longTermVsImmediate: number; // 0-1
    valuesAlignmentWeight: number; // 0-1
  };
  ambiguityHandling: {
    tolerance: number; // 0-1
    interpretationBias: 'optimistic' | 'cautious' | 'analytical' | 'exploratory';
    resolutionSpeed: 'rapid' | 'deliberate' | 'comfortable-with-unresolved';
  };
  riskAndUncertainty: {
    riskAppetite: number; // 0-1
    uncertaintyResponse: 'freeze' | 'analyze' | 'pivot' | 'commit';
    decisionArchitectureUnderPressure: string;
  };
  behavioralSignatures: {
    stressResponse: string;
    curiosityDrivers: string[];
    confidenceMarkers: string[];
    urgencyTriggers: string[];
    reflectionDepth: number; // 0-1
  };
  learningAndBeliefRevision: {
    beliefStability: number; // 0-1
    integrationSpeed: number; // 0-1
    revisionTriggers: string[];
    opennessToContradiction: number; // 0-1
  };
  systemicApproach: {
    conflictStrategy: string;
    opportunityDetection: string;
    peopleDynamicsHandling: string;
    strategicPreference: string;
  };
  predictabilityMap: {
    predictableAreas: string[];
    unconventionalAreas: string[];
    evolutionMarkers: string[]; // Where the user has evolved beyond prior assumptions
  };
}

export interface PrivacySovereignty {
  dataMinimization: {
    retentionPolicy: 'minimal' | 'standard' | 'comprehensive';
    expiryDays: number;
  };
  memorySovereignty: {
    localOnlyDomains: string[];
    encryptedTiers: string[];
    revocableInferences: string[];
  };
  ownershipStatus: {
    isExportable: boolean;
    isRedactable: boolean;
    isErasable: boolean;
  };
  exposureControl: {
    leastExposureActive: boolean;
    compartmentalizedDomains: string[];
  };
  inferenceTransparency: {
    showProbabilisticLabels: boolean;
    distinguishExplicitFromInferred: boolean;
  };
  forgettingPower: {
    gracefulDecayActive: boolean;
    selectiveForgettingEnabled: boolean;
  };
}

export interface UserThoughtModel {
  knowledge: string[];
  learning: string[];
  learningStyle: string;
  thoughtStructure: CognitiveSignature;
  doctrine: PersonalDoctrine[];
  autonomousLearning: {
    active: boolean;
    focusAreas: string[];
    alignmentWithLongArc: number;
  };
  
  // Humanization Submodels
  cognitiveStyle: CognitiveStyleModel;
  communication: CommunicationPreferenceModel;
  aesthetic: AestheticAndTasteModel;
  challenge: ChallengeAndSupportModel;
  identity: ContinuityAndIdentityModel;
  cadence: CadenceModel;

  // Adaptive Cognitive Evolution Layer
  cognition: UserCognitionModel;
  privacy: PrivacySovereignty;
}

export type AnswerDepthTier = 1 | 2 | 3 | 4 | 5;

export type AnswerIntegrityLabel = 
  | 'direct-source-backed'
  | 'best-synthesis'
  | 'likely-inference'
  | 'contested'
  | 'jurisdiction-specific'
  | 'time-sensitive'
  | 'interpretive'
  | 'exploratory'
  | 'symbolic-reading';

export interface SourceMetadata {
  id: string;
  title: string;
  uri: string;
  type: 'primary' | 'secondary' | 'tertiary' | 'real-time' | 'media' | 'user-provided';
  authority: number; // 0-1
  recency: string;
  reliability: number; // 0-1
  distortions?: string[];
}

export interface VerificationResult {
  status: 'verified' | 'partially-verified' | 'unverified' | 'conflicting' | 'unknown';
  confidence: number; // 0-1
  octupleCheckCount: number;
  unresolvedDisputes?: string[];
  assumptions?: string[];
}

export interface TruthFacing {
  directlySupported: string[];
  inferred: string[];
  uncertain: string[];
  disputed: string[];
  whatWouldChangeConclusion: string[];
  userCaution: string[];
  strongestPoint: string;
  weakestPoint: string;
}

export interface LayeredResponse {
  answer: string;
  evidenceNote?: string[];
  uncertainty?: string[];
  claimHighlights?: { claim: string; type: string }[];
  nextQuestion?: string;

  responseForm?: 'unified' | 'internal-layers' | 'tabbed';
  depthTier?: AnswerDepthTier;
  integrityLabel?: AnswerIntegrityLabel;
  verification?: VerificationResult;
  sources?: SourceMetadata[];
  reasoning?: string;
  context?: string;
  implications?: string[];
  nuance?: string;
  nextSteps?: string[];
  truthFacing?: TruthFacing;
  groundingUrls?: { title: string; uri: string }[];
  
  // For foundational questions
  interpretation?: string;
  capabilities?: { category: string; items: string[] }[];
  purpose?: string;
  entryPoints?: string[];
  
  // Adaptive Cognitive Evolution Layer
  generalOptimalSolution?: string;
  userSpecificSolution?: string;
  userForecasts?: UserForecast[];
  systemicMapping?: {
    inputs: string[];
    incentives: string[];
    constraints: string[];
    dependencies: string[];
    tradeoffs: string[];
    secondOrderEffects: string[];
    failurePoints: string[];
    feedbackLoops: string[];
    leveragePoints: string[];
  };
  metaLearning?: {
    revealedAboutUser: string[];
    patternsConfirmed: string[];
    assumptionsWeakened: string[];
    newVariablesToTrack: string[];
    modelUpdates: string[];
  };
}

export type UserRole = 'guest' | 'registered_user' | 'power_user' | 'sovereign_creator';

export interface UserProfile {
  uid: string;
  email: string;
  emailVerified: boolean;
  role: UserRole;
  createdAt: string;
  lastLogin?: string;
  securitySettings: {
    mfaEnabled: boolean;
    passkeyEnabled: boolean;
    recoveryEmail?: string;
  };
  privacySettings: {
    dataMinimization: boolean;
    memorySovereignty: boolean;
  };
  consent?: ConsentState;
  constitution?: PersonalConstitution;
  truthLedger?: TruthLedger;
  evolutionTimeline?: EvolutionTimeline;
  memoryArchitecture?: MemoryArchitecture;
  driftDetection?: DriftDetection;
  /** Persisted workspace slice — see `AtlasWorkspaceSnapshot` */
  atlasWorkspace?: AtlasWorkspaceSnapshot;
}

export interface PersonalConstitution {
  version: number;
  lastUpdated: string;
  values: ConstitutionValue[];
  standards: ConstitutionStandard[];
  goals: ConstitutionGoal[];
  motives: ConstitutionMotive[];
  tensions: ConstitutionTension[];
  reasoningStyle: ReasoningStyle;
  aestheticModel: AestheticModel;
}

export interface ConstitutionValue {
  id: string;
  title: string;
  description: string;
  priority: number; // 1-10
  origin?: string; // Where this value came from
}

export interface ConstitutionStandard {
  id: string;
  domain: 'thought' | 'work' | 'communication' | 'ethics';
  threshold: string;
  description: string;
}

export interface ConstitutionGoal {
  id: string;
  title: string;
  horizon: 'short' | 'medium' | 'long' | 'legacy';
  description: string;
  alignmentScore: number; // 0-1
}

export interface ConstitutionMotive {
  id: string;
  driver: string;
  intensity: number;
}

export interface ConstitutionTension {
  id: string;
  poleA: string;
  poleB: string;
  description: string;
  currentBalance: number; // 0 (Pole A) to 1 (Pole B)
}

export interface ReasoningStyle {
  preference: 'first-principles' | 'analogical' | 'empirical' | 'intuitive';
  depthThreshold: number;
  rigorLevel: number;
}

export interface AestheticModel {
  vibe: 'minimalist' | 'brutalist' | 'editorial' | 'technical' | 'baroque';
  tonality: 'stoic' | 'warm' | 'analytical' | 'provocative';
  colorPreference: string[];
}

export interface TruthLedger {
  entries: TruthEntry[];
  contradictions: Contradiction[];
  lastAudit: string;
}

export type EpistemicStatus = 
  | 'verified-fact' 
  | 'strong-evidence' 
  | 'reasoned-inference' 
  | 'probabilistic-assumption' 
  | 'emotional-interpretation' 
  | 'user-belief' 
  | 'unresolved-ambiguity';

export interface TruthEntry {
  id: string;
  claim: string;
  status: EpistemicStatus;
  confidence: number; // 0-1
  evidenceTrail: string[]; // IDs of sources or other entries
  tags: string[];
  timestamp: string;
  isContested: boolean;
}

export interface Contradiction {
  id: string;
  entryAId: string;
  entryBId: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'resolved' | 'dismissed';
}

export interface EvolutionTimeline {
  milestones: GrowthMilestone[];
  identityDiffs: IdentityDiff[];
  recurringLoops: RecurringLoop[];
}

export interface GrowthMilestone {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  category: 'belief' | 'skill' | 'behavior' | 'strategic';
  impact: number; // 0-1
}

export interface IdentityDiff {
  id: string;
  timestamp: string;
  field: string;
  oldValue: any;
  newValue: any;
  significance: 'low' | 'medium' | 'high';
  context?: string;
}

export interface RecurringLoop {
  id: string;
  title: string;
  description: string;
  frequency: number;
  lastSeen: string;
  status: 'active' | 'broken' | 'monitored';
}

export interface DriftDetection {
  alerts: DriftAlert[];
  calibrationRituals: CalibrationRitual[];
  overallAlignment: number; // 0-1
}

export interface DriftAlert {
  id: string;
  timestamp: string;
  type: 'value-drift' | 'goal-drift' | 'behavioral-drift';
  description: string;
  severity: 'low' | 'medium' | 'high';
  evidence: string[];
}

export interface CalibrationRitual {
  id: string;
  title: string;
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  lastPerformed?: string;
  status: 'pending' | 'completed' | 'skipped';
}

export interface MemoryArchitecture {
  transient: MemoryEntry[]; // Short-term, ephemeral
  working: MemoryEntry[];   // Active context, project-specific
  sovereign: MemoryEntry[]; // Long-term, core identity/beliefs
}

export interface MemoryEntry {
  id: string;
  content: string;
  timestamp: string;
  importance: number; // 0-1
  tags: string[];
  layer: 'transient' | 'working' | 'sovereign';
  source?: string;
  lastAccessed?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actorUid: string;
  action: string;
  resource?: string;
  metadata?: any;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface Gap {
  id: string;
  title: string;
  description: string;
  type:
    | 'bug'
    | 'logic_failure'
    | 'privacy_risk'
    | 'security_weakness'
    | 'latency_bottleneck'
    | 'structural_gap';
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'identified' | 'suspected' | 'investigating' | 'repair_proposed' | 'repaired' | 'failed_repair';
  detectedAt: string;
  repairedAt?: string;
  /** From merged API: console gap vs evolution eval gap. */
  source?: 'governance' | 'evolution';
}

export interface ChangeProposal {
  id: string;
  title: string;
  description: string;
  class: 0 | 1 | 2 | 3 | 4;
  status: 'draft' | 'proposed' | 'testing' | 'approved' | 'deployed' | 'rolled_back' | 'rejected';
  proposedBy: string;
  approvedBy?: string;
  createdAt: string;
  deployedAt?: string;
  rollbackSafe: boolean;
}

export interface EmergencyContainment {
  active: boolean;
  activatedAt?: string;
  activatedBy?: string;
  reason?: string;
  level: 1 | 2 | 3 | 4;
  forensicSnapshot?: {
    configState: any;
    authLogs: string[];
    activeSessions: string[];
    timestamp: string;
  };
  recoveryPlan?: string;
  liftedAt?: string;
  liftedBy?: string;
}

export interface UserForecast {
  action: string;
  probability: number; // 0-1
  reasoning: string;
  patterns: string[];
  signals: string[];
}

export interface UserQuestion {
  id: string;
  text: string;
  timestamp: string;
  analysis: {
    style: InquiryStyle;
    depth: number;
    dimensions: Partial<QuestionTopology>;
  };
  response?: {
    synthesis: string;
    latentPatterns: string[];
    strategicImplications: string[];
    suggestedChambers: string[];
    epistemicStatus: 'fact' | 'inference' | 'interpretation' | 'speculation' | 'hypothesis';
    cognitiveSignatureImpact: string;
    /** Echo from `/v1/chat/omni-stream` `routing` / `done` events (server truth for UI provenance). */
    omniRoutingProvenance?: {
      mode: string;
      posture: number;
      lineOfInquiry: string | null;
    };
    followUp?: string;
    layered?: LayeredResponse;
    
    // Adaptive Cognitive Evolution Layer
    generalOptimalSolution?: string;
    userSpecificSolution?: string;
    userForecasts?: UserForecast[];
    adaptiveEvolutionLogs?: AdaptiveEvolutionLogEntry[];
    systemicMapping?: {
      inputs: string[];
      incentives: string[];
      constraints: string[];
      dependencies: string[];
      tradeoffs: string[];
      secondOrderEffects: string[];
      failurePoints: string[];
      feedbackLoops: string[];
      leveragePoints: string[];
    };
    metaLearning?: {
      revealedAboutUser: string[];
      patternsConfirmed: string[];
      assumptionsWeakened: string[];
      newVariablesToTrack: string[];
      modelUpdates: string[];
    };
  };
}

export interface GlobalIntelligence {
  trendingTopics: string[];
  shiftingCenters: string[];
}

export interface SalonPost {
  id: string;
  author: {
    name: string;
    role: string;
    avatar?: string;
  };
  content: string;
  timestamp: string;
  upvotes: number;
  replies: SalonPost[];
  tags: string[];
}

export interface SalonThread {
  id: string;
  title: string;
  topic: string;
  posts: SalonPost[];
  participants: number;
  tension: number;
}

export interface CanonItem {
  id: string;
  title: string;
  author: string;
  type: 'text' | 'framework' | 'thinker' | 'idea';
  status: 'canon' | 'anti-canon';
  significance: string;
  flaws?: string[];
  resonanceScore: number;
  tags: string[];
}

export interface CouncilLens {
  id: string;
  name: string;
  description: string;
  icon: string;
  perspective: string;
}

export interface LifePattern {
  id: string;
  title: string;
  category: 'relationship' | 'authority' | 'motivation' | 'identity' | 'creative' | 'obstacle';
  description: string;
  strength: number;
  trend: 'strengthening' | 'weakening' | 'stable';
  lastObserved: string;
}

export interface RelationshipDepth {
  id: string;
  personId: string;
  name: string;
  role: string;
  trust: number;
  resonance: number;
  drivers: string[];
  recentAuthorityMoment?: string;
  mentalModel: string;
  preferredLanguage: string;
  unresolvedTensions: string[];
  trustTrajectory: number[];
  roleInUserMind: string;
  keySensitivities: string[];
}

export interface PulseItem {
  id: string;
  type: 'ripening' | 'neglected' | 'relevant' | 'attention' | 'pattern';
  content: string;
  priority: number;
  timestamp: string;
}

export interface ConsentState {
  acceptedTerms: boolean;
  informedConsent: boolean;
  granularConsents: {
    cognitiveSignature: boolean;
    questionTopology: boolean;
    relationshipPresence: boolean;
    identityArc: boolean;
    covenantMatching: boolean;
    sharedChambers: boolean;
    connectors: boolean;
    crossAccountComparison: boolean;
    enterpriseGovernance: boolean;
    modelImprovement: boolean;
    browserHistory: boolean;
  };
}

export type FeatureGroup = 'A' | 'B' | 'C';

export interface EvolutionPhase {
  id: number;
  title: string;
  description: string;
  status: 'completed' | 'active' | 'planned';
}

export type DirectiveType = 
  | 'tone' 
  | 'depth' 
  | 'structure' 
  | 'challenge' 
  | 'ui' 
  | 'context' 
  | 'continuity' 
  | 'learning' 
  | 'boundary' 
  | 'custom';

export type DirectiveOutcome = 
  | 'fully-accepted' 
  | 'accepted-with-bounds' 
  | 'context-limited' 
  | 'rejected';

export type DirectiveScope = 
  | 'once' 
  | 'session' 
  | 'chamber' 
  | 'question' 
  | 'persistent' 
  | 'default';

export interface Directive {
  id: string;
  text: string;
  type: DirectiveType[];
  outcome: DirectiveOutcome;
  explanation: string;
  scope: DirectiveScope;
  targetChamber?: string;
  timestamp: string;
  isActive: boolean;
  expiresAt?: string;
}

export interface AdaptivePosture {
  tone: string;
  depth: number;
  challenge: number;
  uiDensity: 'compact' | 'spacious';
  languageLevel: 'simple' | 'standard' | 'advanced' | 'expert' | 'forensic';
  directness: number;
  continuityIntensity: number;
  activeDirectives: string[]; // IDs
}

export interface MindSnapshot {
  id: string;
  timestamp: string;
  signature: CognitiveSignature;
  dominantTensions: string[];
  refinementFocus: string;
}

export interface UIConfiguration {
  homeViewEmphasis: 'map' | 'chamber' | 'dossier' | 'doctrine' | 'forge';
  visualDensity: 'compact' | 'spacious';
  structurePreference: 'comparative' | 'cartographic' | 'axial' | 'constellation' | 'manuscript';
  panelPriority: Record<string, number>;
  defaultVisualizationMode: string;
  layoutAdjustments: Record<string, any>;
  sidebarCollapsed: boolean;
}

export type CrucibleMode = 
  | 'pressure-test'
  | 'adversarial-review'
  | 'reality-check'
  | 'contradiction-scan'
  | 'blind-spot-finder'
  | 'decision-forge'
  | 'narrative-deconstruction'
  | 'self-deception-audit'
  | 'hard-truth'
  | 'reforge';

export type CrucibleIntensity = 
  | 'calibrated'
  | 'intensive'
  | 'ruthless';

export interface CrucibleExchange {
  id: string;
  timestamp: string;
  userInput: string;
  atlasResponse: string;
  epistemicCategory: 'adversarial-hypothesis' | 'structural-critique' | 'logical-fracture' | 'reality-check' | 'epistemic-warning' | 'synthesis';
  reasoning?: string;
}

export interface CrucibleSession {
  id: string;
  startTime: string;
  mode: CrucibleMode;
  intensity: CrucibleIntensity;
  topic: string;
  exchanges: CrucibleExchange[];
  findings?: {
    contradictions: string[];
    weaknesses: string[];
    assumptions: string[];
    selfDeceptions: string[];
    survivingDoctrine: string;
    unansweredQuestions: string[];
    requirements: {
      courage: string[];
      skill: string[];
      humility: string[];
      structure: string[];
    };
    nextRevision: string;
  };
  reconstruction?: {
    strongerDoctrine: string;
    cleanerArguments: string[];
    betterStandards: string[];
    groundedPlans: string[];
    durableOrder: string;
  };
}

export type JournalAssistanceMode = 
  | 'reflective-mirror'
  | 'strategic-analyst'
  | 'doctrine-standards'
  | 'adversarial-red-team'
  | 'growth-mastery'
  | 'custom';

export interface JournalEntry {
  id: string;
  title: string;
  content: string;
  timestamp: string;
  tags: string[];
  isPinned?: boolean;
  isUnresolved?: boolean;
  doctrineLinks?: string[];
  chamberLinks?: string[];
  continuityReferences?: string[];
  assistanceEnabled: boolean;
  assistanceMode: JournalAssistanceMode;
  customAssistancePrompt?: string;
  analysis?: {
    observation: string[];
    interpretation: string[];
    inference: string[];
    hypothesis: string[];
    summary: string;
    suggestedRefinements: string[];
    tensionPoints?: string[];
    doctrineImplications?: string[];
    challengePrompts?: string[];
    nextReflectiveQuestions?: string[];
  };
}

/** Lineage: versioned blob in `users/{uid}.atlasWorkspace` (merge, not replace profile). */
export interface AtlasWorkspaceSnapshot {
  version: 1;
  updatedAt: string;
  journal: JournalEntry[];
  decisions: Decision[];
  directives: Directive[];
  pulse: { lastUpdate: string; items: PulseItem[] };
  activePosture: AdaptivePosture;
  personalDoctrine: PersonalDoctrine[];
  /** Persisted navigation chamber; legacy docs may omit. Validated with isKnownActiveMode before apply. */
  activeMode?: AppState['activeMode'];
}

export interface AtlasLaw {
  id: string;
  title: string;
  description: string;
  rank: number; // 1 is highest
  isNonNegotiable: boolean;
}

export interface AtlasConstitution {
  laws: AtlasLaw[];
  lastRatified: string;
}

export interface RestraintDecision {
  action: string;
  isRestrained: boolean;
  reasoning: string;
  principleApplied: string;
}

export interface AdaptiveRestraintEngine {
  recentDecisions: RestraintDecision[];
  restraintLevel: number; // 0-1
}

export type MemoryType = 'explicit' | 'inferred' | 'superseded' | 'foundational' | 'seasonal';

export interface MemoryProvenance {
  reliability: number; // 0-1
  recency: string;
  type: MemoryType;
  sourceId?: string;
  decayRate: number; // 0-1
  isArchived: boolean;
}

export interface WhyThisMatters {
  strategic: string;
  developmental: string;
  doctrinal: string;
  emotional?: string;
  longArc: string;
}

export interface BenchmarkResult {
  metric: string;
  score: number; // 0-1
  finding: string;
  correctionApplied?: string;
}

export interface CalibrationHarness {
  lastTest: string;
  results: BenchmarkResult[];
  overallReliability: number;
}

export type UserOperationalMode = 
  | 'overloaded'
  | 'reflective'
  | 'decisive'
  | 'exploratory'
  | 'conflicted'
  | 'disciplined'
  | 'diffuse'
  | 'action-ready'
  | 'synthesis-heavy'
  | 'pressure-sensitive';

export interface StateOfMindLayer {
  currentMode: UserOperationalMode;
  confidence: number;
  indicators: string[];
  lastUpdated: string;
}

export type LifeTheater = 
  | 'self'
  | 'work'
  | 'relationships'
  | 'doctrine'
  | 'mastery'
  | 'money'
  | 'health'
  | 'creative-output'
  | 'long-arc-future';

export interface LifeDomain {
  theater: LifeTheater;
  patterns: string[];
  decisions: string[];
  doctrines: string[];
  status: 'active' | 'neglected' | 'evolving';
}

export interface ReconstructionEngine {
  lastCritiqueId: string;
  reconstructionPath: {
    flaw: string;
    reconstruction: string;
    nextAction: string;
  }[];
}

export interface VaultMode {
  isActive: boolean;
  encryptionStatus: 'active' | 'inactive';
  privateMaterials: string[]; // IDs
}

export interface CuratedExpertLayer {
  expertChambers: string[];
  canonicalSources: string[];
  readingLadders: { title: string; steps: string[] }[];
  frameworks: string[];
}

export interface BuildArtifact {
  id: string;
  type: 'strategy-brief' | 'doctrine-book' | 'deck' | 'essay' | 'research-memo' | 'teaching-module' | 'issue-map' | 'playbook' | 'manual' | 'manuscript';
  title: string;
  content: string;
  status: 'draft' | 'finished';
}

export interface BuildWithAtlas {
  artifacts: BuildArtifact[];
}

export interface PersonalOperatingManual {
  thinkingPatterns: string[];
  failureModes: string[];
  judgmentDistortions: string[];
  clarityDrivers: string[];
  standards: string[];
  learningMethods: string[];
  decisionRules: string[];
  pressureReminders: string[];
  flourishingEnvironments: string[];
  blindSpots: string[];
}

export interface OnlyWhatIsEssential {
  isActive: boolean;
  centralTruth: string;
  decisiveVariable: string;
  strongestTension: string;
  highLeverageMove: string;
  priorityOne: string;
}

export interface TemporalIntelligence {
  urgent: string[];
  loudButNotUrgent: string[];
  ripening: string[];
  decaying: string[];
  postponed: string[];
  notReady: string[];
  identityLevel: string[];
  temporaryFascination: string[];
  matureNecessity: string[];
}

export interface AntiBloatGovernor {
  lastReview: string;
  decisions: {
    feature: string;
    impactOnClarity: number;
    impactOnLeverage: number;
    dignityPreserved: boolean;
    decision: 'keep' | 'refine' | 'remove';
  }[];
}

export type ComputePosture = 'minimal' | 'standard' | 'deep-retrieval' | 'leviathan-class';
export type UIPosture = 'essential' | 'focused' | 'expansive' | 'cartographic';

export interface CognitiveLoadGeometry {
  computePosture: ComputePosture;
  uiPosture: UIPosture;
  activeTier: 1 | 2 | 3;
  precomputedAssetsAvailable: string[];
  latentContextLoaded: boolean;
}

export interface MirrorforgeModel {
  activeModes: {
    id: string;
    label: string;
    description: string;
    confidence: number;
    isCurrent: boolean;
  }[];
  currentRead: {
    dominantInsight: string;
    surfaceDriver: string;
    deeperDriver: string;
    hiddenTension: string;
    evidence: string[];
    confidence: number;
  };
  patternLedger: {
    id: string;
    title: string;
    description: string;
    recurrence: number;
    lastSeen: string;
    trend: 'improving' | 'declining' | 'stable';
  }[];
  decisionDivergence: {
    mostLikely: {
      action: string;
      reasoning: string;
      risk: string;
      outcome: string;
    };
    highestOrder: {
      action: string;
      reasoning: string;
      risk: string;
      outcome: string;
    };
    divergenceScore: number;
  };
}

export interface RealityEngineModel {
  activeSystems: {
    id: string;
    label: string;
    category: string;
    isActive: boolean;
  }[];
  systemNodes: {
    id: string;
    label: string;
    type: 'goal' | 'project' | 'relationship' | 'habit' | 'constraint' | 'leverage' | 'bottleneck';
    importance: number;
    connections: { targetId: string; strength: number; type: 'positive' | 'negative' | 'neutral' }[];
  }[];
  consequenceInspector: {
    immediate: string[];
    secondOrder: string[];
    hiddenCosts: string[];
    highestLeverage: string;
    recommendation: string;
  };
  timeRipples: {
    timestamp: string;
    effect: string;
    magnitude: number;
    category: string;
  }[];
}

export interface ChrysalisModel {
  implementedUpgrades: {
    id: string;
    title: string;
    description: string;
    timestamp: string;
    impact: string;
  }[];
  experiments: {
    id: string;
    title: string;
    targetWeakness: string;
    type: string;
    status: 'proposed' | 'running' | 'passed' | 'failed' | 'shadowing' | 'canary' | 'approved' | 'rolled-back';
    impact: string;
    privacyScore: number;
    safetyScore: number;
  }[];
  weaknessLedger: {
    id: string;
    title: string;
    domain: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    recurrence: number;
    visibilityRisk: number;
    proposedAction: string;
  }[];
  modelComparisons: {
    id: string;
    architectures: {
      name: string;
      performance: string;
      pros: string[];
      cons: string[];
      privacyImpact: number;
      elegance: number;
      isSelected: boolean;
    }[];
  }[];
}

export interface InferredTrait {
  id: string;
  traitName: string;
  currentValue: any;
  confidenceScore: number; // 0-1
  evidenceCount: number;
  lastUpdated: string;
  sourceSignals: string[]; // Signal IDs
  decayRules: {
    rate: number;
    lastDecay: string;
  };
  reversibilityTag: 'highly-reversible' | 'sticky' | 'durable';
  volatility: number; // 0-1
}

export interface BehavioralStatistics {
  featureUsageFrequency: Record<string, number>;
  workflowCompletionRate: number; // 0-1
  taskFollowThroughRate: number; // 0-1
  planningDepthPreference: number; // 0-1
  revisionTolerance: number; // 0-1
  suggestionAcceptanceRate: number; // 0-1
  initiativeAcceptanceRate: number; // 0-1
  reflectionEngagementRate: number; // 0-1
}

export interface AdaptiveDecisionLog {
  id: string;
  timestamp: string;
  whatChanged: string;
  whyItChanged: string;
  evidenceBasis: string[]; // Trait IDs or Signal IDs
  confidenceThresholdMet: 'observation' | 'soft' | 'structured' | 'identity';
  userValidation: 'pending' | 'validated' | 'rejected';
  rollbackAvailability: boolean;
}

export interface AdaptiveEvolutionLogEntry {
  id: string;
  timestamp: string;
  layer: 'user-model' | 'memory' | 'reasoning' | 'composition' | 'retrieval' | 'mode-routing' | 'workflow' | 'ui-interaction' | 'self-audit' | 'longitudinal' | 'output-quality' | 'identity-core';
  trigger: 'direct-positive' | 'direct-negative' | 'indirect-positive' | 'indirect-negative' | 'acceptance' | 'quality-failure' | 'self-audit';
  observation: string;
  adaptation: string;
  confidence: 'tentative' | 'emerging' | 'confirmed';
  status: 'proposed' | 'implemented' | 'rejected' | 'reverted';
  is_user_verified?: boolean;
}

export interface IdentityAnchor {
  id: string;
  name: string;
  description: string;
  confidenceScore: number; // High threshold
  establishedAt: string;
  lastReinforced: string;
  relatedTraits: string[];
}

export interface ResonanceModel {
  writingStructure: {
    sentenceLength: 'concise' | 'balanced' | 'expansive';
    paragraphDensity: 'sparse' | 'standard' | 'dense';
    vocabularyRange: number; // 0-1
    rhythm: string;
    directness: number; // 0-1
    formality: number; // 0-1
    punctuationHabits: string[];
  };
  reasoningArchitecture: {
    progression: 'linear' | 'systemic' | 'recursive';
    entryPoint: 'conclusion-first' | 'framework-first' | 'narrative-first';
    primaryDriver: 'intuitive' | 'analytical' | 'analogical' | 'first-principles';
    density: 'concise' | 'layered' | 'exhaustive';
    methodology: 'contrast-driven' | 'assertion-driven' | 'dialectical';
    framing: 'emotionally-framed' | 'logic-framed' | 'values-framed';
    intent: 'exploratory' | 'decisive' | 'didactic';
    epistemicStance: 'skeptical' | 'empirical' | 'rational' | 'pragmatic';
    temporalFocus: 'precedent-based' | 'immediate' | 'future-potential';
    abstractionLevel: number; // 0-1 (Concrete to Abstract)
  };
  emotionalExpression: {
    restraint: number; // 0-1
    warmth: number; // 0-1
    intensity: number; // 0-1
    skepticism: number; // 0-1
    assertiveness: number; // 0-1
    reflection: number; // 0-1
  };
  decisionExpression: {
    judgmentStyle: string;
    convictionLevel: number; // 0-1
    riskTolerance: number; // 0-1
    tradeoffAwareness: number; // 0-1
  };
  confidence: number; // 0-1
  lastUpdated: string;
  sampleCount: number;
}

export type ResonanceMode = 'writing-match' | 'reasoning-match' | 'identity-aligned' | 'refined-self';

export interface ResonanceState {
  model: ResonanceModel;
  activeMode: ResonanceMode;
  isLearning: boolean;
  history: {
    id: string;
    input: string;
    output: string;
    mode: ResonanceMode;
    confidence: number;
    timestamp: string;
  }[];
  
  // Significance-based Resonance (Core System Pillar)
  profiles: ResonanceProfile[];
  observations: ResonanceObservation[];
  threads: ResonanceThread[];
  graph: ResonanceGraph;
  adjustmentLog: ResonanceAdjustmentLog[];
  adaptiveProfile: AdaptiveResponseProfile;
}

export interface AdaptiveEvolutionModel {
  explicitSettings: {
    preferredCommunicationDensity: 'distilled' | 'layered' | 'recursive';
    preferredTone: string;
    planningStyle: string;
    structureTolerance: number;
    visualDensityTolerance: number;
    reminderStyle: string;
    interfaceEmphasis: string[];
    preferredLevelOfInitiative: number;
    preferredExplanationDepth: number;
    hardConstraints: string[];
    privacyPermissions: Record<string, boolean>;
  };
  inferredTraits: InferredTrait[];
  behavioralStatistics: BehavioralStatistics;
  decisionsLog: AdaptiveDecisionLog[];
  identityAnchors: IdentityAnchor[];
  evolutionLog: AdaptiveEvolutionLogEntry[];
  
  // Calibration Engines
  workflowCalibration: {
    preferredStructure: 'checklists' | 'phases' | 'boards' | 'timelines' | 'freeform';
    needsAccountability: boolean;
    abandonmentThreshold: number;
  };
  proactiveAssistance: {
    mode: 'passive' | 'responsive' | 'assistive' | 'anticipatory' | 'directive';
    interventionThreshold: number;
  };
  communicationCalibration: {
    verbosity: number;
    precision: number;
    warmth: number;
    authorityLevel: number;
    abstractionLevel: number;
    pacing: number;
    challengeIntensity: number;
    emotionalDirectness: number;
  };
}

export interface AppState {
  activeChamberState?: {
    query: string;
    immediateSend: boolean;
    thinkingState?: 'WEIGHING CONTRADICTIONS' | 'RETRIEVING';
    forcedQuery?: string;
    focusState?: string;
  };
  activeMode: 
    | 'atlas' 
    | 'arena' 
    | 'forge' 
    | 'mirror' 
    | 'mirrorforge'
    | 'signals' 
    | 'people' 
    | 'systems' 
    | 'reality-engine'
    | 'vault' 
    | 'threads' 
    | 'chambers' 
    | 'lineage' 
    | 'topology' 
    | 'salon'
    | 'discussion'
    | 'signature'
    | 'decisions'
    | 'scenarios'
    | 'doctrine'
    | 'red-team'
    | 'pulse'
    | 'council'
    | 'mastery'
    | 'continuity'
    | 'canon'
    | 'relationships'
    | 'privacy-center'
    | 'roadmap'
    | 'onboarding'
    | 'evolution-layer'
    | 'explainability'
    | 'chrysalis'
    | 'directive-center'
    | 'mind-cartography'
    | 'today-in-atlas'
    | 'humanization-controls'
    | 'crucible'
    | 'journal'
    | 'constitution'
    | 'life-domains'
    | 'operating-manual'
    | 'essential-mode'
    | 'forge-artifact'
    | 'second-sun'
    | 'reality-ledger'
    | 'memory-vault'
    | 'drift-center'
    | 'final-filter'
    | 'deep-work'
    | 'leviathan'
    | 'creator-console'
    | 'gap-ledger'
    | 'audit-logs'
    | 'change-control'
    | 'capabilities'
    | 'resonance'
    | 'auth'
    | 'core-systems'
    | 'strategic-modeling'
    | 'sovereign-atrium'
    | 'trajectory-observatory'
    | 'friction-cartography'
    | 'threshold-forge';
  absoluteSignalMode: boolean;
  isSearchOpen: boolean;
  selectedEntityId: string | null;
  userModel: UserThoughtModel;
  uiConfig: UIConfiguration;
  sessionIntent: 'think' | 'decide' | 'study' | 'write' | 'reflect' | 'map' | 'prepare' | 'recover' | null;
  recentQuestions: UserQuestion[];
  searchHistory: { query: string; timestamp: string }[];
  mindHistory: MindSnapshot[];
  globalIntelligence: GlobalIntelligence;
  salons: SalonThread[];
  decisions: Decision[];
  scenarios: Scenario[];
  journal: JournalEntry[];
  pulse: {
    lastUpdate: string;
    items: PulseItem[];
  };
  council: CouncilLens[];
  lifePatterns: LifePattern[];
  relationships: RelationshipDepth[];
  canon: {
    items: CanonItem[];
  };
  directives: Directive[];
  activePosture: AdaptivePosture;
  isCrisisMode: boolean;
  consent: ConsentState;
  
  // Advanced Pillars
  constitution: PersonalConstitution;
  restraintEngine: AdaptiveRestraintEngine;
  calibrationHarness: CalibrationHarness;
  stateOfMind: StateOfMindLayer;
  cognitiveLoad: CognitiveLoadGeometry;
  lifeDomains: LifeDomain[];
  reconstruction: ReconstructionEngine;
  vault: VaultMode;
  expertLayer: CuratedExpertLayer;
  buildWithAtlas: BuildWithAtlas;
  operatingManual: PersonalOperatingManual;
  essentialMode: OnlyWhatIsEssential;
  mirrorforge: MirrorforgeModel;
  realityEngine: RealityEngineModel;
  truthLedger: TruthLedger;
  evolutionTimeline: EvolutionTimeline;
  memoryArchitecture: MemoryArchitecture;
  driftDetection: DriftDetection;
  chrysalis: ChrysalisModel;
  temporalIntelligence: TemporalIntelligence;
  antiBloatGovernor: AntiBloatGovernor;
  adaptiveEvolution: AdaptiveEvolutionModel;

  // Bug Hunter & Stress Validation
  bugHunter: BugHunterState;

  // Resonance Subsystem
  resonance: ResonanceState;

  // Auth & Governance
  currentUser?: UserProfile;
  isAuthReady: boolean;
  is3FAPending?: boolean;
  emergencyStatus?: EmergencyContainment;
  isSettingsOpen?: boolean;
  creatorConsoleState?: {
    activeTab:
      | 'overview'
      | 'ai-governance'
      | 'ai_governance'
      | 'gaps'
      | 'changes'
      | 'audit'
      | 'emergency'
      | 'bug_hunter';
    initialCommand?: string;
  };
}

export type BugSeverity = 'critical' | 'high' | 'medium' | 'low' | 'dormant-risk';
export type BugStatus = 'discovered' | 'confirmed' | 'under-review' | 'fixed' | 'retest-required' | 'recurring' | 'closed';
export type BugCategory = 'layout' | 'logic' | 'usability' | 'performance' | 'security' | 'privacy' | 'visual' | 'interaction' | 'state' | 'regression' | 'navigation';

export interface BugEntry {
  id: string;
  name: string;
  category: BugCategory;
  severity: BugSeverity;
  status: BugStatus;
  reproducibility: string;
  affectedSurface: string;
  likelyCause: string;
  visualImpact: string;
  functionalImpact: string;
  regressionRisk: boolean;
  recommendedFix: string;
  timestamp: string;
  lastTested?: string;
  notes?: string[];
}

export interface BugHunterState {
  isActive: boolean;
  /** When true, the diagnostics drawer is open (sovereign_creator shell). */
  isPanelOpen: boolean;
  ledger: BugEntry[];
  currentPersona: string | null;
  lastScanTimestamp: string | null;
  activeStressTests: string[];
}
