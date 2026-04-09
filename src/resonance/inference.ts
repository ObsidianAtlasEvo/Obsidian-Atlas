import { 
  AdaptiveResponseProfile, 
  InteractionSignal,
  EvidenceVector,
  TraitUpdateResult,
  ResonanceDomain,
  ResponseDepth,
  StructureStyle
} from "./types";
import { clamp, lerp, weightedAverage } from "../utils/mathUtils";

// Constants for learning parameters
const SIGNAL_WEIGHTING_DEFAULTS = {
  recencyMultiplier: 1.5,
  repetitionMultiplier: 2.0,
  explicitnessMultiplier: 3.0,
  confidenceThresholdForStrongEvidence: 0.7,
  confidenceThresholdForWeakEvidence: 0.3,
  maxSignalWeight: 10.0,
  minSignalWeight: 0.1,
};

const TRAIT_UPDATE_PARAMS = {
  gradualnessFactor: 0.2, // How much a single signal can move a trait value
  confidenceGrowthRate: 0.1,
  confidenceDecayRate: 0.05,
  stabilityGainRate: 0.02,
  stabilityDecayRate: 0.01,
  driftDetectionThreshold: 0.3, // How much change triggers drift detection
  maxTraitMovementPerUpdate: 0.15, // Cap on trait value change per update
  maxConfidenceGrowthPerUpdate: 0.1,
  maxConfidenceDecayPerUpdate: 0.15,
  maxStabilityGainPerUpdate: 0.05,
  maxStabilityDecayPerUpdate: 0.05,
  maxDriftRiskPerUpdate: 0.1,
  minEvidenceForUpdate: 0.05, // Minimum evidence weight to trigger an update
};

const CALIBRATION_PARAMS = {
  maturityIncreaseRate: 0.01,
  personalizationStrengthGrowthRate: 0.005,
  adaptationMomentumDecay: 0.95,
  volatilityDecay: 0.98,
};

/**
 * The InferenceEngine is responsible for interpreting interaction signals
 * and updating the user's adaptive response profile.
 */
export class InferenceEngine {
  /**
   * Processes a new interaction signal and returns an updated profile.
   */
  public static processSignal(
    signal: InteractionSignal,
    currentProfile: AdaptiveResponseProfile
  ): AdaptiveResponseProfile {
    const evidence = this.normalizeSignals(signal);
    const updatedProfile = { ...currentProfile };

    // 1. Update Core Traits
    this.updateCoreTraits(updatedProfile, evidence);

    // 2. Update Domain-Specific Overrides if applicable
    const domain = signal.context?.domain || ResonanceDomain.GENERAL;
    this.updateDomainOverrides(updatedProfile, domain, evidence);

    // 3. Update Calibration State
    this.updateCalibrationState(updatedProfile, evidence);

    // 4. Metadata updates
    updatedProfile.metadata.updatedAt = new Date().toISOString();
    updatedProfile.metadata.interactionCount += 1;

    return updatedProfile;
  }

  /**
   * Normalizes raw signals into a structured evidence vector.
   */
  private static normalizeSignals(signal: InteractionSignal): EvidenceVector {
    const evidence: EvidenceVector = {};

    // Process Query Complexity (Baseline Signal)
    if (signal.type === 'query_complexity') {
      evidence.depth = signal.value;
    }

    // Process Layer Expansion (Interest Signal)
    if (signal.type === 'layer_expansion') {
      evidence.density = 0.2; // User wants more detail
      evidence.depth = 0.1;
    }

    // Process Source Deep Dive (High Interest Signal)
    if (signal.type === 'source_deep_dive') {
      evidence.precision = 0.3;
      evidence.implementation = 0.2;
    }

    // Process Follow-up (Engagement Signal)
    if (signal.type === 'follow_up') {
      evidence.depth = 0.1;
    }

    // Process Abandonment (Negative Signal)
    if (signal.type === 'abandonment') {
      evidence.depth = -0.2;
      evidence.density = -0.1;
    }

    // Process Explicit Preference (Strongest Signal)
    if (signal.type === 'explicit_preference') {
      // This would typically come from a settings change or direct command
      // For now, we'll just treat it as a general boost
      evidence.precision = signal.value;
    }

    return evidence;
  }

