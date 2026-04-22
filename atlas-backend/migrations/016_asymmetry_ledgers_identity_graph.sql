-- =============================================================================
-- Migration 016: Asymmetry Ledgers + Graph Bitemporal Columns + Sovereign Graph
-- Phase B — Atlas V1.0 Sovereign Execution Framework
-- Date: 2026-04-21
-- =============================================================================
--
-- Tables / changes introduced:
--
--   1. asymmetry_ledgers         — NEW table: per-user leverage asymmetry catalogue
--
--   2. identity_graph_nodes      — ADDITIVE: bitemporal columns added to the
--      identity_graph_edges        existing 009 tables (stable_id, valid_from,
--                                  valid_to, recorded_at). No rows affected.
--                                  All ADD COLUMN IF NOT EXISTS — idempotent.
--
--   3. sovereign_graph_nodes     — NEW table: sovereign relational graph of
--      sovereign_graph_edges       people, organisations, and constructs
--                                  (DISTINCT purpose from the internal cognitive
--                                   graph in 009; named separately to avoid
--                                   truth-source collision).
--
-- All tables are:
--   - Idempotent (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS)
--   - user_id-keyed throughout
--   - RLS-enabled with owner_select policies (auth.uid() = user_id)
--   - Indexed for common access patterns
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. asymmetry_ledgers
--    Captures leverage asymmetries that Atlas surfaces for the sovereign user.
--    An asymmetry is an identified structural imbalance (informational,
--    relational, capability) that confers disproportionate advantage or risk.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS asymmetry_ledgers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,

  -- Domain of the asymmetry (e.g. 'market', 'relationship', 'knowledge', 'temporal')
  domain          text NOT NULL,

  -- Taxonomy: e.g. 'information_gap', 'timing_edge', 'network_position', 'capability_delta'
  asymmetry_type  text NOT NULL,

  -- Human-readable description of the leverage point
  leverage_description  text NOT NULL,

  -- JSONB array of truth_claim IDs (soft FK → truth_claims.id)
  evidence_ids    jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Calibrated confidence (0.0–1.0)
  confidence_score  numeric(4,3) NOT NULL DEFAULT 0.5
    CONSTRAINT asymmetry_confidence_range CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),

  -- Salience weight for ranking (0.0–1.0)
  salience_weight  numeric(4,3) NOT NULL DEFAULT 0.5
    CONSTRAINT asymmetry_salience_range CHECK (salience_weight >= 0.0 AND salience_weight <= 1.0),

  -- Optional expiry — time-sensitive asymmetries decay
  expires_at      timestamptz,

  -- Metadata / tags
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Bitemporal-lite
  valid_from      timestamptz NOT NULL DEFAULT now(),
  valid_to        timestamptz,

  -- Retention support
  archived_at     timestamptz,
  deleted_at      timestamptz,
  tombstoned      boolean NOT NULL DEFAULT false,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE asymmetry_ledgers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS asymmetry_ledgers_owner_select ON asymmetry_ledgers;
CREATE POLICY asymmetry_ledgers_owner_select
  ON asymmetry_ledgers
  FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_asymmetry_ledgers_user_domain
  ON asymmetry_ledgers (user_id, domain, asymmetry_type);

CREATE INDEX IF NOT EXISTS idx_asymmetry_ledgers_confidence
  ON asymmetry_ledgers (user_id, confidence_score DESC)
  WHERE tombstoned = false AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_asymmetry_ledgers_valid_range
  ON asymmetry_ledgers (user_id, valid_from, valid_to)
  WHERE tombstoned = false;


-- ---------------------------------------------------------------------------
-- 2. Additive bitemporal columns on existing identity_graph_nodes (from 009)
--
--    Purpose: allow the internal cognitive graph to participate in temporal
--    reasoning (which version of a node was true at time T?) without a full
--    table rewrite and without creating a duplicate table.
--
--    stable_id   — links all versions of the same logical entity (never changes)
--    valid_from  — when this row became true in modelled reality
--    valid_to    — when this row ceased to be true (NULL = currently valid)
--    recorded_at — when Atlas recorded this fact
--
--    All ADD COLUMN IF NOT EXISTS — idempotent, no existing rows affected.
-- ---------------------------------------------------------------------------

ALTER TABLE identity_graph_nodes
  ADD COLUMN IF NOT EXISTS stable_id    uuid        NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE identity_graph_nodes
  ADD COLUMN IF NOT EXISTS valid_from   timestamptz NOT NULL DEFAULT now();

ALTER TABLE identity_graph_nodes
  ADD COLUMN IF NOT EXISTS valid_to     timestamptz;

ALTER TABLE identity_graph_nodes
  ADD COLUMN IF NOT EXISTS recorded_at  timestamptz NOT NULL DEFAULT now();

-- Index: fetch current version of any stable entity efficiently
CREATE INDEX IF NOT EXISTS idx_identity_graph_nodes_stable_current
  ON identity_graph_nodes (user_id, stable_id, valid_from DESC)
  WHERE valid_to IS NULL;


-- ---------------------------------------------------------------------------
-- 3. Additive bitemporal columns on existing identity_graph_edges (from 009)
--
--    Same temporal reasoning capability as above.
--    from_stable_id / to_stable_id reference the stable_ids of connected nodes
--    so edges survive node versioning (not tied to a specific row id).
-- ---------------------------------------------------------------------------

