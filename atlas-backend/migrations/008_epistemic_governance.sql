-- =============================================================================
-- Migration 008: Epistemic Governance Layer (Phase 0.85)
-- Follows: 007_identity_resolution.sql
-- Idempotent: all CREATE statements use IF NOT EXISTS / OR REPLACE
-- =============================================================================

-- ---------------------------------------------------------------------------
-- evidence_profiles
-- Per-signal evidence quality record.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidence_profiles (
  id                                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                            uuid        NOT NULL,
  memory_id                          uuid        REFERENCES user_memories(id) ON DELETE CASCADE,
  evidence_type                      text        NOT NULL,
    CONSTRAINT evidence_type_check CHECK (
      evidence_type IN (
        'user_stated_truth',
        'user_preference',
        'repeated_behavioral',
        'assistant_inference',
        'system_derived',
        'retrieved_factual',
        'contradicted',
        'low_confidence'
      )
    ),
  evidence_directness                text        NOT NULL DEFAULT 'inferred',
    CONSTRAINT evidence_directness_check CHECK (
      evidence_directness IN ('direct', 'inferred', 'pattern')
    ),
  evidence_strength                  real        NOT NULL DEFAULT 0.5,
    CONSTRAINT evidence_strength_range CHECK (evidence_strength >= 0.0 AND evidence_strength <= 1.0),
  evidence_recurrence                integer     NOT NULL DEFAULT 1,
  evidence_stability                 real        NOT NULL DEFAULT 0.5,
    CONSTRAINT evidence_stability_range CHECK (evidence_stability >= 0.0 AND evidence_stability <= 1.0),
  evidence_confirmation_status       text        NOT NULL DEFAULT 'unconfirmed',
    CONSTRAINT evidence_confirmation_status_check CHECK (
      evidence_confirmation_status IN ('unconfirmed', 'confirmed', 'contradicted')
    ),
  evidence_operational_weight        real        NOT NULL DEFAULT 0.3,
    CONSTRAINT evidence_operational_weight_range CHECK (evidence_operational_weight >= 0.0 AND evidence_operational_weight <= 1.0),
  operational_trust_level            text        NOT NULL DEFAULT 'low',
    CONSTRAINT operational_trust_level_check CHECK (
      operational_trust_level IN ('blocked', 'low', 'moderate', 'high')
    ),
  policy_eligibility_recommendation  text        NOT NULL DEFAULT 'reject',
    CONSTRAINT policy_eligibility_recommendation_check CHECK (
      policy_eligibility_recommendation IN ('apply', 'stage', 'reject')
    ),
  identity_eligibility_recommendation text       NOT NULL DEFAULT 'tentative',
    CONSTRAINT identity_eligibility_recommendation_check CHECK (
      identity_eligibility_recommendation IN ('durable', 'contextual', 'tentative', 'blocked')
    ),
  personalization_intensity_cap      text        NOT NULL DEFAULT 'light',
    CONSTRAINT personalization_intensity_cap_check CHECK (
      personalization_intensity_cap IN ('blocked', 'light', 'moderate', 'strong')
    ),
  created_at                         timestamptz NOT NULL DEFAULT now(),
  updated_at                         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evidence_profiles_user_created_idx
  ON evidence_profiles (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS evidence_profiles_memory_id_idx
  ON evidence_profiles (memory_id)
  WHERE memory_id IS NOT NULL;

-- RLS
ALTER TABLE evidence_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'evidence_profiles' AND policyname = 'evidence_profiles_owner_select'
  ) THEN
    CREATE POLICY evidence_profiles_owner_select
      ON evidence_profiles FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- policy_simulations
-- Policy simulation sandbox records.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS policy_simulations (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid        NOT NULL,
  policy_field             text        NOT NULL,
  before_value             jsonb       NOT NULL,
  after_value              jsonb       NOT NULL,
  evidence_chain           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  confidence               real        NOT NULL DEFAULT 0.5,
  contradiction_burden     real        NOT NULL DEFAULT 0.0,
    CONSTRAINT contradiction_burden_range CHECK (contradiction_burden >= 0.0 AND contradiction_burden <= 1.0),
  drift_risk_level         text        NOT NULL DEFAULT 'low',
    CONSTRAINT drift_risk_level_check CHECK (
      drift_risk_level IN ('low', 'moderate', 'elevated', 'severe')
    ),
  simulation_outcome       text        NOT NULL,
    CONSTRAINT simulation_outcome_check CHECK (
      simulation_outcome IN ('apply', 'stage', 'reject')
    ),
  simulation_reason        text,
  behavioral_delta_estimate jsonb      NOT NULL DEFAULT '{}'::jsonb,
  rollback_anchor_id       uuid        REFERENCES policy_simulations(id) ON DELETE SET NULL,
  applied_at               timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS policy_simulations_user_created_idx
  ON policy_simulations (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS policy_simulations_user_outcome_idx
  ON policy_simulations (user_id, simulation_outcome, created_at DESC);

-- RLS
ALTER TABLE policy_simulations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'policy_simulations' AND policyname = 'policy_simulations_owner_select'
  ) THEN
    CREATE POLICY policy_simulations_owner_select
      ON policy_simulations FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- drift_monitor_state
-- Per-user drift tracking state. One row per user.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drift_monitor_state (
  user_id                  uuid        PRIMARY KEY,
  overall_drift_score      real        NOT NULL DEFAULT 0.0,
    CONSTRAINT overall_drift_score_range CHECK (overall_drift_score >= 0.0 AND overall_drift_score <= 1.0),
  personalization_drift    real        NOT NULL DEFAULT 0.0,
  policy_drift             real        NOT NULL DEFAULT 0.0,
  scope_drift              real        NOT NULL DEFAULT 0.0,
  provenance_drift         real        NOT NULL DEFAULT 0.0,
  contradiction_drift      real        NOT NULL DEFAULT 0.0,
  instability_drift        real        NOT NULL DEFAULT 0.0,
  drift_risk_level         text        NOT NULL DEFAULT 'low',
    CONSTRAINT drift_monitor_risk_level_check CHECK (
      drift_risk_level IN ('low', 'moderate', 'elevated', 'severe')
    ),
  policy_mutation_count_7d integer     NOT NULL DEFAULT 0,
  correction_count_7d      integer     NOT NULL DEFAULT 0,
  assistant_inference_pct  real        NOT NULL DEFAULT 0.0,
  scope_leakage_count_7d   integer     NOT NULL DEFAULT 0,
  mutation_suppressed      boolean     NOT NULL DEFAULT false,
  last_evaluated_at        timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE drift_monitor_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'drift_monitor_state' AND policyname = 'drift_monitor_state_owner_select'
  ) THEN
    CREATE POLICY drift_monitor_state_owner_select
      ON drift_monitor_state FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- response_provenance_log
-- Internal per-response provenance records.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS response_provenance_log (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid        NOT NULL,
  turn_id                   text,
  active_memory_ids         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  active_identity_domains   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  active_policy_inputs      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  chamber_modifiers         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  contradiction_flags       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  suppressed_signals        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  personalization_intensity text        NOT NULL DEFAULT 'light',
  arbitration_suppressions  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  governance_version        text        NOT NULL DEFAULT '0.85',
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS response_provenance_log_user_created_idx
  ON response_provenance_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS response_provenance_log_turn_idx
  ON response_provenance_log (turn_id)
  WHERE turn_id IS NOT NULL;

-- Retention: rows older than 90 days are not needed operationally.
-- Application layer enforces this on read; optionally add a pg_cron job
-- or Supabase scheduled function to hard-delete rows > 90 days old.

-- RLS
ALTER TABLE response_provenance_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'response_provenance_log' AND policyname = 'response_provenance_log_owner_select'
  ) THEN
    CREATE POLICY response_provenance_log_owner_select
      ON response_provenance_log FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- behavior_change_audit
-- Causal chains from signal to behavior change.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS behavior_change_audit (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid        NOT NULL,
  originating_signal_ids     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  arbitration_decision_ids   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  simulation_event_ids       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  final_policy_event_ids     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  downstream_response_ids    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  behavior_shift_summary     text,
  policy_domains_affected    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS behavior_change_audit_user_created_idx
  ON behavior_change_audit (user_id, created_at DESC);

-- RLS
ALTER TABLE behavior_change_audit ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'behavior_change_audit' AND policyname = 'behavior_change_audit_owner_select'
  ) THEN
    CREATE POLICY behavior_change_audit_owner_select
      ON behavior_change_audit FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- updated_at trigger helper (idempotent)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION epistemic_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'evidence_profiles_updated_at'
  ) THEN
    CREATE TRIGGER evidence_profiles_updated_at
      BEFORE UPDATE ON evidence_profiles
      FOR EACH ROW EXECUTE FUNCTION epistemic_set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'drift_monitor_state_updated_at'
  ) THEN
    CREATE TRIGGER drift_monitor_state_updated_at
      BEFORE UPDATE ON drift_monitor_state
      FOR EACH ROW EXECUTE FUNCTION epistemic_set_updated_at();
  END IF;
END $$;

-- =============================================================================
-- End of 008_epistemic_governance.sql
-- =============================================================================
