/**
 * Degraded Mode Controller — graceful degradation when governance subsystems
 * fail or become unavailable.
 *
 * Tracks health of every named subsystem and computes the overall operating
 * mode so the response pipeline can adapt (skip personalization, add disclaimers, etc.).
 */

import { z } from 'zod';
import { emit } from './eventBus.js';

/* ───────── Subsystem health ───────── */

export const SubsystemHealth = {
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN',
} as const;

export type SubsystemHealth = (typeof SubsystemHealth)[keyof typeof SubsystemHealth];

export const subsystemHealthSchema = z.enum(['HEALTHY', 'DEGRADED', 'FAILED', 'UNKNOWN']);

/* ───────── Degraded mode levels ───────── */

export const DegradedModeLevel = {
  /** All systems healthy — full Atlas experience. */
  FULL: 'FULL',
  /** Non-critical systems degraded — reduced personalization. */
  GRACEFUL: 'GRACEFUL',
  /** Constitution/safety up but personalization/evolution offline — capable but non-adaptive. */
  SAFE: 'SAFE',
  /** Only core chat available — all governance offline. */
  MINIMAL: 'MINIMAL',
  /** Atlas cannot operate. */
  OFFLINE: 'OFFLINE',
} as const;

export type DegradedModeLevel = (typeof DegradedModeLevel)[keyof typeof DegradedModeLevel];

export const degradedModeLevelSchema = z.enum(['FULL', 'GRACEFUL', 'SAFE', 'MINIMAL', 'OFFLINE']);

/* ───────── Subsystem names ───────── */

export const subsystemNameSchema = z.enum([
  'evolution_engine',
  'evidence_arbitrator',
  'overseer',
  'event_bus',
  'goal_memory',
  'mutation_ledger',
  'concept_graph',
  'identity_resolver',
  'concurrency_orchestrator',
  'state_version_manager',
]);

export type SubsystemName = z.infer<typeof subsystemNameSchema>;

/* ───────── Subsystem registry (internal state) ───────── */

interface SubsystemEntry {
  health: SubsystemHealth;
  detail: string | null;
  lastUpdated: string;
}

const registry = new Map<SubsystemName, SubsystemEntry>();

const ALL_SUBSYSTEMS: SubsystemName[] = [
  'evolution_engine',
  'evidence_arbitrator',
  'overseer',
  'event_bus',
  'goal_memory',
  'mutation_ledger',
  'concept_graph',
  'identity_resolver',
  'concurrency_orchestrator',
  'state_version_manager',
];

// Initialize all subsystems as UNKNOWN
for (const name of ALL_SUBSYSTEMS) {
  registry.set(name, { health: SubsystemHealth.UNKNOWN, detail: null, lastUpdated: new Date().toISOString() });
}

/* ───────── Classification: which subsystems are critical ───────── */

/** Critical subsystems — if these fail, we drop to SAFE or below. */
const CRITICAL_SUBSYSTEMS: ReadonlySet<SubsystemName> = new Set([
  'evidence_arbitrator',
  'mutation_ledger',
  'event_bus',
]);

/** Personalization subsystems — if only these fail, we stay at GRACEFUL. */
const PERSONALIZATION_SUBSYSTEMS: ReadonlySet<SubsystemName> = new Set([
  'evolution_engine',
  'goal_memory',
  'concept_graph',
  'identity_resolver',
  'overseer',
  'concurrency_orchestrator',
  'state_version_manager',
]);

/* ───────── Public API ───────── */

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Report (or update) the health of a named subsystem.
 */
export function reportSubsystemHealth(name: SubsystemName, health: SubsystemHealth, detail?: string): void {
  const previous = registry.get(name);
  const entry: SubsystemEntry = { health, detail: detail ?? null, lastUpdated: nowIso() };
  registry.set(name, entry);

  if (!previous || previous.health !== health) {
    emit('SUBSYSTEM_HEALTH_CHANGED', 'degradedModeController', {
      subsystem: name,
      previousHealth: previous?.health ?? null,
      currentHealth: health,
      detail: entry.detail,
    });
  }
}

/**
 * Get the current health of a specific subsystem.
 */
export function getSubsystemHealth(name: SubsystemName): SubsystemEntry {
  const entry = registry.get(name);
  if (!entry) throw new Error(`Unknown subsystem: ${name}`);
  return { ...entry };
}

