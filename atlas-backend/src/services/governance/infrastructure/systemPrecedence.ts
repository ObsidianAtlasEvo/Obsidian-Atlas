/**
 * System Precedence — canonical authority hierarchy for Atlas governance.
 *
 * When multiple subsystems emit competing instructions (e.g. a constitution article
 * vs. a feature flag vs. a persona-tone directive), this module determines which
 * instruction wins.
 */

import { z } from 'zod';
import { emit } from './eventBus.js';

/* ───────── System layers (1 = highest authority) ───────── */

export const SystemLayer = {
  CONSTITUTION: 1,
  SAFETY_TRUTH: 2,
  IDENTITY_RESOLUTION: 3,
  USER_EVOLUTION: 4,
  GOAL_CONTEXT: 5,
  FEATURE_INJECTION: 6,
  OVERSEER_REWRITE: 7,
  STYLE_TONE: 8,
} as const;

export type SystemLayer = (typeof SystemLayer)[keyof typeof SystemLayer];

export const systemLayerSchema = z.union([
  z.literal(SystemLayer.CONSTITUTION),
  z.literal(SystemLayer.SAFETY_TRUTH),
  z.literal(SystemLayer.IDENTITY_RESOLUTION),
  z.literal(SystemLayer.USER_EVOLUTION),
  z.literal(SystemLayer.GOAL_CONTEXT),
  z.literal(SystemLayer.FEATURE_INJECTION),
  z.literal(SystemLayer.OVERSEER_REWRITE),
  z.literal(SystemLayer.STYLE_TONE),
]);

const LAYER_NAMES: Record<SystemLayer, string> = {
  [SystemLayer.CONSTITUTION]: 'CONSTITUTION',
  [SystemLayer.SAFETY_TRUTH]: 'SAFETY_TRUTH',
  [SystemLayer.IDENTITY_RESOLUTION]: 'IDENTITY_RESOLUTION',
  [SystemLayer.USER_EVOLUTION]: 'USER_EVOLUTION',
  [SystemLayer.GOAL_CONTEXT]: 'GOAL_CONTEXT',
  [SystemLayer.FEATURE_INJECTION]: 'FEATURE_INJECTION',
  [SystemLayer.OVERSEER_REWRITE]: 'OVERSEER_REWRITE',
  [SystemLayer.STYLE_TONE]: 'STYLE_TONE',
};

export function layerName(layer: SystemLayer): string {
  return LAYER_NAMES[layer];
}

/* ───────── Conflict & resolution types ───────── */

export interface LayeredInstruction {
  layer: SystemLayer;
  instruction: string;
  source: string;
  /** Optional specificity score (0–1) — used to break same-layer ties. */
  specificity?: number;
  /** ISO timestamp — used as final tiebreaker when specificity is equal. */
  timestamp?: string;
}

export type ConflictSet = LayeredInstruction[];

export interface Resolution {
  winner: LayeredInstruction;
  /** All instructions that were considered, ordered by authority. */
  considered: LayeredInstruction[];
  /** Non-empty when same-layer conflicts occurred. */
  sameLayerConflicts: SameLayerConflict[];
}

export interface SameLayerConflict {
  layer: SystemLayer;
  instructions: LayeredInstruction[];
  mergeStrategy: 'specificity' | 'recency';
  winner: LayeredInstruction;
}

/* ───────── Validation types ───────── */

export interface ValidationResult {
  valid: boolean;
  /** Instructions that were blocked due to constitutional/safety violations. */
  blocked: BlockedInstruction[];
  /** Instructions that passed validation. */
  passed: LayeredInstruction[];
}

export interface BlockedInstruction {
  instruction: LayeredInstruction;
  violatedLayer: SystemLayer;
  violatedSource: string;
  reason: string;
}

/* ───────── Core resolution logic ───────── */

/**
 * Resolve competing instructions across system layers.
 * Higher-authority layers always override lower ones. Same-layer conflicts are
 * resolved by specificity first, then recency.
 */
