/**
 * Sovereign Reality Graph (SRG) — TypeScript mirror of the unified local schema.
 *
 * Relationships (conceptual):
 *
 *   Memory (memories) ◄────┐
 *        ▲                 │ evidence_json.memory_ids
 *        │                 │
 *   Truth (truth_entries) ─┘  (verified statements cite episodic memory)
 *        │
 *        │ superseded_by_id (truth lineage)
 *        ▼
 *   Truth (newer revision)
 *
 *   DriftEvent ──► subject_id + subject_type → Memory | Truth | doctrine_node
 *        │              narrative describes conceptual movement / contradiction
 *        └── related_gap_id → evolution_gaps (Chrysalis / eval pipeline)
 *
 *   reality_graph_edges — cartography: arbitrary typed nodes (memory, truth,
 *   doctrine_node, srg_decision, drift_event, trace) with weighted relations.
 *
 *   srg_decisions — committed choices; linked_truth_ids_json binds to truth_entries.
 *
 *   doctrine_nodes — Constitution / doctrine text (epistemic layer); edges can
 *   link doctrine → truth (grounds) or memory → doctrine (exemplifies).
 */

export type TruthStatus = 'provisional' | 'verified' | 'superseded' | 'revoked';

export type GraphEntityType =
  | 'memory'
  | 'truth'
  | 'doctrine_node'
  | 'srg_decision'
  | 'drift_event'
  | 'trace'
  | 'evolution_gap';

export type GraphRelation =
  | 'supports'
  | 'contradicts'
  | 'derives_from'
  | 'supersedes'
  | 'exemplifies'
  | 'grounds'
  | 'ripples_to'
  | 'linked';

export type DriftSubjectType = 'memory' | 'truth' | 'doctrine_node';

export interface TruthEvidenceJson {
  memory_ids?: string[];
  trace_ids?: string[];
  notes?: string;
}
