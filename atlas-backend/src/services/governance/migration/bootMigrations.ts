/**
 * Boot-time migration driver.
 *
 * Called once during Atlas startup, after `initSqlite()` has run (which owns
 * the authoritative `atlas_schema_migrations` table shape and rebuilds any
 * legacy DBs in place) and before any route registration. See
 * `atlas-backend/src/index.ts` for the exact call site.
 *
 * Behaviour:
 *   - Runs every chain listed in `BOOT_MIGRATION_CHAINS` via `runMigrations`,
 *     which itself is idempotent per (domain, version) — chains that have
 *     already recorded status='success' are skipped.
 *   - If `ATLAS_SKIP_BOOT_MIGRATIONS=true`, the driver no-ops. This exists so
 *     ad-hoc scripts, CI setup steps, and test harnesses can open the same
 *     DB without triggering migrations they'll run manually.
 *   - On failure the driver throws, so `index.ts`'s try/catch can log a
 *     clear `[FATAL]` and exit. A partially-applied migration is recorded in
 *     `atlas_schema_migrations` with status='failed' + a checkpoint id so
 *     the rollback engine has something to latch onto.
 *
 * The function is safe to call multiple times: the underlying runner's
 * idempotency gate makes repeat calls no-ops once every chain has succeeded.
 */

import { BOOT_MIGRATION_CHAINS } from './registry.js';
import { runMigrations } from './migrationRunner.js';
import type { MigrationReport } from './migrationRunner.js';

export async function runBootMigrations(
  opts: { skipEnv?: string | undefined } = {},
): Promise<MigrationReport> {
  const skipFlag = (opts.skipEnv ?? process.env.ATLAS_SKIP_BOOT_MIGRATIONS ?? '').toLowerCase();
  if (skipFlag === 'true' || skipFlag === '1' || skipFlag === 'yes') {
    // eslint-disable-next-line no-console -- logged before Fastify logger exists
    console.log(
      '[migrations] ATLAS_SKIP_BOOT_MIGRATIONS is set — skipping boot migration runner',
    );
    return { ran: [] };
  }

  if (BOOT_MIGRATION_CHAINS.length === 0) {
    return { ran: [] };
  }

  // Copy so runMigrations (which may mutate via topoSort internals) can't
  // alter the frozen registry array.
  const chains = [...BOOT_MIGRATION_CHAINS];
  const report = await runMigrations(chains);

  if (report.failed) {
    throw new Error(
      `Boot migration failed in domain "${report.failed}": ${report.error ?? 'unknown error'}. ` +
        `Checkpoint: ${report.checkpointAt ?? 'none'}. ` +
        `Completed before failure: [${report.ran.join(', ')}]`,
    );
  }

  // eslint-disable-next-line no-console -- logged before Fastify logger exists
  if (report.ran.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[migrations] applied: ${report.ran.join(', ')}`);
  } else {
    // eslint-disable-next-line no-console
    console.log('[migrations] no new migrations to apply');
  }

  return report;
}
