/**
 * Migration Doctrine — barrel export for the Phase 4 Section 2 migration subsystem.
 */

export { runMigrations, getMigrationStatus } from './migrationRunner.js';
export type { MigrationChain, MigrationReport, MigrationStatus } from './migrationRunner.js';

export { runCanary, validateCanary } from './canaryMigration.js';
export type { CanaryResult } from './canaryMigration.js';

export { rollback, rollbackToCheckpoint } from './rollbackEngine.js';
export type { RollbackResult, RollbackReport } from './rollbackEngine.js';

export { detectDrift, getSeverity, SchemaDriftError } from './schemaDriftDetector.js';
export type { DriftReport, DriftedEntity, DriftType } from './schemaDriftDetector.js';

export { acquireLock, releaseLock, isLocked } from './migrationLock.js';
export type { LockHandle } from './migrationLock.js';

export { logMigration } from './migrationAuditLog.js';
export type { MigrationLogEntry } from './migrationAuditLog.js';
