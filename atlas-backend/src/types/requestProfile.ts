/**
 * RequestProfile — V1.0 Sovereign Execution Framework
 *
 * Resolved at Stage 1 (Admission) of the cognitiveOrchestrator conductor pipeline.
 * Carries all routing, context-slicing, and membrane decisions for a single request.
 * Immutable after Stage 2 (Profile Resolution).
 *
 * Downstream consumers (contextCuratorService, swarmOrchestrator, sessionMembraneService)
 * read but never write this object.
 */

import type { SovereignResponseMode } from '../services/intelligence/sovereigntyResponseRouter.js';
import type { AtlasPosture } from '../services/intelligence/omniRouter.js';

// ── Sensitivity classification ─────────────────────────────────────────────

/**
 * Governs which memory tiers are eligible for context injection.
 * high → user_stated + system_inferred
 * medium → user_stated only
 * low → no memory injection (stateless fast path)
 */
export type SensitivityClass = 'low' | 'medium' | 'high';

// ── Synthesis class ────────────────────────────────────────────────────────

/**
 * Preferred synthesis executor for this request.
 * Maps to capabilityRouter model class assignments (Phase C).
 *
 * fast_local   → local Ollama sovereign path
 * fast_cloud   → single direct/delegate swarm model (no consensus)
 * consensus    → dual-model consensus (Groq + Gemini)
 * deep_research → Maximum Clarity pipeline (Tavily + dual + judge)
 */
export type SynthesisClass = 'fast_local' | 'fast_cloud' | 'consensus' | 'deep_research';

// ── Doctrine bundle ────────────────────────────────────────────────────────

/**
 * Named context packs injected by Stage 4 (Context Assembly).
 * Each bundle maps to a set of constitutional, epistemic, or identity signals.
 * Populated by profile resolution; extended by Phase C contextSlicePlanner.
 */
export type DoctrineBundleId =
  | 'core_constitution'
  | 'truth_evidence_ledger'
  | 'decision_ledger'
  | 'cognitive_twin'
  | 'adversarial_truth_chamber'
  | 'legacy_layer'
  | 'evolution_timeline'
  | 'unfinished_business'
  | 'simulation_forge'
  | 'reality_graph'
  | 'identity_action_bridge';

// ── Chamber ────────────────────────────────────────────────────────────────

/**
 * Active Atlas chamber at request time. Drives chamber-scoped memory tiering
 * in contextCuratorService and membrane key composition (Phase B).
 */
export type AtlasChamber =
  | 'home'
  | 'resonance'
  | 'truth_chamber'
  | 'decision_forge'
  | 'legacy'
  | 'simulation'
  | 'evolution'
  | 'identity_bridge'
  | 'sovereign_console'
  | 'unknown';

// ── RequestProfile ─────────────────────────────────────────────────────────

export interface RequestProfile {
  // ── Identity ──────────────────────────────────────────────────────────────

  /** Authoritative database user ID (from verified session). */
  readonly userId: string;

  /** Verified OAuth email — never from request body. Null → public_swarm path. */
  readonly verifiedEmail: string | null;

  /** Whether this user is the sovereign creator (Ryan Crowley). */
  readonly isSovereignOwner: boolean;

  // ── Request classification ────────────────────────────────────────────────

  /** Line-of-inquiry class inferred from or explicitly set by the client. */
  readonly intent: SovereignResponseMode;

  /**
   * Posture level 1–5 (concise → deep synthesis).
   * Governs temperature, memory top-K, and epistemic contract injected into system prompt.
   */
  readonly gravity: AtlasPosture;

  /** Active chamber at request time. */
  readonly chamber: AtlasChamber;

  // ── Context & doctrine ────────────────────────────────────────────────────

  /**
   * Ordered list of doctrine bundles to load during Stage 4 (Context Assembly).
   * Populated by profile resolution; reduced by Phase C contextSlicePlanner per
   * per-specialist token budgets.
   */
  readonly requiredDoctrineBundle: readonly DoctrineBundleId[];