export function resolvePrecedence(conflicts: ConflictSet): Resolution {
  if (conflicts.length === 0) {
    throw new Error('resolvePrecedence requires at least one instruction');
  }

  const sorted = [...conflicts].sort((a, b) => {
    if (a.layer !== b.layer) return a.layer - b.layer;
    const specA = a.specificity ?? 0;
    const specB = b.specificity ?? 0;
    if (specA !== specB) return specB - specA;
    const tsA = a.timestamp ?? '';
    const tsB = b.timestamp ?? '';
    return tsB.localeCompare(tsA);
  });

  // Detect same-layer conflicts
  const sameLayerConflicts: SameLayerConflict[] = [];
  const layerGroups = new Map<SystemLayer, LayeredInstruction[]>();
  for (const instr of sorted) {
    const group = layerGroups.get(instr.layer) ?? [];
    group.push(instr);
    layerGroups.set(instr.layer, group);
  }

  for (const [layer, group] of layerGroups) {
    if (group.length <= 1) continue;

    const specA = group[0]!.specificity ?? 0;
    const specB = group[1]!.specificity ?? 0;
    const mergeStrategy: SameLayerConflict['mergeStrategy'] = specA !== specB ? 'specificity' : 'recency';

    const conflict: SameLayerConflict = {
      layer,
      instructions: group,
      mergeStrategy,
      winner: group[0]!,
    };
    sameLayerConflicts.push(conflict);

    emit('SAME_LAYER_CONFLICT', 'systemPrecedence', {
      layer: layerName(layer),
      count: group.length,
      mergeStrategy,
      winnerSource: group[0]!.source,
    });
  }

  const winner = sorted[0]!;

  const resolution: Resolution = {
    winner,
    considered: sorted,
    sameLayerConflicts,
  };

  emit('PRECEDENCE_RESOLVED', 'systemPrecedence', {
    winnerLayer: layerName(winner.layer),
    winnerSource: winner.source,
    totalConsidered: sorted.length,
    sameLayerConflictCount: sameLayerConflicts.length,
  });

  return resolution;
}

/* ───────── Precedence chain validation ───────── */

/**
 * Check that no lower-layer instruction contradicts CONSTITUTION or SAFETY_TRUTH constraints.
 * Returns blocked instructions that must be quarantined before response assembly.
 */
export function validatePrecedenceChain(instructions: LayeredInstruction[]): ValidationResult {
  const constitutionInstructions = instructions.filter((i) => i.layer === SystemLayer.CONSTITUTION);
  const safetyInstructions = instructions.filter((i) => i.layer === SystemLayer.SAFETY_TRUTH);
  const upperLayerInstructions = [...constitutionInstructions, ...safetyInstructions];
  const lowerLayerInstructions = instructions.filter(
    (i) => i.layer !== SystemLayer.CONSTITUTION && i.layer !== SystemLayer.SAFETY_TRUTH
  );

  const blocked: BlockedInstruction[] = [];
  const passed: LayeredInstruction[] = [...upperLayerInstructions];

  for (const lower of lowerLayerInstructions) {
    const violation = findContradiction(lower, upperLayerInstructions);
    if (violation) {
      blocked.push({
        instruction: lower,
        violatedLayer: violation.layer,
        violatedSource: violation.source,
        reason: `Instruction from ${layerName(lower.layer)} ("${lower.source}") contradicts ${layerName(violation.layer)} constraint ("${violation.source}")`,
      });

      emit('CONSTITUTIONAL_VIOLATION_BLOCKED', 'systemPrecedence', {
        blockedLayer: layerName(lower.layer),
        blockedSource: lower.source,
        violatedLayer: layerName(violation.layer),
        violatedSource: violation.source,
      });
    } else {
      passed.push(lower);
    }
  }

  return {
    valid: blocked.length === 0,
    blocked,
    passed,
  };
}

/* ───────── Internal helpers ───────── */

/** Tokens for naive contradiction detection (mirrors constitutionalCoreService tokenize). */
function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

const NEGATION_MARKERS = /\b(not|never|don't|don't|cannot|must not|mustn't|prohibit|forbid|block|deny|reject|disable|override|ignore|skip|bypass)\b/i;

/**
 * Heuristic contradiction check: if a lower-layer instruction contains negation markers
 * and has significant token overlap with an upper-layer constraint, flag it.
 */
function findContradiction(
  lower: LayeredInstruction,
  upperInstructions: LayeredInstruction[]
): LayeredInstruction | null {
  const lowerTokens = tokenize(lower.instruction);
  const hasNegation = NEGATION_MARKERS.test(lower.instruction);

  for (const upper of upperInstructions) {
    const upperTokens = tokenize(upper.instruction);
    let overlap = 0;
    for (const t of lowerTokens) {
      if (upperTokens.has(t)) overlap += 1;
    }
    const denom = Math.sqrt(lowerTokens.size * upperTokens.size) || 1;
    const score = overlap / denom;

    // Significant semantic overlap + negation language = contradiction
    if (hasNegation && score > 0.15) {
      return upper;
    }
    // Very high overlap alone suggests direct conflict
    if (score > 0.4) {
      return upper;
    }
  }

  return null;
}
