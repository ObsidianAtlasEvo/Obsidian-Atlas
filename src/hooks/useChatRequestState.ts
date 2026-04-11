import { useRef, useCallback } from 'react';

/**
 * Finite-state machine for a chat request lifecycle.
 *
 * States:
 *  idle        → No request in flight.
 *  submitting  → Fetch initiated, waiting for first byte.
 *  streaming   → Tokens are arriving.
 *  completed   → Stream finished normally.
 *  failed      → An error occurred.
 *  timed_out   → No token arrived within WATCHDOG_MS.
 *  aborted     → User or system cancelled the request.
 *  stale       → Detected on hydration — was mid-flight when page unloaded.
 */
export type ChatRequestStatus =
  | 'idle'
  | 'submitting'
  | 'streaming'
  | 'completed'
  | 'failed'
  | 'timed_out'
  | 'aborted'
  | 'stale';

const WATCHDOG_MS = 30_000;

interface RequestState {
  status: ChatRequestStatus;
  abortController: AbortController | null;
  watchdogTimer: ReturnType<typeof setTimeout> | null;
  assistantMsgId: string | null;
}

/**
 * Hook that manages the finite-state machine for chat requests.
 * Provides transition helpers and a watchdog timer that auto-fires
 * if no token arrives within 30 s.
 */
export function useChatRequestState() {
  const stateRef = useRef<RequestState>({
    status: 'idle',
    abortController: null,
    watchdogTimer: null,
    assistantMsgId: null,
  });

  const clearWatchdog = useCallback(() => {
    if (stateRef.current.watchdogTimer) {
      clearTimeout(stateRef.current.watchdogTimer);
      stateRef.current.watchdogTimer = null;
    }
  }, []);

  const startWatchdog = useCallback(
    (onTimeout: () => void) => {
      clearWatchdog();
      stateRef.current.watchdogTimer = setTimeout(onTimeout, WATCHDOG_MS);
    },
    [clearWatchdog],
  );

  const resetWatchdog = useCallback(
    (onTimeout: () => void) => {
      startWatchdog(onTimeout);
    },
    [startWatchdog],
  );

  const transition = useCallback(
    (next: ChatRequestStatus) => {
      stateRef.current.status = next;
      if (
        next === 'completed' ||
        next === 'failed' ||
        next === 'timed_out' ||
        next === 'aborted' ||
        next === 'stale' ||
        next === 'idle'
      ) {
        clearWatchdog();
      }
    },
    [clearWatchdog],
  );

  const abortCurrent = useCallback(() => {
    stateRef.current.abortController?.abort();
    stateRef.current.abortController = null;
    clearWatchdog();
    transition('aborted');
  }, [clearWatchdog, transition]);

  const begin = useCallback(
    (assistantMsgId: string): AbortController => {
      // If already in flight, abort the old request first
      if (
        stateRef.current.status === 'submitting' ||
        stateRef.current.status === 'streaming'
      ) {
        stateRef.current.abortController?.abort();
        clearWatchdog();
      }

      const controller = new AbortController();
      stateRef.current = {
        status: 'submitting',
        abortController: controller,
        watchdogTimer: null,
        assistantMsgId,
      };
      return controller;
    },
    [clearWatchdog],
  );

  return {
    stateRef,
    transition,
    begin,
    abortCurrent,
    startWatchdog,
    resetWatchdog,
    clearWatchdog,
    get status() {
      return stateRef.current.status;
    },
  };
}
