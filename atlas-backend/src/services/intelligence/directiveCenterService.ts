/**
 * directiveCenterService.ts — Phase 0.95: Aggregated directive state.
 */

import { env } from '../../config/env.js';
import { getFronts, type FrontRow } from './frontModelService.js';
import {
  getWorkstreams,
  type WorkstreamRow,
} from './workstreamStateService.js';
import {
  getChains,
  type ChainRow,
} from './executionContinuityService.js';
import {
  getDecisions,
  type DecisionRow,
} from './decisionLedgerService.js';
import {
  getOpenCommitments,
  type CommitmentRow,
} from './commitmentTrackerService.js';

export interface DirectiveState {
  fronts: FrontRow[];
  workstreams: WorkstreamRow[];
  chains: ChainRow[];
  decisions: DecisionRow[];
  openCommitments: CommitmentRow[];
}

export async function composeDirectiveState(
  userId: string,
): Promise<DirectiveState> {
  if (!env.memoryLayerEnabled) {
    return {
      fronts: [],
      workstreams: [],
      chains: [],
      decisions: [],
      openCommitments: [],
    };
  }
  try {
    const [fronts, workstreams, chains, decisions, openCommitments] =
      await Promise.all([
        getFronts(userId),
        getWorkstreams(userId),
        getChains(userId),
        getDecisions(userId),
        getOpenCommitments(userId),
      ]);
    return { fronts, workstreams, chains, decisions, openCommitments };
  } catch (err) {
    console.error('[directiveCenterService] composeDirectiveState error:', err);
    return {
      fronts: [],
      workstreams: [],
      chains: [],
      decisions: [],
      openCommitments: [],
    };
  }
}

/** Pure: format a terse directive summary for context injection. */
export function formatDirectiveSummary(state: DirectiveState): string {
  const activeWs = state.workstreams.filter((w) => w.status === 'active').length;
  const openFronts = state.fronts.filter((f) => f.status === 'open').length;
  const stalled = state.chains.filter((c) => c.status === 'stalled' || c.status === 'blocked').length;
  const commitments = state.openCommitments.length;
  const decisions = state.decisions.length;
  return `active workstreams: ${activeWs} | open fronts: ${openFronts} | stalled chains: ${stalled} | open commitments: ${commitments} | decisions logged: ${decisions}`;
}
