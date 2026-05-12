-- =============================================================================
-- Migration 020: Constitutional Compliance (Per-Turn Principle Check)
-- Date: 2026-05-12
-- =============================================================================
--
-- Two tables backing the per-turn constitutional-compliance pass that runs
-- after synthesis in the cognitive orchestrator delivery stage:
--
--   1. user_constitutional_principles — the user's stated, editable list
--      of principles that AI responses must honour.
--   2. behavior_transparency_log     — one row per checked response: pass/fail,
--      number of principles evaluated, compliance score, and any violations.
--
-- Both tables:
--   - Idempotent (CREATE TABLE IF NOT EXISTS / DROP POLICY IF EXISTS).
--   - user_id-keyed with RLS: `auth.uid() = user_id`.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. user_constitutional_principles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_constitutional_principles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  principle_text  text NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_constitutional_principles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_constitutional_principles_owner_all ON user_constitutional_principles;
CREATE POLICY user_constitutional_principles_owner_all ON user_constitutional_principles
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_principles_active
  ON user_constitutional_principles (user_id, active);

-- ---------------------------------------------------------------------------
-- 2. behavior_transparency_log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS behavior_transparency_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id          text NOT NULL,
  response_id         text,
  passed              boolean NOT NULL,
  principles_checked  integer NOT NULL DEFAULT 0,
  compliance_score    numeric(4,3),
  violations          jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE behavior_transparency_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS behavior_transparency_log_owner_select ON behavior_transparency_log;
CREATE POLICY behavior_transparency_log_owner_select ON behavior_transparency_log
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS behavior_transparency_log_owner_insert ON behavior_transparency_log;
CREATE POLICY behavior_transparency_log_owner_insert ON behavior_transparency_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_btl_user_session
  ON behavior_transparency_log (user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_btl_passed
  ON behavior_transparency_log (user_id, passed);
