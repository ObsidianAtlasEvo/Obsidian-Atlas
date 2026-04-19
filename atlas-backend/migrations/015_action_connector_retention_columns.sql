-- =============================================================================
-- Migration 015: Action Executor / Connector Outbound / Retention column support
-- Date: 2026-04-19
-- =============================================================================
-- Adds optional columns used by:
--   - Phase 0.985 action executor (reversal anchors surface inline for easier filtering)
--   - Phase 0.986 connector outbound (sync state surfaces alongside metadata)
--   - Phase 0.99  retention enforcer (archive/tombstone strategies target these columns)
-- All changes are additive and idempotent. Existing rows keep NULL defaults.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. action_contracts — optional reversal_anchor + irreversible flag
-- ---------------------------------------------------------------------------
ALTER TABLE action_contracts
  ADD COLUMN IF NOT EXISTS reversal_anchor text;

ALTER TABLE action_contracts
  ADD COLUMN IF NOT EXISTS irreversible boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2. connector_registry — sync state surfaces (metadata-backed, promoted to columns
--    for easy filtering / dashboard queries)
-- ---------------------------------------------------------------------------
ALTER TABLE connector_registry
  ADD COLUMN IF NOT EXISTS last_sync_hash text;

ALTER TABLE connector_registry
  ADD COLUMN IF NOT EXISTS last_sync_status text
    CHECK (last_sync_status IS NULL OR last_sync_status IN ('completed','failed','skipped'));

ALTER TABLE connector_registry
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_connector_registry_sync_status
  ON connector_registry (user_id, last_sync_status, last_synced_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Retention support columns on core entity tables
--    (archive/tombstone strategies write to these; tables without them are skipped)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_memories',
    'workstreams',
    'action_contracts',
    'connector_registry',
    'watcher_events',
    'audit_governance_log',
    'behavior_transparency_log',
    'constitutional_eval_results'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS archived_at timestamptz', t);
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_at timestamptz', t);
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tombstoned boolean NOT NULL DEFAULT false', t);
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS anonymized_at timestamptz', t);
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- END OF MIGRATION 015
-- =============================================================================
