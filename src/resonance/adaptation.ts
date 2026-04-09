import { 
  AdaptiveResponseProfile, 
  InteractionSignal, 
  EffectiveResponseProfile,
  ResonanceDomain
} from "./types";
import { InferenceEngine } from "./inference";
import { ResolutionEngine } from "./resolution";

/**
 * Adaptation Engine.
 * Orchestrates behavioral inference and response resolution.
 */
export class AdaptationEngine {
  /**
   * Processes an interaction signal to update the user's adaptive profile.
   */
  static processSignal(
    profile: AdaptiveResponseProfile,
    signal: InteractionSignal
  ): AdaptiveResponseProfile {
    return InferenceEngine.processSignal(signal, profile);
  }

  /**
   * Resolves the final response posture for a given query and profile.
   */
  static resolveResponsePosture(
    profile: AdaptiveResponseProfile,
    query: string,
    context?: {
      domain?: ResonanceDomain;
      complexity?: number;
      urgency?: number;
    }
  ): EffectiveResponseProfile {
    const domain = context?.domain || ResonanceDomain.GENERAL;
    const complexity = context?.complexity || 0.5;
    
    return ResolutionEngine.resolve(profile, domain, complexity);
  }
}
