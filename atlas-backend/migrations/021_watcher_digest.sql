-- ---------------------------------------------------------------------------
-- 021_watcher_digest.sql — Background Intelligence Digest
--
-- Augments the existing watcher_events table (created in 013) with the
-- fingerprint / acknowledged / title / entity columns the digest pipeline
-- needs, and introduces intelligence_digests for persistent briefings.
--
-- All operations are idempotent and re-runnable. RLS enforced per-owner.
-- ---------------------------------------------------------------------------

-- Base table (no-op if already created by 013)
CREATE TABLE IF NOT EXISTS watcher_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  entity_id TEXT,
  entity_type TEXT,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  title TEXT NOT NULL,
  description TEXT,
  fingerprint TEXT UNIQUE,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrate the 013-era schema forward: add columns the digest needs if missing.
ALTER TABLE watcher_events ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE watcher_events ADD COLUMN IF NOT EXISTS entity_id TEXT;
ALTER TABLE watcher_events ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE watcher_events ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE watcher_events ADD COLUMN IF NOT EXISTS fingerprint TEXT;
ALTER TABLE watcher_events ADD COLUMN IF NOT EXISTS acknowledged BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE watcher_events ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;

-- Backfill event_type / title from legacy columns so NOT NULL constraints hold.
UPDATE watcher_events SET event_type = event_class
  WHERE event_type IS NULL AND event_class IS NOT NULL;
UPDATE watcher_events SET title = LEFT(COALESCE(description, event_class, 'watcher event'), 280)
  WHERE title IS NULL;

-- Unique constraint on fingerprint (used for 2h idempotency on upsert).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'watcher_events_fingerprint_key'
  ) THEN
    BEGIN
      ALTER TABLE watcher_events ADD CONSTRAINT watcher_events_fingerprint_key UNIQUE (fingerprint);
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

ALTER TABLE watcher_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS watcher_events_owner_select ON watcher_events;
CREATE POLICY watcher_events_owner_select ON watcher_events
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS watcher_events_owner_insert ON watcher_events;
CREATE POLICY watcher_events_owner_insert ON watcher_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS watcher_events_owner_update ON watcher_events;
CREATE POLICY watcher_events_owner_update ON watcher_events
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_watcher_events_user_unacked
  ON watcher_events (user_id, acknowledged, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_watcher_events_fp
  ON watcher_events (fingerprint);

-- ---------------------------------------------------------------------------
-- intelligence_digests — persisted briefings, viewed-once per record.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS intelligence_digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  digest_type TEXT NOT NULL DEFAULT 'on_demand',
  event_count INTEGER NOT NULL DEFAULT 0,
  digest_markdown TEXT NOT NULL,
  viewed BOOLEAN NOT NULL DEFAULT FALSE,
  viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE intelligence_digests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intelligence_digests_owner_all ON intelligence_digests;
CREATE POLICY intelligence_digests_owner_all ON intelligence_digests
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_intelligence_digests_user
  ON intelligence_digests (user_id, created_at DESC);
