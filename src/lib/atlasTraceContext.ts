// Atlas-Audit: [EXEC-MF] Verified — Trace channel for Mirrorforge LLM path (parity with Crucible).
import type { AppState } from '../types';

/** Stable `userId` for IndexedDB / trace correlation (Firebase uid preferred). */
export function atlasTraceUserId(state: Pick<AppState, 'currentUser'>): string {
  const u = state.currentUser;
  if (u?.uid) return u.uid;
  if (u?.email) return u.email;
  return 'anonymous';
}

/** Structured `channel` values for `ollamaComplete` / `ollamaChat` tracing. */
export const ATLAS_TRACE_CHANNEL = {
  home: 'chamber:home',
  crucible: 'chamber:crucible',
  mirrorforge: 'chamber:mirrorforge',
  consoleTerminal: 'chamber:console:terminal',
  consoleGovernance: 'chamber:console:governance',
} as const;
