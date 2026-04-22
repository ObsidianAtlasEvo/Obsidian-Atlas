/**
 * capabilityRouter.ts — V1.0 Phase C
 *
 * Runtime capability check that runs between Stage 1 (compute lane) and
 * Stage 3 (profile freeze). It validates whether the requested synthesis class
 * is actually executable given the current degraded state and available model
 * credentials, and returns the highest-capability lane that CAN execute.
 *
 * Problem solved:
 *   resolveSynthesisClass() is purely declarative — it resolves the DESIRED class
 *   from client flags (consensusMode, maximumClarity, gravity). It has no
 *   visibility into whether the required models are actually available at runtime.
 *
 *   Without capabilityRouter, a request for 'consensus' while Groq is down
 *   silently falls into an error branch inside _swarmDispatch. With it, the
 *   conductor degrades gracefully to the best available lane BEFORE dispatch.
 *
 * Capability matrix:
 *   fast_local    — requires: DISABLE_LOCAL_OLLAMA !== true
 *   fast_cloud    — requires: at least one of GROQ_API_KEY / CLOUD_OPENAI_API_KEY / GEMINI_API_KEY
 *   consensus     — requires: GROQ_API_KEY (Llama 3.3 70B) AND GEMINI_API_KEY (Gemini 2.5)
 *   deep_research — requires: TAVILY_API_KEY AND (GROQ_API_KEY OR GEMINI_API_KEY)
 *
 * Fallback chain (in priority order):
 *   deep_research → consensus → fast_cloud → fast_local → (no-op / error)
 *   consensus     → fast_cloud
 *   fast_local    → fast_cloud (if local unavailable)
 *
 * Design contract:
 *   - Pure function: no I/O, no side effects
 *   - Synchronous — adds <0.1 ms to hot path
 *   - Never throws — always returns a CapabilityResolution
 *   - Returns the requested class unchanged if it is executable
 *
 * Usage (between Stage 1 and Stage 3 in cognitiveOrchestrator):
 *   const capRes = resolveCapability(requestedSynthesisClass, degraded, env);
 *   // Use capRes.resolvedClass instead of the original synthesis class in profile build.
 */

import type { SynthesisClass } from '../../types/requestProfile.js';

// ── Inputs ────────────────────────────────────────────────────────────────

/**
 * Subset of env vars that the capability router inspects.
 * Mirrors the shape from config/env.ts — we accept a partial to avoid
 * coupling to the full env object.
 */
export interface CapabilityEnvSnapshot {
  groqApiKey?: string | null;
  cloudOpenAiApiKey?: string | null;
  geminiApiKey?: string | null;
  tavilyApiKey?: string | null;
  disableLocalOllama?: boolean;
}

/**
 * Degraded-state flags from Stage 0 snapshot.
 */
export interface DegradedSnapshot {
  groqUnavailable: boolean;
  localOllamaDisabled: boolean;
  memoryLayerEnabled: boolean;
}

// ── Output ────────────────────────────────────────────────────────────────

export interface CapabilityResolution {
  /** The synthesis class that will actually execute. */
  resolvedClass: SynthesisClass;

  /** Whether the requested class was downgraded. */
  downgraded: boolean;

  /** Human-readable reason if downgraded, or 'capability_ok' if not. */
  reason: string;

  /** Which capabilities were checked and their verdicts. */
  capabilityMap: Record<SynthesisClass, boolean>;
}

// ── Capability checks ─────────────────────────────────────────────────────

function hasGroq(env: CapabilityEnvSnapshot, deg: DegradedSnapshot): boolean {
  return !deg.groqUnavailable && !!env.groqApiKey?.trim();
}

function hasGemini(env: CapabilityEnvSnapshot): boolean {
  return !!env.geminiApiKey?.trim();
}

function hasCloud(env: CapabilityEnvSnapshot, deg: DegradedSnapshot): boolean {
  return (
    !deg.groqUnavailable &&
    (!!env.groqApiKey?.trim() ||
      !!env.cloudOpenAiApiKey?.trim() ||
      hasGemini(env))
  );
}