ALTER TABLE identity_graph_edges
  ADD COLUMN IF NOT EXISTS stable_id       uuid        NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE identity_graph_edges
  ADD COLUMN IF NOT EXISTS from_stable_id  uuid;  -- populated by application on write

ALTER TABLE identity_graph_edges
  ADD COLUMN IF NOT EXISTS to_stable_id    uuid;  -- populated by application on write

ALTER TABLE identity_graph_edges
  ADD COLUMN IF NOT EXISTS valid_from      timestamptz NOT NULL DEFAULT now();

ALTER TABLE identity_graph_edges
  ADD COLUMN IF NOT EXISTS valid_to        timestamptz;

ALTER TABLE identity_graph_edges
  ADD COLUMN IF NOT EXISTS recorded_at     timestamptz NOT NULL DEFAULT now();

-- Index: current edges between two stable entities
CREATE INDEX IF NOT EXISTS idx_identity_graph_edges_stable_current
  ON identity_graph_edges (user_id, from_stable_id, to_stable_id)
  WHERE valid_to IS NULL;


-- ---------------------------------------------------------------------------
-- 4. sovereign_graph_nodes
--    NEW table: sovereign relational graph for EXTERNAL entities — people,
--    organisations, constructs that the sovereign user tracks in their
--    relationships and strategic context.
--
--    This is semantically DISTINCT from identity_graph_nodes (which tracks
--    internal cognitive signals: memories, gaps, chambers, corrections).
--    Separate table prevents truth-source collision.
--
--    Fully bitemporal from creation.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sovereign_graph_nodes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,

  -- Cross-version stable anchor
  stable_id       uuid NOT NULL DEFAULT gen_random_uuid(),

  -- Entity classification
  node_type       text NOT NULL,
    CONSTRAINT sov_node_type_check CHECK (
      node_type IN ('person', 'organisation', 'concept', 'construct', 'resource')
    ),

  -- Canonical label for this version
  label           text NOT NULL,

  -- Rich attribute blob (names, roles, affiliations, traits, contact, etc.)
  attributes      jsonb NOT NULL DEFAULT '{}'::jsonb,

  confidence_score  numeric(4,3) NOT NULL DEFAULT 0.7
    CONSTRAINT sov_node_confidence_range CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),

  -- Bitemporal
  valid_from      timestamptz NOT NULL DEFAULT now(),
  valid_to        timestamptz,
  recorded_at     timestamptz NOT NULL DEFAULT now(),

  -- Retention
  archived_at     timestamptz,
  deleted_at      timestamptz,
  tombstoned      boolean NOT NULL DEFAULT false,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sovereign_graph_nodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sovereign_graph_nodes_owner_select ON sovereign_graph_nodes;
CREATE POLICY sovereign_graph_nodes_owner_select
  ON sovereign_graph_nodes
  FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sov_nodes_stable
  ON sovereign_graph_nodes (user_id, stable_id, valid_from DESC);

CREATE INDEX IF NOT EXISTS idx_sov_nodes_current
  ON sovereign_graph_nodes (user_id, node_type)
  WHERE valid_to IS NULL AND tombstoned = false AND deleted_at IS NULL;


-- ---------------------------------------------------------------------------
-- 5. sovereign_graph_edges
--    Bitemporal relationships between sovereign_graph_nodes.
--    Tracks WHEN a relationship was true and WHEN Atlas recorded it.
--    from_stable_id / to_stable_id reference sovereign_graph_nodes.stable_id
--    so edges survive node versioning.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sovereign_graph_edges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,

  stable_id       uuid NOT NULL DEFAULT gen_random_uuid(),

  -- Reference sovereign_graph_nodes.stable_id (not row id — survives versioning)
  from_stable_id  uuid NOT NULL,
  to_stable_id    uuid NOT NULL,

  -- Relationship type (open vocabulary — constrained by application layer)
  relation_type   text NOT NULL,

  -- Directional weight: positive = aligned/supportive, negative = adversarial
  weight          numeric(5,3) NOT NULL DEFAULT 0.5
    CONSTRAINT sov_edge_weight_range CHECK (weight >= -1.0 AND weight <= 1.0),

  evidence_ids    jsonb NOT NULL DEFAULT '[]'::jsonb,
  attributes      jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Bitemporal
  valid_from      timestamptz NOT NULL DEFAULT now(),
  valid_to        timestamptz,
  recorded_at     timestamptz NOT NULL DEFAULT now(),

  -- Retention
  archived_at     timestamptz,
  deleted_at      timestamptz,
  tombstoned      boolean NOT NULL DEFAULT false,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sovereign_graph_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sovereign_graph_edges_owner_select ON sovereign_graph_edges;
CREATE POLICY sovereign_graph_edges_owner_select
  ON sovereign_graph_edges
  FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sov_edges_from
  ON sovereign_graph_edges (user_id, from_stable_id, relation_type)
  WHERE tombstoned = false;

CREATE INDEX IF NOT EXISTS idx_sov_edges_to
  ON sovereign_graph_edges (user_id, to_stable_id, relation_type)
  WHERE tombstoned = false;

CREATE INDEX IF NOT EXISTS idx_sov_edges_current
  ON sovereign_graph_edges (user_id, from_stable_id, to_stable_id)
  WHERE valid_to IS NULL AND tombstoned = false AND deleted_at IS NULL;

-- =============================================================================
-- END OF MIGRATION 016
-- =============================================================================
