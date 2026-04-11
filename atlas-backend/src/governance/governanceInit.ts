import { AtlasEventBus } from '../infrastructure/eventBus.js';

/**
 * Initialise governance infrastructure when Supabase credentials are available.
 * Safe to call once at startup; no-op if already initialised.
 */
export function initGovernanceEventBus(supabaseUrl: string, supabaseKey: string): void {
  try {
    const bus = AtlasEventBus.getInstance(supabaseUrl, supabaseKey);
    bus.startFlush();
  } catch (e) {
    console.warn('[governance] AtlasEventBus init skipped:', e);
  }
}
