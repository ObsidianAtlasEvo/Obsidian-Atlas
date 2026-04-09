import { 
  ResonanceObservation, 
  ResonanceConfidence, 
  ResonanceProfile 
} from "./types";

/**
 * Resonance Engine Safeguards and Guardrails.
 * This module ensures the engine remains disciplined, truth-oriented, and non-invasive.
 */

/**
 * Validates an observation against anti-overreach rules.
 * Returns a confidence-adjusted observation or a flag to discard it.
 */
export function validateObservation(
  observation: ResonanceObservation
): ResonanceObservation | null {
  // 1. Discard observations with no signals
  if (observation.extractedSignals.length === 0) return null;

  // 2. Adjust confidence if evidence is weak
  let adjustedConfidence = observation.confidence;
  
  const totalEvidenceLength = observation.extractedSignals.reduce(
    (sum, signal) => sum + signal.evidence.length, 0
  );

  // If evidence is very short (< 10 chars), downgrade confidence
  if (totalEvidenceLength < 10 && adjustedConfidence === ResonanceConfidence.STRONGLY_INFERRED) {
    adjustedConfidence = ResonanceConfidence.INFERRED;
  }

  // 3. Prevent over-personalizing neutral topics
  // If inferred theme is very generic (e.g., "weather", "time"), downgrade confidence
  const genericThemes = ["weather", "time", "general", "unknown", "none"];
  if (genericThemes.includes(observation.inferredTheme.toLowerCase())) {
    adjustedConfidence = ResonanceConfidence.WEAKLY_INFERRED;
  }

  return {
    ...observation,
    confidence: adjustedConfidence
  };
}

/**
 * Checks if a resonance profile is "stale" or requires a re-evaluation.
 */
export function checkProfileStaleness(
  profile: ResonanceProfile
): boolean {
  const lastUpdate = new Date(profile.lastUpdatedAt).getTime();
  const now = Date.now();
  const oneMonth = 1000 * 60 * 60 * 24 * 30;
  
  return (now - lastUpdate) > oneMonth;
}

/**
 * Anti-Overreach Rules for Response Generation.
 * These rules should be applied before Atlas uses resonance context in its output.
 */
export const RESONANCE_GUARDRAILS = {
  /**
   * Rule: Do not present speculative inner motives as facts.
   * Implementation: Use "It seems", "I'm picking up", "I'm noticing" for inferred resonance.
   */
  speculationGuard: (confidence: ResonanceConfidence, statement: string): string => {
    if (confidence === ResonanceConfidence.USER_CONFIRMED) return statement;
    if (confidence === ResonanceConfidence.STRONGLY_INFERRED) return `I'm noticing that ${statement}`;
    return `It seems like ${statement}`;
  },

  /**
   * Rule: Do not make the user feel surveilled.
   * Implementation: Avoid over-summarizing subtle behaviors too aggressively.
   */
  surveillanceGuard: (intensity: number): boolean => {
    // If resonance intensity is low, don't mention it explicitly
    return intensity > 0.4;
  },

  /**
   * Rule: Do not force symbolic interpretation onto ordinary statements.
   * Implementation: Only use symbolic/aesthetic weight if it's very high (> 0.7).
   */
  symbolicGuard: (weight: number): boolean => {
    return weight > 0.7;
  },

  /**
   * Rule: Do not treat sensitivity as weakness.
   * Implementation: Ensure "fragility" is handled with care, not pity.
   */
  sensitivityGuard: (fragility: number): string => {
    if (fragility > 0.8) return "high-care";
    return "standard";
  }
};

/**
 * Validates whether a resonance theme is "safe" to reflect back to the user.
 */
export function isSafeToReflect(
  profile: ResonanceProfile
): boolean {
  // Do not reflect back themes with low confidence or high privacy sensitivity
  if (profile.confidence === ResonanceConfidence.WEAKLY_INFERRED) return false;
  if (profile.privacySensitivity > 0.9) return false;
  
  // Do not reflect back "tension" themes unless they are established
  if (profile.subjectType === 'tension' && profile.recurrenceStrength < 0.5) return false;
  
  return true;
}
