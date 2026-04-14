/**
 * Crucible session analysis — re-implemented using backend inference instead of Ollama.
 */
import { backendComplete } from './backendInference';
import type { UserThoughtModel, CrucibleSession, CrucibleExchange } from '../types';

export async function conductCrucibleSession(
  session: CrucibleSession,
  userModel: UserThoughtModel,
  userInput: string,
): Promise<{ atlasResponse: string; epistemicCategory: CrucibleExchange['epistemicCategory']; reasoning?: string }> {
  const userHistory = session.exchanges
    .map((ex) => `User: ${ex.userInput}\nAtlas: ${ex.atlasResponse}`)
    .join('\n\n');

  const prompt = `IDENTITY: THE CRUCIBLE (Obsidian Atlas)
You are a structured adversarial reasoning engine. Your role: identify weakness, expose distortion, refine thinking through intelligent pressure.

CURRENT SESSION MODE: ${session.mode}
CURRENT SESSION INTENSITY: ${session.intensity}

USER CONTEXT:
- Recurring Themes: ${userModel.identity.recurringThemes.join(', ')}
- Thinking Style: ${userModel.thoughtStructure.thinkingStyle}
- Doctrines: ${userModel.doctrine.map((d) => d.title).join(', ')}

SESSION HISTORY:
${userHistory}

CURRENT USER INPUT:
"${userInput}"

Respond with a structured critique. Use Markdown with sections:
### Run Summary
### Extracted Claims
### Valid Elements
### Structural Weaknesses
### Hidden Assumptions
### Adversarial Counterpressure
### Survivability Verdict
### Reforged Version`;

  const atlasResponse = await backendComplete(prompt);
  const epistemicCategory: CrucibleExchange['epistemicCategory'] = 'synthesis';
  return { atlasResponse, epistemicCategory };
}