  /**
   * Updates core traits based on evidence.
   */
  private static updateCoreTraits(
    profile: AdaptiveResponseProfile,
    evidence: EvidenceVector
  ): void {
    // Length Preference (Mapping to responseDepth for now as a proxy or adding it to ResponsePosture)
    // Actually, ResponsePosture has responseDepth, responseDensity, etc.
    
    // Depth Preference
    if (evidence.depth !== undefined) {
      const current = profile.inferredPreferences.responseDepth || { value: ResponseDepth.STANDARD, confidence: 0, evidenceCount: 0, lastReinforcedAt: new Date().toISOString(), stability: 'medium', driftRisk: 'low' };
      // Note: calculateTraitUpdate works with numbers, but responseDepth is an enum.
      // We need a numeric mapping for enums if we want to use the same logic.
      // For now, let's focus on the numeric traits.
    }

    // Density Preference
    if (evidence.density !== undefined) {
      const current = profile.inferredPreferences.responseDensity || { value: 0.5, confidence: 0, evidenceCount: 0, lastReinforcedAt: new Date().toISOString(), stability: 'medium', driftRisk: 'low' };
      const result = this.calculateTraitUpdate(
        current.value,
        current.confidence,
        this.stabilityToNumeric(current.stability),
        evidence.density
      );
      profile.inferredPreferences.responseDensity = {
        value: result.newValue,
        confidence: result.newConfidence,
        evidenceCount: current.evidenceCount + 1,
        lastReinforcedAt: new Date().toISOString(),
        stability: this.numericToStability(result.newStability),
        driftRisk: result.driftRisk > 0.5 ? 'high' : 'low'
      };
    }

    // Directness Preference
    if (evidence.directness !== undefined) {
      const current = profile.inferredPreferences.directnessLevel || { value: 0.5, confidence: 0, evidenceCount: 0, lastReinforcedAt: new Date().toISOString(), stability: 'medium', driftRisk: 'low' };
      const result = this.calculateTraitUpdate(
        current.value,
        current.confidence,
        this.stabilityToNumeric(current.stability),
        evidence.directness
      );
      profile.inferredPreferences.directnessLevel = {
        value: result.newValue,
        confidence: result.newConfidence,
        evidenceCount: current.evidenceCount + 1,
        lastReinforcedAt: new Date().toISOString(),
        stability: this.numericToStability(result.newStability),
        driftRisk: result.driftRisk > 0.5 ? 'high' : 'low'
      };
    }

    // Precision Bias
    if (evidence.precision !== undefined) {
      const current = profile.inferredPreferences.precisionBias || { value: 0.5, confidence: 0, evidenceCount: 0, lastReinforcedAt: new Date().toISOString(), stability: 'medium', driftRisk: 'low' };
      const result = this.calculateTraitUpdate(
        current.value,
        current.confidence,
        this.stabilityToNumeric(current.stability),
        evidence.precision
      );
      profile.inferredPreferences.precisionBias = {
        value: result.newValue,
        confidence: result.newConfidence,
        evidenceCount: current.evidenceCount + 1,
        lastReinforcedAt: new Date().toISOString(),
        stability: this.numericToStability(result.newStability),
        driftRisk: result.driftRisk > 0.5 ? 'high' : 'low'
      };
    }
  }

  private static stabilityToNumeric(stability: 'low' | 'medium' | 'high'): number {
    if (stability === 'low') return 0.2;
    if (stability === 'medium') return 0.5;
    return 0.8;
  }

