/**
 * Boot-time migration registry.
 *
 * This file is the ONLY place the boot sequence looks at to decide which
 * migration chains to run. Adding a new chain = add its import + entry here.
 *
 * Chains are executed in topological order by `runMigrations` based on their
 * `dependsOn` field, so the order of this array is not significant. Keeping it
 * sorted by numeric prefix is a readability convention only.
 */

import type { MigrationChain } from './migrationRunner.js';
import { migration001UpgradeLegacyModelIds } from './migrations/001_upgrade_legacy_model_ids.js';

export const BOOT_MIGRATION_CHAINS: ReadonlyArray<MigrationChain> = Object.freeze([
  migration001UpgradeLegacyModelIds,
]);
