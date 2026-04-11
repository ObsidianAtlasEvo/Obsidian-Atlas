-- =============================================================================
-- Atlas Evolution System — Supabase Schema
-- =============================================================================
-- Run once against your Supabase project (SQL Editor or migration runner).
-- Compatible with PostgreSQL 14+ (used by all current Supabase tiers).
--
-- Tables
--   atlas_evolution_profiles  — one row per user, stores the full profile JSONB
--   atlas_evolution_signals   — append-only event log, one row per captured signal
-- =============================================================================

-- ---------------------------------------------------------------------------
-- atlas_evolution_profiles
-- ---------------------------------------------------------------------------
-- Stores the full UserEvolutionProfile for each user.
-- profile_data contains everything except the columns modelled explicitly.
-- Keeping version and confidence as native columns enables efficient range
-- queries without unpacking JSONB (e.g. ORDER BY confidence DESC).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS atlas_evolution_profiles (
  -- Primary key — the application-level userId (e.g. Supabase Auth UUID).
  user_id           TEXT        NOT NULL,

  -- The full profile snapshot minus the fields modelled as native columns.
  -- Shape: Omit<UserEvolutionProfile, 'userId' | 'version' | 'confidence' | 'lastMutatedAt' | 'createdAt'>
  profile_data      JSONB       NOT NULL DEFAULT '{}',

  -- Monotonically increasing counter, incremented on every mutation cycle.
  version           INTEGER     NOT NULL DEFAULT 0,

  -- Normalised confidence score: 0.0000–1.0000.
  confidence        NUMERIC(5, 4) NOT NULL DEFAULT 0,

  -- Timestamp of the most recent evolution mutation (NULL until first mutation).
  last_mutated_at   TIMESTAMPTZ,

  -- Row creation timestamp.
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT atlas_evolution_profiles_pkey PRIMARY KEY (user_id),
  CONSTRAINT atlas_evolution_profiles_confidence_range
    CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT atlas_evolution_profiles_version_non_negative
    CHECK (version >= 0)
);

COMMENT ON TABLE atlas_evolution_profiles IS
  'Persistent evolution profile for each Obsidian Atlas user. '
  'Mutated autonomously after every interaction cycle.';

COMMENT ON COLUMN atlas_evolution_profiles.profile_data IS
  'Full serialised UserEvolutionProfile (trait snapshot, mutation history, etc.).';

COMMENT ON COLUMN atlas_evolution_profiles.version IS
  'Monotonically increasing version counter. Incremented on every evolution cycle.';

COMMENT ON COLUMN atlas_evolution_profiles.confidence IS
  '0–1 confidence score. Grows logarithmically with signal count.';

-- Index for fast single-user lookups (covered by PK, listed for clarity).
CREATE INDEX IF NOT EXISTS idx_evolution_profiles_user_id
  ON atlas_evolution_profiles (user_id);

-- ---------------------------------------------------------------------------
-- atlas_evolution_signals
-- ---------------------------------------------------------------------------
-- Append-only log of raw signals captured from user–Atlas exchanges.
-- Each row is one typed signal emitted by SignalCollector.
-- After processing, rows are marked processed = TRUE but never deleted
-- (they form the audit trail and allow full profile rebuilds).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS atlas_evolution_signals (
  -- UUID assigned by the application layer.
  id            UUID        NOT NULL,

  -- Application-level userId (matches atlas_evolution_profiles.user_id).
  user_id       TEXT        NOT NULL,

  -- Session identifier (opaque string, e.g. a UUID).
  session_id    TEXT        NOT NULL,

  -- Discriminator that drives trait extraction logic.
  -- Matches the SignalType union from evolutionTypes.ts.
  signal_type   TEXT        NOT NULL,

  -- Arbitrary structured data for this signal.
  -- Shape varies by signal_type — see SignalCollector for details.
  payload       JSONB       NOT NULL DEFAULT '{}',

  -- Relative importance: 0.000–1.000.
  weight        NUMERIC(4, 3) NOT NULL DEFAULT 0.5,

  -- FALSE until EvolutionEngine has incorporated this signal into a profile.
  processed     BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Creation timestamp (signals are ordered by this during extraction).
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT atlas_evolution_signals_pkey PRIMARY KEY (id),
  CONSTRAINT atlas_evolution_signals_weight_range
    CHECK (weight >= 0 AND weight <= 1),
  CONSTRAINT atlas_evolution_signals_signal_type_not_empty
    CHECK (char_length(signal_type) > 0)
);

COMMENT ON TABLE atlas_evolution_signals IS
  'Append-only log of raw evolution signals captured from user–Atlas interactions. '
  'Processed signals remain in the table as an audit trail.';

COMMENT ON COLUMN atlas_evolution_signals.signal_type IS
  'Discriminator matching the SignalType union: message_length, topic_affinity, etc.';

COMMENT ON COLUMN atlas_evolution_signals.payload IS
  'Signal-type-specific data (topic names, scores, durations, etc.).';

COMMENT ON COLUMN atlas_evolution_signals.weight IS
  'Relative importance weight 0–1 used during trait extraction.';

COMMENT ON COLUMN atlas_evolution_signals.processed IS
  'TRUE after the signal has been consumed by the EvolutionEngine.';

-- ---------------------------------------------------------------------------
-- Indexes on atlas_evolution_signals
-- ---------------------------------------------------------------------------

-- Primary query pattern: "all unprocessed signals for a user" used by
-- EvolutionRepository.getPendingSignals().
CREATE INDEX IF NOT EXISTS idx_evolution_signals_user_id_processed
  ON atlas_evolution_signals (user_id, processed)
  WHERE processed = FALSE;

-- Broad user_id index used for DELETE (GDPR erasure) and full-scan rebuilds.
CREATE INDEX IF NOT EXISTS idx_evolution_signals_user_id
  ON atlas_evolution_signals (user_id);

-- Index on processed alone — useful for admin queries like
-- "how many signals are pending globally?"
CREATE INDEX IF NOT EXISTS idx_evolution_signals_processed
  ON atlas_evolution_signals (processed);

-- Chronological ordering index — used by getPendingSignals ORDER BY created_at.
CREATE INDEX IF NOT EXISTS idx_evolution_signals_user_id_created_at
  ON atlas_evolution_signals (user_id, created_at ASC);

-- =============================================================================
-- Row-Level Security (RLS)
-- =============================================================================
-- Enable RLS on both tables. In production, add policies that allow
-- authenticated users to read/write only their own rows.
-- During development with a service-role key, these policies can be empty
-- (service-role bypasses RLS by default in Supabase).
-- =============================================================================

ALTER TABLE atlas_evolution_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_evolution_signals  ENABLE ROW LEVEL SECURITY;

-- Example production policy (uncomment and adapt when auth is configured):
-- CREATE POLICY "Users can read their own profile"
--   ON atlas_evolution_profiles
--   FOR SELECT
--   USING (auth.uid()::text = user_id);

-- CREATE POLICY "Users can read their own signals"
--   ON atlas_evolution_signals
--   FOR SELECT
--   USING (auth.uid()::text = user_id);
