-- ============================================================================
-- Migration 006: Memory Governance Hardening (Phase 0.75)
-- Date: 2026-04-18
-- Target: Supabase (Postgres), follows 004 + 005.
-- ============================================================================
--
-- Extends user_memories with a full governance substrate:
--
--   memory_class        — taxonomy: durable|contextual|tentative|corrected|
--                         superseded|anomaly
--   provenance          — origin: user_stated|user_confirmed|assistant_inferred|
--                         system_derived|corrected_by_user
--   confirmation_status — unconfirmed|confirmed|contradicted|quarantined
--   contradiction_status— none|unresolved|resolved_superseded|resolved_demoted
--   stability_score     — 0..1, starts at 0.5, rises with reaffirmation, falls
--                         with contradiction. Guards policy eligibility.
--   recurrence_count    — how many independent evidence events corroborated this
--   correction_count    — how many times a correction targeted this memory
--   decay_policy        — fast|standard|slow|none
--   scope_type          — global|topic|chamber|project|session
--   scope_key           — free-text key when scope_type != global (e.g. "atlas-arch")
--   policy_eligible     — false until class+provenance+stability gate is passed
--   quarantined         — true → excluded from recall and policy writes
--   supersession_reason — why an older memory was replaced
--   supersession_mode   — narrowed|expanded|replaced|corrected|conflict_demoted
--   last_reaffirmed_at  — last time independent evidence matched this memory
--   last_contradicted_at— last time contradicting evidence appeared
--   source_turn_ids     — JSONB array of turn_id UUIDs that produced this memory
--   extraction_rationale— short LLM-produced explanation of why this was extracted
--
-- Also adds memory_contradiction_log:
--   A persistent record of every time a new candidate conflicted with an
--   existing memory, what the arbitration decision was, and why.
--   Supports future interpretability UI and rollback analysis.
--
-- Also adds memory_governance_events:
--   Append-only event log for every governance-significant transition:
--   inserted, reaffirmed, contradicted, quarantined, policy-applied, decayed.
--   This is the audit spine for Phase 0.75 interpretability.
--
-- Idempotent — safe to re-apply.
-- ============================================================================

-- ── 1. Extend user_memories ──────────────────────────────────────────────