  private static numericToStability(value: number): 'low' | 'medium' | 'high' {
    if (value < 0.3) return 'low';
    if (value < 0.7) return 'medium';
    return 'high';
  }

  /**
   * Updates domain-specific overrides.
   * Evidence from technical contexts influences implementation-domain traits more strongly.
   */
  private static updateDomainOverrides(
    profile: AdaptiveResponseProfile,
    domain: ResonanceDomain,
    evidence: EvidenceVector
  ): void {
    if (!profile.domainAdaptations) profile.domainAdaptations = {};
    
    if (!profile.domainAdaptations[domain]) {
      profile.domainAdaptations[domain] = {
        domain,
        confidence: 0.1,
        evidenceCount: 0,
        lastUpdatedAt: new Date().toISOString()
      };
    }

    const override = profile.domainAdaptations[domain];
    const weight = (domain === ResonanceDomain.TECHNICAL || domain === ResonanceDomain.IMPLEMENTATION) ? 1.5 : 1.0;

    // Apply evidence to domain override
    for (const [trait, value] of Object.entries(evidence)) {
      if (trait in override) {
        const currentValue = (override as any)[trait] as number;
        if (typeof currentValue === 'number') {
          (override as any)[trait] = clamp(currentValue + (value * weight), 0, 1);
        }
      }
    }
    override.evidenceCount += 1;
    override.lastUpdatedAt = new Date().toISOString();
  }

  /**
   * Updates the calibration state of the profile.
   */
  private static updateCalibrationState(
    profile: AdaptiveResponseProfile,
    evidence: EvidenceVector
  ): void {
    const { calibration } = profile;
    
    // Increase maturity gradually
    calibration.profileMaturityLevel = clamp(
      calibration.profileMaturityLevel + CALIBRATION_PARAMS.maturityIncreaseRate,
      0, 1
    );

    // Personalization strength grows as maturity increases
    calibration.personalizationStrength = clamp(
      calibration.personalizationStrength + CALIBRATION_PARAMS.personalizationStrengthGrowthRate,
      0, 1
    );

    // Decay volatility
    calibration.preferenceVolatility = calibration.preferenceVolatility * CALIBRATION_PARAMS.volatilityDecay;
  }

  /**
   * Core logic for calculating a trait update.
   */
  private static calculateTraitUpdate(
    currentValue: number,
    currentConfidence: number,
    currentStability: number,
    evidenceValue: number
  ): TraitUpdateResult {
    // 1. Calculate movement
    // The movement is proportional to the difference between evidence and current value,
    // scaled by the gradualness factor.
    const diff = evidenceValue - currentValue;
    const movement = diff * TRAIT_UPDATE_PARAMS.gradualnessFactor;
    const cappedMovement = clamp(
      movement,
      -TRAIT_UPDATE_PARAMS.maxTraitMovementPerUpdate,
      TRAIT_UPDATE_PARAMS.maxTraitMovementPerUpdate
    );

    const newValue = clamp(currentValue + cappedMovement, -1, 1);

    // 2. Update confidence
    // Confidence grows when we receive evidence, but decays over time (handled elsewhere or implicitly here)
    const newConfidence = clamp(
      currentConfidence + TRAIT_UPDATE_PARAMS.confidenceGrowthRate,
      0, 1
    );

    // 3. Update stability
    // Stability increases if the movement was small (consistent with current value)
    const movementMagnitude = Math.abs(cappedMovement);
    const stabilityChange = movementMagnitude < 0.05 
      ? TRAIT_UPDATE_PARAMS.stabilityGainRate 
      : -TRAIT_UPDATE_PARAMS.stabilityDecayRate;
    
    const newStability = clamp(currentStability + stabilityChange, 0, 1);

    // 4. Detect drift risk
    const driftRisk = movementMagnitude > TRAIT_UPDATE_PARAMS.driftDetectionThreshold ? 0.5 : 0;

    return {
      newValue,
      newConfidence,
      newStability,
      driftRisk
    };
  }
}
