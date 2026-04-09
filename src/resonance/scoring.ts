import { 
  ResonanceProfile, 
  ResonanceObservation, 
  ResonanceConfidence, 
  ResonanceTier 
} from "./types";

/**
 * Computes a multi-dimensional resonance profile from an observation.
 * This function is responsible for the "Score" phase of the Resonance Engine.
 */
export function computeResonanceProfile(
  observation: ResonanceObservation,
  existingProfile?: ResonanceProfile
): ResonanceProfile {
  const now = new Date().toISOString();
  
  // Initialize profile if it doesn't exist
  const profile: ResonanceProfile = existingProfile || {
    profileId: `prof-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    subjectType: 'theme', // Default to theme
    subjectId: observation.inferredTheme,
    emotionalIntensity: 0,
    identityRelevance: 0,
    goalRelevance: 0,
    recurrenceStrength: 0,
    narrativeCentrality: 0,
    decisionImpact: 0,
    tensionWeight: 0,
    relationalWeight: 0,
    aestheticWeight: 0,
    longevityPotential: 0,
    fragilityIndex: 0,
    transformationalPotential: 0,
    confidence: ResonanceConfidence.INFERRED,
    privacySensitivity: 0,
    lastUpdatedAt: now
  };

  // Update dimensions based on extracted signals
  observation.extractedSignals.forEach(signal => {
    const value = parseFloat(signal.value) || 0.5; // Default to 0.5 if not a number
    
    switch (signal.type.toUpperCase()) {
      case 'EMOTIONAL INTENSITY':
        profile.emotionalIntensity = updateDimension(profile.emotionalIntensity, value);
        break;
      case 'IDENTITY RELEVANCE':
        profile.identityRelevance = updateDimension(profile.identityRelevance, value);
        break;
      case 'GOAL RELEVANCE':
        profile.goalRelevance = updateDimension(profile.goalRelevance, value);
        break;
      case 'NARRATIVE CENTRALITY':
        profile.narrativeCentrality = updateDimension(profile.narrativeCentrality, value);
        break;
      case 'DECISION IMPACT':
        profile.decisionImpact = updateDimension(profile.decisionImpact, value);
        break;
      case 'TENSION / CONFLICT WEIGHT':
        profile.tensionWeight = updateDimension(profile.tensionWeight, value);
        break;
      case 'RELATIONAL WEIGHT':
        profile.relationalWeight = updateDimension(profile.relationalWeight, value);
        break;
      case 'AESTHETIC / SYMBOLIC WEIGHT':
        profile.aestheticWeight = updateDimension(profile.aestheticWeight, value);
        break;
      case 'FRAGILITY / SENSITIVITY':
        profile.fragilityIndex = updateDimension(profile.fragilityIndex, value);
        break;
      case 'TRANSFORMATIONAL POTENTIAL':
        profile.transformationalPotential = updateDimension(profile.transformationalPotential, value);
        break;
    }
  });

  // Update recurrence and longevity
  profile.recurrenceStrength = Math.min(1, profile.recurrenceStrength + 0.1);
  profile.longevityPotential = (profile.identityRelevance + profile.goalRelevance + profile.recurrenceStrength) / 3;
  
  // Update confidence based on observation confidence
  profile.confidence = observation.confidence;
  profile.lastUpdatedAt = now;

  return profile;
}

/**
 * Helper to update a dimension value with a new observation.
 * Uses a simple moving average or a weighted update.
 */
function updateDimension(current: number, observed: number): number {
  // If it's the first observation (current is 0), just take the observed value
  if (current === 0) return observed;
  
  // Otherwise, use a weighted average (e.g., 70% current, 30% new)
  // This allows for gradual shifts while maintaining some stability.
  const weight = 0.3;
  return (current * (1 - weight)) + (observed * weight);
}

/**
 * Determines the resonance tier for a profile.
 */
export function determineResonanceTier(profile: ResonanceProfile): ResonanceTier {
  const totalScore = (
    profile.emotionalIntensity + 
    profile.identityRelevance + 
    profile.goalRelevance + 
    profile.recurrenceStrength + 
    profile.narrativeCentrality
  ) / 5;

  if (profile.fragilityIndex > 0.8) return ResonanceTier.SACRED;
  if (profile.identityRelevance > 0.8 || totalScore > 0.8) return ResonanceTier.CORE;
  if (profile.recurrenceStrength > 0.6 || totalScore > 0.6) return ResonanceTier.ESTABLISHED;
  if (profile.recurrenceStrength > 0.3 || totalScore > 0.3) return ResonanceTier.EMERGING;
  
  return ResonanceTier.FLEETING;
}
