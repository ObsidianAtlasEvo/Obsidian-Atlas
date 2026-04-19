-- =============================================================================
-- Migration 011: Truth & Reality Spine (Phase 0.97)
-- Date: 2026-06-15
-- Target: Supabase (Postgres), follows 010_operational_sovereignty.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. truth_claims
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS truth_claims (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid          NOT NULL,
  claim_text           text          NOT NULL,
  status               text          NOT NULL DEFAULT 'proposed',
    CONSTRAINT truth_claims_status_check CHECK (
      status IN ('proposed','supported','contested','stale','retired')
    ),
  confidence_score     numeric(4,3)  NOT NULL DEFAULT 0.5,
  evidence_score       numeric(4,3)  NOT NULL DEFAULT 0,
  claim_type           text,
  domain               text,
  claim_metadata       jsonb         NOT NULL DEFAULT '{}'::jsonb,
  last_validated_at    timestamptz,
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_truth_claims_user_status
  ON truth_claims (user_id, status, updated_at DESC);

ALTER TABLE truth_claims ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'truth_claims'
      AND policyname = 'owner_select_truth_claims'
  ) THEN
    CREATE POLICY owner_select_truth_claims
      ON truth_claims FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. claim_evidence
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS claim_evidence (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid          NOT NULL,
  claim_id            uuid          REFERENCES truth_claims(id) ON DELETE CASCADE,
  evidence_text       text          NOT NULL,
  evidence_type       text          NOT NULL,
    CONSTRAINT claim_evidence_type_check CHECK (
      evidence_type IN (
        'empirical','testimonial','inferential','documentary',
        'contextual','analogical','statistical','experimental',
        'theoretical','meta_analytic','expert_consensus'
      )
    ),
  authority_tier      integer       NOT NULL DEFAULT 3,
    CONSTRAINT claim_evidence_tier_check CHECK (authority_tier BETWEEN 1 AND 4),
  weight              numeric(4,3)  NOT NULL DEFAULT 0.5,
  source_url          text,
  evidence_metadata   jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_evidence_claim
  ON claim_evidence (user_id, claim_id, authority_tier);

ALTER TABLE claim_evidence ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'claim_evidence'
      AND policyname = 'owner_select_claim_evidence'
  ) THEN
    CREATE POLICY owner_select_claim_evidence
      ON claim_evidence FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. claim_contradictions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS claim_contradictions (
  id                        uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid          NOT NULL,
  claim_a_id                uuid          REFERENCES truth_claims(id) ON DELETE CASCADE,
  claim_b_id                uuid          REFERENCES truth_claims(id) ON DELETE CASCADE,
  tension_score             numeric(4,3)  NOT NULL DEFAULT 0.5,
  resolution_status         text          NOT NULL DEFAULT 'unresolved',
    CONSTRAINT claim_contradictions_status_check CHECK (
      resolution_status IN ('unresolved','acknowledged','resolved','false_positive')
    ),
  contradiction_metadata    jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at                timestamptz   NOT NULL DEFAULT now(),
  updated_at                timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_contradictions_user
  ON claim_contradictions (user_id, resolution_status, tension_score DESC);

ALTER TABLE claim_contradictions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'claim_contradictions'
      AND policyname = 'owner_select_claim_contradictions'
  ) THEN
    CREATE POLICY owner_select_claim_contradictions
      ON claim_contradictions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. assumptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assumptions (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid          NOT NULL,
  assumption_text       text          NOT NULL,
  fragility_score       numeric(4,3)  NOT NULL DEFAULT 0.5,
  impact_if_false       text,
  domain                text,
  status                text          NOT NULL DEFAULT 'active',
    CONSTRAINT assumptions_status_check CHECK (
      status IN ('active','challenged','invalidated','confirmed')
    ),
  assumption_metadata   jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assumptions_user_status
  ON assumptions (user_id, status, fragility_score DESC);

ALTER TABLE assumptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'assumptions'
      AND policyname = 'owner_select_assumptions'
  ) THEN
    CREATE POLICY owner_select_assumptions
      ON assumptions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. reality_drift_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reality_drift_events (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid          NOT NULL,
  drift_class       text          NOT NULL,
    CONSTRAINT reality_drift_class_check CHECK (
      drift_class IN (
        'epistemic','project','strategic','self_model',
        'assumption','narrative','confidence'
      )
    ),
  description       text          NOT NULL,
  severity          text          NOT NULL DEFAULT 'medium',
    CONSTRAINT reality_drift_severity_check CHECK (
      severity IN ('low','medium','high','critical')
    ),
  detected_at       timestamptz   NOT NULL DEFAULT now(),
  drift_metadata    jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reality_drift_user_detected
  ON reality_drift_events (user_id, detected_at DESC);

ALTER TABLE reality_drift_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'reality_drift_events'
      AND policyname = 'owner_select_reality_drift_events'
  ) THEN
    CREATE POLICY owner_select_reality_drift_events
      ON reality_drift_events FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. narratives
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS narratives (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid          NOT NULL,
  narrative_text      text          NOT NULL,
  distortion_risk     numeric(4,3)  NOT NULL DEFAULT 0,
  narrative_type      text,
  components          jsonb         NOT NULL DEFAULT '{}'::jsonb,
  narrative_metadata  jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_narratives_user
  ON narratives (user_id, created_at DESC);

ALTER TABLE narratives ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'narratives'
      AND policyname = 'owner_select_narratives'
  ) THEN
    CREATE POLICY owner_select_narratives
      ON narratives FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. truth_reviews
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS truth_reviews (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid          NOT NULL,
  summary                 text          NOT NULL,
  stale_claim_count       integer       NOT NULL DEFAULT 0,
  contradiction_count     integer       NOT NULL DEFAULT 0,
  drift_event_count       integer       NOT NULL DEFAULT 0,
  review_metadata         jsonb         NOT NULL DEFAULT '{}'::jsonb,
  reviewed_at             timestamptz   NOT NULL DEFAULT now(),
  created_at              timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_truth_reviews_user
  ON truth_reviews (user_id, reviewed_at DESC);

ALTER TABLE truth_reviews ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'truth_reviews'
      AND policyname = 'owner_select_truth_reviews'
  ) THEN
    CREATE POLICY owner_select_truth_reviews
      ON truth_reviews FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- =============================================================================
-- END OF MIGRATION 011
-- =============================================================================
