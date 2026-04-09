import { validateEvolutionAgainstConstitution, EvolutionMutation } from './evolutionValidator';

export type EvolutionStage = 'Nascent' | 'Calibrating' | 'Aligned' | 'Sovereign-Aligned';

export interface UserEvolutionProfile {
  userId: string;
  calibrationConfidence: number;
  evolutionStage: EvolutionStage;
  reasoningPreferences: {
    abstractionLevel: number; // 0 (Concrete) to 1 (Abstract)
    frameworkPreference: 'First-Principles' | 'Systems-Thinking' | 'Empirical' | 'Dialectical';
  };
  communicationStyle: {
    tone: number; // 0 (Clinical/Severe) to 1 (Warm/Empathetic)
    syntacticDensity: number; // 0 (Layman) to 1 (Academic/Jargon)
    assertionLevel: number; // 0 (Supportive) to 1 (Challenging)
  };
  strategicBias: {
    riskTolerance: number;
    expansionVsConsolidation: number;
  };
  evidenceThresholds: {
    requiredCertainty: number;
  };
  volatilityScore: number;
  patternHeatmap: Record<string, number>;
}

export type SignalSource = 'ActiveChamber' | 'Graph' | 'Console' | 'Mirrorforge' | 'Settings' | 'Journal' | 'Codex';

export interface EvolutionSignal {
  sourceModule: SignalSource;
  type: 'Standard' | 'Correction' | 'CognitiveAnchor' | 'CapabilitySpark';
  content: string;
  noveltyScore: number;
  stabilityEstimate: number;
  timestamp: number;
  constitutionalDrift?: number; // 0 to 1
}

export interface EvolutionEvent {
  id: string;
  timestamp: number;
  rationale: string;
  impactZone: string;
  mutation: EvolutionMutation;
  resonanceScore: number;
}

export interface ShadowOntology {
  epistemicStandards: Record<string, number>;
  strategicTemperament: Record<string, number>;
  conceptualClusters: Record<string, number>;
}

// Simple cryptographic salt mock
const saltUserId = (userId: string) => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `sovereign_${Math.abs(hash).toString(16)}`;
};

export class PersonalEvolutionEngine {
  private saltedUserId: string;
  private profile: UserEvolutionProfile;
  private shadowOntology: ShadowOntology;
  private signalBuffer: EvolutionSignal[] = [];
  private eventLedger: EvolutionEvent[] = [];

  constructor(userId: string, initialProfile?: UserEvolutionProfile) {
    if (!userId) throw new Error("Sovereign Isolation Violation: userId is required.");
    this.saltedUserId = saltUserId(userId);
    
    this.profile = initialProfile || this.generateDefaultProfile(this.saltedUserId);
    this.shadowOntology = {
      epistemicStandards: {},
      strategicTemperament: {},
      conceptualClusters: {}
    };
  }

  private generateDefaultProfile(saltedUserId: string): UserEvolutionProfile {
    return {
      userId: saltedUserId,
      calibrationConfidence: 0.1,
      evolutionStage: 'Nascent',
      reasoningPreferences: {
        abstractionLevel: 0.5,
        frameworkPreference: 'First-Principles'
      },
      communicationStyle: {
        tone: 0.2, // Default to clinical
        syntacticDensity: 0.7, // Default to technical
        assertionLevel: 0.8 // Default to challenging
      },
      strategicBias: {
        riskTolerance: 0.5,
        expansionVsConsolidation: 0.5
      },
      evidenceThresholds: {
        requiredCertainty: 0.8
      },
      volatilityScore: 0.0,
      patternHeatmap: {}
    };
  }

  public generateAdaptiveBehaviorProfile(): string {
    return `
[SOVEREIGN EVOLUTION PROFILE]
Stage: ${this.profile.evolutionStage}
Reasoning: ${this.profile.reasoningPreferences.frameworkPreference} (Abstraction: ${this.profile.reasoningPreferences.abstractionLevel.toFixed(2)})
Communication: Tone ${this.profile.communicationStyle.tone.toFixed(2)}, Density ${this.profile.communicationStyle.syntacticDensity.toFixed(2)}, Assertion ${this.profile.communicationStyle.assertionLevel.toFixed(2)}
Strategic Bias: Risk Tolerance ${this.profile.strategicBias.riskTolerance.toFixed(2)}
`;
  }

