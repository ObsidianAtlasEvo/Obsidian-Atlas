-- =============================================================================
-- Atlas Sovereign Console — Supabase tables (run after supabase-evolution-schema.sql)
-- =============================================================================
-- Used by sovereignRoutes.ts for flags, bugs, releases, mind profiles, prompts,
-- and OverseerTrainer persistence. Service-role key bypasses RLS in development.

-- ---------------------------------------------------------------------------
-- System prompt mirror (optional; file store remains source of truth in dev)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS atlas_system_prompts (
  id          TEXT        NOT NULL DEFAULT 'main',
  content     TEXT        NOT NULL,
  version     INTEGER     NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT atlas_system_prompts_pkey PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- Feature flags
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS atlas_feature_flags (
  name            TEXT        NOT NULL,
  description     TEXT,
  enabled         BOOLEAN     NOT NULL DEFAULT FALSE,
  affected_users  JSONB       NOT NULL DEFAULT to_jsonb('all'::text),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT atlas_feature_flags_pkey PRIMARY KEY (name)
);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_flags_enabled
  ON atlas_feature_flags (enabled);

-- ---------------------------------------------------------------------------
-- Mind profiles (chamber / observatory)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS atlas_mind_profiles (
  user_id         TEXT        NOT NULL,
  traits          JSONB       NOT NULL DEFAULT '{}',
  goals           JSONB       NOT NULL DEFAULT '[]'::jsonb,
  working_memory  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  cognitive_map   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT atlas_mind_profiles_pkey PRIMARY KEY (user_id)
);

-- ---------------------------------------------------------------------------
-- Bug Hunter queue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS atlas_bugs (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title                TEXT        NOT NULL,
  description          TEXT        NOT NULL,
  severity             TEXT        NOT NULL DEFAULT 'minor',
  status               TEXT        NOT NULL DEFAULT 'new',
  user_id              TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_to_changelog   BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_atlas_bugs_status ON atlas_bugs (status);
CREATE INDEX IF NOT EXISTS idx_atlas_bugs_created ON atlas_bugs (created_at DESC);

-- ---------------------------------------------------------------------------
-- Releases / changelog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS atlas_releases (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  version        TEXT        NOT NULL,
  changelog      TEXT        NOT NULL,
  resolved_bugs  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  published_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_by   TEXT        NOT NULL,
  CONSTRAINT atlas_releases_version_key UNIQUE (version)
);

CREATE INDEX IF NOT EXISTS idx_atlas_releases_published ON atlas_releases (published_at DESC);

-- ---------------------------------------------------------------------------
-- Overseer training records (optional persistence from OverseerTrainer)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS overseer_training_records (
  user_id               TEXT        NOT NULL,
  response_id           TEXT        NOT NULL,
  timestamp             BIGINT      NOT NULL,
  original_query        TEXT        NOT NULL,
  overseer_output       TEXT        NOT NULL,
  evaluation_scores     JSONB       NOT NULL,
  user_signals          JSONB       NOT NULL,
  inferred_satisfaction DOUBLE PRECISION NOT NULL,
  enhancement_applied   TEXT        NOT NULL,
  session_message_index INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT overseer_training_records_pkey PRIMARY KEY (user_id, response_id)
);

CREATE INDEX IF NOT EXISTS idx_overseer_training_user_time
  ON overseer_training_records (user_id, timestamp ASC);

-- ---------------------------------------------------------------------------
-- RLS (enable; tune policies when using anon key — service role bypasses)
-- ---------------------------------------------------------------------------
ALTER TABLE atlas_system_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_mind_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_bugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE overseer_training_records ENABLE ROW LEVEL SECURITY;
