import { ResonanceObservation, ResonanceConfidence } from "./types";
import { RESONANCE_SIGNAL_EXTRACTION_PROMPT } from "./prompts";
import { backendComplete as ollamaComplete, parseJsonFromBackend as parseJsonFromAssistant } from "../lib/backendInference";

/**
 * Extracts message-level resonance signals from a user message.
 * This is the primary entry point for the Resonance Engine's detection phase.
 */
export async function extractResonanceSignals(
  messageId: string,
  messageContent: string,
  _userContext?: string, // Optional context from the user model
  userId?: string,
): Promise<ResonanceObservation> {
  const basePrompt = RESONANCE_SIGNAL_EXTRACTION_PROMPT.replace("{{MESSAGE}}", messageContent);
  const prompt = `${basePrompt}

Return ONLY valid JSON (no markdown fences) with:
- inferredTheme (string)
- extractedSignals (array of { type, value, evidence })
- confidence (string)
- summaryOfSignificance (string)
- optional: linkedEntities, linkedProjects, linkedValues, linkedMemories (string arrays)
`;

  try {
    const raw = await ollamaComplete(prompt, { json: true, userId });
    const result = parseJsonFromAssistant<Record<string, unknown>>(raw);

    return {
      observationId: `obs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sourceMessageId: messageId,
      excerptReference: messageContent.substring(0, 100) + (messageContent.length > 100 ? "..." : ""),
      inferredTheme: (result.inferredTheme as string) || "Unknown",
      extractedSignals: (result.extractedSignals as ResonanceObservation["extractedSignals"]) || [],
      confidence: ((result.confidence as ResonanceConfidence) || ResonanceConfidence.INFERRED),
      observedAt: new Date().toISOString(),
      linkedEntities: (result.linkedEntities as string[]) || [],
      linkedProjects: (result.linkedProjects as string[]) || [],
      linkedValues: (result.linkedValues as string[]) || [],
      linkedMemories: (result.linkedMemories as string[]) || []
    };
  } catch (error) {
    console.error("Error extracting resonance signals:", error);
    // Return a basic observation if extraction fails
    return {
      observationId: `obs-err-${Date.now()}`,
      sourceMessageId: messageId,
      excerptReference: messageContent.substring(0, 100),
      inferredTheme: "Unknown",
      extractedSignals: [],
      confidence: ResonanceConfidence.WEAKLY_INFERRED,
      observedAt: new Date().toISOString(),
      linkedEntities: [],
      linkedProjects: [],
      linkedValues: [],
      linkedMemories: []
    };
  }
}
