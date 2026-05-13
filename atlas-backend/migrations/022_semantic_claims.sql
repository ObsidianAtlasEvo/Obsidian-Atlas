-- ---------------------------------------------------------------------------
-- 022_semantic_claims.sql — Semantic Memory Consolidation
--
-- Stores higher-order cognitive pattern claims derived by the semantic
-- consolidation Chronos job. These are NOT episodic facts (which live in
-- `memories`) but durable behavioral/cognitive patterns extracted from
-- clusters of facts, e.g. "tends to front-load planning before execution is
-- confirmed".
--
-- This file is the SQLite schema reference. The actual DDL is applied by
-- `initSqlite()` in src/db/sqlite.ts on boot so cold-start installs include
-- the table without an out-of-band migration step.
--
-- No RLS (SQLite is single-tenant; per-user isolation enforced in queries).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS semantic_claims (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  claim TEXT NOT NULL,                                -- the higher-order claim text
  domain TEXT,                                        -- planning | execution | communication | decision-making | learning | creativity | relationships | technical | financial | other
  confidence REAL NOT NULL DEFAULT 0.6,               -- 0.0–1.0
  evidence_memory_ids TEXT NOT NULL DEFAULT '[]',     -- JSON array of memory IDs that support this claim
  evidence_count INTEGER NOT NULL DEFAULT 0,
  times_surfaced INTEGER NOT NULL DEFAULT 0,
  last_surfaced_at TEXT,
  invalidated_at TEXT,                                -- NULL = active; populated when superseded
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_semantic_claims_user
  ON semantic_claims (user_id, invalidated_at, confidence DESC);

CREATE INDEX IF NOT EXISTS idx_semantic_claims_domain
  ON semantic_claims (user_id, domain, invalidated_at);
