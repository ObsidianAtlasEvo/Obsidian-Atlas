import React from 'react';
import { JournalChamber } from '../../../components/JournalChamber';
import type { ActionModuleProps } from '../types';

/**
 * Journal — chronological thought chamber; background parsers emit SRG memory / graph edges.
 */
export function JournalModule({ state, setState }: ActionModuleProps): React.ReactElement {
  return (
    <JournalChamber
      state={state}
      onUpdateState={(updates) => setState((prev) => ({ ...prev, ...updates }))}
    />
  );
}
