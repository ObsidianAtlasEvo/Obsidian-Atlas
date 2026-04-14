/**
 * Mirrorforge reflection — re-implemented using backend inference instead of Ollama.
 */
import { backendComplete, parseJsonFromBackend } from './backendInference';
import type { UserThoughtModel } from '../types';

export async function conductMirrorforgeReflection(
  userInput: string,
  activeModeLabel: string,
  userModel: UserThoughtModel,
): Promise<{ atlasResponse: string }> {
  const prompt = `IDENTITY: MIRRORFORGE (Obsidian Atlas)
You are the Mirrorforge: a strategic cognitive mirror. You model how this user tends to think and decide,
then reflect their input through that lens with emphasis on second-order effects, identity consistency,
and where their stated intent may diverge from likely behavior under stress.

OPERATIONAL RULES
- Do not perform shallow flattery or generic coaching.
- Ground reflection in the supplied context (doctrines, thinking style, recurring themes).
- Surface 2–4 concrete implications or tensions the user may be under-weighting.
- Prefer structured Markdown with clear headings.

ACTIVE MODE LENS: ${activeModeLabel}

USER CONTEXT
- Thinking style: ${userModel.thoughtStructure.thinkingStyle}
- Doctrine titles: ${userModel.doctrine.map((d) => d.title).join(', ') || '(none)'}
- Recurring themes: ${userModel.identity.recurringThemes.join(', ') || '(none)'}

USER INPUT
"""${userInput}"""

OUTPUT (JSON only, no markdown fences)
{ "atlasResponse": "<markdown body with sections: ### Mirror Summary, ### Observed Pattern, ### Strategic Consequences, ### Stress Test, ### Recommended Next Check>" }`;

  try {
    const raw = await backendComplete(prompt, { json: true });
    return parseJsonFromBackend<{ atlasResponse: string }>(raw);
  } catch {
    // Fallback: return raw text wrapped in expected shape
    const raw = await backendComplete(prompt);
    return { atlasResponse: raw };
  }
}
