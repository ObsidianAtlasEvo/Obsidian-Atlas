-- Migration 002: Queryable eval history table
-- Stores per-exchange evaluation scores alongside the existing JSONL dataset writes.

CREATE TABLE IF NOT EXISTS eval_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  truth_alignment REAL,
  cognitive_density REAL,
  style_adherence REAL,
  combined_normalized REAL,
  gap_flagged INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'llm',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_eval_history_user_created ON eval_history(user_id, created_at DESC);
