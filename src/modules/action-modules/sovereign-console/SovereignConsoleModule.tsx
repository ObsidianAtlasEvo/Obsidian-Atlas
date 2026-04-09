import React from 'react';
import { ConsoleView } from '../../../components/ConsoleView';
import type { ActionModuleProps } from '../types';

/**
 * Sovereign Creator Console — prompts, retrieval thresholds, DB stats, tool toggles (local-only).
 */
export function SovereignConsoleModule({ state, setState }: ActionModuleProps): React.ReactElement {
  return <ConsoleView state={state} setState={setState} />;
}
