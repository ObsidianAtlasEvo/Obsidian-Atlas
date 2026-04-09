import React from 'react';
import { ResonanceChamber } from '../../../components/ResonanceChamber';
import type { ActionModuleProps } from '../types';

/**
 * Resonance Chamber — primary chat / expression UI.
 * Streaming markdown + citation tooltips: pair with `useSovereignRealityGraph` + ollama stream.
 */
export function ResonanceModule({ state, setState }: ActionModuleProps): React.ReactElement {
  return <ResonanceChamber state={state} setState={setState} />;
}
