import { 
  ResonanceThread, 
  ResonanceTier, 
  ResonanceConfidence 
} from "./types";

/**
 * Resonance-Aware Retrieval.
 * This module ranks memory and context using resonance relevance.
 */

export interface RetrievalItem {
  id: string;
  type: string;
  content: string;
  relevanceScore: number; // Initial relevance score (e.g., from vector search)
  timestamp: string;
}

/**
 * Ranks retrieval items based on resonance relevance.
 * This is the "Resonance-Aware Retrieval" feature.
 */
export function rankByResonance(
  items: RetrievalItem[],
  resonanceThreads: ResonanceThread[]
): RetrievalItem[] {
  return items.map(item => {
    // 1. Find matching resonance threads for the item
    const matchingThreads = resonanceThreads.filter(thread => 
      item.content.toLowerCase().includes(thread.canonicalTheme.toLowerCase()) ||
      thread.aliases.some(alias => item.content.toLowerCase().includes(alias.toLowerCase()))
    );

    if (matchingThreads.length === 0) return item;

    // 2. Compute resonance boost
    const resonanceBoost = matchingThreads.reduce((boost, thread) => {
      let threadBoost = 0;
      
      // Tier-based boost
      switch (thread.tier) {
        case ResonanceTier.SACRED: threadBoost += 0.5; break;
        case ResonanceTier.CORE: threadBoost += 0.4; break;
        case ResonanceTier.ESTABLISHED: threadBoost += 0.3; break;
        case ResonanceTier.EMERGING: threadBoost += 0.2; break;
        case ResonanceTier.FLEETING: threadBoost += 0.1; break;
      }

      // Strength-based boost
      threadBoost += thread.strengthScore * 0.2;

      // Identity and Goal link boost
      threadBoost += (thread.identityLinkStrength + thread.goalLinkStrength) * 0.1;

      return boost + threadBoost;
    }, 0);

    // 3. Apply boost to relevance score
    const finalScore = Math.min(1, item.relevanceScore + resonanceBoost);

    return {
      ...item,
      relevanceScore: finalScore
    };
  }).sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Filters retrieval items to favor core identity and mission-critical items.
 */
export function filterByResonanceSignificance(
  items: RetrievalItem[],
  resonanceThreads: ResonanceThread[]
): RetrievalItem[] {
  // Identify core and sacred themes
  const significantThemes = resonanceThreads.filter(thread => 
    thread.tier === ResonanceTier.CORE || thread.tier === ResonanceTier.SACRED
  );

  if (significantThemes.length === 0) return items;

  // Favor items that match significant themes
  return items.filter(item => 
    significantThemes.some(thread => 
      item.content.toLowerCase().includes(thread.canonicalTheme.toLowerCase())
    )
  );
}
