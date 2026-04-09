/**
 * Index of durable SQLite entities for Personal Cognitive Sovereignty (not an ORM).
 * Chat/transient: `traces`, `memories`, `memory_vault` — continuity aids, not governing substrate.
 *
 * Versioned / no silent overwrite: constitution_clauses, epistemic_claims (supersede chain),
 * cognitive_twin_traits, legacy_artifacts, cognitive_governance_audit (append-only audit).
 *
 * Relational links: claim_evidence_links, claim_contradictions, legacy_entity_links,
 * evolution_entity_links, decision_options → decision_ledger, atlas_rg_edges → atlas_rg_nodes.
 */
export const SOVEREIGNTY_STRUCTURED_TABLES = [
  'constitution_clauses',
  'epistemic_claims',
  'epistemic_evidence',
  'claim_evidence_links',
  'claim_contradictions',
  'decision_ledger',
  'decision_options',
  'evolution_timeline_events',
  'evolution_entity_links',
  'cognitive_twin_traits',
  'cognitive_distortion_observations',
  'adversarial_chamber_sessions',
  'unfinished_business_items',
  'simulation_forges',
  'atlas_rg_nodes',
  'atlas_rg_edges',
  'identity_goals',
  'action_protocols',
  'identity_protocol_reviews',
  'self_revision_records',
  'legacy_artifacts',
  'legacy_entity_links',
  'cognitive_governance_audit',
  'trajectory_observatory_snapshots',
  'friction_cartography_items',
  'threshold_protocols',
  'threshold_protocol_activations',
  'mind_map_nodes',
  'mind_map_edges',
  'mind_map_snapshots',
] as const;
