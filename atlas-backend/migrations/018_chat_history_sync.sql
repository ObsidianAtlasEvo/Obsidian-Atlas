-- =============================================================================
-- Migration 018: Chat History Sync
-- Date: 2026-04-22
-- =============================================================================
--
-- Mirrors the Dexie (IndexedDB) `chatThreads` and `chatMessages` tables
-- server-side so chat history follows a user across devices and browsers.
--
-- Tables:
--   1. chat_threads   — per-thread metadata (title, channel, counts).
--   2. chat_messages  — per-message rows (role, content, FSM state).
--
-- Both tables:
--   - Idempotent (CREATE TABLE IF NOT EXISTS / DROP POLICY IF EXISTS).
--   - user_id-keyed with RLS: `auth.uid() = user_id`.
--   - Soft-delete via `deleted_at` to support tombstoned list views.
--   - Indexed for the two hot paths: list-threads-by-user and
--     list-messages-by-thread.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. chat_threads
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chat_threads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,
  thread_id           text NOT NULL UNIQUE,
  title               text NOT NULL DEFAULT 'New thread',
  channel             text NOT NULL DEFAULT 'atlas',
  last_request_state  text NOT NULL DEFAULT 'idle',
  message_count       integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_threads_owner ON chat_threads;
CREATE POLICY chat_threads_owner ON chat_threads FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_chat_threads_user_updated
  ON chat_threads (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chat_threads_thread_id
  ON chat_threads (thread_id);

-- ---------------------------------------------------------------------------
-- 2. chat_messages
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chat_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,
  thread_id           text NOT NULL,
  message_id          text NOT NULL UNIQUE,
  role                text NOT NULL,
  content             text NOT NULL DEFAULT '',
  request_state       text NOT NULL DEFAULT 'idle',
  model_used          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_messages_owner ON chat_messages;
CREATE POLICY chat_messages_owner ON chat_messages FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread
  ON chat_messages (thread_id, created_at ASC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_user
  ON chat_messages (user_id, created_at DESC)
  WHERE deleted_at IS NULL;
