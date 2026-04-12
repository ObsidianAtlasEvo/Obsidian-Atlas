/**
 * policyPrecedence.ts
 * Atlas Phase 3 — Governance Layer
 *
 * Centrally enforced authority hierarchy governing all Atlas system interactions.
 * When any two systems conflict, this is the single source of truth for which wins.
 */

// ---------------------------------------------------------------------------
// Precedence Enum
// ---------------------------------------------------------------------------

export enum PrecedenceLevel {
  CONSTITUTION      = 1, // HIGHEST — immutable identity, truth mandate, never-change rules
  SAFETY_TRUTH      = 2, // Epistemic honesty, uncertainty injection, anti-false-certainty
  EVIDENCE          = 3, // Claim verification, contradiction resolution, source tracking
  USER_EVOLUTION    = 4, // Personalized profile mutations, trait adaptations
  FEATURE_INJECTION = 5, // Feature-flag-driven prompt additions
  STYLE_TONE        = 6, // Tone, vocabulary, format shaping
  DEFAULT           = 7, // LOWEST — base Atlas behavior when no rule applies
}

// ---------------------------------------------------------------------------
// Core Types
// ---------------------------------------------------------------------------

export interface PolicyInstruction {
  id: string;
  level: PrecedenceLevel;
  type: 'append' | 'override' | 'block' | 'require';
  // append   — add to prompt
  // override — replace a lower-level instruction
  // block    — prevent a lower-level instruction from firing
  // require  — mandate that a lower-level instruction exists
  content: string;       // the actual instruction text
  targetField?: string;  // which prompt field this affects
  condition?: string;    // when this instruction fires (freetext description)
  source: string;        // which file/class emitted this
  addedAt: number;
  expiresAt?: number;
}

export interface PolicyLayer {
  level: PrecedenceLevel;
  name: string;
  description: string;
  systemOwner: string;                    // which system manages this layer
  instructions: PolicyInstruction[];
  canBeOverriddenBy: PrecedenceLevel[];   // levels ABOVE this one only
  active: boolean;
}

export interface PolicyConflict {
  id: string;
  higherLevel: PrecedenceLevel;
  lowerLevel: PrecedenceLevel;
  conflictType: 'instruction_clash' | 'field_override' | 'block_applied' | 'requirement_unmet';
  description: string;
  resolution: string;
  resolvedAt: number;
  loggedToEventBus: boolean;
}

export interface ResolvedPolicyStack {
  userId: string;
  resolvedAt: number;
  layers: PolicyLayer[];
  conflicts: PolicyConflict[];
  finalInstructions: PolicyInstruction[];             // ordered, conflict-resolved list
  systemPromptContributions: Record<string, string>;  // layer name -> prompt text contributed
}

