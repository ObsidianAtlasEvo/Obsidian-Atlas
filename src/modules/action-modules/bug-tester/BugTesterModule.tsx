import React from 'react';
import { BugHunter as BugHunterPanel } from '../../../components/BugHunter';
import type { ActionModuleProps } from '../types';

/**
 * Bug Tester — stress / validation: DB health, retrieval checks, truth-ledger contradictions.
 */
export function BugTesterModule({ state, setState }: ActionModuleProps): React.ReactElement {
  return <BugHunterPanel state={state} setState={setState} embedded />;
}
