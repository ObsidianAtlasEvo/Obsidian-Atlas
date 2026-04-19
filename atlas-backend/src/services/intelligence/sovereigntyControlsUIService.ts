/**
 * sovereigntyControlsUIService.ts — Phase 0.98: Pure sovereignty control descriptions.
 */

const ACTION_DESCRIPTIONS: Record<string, string> = {
  freeze: 'Freeze the target state so no further mutation occurs until unfrozen.',
  revert: 'Revert the target to its prior state; the current state is archived.',
  suppress: 'Suppress the response/output from user-visible surfaces.',
  confirm: 'Confirm the response/output as valid and mark it approved.',
  quarantine: 'Quarantine the target; it is isolated from orchestration and recall.',
  inspect: 'Inspect the target; no mutation, full audit reveal.',
};

export function describeSovereigntyAction(action: string): string {
  return (
    ACTION_DESCRIPTIONS[action] ??
    `Unknown sovereignty action: ${action}`
  );
}

const POLICY_TARGETS = new Set(['policy', 'memory', 'identity']);
const RESPONSE_TARGETS = new Set(['response', 'output']);

/**
 * Pure: check whether this (action, target) pair is a valid sovereignty operation.
 */
export function validateControlAction(action: string, target: string): boolean {
  if (action === 'freeze' || action === 'revert') {
    return POLICY_TARGETS.has(target);
  }
  if (action === 'suppress' || action === 'confirm') {
    return RESPONSE_TARGETS.has(target);
  }
  if (action === 'quarantine' || action === 'inspect') {
    return target.length > 0;
  }
  return false;
}
