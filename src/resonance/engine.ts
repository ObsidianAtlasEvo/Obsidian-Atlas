import { 
  ResonanceObservation, 
  ResonanceProfile, 
  ResonanceThread, 
  ResonanceGraph, 
  ResonanceContextPacket,
  ResonanceConfidence,
  ResonanceTier,
  AdaptiveResponseProfile
} from "./types";
import { extractResonanceSignals } from "./signals";
import { computeResonanceProfile, determineResonanceTier } from "./scoring";
import { validateObservation, isSafeToReflect } from "./guards";
import { integrateObservationIntoMemory, applyResonanceDecay } from "./memory";
import { updateResonanceEdge } from "./graph";
import { generateResonanceContextPacket } from "./context";

/**
 * Resonance Engine.
 * The core significance architecture for Obsidian Atlas.
 */
export class ResonanceEngine {
  /**
   * Processes an incoming user message to update resonance models.
   */
  static async processIncomingMessage(
    messageId: string,
    content: string,
    currentState: {
      profiles: ResonanceProfile[];
      threads: ResonanceThread[];
      graph: ResonanceGraph;
    },
    userId?: string,
  ): Promise<{
    observation: ResonanceObservation | null;
    updatedProfiles: ResonanceProfile[];
    updatedThreads: ResonanceThread[];
    updatedGraph: ResonanceGraph;
  }> {
    // 1. Detect: Extract signals
    const rawObservation = await extractResonanceSignals(messageId, content, undefined, userId);
    
    // 2. Validate: Apply safeguards
    const observation = validateObservation(rawObservation);
    if (!observation) {
      return {
        observation: null,
        updatedProfiles: currentState.profiles,
        updatedThreads: currentState.threads,
        updatedGraph: currentState.graph
      };
    }

    // 3. Score & Update Profiles
    let updatedProfiles = [...currentState.profiles];
    const existingProfile = updatedProfiles.find(p => 
      p.subjectId.toLowerCase() === observation.inferredTheme.toLowerCase()
    );
    
    const newProfile = computeResonanceProfile(observation, existingProfile);
    if (existingProfile) {
      updatedProfiles = updatedProfiles.map(p => 
        p.profileId === existingProfile.profileId ? newProfile : p
      );
    } else {
      updatedProfiles.push(newProfile);
    }

    // 4. Link & Update Memory (Threads)
    const updatedThreads = integrateObservationIntoMemory(observation, currentState.threads);

    // 5. Update Graph Edges
    let updatedGraph = { ...currentState.graph };
    // Link theme to entities, projects, values mentioned in the observation
    observation.linkedEntities.forEach(entity => {
      updatedGraph = updateResonanceEdge(updatedGraph, observation.inferredTheme, entity, 'emotional_association' as any);
    });
    observation.linkedProjects.forEach(project => {
      updatedGraph = updateResonanceEdge(updatedGraph, observation.inferredTheme, project, 'motivational_dependency' as any);
    });

    return {
      observation,
      updatedProfiles,
      updatedThreads,
      updatedGraph
    };
  }

  /**
   * Generates a resonance context packet for downstream reasoning.
   */
  static getContextPacket(
    query: string,
    state: {
      threads: ResonanceThread[];
      activeTensions?: string[];
      identitySignificantProjects?: string[];
      adaptiveProfile?: AdaptiveResponseProfile;
    }
  ): ResonanceContextPacket {
    return generateResonanceContextPacket(
      query,
      state.threads,
      state.activeTensions,
      state.identitySignificantProjects,
      state.adaptiveProfile
    );
  }

  /**
   * Applies periodic maintenance (decay, drift detection).
   */
  static maintain(threads: ResonanceThread[]): ResonanceThread[] {
    return applyResonanceDecay(threads);
  }
}
