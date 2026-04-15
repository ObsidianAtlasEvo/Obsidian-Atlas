/**
 * Degraded Mode Oracle
 * Phase 4 Section 3 — Polls health signals every 30 seconds and determines
 * the current system degradation mode. Publishes mode changes to subscribers.
 */

import { evaluateTransition } from './modeTransitionPolicy.js';

/** Severity levels of system degradation. */
export type DegradedMode =
  | 'NOMINAL'
  | 'DEGRADED_1'
  | 'DEGRADED_2'
  | 'DEGRADED_3'
  | 'OFFLINE';

/** Result of a single health probe. */
export interface HealthSignal {
  name: string;
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

const POLL_INTERVAL_MS = 30_000;

let currentMode: DegradedMode = 'NOMINAL';
let currentSignals: HealthSignal[] = [];
let modeSince: string = new Date().toISOString();
let pollTimer: ReturnType<typeof setInterval> | null = null;
const subscribers = new Set<(mode: DegradedMode) => void>();

/** Check Supabase connectivity by pinging the configured URL. */
async function checkSupabase(): Promise<HealthSignal> {
  const url = process.env.SUPABASE_URL;
  if (!url) {
    return { name: 'supabase', ok: false, error: 'SUPABASE_URL not configured' };
  }
  const start = Date.now();
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
      headers: { apikey: process.env.SUPABASE_ANON_KEY ?? '' },
    });
    return { name: 'supabase', ok: res.ok, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      name: 'supabase',
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Check backend /health endpoint reachability. */
async function checkBackendHealth(): Promise<HealthSignal> {
  const port = process.env.PORT ?? '3001';
  const host = process.env.HOST ?? '127.0.0.1';
  const start = Date.now();
  try {
    const res = await fetch(`http://${host}:${port}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return { name: 'backend_health', ok: res.ok, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      name: 'backend_health',
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Check LLM service availability via Groq API key and endpoint. */
async function checkLLMService(): Promise<HealthSignal> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { name: 'llm_service', ok: false, error: 'GROQ_API_KEY not set' };
  }
  const start = Date.now();
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return { name: 'llm_service', ok: res.ok, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      name: 'llm_service',
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Check memory/disk resource usage via process.memoryUsage(). */
function checkResources(): HealthSignal {
  const mem = process.memoryUsage();
  const heapUsedMB = mem.heapUsed / (1024 * 1024);
  const heapTotalMB = mem.heapTotal / (1024 * 1024);
  const usageRatio = heapUsedMB / heapTotalMB;
  const critical = usageRatio > 0.95 || heapUsedMB > 1500;
  return {
    name: 'resources',
    ok: !critical,
    latencyMs: 0,
    error: critical
      ? `Heap ${heapUsedMB.toFixed(0)}MB / ${heapTotalMB.toFixed(0)}MB (${(usageRatio * 100).toFixed(1)}%)`
      : undefined,
  };
}

/** Run all health probes and evaluate mode transition. */
async function poll(): Promise<void> {
  const signals = await Promise.all([
    checkSupabase(),
    checkBackendHealth(),
    checkLLMService(),
    Promise.resolve(checkResources()),
  ]);

  currentSignals = signals;
  const nextMode = evaluateTransition(signals, currentMode);

  if (nextMode !== currentMode) {
    currentMode = nextMode;
    modeSince = new Date().toISOString();
    for (const cb of subscribers) {
      try {
        cb(currentMode);
      } catch {
        // subscriber errors must not crash the oracle
      }
    }
  }
}

/** Begin 30-second interval polling of health signals. */
export function startPolling(): void {
  if (pollTimer !== null) return;
  // Run an initial poll immediately
  void poll();
  pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
}

/** Stop the polling interval. */
export function stopPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/** Return the current degraded mode. */
export function getCurrentMode(): DegradedMode {
  return currentMode;
}

/** Return the current health signals from the last poll. */
export function getCurrentSignals(): HealthSignal[] {
  return currentSignals;
}

/** Return the ISO timestamp when the current mode was entered. */
export function getModeSince(): string {
  return modeSince;
}

/** Subscribe to mode changes. Returns an unsubscribe function. */
export function subscribeToMode(cb: (mode: DegradedMode) => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}
