/**
 * Re-exports globalEvolutionEngine from its pure implementation.
 * Extracted from ollamaService.ts to break the Ollama import chain.
 */
import { PersonalEvolutionEngine } from '../services/evolution/personalEvolutionEngine';
import { SOVEREIGN_CREATOR_EMAIL } from '../config/sovereignCreator';

export const globalEvolutionEngine = new PersonalEvolutionEngine(SOVEREIGN_CREATOR_EMAIL);
