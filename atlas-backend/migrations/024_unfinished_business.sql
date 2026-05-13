-- =============================================================================
-- Migration 024: unfinished_business (P4 — promote from SQLite, new table)
-- Date: 2026-05-13
-- Target: Supabase (Postgres), follows 023_doctrine_nodes.sql.
--
-- Promotes the SQLite `unfinished_business_items` table to a first-class
-- Postgres table. Read on the session-start hot path, so the indexes below
-- match the query patterns in unfinishedBusinessService.ts.
--
-- decision_id references decisions(id) (mig 010). During the P4 backfill,
-- SQLite text decision ids are coerced via
-- `deterministicUuid('srg_decisions', id)` — the same namespace used by
-- Stage A4, so FKs resolve once both stages have backfilled.
-- =============================================================================

CREATE TABLE IF NOT EXISTS unfinished_business (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind                          text        NOT NULL,
  title                         text        NOT NULL,
  description                   text        NOT NULL,
  significance_score            real        NOT NULL DEFAULT 0.5
    CHECK (significance_score >= 0.0 AND significance_score <= 1.0),
  recurrence_score              real        NOT NULL DEFAULT 0
    CHECK (recurrence_score >= 0.0 AND recurrence_score <= 1.0),
  urgency_score                 real        NOT NULL DEFAULT 0.5
    CHECK (urgency_score >= 0.0 AND urgency_score <= 1.0),
  identity_relevance_score      real        NOT NULL DEFAULT 0.5
    CHECK (identity_relevance_score >= 0.0 AND identity_relevance_score <= 1.0),
  composite_score               real        NOT NULL DEFAULT 0,
  surfaced_count                integer     NOT NULL DEFAULT 0,
  last_surfaced_at              timestamptz,
  status                        text        NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','snoozed','resolved','dropped')),
  decision_id                   uuid        REFERENCES decisions(id) ON DELETE SET NULL,
  constitution_version_group_id uuid,
  linked_claim_ids              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  pattern_fingerprint           text,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  resolved_at                   timestamptz,
  resolution_note               text
);

-- Hot path: session-start load of open items by composite_score
CREATE INDEX IF NOT EXISTS idx_unfinished_user_open
  ON unfinished_business (user_id, status, composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_unfinished_user_fingerprint
  ON unfinished_business (user_id, pattern_fingerprint);

ALTER TABLE unfinished_business ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS unfinished_business_owner_all ON unfinished_business;
CREATE POLICY unfinished_business_owner_all ON unfinished_business
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
