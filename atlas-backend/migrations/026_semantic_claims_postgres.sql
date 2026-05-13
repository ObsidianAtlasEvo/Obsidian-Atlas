-- =============================================================================
-- Migration 026: semantic_claims (Postgres counterpart to the SQLite schema in
-- 022_semantic_claims.sql)
-- Date: 2026-05-13
-- Target: Supabase (Postgres). Follows 025_behavior_adaptation_events.sql.
--
-- Notes:
--   * The existing migrations/022_semantic_claims.sql is a SQLite schema
--     reference (no uuid, no jsonb, no RLS) applied by initSqlite() at boot;
--     it is NOT a Postgres migration. This file promotes the same table to
--     Postgres so the P4 cutover can route writes via storeFlags.semanticClaims().
--   * Schema mirrors the SQLite shape 1:1 with type upgrades:
--       TEXT id           -> uuid
--       TEXT user_id      -> uuid (auth.users FK)
--       TEXT JSON         -> jsonb
--       TEXT ISO times    -> timestamptz
--   * No embedding column. If we later want vector search over semantic
--     claims, that is a separate migration.
-- =============================================================================

CREATE TABLE IF NOT EXISTS semantic_claims (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claim               text        NOT NULL,
  domain              text,
  confidence          real        NOT NULL DEFAULT 0.6
    CHECK (confidence >= 0.0 AND confidence <= 1.0),
  evidence_memory_ids jsonb       NOT NULL DEFAULT '[]'::jsonb,
  evidence_count      integer     NOT NULL DEFAULT 0,
  times_surfaced      integer     NOT NULL DEFAULT 0,
  last_surfaced_at    timestamptz,
  invalidated_at      timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_semantic_claims_user_active
  ON semantic_claims (user_id, invalidated_at, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_semantic_claims_user_domain
  ON semantic_claims (user_id, domain, invalidated_at);

ALTER TABLE semantic_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS semantic_claims_owner_all ON semantic_claims;
CREATE POLICY semantic_claims_owner_all ON semantic_claims
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
