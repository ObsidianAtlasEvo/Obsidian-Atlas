-- Migration 001: Add expires_at + confidence decay to user_feature_recommendations
-- Idempotent: uses IF NOT EXISTS / IGNORE patterns

-- Ensure the table exists (may not exist on fresh installs before any evolution runs)
CREATE TABLE IF NOT EXISTS user_feature_recommendations (
  user_id   TEXT NOT NULL,
  feature   TEXT NOT NULL,
  recommended_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, feature)
);

-- Add expires_at column (nullable — NULL means no expiry)
ALTER TABLE user_feature_recommendations ADD COLUMN expires_at TEXT DEFAULT NULL;

-- Add confidence column (1.0 = fully active, decays toward 0)
ALTER TABLE user_feature_recommendations ADD COLUMN confidence REAL DEFAULT 1.0;

-- Index for efficient active-flag queries (non-expired, high-confidence)
CREATE INDEX IF NOT EXISTS idx_feature_recs_user_active
  ON user_feature_recommendations(user_id, expires_at, confidence);