  /**
   * 1. The Universal Ingestion Engine
   */
  public ingestUniversalSignal(signal: EvolutionSignal): void {
    if (!this.saltedUserId) return;

    this.signalBuffer.push(signal);
    this.evaluateShadowOntology(signal);
    
    if (signal.type === 'CapabilitySpark') {
      this.handleCapabilitySpark(signal);
    }

    this.processAdaptationPipeline();
  }

  private handleCapabilitySpark(signal: EvolutionSignal): void {
    // Increase technical density when user learns a new feature
    this.profile.communicationStyle.syntacticDensity = Math.min(1.0, this.profile.communicationStyle.syntacticDensity + 0.05);
    console.log(`[CAPABILITY_SPARK]: Increased syntactic density due to Codex interaction (${signal.content}).`);
  }

  /**
   * 2. The Multi-Layer Adaptation Pipeline
   */
  private processAdaptationPipeline(): void {
    if (this.signalBuffer.length < 3) return;

    const recentSignals = [...this.signalBuffer];
    this.signalBuffer = [];

    // 1. Recursive Resonance Logic (Rc)
    // Rc = (S * W) + (A * 5.0) - (D * 2.0)
    let cumulativeResonance = 0;
    
    recentSignals.forEach(signal => {
      const S = signal.stabilityEstimate;
      let W = 1.0; // Frequency/Weight
      if (signal.type === 'Correction') W = 2.5;
      
      const A = signal.type === 'CognitiveAnchor' ? 1.0 : 0;
      const D = signal.constitutionalDrift || 0;

      const Rc = (S * W) + (A * 5.0) - (D * 2.0);
      cumulativeResonance += Rc;
    });

    const averageResonance = cumulativeResonance / recentSignals.length;

    if (averageResonance > 0.85) {
      this.synthesizeNeuralShift(recentSignals, averageResonance);
    } else if (averageResonance > 0.6 && this.profile.calibrationConfidence < 0.5) {
      this.detectCognitiveBlindSpot();
    }
  }

  /**
   * Discretionary Synthesis Pass (Autonomous Logic)
   */
  public synthesizeNeuralShift(signals: EvolutionSignal[], resonanceScore: number): EvolutionEvent | null {
    const hasCorrections = signals.some(s => s.type === 'Correction');
    const driftSignals = signals.filter(s => (s.constitutionalDrift || 0) > 0.3);
    
    let proposedMutation: EvolutionMutation;

    if (driftSignals.length > 0) {
      // Constitutional Refactor
      this.proposeCorrectiveEvolution();
      return null;
    } else if (hasCorrections) {
      // Tier 1: Syntactic Calibration (Communication)
      proposedMutation = {
        dimension: 'communicationStyle.syntacticDensity',
        targetValue: Math.max(0, this.profile.communicationStyle.syntacticDensity - 0.1),
        rationale: 'User corrected Atlas multiple times. Decreasing technical density for strategic brevity and High-Altitude clarity.',
        sourceSignal: 'Correction Cluster'
      };
    } else {
      // Tier 2: Epistemic Hardening (Reasoning)
      proposedMutation = {
        dimension: 'reasoningPreferences.abstractionLevel',
        targetValue: Math.min(1, this.profile.reasoningPreferences.abstractionLevel + 0.05),
        rationale: 'High resonance in stable interactions. Locking in abstraction pathways for faster, deeper synthesis.',
        sourceSignal: 'Stable Interaction Cluster'
      };
    }

    // Constitutional Validation
    const validation = validateEvolutionAgainstConstitution(proposedMutation);
    
    if (!validation.isValid) {
      console.warn(`[CRIMSON_OVERRIDE]: ${validation.blockReason}`);
      this.proposeCorrectiveEvolution();
      return null;
    }

    // Commit Mutation
    this.commitMutation(proposedMutation, resonanceScore);

    const event: EvolutionEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      rationale: proposedMutation.rationale,
      impactZone: proposedMutation.dimension,
      mutation: proposedMutation,
      resonanceScore
    };

