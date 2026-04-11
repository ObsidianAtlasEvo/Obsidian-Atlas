/**
 * Atlas Explainability Diff Types & Utilities
 * Phase 4 Section 4 — Explainability Layer
 *
 * Computes structural diffs between explanation entries for audit trail.
 */

import type { ExplanationEntry } from './explanationStore';

export interface ExplanationDiff {
  before: string;
  after: string;
  changedFields: string[];
  summary: string;
}

const DIFFABLE_FIELDS: (keyof ExplanationEntry)[] = [
  'humanSummary',
  'technicalDetail',
  'policyLayer',
  'eventType',
  'targetId',
  'actorId',
];

/**
 * Compare two partial explanation entries, list changed fields, generate summary.
 */
export function computeDiff(
  before: Partial<ExplanationEntry>,
  after: Partial<ExplanationEntry>
): ExplanationDiff {
  const changedFields: string[] = [];

  for (const field of DIFFABLE_FIELDS) {
    const bVal = before[field];
    const aVal = after[field];
    if (bVal !== aVal && (bVal !== undefined || aVal !== undefined)) {
      changedFields.push(field);
    }
  }

  const beforeStr = JSON.stringify(
    Object.fromEntries(changedFields.map((f) => [f, before[f as keyof ExplanationEntry]])),
    null,
    2
  );
  const afterStr = JSON.stringify(
    Object.fromEntries(changedFields.map((f) => [f, after[f as keyof ExplanationEntry]])),
    null,
    2
  );

  const summary =
    changedFields.length === 0
      ? 'No changes detected.'
      : `Changed ${changedFields.length} field${changedFields.length > 1 ? 's' : ''}: ${changedFields.join(', ')}.`;

  return {
    before: beforeStr,
    after: afterStr,
    changedFields,
    summary,
  };
}
