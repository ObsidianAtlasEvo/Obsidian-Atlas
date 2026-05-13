-- =============================================================================
-- Migration 025: behavior_adaptation_events (P4 — net-new Postgres table)
-- Date: 2026-05-13
-- Target: Supabase (Postgres), follows 024_unfinished_business.sql.
-- =============================================================================
-- Records discrete adaptation events: a trigger fires, behavior changes,
-- before/after state captured for transparency and rollback analysis.
-- This is NOT a backfill — no SQLite source. New telemetry pipeline.
-- =============================================================================

CREATE TABLE IF NOT EXISTS behavior_adaptation_events (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  adaptation_type     text        NOT NULL
    CHECK (adaptation_type IN (
      'correction_applied',
      'drift_detected',
      'doctrine_updated',
      'feedback_incorporated',
      'policy_shift',
      'identity_signal_revision',
      'other'
    )),
  trigger             text,                                  -- short label for what caused it
  trigger_ref_id      uuid,                                  -- optional FK-like pointer (memory/decision/claim) — no hard FK, kept soft for cross-table flex
  trigger_ref_table   text,                                  -- 'user_memories' | 'decisions' | 'truth_claims' | etc.
  before_state        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  after_state         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  rationale           text,
  significance        real        NOT NULL DEFAULT 0.5
    CHECK (significance >= 0.0 AND significance <= 1.0),
  metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adaptation_user_time
  ON behavior_adaptation_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adaptation_user_type
  ON behavior_adaptation_events (user_id, adaptation_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adaptation_user_trigger_ref
  ON behavior_adaptation_events (user_id, trigger_ref_table, trigger_ref_id);

ALTER TABLE behavior_adaptation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS adaptation_owner_select ON behavior_adaptation_events;
CREATE POLICY adaptation_owner_select ON behavior_adaptation_events
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS adaptation_owner_insert ON behavior_adaptation_events;
CREATE POLICY adaptation_owner_insert ON behavior_adaptation_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);
