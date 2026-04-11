/**
 * failureModeDoctrine.ts
 * Atlas Phase 3 — Resilience Layer
 *
 * Explicit degraded-mode behavior for every Atlas system failure.
 * When a system fails, Atlas enters a known safe operating mode — it never
 * crashes silently or pretends everything is fine.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AtlasSystem =
  | 'evolution_engine'
  | 'evidence_arbitrator'
  | 'overseer'
  | 'concept_graph'
  | 'event_bus'
  | 'goal_memory'
  | 'mutation_constitution'
  | 'identity_resolver'
  | 'resonance_engine'
  | 'crucible_engine'
  | 'profile_state'
  | 'supabase'
  | 'groq_api'
  | 'ollama';

export type FailureType =
  | 'timeout'
  | 'error'
  | 'corrupted_state'
  | 'backlog_spike'
  | 'stale_data'
  | 'unreachable'
  | 'partial_failure';

export interface DegradedMode {
  system: AtlasSystem;
  failureType: FailureType;
  mode: string;               // name of the degraded mode
  behavior: string;           // what Atlas does in plain language
  promptInjection: string;    // injected into system prompt during degraded mode
  userVisible: boolean;       // should the user be told?
  userMessage?: string;       // if visible, what to say
  autoRecovery: boolean;      // does this mode attempt to recover automatically?
  recoveryStrategy: string;   // how recovery is attempted
  maxDurationMs: number;      // how long before escalating to harder fallback
  escalatesTo?: string | undefined;  // next mode name if this one expires
}

export interface SystemHealthState {
  system: AtlasSystem;
  status: 'healthy' | 'degraded' | 'failed' | 'unknown';
  currentMode: string | null;
  degradedSince: number | null;
  lastHealthCheck: number;
  failureCount: number;
  consecutiveFailures: number;
  lastError: string | null;
}

export interface AtlasHealthReport {
  timestamp: number;
  overallStatus: 'healthy' | 'degraded' | 'critical';
  systems: SystemHealthState[];
  activeDegragedModes: DegradedMode[];
  estimatedCapacity: number;  // 0–1 fraction of full capability available
  safeToOperate: boolean;
}

// ---------------------------------------------------------------------------
// Minimum viable prompt (used when 3+ systems are degraded)
// ---------------------------------------------------------------------------

const MINIMUM_VIABLE_PROMPT =
  'You are Atlas. Respond truthfully, directly, and precisely. ' +
  'Personalization is temporarily unavailable. ' +
  'Truth-first. No filler. No false certainty.';

// ---------------------------------------------------------------------------
// Capacity weights — each system contributes a fraction of total capacity
// ---------------------------------------------------------------------------

const SYSTEM_CAPACITY_WEIGHT: Record<AtlasSystem, number> = {
  evolution_engine:     0.08,
  evidence_arbitrator:  0.12,
  overseer:             0.08,
  concept_graph:        0.06,
  event_bus:            0.06,
  goal_memory:          0.06,
  mutation_constitution:0.12,
  identity_resolver:    0.10,
  resonance_engine:     0.06,
  crucible_engine:      0.06,
  profile_state:        0.08,
  supabase:             0.06,
  groq_api:             0.12,
  ollama:               0.04,
};

// ---------------------------------------------------------------------------
// FailureModeDoctrine
// ---------------------------------------------------------------------------

export class FailureModeDoctrine {
  private healthStates: Map<AtlasSystem, SystemHealthState>;
  private activeDegradedModes: Map<AtlasSystem, DegradedMode>;
  private doctrine: DegradedMode[];

  constructor() {
    this.healthStates = new Map();
    this.activeDegradedModes = new Map();
    this.doctrine = [];
    this.initializeDoctrine();
    this.initializeHealthStates();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Record a system failure. Selects the matching DegradedMode from doctrine,
   * activates it, and updates health state.
   */
  recordFailure(
    system: AtlasSystem,
    failureType: FailureType,
    error?: string
  ): DegradedMode {
    const now = Date.now();
    const state = this.getOrCreateHealthState(system);

    state.status = 'degraded';
    state.failureCount += 1;
    state.consecutiveFailures += 1;
    state.lastHealthCheck = now;
    state.lastError = error ?? null;

    // Find best matching doctrine entry (exact match on system + failureType,
    // then fall back to system-only match)
    const mode =
      this.doctrine.find(
        (d) => d.system === system && d.failureType === failureType
      ) ??
      this.doctrine.find((d) => d.system === system);

    if (!mode) {
      // No doctrine entry — create a generic fallback
      const fallback: DegradedMode = {
        system,
        failureType,
        mode: 'UNDOCUMENTED_FAILURE',
        behavior: `System '${system}' has encountered a ${failureType} failure with no doctrine entry. Operating in maximum-safety fallback mode.`,
        promptInjection: `WARNING: System '${system}' is unavailable. Proceed with maximum epistemic caution.`,
        userVisible: false,
        autoRecovery: true,
        recoveryStrategy: `Retry ${system} every 60 seconds.`,
        maxDurationMs: 300_000,
      };
      this.activeDegradedModes.set(system, fallback);
      state.currentMode = fallback.mode;
      state.degradedSince = state.degradedSince ?? now;
      console.warn(
        `[FailureModeDoctrine] No doctrine entry for system='${system}' failureType='${failureType}'. Using generic fallback.`
      );
      return fallback;
    }

    // Check escalation — if the current mode has been active past maxDurationMs
    const existingMode = this.activeDegradedModes.get(system);
    const degradedSince = state.degradedSince ?? now;

    if (
      existingMode &&
      existingMode.mode === mode.mode &&
      now - degradedSince > mode.maxDurationMs &&
      mode.escalatesTo
    ) {
      // Escalate to the next mode
      const escalated = this.doctrine.find((d) => d.system === system && d.mode === mode.escalatesTo);
      if (escalated) {
        this.activeDegradedModes.set(system, escalated);
        state.currentMode = escalated.mode;
        console.warn(
          `[FailureModeDoctrine] Escalating '${system}' from '${mode.mode}' to '${escalated.mode}' after ${Math.round((now - degradedSince) / 1000)}s.`
        );
        return escalated;
      }
    }

    this.activeDegradedModes.set(system, mode);
    state.currentMode = mode.mode;
    state.degradedSince = state.degradedSince ?? now;

    console.warn(
      `[FailureModeDoctrine] System '${system}' entered degraded mode '${mode.mode}' (${failureType}). Error: ${error ?? 'none'}`
    );

    return mode;
  }

  /**
   * Record a successful system call — resets consecutive failure count.
   */
  recordSuccess(system: AtlasSystem): void {
    const state = this.getOrCreateHealthState(system);
    state.consecutiveFailures = 0;
    state.lastHealthCheck = Date.now();

    if (state.status !== 'healthy') {
      state.status = 'healthy';
      state.currentMode = null;
      state.degradedSince = null;
      this.activeDegradedModes.delete(system);
      console.log(`[FailureModeDoctrine] System '${system}' recovered to healthy.`);
    }
  }

  /**
   * Get the active degraded mode for a system (null if healthy).
   */
  getMode(system: AtlasSystem): DegradedMode | null {
    return this.activeDegradedModes.get(system) ?? null;
  }

  /**
   * Get all prompt injections from currently active degraded modes (non-empty strings only).
   */
  getDegradedPromptInjections(): string[] {
    const injections: string[] = [];
    for (const mode of this.activeDegradedModes.values()) {
      if (mode.promptInjection && mode.promptInjection.trim().length > 0) {
        injections.push(mode.promptInjection.trim());
      }
    }
    return injections;
  }

  /**
   * Generate a full health report for all tracked systems.
   */
  getHealthReport(): AtlasHealthReport {
    const now = Date.now();
    const systems = Array.from(this.healthStates.values());
    const activeModes = Array.from(this.activeDegradedModes.values());

    const degradedCount = systems.filter(
      (s) => s.status === 'degraded' || s.status === 'failed'
    ).length;

    let overallStatus: AtlasHealthReport['overallStatus'] = 'healthy';
    if (degradedCount >= 3) {
      overallStatus = 'critical';
    } else if (degradedCount >= 1) {
      overallStatus = 'degraded';
    }

    // Estimated capacity: sum of healthy system weights
    let capacity = 0;
    for (const state of systems) {
      if (state.status === 'healthy') {
        capacity += SYSTEM_CAPACITY_WEIGHT[state.system] ?? 0;
      }
    }
    // Clamp to [0, 1]
    capacity = Math.min(1, Math.max(0, capacity));

    return {
      timestamp: now,
      overallStatus,
      systems,
      activeDegragedModes: activeModes,
      estimatedCapacity: Math.round(capacity * 100) / 100,
      safeToOperate: this.isSafeToOperate(),
    };
  }

  /**
   * Attempt recovery for a system (calls the recovery strategy via a simulated probe).
   * Returns true if the system is now healthy.
   */
  async attemptRecovery(system: AtlasSystem): Promise<boolean> {
    const mode = this.activeDegradedModes.get(system);
    if (!mode) {
      // Already healthy
      return true;
    }

    if (!mode.autoRecovery) {
      console.warn(
        `[FailureModeDoctrine] System '${system}' in mode '${mode.mode}' does not support auto-recovery. Sovereign intervention required.`
      );
      return false;
    }

    console.log(
      `[FailureModeDoctrine] Attempting recovery for '${system}' (mode: '${mode.mode}'). Strategy: ${mode.recoveryStrategy}`
    );

    // In production, each system would expose a health-check probe.
    // Here we implement the recovery probes for known systems.
    let recovered = false;
    try {
      recovered = await this.probeSystem(system);
    } catch (err) {
      console.error(
        `[FailureModeDoctrine] Recovery probe for '${system}' threw: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (recovered) {
      this.recordSuccess(system);
    }

    return recovered;
  }

  /**
   * Check if Atlas has the minimum viable systems operational to safely respond.
   * Atlas requires: identity_resolver + (groq_api OR ollama) to be healthy.
   */
  isSafeToOperate(): boolean {
    const identityOk =
      (this.healthStates.get('identity_resolver')?.status ?? 'unknown') === 'healthy';
    const groqOk =
      (this.healthStates.get('groq_api')?.status ?? 'unknown') === 'healthy';
    const ollamaOk =
      (this.healthStates.get('ollama')?.status ?? 'unknown') === 'healthy';

    return identityOk && (groqOk || ollamaOk);
  }

  /**
   * Build the minimum viable system prompt when 3+ systems are degraded.
   * Otherwise builds a composite prompt with all active degraded-mode injections.
   */
  buildMinimumViablePrompt(): string {
    const degradedCount = Array.from(this.healthStates.values()).filter(
      (s) => s.status === 'degraded' || s.status === 'failed'
    ).length;

    if (degradedCount >= 3) {
      return MINIMUM_VIABLE_PROMPT;
    }

    const injections = this.getDegradedPromptInjections();
    if (injections.length === 0) {
      return '';
    }

    return (
      '### DEGRADED MODE NOTICES\n' +
      injections.map((inj) => `- ${inj}`).join('\n')
    );
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  /**
   * System-specific health probe. Replace each branch with real connectivity
   * checks (HTTP ping, DB query, gRPC healthcheck, etc.) in production.
   */
  private async probeSystem(system: AtlasSystem): Promise<boolean> {
    switch (system) {
      case 'supabase':
        // TODO: fetch(`${SUPABASE_URL}/health`)
        return false;
      case 'groq_api':
        // TODO: groq.healthcheck()
        return false;
      case 'ollama':
        // TODO: fetch('http://localhost:11434/api/tags')
        return false;
      case 'event_bus':
        // Auto-recovers when queue drains — check queue depth
        return false;
      default:
        // Generic in-process systems: assume recoverable after the base retry window
        return false;
    }
  }

  private getOrCreateHealthState(system: AtlasSystem): SystemHealthState {
    if (!this.healthStates.has(system)) {
      this.healthStates.set(system, {
        system,
        status: 'unknown',
        currentMode: null,
        degradedSince: null,
        lastHealthCheck: Date.now(),
        failureCount: 0,
        consecutiveFailures: 0,
        lastError: null,
      });
    }
    return this.healthStates.get(system)!;
  }

  private initializeHealthStates(): void {
    const allSystems: AtlasSystem[] = [
      'evolution_engine',
      'evidence_arbitrator',
      'overseer',
      'concept_graph',
      'event_bus',
      'goal_memory',
      'mutation_constitution',
      'identity_resolver',
      'resonance_engine',
      'crucible_engine',
      'profile_state',
      'supabase',
      'groq_api',
      'ollama',
    ];

    for (const system of allSystems) {
      this.healthStates.set(system, {
        system,
        status: 'healthy',
        currentMode: null,
        degradedSince: null,
        lastHealthCheck: Date.now(),
        failureCount: 0,
        consecutiveFailures: 0,
        lastError: null,
      });
    }
  }

  /**
   * Define the full doctrine — one or more DegradedMode entries per system.
   * The failure-type-specific entries are checked first; fallback is the
   * system-level default if no exact match is found.
   */
  private initializeDoctrine(): void {
    this.doctrine = [

      // -----------------------------------------------------------------------
      // evolution_engine — timeout or error
      // -----------------------------------------------------------------------
      {
        system: 'evolution_engine',
        failureType: 'timeout',
        mode: 'STATIC_PROFILE',
        behavior:
          'Use last known cached profile. Do not attempt to capture new signals. ' +
          'Respond based on existing adaptations.',
        promptInjection:
          'Note: Evolution engine offline. Using cached profile state. ' +
          'No new adaptations will be committed this session.',
        userVisible: false,
        autoRecovery: true,
        recoveryStrategy: 'Retry evolution_engine every 60 seconds.',
        maxDurationMs: 300_000, // 5 min
        escalatesTo: 'DEFAULT_PROFILE',
      },
      {
        system: 'evolution_engine',
        failureType: 'error',
        mode: 'STATIC_PROFILE',
        behavior:
          'Use last known cached profile. Do not attempt to capture new signals. ' +
          'Respond based on existing adaptations.',
        promptInjection:
          'Note: Evolution engine offline. Using cached profile state. ' +
          'No new adaptations will be committed this session.',
        userVisible: false,
        autoRecovery: true,
        recoveryStrategy: 'Retry evolution_engine every 60 seconds.',
        maxDurationMs: 300_000,
        escalatesTo: 'DEFAULT_PROFILE',
      },
      // Escalation target for evolution_engine: wipe cache, use baseline
      {
        system: 'evolution_engine',
        failureType: 'partial_failure',
        mode: 'DEFAULT_PROFILE',
        behavior:
          'Cached profile wiped. Falling back to baseline Atlas defaults. ' +
          'No personalization active for this session.',
        promptInjection:
          'Evolution system fully offline. Operating on baseline Atlas defaults. ' +
          'No personalization is active.',
        userVisible: false,
        autoRecovery: true,
        recoveryStrategy: 'Full restart of evolution_engine on next session init.',
        maxDurationMs: 3_600_000, // 1 hour
      },

      // -----------------------------------------------------------------------
      // evidence_arbitrator — timeout
      // -----------------------------------------------------------------------
      {
        system: 'evidence_arbitrator',
        failureType: 'timeout',
        mode: 'UNVERIFIED_RESPONSE',
        behavior:
          'Respond without claim verification. Increase epistemic hedging automatically.',
        promptInjection:
          "CRITICAL: Evidence arbitration unavailable. Mark ALL factual claims as [UNVERIFIED]. " +
          "Use 'I believe', 'my understanding is' for every factual statement. " +
          "Do not assert with confidence.",
        userVisible: false,
        autoRecovery: true,
        recoveryStrategy: 'Retry evidence_arbitrator every 30 seconds.',
        maxDurationMs: 180_000, // 3 min
      },
      {
        system: 'evidence_arbitrator',
        failureType: 'error',
        mode: 'UNVERIFIED_RESPONSE',
        behavior:
          'Respond without claim verification. Increase epistemic hedging automatically.',
        promptInjection:
          "CRITICAL: Evidence arbitration unavailable. Mark ALL factual claims as [UNVERIFIED]. " +
          "Use 'I believe', 'my understanding is' for every factual statement. " +
          "Do not assert with confidence.",
        userVisible: false,
        autoRecovery: true,
        recoveryStrategy: 'Retry evidence_arbitrator every 30 seconds.',
        maxDurationMs: 180_000,
      },

      // -----------------------------------------------------------------------
      // overseer — timeout or error
      // -----------------------------------------------------------------------
      {
        system: 'overseer',
        failureType: 'timeout',
        mode: 'DIRECT_SYNTHESIS',
        behavior:
          'Send the raw synthesis directly to the user without overseer filtering.',
        promptInjection:
          'Overseer unavailable. You are responsible for your own quality standards. ' +
          'Apply your full Atlas identity without external quality check.',
        userVisible: false,
        autoRecovery: true,
        recoveryStrategy: 'Retry overseer every 30 seconds.',
        maxDurationMs: 300_000,
      },
      {
        system: 'overseer',
        failureType: 'error',
        mode: 'DIRECT_SYNTHESIS',
        behavior:
          'Send the raw synthesis directly to the user without overseer filtering.',
        promptInjection:
          'Overseer unavailable. You are responsible for your own quality standards. ' +
          'Apply your full Atlas identity without external quality check.',
        userVisible: false,
        autoRecovery: true,
        recoveryStrategy: 'Retry overseer every 30 seconds.',
        maxDurationMs: 300_000,
      },

      // -----------------------------------------------------------------------
      // profile_state — corrupted
      // -----------------------------------------------------------------------
      {
        system: 'profile_state',
        failureType: 'corrupted_state',
        mode: 'ISOLATED_SESSION',
        behavior:
          'Treat this session as a fresh user with no profile. ' +
          'Do not attempt to use corrupted state. Log for sovereign review.',
        promptInjection:
          'Profile state corrupted. Operating in isolated mode. ' +
          'Treat this user as a first-time user. Do not attempt to personalize.',
        userVisible: true,
        userMessage:
          'Atlas is experiencing a profile sync issue. ' +
          'Your session will work normally — personalization will resume once resolved.',
        autoRecovery: false,
        recoveryStrategy:
          'Requires sovereign intervention. Flag the corrupted record in sovereign_audit table and halt profile writes.',
        maxDurationMs: Number.MAX_SAFE_INTEGER, // until sovereign resolves
      },

      // -----------------------------------------------------------------------
      // supabase — unreachable
      // -----------------------------------------------------------------------
      {
        system: 'supabase',
        failureType: 'unreachable',
        mode: 'LOCAL_ONLY',
        behavior:
          'Use in-memory state only. Queue all writes for when connection restores. ' +
          'Do not fail user-facing operations.',
        promptInjection: '', // transparent to user
        userVisible: false,
        autoRecovery: true,
        recoveryStrategy: 'Retry Supabase connection every 15 seconds. Flush write queue on reconnect.',
        maxDurationMs: 600_000, // 10 min
      },

      // -----------------------------------------------------------------------
      // groq_api — unreachable
      // -----------------------------------------------------------------------
      {
        system: 'groq_api',
        failureType: 'unreachable',
        mode: 'DEGRADED_RESPONSE',
        behavior:
          'Attempt Ollama fallback. If Ollama also unavailable, serve a minimal response ' +
          'explaining Atlas is temporarily limited.',
        promptInjection:
          'Primary inference layer unavailable. If Ollama is reachable, route through Ollama. ' +
          'Maintain full Atlas identity and truth standards regardless of inference layer.',
        userVisible: true,
        userMessage:
          "Atlas's primary inference layer is temporarily unavailable. Responses may be limited.",
        autoRecovery: true,
        recoveryStrategy:
          'Attempt Ollama immediately. Retry groq_api every 30 seconds. ' +
          'Switch back to Groq when connectivity restores.',
        maxDurationMs: 600_000,
      },

      // -----------------------------------------------------------------------
      // event_bus — backlog spike
      // -----------------------------------------------------------------------
      {
        system: 'event_bus',
        failureType: 'backlog_spike',
        mode: 'SYNCHRONOUS_WRITES',
        behavior:
          'Disable batched async writes. Write events synchronously. ' +
          'Skip non-critical events (style/tone signals).',
        promptInjection: '', // transparent to user
        userVisible: false,
        autoRecovery: true,
        recoveryStrategy:
          'Monitor queue depth every 5 seconds. Auto-resolve when queue drains below threshold.',
        maxDurationMs: 120_000, // 2 min
      },

      // -----------------------------------------------------------------------
      // concept_graph — stale data
      // -----------------------------------------------------------------------
      {
        system: 'concept_graph',
        failureType: 'stale_data',
        mode: 'FROZEN_GRAPH',
        behavior:
          'Serve last known graph. Disable new edge/node creation. ' +
          'Resume hygiene when recovered.',
        promptInjection: '', // transparent to user
        userVisible: false,
        autoRecovery: true,
        recoveryStrategy:
          'Trigger graph hygiene job. Poll for completion every 30 seconds.',
        maxDurationMs: 300_000,
      },

      // -----------------------------------------------------------------------
      // mutation_constitution — error
      // -----------------------------------------------------------------------
      {
        system: 'mutation_constitution',
        failureType: 'error',
        mode: 'CONSTITUTION_LOCKDOWN',
        behavior:
          'Freeze all profile mutations immediately. No evolution writes permitted until ' +
          'constitution is restored. All adaptation signals are queued but not applied.',
        promptInjection:
          'CRITICAL: Mutation constitution unavailable. All behavioral adaptations are suspended. ' +
          'Atlas is operating on its last validated identity state.',
        userVisible: false,
        autoRecovery: true,
        recoveryStrategy:
          'Retry mutation_constitution every 30 seconds. On recovery, replay queued signals through validation.',
        maxDurationMs: 300_000,
      },
      {
        system: 'mutation_constitution',
        failureType: 'timeout',
        mode: 'CONSTITUTION_LOCKDOWN',
        behavior:
          'Freeze all profile mutations. No evolution writes permitted until constitution restores.',
        promptInjection:
          'CRITICAL: Mutation constitution unavailable. All behavioral adaptations suspended.',
        userVisible: false,
        autoRecovery: true,
        recoveryStrategy: 'Retry mutation_constitution every 30 seconds.',
        maxDurationMs: 300_000,
      },

      // -----------------------------------------------------------------------
      // identity_resolver — error
      // -----------------------------------------------------------------------
      {
        system: 'identity_resolver',
        failureType: 'error',
        mode: 'HARDCODED_IDENTITY',
        behavior:
          'Fall back to hardcoded Atlas identity constants. ' +
          'No dynamic identity resolution. Respond as base Atlas.',
        promptInjection:
          'Identity resolver offline. Responding as baseline Atlas. ' +
          'Core identity is hardcoded and immutable. Do not deviate.',
        userVisible: false,
        autoRecovery: true,
        recoveryStrategy: 'Retry identity_resolver every 15 seconds.',
        maxDurationMs: 120_000,
      },

      // -----------------------------------------------------------------------
      // resonance_engine — error
      // -----------------------------------------------------------------------
      {
        system: 'resonance_engine',
        failureType: 'error',
        mode: 'RESONANCE_SUSPENDED',
        behavior:
          'Disable resonance tracking for this session. Respond without resonance scoring. ' +
          'Do not attempt to write resonance events.',
        promptInjection: '', // silent — resonance is enhancement, not safety-critical
        userVisible: false,
        autoRecovery: true,
        recoveryStrategy: 'Retry resonance_engine every 60 seconds.',
        maxDurationMs: 300_000,
      },

      // -----------------------------------------------------------------------
      // crucible_engine — error
      // -----------------------------------------------------------------------
      {
        system: 'crucible_engine',
        failureType: 'error',
        mode: 'CRUCIBLE_UNAVAILABLE',
        behavior:
          'Disable Crucible mode. Route user to standard chat. ' +
          'Inform user that structured challenge mode is temporarily offline.',
        promptInjection:
          'Crucible engine offline. Operating in standard chat mode. ' +
          'Structured adversarial challenges are not available this session.',
        userVisible: true,
        userMessage:
          'Atlas Crucible mode is temporarily unavailable. You can continue in standard chat.',
        autoRecovery: true,
        recoveryStrategy: 'Retry crucible_engine every 60 seconds.',
        maxDurationMs: 600_000,
      },

      // -----------------------------------------------------------------------
      // goal_memory — error
      // -----------------------------------------------------------------------
      {
        system: 'goal_memory',
        failureType: 'error',
        mode: 'SESSION_GOALS_ONLY',
        behavior:
          'Disable persistent goal tracking. Keep session-scoped goals in memory only. ' +
          'Do not write goal updates to persistence layer.',
        promptInjection:
          'Goal memory offline. Long-term goal tracking is suspended this session. ' +
          'Focus on the immediate conversation without referencing prior stated goals.',
        userVisible: false,
        autoRecovery: true,
        recoveryStrategy: 'Retry goal_memory every 30 seconds.',
        maxDurationMs: 300_000,
      },

      // -----------------------------------------------------------------------
      // ollama — unreachable (fallback inference)
      // -----------------------------------------------------------------------
      {
        system: 'ollama',
        failureType: 'unreachable',
        mode: 'OLLAMA_UNAVAILABLE',
        behavior:
          'Ollama fallback unavailable. If Groq is healthy, continue normally. ' +
          'If both Groq and Ollama are down, serve minimal response.',
        promptInjection: '', // transparent if Groq is healthy
        userVisible: false,
        autoRecovery: true,
        recoveryStrategy: 'Retry Ollama health check every 60 seconds.',
        maxDurationMs: 3_600_000,
      },
    ];
  }

  getUserFacingMessages(): string[] {
    const out: string[] = [];
    for (const mode of this.activeDegradedModes.values()) {
      if (mode.userVisible && mode.userMessage) {
        out.push(mode.userMessage);
      }
    }
    return out;
  }

  isDegraded(system: AtlasSystem): boolean {
    return this.activeDegradedModes.has(system);
  }

  /** Per-system health rows for `/health` and operators. */
  getHealthSnapshot(): SystemHealthState[] {
    return Array.from(this.healthStates.values());
  }

  async withFallback<T>(
    system: AtlasSystem,
    primary: () => Promise<T>,
    fallback: (mode: string) => Promise<T>,
    _ctx?: { userId?: string; sessionId?: string },
  ): Promise<T> {
    try {
      const r = await primary();
      this.recordSuccess(system);
      return r;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const mode = this.recordFailure(system, 'error', msg);
      return fallback(mode.mode);
    }
  }
}

let _failureDoctrine: FailureModeDoctrine | null = null;

export function getFailureModeDoctrine(
  _onCritical?: (event: unknown) => void,
): FailureModeDoctrine {
  if (!_failureDoctrine) {
    _failureDoctrine = new FailureModeDoctrine();
  }
  return _failureDoctrine;
}

export function doctrineMiddleware(_doctrine: FailureModeDoctrine) {
  return async (_req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    // Phase 3 hook point: block writes when operating in paranoid / read-only modes.
  };
}
