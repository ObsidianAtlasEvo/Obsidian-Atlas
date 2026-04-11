import { AtlasEventBus } from '../infrastructure/eventBus.js';

export function tryEmitEvolutionCycleCompleted(
  userId: string,
  signalCount: number,
  durationMs: number,
): void {
  try {
    AtlasEventBus.getInstance().emit({
      type: 'evolution.cycle.completed',
      userId,
      sessionId: 'system',
      source: 'evolution-engine',
      payload: { signalCount, durationMs },
    });
  } catch {
    /* bus not configured */
  }
}
