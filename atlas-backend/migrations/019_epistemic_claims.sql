-- =============================================================================
-- Migration 019: Epistemic Claims (Inline Truth Classification)
-- Date: 2026-05-12
-- =============================================================================
--
-- Stores per-response epistemic claim classifications produced by the
-- post-synthesis epistemicTaggerService. Each row is a single discrete claim
-- identified in an AI response, classified as FACTUAL / INFERRED /
-- SPECULATIVE / UNVERIFIABLE with a confidence level and one-line basis.
--
-- Conventions:
--   - Idempotent (CREATE TABLE IF NOT EXISTS / DROP POLICY IF EXISTS).
--   - user_id-keyed with RLS: `auth.uid() = user_id`.
--   - Owner-select + owner-insert only (service role bypasses RLS for writes).
-- =============================================================================

CREATE TABLE IF NOT EXISTS truth_claims (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id          text NOT NULL,
  response_id         text,
  claim_text          text NOT NULL,
  classification      text NOT NULL CHECK (classification IN ('FACTUAL', 'INFERRED', 'SPECULATIVE', 'UNVERIFIABLE')),
  confidence          text NOT NULL CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  basis               text,
  overall_uncertainty text CHECK (overall_uncertainty IN ('LOW', 'MEDIUM', 'HIGH')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE truth_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS truth_claims_owner_select ON truth_claims;
CREATE POLICY truth_claims_owner_select ON truth_claims
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS truth_claims_owner_insert ON truth_claims;
CREATE POLICY truth_claims_owner_insert ON truth_claims
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_truth_claims_user_session
  ON truth_claims (user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_truth_claims_classification
  ON truth_claims (user_id, classification);
