-- =============================================================================
-- Migration 014: Platform Retention, Backup, Org Boundaries (Phase 0.99)
-- Date: 2026-04-19
-- =============================================================================
-- Closes conformance gaps in the Platform Sovereignty phase:
--   1. retention_policies     — declared per-user per-table retention windows
--   2. platform_backup_audit  — audit row for every export/backup/restore
--   3. org_scope_registry     — org/team boundary stubs (owner-only read)
--
-- These tables exist so that the corresponding Phase 0.99 services have
-- real storage to write into. Services referencing them must remain
-- feature-flag-gated until RLS policies are reviewed by the security owner.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. retention_policies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS retention_policies (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid          NOT NULL,
  resource_table      text          NOT NULL,
  retention_days      integer       NOT NULL,
    CONSTRAINT retention_policies_days_check CHECK (retention_days >= 0),
  archive_strategy    text          NOT NULL DEFAULT 'delete',
    CONSTRAINT retention_policies_archive_check CHECK (
      archive_strategy IN ('delete','archive','anonymize','tombstone')
    ),
  declared_by         text          NOT NULL DEFAULT 'user',
  policy_metadata     jsonb         NOT NULL DEFAULT '{}'::jsonb,
  active              boolean       NOT NULL DEFAULT true,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_retention_policies_user_table
  ON retention_policies (user_id, resource_table)
  WHERE active;

CREATE INDEX IF NOT EXISTS idx_retention_policies_user
  ON retention_policies (user_id, active);

ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'retention_policies'
      AND policyname = 'owner_select_retention_policies'
  ) THEN
    CREATE POLICY owner_select_retention_policies
      ON retention_policies FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. platform_backup_audit
-- ---------------------------------------------------------------------------
-- Every export, backup, or restore operation MUST append a row here.
-- This is the user-facing sovereignty evidence that data egress is visible.
CREATE TABLE IF NOT EXISTS platform_backup_audit (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid          NOT NULL,
  operation           text          NOT NULL,
    CONSTRAINT platform_backup_audit_op_check CHECK (
      operation IN ('export','backup','restore','delete_all')
    ),
  resource_scope      text          NOT NULL,
  row_count           integer,
  bytes               bigint,
  status              text          NOT NULL DEFAULT 'started',
    CONSTRAINT platform_backup_audit_status_check CHECK (
      status IN ('started','completed','failed','cancelled')
    ),
  initiated_by        text,
  destination         text,
  backup_metadata     jsonb         NOT NULL DEFAULT '{}'::jsonb,
  started_at          timestamptz   NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  created_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_backup_audit_user_started
  ON platform_backup_audit (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_backup_audit_status
  ON platform_backup_audit (status, started_at DESC);

ALTER TABLE platform_backup_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'platform_backup_audit'
      AND policyname = 'owner_select_platform_backup_audit'
  ) THEN
    CREATE POLICY owner_select_platform_backup_audit
      ON platform_backup_audit FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. org_scope_registry
-- ---------------------------------------------------------------------------
-- Stub for multi-tenant org / team boundaries. Intentionally minimal —
-- RLS currently restricts to the owner user_id until the org-membership
-- table is designed. This table just records declared scopes so services
-- can resolve org names without inventing them.
CREATE TABLE IF NOT EXISTS org_scope_registry (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid          NOT NULL,
  scope_type          text          NOT NULL,
    CONSTRAINT org_scope_registry_type_check CHECK (
      scope_type IN ('org','team','workspace','project')
    ),
  scope_key           text          NOT NULL,
  display_name        text,
  scope_metadata      jsonb         NOT NULL DEFAULT '{}'::jsonb,
  active              boolean       NOT NULL DEFAULT true,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_scope_registry_user_type_key
  ON org_scope_registry (user_id, scope_type, scope_key)
  WHERE active;

ALTER TABLE org_scope_registry ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'org_scope_registry'
      AND policyname = 'owner_select_org_scope_registry'
  ) THEN
    CREATE POLICY owner_select_org_scope_registry
      ON org_scope_registry FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- =============================================================================
-- End Migration 014
-- =============================================================================
