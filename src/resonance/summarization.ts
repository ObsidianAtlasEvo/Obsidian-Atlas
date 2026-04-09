import { ResonanceThread, ResonanceTier } from "./types";
import { ollamaComplete, parseJsonFromAssistant } from "../services/ollamaClient";

/**
 * Resonance-Aware Summarization.
 * This module generates summaries that distinguish facts from importance.
 */

export async function generateResonanceSummary(
  content: string,
  resonanceThreads: ResonanceThread[]
): Promise<{
  factualSummary: string;
  significanceSummary: string;
  unresolvedTensions: string[];
  lastingSignificance: string[];
}> {
  const coreThemes = resonanceThreads
    .filter(thread => thread.tier === ResonanceTier.CORE || thread.tier === ResonanceTier.SACRED)
    .map(thread => thread.canonicalTheme);

  const prompt = `
    You are the Resonance Engine for Obsidian Atlas. Summarize the following content, but distinguish between what was discussed and what truly mattered based on the user's resonance profile.

    CORE RESONANCE THEMES FOR THIS USER:
    ${coreThemes.join(", ")}

    CONTENT TO SUMMARIZE:
    ${content}

    OUTPUT FORMAT:
    Return ONLY valid JSON (no markdown fences):
    {
      "factualSummary": "string (what was discussed)",
      "significanceSummary": "string (what truly mattered in this context)",
      "unresolvedTensions": ["string (any conflicts or open questions)"],
      "lastingSignificance": ["string (what appears to have lasting weight)"]
    }

    HUMAN-READABLE OUTPUT: You MUST translate all internal logic, system states, and cognitive processes into coherent, natural English. NEVER output raw pseudocode, Python scripts, or "tech gibberish" (e.g., \`def validate_input(payload):\`) unless explicitly asked to write code. Communicate as a highly intelligent human advisor.
  `;

  try {
    const raw = await ollamaComplete(prompt, { json: true });
    return parseJsonFromAssistant(raw);
  } catch (error) {
    console.error("Error generating resonance summary:", error);
    return {
      factualSummary: content.substring(0, 200) + "...",
      significanceSummary: "Resonance analysis unavailable.",
      unresolvedTensions: [],
      lastingSignificance: []
    };
  }
}
