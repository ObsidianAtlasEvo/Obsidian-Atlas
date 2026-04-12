import type { InteractionParams } from '../types/evolutionTypes.js';
import type { EvolutionEngine } from './evolutionEngine.js';

let evolutionEngineInstance: EvolutionEngine | null = null;

export function registerEvolutionEngine(engine: EvolutionEngine | null): void {
  evolutionEngineInstance = engine;
}

/** Fire-and-forget hook for chat paths when Supabase evolution is enabled. */
export function dispatchEvolutionInteraction(params: InteractionParams): void {
  void evolutionEngineInstance?.onInteraction(params);
}
