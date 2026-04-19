-- =============================================================================
-- Migration 013: Action Federation & Platform Sovereignty (Phase 0.985–0.99)
-- Date: 2026-06-25
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. action_contracts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS action_contracts (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid          NOT NULL,
  action_type         text          NOT NULL,
  target              text          NOT NULL,
  payload             jsonb         NOT NULL DEFAULT '{}'::jsonb,
  status              text          NOT NULL DEFAULT 'staged',
    CONSTRAINT action_contracts_status_check CHECK (
      status IN ('staged','approved','executing','completed','rejected','failed')
    ),
  risk_class          text          NOT NULL DEFAULT 'low',
    CONSTRAINT action_contracts_risk_check CHECK (
      risk_class IN ('low','medium','high','critical')
    ),
  reversibility       text          NOT NULL DEFAULT 'reversible',
    CONSTRAINT action_contracts_reversibility_check CHECK (
      reversibility IN ('reversible','partially_reversible','irreversible')
    ),
  contract_metadata   jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  executed_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_action_contracts_user_status
  ON action_contracts (user_id, status, created_at DESC);

ALTER TABLE action_contracts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'action_contracts'
      AND policyname = 'owner_select_action_contracts'
  ) THEN
    CREATE POLICY owner_select_action_contracts
      ON action_contracts FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. connector_registry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS connector_registry (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid          NOT NULL,
  connector_name        text          NOT NULL,
  connector_type        text,
  auth_method           text,
  health_status         text          NOT NULL DEFAULT 'unknown',
    CONSTRAINT connector_registry_health_check CHECK (
      health_status IN ('healthy','degraded','offline','unknown')
    ),
  trust_score           numeric(4,3)  NOT NULL DEFAULT 0.5,
  last_checked_at       timestamptz,
  connector_metadata    jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_connector_registry_user
  ON connector_registry (user_id, health_status, trust_score DESC);

ALTER TABLE connector_registry ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'connector_registry'
      AND policyname = 'owner_select_connector_registry'
  ) THEN
    CREATE POLICY owner_select_connector_registry
      ON connector_registry FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. constitutional_eval_results
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS constitutional_eval_results (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid          NOT NULL,
  eval_type       text          NOT NULL,
    CONSTRAINT constitutional_eval_type_check CHECK (
      eval_type IN (
        'sovereignty','transparency','truth_adherence','operator_fidelity',
        'anti_drift','minimal_mutation','recall_fidelity'
      )
    ),
  score           numeric(4,3)  NOT NULL DEFAULT 0,
  passed          boolean       NOT NULL,
  notes           text,
  eval_metadata   jsonb         NOT NULL DEFAULT '{}'::jsonb,
  evaluated_at    timestamptz   NOT NULL DEFAULT now(),
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_constitutional_eval_user_type
  ON constitutional_eval_results (user_id, eval_type, evaluated_at DESC);

ALTER TABLE constitutional_eval_results ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'constitutional_eval_results'
      AND policyname = 'owner_select_constitutional_eval_results'
  ) THEN
    CREATE POLICY owner_select_constitutional_eval_results
      ON constitutional_eval_results FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. watcher_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS watcher_events (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid          NOT NULL,
  watcher_type      text          NOT NULL,
  event_class       text          NOT NULL,
    CONSTRAINT watcher_events_class_check CHECK (
      event_class IN ('stall','staleness','opportunity','drift','violation','anomaly')
    ),
  severity          text          NOT NULL DEFAULT 'medium',
    CONSTRAINT watcher_events_severity_check CHECK (
      severity IN ('low','medium','high','critical')
    ),
  description       text          NOT NULL,
  resolved          boolean       NOT NULL DEFAULT false,
  watcher_metadata  jsonb         NOT NULL DEFAULT '{}'::jsonb,
  detected_at       timestamptz   NOT NULL DEFAULT now(),
  created_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_watcher_events_user_class
  ON watcher_events (user_id, event_class, resolved, detected_at DESC);

ALTER TABLE watcher_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'watcher_events'
      AND policyname = 'owner_select_watcher_events'
  ) THEN
    CREATE POLICY owner_select_watcher_events
      ON watcher_events FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. audit_governance_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_governance_log (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid          NOT NULL,
  event_type        text          NOT NULL,
    CONSTRAINT audit_governance_type_check CHECK (
      event_type IN (
        'freeze','revert','policy_mutation','suppression',
        'quarantine','inspection','approval'
      )
    ),
  actor             text,
  target            text,
  before_state      jsonb,
  after_state       jsonb,
  audit_metadata    jsonb         NOT NULL DEFAULT '{}'::jsonb,
  logged_at         timestamptz   NOT NULL DEFAULT now(),
  created_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_governance_user_type
  ON audit_governance_log (user_id, event_type, logged_at DESC);

ALTER TABLE audit_governance_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_governance_log'
      AND policyname = 'owner_select_audit_governance_log'
  ) THEN
    CREATE POLICY owner_select_audit_governance_log
      ON audit_governance_log FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- =============================================================================
-- END OF MIGRATION 013
-- =============================================================================
