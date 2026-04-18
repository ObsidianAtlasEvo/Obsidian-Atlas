-- =============================================================================
-- Obsidian Atlas — Sovereign Reality Graph (SRG) canonical schema v1
-- Local SQLite only. Apply via atlas-backend init (sqlite.ts) or migration runner.
-- Idempotent: CREATE IF NOT EXISTS. Foreign keys require PRAGMA foreign_keys=ON.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Provenance: which Action Module or subsystem last touched a row (text enum).
-- resonance | journal | mirrorforge | crucible | deep_work | console |
-- bug_tester | chronos | evolution | ingestion | system
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- Raw ingestion layer — distinguishes raw captures from refined knowledge.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS srg_raw_ingestion (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  source_module TEXT NOT NULL,
  content_type TEXT NOT NULL,
  body_text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  metadata_json TEXT,
  processing_status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TEXT NOT NULL,
  processed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_srg_raw_user_time ON srg_raw_ingestion(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_srg_raw_user_status ON srg_raw_ingestion(user_id, processing_status);

-- -----------------------------------------------------------------------------
-- Memory — durable distilled knowledge (parsed artifacts promote into here).
-- -----------------------------------------------------------------------------
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
  refinement_source TEXT,
  source_module TEXT
);
CREATE INDEX IF NOT EXISTS idx_memories_user_time ON memories(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_user_kind ON memories(user_id, kind, created_at DESC);

-- -----------------------------------------------------------------------------
-- Evidence — atomic items supporting truths (separate from memory narrative).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidence_items (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  confidence REAL NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  source_module TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_user_time ON evidence_items(user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Truth — verified / provisional facts; supersession chain.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS truth_entries (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  statement TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence REAL NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  superseded_by_id TEXT,
  constitution_ref TEXT,
  source_module TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (superseded_by_id) REFERENCES truth_entries(id)
);
CREATE INDEX IF NOT EXISTS idx_truth_user_time ON truth_entries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_truth_user_status ON truth_entries(user_id, status);

CREATE TABLE IF NOT EXISTS truth_evidence_links (
  truth_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  PRIMARY KEY (truth_id, evidence_id),
  FOREIGN KEY (truth_id) REFERENCES truth_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (evidence_id) REFERENCES evidence_items(id) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- Decisions — committed choices with rationale and truth links (JSON id list).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS srg_decisions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  status TEXT NOT NULL,
  linked_truth_ids_json TEXT NOT NULL DEFAULT '[]',
  consequence_notes TEXT,
  source_module TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_srg_decisions_user_time ON srg_decisions(user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Doctrine — constitution / principles (epistemic layer).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doctrine_nodes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  layer TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  immutable INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doctrine_user_layer ON doctrine_nodes(user_id, layer, priority DESC);

-- -----------------------------------------------------------------------------
-- Drift — structured evolution / contradiction signals.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evolution_gaps (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  trace_id TEXT,
  reason TEXT NOT NULL,
  eval_snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evolution_gaps_user_time ON evolution_gaps(user_id, created_at DESC);

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
  source_module TEXT,
  FOREIGN KEY (related_gap_id) REFERENCES evolution_gaps(id)
);
CREATE INDEX IF NOT EXISTS idx_drift_user_time ON drift_events(user_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_drift_subject ON drift_events(user_id, subject_type, subject_id);

-- -----------------------------------------------------------------------------
-- Graph projection — materialized nodes and edges for cartography / Reality Engine.
-- ref_type + ref_id point at domain rows (memory, truth, evidence, decision, ...).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS graph_nodes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  ref_type TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  label_snapshot TEXT NOT NULL,
  salience REAL NOT NULL DEFAULT 0.5,
  layer TEXT NOT NULL DEFAULT 'default',
  meta_json TEXT,
  provenance_module TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_nodes_user_ref ON graph_nodes(user_id, ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_user_layer ON graph_nodes(user_id, layer);

CREATE TABLE IF NOT EXISTS graph_edges (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  src_node_id TEXT NOT NULL,
  dst_node_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  meta_json TEXT,
  provenance_module TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (src_node_id) REFERENCES graph_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (dst_node_id) REFERENCES graph_nodes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_graph_edges_user_src ON graph_edges(user_id, src_node_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_user_dst ON graph_edges(user_id, dst_node_id);

-- -----------------------------------------------------------------------------
-- Archive — frozen snapshots for rollback / audit (not user note deletion).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS archive_records (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_archive_user_time ON archive_records(user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Directives — explicit behavioral / epistemic instructions (governance).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS directives (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  scope TEXT NOT NULL DEFAULT 'global',
  source_module TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_directives_user_active ON directives(user_id, active, priority DESC);

-- -----------------------------------------------------------------------------
-- Gap ledger — ranked diagnostics / architectural weaknesses (Bug Tester, etc.).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gap_ledger_items (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  rank_score REAL NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  source_module TEXT NOT NULL,
  related_entity_type TEXT,
  related_entity_id TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_gap_ledger_user_rank ON gap_ledger_items(user_id, status, rank_score DESC);

-- -----------------------------------------------------------------------------
-- Governance key-value (thresholds, feature flags).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS governance_settings (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

-- -----------------------------------------------------------------------------
-- Policy & episodic conversation (interaction + chat substrate).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS policy_profiles (
  user_id TEXT PRIMARY KEY NOT NULL,
  verbosity TEXT NOT NULL,
  tone TEXT NOT NULL,
  structure_preference TEXT NOT NULL,
  truth_first_strictness REAL NOT NULL,
  writing_style_enabled INTEGER NOT NULL,
  tavily_api_key TEXT,
  deep_research_daily_count INTEGER NOT NULL DEFAULT 0,
  deep_research_quota_date_utc TEXT,
  updated_at TEXT NOT NULL,
  is_learned INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS traces (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  user_message TEXT NOT NULL,
  assistant_response TEXT NOT NULL,
  response_score REAL NOT NULL,
  memory_candidates INTEGER NOT NULL,
  dataset_approved INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_traces_user_time ON traces(user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Autonomy log (Chronos / background decisions) — already part of sovereign ops.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Legacy compatibility: reality_graph_edges (typed end IDs, no graph_nodes FK).
-- New code should prefer graph_nodes + graph_edges. Retained for migration paths.
-- -----------------------------------------------------------------------------
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
  provenance_module TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rge_user_src ON reality_graph_edges(user_id, src_type, src_id);
CREATE INDEX IF NOT EXISTS idx_rge_user_dst ON reality_graph_edges(user_id, dst_type, dst_id);
