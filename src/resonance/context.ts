import { 
  ResonanceThread, 
  ResonanceTier, 
  ResonanceConfidence, 
  ResonanceContextPacket,
  AdaptiveResponseProfile,
  EffectiveResponseProfile,
  ResponseDepth,
  StructureStyle
} from "./types";
import { AdaptationEngine } from "./adaptation";

/**
 * Resonance Context Packet Generation.
 * This module builds a compact downstream payload for reasoning systems.
 */

/**
 * Generates a distilled resonance context packet for a specific query.
 * This is the "Resonance Context Packet" feature.
 */
export function generateResonanceContextPacket(
  query: string,
  resonanceThreads: ResonanceThread[],
  activeTensions: string[] = [],
  identitySignificantProjects: string[] = [],
  adaptiveProfile?: AdaptiveResponseProfile
): ResonanceContextPacket {
  // 1. Identify top relevant resonant themes for the query
  const relevantThemes = resonanceThreads.filter(thread => 
    query.toLowerCase().includes(thread.canonicalTheme.toLowerCase()) ||
    thread.aliases.some(alias => query.toLowerCase().includes(alias.toLowerCase())) ||
    thread.tier === ResonanceTier.CORE || 
    thread.tier === ResonanceTier.SACRED
  ).sort((a, b) => b.strengthScore - a.strengthScore).slice(0, 5);

  // 2. Identify high-care topics
  const highCareTopics = resonanceThreads
    .filter(thread => thread.tier === ResonanceTier.SACRED)
    .map(thread => thread.canonicalTheme);

  // 3. Identify linked values
  const linkedValues = Array.from(new Set(relevantThemes.flatMap(thread => thread.relatedValues)));

  // 4. Identify confidence levels
  const confidenceLevels: Record<string, ResonanceConfidence> = {};
  relevantThemes.forEach(thread => {
    confidenceLevels[thread.canonicalTheme] = thread.confidence;
  });

  // 5. Identify stale-assumption warnings
  const now = Date.now();
  const oneMonth = 1000 * 60 * 60 * 24 * 30;
  const staleAssumptionWarnings = resonanceThreads
    .filter(thread => (now - new Date(thread.lastSeenAt).getTime()) > oneMonth)
    .map(thread => `Theme "${thread.canonicalTheme}" may be stale (last seen ${new Date(thread.lastSeenAt).toLocaleDateString()})`);

  // 6. Determine modulation cues based on resonance profile
  const modulationCues = determineModulationCues(relevantThemes);

  // 7. Derive Effective Response Profile
  const responseProfile = adaptiveProfile 
    ? AdaptationEngine.resolveResponsePosture(adaptiveProfile, query) 
    : undefined;

  return {
    topThemes: relevantThemes,
    activeTensions,
    highCareTopics,
    linkedValues,
    confidenceLevels,
    staleAssumptionWarnings,
    identitySignificantProjects,
    modulationCues,
    responseProfile
  };
}

/**
 * Determines response modulation cues based on the current resonance profile.
 */
function determineModulationCues(themes: ResonanceThread[]): ResonanceContextPacket['modulationCues'] {
  const hasSacred = themes.some(thread => thread.tier === ResonanceTier.SACRED);
  const hasCore = themes.some(thread => thread.tier === ResonanceTier.CORE);
  
  return {
    tone: hasSacred ? 'reverent' : hasCore ? 'empathetic' : 'analytical',
    directness: hasSacred ? 0.3 : 0.7, // Be less direct for sacred topics
    softness: hasSacred ? 0.9 : 0.4, // Be softer for sacred topics
    precision: hasCore ? 0.9 : 0.6 // Be more precise for core topics
  };
}

/**
 * Formats the resonance context packet as a string for inclusion in a prompt.
 */
export function formatResonanceContextForPrompt(packet: ResonanceContextPacket): string {
  let context = "RESONANCE CONTEXT:\n";
  
  if (packet.topThemes.length > 0) {
    context += "- Top Themes: " + packet.topThemes.map(t => `${t.canonicalTheme} (${t.tier})`).join(", ") + "\n";
  }
  
  if (packet.highCareTopics.length > 0) {
    context += "- High-Care Topics: " + packet.highCareTopics.join(", ") + " (Handle with extreme sensitivity and continuity)\n";
  }
  
  if (packet.activeTensions.length > 0) {
    context += "- Active Tensions: " + packet.activeTensions.join(", ") + "\n";
  }
  
  if (packet.linkedValues.length > 0) {
    context += "- Linked Values: " + packet.linkedValues.join(", ") + "\n";
  }
  
  if (packet.identitySignificantProjects.length > 0) {
    context += "- Identity-Significant Projects: " + packet.identitySignificantProjects.join(", ") + "\n";
  }
  
  context += `- Modulation: Tone (${packet.modulationCues.tone}), Softness (${packet.modulationCues.softness}), Precision (${packet.modulationCues.precision})\n`;
  
  if (packet.staleAssumptionWarnings.length > 0) {
    context += "- WARNINGS: " + packet.staleAssumptionWarnings.join("; ") + "\n";
  }
  
  return context;
}