/**
 * Snapshot of all subsystem health states.
 */
export function getAllSubsystemHealth(): Record<SubsystemName, SubsystemEntry> {
  const result: Record<string, SubsystemEntry> = {};
  for (const [name, entry] of registry) {
    result[name] = { ...entry };
  }
  return result as Record<SubsystemName, SubsystemEntry>;
}

/**
 * Assess the current degraded mode level based on all subsystem health.
 */
export function assessMode(): DegradedModeLevel {
  const healthValues: SubsystemHealth[] = [];
  for (const entry of registry.values()) {
    healthValues.push(entry.health);
  }

  const allFailed = healthValues.every((h) => h === SubsystemHealth.FAILED);
  if (allFailed) return DegradedModeLevel.OFFLINE;

  // Check critical subsystems
  let criticalHealthy = true;
  let anyCriticalFailed = false;
  for (const name of CRITICAL_SUBSYSTEMS) {
    const entry = registry.get(name);
    if (!entry || entry.health === SubsystemHealth.FAILED) {
      criticalHealthy = false;
      anyCriticalFailed = true;
    } else if (entry.health === SubsystemHealth.DEGRADED || entry.health === SubsystemHealth.UNKNOWN) {
      criticalHealthy = false;
    }
  }

  // If any critical system has failed entirely → MINIMAL at best
  if (anyCriticalFailed) {
    // Check if literally everything critical is failed
    let allCriticalFailed = true;
    for (const name of CRITICAL_SUBSYSTEMS) {
      const entry = registry.get(name);
      if (entry && entry.health !== SubsystemHealth.FAILED) {
        allCriticalFailed = false;
      }
    }
    return allCriticalFailed ? DegradedModeLevel.MINIMAL : DegradedModeLevel.SAFE;
  }

  // Critical subsystems are at least DEGRADED/UNKNOWN — check personalization
  let anyPersonalizationDown = false;
  for (const name of PERSONALIZATION_SUBSYSTEMS) {
    const entry = registry.get(name);
    if (!entry || entry.health === SubsystemHealth.FAILED || entry.health === SubsystemHealth.DEGRADED) {
      anyPersonalizationDown = true;
    }
  }

  if (!criticalHealthy) {
    // Critical subsystems degraded but not failed, personalization may or may not be up
    return DegradedModeLevel.SAFE;
  }

  if (anyPersonalizationDown) {
    return DegradedModeLevel.GRACEFUL;
  }

  // Everything healthy
  return DegradedModeLevel.FULL;
}

/**
 * Wrapper that runs an async operation with automatic degraded-mode fallback.
 * On failure, reports the subsystem as DEGRADED and returns the provided fallback value.
 */
export async function withDegradedFallback<T>(
  subsystem: SubsystemName,
  operation: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    const result = await operation();
    return result;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    reportSubsystemHealth(subsystem, SubsystemHealth.DEGRADED, detail);

    emit('DEGRADED_FALLBACK_USED', 'degradedModeController', {
      subsystem,
      error: detail,
    });

    return fallback;
  }
}

/**
 * Returns a user-facing disclaimer Atlas should display when operating in degraded modes.
 * Returns `null` for FULL and GRACEFUL (no disclaimer needed).
 */
export function getDegradedModeDisclaimer(mode: DegradedModeLevel): string | null {
  switch (mode) {
    case DegradedModeLevel.FULL:
    case DegradedModeLevel.GRACEFUL:
      return null;

    case DegradedModeLevel.SAFE:
      return 'Atlas is operating in safe mode. Personalization and evolution features are temporarily unavailable. Responses will be accurate but may not reflect your personal context and preferences.';

    case DegradedModeLevel.MINIMAL:
      return 'Atlas is operating in minimal mode. Governance systems are offline. Only basic chat functionality is available. Your constitutional preferences and personal context are not being applied to responses.';

    case DegradedModeLevel.OFFLINE:
      return 'Atlas is currently unable to operate. Critical systems are unavailable. Please try again later.';

    default:
      return null;
  }
}

/**
 * Reset all subsystem health to UNKNOWN — primarily for tests.
 */
export function resetRegistry(): void {
  for (const name of ALL_SUBSYSTEMS) {
    registry.set(name, { health: SubsystemHealth.UNKNOWN, detail: null, lastUpdated: nowIso() });
  }
}
