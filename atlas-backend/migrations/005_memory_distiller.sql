-- ============================================================================
-- Migration 005: Memory distiller cursor + audit log
-- Date: 2026-04-18
-- Target: Supabase (Postgres), follows 004_memory_layer.sql.
-- ============================================================================
--
-- Adds state tables for the per-user memory distiller (Phase 0.5):
--
--   memory_distiller_state  — one row per user, tracking the last
--                             conversation_chunk processed so the distiller
--                             is incremental and idempotent across runs.
--   memory_distiller_runs   — audit log of each distillation pass (for debug
--                             and so humans can understand what Atlas "learned"
--                             about them and when).
--
-- No RLS on _state (service-role only). _runs is owner-readable so a future
-- "why did you store that?" UI can surface the audit trail.
--
-- Apply manually:
--   psql $SUPABASE_DB_URL -f atlas-backend/migrations/005_memory_distiller.sql
--
-- Idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory_distiller_state (
  user_id                uuid        PRIMARY KEY,
  last_chunk_id          uuid,                      -- last conversation_chunks.id seen
  last_chunk_created_at  timestamptz,
  last_run_at            timestamptz NOT NULL DEFAULT now(),
  run_count              integer     NOT NULL DEFAULT 0,
  last_error             text
);

CREATE TABLE IF NOT EXISTS memory_distiller_runs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL,
  started_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz,
  chunks_scanned      integer     NOT NULL DEFAULT 0,
  memories_written    integer     NOT NULL DEFAULT 0,
  memories_superseded integer     NOT NULL DEFAULT 0,
  policy_patched      boolean     NOT NULL DEFAULT false,
  policy_patch        jsonb,                         -- what we changed on policy_profiles
  model_id            text,                          -- which LLM did the extraction
  status              text        NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'partial', 'error', 'skip')),
  error_message       text
);

CREATE INDEX IF NOT EXISTS idx_memory_distiller_runs_user_started
  ON memory_distiller_runs (user_id, started_at DESC);

ALTER TABLE memory_distiller_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_distiller_runs  ENABLE ROW LEVEL SECURITY;

-- State is service-role only. No user-facing policies.

DROP POLICY IF EXISTS memory_distiller_runs_owner_select ON memory_distiller_runs;
CREATE POLICY memory_distiller_runs_owner_select ON memory_distiller_runs
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================================
-- Helper: fetch new conversation chunks since the last cursor, oldest first.
-- Used by the distiller so it can process users incrementally.
-- ============================================================================
CREATE OR REPLACE FUNCTION atlas_pending_distiller_chunks(
  p_user_id       uuid,
  p_after_chunk   uuid,
  p_limit         integer DEFAULT 40
)
RETURNS TABLE (
  id          uuid,
  turn_id     uuid,
  role        text,
  content     text,
  created_at  timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT c.id, c.turn_id, c.role, c.content, c.created_at
  FROM conversation_chunks c
  WHERE c.user_id = p_user_id
    AND (
      p_after_chunk IS NULL
      OR c.created_at > (
        SELECT created_at FROM conversation_chunks WHERE id = p_after_chunk
      )
    )
  ORDER BY c.created_at ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION atlas_pending_distiller_chunks TO service_role;

-- ============================================================================
-- Helper: list users with un-distilled chunks newer than their cursor.
-- Called by the scheduler to pick the next N users to distill.
-- ============================================================================
CREATE OR REPLACE FUNCTION atlas_users_needing_distillation(
  p_limit      integer DEFAULT 20,
  p_min_new_chunks integer DEFAULT 4
)
RETURNS TABLE (
  user_id      uuid,
  new_chunks   bigint,
  last_run_at  timestamptz
)
LANGUAGE sql
STABLE
AS $$
  WITH user_counts AS (
    SELECT
      c.user_id,
      COUNT(*) FILTER (
        WHERE s.last_chunk_created_at IS NULL
           OR c.created_at > s.last_chunk_created_at
      ) AS new_chunks,
      COALESCE(s.last_run_at, 'epoch'::timestamptz) AS last_run_at
    FROM conversation_chunks c
    LEFT JOIN memory_distiller_state s ON s.user_id = c.user_id
    GROUP BY c.user_id, s.last_run_at
  )
  SELECT user_id, new_chunks, last_run_at
  FROM user_counts
  WHERE new_chunks >= p_min_new_chunks
  ORDER BY new_chunks DESC, last_run_at ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION atlas_users_needing_distillation TO service_role;
