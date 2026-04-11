/**
 * schemaVersioning.ts
 * Atlas Phase 3 — Persistence Layer
 *
 * Schema versioning and migration for all long-lived user state in Atlas.
 * Every data store has a version number. When code changes schema, a migration
 * runs automatically — chained sequentially, never skipping steps.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AtlasDataStore =
  | 'evolution_profile'
  | 'goal_memory'
  | 'mutation_ledger'
  | 'evidence_claims'
  | 'uncertainty_records'
  | 'event_stream'
  | 'concept_graph'
  | 'evaluation_snapshots'
  | 'evolution_control'
  | 'sovereign_audit'
  | 'crucible_sessions'
  | 'journal_entries';

export interface MigrationRecord {
  id: string;
  store: AtlasDataStore;
  fromVersion: number;
  toVersion: number;
  appliedAt: number;
  durationMs: number;
  recordsAffected: number;
  status: 'success' | 'partial' | 'failed' | 'rolled_back';
  rollbackAvailable: boolean;
  notes: string;
}

export interface SchemaVersion {
  store: AtlasDataStore;
  version: number;       // current schema version
  migratedAt: number;
  migratedFrom: number;
  migrations: MigrationRecord[];
}

export interface Migration {
  store: AtlasDataStore;
  fromVersion: number;
  toVersion: number;
  description: string;
  up: (data: unknown) => unknown;       // transforms old shape to new shape
  down: (data: unknown) => unknown;     // transforms new shape back to old (rollback)
  validate: (data: unknown) => boolean; // confirms migration succeeded
  breaking: boolean;                    // requires explicit sovereign approval before running
}

// ---------------------------------------------------------------------------
// Internal types for sovereign approval tracking
// ---------------------------------------------------------------------------

interface SovereignApproval {
  store: AtlasDataStore;
  fromVersion: number;
  toVersion: number;
  approvedAt: number;
  approvedBy: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function nowMs(): number {
  return Date.now();
}

// ---------------------------------------------------------------------------
// SchemaVersionManager
// ---------------------------------------------------------------------------

export class SchemaVersionManager {
  private currentVersions: Record<AtlasDataStore, number>;
  private migrations: Migration[];
  // Sovereign approvals collected during this process lifetime
  private sovereignApprovals: SovereignApproval[];

  constructor() {
    this.migrations = [];
    this.sovereignApprovals = [];

    // Seed initial versions — all stores start at v1
    this.currentVersions = {
      evolution_profile:    1,
      goal_memory:          1,
      mutation_ledger:      1,
      evidence_claims:      1,
      uncertainty_records:  1,
      event_stream:         1,
      concept_graph:        1,
      evaluation_snapshots: 1,
      evolution_control:    1,
      sovereign_audit:      1,
      crucible_sessions:    1,
      journal_entries:      1,
    };

    this.registerBuiltInMigrations();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Check if a user's stored data needs migration.
   */
  needsMigration(store: AtlasDataStore, storedVersion: number): boolean {
    return storedVersion < this.currentVersions[store];
  }

  /**
   * Run all pending migrations for a user's data object, chaining sequentially.
   * Each step validates before proceeding; on failure rolls back and logs partial status.
   */
  async migrate(
    store: AtlasDataStore,
    data: unknown,
    storedVersion: number,
    userId: string
  ): Promise<{ data: unknown; record: MigrationRecord }> {
    const targetVersion = this.currentVersions[store];
    const startedAt = nowMs();
    let currentData = data;
    let currentVersion = storedVersion;
    let recordsAffected = 0;

    if (!this.needsMigration(store, storedVersion)) {
      // Already current — return identity record
      const record: MigrationRecord = {
        id: generateId('mr'),
        store,
        fromVersion: storedVersion,
        toVersion: storedVersion,
        appliedAt: startedAt,
        durationMs: 0,
        recordsAffected: 0,
        status: 'success',
        rollbackAvailable: false,
        notes: `No migration needed. Store '${store}' already at v${storedVersion}.`,
      };
      return { data: currentData, record };
    }

    const path = this.getMigrationPath(store, storedVersion, targetVersion);

    if (path.length === 0) {
      const record: MigrationRecord = {
        id: generateId('mr'),
        store,
        fromVersion: storedVersion,
        toVersion: targetVersion,
        appliedAt: startedAt,
        durationMs: nowMs() - startedAt,
        recordsAffected: 0,
        status: 'failed',
        rollbackAvailable: false,
        notes: `No migration path found from v${storedVersion} to v${targetVersion} for store '${store}'.`,
      };
      console.error(`[SchemaVersionManager] ${record.notes}`);
      return { data: currentData, record };
    }

    let failedAt: number | null = null;
    let failureNotes = '';

    for (const migration of path) {
      // Check for sovereign approval on breaking migrations
      if (migration.breaking) {
        const approved = this.hasSovereignApproval(
          store,
          migration.fromVersion,
          migration.toVersion
        );
        if (!approved) {
          // Write a pending-approval record and abort
          const record: MigrationRecord = {
            id: generateId('mr'),
            store,
            fromVersion: storedVersion,
            toVersion: migration.fromVersion, // only migrated this far
            appliedAt: startedAt,
            durationMs: nowMs() - startedAt,
            recordsAffected,
            status: 'partial',
            rollbackAvailable: true,
            notes:
              `Breaking migration from v${migration.fromVersion} to v${migration.toVersion} ` +
              `on store '${store}' requires sovereign approval. Migration paused. userId: ${userId}.`,
          };
          console.warn(`[SchemaVersionManager] BREAKING MIGRATION BLOCKED — ${record.notes}`);
          return { data: currentData, record };
        }
      }

      const preStepData = currentData;

      try {
        const transformed = migration.up(currentData);
        const valid = migration.validate(transformed);

        if (!valid) {
          // Validation failed — roll back this step
          console.error(
            `[SchemaVersionManager] Validation failed after migrating '${store}' ` +
              `from v${migration.fromVersion} to v${migration.toVersion}. Rolling back step.`
          );
          currentData = preStepData;
          failedAt = migration.toVersion;
          failureNotes =
            `Validation failed at v${migration.fromVersion}→v${migration.toVersion}. ` +
            `Data rolled back to v${migration.fromVersion}.`;
          break;
        }

        currentData = transformed;
        currentVersion = migration.toVersion;
        recordsAffected += 1;
      } catch (err) {
        currentData = preStepData;
        failedAt = migration.toVersion;
        failureNotes =
          `Exception during migration v${migration.fromVersion}→v${migration.toVersion}: ` +
          `${err instanceof Error ? err.message : String(err)}. Data rolled back.`;
        console.error(`[SchemaVersionManager] ${failureNotes}`);
        break;
      }
    }

    const finalStatus: MigrationRecord['status'] =
      failedAt !== null
        ? currentVersion > storedVersion
          ? 'partial'
          : 'failed'
        : 'success';

    const record: MigrationRecord = {
      id: generateId('mr'),
      store,
      fromVersion: storedVersion,
      toVersion: currentVersion,
      appliedAt: startedAt,
      durationMs: nowMs() - startedAt,
      recordsAffected,
      status: finalStatus,
      rollbackAvailable: finalStatus !== 'success',
      notes:
        finalStatus === 'success'
          ? `Migrated '${store}' from v${storedVersion} to v${currentVersion} in ${recordsAffected} step(s). userId: ${userId}.`
          : failureNotes,
    };

    return { data: currentData, record };
  }

  /**
   * Register a new migration (called during app startup).
   */
  register(migration: Migration): void {
    const duplicate = this.migrations.find(
      (m) =>
        m.store === migration.store &&
        m.fromVersion === migration.fromVersion &&
        m.toVersion === migration.toVersion
    );
    if (duplicate) {
      throw new Error(
        `Duplicate migration: store='${migration.store}' ` +
          `v${migration.fromVersion}→v${migration.toVersion} already registered.`
      );
    }

    this.migrations.push(migration);

    // If this migration's toVersion exceeds current canonical, bump it
    if (migration.toVersion > this.currentVersions[migration.store]) {
      this.currentVersions[migration.store] = migration.toVersion;
    }
  }

  /**
   * Get the ordered chain of migrations needed to go from fromVersion to toVersion.
   * Builds a sequential path: e.g. v1→v2→v3 (never skips).
   */
  getMigrationPath(
    store: AtlasDataStore,
    fromVersion: number,
    toVersion: number
  ): Migration[] {
    if (fromVersion >= toVersion) return [];

    const path: Migration[] = [];
    let cursor = fromVersion;

    while (cursor < toVersion) {
      const next = this.migrations.find(
        (m) => m.store === store && m.fromVersion === cursor
      );
      if (!next) {
        // Gap in the migration chain
        console.error(
          `[SchemaVersionManager] Missing migration for store '${store}': v${cursor}→v${cursor + 1}`
        );
        break;
      }
      path.push(next);
      cursor = next.toVersion;
    }

    return path;
  }

  /**
   * Rollback a migration — transforms data back to `toVersion` using down() functions.
   * Chains in reverse order.
   */
  async rollback(
    store: AtlasDataStore,
    data: unknown,
    toVersion: number
  ): Promise<unknown> {
    const rollbackMigrations = this.migrations
      .filter((m) => m.store === store && m.toVersion > toVersion && m.fromVersion >= toVersion)
      .sort((a, b) => b.toVersion - a.toVersion); // highest first

    let current = data;
    for (const migration of rollbackMigrations) {
      try {
        current = migration.down(current);
        console.log(
          `[SchemaVersionManager] Rolled back '${store}' ` +
            `v${migration.toVersion}→v${migration.fromVersion}.`
        );
      } catch (err) {
        console.error(
          `[SchemaVersionManager] Rollback failed at '${store}' ` +
            `v${migration.toVersion}→v${migration.fromVersion}: ` +
            `${err instanceof Error ? err.message : String(err)}`
        );
        break;
      }
    }
    return current;
  }

  /**
   * Get the current canonical version for a store.
   */
  getCurrentVersion(store: AtlasDataStore): number {
    return this.currentVersions[store];
  }

  /**
   * Persist a MigrationRecord to Supabase (atlas_schema_migrations table).
   */
  async saveMigrationRecord(
    record: MigrationRecord,
    supabaseUrl: string,
    supabaseKey: string
  ): Promise<void> {
    const endpoint = `${supabaseUrl}/rest/v1/atlas_schema_migrations`;
    const body = JSON.stringify({
      id: record.id,
      store: record.store,
      from_version: record.fromVersion,
      to_version: record.toVersion,
      applied_at: new Date(record.appliedAt).toISOString(),
      duration_ms: record.durationMs,
      records_affected: record.recordsAffected,
      status: record.status,
      rollback_available: record.rollbackAvailable,
      notes: record.notes,
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: 'return=minimal',
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `[SchemaVersionManager] Failed to save migration record to Supabase: ` +
          `${response.status} ${text}`
      );
    }
  }

  /**
   * Load migration history for a store from Supabase for auditing.
   */
  async getMigrationHistory(
    store: AtlasDataStore,
    supabaseUrl: string,
    supabaseKey: string
  ): Promise<MigrationRecord[]> {
    const endpoint =
      `${supabaseUrl}/rest/v1/atlas_schema_migrations` +
      `?store=eq.${encodeURIComponent(store)}&order=applied_at.asc`;

    const response = await fetch(endpoint, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `[SchemaVersionManager] Failed to fetch migration history from Supabase: ` +
          `${response.status} ${text}`
      );
    }

    const rows: Array<{
      id: string;
      store: AtlasDataStore;
      from_version: number;
      to_version: number;
      applied_at: string;
      duration_ms: number;
      records_affected: number;
      status: MigrationRecord['status'];
      rollback_available: boolean;
      notes: string;
    }> = await response.json() as Array<{
      id: string;
      store: AtlasDataStore;
      from_version: number;
      to_version: number;
      applied_at: string;
      duration_ms: number;
      records_affected: number;
      status: MigrationRecord['status'];
      rollback_available: boolean;
      notes: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      store: row.store,
      fromVersion: row.from_version,
      toVersion: row.to_version,
      appliedAt: new Date(row.applied_at).getTime(),
      durationMs: row.duration_ms,
      recordsAffected: row.records_affected,
      status: row.status,
      rollbackAvailable: row.rollback_available,
      notes: row.notes,
    }));
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  /**
   * Check if sovereign approval has been granted for a breaking migration.
   */
  private hasSovereignApproval(
    store: AtlasDataStore,
    fromVersion: number,
    toVersion: number
  ): boolean {
    return this.sovereignApprovals.some(
      (a) =>
        a.store === store &&
        a.fromVersion === fromVersion &&
        a.toVersion === toVersion
    );
  }

  /**
   * Register built-in v1 baseline migrations for all stores.
   * These are identity transforms — they establish the starting point
   * and carry no data changes.
   */
  private registerBuiltInMigrations(): void {
    const stores: AtlasDataStore[] = [
      'evolution_profile',
      'goal_memory',
      'mutation_ledger',
      'evidence_claims',
      'uncertainty_records',
      'event_stream',
      'concept_graph',
      'evaluation_snapshots',
      'evolution_control',
      'sovereign_audit',
      'crucible_sessions',
      'journal_entries',
    ];

    // v0→v1 identity migrations — establish baseline for all stores.
    // v0 is a sentinel representing "pre-versioned" data; v1 is the initial
    // versioned schema. The transform is an identity function.
    for (const store of stores) {
      const baselineMigration: Migration = {
        store,
        fromVersion: 0,
        toVersion: 1,
        description:
          `Baseline identity migration for '${store}'. ` +
          `Establishes v1 as the initial versioned schema. No data transformation applied.`,
        up: (data: unknown) => data,
        down: (data: unknown) => data,
        validate: (data: unknown) => data !== null && data !== undefined,
        breaking: false,
      };

      // Only register if not already present
      const exists = this.migrations.some(
        (m) => m.store === store && m.fromVersion === 0 && m.toVersion === 1
      );
      if (!exists) {
        this.migrations.push(baselineMigration);
      }
    }

    // currentVersions are already seeded to 1 in the constructor.
    // Registering v0→v1 migrations does not bump currentVersions above 1.
  }

  /**
   * Lightweight health probe for observability (extend with real DB checks later).
   */
  getStoreHealth(): Array<{ store: AtlasDataStore; isHealthy: boolean }> {
    return (Object.keys(this.currentVersions) as AtlasDataStore[]).map((store) => ({
      store,
      isHealthy: true,
    }));
  }
}

let _schemaVersionManager: SchemaVersionManager | null = null;

export function getSchemaVersionManager(): SchemaVersionManager {
  if (!_schemaVersionManager) {
    _schemaVersionManager = new SchemaVersionManager();
  }
  return _schemaVersionManager;
}

export async function runMigrationsOnStartup(): Promise<void> {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_KEY?.trim();
  if (!url || !key) {
    console.warn('[phase3/schema] runMigrationsOnStartup skipped — Supabase not configured');
    return;
  }
  try {
    const probe = await fetch(`${url}/rest/v1/atlas_schema_migrations?select=id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
    });
    if (!probe.ok) {
      console.warn(
        '[phase3/schema] atlas_schema_migrations unreachable — apply atlas-backend/db/supabase-phase3.sql',
      );
    }
  } catch (e) {
    console.warn('[phase3/schema] migration probe failed:', e);
  }
}