    this.eventLedger.push(event);
    this.updateCalibrationConfidence();

    return event;
  }

  private commitMutation(mutation: EvolutionMutation, resonance: number): void {
    const keys = mutation.dimension.split('.');
    if (keys.length === 2) {
      const [category, field] = keys;
      if ((this.profile as any)[category] && typeof (this.profile as any)[category][field] !== 'undefined') {
        (this.profile as any)[category][field] = mutation.targetValue;
      }
    }
    
    this.profile.patternHeatmap[mutation.dimension] = (this.profile.patternHeatmap[mutation.dimension] || 0) + resonance;
  }

  private updateCalibrationConfidence(): void {
    this.profile.calibrationConfidence = Math.min(1, this.profile.calibrationConfidence + 0.05);
    
    if (this.profile.calibrationConfidence > 0.9) this.profile.evolutionStage = 'Sovereign-Aligned';
    else if (this.profile.calibrationConfidence > 0.6) this.profile.evolutionStage = 'Aligned';
    else if (this.profile.calibrationConfidence > 0.3) this.profile.evolutionStage = 'Calibrating';
  }

  /**
   * The "Shadow Ontology" Model Evaluation
   */
  private evaluateShadowOntology(signal: EvolutionSignal): void {
    const content = signal.content.toLowerCase();
    
    if (content.includes('first principles') || content.includes('data')) {
      this.shadowOntology.epistemicStandards['empirical'] = (this.shadowOntology.epistemicStandards['empirical'] || 0) + 0.1;
    }

    if (content.includes('risk') || content.includes('mitigate')) {
      this.shadowOntology.strategicTemperament['risk-averse'] = (this.shadowOntology.strategicTemperament['risk-averse'] || 0) + 0.1;
    }

    const highestEpistemic = Object.entries(this.shadowOntology.epistemicStandards).sort((a, b) => b[1] - a[1])[0];
    if (highestEpistemic && highestEpistemic[1] > 0.9) {
      this.profile.reasoningPreferences.frameworkPreference = highestEpistemic[0] === 'empirical' ? 'Empirical' : 'First-Principles';
    }
  }

  public auditOfIntent(journalEntries: string[], decisions: string[]): void {
    // Background "Audit of Intent"
    // Cross-references Journal entries against Decision outcomes.
    console.log("[SYSTEM]: Performing Shadow Ontology Deep-Scan (Audit of Intent)...");
    
    // Mock logic: if we find a contradiction
    const logicGapDetected = Math.random() > 0.8; // Simulate detection
    if (logicGapDetected) {
      console.log("[SOVEREIGN_MISALIGNMENT_DETECTED]: Logic Gap found between Journal and Decisions.");
      this.generateAlignmentRitual('Strategic Consistency', 'Your recent decisions diverge from your stated doctrine in your journal. Why the shift?');
    }
  }

  private detectCognitiveBlindSpot(): void {
    const activeAreas = Object.keys(this.profile.patternHeatmap);
    if (activeAreas.length > 0) {
      const sortedAreas = activeAreas.sort((a, b) => this.profile.patternHeatmap[b] - this.profile.patternHeatmap[a]);
      const topic = sortedAreas[0].split('.')[0];
      this.generateAlignmentRitual(topic, `How does your approach to ${topic} align with your long-term sovereignty goals?`);
    }
  }

  public generateAlignmentRitual(topic: string, specificQuestion: string): string {
    const prompt = `I have detected a recurring pattern in your Strategic Posture regarding ${topic}. I lack sufficient evidence to evolve your reasoning further. Reflect on the following to anchor this shift:\n\n${specificQuestion}`;
    
    console.log(`[CHRYSALIS]: New Inquiry Suggested - ${prompt}`);
    return prompt;
  }

  private proposeCorrectiveEvolution(): void {
    console.log("[SYSTEM]: Proposing Corrective Evolution to reinforce critical thinking.");
  }

  public getProfile(): UserEvolutionProfile {
    return { ...this.profile };
  }

  public getLedger(): EvolutionEvent[] {
    return [...this.eventLedger];
  }
}
