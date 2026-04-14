/**
 * Re-exports globalEvolutionEngine from its pure implementation.
 * Extracted from ollamaService.ts to break the Ollama import chain.
 */
import { PersonalEvolutionEngine } from '../services/evolution/personalEvolutionEngine';

export const globalEvolutionEngine = new PersonalEvolutionEngine('crowleyrc62@gmail.com');
