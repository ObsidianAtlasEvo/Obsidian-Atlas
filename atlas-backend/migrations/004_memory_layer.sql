-- ============================================================================
-- Migration 004: Per-user memory layer (pgvector)
-- Date: 2026-04-18
-- Target: Supabase (Postgres + pgvector), NOT SQLite.
-- ============================================================================
--
-- Phase 0 of the Atlas Overseer evolution roadmap. Ships retrieval-augmented
-- memory without changing any model weights:
--
--   conversation_chunks — every user + assistant turn, embedded and stored
--                         for semantic retrieval.
--   user_memories       — durable facts, preferences, patterns, and
--                         corrections distilled from conversations.
--
-- Retrieval is pulled into the Overseer synthesis prompt pre-turn. Writes
-- happen post-turn, asynchronously — a failure in memory writes must NEVER
-- block a response.
--
-- Embedding dimensionality: 768. We use Gemini text-embedding-004 (768-dim)
-- as the canonical embedding for the memory layer. OpenAI text-embedding-3-
-- small (1536-dim) is NOT compatible with this column — embeddingService.ts
-- must route through Gemini for memory writes.
--
-- RLS: Users can only ever see their own memories / chunks. The service-role
-- key bypasses RLS for the background write path.
--
-- Apply in Supabase SQL Editor (or via `supabase db push`):
--
--   psql $SUPABASE_DB_URL -f atlas-backend/migrations/004_memory_layer.sql
--
-- This migration is idempotent.
-- ============================================================================

-- 1. pgvector extension ------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- 2. conversation_chunks -----------------------------------------------------
-- Every user and assistant turn goes here with a 768-dim embedding.
CREATE TABLE IF NOT EXISTS conversation_chunks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL,
  turn_id         uuid        NOT NULL,
  role            text        NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         text        NOT NULL,
  content_tokens  integer,
  embedding       vector(768),
  model_id        text,                       -- which model produced assistant chunks
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- HNSW index for fast cosine ANN search (pgvector >= 0.5).
CREATE INDEX IF NOT EXISTS idx_conversation_chunks_embedding
  ON conversation_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_conversation_chunks_user_created
  ON conversation_chunks (user_id, created_at DESC);

-- 3. user_memories -----------------------------------------------------------
-- Durable facts, preferences, patterns, corrections distilled post-turn.
CREATE TABLE IF NOT EXISTS user_memories (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL,
  kind               text        NOT NULL CHECK (kind IN ('preference', 'fact', 'pattern', 'correction', 'goal')),
  content            text        NOT NULL,
  embedding          vector(768),
  importance         real        NOT NULL DEFAULT 0.5 CHECK (importance >= 0.0 AND importance <= 1.0),
  source_turn_id     uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_referenced_at timestamptz NOT NULL DEFAULT now(),
  reference_count    integer     NOT NULL DEFAULT 0,
  superseded_by      uuid        REFERENCES user_memories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_user_memories_embedding
  ON user_memories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_user_memories_user_importance
  ON user_memories (user_id, importance DESC, last_referenced_at DESC)
  WHERE superseded_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_memories_user_kind
  ON user_memories (user_id, kind)
  WHERE superseded_by IS NULL;

-- 4. RLS ---------------------------------------------------------------------
-- Users read their own rows; service-role bypasses RLS entirely.
ALTER TABLE conversation_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memories        ENABLE ROW LEVEL SECURITY;

-- Drop-and-recreate keeps the migration idempotent without PG 15+ syntax.
DROP POLICY IF EXISTS conversation_chunks_owner_select ON conversation_chunks;
CREATE POLICY conversation_chunks_owner_select ON conversation_chunks
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_memories_owner_select ON user_memories;
CREATE POLICY user_memories_owner_select ON user_memories
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_memories_owner_update ON user_memories;
CREATE POLICY user_memories_owner_update ON user_memories
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_memories_owner_delete ON user_memories;
CREATE POLICY user_memories_owner_delete ON user_memories
  FOR DELETE USING (auth.uid() = user_id);

-- No INSERT policies — all writes come from the backend's service-role key,
-- which bypasses RLS. This prevents clients from forging memories directly.

-- 5. Retrieval helper function ----------------------------------------------
-- Callable from the backend via Supabase REST /rpc/atlas_recall_memories.
-- Returns the top-K most relevant rows for a user, combining memories +
-- recent conversation chunks, ranked by cosine similarity.
CREATE OR REPLACE FUNCTION atlas_recall_memories(
  p_user_id     uuid,
  p_query_embed vector(768),
  p_memory_k    integer DEFAULT 8,
  p_chunk_k     integer DEFAULT 4,
  p_chunk_days  integer DEFAULT 30
)
RETURNS TABLE (
  source   text,
  kind     text,
  content  text,
  similarity real,
  created_at timestamptz,
  id       uuid
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
      m.id                   AS id
    FROM user_memories m
    WHERE m.user_id = p_user_id
      AND m.superseded_by IS NULL
      AND m.embedding IS NOT NULL
    ORDER BY
      -- Hybrid rank: semantic similarity scaled by importance.
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
      c.id                   AS id
    FROM conversation_chunks c
    WHERE c.user_id = p_user_id
      AND c.embedding IS NOT NULL
      AND c.created_at > now() - make_interval(days => p_chunk_days)
    ORDER BY c.embedding <=> p_query_embed
    LIMIT p_chunk_k
  );
$$;

-- Service role may call the RPC. Policy authors still hold auth.uid() checks
-- via the underlying tables' RLS when invoked with a user JWT.
GRANT EXECUTE ON FUNCTION atlas_recall_memories TO authenticated, service_role;