function hasTavily(env: CapabilityEnvSnapshot): boolean {
  return !!env.tavilyApiKey?.trim();
}

function canExecute(
  cls: SynthesisClass,
  env: CapabilityEnvSnapshot,
  deg: DegradedSnapshot,
): boolean {
  switch (cls) {
    case 'fast_local':
      return !deg.localOllamaDisabled;
    case 'fast_cloud':
      return hasCloud(env, deg);
    case 'consensus':
      return hasGroq(env, deg) && hasGemini(env);
    case 'deep_research':
      return hasTavily(env) && (hasGroq(env, deg) || hasGemini(env));
  }
}

// ── Fallback chain ────────────────────────────────────────────────────────

const FALLBACK_CHAIN: Record<SynthesisClass, SynthesisClass[]> = {
  deep_research: ['consensus', 'fast_cloud', 'fast_local'],
  consensus: ['fast_cloud', 'fast_local'],
  fast_cloud: ['fast_local'],
  fast_local: ['fast_cloud'],
};

// ── Public API ────────────────────────────────────────────────────────────

/**
 * resolveCapability
 *
 * Validates whether the requested synthesis class can execute with current
 * credentials and degraded state. Returns the best available class.
 *
 * @param requested  The synthesis class resolved by resolveSynthesisClass().
 * @param degraded   Stage 0 degraded state snapshot.
 * @param env        Env snapshot with relevant API key presence flags.
 * @returns          CapabilityResolution — never throws.
 */
export function resolveCapability(
  requested: SynthesisClass,
  degraded: DegradedSnapshot,
  env: CapabilityEnvSnapshot,
): CapabilityResolution {
  const capabilityMap: Record<SynthesisClass, boolean> = {
    fast_local: canExecute('fast_local', env, degraded),
    fast_cloud: canExecute('fast_cloud', env, degraded),
    consensus: canExecute('consensus', env, degraded),
    deep_research: canExecute('deep_research', env, degraded),
  };

  // Requested class is already executable — passthrough.
  if (capabilityMap[requested]) {
    return {
      resolvedClass: requested,
      downgraded: false,
      reason: 'capability_ok',
      capabilityMap,
    };
  }

  // Walk fallback chain until we find an executable class.
  const chain = FALLBACK_CHAIN[requested] ?? [];
  for (const fallback of chain) {
    if (capabilityMap[fallback]) {
      const missingReason = buildMissingReason(requested, env, degraded);
      return {
        resolvedClass: fallback,
        downgraded: true,
        reason: `${requested}_unavailable:${missingReason} → downgraded to ${fallback}`,
        capabilityMap,
      };
    }
  }

  // Absolute last resort: fast_cloud (partial degradation, something will handle it)
  return {
    resolvedClass: 'fast_cloud',
    downgraded: true,
    reason: `${requested}_unavailable:no_capable_lane → emergency fallback to fast_cloud`,
    capabilityMap,
  };
}

// ── Diagnostic helpers ────────────────────────────────────────────────────

function buildMissingReason(
  cls: SynthesisClass,
  env: CapabilityEnvSnapshot,
  deg: DegradedSnapshot,
): string {
  switch (cls) {
    case 'fast_local':
      return 'ollama_disabled';
    case 'fast_cloud':
      return 'no_cloud_keys';
    case 'consensus': {
      const missing: string[] = [];
      if (!hasGroq(env, deg)) missing.push('groq');
      if (!hasGemini(env)) missing.push('gemini');
      return `missing_keys:[${missing.join(',')}]`;
    }
    case 'deep_research': {
      const missing: string[] = [];
      if (!hasTavily(env)) missing.push('tavily');
      if (!hasGroq(env, deg) && !hasGemini(env)) missing.push('no_llm');
      return `missing_keys:[${missing.join(',')}]`;
    }
  }
}

/**
 * describeCapabilityResolution
 *
 * Returns a human-readable one-liner for SSE trace events and checkpoint summaries.
 */
export function describeCapabilityResolution(res: CapabilityResolution): string {
  if (!res.downgraded) {
    return `capability:${res.resolvedClass} ok`;
  }
  return `capability:${res.resolvedClass} (downgraded) ${res.reason}`;
}
