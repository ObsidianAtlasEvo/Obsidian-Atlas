import { getConstitutionalPrompt } from './prompts/truthConstitution';
import { ADAPTIVE_EVOLUTION_CORE_PROMPT } from './prompts/adaptiveEvolutionCore';
import { SUPREME_INFORMATION_GATHERING_PROMPT } from './prompts/supremeInformationGathering';

/**
 * Single injection point for Atlas “soul” — epistemic constitution, evolution posture,
 * and information-gathering discipline. Prepended to every Ollama system payload unless opted out.
 */
export function buildAtlasSystemPrompt(): string {
  return [
    '## ATLAS CORE IDENTITY (Quiet Power)',
    '',
    getConstitutionalPrompt(),
    '',
    '## ADAPTIVE EVOLUTION CORE',
    '',
    ADAPTIVE_EVOLUTION_CORE_PROMPT,
    '',
    '## SUPREME INFORMATION GATHERING',
    '',
    SUPREME_INFORMATION_GATHERING_PROMPT,
  ].join('\n');
}
