-- =============================================================================
-- Migration 012: Sovereign Interface (Phase 0.98)
-- Date: 2026-06-20
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. home_surface_state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS home_surface_state (
  id                              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                         uuid          NOT NULL,
  today_summary                   text,
  active_workstream_count         integer       NOT NULL DEFAULT 0,
  open_commitment_count           integer       NOT NULL DEFAULT 0,
  unresolved_contradiction_count  integer       NOT NULL DEFAULT 0,
  drift_alert_count               integer       NOT NULL DEFAULT 0,
  surface_metadata                jsonb         NOT NULL DEFAULT '{}'::jsonb,
  generated_at                    timestamptz   NOT NULL DEFAULT now(),
  created_at                      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_surface_user
  ON home_surface_state (user_id, generated_at DESC);

ALTER TABLE home_surface_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'home_surface_state'
      AND policyname = 'owner_select_home_surface_state'
  ) THEN
    CREATE POLICY owner_select_home_surface_state
      ON home_surface_state FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. behavior_transparency_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS behavior_transparency_log (
  id                        uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid          NOT NULL,
  trigger_event             text          NOT NULL,
  reasoning_summary         text          NOT NULL,
  policy_applied            text,
  confidence_level          text,
  transparency_metadata     jsonb         NOT NULL DEFAULT '{}'::jsonb,
  logged_at                 timestamptz   NOT NULL DEFAULT now(),
  created_at                timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transparency_user_logged
  ON behavior_transparency_log (user_id, logged_at DESC);

ALTER TABLE behavior_transparency_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'behavior_transparency_log'
      AND policyname = 'owner_select_behavior_transparency_log'
  ) THEN
    CREATE POLICY owner_select_behavior_transparency_log
      ON behavior_transparency_log FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. creator_console_state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS creator_console_state (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid          NOT NULL,
  active_chamber      text,
  active_mode         text,
  active_filters      jsonb         NOT NULL DEFAULT '{}'::jsonb,
  pinned_modules      jsonb         NOT NULL DEFAULT '[]'::jsonb,
  console_metadata    jsonb         NOT NULL DEFAULT '{}'::jsonb,
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  created_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_console_user
  ON creator_console_state (user_id, updated_at DESC);

ALTER TABLE creator_console_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'creator_console_state'
      AND policyname = 'owner_select_creator_console_state'
  ) THEN
    CREATE POLICY owner_select_creator_console_state
      ON creator_console_state FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. timeline_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS timeline_events (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid          NOT NULL,
  event_type        text          NOT NULL,
  title             text          NOT NULL,
  description       text,
  event_at          timestamptz   NOT NULL DEFAULT now(),
  group_key         text,
  event_metadata    jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_events_user
  ON timeline_events (user_id, event_at DESC);

ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'timeline_events'
      AND policyname = 'owner_select_timeline_events'
  ) THEN
    CREATE POLICY owner_select_timeline_events
      ON timeline_events FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. directive_surface_state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS directive_surface_state (
  id                          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid          NOT NULL,
  surface_summary             text,
  active_directive_count      integer       NOT NULL DEFAULT 0,
  blocked_chain_count         integer       NOT NULL DEFAULT 0,
  pending_decision_count      integer       NOT NULL DEFAULT 0,
  surface_metadata            jsonb         NOT NULL DEFAULT '{}'::jsonb,
  generated_at                timestamptz   NOT NULL DEFAULT now(),
  created_at                  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_directive_surface_user
  ON directive_surface_state (user_id, generated_at DESC);

ALTER TABLE directive_surface_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'directive_surface_state'
      AND policyname = 'owner_select_directive_surface_state'
  ) THEN
    CREATE POLICY owner_select_directive_surface_state
      ON directive_surface_state FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. chamber_interface_configs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chamber_interface_configs (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid          NOT NULL,
  chamber                  text          NOT NULL,
  layout_variant           text,
  information_hierarchy    jsonb         NOT NULL DEFAULT '[]'::jsonb,
  action_affordances       jsonb         NOT NULL DEFAULT '[]'::jsonb,
  config_metadata          jsonb         NOT NULL DEFAULT '{}'::jsonb,
  updated_at               timestamptz   NOT NULL DEFAULT now(),
  created_at               timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chamber_configs_user_chamber
  ON chamber_interface_configs (user_id, chamber);

ALTER TABLE chamber_interface_configs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chamber_interface_configs'
      AND policyname = 'owner_select_chamber_interface_configs'
  ) THEN
    CREATE POLICY owner_select_chamber_interface_configs
      ON chamber_interface_configs FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. cognition_maps
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cognition_maps (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid          NOT NULL,
  map_type        text          NOT NULL,
  nodes           jsonb         NOT NULL DEFAULT '[]'::jsonb,
  edges           jsonb         NOT NULL DEFAULT '[]'::jsonb,
  map_metadata    jsonb         NOT NULL DEFAULT '{}'::jsonb,
  generated_at    timestamptz   NOT NULL DEFAULT now(),
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cognition_maps_user_type
  ON cognition_maps (user_id, map_type, generated_at DESC);

ALTER TABLE cognition_maps ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'cognition_maps'
      AND policyname = 'owner_select_cognition_maps'
  ) THEN
    CREATE POLICY owner_select_cognition_maps
      ON cognition_maps FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- =============================================================================
-- END OF MIGRATION 012
-- =============================================================================
