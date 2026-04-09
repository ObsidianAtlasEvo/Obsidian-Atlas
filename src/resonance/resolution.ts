import { 
  AdaptiveResponseProfile, 
  EffectiveResponseProfile,
  ResonanceDomain,
  ResponseDepth,
  StructureStyle,
  ResponsePosture
} from "./types";
import { clamp, lerp, weightedAverage } from "../utils/mathUtils";

// Constants for resolution parameters
const RESOLUTION_DEFAULTS = {
  minPrecisionFloor: 0.9,
  minCompletenessFloor: 0.6,
  maxBloatTolerance: 0.4,
  defaultDirectness: 0.8,
  defaultDensity: 0.5,
};

const DOMAIN_SENSITIVITY = {
  [ResonanceDomain.TECHNICAL]: { depthBoost: 0.2, precisionBoost: 0.3, densityBoost: 0.1 },
  [ResonanceDomain.STRATEGIC]: { depthBoost: 0.3, contextBoost: 0.4, nuanceBoost: 0.2 },
  [ResonanceDomain.WRITING]: { styleBoost: 0.5, nuanceBoost: 0.3 },
  [ResonanceDomain.IMPLEMENTATION]: { specificityBoost: 0.5, precisionBoost: 0.2 },
  [ResonanceDomain.GENERAL]: { depthBoost: 0, precisionBoost: 0, densityBoost: 0 },
};

/**
 * The ResolutionEngine is responsible for taking the user's adaptive profile
 * and runtime context to produce a final, effective response posture.
 */
export class ResolutionEngine {
  /**
   * Resolves the final response posture for a given query and context.
   */
  public static resolve(
    profile: AdaptiveResponseProfile,
    domain: ResonanceDomain,
    queryComplexity: number = 0.5,
    explicitPreferences?: Partial<EffectiveResponseProfile>
  ): EffectiveResponseProfile {
    // 1. Initialize with baseline defaults
    const effective: EffectiveResponseProfile = this.getBaselineDefaults(profile);

    // 2. Apply Domain-Specific Overrides (if any exist in the profile)
    this.applyDomainAdaptations(effective, profile, domain);

    // 3. Apply Inferred Preferences (Weighted by Confidence and Personalization Strength)
    this.applyInferredTraits(effective, profile, domain);

    // 4. Apply Context-Sensitive Adjustments (Query Complexity, etc.)
    this.applyContextAdjustments(effective, queryComplexity);

    // 5. Apply Explicit Preferences (Highest Precedence)
    if (explicitPreferences) {
      Object.assign(effective, explicitPreferences);
    }

    // 6. Enforce Quality Guardrails
    this.enforceGuardrails(effective, queryComplexity);

    return effective;
  }

  private static getBaselineDefaults(profile: AdaptiveResponseProfile): EffectiveResponseProfile {
    return {
      depth: ResponseDepth.EXPANDED,
      density: RESOLUTION_DEFAULTS.defaultDensity,
      breadth: 0.5,
      style: StructureStyle.LAYERED,
      directness: RESOLUTION_DEFAULTS.defaultDirectness,
      contextInclusion: 0.5,
      precision: RESOLUTION_DEFAULTS.minPrecisionFloor,
      expansionThreshold: 0.5,
      conciseness: 0.7,
      examples: true,
      breakdowns: true,
      implementationDepth: 0.5,
      personalizationConfidence: profile.calibration.personalizationStrength,
      profileMaturity: profile.calibration.profileMaturityLevel,
      isEarlyStageBoostActive: profile.calibration.earlyStageBoostActive,
    };
  }

  private static readonly TRAIT_MAP: Record<keyof ResponsePosture, keyof EffectiveResponseProfile> = {
    responseDepth: 'depth',
    responseDensity: 'density',
    explanationBreadth: 'breadth',
    structureStyle: 'style',
    directnessLevel: 'directness',
    contextInclusionLevel: 'contextInclusion',
    precisionBias: 'precision',
    expansionThreshold: 'expansionThreshold',
    concisenessDiscipline: 'conciseness',
    useOfExamples: 'examples',
    useOfBreakdowns: 'breakdowns',
    implementationSpecificity: 'implementationDepth',
  };

  private static applyDomainAdaptations(
    effective: EffectiveResponseProfile,
    profile: AdaptiveResponseProfile,
    domain: ResonanceDomain
  ): void {
    const adaptation = profile.domainAdaptations[domain];
    if (adaptation) {
      // Apply domain-specific overrides
      for (const [postureKey, effectiveKey] of Object.entries(this.TRAIT_MAP)) {
        const val = (adaptation as any)[postureKey];
        if (val !== undefined) {
          (effective as any)[effectiveKey] = val;
        }
      }
    }
  }

  private static applyInferredTraits(
    effective: EffectiveResponseProfile,
    profile: AdaptiveResponseProfile,
    domain: ResonanceDomain
  ): void {
    const strength = profile.calibration.personalizationStrength;
    const adaptation = profile.domainAdaptations[domain];

    // Helper to apply trait
    const applyTrait = (trait: keyof ResponsePosture, effectiveKey: keyof EffectiveResponseProfile, setter: (val: any) => void) => {
      const pref = profile.inferredPreferences[trait];
      if (pref && pref.confidence > 0.3) {
        // Domain override has highest precedence for inferred traits
        const val = (adaptation && (adaptation as any)[trait] !== undefined) ? (adaptation as any)[trait] : pref.value;
        
        if (typeof val === 'number') {
          const currentVal = effective[effectiveKey];
          if (typeof currentVal === 'number') {
            setter(lerp(currentVal, val, strength * pref.confidence));
          } else {
            setter(val);
          }
        } else {
          setter(val);
        }
      }
    };

    for (const [postureKey, effectiveKey] of Object.entries(this.TRAIT_MAP)) {
      applyTrait(postureKey as keyof ResponsePosture, effectiveKey as keyof EffectiveResponseProfile, (v) => (effective as any)[effectiveKey] = v);
    }
  }

  /**
   * Applies adjustments based on query complexity.
   */
  private static applyContextAdjustments(
    effective: EffectiveResponseProfile,
    complexity: number
  ): void {
    // High complexity queries should push for more depth and precision
    if (complexity > 0.7) {
      if (effective.depth === ResponseDepth.CONCISE) effective.depth = ResponseDepth.STANDARD;
      effective.precision = clamp(effective.precision + 0.1, 0, 1);
      effective.contextInclusion = clamp(effective.contextInclusion + 0.2, 0, 1);
    }

    // Low complexity queries can be more direct
    if (complexity < 0.3) {
      effective.directness = clamp(effective.directness + 0.2, 0, 1);
    }
  }

  /**
   * Enforces quality floors and safety guardrails.
   */
  private static enforceGuardrails(effective: EffectiveResponseProfile, complexity: number): void {
    // Precision Floor
    effective.precision = Math.max(effective.precision, RESOLUTION_DEFAULTS.minPrecisionFloor);

    // Anti-Bloat Floor
    // Note: antiBloatDiscipline was removed from EffectiveResponseProfile, 
    // but we can use conciseness as a proxy or add it back if needed.
    effective.conciseness = Math.max(effective.conciseness, 0.6);
  }
}
