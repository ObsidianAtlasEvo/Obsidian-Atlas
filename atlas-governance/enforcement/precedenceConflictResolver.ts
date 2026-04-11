/**
 * Precedence Conflict Resolver
 * Phase 4 Governance — Section 1: Policy Precedence Engine
 *
 * Layer-rank arbitration for policy conflicts.
 * Resolution rules:
 *   1. Lowest layer number wins (CONSTITUTION > IDENTITY > DOMAIN > FEATURE > EXPERIMENT)
 *   2. Same layer: most recent effectiveAt timestamp wins
 *   3. Exact tie: createdBy === 'SOVEREIGN' wins
 */

import { AtlasEventBus } from '../infrastructure/eventBus.ts';

// ── Types ───────────────────────────────────────────────────────────────────

/** Policy layer precedence — lower number = higher priority. */
export enum PolicyLayer {
  CONSTITUTION = 0,
  IDENTITY = 1,
  DOMAIN = 2,
  FEATURE = 3,
  EXPERIMENT = 4,
}

/** A rule attached to an active policy. */
export interface PolicyRule {
  effect: 'ALLOW' | 'DENY';
  description: string;
}

/** An active policy participating in conflict resolution. */
export interface ActivePolicy {
  id: string;
  layer: PolicyLayer;
  effectiveAt: Date;
  createdBy: string;
  rule: PolicyRule;
}

// ── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolve a conflict among multiple active policies.
 * Returns the single winning policy according to the precedence rules.
 *
 * @throws {Error} If the policies array is empty.
 */
export function resolveConflict(policies: ActivePolicy[]): ActivePolicy {
  if (policies.length === 0) {
    throw new Error('resolveConflict: cannot resolve an empty policy set');
  }

  if (policies.length === 1) {
    return policies[0];
  }

  const sorted = [...policies].sort((a, b) => {
    // Rule 1: lowest layer number wins
    if (a.layer !== b.layer) return a.layer - b.layer;

    // Rule 2: most recent effectiveAt wins (descending)
    const timeDiff = b.effectiveAt.getTime() - a.effectiveAt.getTime();
    if (timeDiff !== 0) return timeDiff;

    // Rule 3: SOVEREIGN wins on exact tie
    if (a.createdBy === 'SOVEREIGN' && b.createdBy !== 'SOVEREIGN') return -1;
    if (b.createdBy === 'SOVEREIGN' && a.createdBy !== 'SOVEREIGN') return 1;

    return 0;
  });

  const winner = sorted[0];

  // Emit event when resolving among multiple candidates on the same layer
  const sameLayers = policies.filter((p) => p.layer === winner.layer);
  if (sameLayers.length > 1) {
    AtlasEventBus.emit(
      'SAME_LAYER_CONFLICT',
      'system',
      {
        winnerId: winner.id,
        layer: PolicyLayer[winner.layer],
        candidateCount: sameLayers.length,
      },
      'PrecedenceConflictResolver'
    );
  }

  AtlasEventBus.emit(
    'PRECEDENCE_RESOLVED',
    'system',
    {
      winnerId: winner.id,
      winnerLayer: PolicyLayer[winner.layer],
      candidateCount: policies.length,
    },
    'PrecedenceConflictResolver'
  );

  return winner;
}
