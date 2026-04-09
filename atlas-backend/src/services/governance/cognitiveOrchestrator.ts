/**
 * Command ingress for Personal Cognitive Sovereignty — routes freeform text to structured subsystems.
 * Chat and SSE remain surfaces; this layer decides which durable artifacts may be created or updated.
 */
import type { CognitiveCommandKind } from '../../types/cognitiveSovereignty.js';
import { cognitiveCommandKindSchema } from '../../types/cognitiveSovereignty.js';
import { evaluateConstitutionalAlignment } from './constitutionalCoreService.js';

export interface CognitiveCommand {
  kind: CognitiveCommandKind;
  userId: string;
  rawText: string;
  /** Structured payload per kind (validated at route boundary). */
  payload?: Record<string, unknown>;
  /** For `freeform_query` pre-check against Constitution. */
  recommendationDraft?: string;
}

export interface OrchestratorDispatchResult {
  kind: CognitiveCommandKind;
  /** Subsystems that may mutate state for this command (documentation + future enforcement). */
  writeSubsystems: string[];
  /** Subsystems consulted read-only. */
  readSubsystems: string[];
  /** Immediate structural evaluation (no LLM). */
  alignment?: ReturnType<typeof evaluateConstitutionalAlignment>;
}

const WRITERS: Record<CognitiveCommandKind, string[]> = {
  freeform_query: [],
  constitution_amend: ['constitutional_core'],
  claim_register: ['truth_evidence_ledger'],
  evidence_attach: ['truth_evidence_ledger'],
  decision_open: ['decision_ledger'],
  decision_review: ['decision_ledger'],
  contradiction_register: ['truth_evidence_ledger'],
  legacy_extract: ['legacy_layer'],
  evolution_record: ['evolution_timeline'],
  twin_trait_set: ['cognitive_twin'],
  truth_chamber: ['adversarial_truth_chamber'],
  open_loop_register: ['unfinished_business'],
  simulation_forge: ['simulation_forge'],
  reality_graph_mutate: ['atlas_reality_graph'],
  identity_bridge: ['identity_action_bridge'],
  self_revision_record: ['recursive_self_revision'],
};

const READERS: Record<CognitiveCommandKind, string[]> = {
  freeform_query: [
    'constitutional_core',
    'truth_evidence_ledger',
    'decision_ledger',
    'evolution_timeline',
    'cognitive_twin',
    'unfinished_business',
    'adversarial_truth_chamber',
    'reality_graph',
    'simulation_forge',
    'atlas_reality_graph',
    'identity_action_bridge',
    'recursive_self_revision',
    'legacy_layer',
  ],
  constitution_amend: ['constitutional_core'],
  claim_register: ['truth_evidence_ledger', 'constitutional_core'],
  evidence_attach: ['truth_evidence_ledger'],
  decision_open: ['decision_ledger', 'constitutional_core', 'truth_evidence_ledger'],
  decision_review: ['decision_ledger', 'truth_evidence_ledger'],
  contradiction_register: ['truth_evidence_ledger'],
  legacy_extract: ['decision_ledger', 'truth_evidence_ledger', 'legacy_layer', 'evolution_timeline', 'constitutional_core'],
  evolution_record: ['evolution_timeline', 'decision_ledger', 'constitutional_core'],
  twin_trait_set: ['cognitive_twin', 'truth_evidence_ledger'],
  truth_chamber: [
    'adversarial_truth_chamber',
    'constitutional_core',
    'truth_evidence_ledger',
    'cognitive_twin',
    'decision_ledger',
  ],
  open_loop_register: [
    'unfinished_business',
    'constitutional_core',
    'decision_ledger',
    'evolution_timeline',
  ],
  simulation_forge: [
    'simulation_forge',
    'constitutional_core',
    'truth_evidence_ledger',
    'decision_ledger',
    'cognitive_twin',
    'atlas_reality_graph',
  ],
  reality_graph_mutate: ['atlas_reality_graph', 'decision_ledger', 'unfinished_business', 'constitutional_core'],
  identity_bridge: [
    'identity_action_bridge',
    'constitutional_core',
    'evolution_timeline',
    'unfinished_business',
  ],
  self_revision_record: [
    'recursive_self_revision',
    'cognitive_twin',
    'evolution_timeline',
    'unfinished_business',
  ],
};

/**
 * Plans subsystem involvement. Call after parsing user intent; does not persist.
 * For `freeform_query`, runs alignment pre-check when `recommendationDraft` is provided.
 */
export function dispatchCognitiveCommand(cmd: CognitiveCommand): OrchestratorDispatchResult {
  cognitiveCommandKindSchema.parse(cmd.kind);
  const writeSubsystems = WRITERS[cmd.kind];
  const readSubsystems = READERS[cmd.kind];
  let alignment: ReturnType<typeof evaluateConstitutionalAlignment> | undefined;
  if (cmd.kind === 'freeform_query' && cmd.recommendationDraft?.trim()) {
    alignment = evaluateConstitutionalAlignment({
      userId: cmd.userId,
      recommendationText: cmd.recommendationDraft,
    });
  }
  return { kind: cmd.kind, writeSubsystems, readSubsystems, alignment };
}
