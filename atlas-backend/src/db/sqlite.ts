// Atlas-Audit: [VIII] Verified
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  detail TEXT NOT NULL,
  confidence REAL NOT NULL,
  source_trace_id TEXT NOT NULL,
  tags TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'inferred',
  archived_at TEXT,
  replaces_memory_id TEXT,
  FOREIGN KEY (replaces_memory_id) REFERENCES memories(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_user_time ON memories(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_user_kind ON memories(user_id, kind, created_at DESC);
-- idx_memories_user_active (archived_at) created in migrateSectionVIIIContinuity for legacy DBs

CREATE TABLE IF NOT EXISTS policy_profiles (
  user_id TEXT PRIMARY KEY NOT NULL,
  verbosity TEXT NOT NULL,
  tone TEXT NOT NULL,
  structure_preference TEXT NOT NULL,
  truth_first_strictness REAL NOT NULL,
  writing_style_enabled INTEGER NOT NULL,
  preferred_compute_depth TEXT NOT NULL DEFAULT 'Light',
  latency_tolerance TEXT NOT NULL DEFAULT 'Low',
  tavily_api_key TEXT,
  deep_research_daily_count INTEGER NOT NULL DEFAULT 0,
  deep_research_quota_date_utc TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS traces (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  user_message TEXT NOT NULL,
  assistant_response TEXT NOT NULL,
  response_score REAL NOT NULL,
  memory_candidates INTEGER NOT NULL,
  dataset_approved INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'conversation',
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_traces_user_time ON traces(user_id, created_at DESC);
-- idx_traces_user_active: see migrateSectionVIIIContinuity

CREATE TABLE IF NOT EXISTS evolution_gaps (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  trace_id TEXT,
  reason TEXT NOT NULL,
  eval_snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evolution_gaps_user_time ON evolution_gaps(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS autonomy_log (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  decision_json TEXT,
  status TEXT NOT NULL DEFAULT 'info'
);
CREATE INDEX IF NOT EXISTS idx_autonomy_log_user_time ON autonomy_log(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Sovereign Reality Graph (SRG): unified data + epistemic + cartography
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS truth_entries (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  statement TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence REAL NOT NULL,
  evidence_json TEXT NOT NULL,
  superseded_by_id TEXT,
  constitution_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (superseded_by_id) REFERENCES truth_entries(id)
);
CREATE INDEX IF NOT EXISTS idx_truth_user_time ON truth_entries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_truth_user_status ON truth_entries(user_id, status);

CREATE TABLE IF NOT EXISTS doctrine_nodes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  layer TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  immutable INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'user',
  version_group_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_doctrine_id TEXT,
  archived_at TEXT,
  FOREIGN KEY (supersedes_doctrine_id) REFERENCES doctrine_nodes(id) ON DELETE SET NULL,
  UNIQUE(user_id, version_group_id, version)
);
CREATE INDEX IF NOT EXISTS idx_doctrine_user_layer ON doctrine_nodes(user_id, layer, priority DESC);
-- idx_doctrine_user_version + idx_doctrine_user_active: see migrateSectionVIIIContinuity (version_group_id / archived_at on legacy DBs)

CREATE TABLE IF NOT EXISTS srg_decisions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  status TEXT NOT NULL,
  linked_truth_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_srg_decisions_user_time ON srg_decisions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS drift_events (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  prior_state_json TEXT,
  new_state_json TEXT,
  magnitude REAL NOT NULL,
  narrative TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  resolved_at TEXT,
  related_trace_id TEXT,
  related_gap_id TEXT,
  FOREIGN KEY (related_gap_id) REFERENCES evolution_gaps(id)
);
CREATE INDEX IF NOT EXISTS idx_drift_user_time ON drift_events(user_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_drift_subject ON drift_events(user_id, subject_type, subject_id);

CREATE TABLE IF NOT EXISTS reality_graph_edges (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  src_type TEXT NOT NULL,
  src_id TEXT NOT NULL,
  dst_type TEXT NOT NULL,
  dst_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  meta_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rge_user_src ON reality_graph_edges(user_id, src_type, src_id);
CREATE INDEX IF NOT EXISTS idx_rge_user_dst ON reality_graph_edges(user_id, dst_type, dst_id);

CREATE TABLE IF NOT EXISTS governance_settings (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

-- Multi-tenant SaaS: tenant registry (ids must match auth provider sub claim / internal UUID)
CREATE TABLE IF NOT EXISTS tenant_users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL,
  plan_tier TEXT NOT NULL DEFAULT 'free'
);

-- Per-user / per-day GPU & chat consumption (UTC date)
CREATE TABLE IF NOT EXISTS user_quota_daily (
  user_id TEXT NOT NULL,
  date_utc TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  chat_requests INTEGER NOT NULL DEFAULT 0,
  embed_requests INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date_utc)
);
CREATE INDEX IF NOT EXISTS idx_user_quota_daily_user ON user_quota_daily(user_id);

-- ---------------------------------------------------------------------------
-- Multi-Layer Memory Vault (local-only embeddings + retrieval)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memory_vault (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('EPISODIC', 'TRUTH', 'DIRECTIVE', 'PROJECT')),
  embedding_json TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  archived_at TEXT,
  origin TEXT NOT NULL DEFAULT 'inferred'
);
CREATE INDEX IF NOT EXISTS idx_memory_vault_user_time ON memory_vault(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_vault_user_type_time ON memory_vault(user_id, type, created_at DESC);
-- idx_memory_vault_user_active: see migrateSectionVIIIContinuity
`;

/** Personal Cognitive Sovereignty: Constitution, epistemic ledger, decision ledger (v1). */
const SOVEREIGNTY_LAYER_V1 = `
CREATE TABLE IF NOT EXISTS constitution_clauses (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  version_group_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_clause_id TEXT,
  clause_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  protected INTEGER NOT NULL DEFAULT 0,
  effective_from TEXT NOT NULL,
  created_at TEXT NOT NULL,
  archived_at TEXT,
  FOREIGN KEY (supersedes_clause_id) REFERENCES constitution_clauses(id),
  UNIQUE(user_id, version_group_id, version)
);
-- idx_constitution_user_active: see migrateArchivedAtIndexes
CREATE INDEX IF NOT EXISTS idx_constitution_user_priority ON constitution_clauses(user_id, priority DESC);

CREATE TABLE IF NOT EXISTS epistemic_claims (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  statement TEXT NOT NULL,
  claim_type TEXT NOT NULL,
  epistemic_state TEXT NOT NULL,
  confidence REAL NOT NULL,
  provenance TEXT NOT NULL,
  constitution_clause_id TEXT,
  superseded_by_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (constitution_clause_id) REFERENCES constitution_clauses(id),
  FOREIGN KEY (superseded_by_id) REFERENCES epistemic_claims(id)
);
CREATE INDEX IF NOT EXISTS idx_epistemic_claims_user_state ON epistemic_claims(user_id, epistemic_state);
CREATE INDEX IF NOT EXISTS idx_epistemic_claims_user_time ON epistemic_claims(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS epistemic_evidence (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  source_class TEXT NOT NULL,
  source_ref TEXT,
  excerpt TEXT NOT NULL,
  retrieved_at TEXT,
  support_strength REAL NOT NULL DEFAULT 0.5,
  verified_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_epistemic_evidence_user ON epistemic_evidence(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS claim_evidence_links (
  id TEXT PRIMARY KEY NOT NULL,
  claim_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  link_role TEXT NOT NULL,
  strength REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL,
  FOREIGN KEY (claim_id) REFERENCES epistemic_claims(id) ON DELETE CASCADE,
  FOREIGN KEY (evidence_id) REFERENCES epistemic_evidence(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_claim ON claim_evidence_links(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_evidence ON claim_evidence_links(evidence_id);

CREATE TABLE IF NOT EXISTS claim_contradictions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  claim_a_id TEXT NOT NULL,
  claim_b_id TEXT NOT NULL,
  contradiction_strength REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'open',
  resolution_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (claim_a_id) REFERENCES epistemic_claims(id),
  FOREIGN KEY (claim_b_id) REFERENCES epistemic_claims(id)
);
CREATE INDEX IF NOT EXISTS idx_contradiction_user ON claim_contradictions(user_id, status);

CREATE TABLE IF NOT EXISTS decision_ledger (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  statement TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  user_preference_snapshot TEXT,
  atlas_recommendation TEXT,
  risks_json TEXT NOT NULL DEFAULT '[]',
  tradeoffs_json TEXT NOT NULL DEFAULT '[]',
  expected_upside TEXT,
  predicted_downside TEXT,
  actual_outcome TEXT,
  variance_analysis TEXT,
  lesson_extracted TEXT,
  recurring_pattern_note TEXT,
  review_checkpoint_at TEXT,
  review_status TEXT,
  constitution_clause_ids_json TEXT NOT NULL DEFAULT '[]',
  linked_claim_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decision_ledger_user_time ON decision_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_ledger_user_status ON decision_ledger(user_id, status);

CREATE TABLE IF NOT EXISTS decision_options (
  id TEXT PRIMARY KEY NOT NULL,
  decision_id TEXT NOT NULL,
  label TEXT NOT NULL,
  rationale TEXT NOT NULL DEFAULT '',
  rejected INTEGER NOT NULL DEFAULT 0,
  chosen INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (decision_id) REFERENCES decision_ledger(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_decision_options_decision ON decision_options(decision_id, sort_order);

CREATE TABLE IF NOT EXISTS cognitive_governance_audit (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'user',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cog_audit_user_time ON cognitive_governance_audit(user_id, created_at DESC);
`;

/** Evolution Timeline, Cognitive Twin, Truth Chamber, Unfinished Business. */
const SOVEREIGNTY_LAYER_V2 = `
CREATE TABLE IF NOT EXISTS evolution_timeline_events (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  significance REAL NOT NULL DEFAULT 0.5,
  evidence_refs_json TEXT NOT NULL DEFAULT '[]',
  pattern_fingerprint TEXT,
  user_declared INTEGER NOT NULL DEFAULT 0,
  narrated_self_image_risk REAL,
  genuine_improvement_score REAL,
  related_domain TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evolution_user_time ON evolution_timeline_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evolution_user_type ON evolution_timeline_events(user_id, event_type);
CREATE INDEX IF NOT EXISTS idx_evolution_fingerprint ON evolution_timeline_events(user_id, pattern_fingerprint);

CREATE TABLE IF NOT EXISTS evolution_entity_links (
  id TEXT PRIMARY KEY NOT NULL,
  evolution_event_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  link_role TEXT NOT NULL DEFAULT 'context',
  created_at TEXT NOT NULL,
  FOREIGN KEY (evolution_event_id) REFERENCES evolution_timeline_events(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_evolution_link_event ON evolution_entity_links(evolution_event_id);
CREATE INDEX IF NOT EXISTS idx_evolution_link_entity ON evolution_entity_links(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS cognitive_twin_traits (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  trait_key TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence REAL NOT NULL,
  version_group_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_trait_id TEXT,
  created_at TEXT NOT NULL,
  archived_at TEXT,
  FOREIGN KEY (supersedes_trait_id) REFERENCES cognitive_twin_traits(id),
  UNIQUE(user_id, version_group_id, version)
);
-- idx_twin_user_domain: see migrateArchivedAtIndexes

CREATE TABLE IF NOT EXISTS adversarial_chamber_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  target_text TEXT NOT NULL,
  target_claim_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  structured_output_json TEXT,
  constitution_clause_ids_json TEXT NOT NULL DEFAULT '[]',
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  decision_ids_json TEXT NOT NULL DEFAULT '[]',
  twin_snapshot_json TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_chamber_user_time ON adversarial_chamber_sessions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS unfinished_business_items (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  significance_score REAL NOT NULL DEFAULT 0.5,
  recurrence_score REAL NOT NULL DEFAULT 0,
  urgency_score REAL NOT NULL DEFAULT 0.5,
  identity_relevance_score REAL NOT NULL DEFAULT 0.5,
  composite_score REAL NOT NULL DEFAULT 0,
  surfaced_count INTEGER NOT NULL DEFAULT 0,
  last_surfaced_at TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  decision_id TEXT,
  constitution_version_group_id TEXT,
  linked_claim_ids_json TEXT NOT NULL DEFAULT '[]',
  pattern_fingerprint TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution_note TEXT,
  FOREIGN KEY (decision_id) REFERENCES decision_ledger(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_unfinished_user_open ON unfinished_business_items(user_id, status, composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_unfinished_fingerprint ON unfinished_business_items(user_id, pattern_fingerprint);
`;

/** Simulation Forge, Atlas Reality Graph (typed nodes), Identity→Action, Self-Revision. */
const SOVEREIGNTY_LAYER_V3 = `
CREATE TABLE IF NOT EXISTS simulation_forges (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  situation_summary TEXT NOT NULL,
  domain_tags_json TEXT NOT NULL DEFAULT '[]',
  scenario_decomposition_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  context_bundle_json TEXT,
  pathways_json TEXT NOT NULL DEFAULT '[]',
  actionable_review_json TEXT,
  linked_decision_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sim_forge_user_time ON simulation_forges(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS atlas_rg_nodes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  ledger_ref_type TEXT,
  ledger_ref_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_atlas_rg_nodes_user_kind ON atlas_rg_nodes(user_id, kind);
CREATE INDEX IF NOT EXISTS idx_atlas_rg_nodes_ledger ON atlas_rg_nodes(user_id, ledger_ref_type, ledger_ref_id);

CREATE TABLE IF NOT EXISTS atlas_rg_edges (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  src_node_id TEXT NOT NULL,
  dst_node_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  rationale TEXT NOT NULL DEFAULT '',
  meta_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (src_node_id) REFERENCES atlas_rg_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (dst_node_id) REFERENCES atlas_rg_nodes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_atlas_rg_edges_src ON atlas_rg_edges(user_id, src_node_id);
CREATE INDEX IF NOT EXISTS idx_atlas_rg_edges_dst ON atlas_rg_edges(user_id, dst_node_id);
CREATE INDEX IF NOT EXISTS idx_atlas_rg_edges_rel ON atlas_rg_edges(user_id, relation);

CREATE TABLE IF NOT EXISTS identity_goals (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  aspiration_statement TEXT NOT NULL,
  trait_archetype TEXT NOT NULL,
  operational_definition TEXT NOT NULL DEFAULT '',
  symbolic_vs_enacted_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  linked_constitution_clause_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_identity_goals_user ON identity_goals(user_id, status);

CREATE TABLE IF NOT EXISTS action_protocols (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  identity_goal_id TEXT NOT NULL,
  title TEXT NOT NULL,
  observable_behaviors_json TEXT NOT NULL DEFAULT '[]',
  measurable_indicators_json TEXT NOT NULL DEFAULT '[]',
  environmental_supports_json TEXT NOT NULL DEFAULT '[]',
  failure_points_json TEXT NOT NULL DEFAULT '[]',
  review_cadence TEXT NOT NULL DEFAULT '',
  maintenance_routines_json TEXT NOT NULL DEFAULT '[]',
  corrective_protocols_json TEXT NOT NULL DEFAULT '[]',
  linked_decision_ids_json TEXT NOT NULL DEFAULT '[]',
  linked_evolution_event_ids_json TEXT NOT NULL DEFAULT '[]',
  linked_unfinished_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (identity_goal_id) REFERENCES identity_goals(id) ON DELETE CASCADE,
  FOREIGN KEY (linked_unfinished_id) REFERENCES unfinished_business_items(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_action_protocols_goal ON action_protocols(identity_goal_id);

CREATE TABLE IF NOT EXISTS identity_protocol_reviews (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  protocol_id TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  behavioral_evidence TEXT NOT NULL DEFAULT '',
  gap_analysis TEXT NOT NULL DEFAULT '',
  next_adjustments TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (protocol_id) REFERENCES action_protocols(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_id_protocol_reviews_protocol ON identity_protocol_reviews(protocol_id);

CREATE TABLE IF NOT EXISTS self_revision_records (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  detected_pattern TEXT NOT NULL,
  recommendation_title TEXT NOT NULL,
  recommendation_body TEXT NOT NULL,
  better_structures_json TEXT NOT NULL DEFAULT '[]',
  trigger_sources_json TEXT NOT NULL DEFAULT '[]',
  linked_twin_domains_json TEXT NOT NULL DEFAULT '[]',
  linked_evolution_fingerprints_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  superseded_by_id TEXT,
  FOREIGN KEY (superseded_by_id) REFERENCES self_revision_records(id)
);
CREATE INDEX IF NOT EXISTS idx_self_revision_user_status ON self_revision_records(user_id, status, created_at DESC);
`;

/** Legacy durable doctrine + optional distortion observations (first-class, versioned legacy). */
const SOVEREIGNTY_LAYER_V4 = `
CREATE TABLE IF NOT EXISTS legacy_artifacts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  artifact_kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  durability_score REAL NOT NULL DEFAULT 0.5,
  fleeting_vs_principle_note TEXT NOT NULL DEFAULT '',
  provenance TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  version_group_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id TEXT,
  extraction_trigger TEXT NOT NULL DEFAULT 'manual',
  extraction_context_json TEXT,
  pattern_fingerprint TEXT,
  review_cadence_hint TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  FOREIGN KEY (supersedes_id) REFERENCES legacy_artifacts(id),
  UNIQUE(user_id, version_group_id, version)
);
CREATE INDEX IF NOT EXISTS idx_legacy_user_status ON legacy_artifacts(user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_legacy_user_kind ON legacy_artifacts(user_id, artifact_kind);
CREATE INDEX IF NOT EXISTS idx_legacy_fingerprint ON legacy_artifacts(user_id, pattern_fingerprint);

CREATE TABLE IF NOT EXISTS legacy_entity_links (
  id TEXT PRIMARY KEY NOT NULL,
  legacy_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  link_role TEXT NOT NULL DEFAULT 'supports',
  created_at TEXT NOT NULL,
  FOREIGN KEY (legacy_id) REFERENCES legacy_artifacts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_legacy_link_legacy ON legacy_entity_links(legacy_id);
CREATE INDEX IF NOT EXISTS idx_legacy_link_entity ON legacy_entity_links(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS cognitive_distortion_observations (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  pattern_label TEXT NOT NULL,
  description TEXT NOT NULL,
  provenance TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  source_chamber_session_id TEXT,
  linked_claim_id TEXT,
  created_at TEXT NOT NULL,
  archived_at TEXT,
  FOREIGN KEY (source_chamber_session_id) REFERENCES adversarial_chamber_sessions(id) ON DELETE SET NULL
);
-- idx_distortion_user: see migrateArchivedAtIndexes
`;

/** Trajectory Observatory, Friction Cartography, Threshold Protocol Forge. */
const SOVEREIGNTY_LAYER_V5 = `
CREATE TABLE IF NOT EXISTS trajectory_observatory_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  horizon TEXT NOT NULL DEFAULT 'medium',
  overall_classification TEXT NOT NULL,
  confidence REAL NOT NULL,
  summary_text TEXT NOT NULL,
  domains_json TEXT NOT NULL,
  contributing_factors_json TEXT NOT NULL,
  drift_warnings_json TEXT NOT NULL,
  projections_json TEXT NOT NULL,
  correction_leverage_json TEXT NOT NULL,
  explanation_text TEXT NOT NULL,
  signal_bundle_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_traj_obs_user_time ON trajectory_observatory_snapshots(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS friction_cartography_items (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  friction_type TEXT NOT NULL,
  severity REAL NOT NULL,
  recurrence_score REAL NOT NULL DEFAULT 0,
  identity_relevance REAL NOT NULL DEFAULT 0.5,
  constitutional_relevance REAL NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  root_hypothesis TEXT NOT NULL DEFAULT '',
  surface_vs_root_note TEXT NOT NULL DEFAULT '',
  cluster_key TEXT,
  linked_unfinished_id TEXT,
  linked_decision_id TEXT,
  reinforcing_item_ids_json TEXT NOT NULL DEFAULT '[]',
  smallest_release_hint TEXT NOT NULL DEFAULT '',
  recommendations_json TEXT NOT NULL DEFAULT '[]',
  auto_generated INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (linked_unfinished_id) REFERENCES unfinished_business_items(id) ON DELETE SET NULL,
  FOREIGN KEY (linked_decision_id) REFERENCES decision_ledger(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_friction_user ON friction_cartography_items(user_id, status, severity DESC);

CREATE TABLE IF NOT EXISTS threshold_protocols (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  state_description TEXT NOT NULL,
  trigger_types_json TEXT NOT NULL DEFAULT '[]',
  warning_signs_json TEXT NOT NULL DEFAULT '[]',
  unreliable_in_state TEXT NOT NULL DEFAULT '',
  immediate_steps_json TEXT NOT NULL DEFAULT '[]',
  do_not_trust_json TEXT NOT NULL DEFAULT '[]',
  standards_apply_note TEXT NOT NULL DEFAULT '',
  approved_actions_json TEXT NOT NULL DEFAULT '[]',
  forbidden_actions_json TEXT NOT NULL DEFAULT '[]',
  recovery_steps_json TEXT NOT NULL DEFAULT '[]',
  reflection_prompts_json TEXT NOT NULL DEFAULT '[]',
  consult_note TEXT NOT NULL DEFAULT '',
  linked_constitution_clause_ids_json TEXT NOT NULL DEFAULT '[]',
  linked_legacy_ids_json TEXT NOT NULL DEFAULT '[]',
  linked_unfinished_ids_json TEXT NOT NULL DEFAULT '[]',
  version_group_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  FOREIGN KEY (supersedes_id) REFERENCES threshold_protocols(id),
  UNIQUE(user_id, version_group_id, version)
);
-- idx_threshold_proto_user: see migrateArchivedAtIndexes

CREATE TABLE IF NOT EXISTS threshold_protocol_activations (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  protocol_id TEXT NOT NULL,
  context_note TEXT NOT NULL DEFAULT '',
  recovery_review_text TEXT,
  activated_at TEXT NOT NULL,
  closed_at TEXT,
  FOREIGN KEY (protocol_id) REFERENCES threshold_protocols(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_threshold_act_user ON threshold_protocol_activations(user_id, activated_at DESC);
`;

/** User Mind Map — living cognitive cartography (nodes, edges, temporal snapshots). */
const SOVEREIGNTY_LAYER_V6 = `
CREATE TABLE IF NOT EXISTS mind_map_nodes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  node_kind TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  source_type TEXT NOT NULL DEFAULT 'seed',
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0.55,
  importance REAL NOT NULL DEFAULT 0.5,
  recurrence_score REAL NOT NULL DEFAULT 0,
  emotional_weight REAL,
  volatility REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  visibility TEXT NOT NULL DEFAULT 'normal',
  archived INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  user_confirmed INTEGER,
  layout_x REAL NOT NULL DEFAULT 0,
  layout_y REAL NOT NULL DEFAULT 0,
  layout_ring REAL NOT NULL DEFAULT 0,
  cluster_key TEXT,
  explainability_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_reinforced_at TEXT,
  last_challenged_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_mm_nodes_user ON mind_map_nodes(user_id, archived);
CREATE INDEX IF NOT EXISTS idx_mm_nodes_user_kind ON mind_map_nodes(user_id, node_kind, archived);
CREATE INDEX IF NOT EXISTS idx_mm_nodes_cluster ON mind_map_nodes(user_id, cluster_key, archived);

CREATE TABLE IF NOT EXISTS mind_map_edges (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  edge_type TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 0.5,
  confidence REAL NOT NULL DEFAULT 0.5,
  directional INTEGER NOT NULL DEFAULT 1,
  symmetric INTEGER NOT NULL DEFAULT 0,
  justification TEXT,
  explainability_json TEXT NOT NULL DEFAULT '{}',
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES mind_map_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES mind_map_nodes(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mm_edge_triple_active ON mind_map_edges(user_id, source_id, target_id, edge_type) WHERE archived = 0;

CREATE TABLE IF NOT EXISTS mind_map_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  nodes_json TEXT NOT NULL,
  edges_json TEXT NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mm_snap_user ON mind_map_snapshots(user_id, created_at DESC);
`;

/** Sovereign Console: gaps, change control, audit, emergency, diagnostics (browser → backend, no Firestore). */
const SOVEREIGNTY_LAYER_V7_GOVERNANCE_CONSOLE = `
CREATE TABLE IF NOT EXISTS governance_gaps (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'identified',
  type TEXT NOT NULL DEFAULT 'structural_gap',
  notes TEXT,
  detected_at TEXT NOT NULL,
  repaired_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_governance_gaps_user ON governance_gaps(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS governance_changes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  impact TEXT,
  class INTEGER NOT NULL DEFAULT 2,
  proposed_by TEXT,
  approved_by TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_governance_changes_user ON governance_changes(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS governance_audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  type TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  details_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_governance_audit_user ON governance_audit_logs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS governance_emergency_state (
  user_id TEXT PRIMARY KEY NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  activated_at TEXT,
  reason TEXT,
  lifted_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diagnostics_reports (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_diagnostics_session ON diagnostics_reports(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostics_user ON diagnostics_reports(user_id, created_at DESC);
`;

let _db: Database.Database | null = null;

/**
 * Open SQLite at `env.sqlitePath`, create parent dirs, apply schema. Idempotent.
 */
export function initSqlite(): Database.Database {
  if (_db) return _db;

  const file = env.sqlitePath;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const database = new Database(file);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.exec(SCHEMA);
  database.exec(SOVEREIGNTY_LAYER_V1);
  database.exec(SOVEREIGNTY_LAYER_V2);
  database.exec(SOVEREIGNTY_LAYER_V3);
  database.exec(SOVEREIGNTY_LAYER_V4);
  database.exec(SOVEREIGNTY_LAYER_V5);
  database.exec(SOVEREIGNTY_LAYER_V6);
  database.exec(SOVEREIGNTY_LAYER_V7_GOVERNANCE_CONSOLE);
  migratePolicyProfileColumns(database);
  migrateSectionVIIIContinuity(database);
  migrateArchivedAtIndexes(database);
  _db = database;
  return _db;
}

/** Add Chrysalis telemetry columns on existing DBs (idempotent). */
function migratePolicyProfileColumns(database: Database.Database): void {
  const cols = database.prepare(`PRAGMA table_info(policy_profiles)`).all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('preferred_compute_depth')) {
    database.exec(
      `ALTER TABLE policy_profiles ADD COLUMN preferred_compute_depth TEXT NOT NULL DEFAULT 'Light'`
    );
  }
  if (!names.has('latency_tolerance')) {
    database.exec(
      `ALTER TABLE policy_profiles ADD COLUMN latency_tolerance TEXT NOT NULL DEFAULT 'Low'`
    );
  }
  if (!names.has('tavily_api_key')) {
    database.exec(`ALTER TABLE policy_profiles ADD COLUMN tavily_api_key TEXT`);
  }
  if (!names.has('deep_research_daily_count')) {
    database.exec(
      `ALTER TABLE policy_profiles ADD COLUMN deep_research_daily_count INTEGER NOT NULL DEFAULT 0`
    );
  }
  if (!names.has('deep_research_quota_date_utc')) {
    database.exec(`ALTER TABLE policy_profiles ADD COLUMN deep_research_quota_date_utc TEXT`);
  }
}

/**
 * Section VIII: lineage, archival, user vs inferred separation for chat-adjacent + vault rows.
 * Idempotent ALTERs for DBs created before continuity columns existed.
 */
function migrateSectionVIIIContinuity(database: Database.Database): void {
  const memCols = database.prepare(`PRAGMA table_info(memories)`).all() as { name: string }[];
  const memNames = new Set(memCols.map((c) => c.name));
  if (!memNames.has('origin')) {
    database.exec(`ALTER TABLE memories ADD COLUMN origin TEXT NOT NULL DEFAULT 'inferred'`);
  }
  if (!memNames.has('archived_at')) {
    database.exec(`ALTER TABLE memories ADD COLUMN archived_at TEXT`);
  }
  if (!memNames.has('replaces_memory_id')) {
    database.exec(`ALTER TABLE memories ADD COLUMN replaces_memory_id TEXT REFERENCES memories(id) ON DELETE SET NULL`);
  }
  database.exec(
    `CREATE INDEX IF NOT EXISTS idx_memories_user_active ON memories(user_id, created_at DESC) WHERE archived_at IS NULL`
  );

  const traceCols = database.prepare(`PRAGMA table_info(traces)`).all() as { name: string }[];
  const traceNames = new Set(traceCols.map((c) => c.name));
  if (!traceNames.has('origin')) {
    database.exec(`ALTER TABLE traces ADD COLUMN origin TEXT NOT NULL DEFAULT 'conversation'`);
  }
  if (!traceNames.has('archived_at')) {
    database.exec(`ALTER TABLE traces ADD COLUMN archived_at TEXT`);
  }
  database.exec(
    `CREATE INDEX IF NOT EXISTS idx_traces_user_active ON traces(user_id, created_at DESC) WHERE archived_at IS NULL`
  );

  const docCols = database.prepare(`PRAGMA table_info(doctrine_nodes)`).all() as { name: string }[];
  const docNames = new Set(docCols.map((c) => c.name));
  if (!docNames.has('origin')) {
    database.exec(`ALTER TABLE doctrine_nodes ADD COLUMN origin TEXT NOT NULL DEFAULT 'user'`);
  }
  if (!docNames.has('version_group_id')) {
    database.exec(`ALTER TABLE doctrine_nodes ADD COLUMN version_group_id TEXT`);
  }
  if (!docNames.has('version')) {
    database.exec(`ALTER TABLE doctrine_nodes ADD COLUMN version INTEGER NOT NULL DEFAULT 1`);
  }
  if (!docNames.has('supersedes_doctrine_id')) {
    database.exec(
      `ALTER TABLE doctrine_nodes ADD COLUMN supersedes_doctrine_id TEXT REFERENCES doctrine_nodes(id) ON DELETE SET NULL`
    );
  }
  if (!docNames.has('archived_at')) {
    database.exec(`ALTER TABLE doctrine_nodes ADD COLUMN archived_at TEXT`);
  }
  database.exec(`UPDATE doctrine_nodes SET version_group_id = id WHERE version_group_id IS NULL OR version_group_id = ''`);
  database.exec(
    `CREATE INDEX IF NOT EXISTS idx_doctrine_user_version ON doctrine_nodes(user_id, version_group_id, version)`
  );
  database.exec(
    `CREATE INDEX IF NOT EXISTS idx_doctrine_user_active ON doctrine_nodes(user_id, archived_at) WHERE archived_at IS NULL`
  );

  const vaultCols = database.prepare(`PRAGMA table_info(memory_vault)`).all() as { name: string }[];
  const vaultNames = new Set(vaultCols.map((c) => c.name));
  if (!vaultNames.has('updated_at')) {
    database.exec(`ALTER TABLE memory_vault ADD COLUMN updated_at TEXT`);
    database.exec(`UPDATE memory_vault SET updated_at = created_at WHERE updated_at IS NULL OR updated_at = ''`);
  }
  if (!vaultNames.has('archived_at')) {
    database.exec(`ALTER TABLE memory_vault ADD COLUMN archived_at TEXT`);
  }
  if (!vaultNames.has('origin')) {
    database.exec(`ALTER TABLE memory_vault ADD COLUMN origin TEXT NOT NULL DEFAULT 'inferred'`);
  }
  database.exec(
    `CREATE INDEX IF NOT EXISTS idx_memory_vault_user_active ON memory_vault(user_id, created_at DESC) WHERE archived_at IS NULL`
  );
}

/**
 * Indexes that reference `archived_at` cannot run in initial DDL: `CREATE TABLE IF NOT EXISTS` does not
 * add columns to existing tables, so legacy DBs would fail. Add column if missing, then index.
 */
function migrateArchivedAtIndexes(database: Database.Database): void {
  const ensureArchivedAtIndex = (table: string, indexSql: string): void => {
    const row = database
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(table) as { name: string } | undefined;
    if (!row) return;
    const cols = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('archived_at')) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN archived_at TEXT`);
    }
    database.exec(indexSql);
  };

  ensureArchivedAtIndex(
    'constitution_clauses',
    `CREATE INDEX IF NOT EXISTS idx_constitution_user_active ON constitution_clauses(user_id, archived_at)`
  );
  ensureArchivedAtIndex(
    'cognitive_twin_traits',
    `CREATE INDEX IF NOT EXISTS idx_twin_user_domain ON cognitive_twin_traits(user_id, domain, archived_at)`
  );
  ensureArchivedAtIndex(
    'cognitive_distortion_observations',
    `CREATE INDEX IF NOT EXISTS idx_distortion_user ON cognitive_distortion_observations(user_id, archived_at, created_at DESC)`
  );
  ensureArchivedAtIndex(
    'threshold_protocols',
    `CREATE INDEX IF NOT EXISTS idx_threshold_proto_user ON threshold_protocols(user_id, archived_at, status)`
  );
}

/** Active DB connection; call `initSqlite()` before first use (e.g. at process startup). */
export function getDb(): Database.Database {
  if (!_db) {
    throw new Error('SQLite not initialized: call initSqlite() before getDb()');
  }
  return _db;
}

