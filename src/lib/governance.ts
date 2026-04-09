import { AppState, RestraintDecision, MemoryProvenance, MemoryType } from '../types';

/**
 * Adaptive Restraint Engine
 * Determines when Atlas should exercise restraint based on user state and constitutional laws.
 */
export function evaluateRestraint(state: AppState, action: string): RestraintDecision {
  const { stateOfMind, constitution } = state;
  
  // Example logic: Restrain flattery if user is in 'reflective' mode
  if (stateOfMind.currentMode === 'reflective' && action.includes('praise')) {
    return {
      action,
      isRestrained: true,
      reasoning: 'User is in a reflective state; flattery may interfere with objective self-assessment.',
      principleApplied: 'Challenge over Flattery'
    };
  }

  // Restrain novelty if user is 'overloaded'
  if (stateOfMind.currentMode === 'overloaded' && action.includes('new-feature')) {
    return {
      action,
      isRestrained: true,
      reasoning: 'User is experiencing high cognitive load; introducing new features would be counter-productive.',
      principleApplied: 'Stability over Novelty'
    };
  }

  return {
    action,
    isRestrained: false,
    reasoning: 'Action is aligned with current state and constitutional order.',
    principleApplied: 'Truth over Comfort'
  };
}

/**
 * Memory Provenance and Decay System
 * Manages memory lifecycle based on reliability, recency, and type.
 */
export function processMemory(memory: MemoryProvenance): MemoryProvenance {
  const now = new Date();
  const lastUpdated = new Date(memory.recency);
  const ageInDays = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
  
  // Apply decay based on type
  let newReliability = memory.reliability;
  if (memory.type === 'seasonal') {
    newReliability -= ageInDays * 0.05 * memory.decayRate;
  } else if (memory.type === 'inferred') {
    newReliability -= ageInDays * 0.02 * memory.decayRate;
  }

  return {
    ...memory,
    reliability: Math.max(0, newReliability),
    isArchived: newReliability < 0.2
  };
}

/**
 * Anti-Bloat Governor
 * Evaluates feature impact on user power vs. complexity.
 */
export function evaluateFeature(state: AppState, feature: string) {
  // This would be called during feature development or activation
  // For now, it returns a mock decision
  return {
    feature,
    impactOnClarity: 0.8,
    impactOnLeverage: 0.9,
    dignityPreserved: true,
    decision: 'keep'
  };
}
