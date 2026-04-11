/**
 * Degraded Mode — Barrel Export
 * Phase 4 Section 3 — Re-exports all degraded mode frontend modules.
 */

export {
  type AtlasFeature,
  type DegradedMode,
  CAPABILITY_MATRIX,
  isCapabilityEnabled,
  getCapabilitiesForMode,
  getDisabledFeatures,
} from './capabilityMatrix.js';

export { default as DegradedDisclosureBanner, useDegradedMode } from './DegradedDisclosureBanner.js';
