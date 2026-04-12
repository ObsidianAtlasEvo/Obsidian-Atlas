-- =============================================================================
-- Atlas Phase 3 — run after Phase 1 evolution + Phase 2 governance SQL
-- See atlas-phase3-package PHASE3-INTEGRATION-GUIDE.md
-- =============================================================================

-- Optional: RPC for SchemaVersionManager (SECURITY DEFINER — service role only)
-- CREATE OR REPLACE FUNCTION exec_sql(sql TEXT) RETURNS VOID ...

CREATE TABLE IF NOT EXISTS atlas_schema_migrations (
  id TEXT PRIMARY KEY,
  store TEXT NOT NULL,
  from_version INTEGER NOT NULL,
  to_version INTEGER NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER NOT NULL DEFAULT 0,
  records_affected INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  rollback_available BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_store ON atlas_schema_migrations (store, applied_at DESC);

CREATE TABLE IF NOT EXISTS atlas_explanations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  session_id TEXT,
  trigger_event TEXT NOT NULL,
  action_type TEXT NOT NULL,
  plain_language JSONB NOT NULL,
  policy_level INTEGER,
  contributing_signals JSONB DEFAULT '[]',
  confidence FLOAT,
  alternatives_considered JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_explanations_user ON atlas_explanations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_explanations_session ON atlas_explanations (session_id);

CREATE TABLE IF NOT EXISTS atlas_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  user_id TEXT,
  ip_address INET,
  user_agent TEXT,
  endpoint TEXT,
  payload_hash TEXT,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sec_events_type ON atlas_security_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_events_severity ON atlas_security_events (severity, created_at DESC);

CREATE TABLE IF NOT EXISTS atlas_projection_cursors (
  projection_name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  last_processed_event_id UUID,
  last_processed_at TIMESTAMPTZ,
  processed_count INTEGER NOT NULL DEFAULT 0,
  rebuilding BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (projection_name, user_id)
);

-- Align Phase 2 atlas_events with Phase 3 EventStore + idempotency
ALTER TABLE atlas_events
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS projection_rebuilt BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_idempotency
  ON atlas_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Row Level Security (Supabase advisor: tables in public + PostgREST)
--
-- The Atlas backend uses SUPABASE_SERVICE_KEY, which bypasses RLS in Supabase.
-- Enabling RLS with no policies for anon/authenticated denies direct browser/anon
-- access via the public API key; only the service role (server) can read/write.
-- Add explicit policies later if you intentionally expose rows to logged-in users.
-- -----------------------------------------------------------------------------
ALTER TABLE public.atlas_schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_explanations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_projection_cursors ENABLE ROW LEVEL SECURITY;
