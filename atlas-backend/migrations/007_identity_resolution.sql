-- ============================================================================
-- Migration 007: Identity Resolution Engine (Phase 0.8)
-- Date: 2026-04-19
-- Target: Supabase (Postgres), follows 006.
-- ============================================================================
--
-- Introduces the identity resolution substrate:
--
--   user_identity_domains    — resolved identity state per domain per user
--   identity_signals         — individual resolved signals feeding into domains
--   identity_diff_log        — append-only log of identity state changes
--   correction_priority_events — log of correction events and demotion actions
--
-- Also adds:
--   atlas_identity_state(p_user_id)  — RPC returning all non-superseded
--                                      identity domains with signal counts
--
-- Idempotent — safe to re-apply.
-- ============================================================================

-- ── 1. user_identity_domains ─────────────────────────────────────────────────
--
-- Tracks resolved identity state per domain per user.
-- One row per (user_id, domain, scope_type, scope_key) combination.

CREATE TABLE IF NOT EXISTS user_identity_domains (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL,
  domain              text        NOT NULL
                        CHECK (domain IN (
                          'communication_profile',
                          'challenge_profile',
                          'epistemic_profile',
                          'chamber_profile',
                          'workflow_profile',
                          'active_constraints'
                        )),
  confidence          real        DEFAULT 0.5
                        CHECK (confidence >= 0.0 AND confidence <= 1.0),
  stability           real        DEFAULT 0.5
                        CHECK (stability >= 0.0 AND stability <= 1.0),
  scope_type          text        NOT NULL DEFAULT 'global'
                        CHECK (scope_type IN ('global','chamber','project','topic','session')),
  scope_key           text,
  last_changed_at     timestamptz NOT NULL DEFAULT now(),
  contradiction_status text       NOT NULL DEFAULT 'none'
                        CHECK (contradiction_status IN ('none','unresolved','resolved')),
  resolution_version  text        NOT NULL DEFAULT '0.8',
  payload             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one resolved row per (user, domain, scope_type, scope_key).
-- COALESCE maps NULL scope_key to '' so the unique index works across Postgres versions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_domains_unique
  ON user_identity_domains (user_id, domain, scope_type, COALESCE(scope_key, ''));

-- Composite lookup index.
CREATE INDEX IF NOT EXISTS idx_identity_domains_user
  ON user_identity_domains (user_id, domain);

ALTER TABLE user_identity_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS identity_domains_owner_select ON user_identity_domains;
CREATE POLICY identity_domains_owner_select ON user_identity_domains
  FOR SELECT USING (auth.uid() = user_id);

-- ── 2. identity_signals ──────────────────────────────────────────────────────
--
-- Tracks individual resolved signals that feed into domain state.

CREATE TABLE IF NOT EXISTS identity_signals (
  id                    uuid        PRIMARY KEY,
  user_id               uuid        NOT NULL,
  memory_id             uuid        REFERENCES user_memories(id) ON DELETE SET NULL,
  domain                text        NOT NULL
                          CHECK (domain IN (
                            'communication_profile',
                            'challenge_profile',
                            'epistemic_profile',
                            'chamber_profile',
                            'workflow_profile',
                            'active_constraints'
                          )),
  signal_content        text        NOT NULL,
  scope_type            text        NOT NULL DEFAULT 'global'
                          CHECK (scope_type IN ('global','chamber','project','topic','session')),
  scope_key             text,
  scope_strength        real        DEFAULT 0.5
                          CHECK (scope_strength >= 0.0 AND scope_strength <= 1.0),
  scope_confidence      real        DEFAULT 0.5
                          CHECK (scope_confidence >= 0.0 AND scope_confidence <= 1.0),
  scope_expiration      timestamptz,
  operational_eligibility boolean   NOT NULL DEFAULT false,
  identity_weight       real        DEFAULT 0.5
                          CHECK (identity_weight >= 0.0 AND identity_weight <= 1.0),
  explicitness_level    text        NOT NULL DEFAULT 'inferred'
                          CHECK (explicitness_level IN ('explicit','inferred','system_derived')),
  correction_priority   integer     NOT NULL DEFAULT 0,
  provenance            text        NOT NULL DEFAULT 'assistant_inferred',
  active                boolean     NOT NULL DEFAULT true,
  superseded_by         uuid        REFERENCES identity_signals(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_signals_user_domain
  ON identity_signals (user_id, domain, active);

CREATE INDEX IF NOT EXISTS idx_identity_signals_memory
  ON identity_signals (memory_id)
  WHERE memory_id IS NOT NULL;

ALTER TABLE identity_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS identity_signals_owner_select ON identity_signals;
CREATE POLICY identity_signals_owner_select ON identity_signals
  FOR SELECT USING (auth.uid() = user_id);

-- ── 3. identity_diff_log ─────────────────────────────────────────────────────
--
-- Append-only log of identity state changes. Never updated, only inserted.

CREATE TABLE IF NOT EXISTS identity_diff_log (
  id                  uuid        PRIMARY KEY,
  user_id             uuid        NOT NULL,
  domain              text        NOT NULL
                        CHECK (domain IN (
                          'communication_profile',
                          'challenge_profile',
                          'epistemic_profile',
                          'chamber_profile',
                          'workflow_profile',
                          'active_constraints'
                        )),
  diff_type           text        NOT NULL
                        CHECK (diff_type IN (
                          'added',
                          'strengthened',
                          'weakened',
                          'corrected',
                          'scoped',
                          'contradicted',
                          'demoted',
                          'removed',
                          'reactivated'
                        )),
  before_payload      jsonb,
  after_payload       jsonb,
  reason              text,
  evidence_memory_ids jsonb       NOT NULL DEFAULT '[]'::jsonb,
  triggered_by        text
                        CHECK (triggered_by IN (
                          'distiller',
                          'correction',
                          'decay',
                          'arbitrator',
                          'system'
                        )),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_diff_user
  ON identity_diff_log (user_id, created_at DESC);

ALTER TABLE identity_diff_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS identity_diff_owner_select ON identity_diff_log;
CREATE POLICY identity_diff_owner_select ON identity_diff_log
  FOR SELECT USING (auth.uid() = user_id);

-- ── 4. correction_priority_events ────────────────────────────────────────────
--
-- Log of correction events and their demotion actions.

CREATE TABLE IF NOT EXISTS correction_priority_events (
  id                      uuid        PRIMARY KEY,
  user_id                 uuid        NOT NULL,
  correction_memory_id    uuid        REFERENCES user_memories(id) ON DELETE SET NULL,
  demoted_signal_ids      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  superseded_memory_ids   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  correction_content      text        NOT NULL,
  scope_type              text        NOT NULL DEFAULT 'global'
                            CHECK (scope_type IN ('global','chamber','project','topic','session')),
  scope_key               text,
  domains_affected        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  policy_rollback_candidate boolean   NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_correction_events_user
  ON correction_priority_events (user_id, created_at DESC);

ALTER TABLE correction_priority_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS correction_events_owner_select ON correction_priority_events;
CREATE POLICY correction_events_owner_select ON correction_priority_events
  FOR SELECT USING (auth.uid() = user_id);

-- ── 5. RPC: atlas_identity_state ─────────────────────────────────────────────
--
-- Returns all non-superseded identity domains for a user, enriched with
-- the count of active signals per domain.

CREATE OR REPLACE FUNCTION atlas_identity_state(
  p_user_id uuid
)
RETURNS TABLE (
  id                   uuid,
  domain               text,
  confidence           real,
  stability            real,
  scope_type           text,
  scope_key            text,
  last_changed_at      timestamptz,
  contradiction_status text,
  resolution_version   text,
  payload              jsonb,
  active_signal_count  bigint,
  created_at           timestamptz,
  updated_at           timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    d.id,
    d.domain,
    d.confidence,
    d.stability,
    d.scope_type,
    d.scope_key,
    d.last_changed_at,
    d.contradiction_status,
    d.resolution_version,
    d.payload,
    COALESCE(s.signal_count, 0)::bigint AS active_signal_count,
    d.created_at,
    d.updated_at
  FROM user_identity_domains d
  LEFT JOIN (
    SELECT
      user_id,
      domain,
      scope_type,
      COALESCE(scope_key, '') AS scope_key_norm,
      COUNT(*) AS signal_count
    FROM identity_signals
    WHERE user_id = p_user_id
      AND active = true
      AND superseded_by IS NULL
    GROUP BY user_id, domain, scope_type, COALESCE(scope_key, '')
  ) s ON (
    s.user_id    = d.user_id
    AND s.domain = d.domain
    AND s.scope_type = d.scope_type
    AND s.scope_key_norm = COALESCE(d.scope_key, '')
  )
  WHERE d.user_id = p_user_id
  ORDER BY d.domain, d.scope_type, d.scope_key NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION atlas_identity_state TO authenticated, service_role;
