-- =============================================================================
-- Migration 017: Orchestration Traces + Artifact State Fingerprints
-- Phase F — Atlas V1.0 Sovereign Execution Framework
-- Date: 2026-04-21
-- =============================================================================
--
-- Tables introduced:
--
--   1. orchestration_traces      — Per-request conductor trace records.
--                                  Enables operator replay, latency audit, and
--                                  Stage-by-stage performance analysis.
--
--   2. artifact_state_fingerprints — Per-request artifact fingerprint snapshots.
--                                    Enables artifact diffing across turns and
--                                    membrane invalidation trigger (Phase F).
--
-- All tables are:
--   - Idempotent (CREATE TABLE IF NOT EXISTS)
--   - user_id-keyed throughout
--   - RLS-enabled with owner_select policies (auth.uid() = user_id)
--   - Indexed for common access patterns
--   - Retention-ready (deleted_at, tombstoned)
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. orchestration_traces
--    Stores the ConductorTrace emitted at Stage 8 of each request.
--    Primary use: operator latency analysis, degraded-mode auditing, replay.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS orchestration_traces (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,

  -- Correlation IDs
  trace_id            text NOT NULL,
  request_id          text NOT NULL,

  -- Membrane path ('hit' | 'miss' | 'skipped')
  membrane_path       text NOT NULL DEFAULT 'skipped',
  membrane_invalidation_reason  text,

  -- Capability routing
  desired_synthesis_class  text,
  resolved_synthesis_class text,
  capability_downgraded    boolean NOT NULL DEFAULT false,
  capability_reason        text,

  -- Context slicing (Phase C)
  context_sliced      boolean NOT NULL DEFAULT false,
  context_budget_tokens    integer,
  context_estimated_tokens integer,

  -- Degraded mode (Phase D)
  degraded_mode       text NOT NULL DEFAULT 'NOMINAL',
  memory_assembly_gated boolean NOT NULL DEFAULT false,

  -- Stage telemetry
  highest_stage_reached integer NOT NULL DEFAULT 0,
  stage_durations_ms  jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Doctrine + policy versions
  doctrine_version_hash   text,
  sensitivity_class       text,
  policy_profile_version  text,
  degraded_state_hash     text,

  -- Redis availability
  redis_available     boolean NOT NULL DEFAULT false,

  -- Retention
  deleted_at          timestamptz,
  tombstoned          boolean NOT NULL DEFAULT false,

  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE orchestration_traces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orchestration_traces_owner_select ON orchestration_traces;
CREATE POLICY orchestration_traces_owner_select
  ON orchestration_traces
  FOR ALL
  USING (auth.uid() = user_id);

-- Lookup by trace_id (primary correlation)
CREATE INDEX IF NOT EXISTS idx_orchestration_traces_trace_id
  ON orchestration_traces (trace_id);

-- Lookup by user_id + created_at for timeline audit
CREATE INDEX IF NOT EXISTS idx_orchestration_traces_user_timeline
  ON orchestration_traces (user_id, created_at DESC)
  WHERE tombstoned = false;

-- Filter by degraded mode for incident analysis
CREATE INDEX IF NOT EXISTS idx_orchestration_traces_degraded_mode
  ON orchestration_traces (user_id, degraded_mode, created_at DESC)
  WHERE degraded_mode != 'NOMINAL';


-- ---------------------------------------------------------------------------
-- 2. artifact_state_fingerprints
--    Stores a hash of the "artifact state" present in each request —
--    the set of user documents, code files, and structured assets that
--    Atlas has access to at the time of the request.
--
--    Purpose:
--    - Membrane trigger: if artifacts changed since the membrane was written,
--      the context assembly must be re-run (artifact_fingerprint_change trigger
--      already exists in sessionMembraneService; this table provides the store).
--    - Audit: which artifacts were present during a given decision.
--    - Diff: detect when a user uploads a new document mid-session.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS artifact_state_fingerprints (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,

  -- Request correlation
  request_id          text NOT NULL,
  trace_id            text,

  -- The fingerprint (FNV-1a hash of artifact IDs + modification timestamps)
  fingerprint         text NOT NULL,

  -- Structured artifact inventory at the time of fingerprinting
  -- Array of { id, type, name, modifiedAt } objects
  artifact_manifest   jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Whether this fingerprint diffed from the previous request's fingerprint
  changed_from_previous boolean NOT NULL DEFAULT false,
  previous_fingerprint  text,

  -- Retention
  deleted_at          timestamptz,
  tombstoned          boolean NOT NULL DEFAULT false,

  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE artifact_state_fingerprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS artifact_fingerprints_owner_select ON artifact_state_fingerprints;
CREATE POLICY artifact_fingerprints_owner_select
  ON artifact_state_fingerprints
  FOR ALL
  USING (auth.uid() = user_id);

-- Lookup most recent fingerprint for a user (for membrane diff check)
CREATE INDEX IF NOT EXISTS idx_artifact_fingerprints_user_recent
  ON artifact_state_fingerprints (user_id, created_at DESC)
  WHERE tombstoned = false;

-- Lookup by request_id for cross-table join with orchestration_traces
CREATE INDEX IF NOT EXISTS idx_artifact_fingerprints_request
  ON artifact_state_fingerprints (request_id);

-- =============================================================================
-- END OF MIGRATION 017
-- =============================================================================
