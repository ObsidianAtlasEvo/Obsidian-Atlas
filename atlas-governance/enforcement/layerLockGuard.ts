/**
 * Layer Lock Guard
 * Phase 4 Governance — Section 1: Policy Precedence Engine
 *
 * Protects critical policy layers (CONSTITUTION, IDENTITY) from
 * unauthorized mutation. Only the Sovereign Creator can unlock them.
 */

import { PolicyLayer } from './precedenceConflictResolver.ts';
import { AtlasEventBus } from '../infrastructure/eventBus.ts';
import { SOVEREIGN_CREATOR_EMAIL } from '../../atlas-backend/src/services/intelligence/sovereignCreatorDirective.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface UnlockResult {
  success: boolean;
  reason?: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

/** The sole authority permitted to unlock protected layers. Imported from sovereignCreatorDirective. */

// ── State ───────────────────────────────────────────────────────────────────

/** Layers currently locked. CONSTITUTION and IDENTITY are locked by default. */
const lockedLayers: Set<PolicyLayer> = new Set([
  PolicyLayer.CONSTITUTION,
  PolicyLayer.IDENTITY,
]);

// ── Guard API ───────────────────────────────────────────────────────────────

/**
 * Check whether a given policy layer is currently locked.
 */
export function isLocked(layer: PolicyLayer): boolean {
  return lockedLayers.has(layer);
}

/**
 * Attempt to unlock a policy layer.
 * Only the Sovereign Creator (`crowleyrc62@gmail.com`) may unlock layers.
 * Every attempt — successful or not — is logged via the event bus.
 */
export function unlock(layer: PolicyLayer, actorId: string): UnlockResult {
  const layerName = PolicyLayer[layer];

  if (actorId !== SOVEREIGN_CREATOR_EMAIL) {
    AtlasEventBus.emit(
      'CONSTITUTION_VIOLATION',
      actorId,
      {
        event: 'UNLOCK_DENIED',
        layer: layerName,
        actorId,
        reason: 'Actor is not the Sovereign Creator',
      },
      'LayerLockGuard'
    );

    return {
      success: false,
      reason: `Only the Sovereign Creator may unlock the ${layerName} layer`,
    };
  }

  if (!lockedLayers.has(layer)) {
    return { success: true, reason: `${layerName} layer is already unlocked` };
  }

  lockedLayers.delete(layer);

  AtlasEventBus.emit(
    'MUTATION_COMMITTED',
    actorId,
    {
      event: 'LAYER_UNLOCKED',
      layer: layerName,
      actorId,
    },
    'LayerLockGuard'
  );

  return { success: true };
}

/**
 * Re-lock a policy layer.
 */
export function lock(layer: PolicyLayer, actorId: string): void {
  lockedLayers.add(layer);

  AtlasEventBus.emit(
    'MUTATION_COMMITTED',
    actorId,
    {
      event: 'LAYER_LOCKED',
      layer: PolicyLayer[layer],
      actorId,
    },
    'LayerLockGuard'
  );
}

/**
 * Return all currently locked policy layers.
 */
export function getLockedLayers(): PolicyLayer[] {
  return [...lockedLayers];
}