-- Memory class taxonomy (replaces/extends the generic 'kind' for lifecycle logic).
DO $$ BEGIN
  CREATE TYPE memory_class_enum AS ENUM (
    'durable',
    'contextual',
    'tentative',
    'corrected',
    'superseded',
    'anomaly'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Origin provenance.
DO $$ BEGIN
  CREATE TYPE memory_provenance_enum AS ENUM (
    'user_stated',
    'user_confirmed',
    'assistant_inferred',
    'system_derived',
    'corrected_by_user'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Confirmation state.
DO $$ BEGIN
  CREATE TYPE memory_confirmation_enum AS ENUM (
    'unconfirmed',
    'confirmed',
    'contradicted',
    'quarantined'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Contradiction state.
DO $$ BEGIN
  CREATE TYPE memory_contradiction_enum AS ENUM (
    'none',
    'unresolved',
    'resolved_superseded',
    'resolved_demoted'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Decay class.
DO $$ BEGIN
  CREATE TYPE memory_decay_policy_enum AS ENUM (
    'fast',
    'standard',
    'slow',
    'none'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Scope type.
DO $$ BEGIN
  CREATE TYPE memory_scope_type_enum AS ENUM (
    'global',
    'topic',
    'chamber',
    'project',
    'session'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Supersession mode.
DO $$ BEGIN
  CREATE TYPE memory_supersession_mode_enum AS ENUM (
    'narrowed',
    'expanded',
    'replaced',
    'corrected',
    'conflict_demoted'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add governance columns to user_memories (all nullable for backwards compat).
ALTER TABLE user_memories
  ADD COLUMN IF NOT EXISTS memory_class        memory_class_enum         DEFAULT 'tentative',
  ADD COLUMN IF NOT EXISTS provenance          memory_provenance_enum    DEFAULT 'assistant_inferred',
  ADD COLUMN IF NOT EXISTS confirmation_status memory_confirmation_enum  DEFAULT 'unconfirmed',
  ADD COLUMN IF NOT EXISTS contradiction_status memory_contradiction_enum DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS stability_score     real                      DEFAULT 0.5
                             CHECK (stability_score >= 0.0 AND stability_score <= 1.0),
  ADD COLUMN IF NOT EXISTS recurrence_count    integer                   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correction_count    integer                   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS decay_policy        memory_decay_policy_enum  DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS scope_type          memory_scope_type_enum    DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS scope_key           text,
  ADD COLUMN IF NOT EXISTS policy_eligible     boolean                   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quarantined         boolean                   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supersession_reason text,
  ADD COLUMN IF NOT EXISTS supersession_mode   memory_supersession_mode_enum,
  ADD COLUMN IF NOT EXISTS last_reaffirmed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS last_contradicted_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_turn_ids     jsonb                     DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS extraction_rationale text;

-- Index: recall must be able to filter quarantined and class efficiently.
CREATE INDEX IF NOT EXISTS idx_user_memories_governance
  ON user_memories (user_id, quarantined, policy_eligible, memory_class)
  WHERE superseded_by IS NULL;

-- Index: contradiction status lookups.
CREATE INDEX IF NOT EXISTS idx_user_memories_contradiction
  ON user_memories (user_id, contradiction_status)
  WHERE contradiction_status != 'none';

-- Index: scope-aware lookups.
CREATE INDEX IF NOT EXISTS idx_user_memories_scope
  ON user_memories (user_id, scope_type, scope_key)
  WHERE superseded_by IS NULL AND quarantined = false;

-- Index: stability-based policy eligibility.
CREATE INDEX IF NOT EXISTS idx_user_memories_policy_eligible
  ON user_memories (user_id, stability_score DESC)
  WHERE policy_eligible = true AND quarantined = false AND superseded_by IS NULL;

-- ── 2. memory_contradiction_log ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memory_contradiction_log (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL,
  existing_memory_id  uuid        NOT NULL REFERENCES user_memories(id) ON DELETE CASCADE,
  candidate_content   text        NOT NULL,        -- the new candidate that conflicted
  candidate_class     memory_class_enum NOT NULL,
  candidate_provenance memory_provenance_enum NOT NULL,
  candidate_scope_type memory_scope_type_enum NOT NULL DEFAULT 'global',
  candidate_scope_key  text,
  similarity_score    real,                        -- cosine similarity at conflict detection
  arbitration_decision text       NOT NULL,        -- 'supersede'|'narrow'|'expand'|'quarantine'|'unresolved'|'discard'
  arbitration_reason  text,                        -- human-readable explanation
  new_memory_id       uuid        REFERENCES user_memories(id) ON DELETE SET NULL, -- set if a new row was written
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contradiction_log_user
  ON memory_contradiction_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contradiction_log_existing
  ON memory_contradiction_log (existing_memory_id);

ALTER TABLE memory_contradiction_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contradiction_log_owner_select ON memory_contradiction_log;
CREATE POLICY contradiction_log_owner_select ON memory_contradiction_log
  FOR SELECT USING (auth.uid() = user_id);

-- ── 3. memory_governance_events ──────────────────────────────────────────

-- Append-only event log for every governance-significant transition.
CREATE TABLE IF NOT EXISTS memory_governance_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL,
  memory_id   uuid        REFERENCES user_memories(id) ON DELETE SET NULL,
  event_type  text        NOT NULL
                CHECK (event_type IN (
                  'inserted',
                  'reaffirmed',
                  'contradicted',
                  'quarantined',
                  'policy_applied',
                  'decayed',
                  'superseded',
                  'corrected',
                  'unresolved_conflict'
                )),
  payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_governance_events_user
  ON memory_governance_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_governance_events_memory
  ON memory_governance_events (memory_id);

ALTER TABLE memory_governance_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS governance_events_owner_select ON memory_governance_events;
CREATE POLICY governance_events_owner_select ON memory_governance_events
  FOR SELECT USING (auth.uid() = user_id);

-- ── 4. Extend memory_distiller_runs for Phase 0.75 ───────────────────────

-- Track how many memories were quarantined or left in unresolved contradiction.
ALTER TABLE memory_distiller_runs
  ADD COLUMN IF NOT EXISTS memories_quarantined  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contradictions_found  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contradictions_unresolved integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS governance_version    text    DEFAULT '0.75';

-- ── 5. Recall function — govern by quarantine + scope ────────────────────

-- Drop the old 5-arg overload from migration 005 before replacing.
-- The new signature adds p_scope_type and p_scope_key.
DROP FUNCTION IF EXISTS atlas_recall_memories(uuid, vector, integer, integer, integer);

-- Upgraded atlas_recall_memories: skips quarantined rows entirely.
-- Legacy rows (quarantined IS NULL) are treated as not quarantined.
CREATE OR REPLACE FUNCTION atlas_recall_memories(
  p_user_id     uuid,
  p_query_embed vector(768),
  p_memory_k    integer DEFAULT 8,
  p_chunk_k     integer DEFAULT 4,
  p_chunk_days  integer DEFAULT 30,
  p_scope_type  memory_scope_type_enum DEFAULT NULL,
  p_scope_key   text DEFAULT NULL
)
RETURNS TABLE (
  source   text,
  kind     text,
  content  text,
  similarity real,
  created_at timestamptz,
  id       uuid,
  -- Phase 0.75 fields (null-safe for legacy rows)
  memory_class  text,
  provenance    text,
  scope_type    text,
  scope_key     text,
  stability_score real,
  policy_eligible boolean,
  contradiction_status text
)
LANGUAGE sql
STABLE
AS $$
  (
    SELECT
      'memory'::text         AS source,
      m.kind                 AS kind,
      m.content              AS content,
      1 - (m.embedding <=> p_query_embed) AS similarity,
      m.created_at           AS created_at,
      m.id                   AS id,
      COALESCE(m.memory_class::text, 'tentative') AS memory_class,
      COALESCE(m.provenance::text, 'assistant_inferred') AS provenance,
      COALESCE(m.scope_type::text, 'global') AS scope_type,
      m.scope_key            AS scope_key,
      COALESCE(m.stability_score, 0.5) AS stability_score,
      COALESCE(m.policy_eligible, false) AS policy_eligible,
      COALESCE(m.contradiction_status::text, 'none') AS contradiction_status
    FROM user_memories m
    WHERE m.user_id = p_user_id
      AND m.superseded_by IS NULL
      AND COALESCE(m.quarantined, false) = false
      AND m.embedding IS NOT NULL
      AND (
        p_scope_type IS NULL
        OR m.scope_type IS NULL
        OR m.scope_type = 'global'
        OR (m.scope_type = p_scope_type AND (p_scope_key IS NULL OR m.scope_key = p_scope_key))
      )
    ORDER BY
      (1 - (m.embedding <=> p_query_embed)) * (0.5 + 0.5 * m.importance) DESC
    LIMIT p_memory_k
  )
  UNION ALL
  (
    SELECT
      'chunk'::text          AS source,
      c.role                 AS kind,
      c.content              AS content,
      1 - (c.embedding <=> p_query_embed) AS similarity,
      c.created_at           AS created_at,
      c.id                   AS id,
      NULL::text             AS memory_class,
      NULL::text             AS provenance,
      'global'::text         AS scope_type,
      NULL::text             AS scope_key,
      NULL::real             AS stability_score,
      NULL::boolean          AS policy_eligible,
      NULL::text             AS contradiction_status
    FROM conversation_chunks c
    WHERE c.user_id = p_user_id
      AND c.embedding IS NOT NULL
      AND c.created_at > now() - make_interval(days => p_chunk_days)
    ORDER BY c.embedding <=> p_query_embed
    LIMIT p_chunk_k
  );
$$;

GRANT EXECUTE ON FUNCTION atlas_recall_memories TO authenticated, service_role;

-- ── 6. Policy-eligible memory query helper ───────────────────────────────

CREATE OR REPLACE FUNCTION atlas_policy_eligible_memories(
  p_user_id     uuid,
  p_limit       integer DEFAULT 10
)
RETURNS TABLE (
  id           uuid,
  kind         text,
  content      text,
  memory_class text,
  provenance   text,
  scope_type   text,
  scope_key    text,
  stability_score real,
  importance   real,
  recurrence_count integer,
  correction_count integer,
  created_at   timestamptz,
  last_reaffirmed_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.id,
    m.kind,
    m.content,
    m.memory_class::text,
    m.provenance::text,
    m.scope_type::text,
    m.scope_key,
    m.stability_score,
    m.importance,
    m.recurrence_count,
    m.correction_count,
    m.created_at,
    m.last_reaffirmed_at
  FROM user_memories m
  WHERE m.user_id = p_user_id
    AND m.policy_eligible = true
    AND COALESCE(m.quarantined, false) = false
    AND m.superseded_by IS NULL
    AND COALESCE(m.contradiction_status::text, 'none') NOT IN ('unresolved')
  ORDER BY m.stability_score DESC, m.importance DESC, m.last_reaffirmed_at DESC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION atlas_policy_eligible_memories TO service_role;

-- ── 7. Contradiction + quarantine inspection helper ───────────────────────

CREATE OR REPLACE FUNCTION atlas_conflicted_memories(
  p_user_id     uuid,
  p_limit       integer DEFAULT 20
)
RETURNS TABLE (
  id                    uuid,
  kind                  text,
  content               text,
  memory_class          text,
  provenance            text,
  contradiction_status  text,
  quarantined           boolean,
  stability_score       real,
  last_contradicted_at  timestamptz,
  created_at            timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.id,
    m.kind,
    m.content,
    COALESCE(m.memory_class::text, 'tentative'),
    COALESCE(m.provenance::text, 'assistant_inferred'),
    COALESCE(m.contradiction_status::text, 'none'),
    COALESCE(m.quarantined, false),
    COALESCE(m.stability_score, 0.5),
    m.last_contradicted_at,
    m.created_at
  FROM user_memories m
  WHERE m.user_id = p_user_id
    AND (
      COALESCE(m.quarantined, false) = true
      OR COALESCE(m.contradiction_status::text, 'none') IN ('unresolved')
    )
    AND m.superseded_by IS NULL
  ORDER BY m.last_contradicted_at DESC NULLS LAST, m.created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION atlas_conflicted_memories TO service_role;

-- ── 8. Decay helper — batch-demote stale unconfirmed assistant inferences ─

CREATE OR REPLACE FUNCTION atlas_apply_memory_decay(
  p_user_id     uuid
)
RETURNS integer   -- number of rows affected
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Fast decay: session-scope and tentative assistant inferences older than 7 days
  -- that have never been reaffirmed drop to anomaly class and lose policy eligibility.
  UPDATE user_memories
  SET
    memory_class     = 'anomaly',
    policy_eligible  = false,
    stability_score  = GREATEST(0.0, COALESCE(stability_score, 0.5) - 0.2)
  WHERE user_id = p_user_id
    AND superseded_by IS NULL
    AND COALESCE(quarantined, false) = false
    AND COALESCE(provenance::text, 'assistant_inferred') = 'assistant_inferred'
    AND COALESCE(confirmation_status::text, 'unconfirmed') = 'unconfirmed'
    AND COALESCE(memory_class::text, 'tentative') IN ('tentative', 'contextual')
    AND (last_reaffirmed_at IS NULL OR last_reaffirmed_at < now() - interval '7 days')
    AND created_at < now() - interval '7 days';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Standard decay: global confirmed preferences not seen in 60 days → stability -0.05
  UPDATE user_memories
  SET
    stability_score = GREATEST(0.1, COALESCE(stability_score, 0.5) - 0.05)
  WHERE user_id = p_user_id
    AND superseded_by IS NULL
    AND COALESCE(quarantined, false) = false
    AND COALESCE(memory_class::text, 'tentative') = 'durable'
    AND (last_reaffirmed_at IS NULL OR last_reaffirmed_at < now() - interval '60 days');

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION atlas_apply_memory_decay TO service_role;
