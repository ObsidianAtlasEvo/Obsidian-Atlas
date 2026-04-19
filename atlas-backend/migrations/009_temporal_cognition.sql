-- =============================================================================
-- Migration 009: Temporal Cognition Stack (Phase 0.9)
-- Date: 2026-05-01
-- Target: Supabase (Postgres), follows 008_epistemic_governance.sql
-- Idempotent: all CREATE statements use IF NOT EXISTS
-- =============================================================================
--
-- Introduces the Temporal Cognition Stack:
--
--   identity_evolution_timeline   — longitudinal identity & behavior change log
--   user_sovereignty_controls     — user control state per scope
--   gap_ledger                    — ranked unresolved uncertainty
--   identity_graph_nodes          — graph nodes for relational user model
--   identity_graph_edges          — graph edges
--   active_priorities             — user's active projects & strategic workstreams
--   state_activation_log          — lifecycle state changes for signals/domains/projects
--
-- Laws enforced:
--   1. Law of Visible Evolution  — identity_evolution_timeline
--   2. Law of User Sovereignty   — user_sovereignty_controls
--   3. Law of Explicit Incompleteness — gap_ledger
--   4. Law of Structured Relation    — identity_graph_nodes + identity_graph_edges
--   5. Law of Selective Context      — (enforced at runtime by contextCuratorService)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. identity_evolution_timeline
-- Longitudinal identity and behavior change history.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity_evolution_timeline (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL,
  change_cluster_id   uuid,
  timeline_event_type text        NOT NULL,
    CONSTRAINT timeline_event_type_check CHECK (
      timeline_event_type IN (
        'added',
        'clarified',
        'narrowed',
        'widened',
        'strengthened',
        'weakened',
        'corrected',
        'contradicted',
        'demoted',
        'frozen',
        'reverted',
        'deactivated'
      )
    ),
  domain              text,
  before_state_ref    jsonb,
  after_state_ref     jsonb,
  change_reason_chain text,
  impact_scope        text        NOT NULL DEFAULT 'local',
    CONSTRAINT impact_scope_check CHECK (
      impact_scope IN ('local', 'domain', 'global')
    ),
  affected_domains    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  triggered_by        text        NOT NULL DEFAULT 'system',
    CONSTRAINT triggered_by_check CHECK (
      triggered_by IN ('distiller', 'correction', 'decay', 'arbitrator', 'user', 'system')
    ),
  significance        real        NOT NULL DEFAULT 0.5,
    CONSTRAINT significance_range CHECK (significance >= 0.0 AND significance <= 1.0),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_evolution_timeline_user_created
  ON identity_evolution_timeline (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_identity_evolution_timeline_user_domain_created
  ON identity_evolution_timeline (user_id, domain, created_at DESC);

-- RLS: owners can only select their own rows.
ALTER TABLE identity_evolution_timeline ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'identity_evolution_timeline'
      AND policyname = 'owner_select_identity_evolution_timeline'
  ) THEN
    CREATE POLICY owner_select_identity_evolution_timeline
      ON identity_evolution_timeline
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. user_sovereignty_controls
-- User control state per scope.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_sovereignty_controls (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL,
  control_type    text        NOT NULL,
    CONSTRAINT control_type_check CHECK (
      control_type IN ('freeze', 'suppress', 'confirm', 'quarantine', 'revert')
    ),
  control_scope   text        NOT NULL,
    CONSTRAINT control_scope_check CHECK (
      control_scope IN ('global', 'domain', 'memory', 'chamber', 'project', 'policy_field')
    ),
  scope_key       text,
  active          boolean     NOT NULL DEFAULT true,
  control_reason  text,
  revert_anchor   jsonb,
  expires_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_user_sovereignty_controls_user_type_active
  ON user_sovereignty_controls (user_id, control_type, active);

ALTER TABLE user_sovereignty_controls ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_sovereignty_controls'
      AND policyname = 'owner_select_user_sovereignty_controls'
  ) THEN
    CREATE POLICY owner_select_user_sovereignty_controls
      ON user_sovereignty_controls
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. gap_ledger
-- Ranked unresolved uncertainty.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gap_ledger (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid        NOT NULL,
  gap_type                  text        NOT NULL,
    CONSTRAINT gap_type_check CHECK (
      gap_type IN (
        'unresolved_preference',
        'unresolved_contradiction',
        'underconfirmed_trait',
        'missing_chamber_preference',
        'unknown_workflow_preference',
        'unclear_scope_boundary',
        'insufficient_evidence',
        'unclear_project_priority',
        'unstable_recent_change'
      )
    ),
  gap_domain                text,
  ambiguity_score           real        NOT NULL DEFAULT 0.5,
    CONSTRAINT ambiguity_score_range CHECK (ambiguity_score >= 0.0 AND ambiguity_score <= 1.0),
  impact_score              real        NOT NULL DEFAULT 0.5,
    CONSTRAINT impact_score_range CHECK (impact_score >= 0.0 AND impact_score <= 1.0),
  confirmation_priority     real        NOT NULL DEFAULT 0.5,
    CONSTRAINT confirmation_priority_range CHECK (confirmation_priority >= 0.0 AND confirmation_priority <= 1.0),
  blocked_actions           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  next_confirmation_path    text,
  evidence_scarcity_reason  text,
  status                    text        NOT NULL DEFAULT 'open',
    CONSTRAINT gap_status_check CHECK (
      status IN ('open', 'resolved', 'acknowledged', 'suppressed')
    ),
  related_memory_ids        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gap_ledger_user_status_impact
  ON gap_ledger (user_id, status, impact_score DESC);

ALTER TABLE gap_ledger ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'gap_ledger'
      AND policyname = 'owner_select_gap_ledger'
  ) THEN
    CREATE POLICY owner_select_gap_ledger
      ON gap_ledger
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. identity_graph_nodes
-- Graph nodes for relational user model.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity_graph_nodes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL,
  node_type    text        NOT NULL,
    CONSTRAINT node_type_check CHECK (
      node_type IN (
        'memory',
        'identity_signal',
        'identity_domain',
        'project',
        'chamber',
        'correction_event',
        'contradiction_event',
        'policy_change',
        'gap'
      )
    ),
  entity_id    text        NOT NULL,
  label        text        NOT NULL,
  payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  graph_scope  text        NOT NULL DEFAULT 'global',
  graph_status text        NOT NULL DEFAULT 'active',
    CONSTRAINT graph_status_check CHECK (
      graph_status IN ('active', 'latent', 'archived')
    ),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_identity_graph_nodes_user_type_entity
    UNIQUE (user_id, node_type, entity_id)
);

