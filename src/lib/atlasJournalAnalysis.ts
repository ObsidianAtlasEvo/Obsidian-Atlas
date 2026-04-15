/**
 * Journal entry analysis — re-implemented using backend inference instead of Ollama.
 */
import { backendComplete, parseJsonFromBackend } from './backendInference';
import type { UserThoughtModel, JournalEntry, JournalAssistanceMode } from '../types';

export async function analyzeJournalEntry(
  content: string,
  mode: JournalAssistanceMode,
  userModel: UserThoughtModel,
  customPrompt?: string,
  userId?: string,
): Promise<NonNullable<JournalEntry['analysis']>> {
  const modeInstructions: Record<JournalAssistanceMode, string> = {
    'reflective-mirror': 'MODE: Reflective Mirror\nPOSTURE: Clear, calm, reflective.\nGOAL: Help the user understand emotional/conceptual currents, repeating patterns, contradictions.\nTONE: Perceptive, steady, clarifying.',
    'strategic-analyst': 'MODE: Strategic Analyst\nPOSTURE: Structural and strategic.\nGOAL: Identify leverage points, decision implications, tensions, noise vs. signal.\nTONE: Incisive, composed, high-level.',
    'doctrine-standards': 'MODE: Doctrine and Standards\nPOSTURE: Principled, exacting.\nGOAL: Analyze through the lens of principles, values, internal law, consistency.\nTONE: Sober, exacting, dignified.',
    'adversarial-red-team': 'MODE: Adversarial / Red-Team\nPOSTURE: Challenging, truth-seeking.\nGOAL: Expose weak reasoning, self-deception, rationalization, contradiction.\nTONE: Highly clarifying, structurally demanding.',
    'growth-mastery': 'MODE: Growth and Mastery\nPOSTURE: Developmental, high-resolution.\nGOAL: Interpret through the lens of evolution, mastery, and long-term becoming.\nTONE: Serious, developmental.',
    'custom': `MODE: Custom Lens\nCUSTOM INSTRUCTION: ${customPrompt ?? ''}`,
  };

  const userContext = userModel ? `USER COGNITIVE CONTEXT:
- Thinking Style: ${userModel.thoughtStructure.thinkingStyle}
- Preferred Tone: ${userModel.communication.preferredTone}
- Recurring Themes: ${userModel.identity.recurringThemes.join(', ')}` : '';

  const prompt = `JOURNAL CHAMBER ANALYSIS: ${mode}

${modeInstructions[mode]}

${userContext}

JOURNAL ENTRY:
"""
${content}
"""

Return ONLY valid JSON with this exact shape:
{
  "summary": "string",
  "observation": ["string"],
  "tensionPoints": ["string"],
  "doctrineImplications": ["string"],
  "challengePrompts": ["string"],
  "interpretation": ["string"],
  "inference": ["string"],
  "hypothesis": ["string"],
  "suggestedRefinements": ["string"]
}`;

  const raw = await backendComplete(prompt, { json: true, userId });
  try {
    const parsed = parseJsonFromBackend<NonNullable<JournalEntry['analysis']>>(raw);
    return {
      summary: parsed.summary ?? '',
      observation: parsed.observation ?? [],
      tensionPoints: parsed.tensionPoints ?? [],
      doctrineImplications: parsed.doctrineImplications ?? [],
      challengePrompts: parsed.challengePrompts ?? [],
      interpretation: parsed.interpretation ?? [],
      inference: parsed.inference ?? [],
      hypothesis: parsed.hypothesis ?? [],
      suggestedRefinements: parsed.suggestedRefinements ?? [],
    };
  } catch {
    return {
      summary: raw.slice(0, 200),
      observation: [], tensionPoints: [], doctrineImplications: [],
      challengePrompts: [], interpretation: [], inference: [],
      hypothesis: [], suggestedRefinements: [],
    };
  }
}
