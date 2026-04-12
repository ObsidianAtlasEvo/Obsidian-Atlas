-- =============================================================================
-- Atlas Governance — Phase 2 (run after evolution + sovereign Phase 1 SQL)
-- Aligns atlas_events with atlas-backend/src/infrastructure/eventBus.ts flush.
-- =============================================================================

-- Event bus durable log
CREATE TABLE IF NOT EXISTS atlas_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT '',
  session_id TEXT NOT NULL DEFAULT '',
  "timestamp" BIGINT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  source TEXT NOT NULL,
  correlation_id TEXT,
  caused_by TEXT,
  emitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_atlas_events_user ON atlas_events (user_id, emitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_atlas_events_type ON atlas_events (type, emitted_at DESC);

-- Mutation ledger (MutationLedger.ts — JSON record blob per row)
CREATE TABLE IF NOT EXISTS atlas_mutation_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  record JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mutation_ledger_user ON atlas_mutation_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_mutation_ledger_created ON atlas_mutation_ledger(created_at DESC);

CREATE TABLE IF NOT EXISTS atlas_mission_state (
  user_id TEXT PRIMARY KEY,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active_goals JSONB NOT NULL DEFAULT '[]',
  stated_prefs JSONB NOT NULL DEFAULT '{}',
  commitments JSONB NOT NULL DEFAULT '[]',
  context_summary TEXT
);

CREATE TABLE IF NOT EXISTS atlas_evidence_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  claim_text TEXT NOT NULL,
  verdict TEXT NOT NULL,
  confidence NUMERIC(4, 3) NOT NULL,
  evidence_refs TEXT[],
  arbitrator_notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_claims_message ON atlas_evidence_claims(message_id);

CREATE TABLE IF NOT EXISTS atlas_uncertainty_records (
  domain TEXT PRIMARY KEY,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confidence_mean NUMERIC(4, 3) NOT NULL DEFAULT 0.700,
  sample_count INTEGER NOT NULL DEFAULT 0,
  last_calibrated TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS atlas_evaluation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trigger TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  total_cases INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  delta_vs_prev INTEGER,
  failures JSONB NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_eval_snapshots_run ON atlas_evaluation_snapshots(run_at DESC);

-- Transparency control (UserEvolutionControl.save uses user_id + state JSONB)
CREATE TABLE IF NOT EXISTS atlas_evolution_control (
  user_id TEXT PRIMARY KEY,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  state JSONB NOT NULL DEFAULT '{}',
  evolution_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  paused_until TIMESTAMPTZ,
  excluded_traits TEXT[] NOT NULL DEFAULT '{}',
  reset_requested_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS atlas_sovereign_sessions (
  session_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sovereign_sessions_email ON atlas_sovereign_sessions(email);

CREATE TABLE IF NOT EXISTS atlas_sovereign_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  actor_ip TEXT,
  target_user_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  result TEXT NOT NULL,
  duration_ms INTEGER,
  session_id TEXT REFERENCES atlas_sovereign_sessions(session_id)
);
CREATE INDEX IF NOT EXISTS idx_sovereign_audit_timestamp ON atlas_sovereign_audit(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sovereign_audit_action ON atlas_sovereign_audit(action);
CREATE INDEX IF NOT EXISTS idx_sovereign_audit_result ON atlas_sovereign_audit(result);

ALTER TABLE atlas_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_mutation_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_mission_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_evidence_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_uncertainty_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_evaluation_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_evolution_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_sovereign_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_sovereign_audit ENABLE ROW LEVEL SECURITY;
