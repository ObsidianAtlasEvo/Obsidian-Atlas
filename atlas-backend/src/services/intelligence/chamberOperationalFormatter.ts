/**
 * chamberOperationalFormatter.ts — Phase 0.95: Pure chamber-specific formatters.
 */

import type { DirectiveState } from './directiveCenterService.js';

const ACTION_CRITERIA: Record<string, string[]> = {
  directive_center: [
    'Advances an open strategic front',
    'Reduces stalled or blocked chains',
    'Resolves an open commitment',
    'Closes a pending decision',
  ],
  crucible: [
    'Exposes an untested assumption',
    'Contradicts an unsupported claim',
    'Surfaces a false front',
    'Confronts a motivated misreading',
  ],
  reality_engine: [
    'Validates a supported truth claim',
    'Triggers a reality-check against drift',
    'Updates stale confidence scores',
    'Resolves an acknowledged contradiction',
  ],
  mirrorforge: [
    'Exposes an identity signal for reflection',
    'Surfaces a self-model assumption',
    'Documents an identity shift with evidence',
    'Invites correction without forcing it',
  ],
  default: [
    'Advances a live workstream',
    'Reduces unresolved state',
    'Avoids new commitments without capacity',
  ],
};

const SUCCESS_METRICS: Record<string, string[]> = {
  directive_center: [
    'Open commitments decrease',
    'Stalled chains restart or retire',
    'Pending decisions resolve within due horizon',
  ],
  crucible: [
    'Invalidated assumptions are recorded',
    'Contradictions acknowledged not ignored',
    'False fronts retired',
  ],
  reality_engine: [
    'Claim confidence reflects evidence',
    'Drift events logged within detection window',
    'Stale claims re-validated or retired',
  ],
  mirrorforge: [
    'Identity signals evolve with visible reason',
    'Self-model contradictions acknowledged',
    'User-visible reflection available on demand',
  ],
  default: [
    'Unresolved counts trend down',
    'Outcome delta trends positive',
  ],
};

export function getChamberActionCriteria(chamber: string): string[] {
  return ACTION_CRITERIA[chamber] ?? ACTION_CRITERIA.default!;
}

export function getChamberSuccessMetrics(chamber: string): string[] {
  return SUCCESS_METRICS[chamber] ?? SUCCESS_METRICS.default!;
}

export function formatOperationalContext(
  chamber: string,
  state: DirectiveState,
): string {
  const activeWs = state.workstreams.filter((w) => w.status === 'active').length;
  const openFronts = state.fronts.filter((f) => f.status === 'open').length;
  const stalled = state.chains.filter(
    (c) => c.status === 'stalled' || c.status === 'blocked',
  ).length;
  const commitments = state.openCommitments.length;
  const criteria = getChamberActionCriteria(chamber);
  const metrics = getChamberSuccessMetrics(chamber);
  const header = `[OPERATIONAL CONTEXT — ${chamber}]`;
  const stateLine = `active_ws:${activeWs} open_fronts:${openFronts} stalled:${stalled} open_commitments:${commitments}`;
  const criteriaLine = `action_criteria: ${criteria.join(' | ')}`;
  const metricsLine = `success_metrics: ${metrics.join(' | ')}`;
  return `${header}\n${stateLine}\n${criteriaLine}\n${metricsLine}`;
}
