/**
 * Default state for the Atlas application.
 * All defaults are deliberate — no shallow zeros, no meaningless empty strings.
 * These represent Atlas in a clean, unformed state ready to learn its first user.
 */

import type { AppState } from '@/types';

const now = new Date().toISOString();

export const defaultAppState: Omit<AppState, 'currentUser'> = {
  activeMode: 'atlas',
  absoluteSignalMode: false,
  isSearchOpen: false,
  selectedEntityId: null,
  sessionIntent: null,
  recentQuestions: [],
  searchHistory: [],
  mindHistory: [],
  isCrisisMode: false,
  isAuthReady: false,

  // ── User Model ───────────────────────────────────────────────────────────
  userModel: {
    knowledge: [],
    learning: [],
    learningStyle: 'deliberate',
    thoughtStructure: {
      thinkingStyle: 'strategist',
      learningCadence: 'deliberate',
      strengths: [],
      intellectualAltitude: 0.7,
      ambiguityTolerance: 0.65,
      systemicCoherence: 0.7,
      synthesisVelocity: 0.6,
      preferredInstructionMode: 'first-principles',
      topology: {
        primaryStyles: ['diagnostic', 'strategic'],
        abstractionLevel: 0.7,
        compressionPreference: 'layered',
        appetiteForRigor: 0.8,
        appetiteForAmbiguity: 0.6,
        synthesisVsDecomposition: 0.55,
        theoryVsApplication: 0.5,
        structurePreference: 'structured',
        fascinationWithContradiction: 0.7,
        fascinationWithMotive: 0.8,
        fascinationWithSystems: 0.85,
        attractionToSymbolism: 0.5,
        attractionToHiddenArchitecture: 0.8,
        toleranceForUnresolvedTension: 0.65,
        preferenceForAdversarialTesting: 0.7,
        preferenceForRefinement: 0.8,
        eleganceVsUtility: 0.55,
      },
      latentPatterns: [],
    },
    doctrine: [],
    autonomousLearning: {
      active: true,
      focusAreas: [],
      alignmentWithLongArc: 0.8,
    },
    cognitiveStyle: {
      abstractionPreference: 0.7,
      structurePreference: 'structured',
      analogyPreference: 0.6,
      synthesisPreference: 0.7,
      decompositionPreference: 0.6,
      firstPrinciplesOrientation: 0.8,
      precisionPreference: 0.8,
      ambiguityTolerance: 0.65,
    },
    communication: {
      preferredTone: 'analytical',
      preferredDensity: 'layered',
      preferredFramingOrder: 'direct',
      preferredUseOfExamples: 0.5,
      directnessVsElegance: 0.7,
      strategicVsReflectiveVoice: 0.75,
    },
    aesthetic: {
      visualRefinement: 0.85,
      structuralBeauty: 0.8,
      clutterTolerance: 0.35,
      preferredMetaphors: ['cartography', 'architecture'],
      sourceTaste: ['primary-sources', 'scholarly'],
    },
    challenge: {
      appetiteForRedTeaming: 0.7,
      appetiteForNuance: 0.8,
      supportVsPressureFit: 0.5,
      unresolvedEndingTolerance: 0.65,
      challengeIntensityResponse: 0.6,
    },
    identity: {
      recurringThemes: [],
      doctrineGrowth: 0.5,
      identityLevelDomains: [],
      futureSelfContinuity: 0.7,
      longArcDevelopment: [],
    },
    cadence: {
      sessionRhythm: 'variable',
      workMode: 'deep-work',
      overloadIndicators: [],
      reflectionVsAction: 0.5,
      attentionPatterns: [],
    },
    cognition: {
      reasoningArchitecture: {
        logicVsInstinct: 0.7,
        patternRecognitionStrength: 0.8,
        personalMeaningWeight: 0.6,
        deductiveVsInductive: 0.55,
      },
      prioritizationLogic: {
        urgencyVsImportance: 0.5,
        longTermVsImmediate: 0.65,
        valuesAlignmentWeight: 0.8,
      },
      ambiguityHandling: {
        tolerance: 0.65,
        interpretationBias: 'analytical',
        resolutionSpeed: 'deliberate',
      },
      riskAndUncertainty: {
        riskAppetite: 0.6,
        uncertaintyResponse: 'analyze',
        decisionArchitectureUnderPressure: 'gather evidence, isolate the core variable, decide',
      },
      behavioralSignatures: {
        stressResponse: 'systematic retreat to first-principles frameworks',
        curiosityDrivers: [],
        confidenceMarkers: [],
        urgencyTriggers: [],
        reflectionDepth: 0.8,
      },
      learningAndBeliefRevision: {
        beliefStability: 0.7,
        integrationSpeed: 0.6,
        revisionTriggers: [],
        opennessToContradiction: 0.7,
      },
      systemicApproach: {
        conflictStrategy: 'analysis-first, engage on firm ground',
        opportunityDetection: 'pattern recognition across domains',
        peopleDynamicsHandling: 'observe then engage selectively',
        strategicPreference: 'identify leverage points, execute with precision',
      },
      predictabilityMap: {
        predictableAreas: [],
        unconventionalAreas: [],
        evolutionMarkers: [],
      },
    },
    privacy: {
      dataMinimization: {
        retentionPolicy: 'standard',
        expiryDays: 365,
      },
      memorySovereignty: {
        localOnlyDomains: [],
        encryptedTiers: [],
        revocableInferences: [],
      },
      ownershipStatus: {
        isExportable: true,
        isRedactable: true,
        isErasable: true,
      },
      exposureControl: {
        leastExposureActive: true,
        compartmentalizedDomains: [],
      },
      inferenceTransparency: {
        showProbabilisticLabels: true,
        distinguishExplicitFromInferred: true,
      },
      forgettingPower: {
        gracefulDecayActive: true,
        selectiveForgettingEnabled: true,
      },
    },
  },

  // ── UI Configuration ─────────────────────────────────────────────────────
  uiConfig: {
    homeViewEmphasis: 'chamber',
    visualDensity: 'spacious',
    structurePreference: 'axial',
    panelPriority: {},
    defaultVisualizationMode: 'standard',
    layoutAdjustments: {},
    sidebarCollapsed: false,
  },

  globalIntelligence: {
    trendingTopics: [],
    shiftingCenters: [],
  },

  // ── Content Collections ──────────────────────────────────────────────────
  salons: [],
  decisions: [],
  scenarios: [],
  journal: [],
  pulse: { lastUpdate: now, items: [] },
  council: [],
  lifePatterns: [],
  relationships: [],
  canon: { items: [] },
  directives: [],

  // ── Adaptive Posture ─────────────────────────────────────────────────────
  activePosture: {
    tone: 'analytical',
    depth: 3,
    challenge: 0.6,
    uiDensity: 'spacious',
    languageLevel: 'advanced',
    directness: 0.7,
    continuityIntensity: 0.5,
    activeDirectives: [],
  },

  // ── Advanced Pillars ─────────────────────────────────────────────────────
  constitution: {
    version: 1,
    lastUpdated: now,
    values: [],
    standards: [],
    goals: [],
    motives: [],
    tensions: [],
    reasoningStyle: {
      preference: 'first-principles',
      depthThreshold: 0.7,
      rigorLevel: 0.8,
    },
    aestheticModel: {
      vibe: 'editorial',
      tonality: 'analytical',
      colorPreference: ['obsidian', 'deep-violet', 'gold'],
    },
  },

  restraintEngine: {
    recentDecisions: [],
    restraintLevel: 0.5,
  },

  calibrationHarness: {
    lastTest: now,
    results: [],
    overallReliability: 0.8,
  },

  stateOfMind: {
    currentMode: 'exploratory',
    confidence: 0.6,
    indicators: [],
    lastUpdated: now,
  },

  cognitiveLoad: {
    computePosture: 'standard',
    uiPosture: 'focused',
    activeTier: 1,
    precomputedAssetsAvailable: [],
    latentContextLoaded: false,
  },

  lifeDomains: [],

  reconstruction: {
    lastCritiqueId: '',
    reconstructionPath: [],
  },

  vault: {
    isActive: false,
    encryptionStatus: 'inactive',
    privateMaterials: [],
  },

  expertLayer: {
    expertChambers: [],
    canonicalSources: [],
    readingLadders: [],
    frameworks: [],
  },

  buildWithAtlas: { artifacts: [] },

  operatingManual: {
    thinkingPatterns: [],
    failureModes: [],
    judgmentDistortions: [],
    clarityDrivers: [],
    standards: [],
    learningMethods: [],
    decisionRules: [],
    pressureReminders: [],
    flourishingEnvironments: [],
    blindSpots: [],
  },

  essentialMode: {
    isActive: false,
    centralTruth: '',
    decisiveVariable: '',
    strongestTension: '',
    highLeverageMove: '',
    priorityOne: '',
  },

  mirrorforge: {
    activeModes: [],
    currentRead: {
      dominantInsight: '',
      surfaceDriver: '',
      deeperDriver: '',
      hiddenTension: '',
      evidence: [],
      confidence: 0.5,
    },
    patternLedger: [],
    decisionDivergence: {
      mostLikely: { action: '', reasoning: '', risk: '', outcome: '' },
      highestOrder: { action: '', reasoning: '', risk: '', outcome: '' },
      divergenceScore: 0,
    },
  },

  realityEngine: {
    activeSystems: [],
    systemNodes: [],
    consequenceInspector: {
      immediate: [],
      secondOrder: [],
      hiddenCosts: [],
      highestLeverage: '',
      recommendation: '',
    },
    timeRipples: [],
  },

  truthLedger: {
    entries: [],
    contradictions: [],
    lastAudit: now,
  },

  evolutionTimeline: {
    milestones: [],
    identityDiffs: [],
    recurringLoops: [],
  },

  memoryArchitecture: {
    transient: [],
    working: [],
    sovereign: [],
  },

  driftDetection: {
    alerts: [],
    calibrationRituals: [],
    overallAlignment: 0.8,
  },

  chrysalis: {
    implementedUpgrades: [],
    experiments: [],
    weaknessLedger: [],
    modelComparisons: [],
  },

  temporalIntelligence: {
    urgent: [],
    loudButNotUrgent: [],
    ripening: [],
    decaying: [],
    postponed: [],
    notReady: [],
    identityLevel: [],
    temporaryFascination: [],
    matureNecessity: [],
  },

  antiBloatGovernor: {
    lastReview: now,
    decisions: [],
  },

  adaptiveEvolution: {
    explicitSettings: {
      preferredCommunicationDensity: 'layered',
      preferredTone: 'analytical',
      planningStyle: 'structured',
      structureTolerance: 0.7,
      visualDensityTolerance: 0.6,
      reminderStyle: 'contextual',
      interfaceEmphasis: [],
      preferredLevelOfInitiative: 0.6,
      preferredExplanationDepth: 0.7,
      hardConstraints: [],
      privacyPermissions: {},
    },
    inferredTraits: [],
    behavioralStatistics: {
      featureUsageFrequency: {},
      workflowCompletionRate: 0,
      taskFollowThroughRate: 0,
      planningDepthPreference: 0.5,
      revisionTolerance: 0.5,
      suggestionAcceptanceRate: 0,
      initiativeAcceptanceRate: 0,
      reflectionEngagementRate: 0,
    },
    decisionsLog: [],
    identityAnchors: [],
    evolutionLog: [],
    workflowCalibration: {
      preferredStructure: 'phases',
      needsAccountability: false,
      abandonmentThreshold: 0.3,
    },
    proactiveAssistance: {
      mode: 'responsive',
      interventionThreshold: 0.7,
    },
    communicationCalibration: {
      verbosity: 0.6,
      precision: 0.8,
      warmth: 0.4,
      authorityLevel: 0.7,
      abstractionLevel: 0.7,
      pacing: 0.5,
      challengeIntensity: 0.6,
      emotionalDirectness: 0.5,
    },
  },

  bugHunter: {
    isActive: false,
    isPanelOpen: false,
    ledger: [],
    currentPersona: null,
    lastScanTimestamp: null,
    activeStressTests: [],
  },

  resonance: {
    model: {
      writingStructure: {
        sentenceLength: 'balanced',
        paragraphDensity: 'standard',
        vocabularyRange: 0.7,
        rhythm: 'deliberate',
        directness: 0.7,
        formality: 0.7,
        punctuationHabits: [],
      },
      reasoningArchitecture: {
        progression: 'systemic',
        entryPoint: 'framework-first',
        primaryDriver: 'first-principles',
        density: 'layered',
        methodology: 'assertion-driven',
        framing: 'logic-framed',
        intent: 'decisive',
        epistemicStance: 'rational',
        temporalFocus: 'future-potential',
        abstractionLevel: 0.7,
      },
      emotionalExpression: {
        restraint: 0.7,
        warmth: 0.3,
        intensity: 0.6,
        skepticism: 0.6,
        assertiveness: 0.7,
        reflection: 0.6,
      },
      decisionExpression: {
        judgmentStyle: 'analytical',
        convictionLevel: 0.7,
        riskTolerance: 0.5,
        tradeoffAwareness: 0.8,
      },
      confidence: 0.3,
      lastUpdated: now,
      sampleCount: 0,
    },
    activeMode: 'identity-aligned',
    isLearning: true,
    history: [],
    profiles: [],
    observations: [],
    threads: [],
    graph: {
      nodes: [],
      edges: [],
      lastComputed: now,
    },
    adjustmentLog: [],
    adaptiveProfile: {
      currentPosture: {
        depth: 0.6,
        challenge: 0.6,
        precision: 0.7,
        warmth: 0.35,
        directness: 0.7,
        abstractionBias: 0.6,
      },
      lastAdaptedAt: now,
      adaptationCount: 0,
      stabilityScore: 0.3,
    },
  },

  consent: {
    acceptedTerms: false,
    informedConsent: false,
    granularConsents: {
      cognitiveSignature: false,
      questionTopology: false,
      relationshipPresence: false,
      identityArc: false,
      covenantMatching: false,
      sharedChambers: false,
      connectors: false,
      crossAccountComparison: false,
      enterpriseGovernance: false,
      modelImprovement: false,
      browserHistory: false,
    },
  },
} satisfies Omit<AppState, 'currentUser'>;
