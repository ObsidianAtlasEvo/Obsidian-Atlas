-- =============================================================================
-- Migration 023: doctrine_nodes (P4 migration — promote from SQLite)
-- Date: 2026-05-13
-- Target: Supabase (Postgres), follows 021_watcher_digest.sql.
-- Note: 022_semantic_claims.sql is a SQLite schema-reference file, not a
-- Postgres migration. Next Postgres migration number is 023.
-- =============================================================================

CREATE TABLE IF NOT EXISTS doctrine_nodes (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  layer                    text        NOT NULL,
  title                    text        NOT NULL,
  body                     text        NOT NULL,
  priority                 integer     NOT NULL DEFAULT 0,
  immutable                boolean     NOT NULL DEFAULT false,
  origin                   text        NOT NULL DEFAULT 'user',
  version_group_id         uuid        NOT NULL,
  version                  integer     NOT NULL DEFAULT 1,
  supersedes_doctrine_id   uuid        REFERENCES doctrine_nodes(id) ON DELETE SET NULL,
  archived_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT doctrine_nodes_unique_version UNIQUE (user_id, version_group_id, version)
);

CREATE INDEX IF NOT EXISTS idx_doctrine_user_layer
  ON doctrine_nodes (user_id, layer, priority DESC);
CREATE INDEX IF NOT EXISTS idx_doctrine_user_active
  ON doctrine_nodes (user_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_doctrine_user_version
  ON doctrine_nodes (user_id, version_group_id);

ALTER TABLE doctrine_nodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doctrine_nodes_owner_select ON doctrine_nodes;
CREATE POLICY doctrine_nodes_owner_select ON doctrine_nodes
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS doctrine_nodes_owner_modify ON doctrine_nodes;
CREATE POLICY doctrine_nodes_owner_modify ON doctrine_nodes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
