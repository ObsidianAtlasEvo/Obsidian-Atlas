/**
 * Atlas Explainability Layer — Barrel Export
 * Phase 4 Section 4
 */

export {
  storeExplanation,
  getExplanation,
  queryExplanations,
  pruneExpired,
} from './explanationStore';

export type {
  ExplanationEntry,
  ExplanationFilter,
} from './explanationStore';

export { computeDiff } from './ExplanationDiff';
export type { ExplanationDiff } from './ExplanationDiff';

export { default as ExplanationViewer } from './ExplanationViewer';
export type { ExplanationViewerProps } from './ExplanationViewer';

export { generateWeeklyDigest } from './naturalLanguageSummary';
export type { NLSummary } from './naturalLanguageSummary';