export interface ResolutionContext {
  userProfile: unknown;    // UserEvolutionProfile
  activeFlags: string[];   // enabled feature flag names
  evidenceState: unknown;  // current evidence/uncertainty state
  sessionMode: string;     // 'chat' | 'crucible' | 'resonance' | 'journal'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * All PrecedenceLevel values strictly higher (numerically lower) than `level`.
 */
function levelsAbove(level: PrecedenceLevel): PrecedenceLevel[] {
  return Object.values(PrecedenceLevel)
    .filter((v): v is PrecedenceLevel => typeof v === 'number' && (v as number) < level)
    .sort((a, b) => a - b);
}

/**
 * All PrecedenceLevel values strictly lower (numerically higher) than `level`.
 */
function levelsBelow(level: PrecedenceLevel): PrecedenceLevel[] {
  return Object.values(PrecedenceLevel)
    .filter((v): v is PrecedenceLevel => typeof v === 'number' && (v as number) > level)
    .sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// PolicyPrecedenceEngine
// ---------------------------------------------------------------------------

export class PolicyPrecedenceEngine {
  private layers: Map<PrecedenceLevel, PolicyLayer>;

  constructor() {
    this.layers = new Map();
    this.initializeLayers();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Register a policy instruction from any Atlas system.
   * Returns the generated instruction ID.
   */
  register(instruction: Omit<PolicyInstruction, 'id' | 'addedAt'>): string {
    const id = generateId(`pi_${instruction.level}`);
    const full: PolicyInstruction = {
      ...instruction,
      id,
      addedAt: Date.now(),
    };

    const layer = this.layers.get(instruction.level);
    if (!layer) {
      throw new Error(`Unknown precedence level: ${instruction.level}`);
    }
    if (!layer.active) {
      throw new Error(`Layer ${layer.name} is not active — cannot register instructions.`);
    }

    layer.instructions.push(full);
    return id;
  }

  /**
   * Resolve the full stack for a user — produces the final merged instruction set.
   */
  resolve(userId: string, context: ResolutionContext): ResolvedPolicyStack {
    // 1. Prune expired instructions first
    this.pruneExpired();

    const now = Date.now();
    const conflicts: PolicyConflict[] = [];
    const allInstructions: PolicyInstruction[] = [];

    // Collect all active instructions ordered by precedence level (low number = high authority)
    const orderedLevels = [
      PrecedenceLevel.CONSTITUTION,
      PrecedenceLevel.SAFETY_TRUTH,
      PrecedenceLevel.EVIDENCE,
      PrecedenceLevel.USER_EVOLUTION,
      PrecedenceLevel.FEATURE_INJECTION,
      PrecedenceLevel.STYLE_TONE,
      PrecedenceLevel.DEFAULT,
    ];

    for (const level of orderedLevels) {
      const layer = this.layers.get(level)!;
      if (!layer.active) continue;
      for (const inst of layer.instructions) {
        allInstructions.push(inst);
      }
    }

    // 2. Apply conflict resolution rules
    const finalInstructions: PolicyInstruction[] = [];
    const blockedIds = new Set<string>();
    const overriddenIds = new Set<string>();

    // Pass 1 — identify BLOCKs and OVERRIDEs from higher levels
    for (const inst of allInstructions) {
      if (inst.type === 'block') {
        // A BLOCK at level N removes all APPEND/OVERRIDE instructions at levels N+1 through 7
        // for the same targetField.
        const below = levelsBelow(inst.level);
        for (const candidate of allInstructions) {
          if (
            below.includes(candidate.level) &&
            (candidate.type === 'append' || candidate.type === 'override') &&
            inst.targetField &&
            candidate.targetField === inst.targetField
          ) {
            blockedIds.add(candidate.id);
            const conflict: PolicyConflict = {
              id: generateId('conflict'),
              higherLevel: inst.level,
              lowerLevel: candidate.level,
              conflictType: 'block_applied',
              description: `BLOCK at ${PrecedenceLevel[inst.level]} (source: ${inst.source}) blocked instruction ${candidate.id} at ${PrecedenceLevel[candidate.level]} targeting field '${inst.targetField}'.`,
              resolution: `Instruction ${candidate.id} removed from final set.`,
              resolvedAt: now,
              loggedToEventBus: false,
            };
            conflicts.push(conflict);
            this.logConflict(conflict);
          }
        }
      }

      if (inst.type === 'override') {
        // OVERRIDE at level N replaces the first conflicting instruction found at any level N+1 through 7
        const below = levelsBelow(inst.level);
        for (const candidate of allInstructions) {
          if (
            below.includes(candidate.level) &&
            !overriddenIds.has(candidate.id) &&
            inst.targetField &&
            candidate.targetField === inst.targetField
          ) {
            overriddenIds.add(candidate.id);
            const conflict: PolicyConflict = {
              id: generateId('conflict'),
              higherLevel: inst.level,
              lowerLevel: candidate.level,
              conflictType: 'field_override',
              description: `OVERRIDE at ${PrecedenceLevel[inst.level]} (source: ${inst.source}) replaced instruction ${candidate.id} at ${PrecedenceLevel[candidate.level]} for field '${inst.targetField}'.`,
              resolution: `Instruction ${candidate.id} suppressed; higher-level override takes its place.`,
              resolvedAt: now,
              loggedToEventBus: false,
            };
            conflicts.push(conflict);
            this.logConflict(conflict);
            break; // only first conflicting instruction
          }
        }
      }
    }

    // Pass 2 — validate REQUIRE instructions
    for (const inst of allInstructions) {
      if (inst.type === 'require') {
        const below = levelsBelow(inst.level);
        const found = allInstructions.some(
          (candidate) =>
            below.includes(candidate.level) &&
            inst.targetField &&
            candidate.targetField === inst.targetField &&
            !blockedIds.has(candidate.id) &&
            !overriddenIds.has(candidate.id)
        );
        if (!found) {
          const conflict: PolicyConflict = {
            id: generateId('conflict'),
            higherLevel: inst.level,
            lowerLevel: PrecedenceLevel.DEFAULT,
            conflictType: 'requirement_unmet',
            description: `REQUIRE at ${PrecedenceLevel[inst.level]} (source: ${inst.source}) mandates an instruction for field '${inst.targetField}' at a lower level, but none exists.`,
            resolution: 'Conflict event emitted. No instruction injected — the requirement failure is logged for sovereign review.',
            resolvedAt: now,
            loggedToEventBus: false,
          };
          conflicts.push(conflict);
          this.logConflict(conflict);
          console.error(
            `[PolicyPrecedenceEngine] REQUIRE UNMET — level ${PrecedenceLevel[inst.level]}, field '${inst.targetField}', source: ${inst.source}`
          );
        }
      }
    }

    // Pass 3 — build final instruction list (exclude blocked/overridden, preserve registration order within level)
    for (const inst of allInstructions) {
      if (blockedIds.has(inst.id) || overriddenIds.has(inst.id)) continue;
      // Check wouldBeBlocked (live check)
      const blockCheck = this.wouldBeBlocked(inst);
      if (blockCheck.blocked) continue;
      finalInstructions.push(inst);
    }

    // 4. Build systemPromptContributions per layer
    const systemPromptContributions: Record<string, string> = {};
    for (const level of orderedLevels) {
      const layer = this.layers.get(level)!;
      const layerInstructions = finalInstructions.filter((i) => i.level === level);
      if (layerInstructions.length > 0) {
        systemPromptContributions[layer.name] = layerInstructions
          .map((i) => i.content)
          .join('\n');
      }
    }

    return {
      userId,
      resolvedAt: now,
      layers: Array.from(this.layers.values()),
      conflicts,
      finalInstructions,
      systemPromptContributions,
    };
  }

  /**
   * Check if an instruction at a given level would be blocked by a higher-level BLOCK.
   */
  wouldBeBlocked(
    instruction: PolicyInstruction
  ): { blocked: boolean; blockedBy?: PolicyInstruction } {
    const above = levelsAbove(instruction.level);
    for (const level of above) {
      const layer = this.layers.get(level);
      if (!layer) continue;
      for (const candidate of layer.instructions) {
        if (
          candidate.type === 'block' &&
          candidate.targetField &&
          instruction.targetField === candidate.targetField &&
          (instruction.type === 'append' || instruction.type === 'override')
        ) {
          return { blocked: true, blockedBy: candidate };
        }
      }
    }
    return { blocked: false };
  }

  /**
   * Build the final ordered system prompt from the resolved stack.
   * Sections are separated by a blank line; higher-authority layers come first.
   */
  buildOrderedSystemPrompt(stack: ResolvedPolicyStack): string {
    const orderedLevels = [
      PrecedenceLevel.CONSTITUTION,
      PrecedenceLevel.SAFETY_TRUTH,
      PrecedenceLevel.EVIDENCE,
      PrecedenceLevel.USER_EVOLUTION,
      PrecedenceLevel.FEATURE_INJECTION,
      PrecedenceLevel.STYLE_TONE,
      PrecedenceLevel.DEFAULT,
    ];

    const sections: string[] = [];
    for (const level of orderedLevels) {
      const layer = this.layers.get(level)!;
      const contribution = stack.systemPromptContributions[layer.name];
      if (contribution && contribution.trim().length > 0) {
        sections.push(`### [${layer.name}]\n${contribution.trim()}`);
      }
    }

    return sections.join('\n\n');
  }

  /**
   * Get all active instructions at a specific level.
   */
  getLayer(level: PrecedenceLevel): PolicyLayer {
    const layer = this.layers.get(level);
    if (!layer) throw new Error(`No layer registered for level ${level}`);
    return { ...layer, instructions: [...layer.instructions] };
  }

  /**
   * Clear expired instructions across all layers.
   * Returns the number of instructions pruned.
   */
  pruneExpired(): number {
    const now = Date.now();
    let pruned = 0;
    for (const layer of this.layers.values()) {
      const before = layer.instructions.length;
      layer.instructions = layer.instructions.filter(
        (i) => i.expiresAt === undefined || i.expiresAt > now
      );
      pruned += before - layer.instructions.length;
    }
    if (pruned > 0) {
      console.log(`[PolicyPrecedenceEngine] Pruned ${pruned} expired instructions.`);
    }
    return pruned;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  /**
   * Emit a conflict record to the event bus (stubbed as console.warn in Phase 3;
   * replace with real EventBus.emit() once the bus is wired).
   */
  private logConflict(conflict: PolicyConflict): void {
    // Mark as logged
    conflict.loggedToEventBus = true;
    console.warn(
      `[PolicyPrecedenceEngine] CONFLICT [${conflict.conflictType}] — ` +
        `${PrecedenceLevel[conflict.higherLevel]} > ${PrecedenceLevel[conflict.lowerLevel]}: ` +
        `${conflict.description} | Resolution: ${conflict.resolution}`
    );
    // TODO: EventBus.emit('policy:conflict', conflict);
  }

  /**
   * Seed all 7 canonical policy layers with their descriptions, owners, and
   * an empty instruction list. canBeOverriddenBy is populated with all levels
   * numerically smaller (i.e., higher authority).
   */
  private initializeLayers(): void {
    const definitions: Array<{
      level: PrecedenceLevel;
      name: string;
      description: string;
      systemOwner: string;
    }> = [
      {
        level: PrecedenceLevel.CONSTITUTION,
        name: 'Constitution',
        description:
          'Immutable identity boundaries. No system may override these. Atlas is Atlas regardless of who is asking.',
        systemOwner: 'MutationConstitution',
      },
      {
        level: PrecedenceLevel.SAFETY_TRUTH,
        name: 'SafetyTruth',
        description:
          'Epistemic integrity. Atlas acknowledges what it doesn\'t know. False certainty is never permitted.',
        systemOwner: 'EvidenceArbitrator + UncertaintyTracker',
      },
      {
        level: PrecedenceLevel.EVIDENCE,
        name: 'Evidence',
        description:
          'Claim verification and contradiction resolution. When sources conflict, this layer arbitrates.',
        systemOwner: 'EvidenceArbitrator',
      },
      {
        level: PrecedenceLevel.USER_EVOLUTION,
        name: 'UserEvolution',
        description:
          'Per-user behavioral adaptation. Personalization that has passed constitutional validation.',
        systemOwner: 'EvolutionEngine + MutationConstitution',
      },
      {
        level: PrecedenceLevel.FEATURE_INJECTION,
        name: 'FeatureInjection',
        description: 'Feature-flag-controlled prompt additions. Experimental or toggled capabilities.',
        systemOwner: 'FeatureFlags',
      },
      {
        level: PrecedenceLevel.STYLE_TONE,
        name: 'StyleTone',
        description:
          'Voice, vocabulary, format, tone calibration. The aesthetic surface of Atlas for this user.',
        systemOwner: 'EvolutionMutator',
      },
      {
        level: PrecedenceLevel.DEFAULT,
        name: 'Default',
        description: 'Base Atlas behavior. Foundation that all other layers modify.',
        systemOwner: 'atlasPrompt.ts',
      },
    ];

    for (const def of definitions) {
      const layer: PolicyLayer = {
        level: def.level,
        name: def.name,
        description: def.description,
        systemOwner: def.systemOwner,
        instructions: [],
        canBeOverriddenBy: levelsAbove(def.level),
        active: true,
      };
      this.layers.set(def.level, layer);
    }
  }
}

let _policyPrecedenceEngine: PolicyPrecedenceEngine | null = null;

export function getPolicyPrecedenceEngine(): PolicyPrecedenceEngine {
  if (!_policyPrecedenceEngine) {
    _policyPrecedenceEngine = new PolicyPrecedenceEngine();
  }
  return _policyPrecedenceEngine;
}