ALTER TABLE identity_graph_nodes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'identity_graph_nodes'
      AND policyname = 'owner_select_identity_graph_nodes'
  ) THEN
    CREATE POLICY owner_select_identity_graph_nodes
      ON identity_graph_nodes
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. identity_graph_edges
-- Directional edges between graph nodes.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity_graph_edges (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL,
  source_node_id      uuid        REFERENCES identity_graph_nodes(id) ON DELETE CASCADE,
  target_node_id      uuid        REFERENCES identity_graph_nodes(id) ON DELETE CASCADE,
  edge_type           text        NOT NULL,
    CONSTRAINT edge_type_check CHECK (
      edge_type IN (
        'supports',
        'refines',
        'contradicts',
        'supersedes',
        'corrected_by',
        'derived_from',
        'scoped_to',
        'influences',
        'activated_by',
        'suppressed_by',
        'unresolved_with'
      )
    ),
  edge_weight         real        NOT NULL DEFAULT 0.5,
    CONSTRAINT edge_weight_range CHECK (edge_weight >= 0.0 AND edge_weight <= 1.0),
  relation_confidence real        NOT NULL DEFAULT 0.5,
    CONSTRAINT relation_confidence_range CHECK (relation_confidence >= 0.0 AND relation_confidence <= 1.0),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_graph_edges_user_source
  ON identity_graph_edges (user_id, source_node_id);

CREATE INDEX IF NOT EXISTS idx_identity_graph_edges_user_target
  ON identity_graph_edges (user_id, target_node_id);

ALTER TABLE identity_graph_edges ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'identity_graph_edges'
      AND policyname = 'owner_select_identity_graph_edges'
  ) THEN
    CREATE POLICY owner_select_identity_graph_edges
      ON identity_graph_edges
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. active_priorities
-- User's active projects and strategic workstreams.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS active_priorities (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid        NOT NULL,
  priority_type           text        NOT NULL,
    CONSTRAINT priority_type_check CHECK (
      priority_type IN (
        'active_project',
        'recurring_theme',
        'unresolved_thread',
        'strategic_priority',
        'dormant_initiative',
        'blocked_priority'
      )
    ),
  title                   text        NOT NULL,
  priority_score          real        NOT NULL DEFAULT 0.5,
    CONSTRAINT priority_score_range CHECK (priority_score >= 0.0 AND priority_score <= 1.0),
  progress_state          text        NOT NULL DEFAULT 'active',
    CONSTRAINT progress_state_check CHECK (
      progress_state IN ('active', 'stalled', 'dormant', 'complete', 'abandoned')
    ),
  recency_score           real        NOT NULL DEFAULT 0.5,
  linked_memory_ids       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  linked_identity_domains jsonb       NOT NULL DEFAULT '[]'::jsonb,
  blocked_by_gap_ids      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  related_chamber         text,
  last_activity_at        timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_active_priorities_user_state_score
  ON active_priorities (user_id, progress_state, priority_score DESC);

ALTER TABLE active_priorities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'active_priorities'
      AND policyname = 'owner_select_active_priorities'
  ) THEN
    CREATE POLICY owner_select_active_priorities
      ON active_priorities
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. state_activation_log
-- Lifecycle state changes for signals, domains, and projects.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS state_activation_log (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL,
  entity_type           text        NOT NULL,
    CONSTRAINT entity_type_check CHECK (
      entity_type IN (
        'memory',
        'identity_signal',
        'identity_domain',
        'gap',
        'priority'
      )
    ),
  entity_id             text        NOT NULL,
  state_status          text        NOT NULL,
    CONSTRAINT state_status_check CHECK (
      state_status IN (
        'active',
        'latent',
        'tentative',
        'frozen',
        'quarantined',
        'archived',
        'suppressed',
        'pending_confirmation'
      )
    ),
  activation_score      real        NOT NULL DEFAULT 0.5,
  activation_reason     text,
  deactivation_reason   text,
  reactivation_trigger  text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_state_activation_log_user_entity
  ON state_activation_log (user_id, entity_type, entity_id, created_at DESC);

ALTER TABLE state_activation_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'state_activation_log'
      AND policyname = 'owner_select_state_activation_log'
  ) THEN
    CREATE POLICY owner_select_state_activation_log
      ON state_activation_log
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- =============================================================================
-- END OF MIGRATION 009
-- =============================================================================
