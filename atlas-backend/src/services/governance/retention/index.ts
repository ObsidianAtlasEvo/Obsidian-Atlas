/**
 * Data Retention & Deletion — Phase 4 §5
 *
 * Barrel export for the retention subsystem: scheduled deletion,
 * GDPR/CCPA erasure, legal holds, and audit trail.
 */

export {
  scheduleDailyDeletion,
  runDeletion,
  getRetentionStatus,
  type DeletionReport,
  type TableDeletionResult,
} from './deletionExecutor.js';

export {
  requestErasure,
  executeErasure,
  getErasureStatus,
  type ErasureRequest,
  type ErasureCertificate,
  type ErasureStatus,
} from './erasureExecutor.js';

export {
  placeHold,
  releaseHold,
  hasHold,
  getActiveHolds,
  requiresReconfirmation,
  type LegalHold,
} from './legalHoldRegistry.js';

export {
  logRetentionEvent,
  queryRetentionEvents,
  type RetentionEvent,
  type RetentionFilter,
} from './retentionAuditTrail.js';
