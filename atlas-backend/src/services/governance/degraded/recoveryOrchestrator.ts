/**
 * Recovery Orchestrator
 * Phase 4 Section 3 — Generates and executes recovery plans when the system
 * enters a degraded mode. Subscribes to the oracle and auto-triggers recovery
 * when the mode worsens.
 */

import {
  type DegradedMode,
  subscribeToMode,
  getCurrentMode,
} from './degradedModeOracle.js';

/** A single recovery action with retry capability. */
export interface RecoveryStep {
  id: string;
  description: string;
  action: () => Promise<void>;
  retries: number;
}

/** An ordered plan of recovery steps for a given degraded mode. */
export interface RecoveryPlan {
  steps: RecoveryStep[];
  estimatedMinutes: number;
}

/** Result of executing a single recovery step. */
export interface StepResult {
  success: boolean;
  error?: string;
}

let lastTriggeredMode: DegradedMode = 'NOMINAL';
let unsubscribe: (() => void) | null = null;

/**
 * Build a recovery plan appropriate for the given degraded mode.
 * Each deeper mode includes the prior mode's steps plus additional actions.
 */
export async function startRecovery(mode: DegradedMode): Promise<RecoveryPlan> {
  const steps: RecoveryStep[] = [];

  if (mode === 'DEGRADED_1' || mode === 'DEGRADED_2' || mode === 'DEGRADED_3' || mode === 'OFFLINE') {
    steps.push({
      id: 'check-env',
      description: 'Verify critical environment variables are set',
      action: async () => {
        const required = ['SUPABASE_URL', 'GROQ_API_KEY'];
        const missing = required.filter((k) => !process.env[k]);
        if (missing.length > 0) {
          throw new Error(`Missing env vars: ${missing.join(', ')}`);
        }
      },
      retries: 1,
    });

    steps.push({
      id: 'ping-supabase',
      description: 'Attempt to re-establish Supabase connectivity',
      action: async () => {
        const url = process.env.SUPABASE_URL;
        if (!url) throw new Error('SUPABASE_URL not configured');
        const res = await fetch(`${url}/rest/v1/`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(10000),
          headers: { apikey: process.env.SUPABASE_ANON_KEY ?? '' },
        });
        if (!res.ok) throw new Error(`Supabase responded ${res.status}`);
      },
      retries: 3,
    });
  }

  if (mode === 'DEGRADED_2' || mode === 'DEGRADED_3' || mode === 'OFFLINE') {
    steps.push({
      id: 'ping-llm',
      description: 'Verify LLM service (Groq) is reachable',
      action: async () => {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) throw new Error('GROQ_API_KEY not set');
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          method: 'GET',
          signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) throw new Error(`Groq responded ${res.status}`);
      },
      retries: 3,
    });

    steps.push({
      id: 'gc-memory',
      description: 'Run garbage collection if available to free memory',
      action: async () => {
        if (typeof globalThis.gc === 'function') {
          globalThis.gc();
        }
      },
      retries: 1,
    });
  }

  if (mode === 'DEGRADED_3' || mode === 'OFFLINE') {
    steps.push({
      id: 'health-recheck',
      description: 'Re-check backend /health endpoint',
      action: async () => {
        const port = process.env.PORT ?? '3001';
        const host = process.env.HOST ?? '127.0.0.1';
        const res = await fetch(`http://${host}:${port}/health`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`Health check returned ${res.status}`);
      },
      retries: 3,
    });
  }

  if (mode === 'OFFLINE') {
    steps.push({
      id: 'full-diagnostic',
      description: 'Collect full diagnostic snapshot for manual review',
      action: async () => {
        const mem = process.memoryUsage();
        console.log('[recovery] Diagnostic snapshot:', {
          heapUsedMB: (mem.heapUsed / (1024 * 1024)).toFixed(1),
          heapTotalMB: (mem.heapTotal / (1024 * 1024)).toFixed(1),
          rssMB: (mem.rss / (1024 * 1024)).toFixed(1),
          uptime: process.uptime(),
          env: {
            SUPABASE_URL: process.env.SUPABASE_URL ? 'set' : 'unset',
            GROQ_API_KEY: process.env.GROQ_API_KEY ? 'set' : 'unset',
          },
        });
      },
      retries: 1,
    });
  }

  const estimatedMinutes =
    mode === 'OFFLINE' ? 10 : mode === 'DEGRADED_3' ? 5 : mode === 'DEGRADED_2' ? 3 : 1;

  return { steps, estimatedMinutes };
}

/**
 * Execute a single recovery step with retries.
 * Returns success or the last error encountered.
 */
export async function executeStep(step: RecoveryStep): Promise<StepResult> {
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= step.retries; attempt++) {
    try {
      await step.action();
      return { success: true };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < step.retries) {
        // Brief backoff before retry
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  return { success: false, error: lastError };
}

/** Mode order for severity comparison. */
const MODE_SEVERITY: Record<DegradedMode, number> = {
  NOMINAL: 0,
  DEGRADED_1: 1,
  DEGRADED_2: 2,
  DEGRADED_3: 3,
  OFFLINE: 4,
};

/**
 * Initialize the auto-recovery listener.
 * When the oracle reports a worsening mode, recovery is triggered automatically.
 */
export function initAutoRecovery(): void {
  if (unsubscribe) return;
  lastTriggeredMode = getCurrentMode();

  unsubscribe = subscribeToMode((newMode) => {
    if (MODE_SEVERITY[newMode] > MODE_SEVERITY[lastTriggeredMode]) {
      lastTriggeredMode = newMode;
      console.log(`[recovery] Mode worsened to ${newMode}, auto-triggering recovery plan`);
      void runRecoveryPlan(newMode).catch((err) => {
        console.error(`[recovery] Recovery plan failed for mode ${newMode}:`, err);
      });
    } else {
      lastTriggeredMode = newMode;
    }
  });
}

/** Stop the auto-recovery listener. */
export function stopAutoRecovery(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

/** Execute all steps in a recovery plan sequentially. */
async function runRecoveryPlan(mode: DegradedMode): Promise<void> {
  const plan = await startRecovery(mode);
  console.log(
    `[recovery] Executing ${plan.steps.length} steps (est. ${plan.estimatedMinutes} min)`
  );

  for (const step of plan.steps) {
    const result = await executeStep(step);
    if (result.success) {
      console.log(`[recovery] ✓ ${step.description}`);
    } else {
      console.log(`[recovery] ✗ ${step.description}: ${result.error}`);
    }
  }
}
