import { 
  ResonanceProfile, 
  ResonanceObservation, 
  ResonanceThread, 
  ResonanceTier, 
  ResonanceConfidence 
} from "./types";
import { computeResonanceProfile, determineResonanceTier } from "./scoring";

/**
 * Resonance Memory Integration.
 * This module handles the promotion, reinforcement, and decay of resonance themes.
 */

/**
 * Promotes an observation to a resonance thread or reinforces an existing one.
 */
export function integrateObservationIntoMemory(
  observation: ResonanceObservation,
  existingThreads: ResonanceThread[]
): ResonanceThread[] {
  const now = new Date().toISOString();
  
  // 1. Check if observation matches an existing thread (semantic match or direct theme match)
  const matchingThread = existingThreads.find(thread => 
    thread.canonicalTheme.toLowerCase() === observation.inferredTheme.toLowerCase() ||
    thread.aliases.some(alias => alias.toLowerCase() === observation.inferredTheme.toLowerCase())
  );

  if (matchingThread) {
    // 2. Reinforce existing thread
    return existingThreads.map(thread => {
      if (thread.threadId === matchingThread.threadId) {
        const updatedStrength = Math.min(1, thread.strengthScore + 0.1);
        const updatedTier = determineTierFromStrength(updatedStrength, thread.tier);
        
        return {
          ...thread,
          lastSeenAt: now,
          strengthScore: updatedStrength,
          tier: updatedTier,
          confidence: observation.confidence,
          relatedMemories: [...new Set([...thread.relatedMemories, ...observation.linkedMemories])],
          relatedProjects: [...new Set([...thread.relatedProjects, ...observation.linkedProjects])],
          relatedPeople: [...new Set([...thread.relatedPeople, ...observation.linkedEntities])],
          relatedValues: [...new Set([...thread.relatedValues, ...observation.linkedValues])]
        };
      }
      return thread;
    });
  } else {
    // 3. Create new thread (Fleeting resonance)
    const newThread: ResonanceThread = {
      threadId: `thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      canonicalTheme: observation.inferredTheme,
      aliases: [],
      firstSeenAt: now,
      lastSeenAt: now,
      status: 'active',
      trendDirection: 'rising',
      strengthScore: 0.2, // Initial strength
      identityLinkStrength: 0, // Will be updated by profile
      goalLinkStrength: 0, // Will be updated by profile
      relatedPeople: observation.linkedEntities,
      relatedProjects: observation.linkedProjects,
      relatedValues: observation.linkedValues,
      relatedMemories: observation.linkedMemories,
      tier: ResonanceTier.FLEETING,
      confidence: observation.confidence
    };
    
    return [...existingThreads, newThread];
  }
}

/**
 * Applies decay to resonance threads over time.
 * Themes that haven't been seen for a long time should gradually lose strength.
 */
export function applyResonanceDecay(
  threads: ResonanceThread[]
): ResonanceThread[] {
  const now = Date.now();
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  
  return threads.map(thread => {
    const lastSeen = new Date(thread.lastSeenAt).getTime();
    const age = now - lastSeen;
    
    if (age > oneWeek) {
      // Decay strength by 5% per week of inactivity
      const weeksInactive = Math.floor(age / oneWeek);
      const decayFactor = 0.05 * weeksInactive;
      const updatedStrength = Math.max(0, thread.strengthScore - decayFactor);
      
      return {
        ...thread,
        strengthScore: updatedStrength,
        tier: determineTierFromStrength(updatedStrength, thread.tier),
        status: updatedStrength === 0 ? 'dormant' : thread.status,
        confidence: updatedStrength < 0.1 ? ResonanceConfidence.STALE : thread.confidence
      };
    }
    
    return thread;
  });
}

/**
 * Helper to determine tier based on strength score.
 * Prevents rapid demotion of CORE or SACRED themes.
 */
function determineTierFromStrength(strength: number, currentTier: ResonanceTier): ResonanceTier {
  if (currentTier === ResonanceTier.SACRED) return ResonanceTier.SACRED;
  if (currentTier === ResonanceTier.CORE && strength > 0.6) return ResonanceTier.CORE;
  
  if (strength > 0.8) return ResonanceTier.CORE;
  if (strength > 0.6) return ResonanceTier.ESTABLISHED;
  if (strength > 0.3) return ResonanceTier.EMERGING;
  
  return ResonanceTier.FLEETING;
}

/**
 * Handles partial contradictions in resonance.
 * If a new observation contradicts an existing theme, it creates a "tension" or downgrades confidence.
 */
export function handleResonanceContradiction(
  observation: ResonanceObservation,
  profile: ResonanceProfile
): ResonanceProfile {
  // Logic to detect contradiction between observation and profile
  // For now, we'll just flag it if confidence is CONTESTED
  if (observation.confidence === ResonanceConfidence.CONTESTED) {
    return {
      ...profile,
      confidence: ResonanceConfidence.CONTESTED,
      tensionWeight: Math.min(1, profile.tensionWeight + 0.2)
    };
  }
  
  return profile;
}
