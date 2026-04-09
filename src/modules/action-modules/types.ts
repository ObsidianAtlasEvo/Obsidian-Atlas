import type { Dispatch, SetStateAction } from 'react';
import type { AppState } from '../../types';

/** Standard props for action modules that read/write app state (→ Sovereign Reality Graph). */
export type ActionModuleProps = {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
};