  /**
   * Namespaces eligible for memory retrieval.
   * Filtered by sensitivityClass and sovereignty controls.
   */
  readonly allowedNamespaces: readonly string[];

  // ── Execution policy ──────────────────────────────────────────────────────

  /** Whether swarm multi-agent dispatch is eligible for this request. */
  readonly swarmEligible: boolean;

  /**
   * Whether session membrane validation (Phase B) applies.
   * False for anonymous requests or requests where memoryLayerEnabled is off.
   */
  readonly membraneEligible: boolean;

  /** Sensitivity class governing memory tier eligibility. */
  readonly sensitivityClass: SensitivityClass;

  /** Preferred synthesis executor. */
  readonly preferredSynthesisClass: SynthesisClass;

  // ── Tracing ───────────────────────────────────────────────────────────────

  /** Per-request trace ID for orchestration observability (Phase F). */
  readonly traceId: string;

  /** ISO timestamp of profile resolution. */
  readonly resolvedAt: string;
}

// ── Profile resolution helpers ─────────────────────────────────────────────

/**
 * Resolve which doctrine bundles are required given intent + gravity.
 * Heavy modes pull more bundles; posture 1 (direct_qa fast) pulls none.
 */
export function resolveDoctrineBundles(
  intent: SovereignResponseMode,
  gravity: AtlasPosture,
): DoctrineBundleId[] {
  if (gravity <= 1 && intent === 'direct_qa') {
    return []; // Stateless fast path — no context injection
  }

  const base: DoctrineBundleId[] = ['core_constitution'];

  const intentBundles: Partial<Record<SovereignResponseMode, DoctrineBundleId[]>> = {
    truth_pressure: ['truth_evidence_ledger', 'adversarial_truth_chamber', 'cognitive_twin'],
    contradiction_analysis: ['truth_evidence_ledger', 'adversarial_truth_chamber'],
    decision_support: ['decision_ledger', 'truth_evidence_ledger', 'cognitive_twin'],
    constitutional_alignment: ['core_constitution', 'cognitive_twin'],
    future_simulation: ['simulation_forge', 'decision_ledger', 'reality_graph'],
    legacy_extraction: ['legacy_layer', 'decision_ledger', 'evolution_timeline'],
    identity_operationalization: ['identity_action_bridge', 'cognitive_twin', 'evolution_timeline'],
    self_revision: ['cognitive_twin', 'evolution_timeline', 'unfinished_business'],
    unfinished_surface: ['unfinished_business', 'decision_ledger'],
    calibration_test: ['truth_evidence_ledger', 'cognitive_twin', 'adversarial_truth_chamber'],
    direct_qa: ['truth_evidence_ledger'],
  };

  const extra = intentBundles[intent] ?? [];
  const merged = [...new Set([...base, ...extra])];

  // Gravity 4–5 adds evolution context for deeper synthesis
  if (gravity >= 4 && !merged.includes('evolution_timeline')) {
    merged.push('evolution_timeline');
  }

  return merged;
}

/**
 * Derive sensitivity class from sovereignty flags and intent.
 * Sovereign owner always gets high sensitivity (full memory tiers).
 */
export function resolveSensitivityClass(
  isSovereignOwner: boolean,
  intent: SovereignResponseMode,
  gravity: AtlasPosture,
): SensitivityClass {
  if (isSovereignOwner) return 'high';
  if (gravity <= 1 && intent === 'direct_qa') return 'low';
  if (intent === 'truth_pressure' || intent === 'constitutional_alignment' || intent === 'legacy_extraction') {
    return 'high';
  }
  return 'medium';
}

/**
 * Derive synthesis class from lane + client flags.
 */
export function resolveSynthesisClass(opts: {
  isSovereignOwner: boolean;
  localAvailable: boolean;
  maximumClarity: boolean;
  consensusMode: boolean;
  gravity: AtlasPosture;
}): SynthesisClass {
  if (opts.isSovereignOwner && opts.localAvailable) return 'fast_local';
  if (opts.maximumClarity) return 'deep_research';
  if (opts.consensusMode) return 'consensus';
  if (opts.gravity >= 4) return 'consensus';
  return 'fast_cloud';
}
