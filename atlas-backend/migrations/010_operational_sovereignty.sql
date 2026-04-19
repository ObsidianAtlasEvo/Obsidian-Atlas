-- =============================================================================
-- Migration 010: Operational Sovereignty (Phase 0.95)
-- Date: 2026-06-01
-- Target: Supabase (Postgres), follows 009_temporal_cognition.sql
-- Idempotent: all CREATE statements use IF NOT EXISTS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. workstreams
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workstreams (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid          NOT NULL,
  name                 text          NOT NULL,
  description          text,
  status               text          NOT NULL DEFAULT 'active',
    CONSTRAINT workstreams_status_check CHECK (
      status IN ('active','paused','stalled','closed')
    ),
  phase                text,
  health_score         numeric(4,3)  NOT NULL DEFAULT 0.5,
  workstream_metadata  jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workstreams_user_status
  ON workstreams (user_id, status, updated_at DESC);

ALTER TABLE workstreams ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'workstreams'
      AND policyname = 'owner_select_workstreams'
  ) THEN
    CREATE POLICY owner_select_workstreams
      ON workstreams FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. strategic_fronts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS strategic_fronts (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid          NOT NULL,
  name              text          NOT NULL,
  description       text,
  status            text          NOT NULL DEFAULT 'open',
    CONSTRAINT strategic_fronts_status_check CHECK (
      status IN ('open','frozen','won','lost','abandoned')
    ),
  front_type        text,
  arena             text,
  priority          integer       NOT NULL DEFAULT 5,
  front_metadata    jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_strategic_fronts_user_status
  ON strategic_fronts (user_id, status, priority DESC);

ALTER TABLE strategic_fronts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'strategic_fronts'
      AND policyname = 'owner_select_strategic_fronts'
  ) THEN
    CREATE POLICY owner_select_strategic_fronts
      ON strategic_fronts FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. execution_chains
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS execution_chains (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid          NOT NULL,
  workstream_id   uuid          REFERENCES workstreams(id) ON DELETE SET NULL,
  name            text          NOT NULL,
  status          text          NOT NULL DEFAULT 'active',
    CONSTRAINT execution_chains_status_check CHECK (
      status IN ('active','stalled','blocked','complete')
    ),
  last_action_at  timestamptz,
  chain_metadata  jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_execution_chains_user_status
  ON execution_chains (user_id, status, last_action_at DESC NULLS LAST);

ALTER TABLE execution_chains ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'execution_chains'
      AND policyname = 'owner_select_execution_chains'
  ) THEN
    CREATE POLICY owner_select_execution_chains
      ON execution_chains FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. commitments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commitments (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid          NOT NULL,
  description       text          NOT NULL,
  commitment_type   text          NOT NULL DEFAULT 'explicit',
    CONSTRAINT commitments_type_check CHECK (
      commitment_type IN ('explicit','implied')
    ),
  status            text          NOT NULL DEFAULT 'open',
    CONSTRAINT commitments_status_check CHECK (
      status IN ('open','fulfilled','broken','deferred')
    ),
  source_context    text,
  due_at            timestamptz,
  resolved_at       timestamptz,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commitments_user_status
  ON commitments (user_id, status, due_at);

ALTER TABLE commitments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'commitments'
      AND policyname = 'owner_select_commitments'
  ) THEN
    CREATE POLICY owner_select_commitments
      ON commitments FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. leverage_candidates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leverage_candidates (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid          NOT NULL,
  name                text          NOT NULL,
  description         text,
  leverage_score      numeric(4,3)  NOT NULL DEFAULT 0.5,
  bottleneck          boolean       NOT NULL DEFAULT false,
  false_front         boolean       NOT NULL DEFAULT false,
  candidate_metadata  jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leverage_candidates_user_score
  ON leverage_candidates (user_id, leverage_score DESC);

ALTER TABLE leverage_candidates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'leverage_candidates'
      AND policyname = 'owner_select_leverage_candidates'
  ) THEN
    CREATE POLICY owner_select_leverage_candidates
      ON leverage_candidates FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. outcome_feedback
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outcome_feedback (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid          NOT NULL,
  workstream_id     uuid          REFERENCES workstreams(id) ON DELETE SET NULL,
  proposed_outcome  text,
  actual_outcome    text,
  delta_score       numeric(4,3)  NOT NULL DEFAULT 0,
  feedback_at       timestamptz   NOT NULL DEFAULT now(),
  notes             text
);

CREATE INDEX IF NOT EXISTS idx_outcome_feedback_user
  ON outcome_feedback (user_id, feedback_at DESC);

ALTER TABLE outcome_feedback ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'outcome_feedback'
      AND policyname = 'owner_select_outcome_feedback'
  ) THEN
    CREATE POLICY owner_select_outcome_feedback
      ON outcome_feedback FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. decisions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS decisions (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid          NOT NULL,
  title               text          NOT NULL,
  description         text,
  rationale           text,
  options             jsonb         NOT NULL DEFAULT '[]'::jsonb,
  chosen_option       text,
  reversibility       text          NOT NULL DEFAULT 'reversible',
    CONSTRAINT decisions_reversibility_check CHECK (
      reversibility IN ('reversible','partially_reversible','irreversible')
    ),
  decision_metadata   jsonb         NOT NULL DEFAULT '{}'::jsonb,
  decided_at          timestamptz   NOT NULL DEFAULT now(),
  created_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decisions_user_decided_at
  ON decisions (user_id, decided_at DESC);

ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'decisions'
      AND policyname = 'owner_select_decisions'
  ) THEN
    CREATE POLICY owner_select_decisions
      ON decisions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- =============================================================================
-- END OF MIGRATION 010
-- =============================================================================
