/**
 * Atlas Uncertainty Tracker
 * Phase 2 Governance
 *
 * Manages uncertainty states across claims and model outputs.
 * Injects disclosure language when Atlas speaks with incomplete confidence.
 */

export type UncertaintyLevel = 'certain' | 'high' | 'moderate' | 'low' | 'speculative';

export interface UncertaintyState {
  claimId: string;
  userId: string;
  level: UncertaintyLevel;
  disclosureRequired: boolean;
  disclosurePhrase: string;
  sources: string[];
  acknowledgedByUser: boolean;
  createdAt: string;
}

const DISCLOSURE_PHRASES: Record<UncertaintyLevel, string> = {
  certain: '',
  high: 'With high confidence,',
  moderate: 'Based on available evidence,',
  low: 'This is uncertain, but',
  speculative: 'Speculatively,',
};

const LEVEL_THRESHOLDS: Array<[number, UncertaintyLevel]> = [
  [0.9, 'certain'],
  [0.75, 'high'],
  [0.5, 'moderate'],
  [0.25, 'low'],
  [0, 'speculative'],
];

const stateStore: Map<string, UncertaintyState[]> = new Map();

function getStates(userId: string): UncertaintyState[] {
  if (!stateStore.has(userId)) stateStore.set(userId, []);
  return stateStore.get(userId)!;
}

export function confidenceToLevel(confidence: number): UncertaintyLevel {
  for (const [threshold, level] of LEVEL_THRESHOLDS) {
    if (confidence >= threshold) return level;
  }
  return 'speculative';
}

export function registerUncertainty(
  userId: string,
  claimId: string,
  confidence: number,
  sources: string[]
): UncertaintyState {
  const level = confidenceToLevel(confidence);
  const state: UncertaintyState = {
    claimId,
    userId,
    level,
    disclosureRequired: level !== 'certain',
    disclosurePhrase: DISCLOSURE_PHRASES[level],
    sources,
    acknowledgedByUser: false,
    createdAt: new Date().toISOString(),
  };

  getStates(userId).push(state);
  return state;
}

/**
 * Build a disclosure prefix for an Atlas response given confidence level.
 */
export function buildDisclosurePrefix(confidence: number): string {
  const level = confidenceToLevel(confidence);
  return DISCLOSURE_PHRASES[level];
}

/**
 * Inject uncertainty disclosures into a response string for all low-confidence claims.
 */
export function injectUncertaintyDisclosures(
  userId: string,
  response: string,
  overallConfidence: number
): string {
  const level = confidenceToLevel(overallConfidence);
  if (level === 'certain' || level === 'high') return response;

  const prefix = DISCLOSURE_PHRASES[level];
  if (!prefix) return response;

  // Only prepend if not already present
  if (response.startsWith(prefix)) return response;
  return `${prefix} ${response}`;
}

export function markAcknowledged(userId: string, claimId: string): boolean {
  const states = getStates(userId);
  const state = states.find((s) => s.claimId === claimId);
  if (!state) return false;
  state.acknowledgedByUser = true;
  return true;
}

export function getPendingDisclosures(userId: string): UncertaintyState[] {
  return getStates(userId).filter((s) => s.disclosureRequired && !s.acknowledgedByUser);
}

export function getUncertaintyState(userId: string, claimId: string): UncertaintyState | undefined {
  return getStates(userId).find((s) => s.claimId === claimId);
}
