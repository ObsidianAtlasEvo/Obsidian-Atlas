import React from 'react';
import { Mirrorforge } from '../../../components/Mirrorforge';
import type { ActionModuleProps } from '../types';

/**
 * Mirrorforge — user-state tracker: session tone, urgency, focus → adaptive posture.
 * Background analysis hooks connect here later; graph writes go through SRG APIs.
 */
export function MirrorforgeModule({ state, setState }: ActionModuleProps): React.ReactElement {
  return <Mirrorforge state={state} setState={setState} />;
}
