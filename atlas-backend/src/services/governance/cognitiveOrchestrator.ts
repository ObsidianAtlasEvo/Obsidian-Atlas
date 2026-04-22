/**
 * cognitiveOrchestrator.ts — V1.0 Sovereign Execution Framework
 *
 * The hot-path conductor for every Atlas inference request.
 * Implements an 8-stage deterministic pipeline extracted from omniStream.ts.
 *
 * Stage model:
 *   Stage 0 — Degraded state snapshot (captured at admission)
 *   Stage 1 — Compute lane resolution  (resolveOmniComputeLane)
 *   Stage 2 — Mode + posture resolution (resolveOmniRouting)
 *   Stage 3 — Request preparation      (routing envelope, policy profile)
 *   Stage 4 — Context assembly         (recallRawRows → curateContext → block)
 *   Stage 5 — Execution planning       (swarm plan selection)
 *   Stage 6 — Primary execution        (local / swarm / consensus / deep-research)
 *   Stage 7 — Post-response quality    (overseer annotation, 5s race)
 *   Stage 8 — Async aftermath          (evolution trigger — caller's responsibility)
 *
 * Role boundaries:
 *   router.ts / omniRouter.ts  → Stage 1/2 callees only; not rewritten
 *   contextCuratorService      → Stage 4; first time wired into hot path
 *   overseerService            → Stage 7; pure post-hoc annotation
 *   swarmOrchestrator          → Stage 5/6; dispatch only
 *
 * Legacy: dispatchCognitiveCommand() is preserved for cognitiveGovernanceRoutes.ts.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import type { CognitiveCommandKind } from '../../types/cognitiveSovereignty.js';
import { cognitiveCommandKindSchema } from '../../types/cognitiveSovereignty.js';
import { evaluateConstitutionalAlignment } from './constitutionalCoreService.js';
import type { PolicyProfile } from '../../types/atlas.js';
import { getPolicyProfile } from '../evolution/policyStore.js';
import {
  resolveDoctrineBundles,
  resolveSensitivityClass,
  resolveSynthesisClass,
  type AtlasChamber,
  type RequestProfile,
} from '../../types/requestProfile.js';
import {
  resolveOmniRouting,
  resolveOmniComputeLane,
  executeLocalOllama,
  injectAtlasRoutingIntoMessages,
  executeGroqGeminiDualConsensus,
  type OmniRoutingResolution,
} from '../intelligence/omniRouter.js';
import {
  isSovereignOwnerEmail,
} from '../intelligence/router.js';
import {
  planSwarmExecution,
  executeSwarmPipeline,
  swarmPlanToGroqRoutingDecision,
  planUsesLocalOllama,
} from '../intelligence/swarmOrchestrator.js';
import { runMaximumClarityTrack } from '../intelligence/maximumClarityPipeline.js';
import {
  curateContext,
  formatCuratedContextWithEpistemic,
} from '../intelligence/contextCuratorService.js';
import { recallRawRows } from '../intelligence/memoryService.js';
import { applyOverseerLens, type OverseerResult } from './overseerService.js';
import {
  validateSessionMembrane,
  writeSessionMembrane,
  shortHash,
  contextFingerprint,
  degradedStateHash as computeDegradedStateHash,
} from './sessionMembraneService.js';
import {
  createCheckpoint,
  advanceCheckpoint,
  persistProfileSnapshot,
  persistCuratedContextHash,
  deleteCheckpoint,
} from './requestCheckpointService.js';
import {
  resolveCapability,
  describeCapabilityResolution,
  type CapabilityEnvSnapshot,
} from './capabilityRouter.js';
import {
  sliceContextForLane,
  describeSlice,
} from './contextSlicePlanner.js';
import { cartographAsymmetries } from './asymmetryCartographerService.js';
import { enqueueGpuTask } from '../inference/queueManager.js';
import { getRegistryEntry, mapModelRegistryIdToSwarm } from '../intelligence/llmRegistry.js';
import type { MirrorforgeState } from '../intelligence/telemetryTranslator.js';
import type { SubscriptionTier } from '../intelligence/groundwork/v4/subscriptionSchema.js';

// ── Re-export legacy dispatch API ─────────────────────────────────────────────
// Used by cognitiveGovernanceRoutes.ts for non-inference command routing.
// NOT on the hot inference path.

export interface CognitiveCommand {
  kind: CognitiveCommandKind;
  userId: string;
  rawText: string;
  payload?: Record<string, unknown>;
  recommendationDraft?: string;
}

export interface OrchestratorDispatchResult {
  kind: CognitiveCommandKind;
  writeSubsystems: string[];
  readSubsystems: string[];
  alignment?: ReturnType<typeof evaluateConstitutionalAlignment>;
}

const WRITERS: Record<CognitiveCommandKind, string[]> = {
  freeform_query: [],
  constitution_amend: ['constitutional_core'],
  claim_register: ['truth_evidence_ledger'],
  evidence_attach: ['truth_evidence_ledger'],
  decision_open: ['decision_ledger'],
  decision_review: ['decision_ledger'],
  contradiction_register: ['truth_evidence_ledger'],
  legacy_extract: ['legacy_layer'],
  evolution_record: ['evolution_timeline'],
  twin_trait_set: ['cognitive_twin'],
  truth_chamber: ['adversarial_truth_chamber'],
  open_loop_register: ['unfinished_business'],
  simulation_forge: ['simulation_forge'],
  reality_graph_mutate: ['atlas_reality_graph'],
  identity_bridge: ['identity_action_bridge'],
  self_revision_record: ['recursive_self_revision'],
};

const READERS: Record<CognitiveCommandKind, string[]> = {
  freeform_query: [
    'constitutional_core', 'truth_evidence_ledger', 'decision_ledger',
    'evolution_timeline', 'cognitive_twin', 'unfinished_business',
    'adversarial_truth_chamber', 'reality_graph', 'simulation_forge',
    'atlas_reality_graph', 'identity_action_bridge', 'recursive_self_revision',
    'legacy_layer',
  ],
  constitution_amend: ['constitutional_core'],
  claim_register: ['truth_evidence_ledger', 'constitutional_core'],
  evidence_attach: ['truth_evidence_ledger'],
  decision_open: ['decision_ledger', 'constitutional_core', 'truth_evidence_ledger'],
  decision_review: ['decision_ledger', 'truth_evidence_ledger'],
  contradiction_register: ['truth_evidence_ledger'],
  legacy_extract: ['decision_ledger', 'truth_evidence_ledger', 'legacy_layer', 'evolution_timeline', 'constitutional_core'],
  evolution_record: ['evolution_timeline', 'decision_ledger', 'constitutional_core'],
  twin_trait_set: ['cognitive_twin', 'truth_evidence_ledger'],
  truth_chamber: ['adversarial_truth_chamber', 'constitutional_core', 'truth_evidence_ledger', 'cognitive_twin', 'decision_ledger'],
  open_loop_register: ['unfinished_business', 'constitutional_core', 'decision_ledger', 'evolution_timeline'],
  simulation_forge: ['simulation_forge', 'constitutional_core', 'truth_evidence_ledger', 'decision_ledger', 'cognitive_twin', 'atlas_reality_graph'],
  reality_graph_mutate: ['atlas_reality_graph', 'decision_ledger', 'unfinished_business', 'constitutional_core'],
  identity_bridge: ['identity_action_bridge', 'constitutional_core', 'evolution_timeline', 'unfinished_business'],
  self_revision_record: ['recursive_self_revision', 'cognitive_twin', 'evolution_timeline', 'unfinished_business'],
};

export function dispatchCognitiveCommand(cmd: CognitiveCommand): OrchestratorDispatchResult {
  cognitiveCommandKindSchema.parse(cmd.kind);
  const writeSubsystems = WRITERS[cmd.kind];
  const readSubsystems = READERS[cmd.kind];
  let alignment: ReturnType<typeof evaluateConstitutionalAlignment> | undefined;
  if (cmd.kind === 'freeform_query' && cmd.recommendationDraft?.trim()) {
    alignment = evaluateConstitutionalAlignment({
      userId: cmd.userId,
      recommendationText: cmd.recommendationDraft,
    });
  }
  return { kind: cmd.kind, writeSubsystems, readSubsystems, alignment };
}

// ── Conductor public types ────────────────────────────────────────────────────

export interface ConductorInput {
  /** Verified database user ID (from atlasAuthUser — never from body). */
  userId: string;
  /** Verified OAuth email (from requestAuth). Null → public_swarm path. */
  verifiedEmail: string | null | undefined;
  /** Resolved Stripe subscription tier. */
  stripeTier: SubscriptionTier | undefined;
  /** GPU request correlation ID — echoed on SSE done. */
  requestId: string;
  /** Conversation messages including any client-supplied system turns. */
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  /** Client routing hints — server always re-derives; these are preferences only. */
  posture?: number;
  lineOfInquiry?: string;
  sovereignResponseMode?: string;
  /** Execution mode flags from request body. */
  maximumClarity?: boolean;
  consensusMode?: boolean;
  /** Mirrorforge Resonance Chamber state snapshot. */
  mirrorforge?: Partial<MirrorforgeState>;
  /** User's resolved preferred model ID (swarm registry format). */
  preferredSwarmModel: string | null;
  /** Active chamber at request time. */
  chamber?: AtlasChamber;
  /** Request abort signal. */
  signal?: AbortSignal;
  /** SSE stream emitters — conductor drives all stream events. */
  onDelta: (text: string) => void;
  onSseEvent: (event: string, data: unknown) => void;
}

/**
 * Per-request orchestration trace — emitted on the `trace` SSE event
 * and returned in ConductorResult for operator observability.
 * Never user-facing; intended for telemetry, debugging, and Phase C tuning.
 */
export interface ConductorTrace {
  traceId: string;
  requestId: string;
  /** Whether Upstash Redis is configured for this request. */
  redisAvailable: boolean;
  /** Whether the membrane cache was hit, missed, or not attempted. */
  membranePath: 'hit' | 'miss' | 'skipped';
  /** Reason string for membrane outcome (e.g. 'cache_hit', 'cache_miss', 'chamber_switch', 'redis_unavailable'). */
  membraneInvalidationReason: string;
  /** Doctrine version hash at request time. */
  doctrineVersionHash: string;
  /** Sensitivity class resolved for this request. */
  sensitivityClass: string;
  /** PolicyProfile.updatedAt at request time. */
  policyProfileVersion: string;
  /** Hash of degraded flags at request time (groq/ollama/memory). */
  degradedStateHash: string;
  /** Highest conductor stage index reached. */
  highestStageReached: number;
  /** Per-stage wall-clock durations in milliseconds. */
  stageDurationsMs: Partial<Record<string, number>>;
  /** Phase C: capability resolution result (synthesis class after downgrade check). */
  capabilityResolution?: {
    requested: string;
    resolved: string;
    downgraded: boolean;
    reason: string;
  };
  /** Phase C: context slice result (token budget applied at Stage 4.5). */
  contextSlice?: {
    sliced: boolean;
    budgetTokens: number;
    estimatedTokens: number;
  };
}

export interface ConductorResult {
  traceId: string;
  requestId: string;
  profile: RequestProfile;
  fullText: string;
  surface: string;
  model: string;
  overseerResult: OverseerResult | null;
  partial: boolean;
  /** Orchestration trace for operator observability. Always present. */
  orchestrationTrace: ConductorTrace;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function lastUserContent(messages: Array<{ role: string; content: string }>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user') return messages[i]!.content;
  }
  return '';
}

function resolveSwarmModel(preferredModel: string | null): string | null {
  if (!preferredModel) return null;
  const swarmId = mapModelRegistryIdToSwarm(preferredModel);
  if (!swarmId) return null;
  return getRegistryEntry(swarmId) ? swarmId : null;
}

const OVERSEER_TIMEOUT_MS = 5_000;

// ── 8-stage conductor ─────────────────────────────────────────────────────────

/**
 * conductRequest — sovereign request pipeline.
 *
 * Invariants:
 * - Routing (Stage 1/2) always precedes context assembly (Stage 4).
 * - contextCuratorService is called exactly once, at Stage 4.
 * - Both execution paths (local + swarm) receive the same curated block.
 * - Overseer fires post-stream only, never blocks delivery.
 * - Stage errors degrade gracefully — caller receives partial=true on recovery.
 */
export async function conductRequest(input: ConductorInput): Promise<ConductorResult> {
  const traceId = randomUUID();
  const { onSseEvent, onDelta } = input;
  let fullText = '';
  const streamingOnDelta = (t: string) => { fullText += t; onDelta(t); };
  const stageStart = () => Date.now();
  // Trace accumulator — emitted as SSE `trace` event at Stage 8.
  const stageDurationsMs: Partial<Record<string, number>> = {};
  let highestStageReached = 0;
  const markStage = (stage: number, durationMs: number) => {
    stageDurationsMs[`stage${stage}`] = durationMs;
    if (stage > highestStageReached) highestStageReached = stage;
  };

  // ── Stage 0: Degraded state snapshot ─────────────────────────────────────────
  const s0 = stageStart();
  const degraded = {
    groqUnavailable: !env.groqApiKey?.trim() && !env.cloudOpenAiApiKey?.trim(),
    localOllamaDisabled: env.disableLocalOllama ?? false,
    memoryLayerEnabled: env.memoryLayerEnabled ?? false,
  };
  // Stable discriminators computed once — used for membrane key, trace, and invalidation.
  const redisAvailable = !!(env.upstashRedisUrl && env.upstashRedisToken);
  const doctrineVersionHash = '016'; // mirrors getCurrentDoctrineVersionHash()
  const currentDegradedHash = computeDegradedStateHash(degraded);
  // Checkpoint created at admission — fire-and-forget; conductor proceeds regardless.
  void createCheckpoint(input.userId, input.requestId).catch(() => {});
  void advanceCheckpoint(input.userId, input.requestId, 0, {
    summary: `degraded_snapshot redis:${redisAvailable}`,
    durationMs: Date.now() - s0,
    completedAt: new Date().toISOString(),
  }).catch(() => {});
  markStage(0, Date.now() - s0);

  // ── Stage 1: Compute lane resolution ─────────────────────────────────────────
  const s1 = stageStart();
  const lane = degraded.localOllamaDisabled
    ? 'public_swarm' as const
    : resolveOmniComputeLane(input.verifiedEmail);

  const isSovOwner = isSovereignOwnerEmail(input.verifiedEmail);
  void advanceCheckpoint(input.userId, input.requestId, 1, {
    summary: `lane:${lane}`,
    durationMs: Date.now() - s1,
    completedAt: new Date().toISOString(),
  }).catch(() => {});

  // ── Stage 2: Mode + posture resolution ─────────────────────────────────────────
  const s2 = stageStart();
  const userPrompt = lastUserContent(input.messages);

  const routing: OmniRoutingResolution = resolveOmniRouting(userPrompt, {
    posture: input.posture,
    sovereignResponseMode: input.sovereignResponseMode,
  });
  void advanceCheckpoint(input.userId, input.requestId, 2, {
    summary: `mode:${routing.mode} posture:${routing.posture}`,
    durationMs: Date.now() - s2,
    completedAt: new Date().toISOString(),
  }).catch(() => {});

  // ── Stage 3: Request preparation + Membrane validation ───────────────────────
  const s3 = stageStart();
  const chamber: AtlasChamber = input.chamber ?? 'unknown';

  // Phase C — capabilityRouter: validate that the desired synthesis class is
  // executable given current credentials and degraded state before profile freeze.
  const desiredSynthesisClass = resolveSynthesisClass({
    isSovereignOwner: isSovOwner,
    localAvailable: lane === 'sovereign_local',
    maximumClarity: input.maximumClarity ?? false,
    consensusMode: input.consensusMode ?? false,
    gravity: routing.posture,
  });
  const capabilityEnv: CapabilityEnvSnapshot = {
    groqApiKey: env.groqApiKey,
    cloudOpenAiApiKey: env.cloudOpenAiApiKey,
    geminiApiKey: env.geminiApiKey,
    tavilyApiKey: env.tavilyApiKey,
    disableLocalOllama: env.disableLocalOllama,
  };
  const capabilityResolution = resolveCapability(desiredSynthesisClass, degraded, capabilityEnv);
  if (capabilityResolution.downgraded) {
    console.warn(
      '[cognitiveOrchestrator] Stage 3 capability downgrade:',
      describeCapabilityResolution(capabilityResolution),
    );
  }

  const profile: RequestProfile = Object.freeze({
    userId: input.userId,
    verifiedEmail: input.verifiedEmail ?? null,
    isSovereignOwner: isSovOwner,
    intent: routing.mode,
    gravity: routing.posture,
    chamber,
    requiredDoctrineBundle: resolveDoctrineBundles(routing.mode, routing.posture),
    allowedNamespaces: ['global', ...(chamber !== 'unknown' ? [chamber] : [])],
    swarmEligible: lane === 'public_swarm',
    membraneEligible: degraded.memoryLayerEnabled,
    sensitivityClass: resolveSensitivityClass(isSovOwner, routing.mode, routing.posture),
    preferredSynthesisClass: capabilityResolution.resolvedClass,
    traceId,
    resolvedAt: new Date().toISOString(),
  } satisfies RequestProfile);

  // Persist immutable profile snapshot (fire-and-forget — non-blocking).
  void persistProfileSnapshot(input.userId, input.requestId, profile).catch(() => {});

  const messagesWithRouting = injectAtlasRoutingIntoMessages(input.messages, routing);

  let policyProfile: PolicyProfile;
  try {
    policyProfile = getPolicyProfile(input.userId);
  } catch {
    // Non-fatal — use structural defaults so swarm planning always has a valid profile
    const { DEFAULT_POLICY_PROFILE_VALUES } = await import('../evolution/policyStore.js');
    policyProfile = {
      ...DEFAULT_POLICY_PROFILE_VALUES,
      userId: input.userId,
      updatedAt: new Date().toISOString(),
    };
  }

  onSseEvent('routing', {
    mode: routing.mode,
    posture: routing.posture,
    lineOfInquiry: input.lineOfInquiry ?? null,
    synthesisClass: profile.preferredSynthesisClass,
    chamber,
  });

  // Membrane key components (derived after profile is frozen at Stage 3).
  const sessionId = input.requestId; // requestId is the SSE correlation ID = session turn key
  const intentHash = shortHash(routing.mode + routing.posture.toString());
  // policyProfileVersion: immutable after policyProfile is resolved above.
  const policyProfileVersion = policyProfile.updatedAt;
  let membranePath: 'hit' | 'miss' | 'skipped' = 'skipped';
  let membraneInvalidationReason = 'memory_layer_disabled';

  void advanceCheckpoint(input.userId, input.requestId, 3, {
    summary: `chamber:${chamber} intentHash:${intentHash}`,
    durationMs: Date.now() - s3,
    completedAt: new Date().toISOString(),
  }).catch(() => {});

  // ── Stage 4: Context assembly (membrane-gated) ──────────────────────────────
  // ROUTING PRECEDES CONTEXT. This is the law.
  // contextCuratorService is the single governed context transform.
  // Both local and swarm execution paths consume curatedContextBlock.
  const s4 = stageStart();
  let curatedContextBlock = '';
  if (degraded.memoryLayerEnabled && profile.sensitivityClass !== 'low') {
    // Membrane check: performed after profile is frozen.
    // Hit → skip full Stage 4; miss → assemble then write membrane.
    const membraneResult = await validateSessionMembrane({
      userId: input.userId,
      sessionId,
      chamber,
      intentHash,
      currentSensitivityClass: profile.sensitivityClass,
      currentPolicyProfileVersion: policyProfileVersion,
      currentDegradedStateHash: currentDegradedHash,
      forceRefresh: false,
    });

    if (membraneResult.hit && membraneResult.record) {
      curatedContextBlock = membraneResult.record.curatedContextBlock;
      membranePath = 'hit';
      membraneInvalidationReason = membraneResult.invalidationReason;
      onSseEvent('membrane', { hit: true, chamber, intentHash });
    } else {
      membranePath = 'miss';
      membraneInvalidationReason = membraneResult.invalidationReason;
      try {
        const rawRows = await recallRawRows(input.userId, userPrompt, {
          memoryK: profile.gravity >= 4 ? 10 : profile.gravity >= 2 ? 6 : 4,
          chunkK: profile.gravity >= 3 ? 4 : 2,
        });

        const pkg = await curateContext({
          userId: input.userId,
          chamber: chamber !== 'unknown' ? chamber : undefined,
          topic: userPrompt.slice(0, 300),
          tokenBudget: profile.gravity <= 1 ? 200 : 500,
          recalledMemories: rawRows,
        });

        curatedContextBlock = await formatCuratedContextWithEpistemic(input.userId, pkg);

        // Write membrane after assembly — fire-and-forget, non-blocking.
        void writeSessionMembrane({
          userId: input.userId,
          sessionId,
          chamber,
          intentHash,
          doctrineVersionHash,
          curatedContextBlock,
          doctrineBundleIds: [...profile.requiredDoctrineBundle],
          sensitivityClass: profile.sensitivityClass,
          policyProfileVersion,
          degradedStateHash: currentDegradedHash,
        }).catch(() => {});
      } catch (err) {
        // Non-fatal — execution proceeds without curated context
        console.warn('[cognitiveOrchestrator] Stage 4 context assembly failed:', err);
      }
    }
  }

  // Persist curated context hash after Stage 4 — fire-and-forget.
  const ctxHash = contextFingerprint(curatedContextBlock);
  void persistCuratedContextHash(input.userId, input.requestId, ctxHash).catch(() => {});
  void advanceCheckpoint(input.userId, input.requestId, 4, {
    summary: `membrane:${membranePath} ctxHash:${ctxHash}`,
    durationMs: Date.now() - s4,
    completedAt: new Date().toISOString(),
  }).catch(() => {});

  // ── Stage 5: Execution planning + Stage 6: Dispatch ──────────────────────
  // Phase C — contextSlicePlanner: trim context payload to lane-appropriate token budget.
  // Reduces prompt token spend on cost-optimised lanes (fast_cloud, consensus, deep_research).
  // Synchronous, <1 ms, non-blocking. Returns original block unchanged if already within budget.
  const sliceResult = sliceContextForLane(curatedContextBlock, profile);
  const dispatchContextBlock = sliceResult.slicedBlock;
  onSseEvent('context_slice', {
    sliced: sliceResult.sliced,
    budgetTokens: sliceResult.budgetTokens,
    estimatedTokens: sliceResult.estimatedTokens,
    description: describeSlice(sliceResult),
  });

    // Kept together because planning is synchronous with dispatch in current arch.
  const s56 = stageStart();

  let dispatchResult: { fullText: string; surface: string; model: string };

  const conversationSnippet = input.messages
    .slice(-6)
    .map((m) => `${m.role}: ${m.content.slice(0, 500)}`)
    .join('\n');

  if (profile.preferredSynthesisClass === 'fast_local') {
    // ── Sovereign local lane ──────────────────────────────────────────────
    onSseEvent('status', {
      phase: 'routing',
      message: 'Sovereign compute lane: local Ollama (God Mode)…',
    });
    onSseEvent('route', {
      strategy: 'god_mode_local',
      legacyTarget: 'local_gpu',
      rationale: 'sovereign_ollama_bypass',
      plan: null,
      mode: routing.mode,
      posture: routing.posture,
      lineOfInquiry: input.lineOfInquiry ?? null,
    });

    try {
      dispatchResult = await executeLocalOllama({
        userId: input.userId,
        messages: input.messages,
        onDelta: streamingOnDelta,
        routing,
        signal: input.signal,
        curatedContextBlock: dispatchContextBlock,
        timeoutMs: input.maximumClarity
          ? Math.max(env.omniLocalTimeoutMs, 300_000)
          : env.omniLocalTimeoutMs,
      });
    } catch (localErr) {
      const aborted = localErr instanceof Error && localErr.name === 'AbortError';
      if (!aborted) {
        console.warn('[cognitiveOrchestrator] Local Ollama failed; falling back to swarm:', localErr);
      }
      onSseEvent('status', {
        phase: 'fallback',
        message: 'Local Ollama unavailable. Falling back to cloud synthesis lane…',
      });
      dispatchResult = await _swarmDispatch({
        input, messagesWithRouting, conversationSnippet, routing,
        profile, policyProfile, curatedContextBlock: dispatchContextBlock,
        rationale: 'sovereign_local_fallback',
        onSseEvent, onDelta: streamingOnDelta,
      });
    }

  } else if (profile.preferredSynthesisClass === 'deep_research') {
    // ── Maximum Clarity lane ──────────────────────────────────────────────
    onSseEvent('status', {
      phase: 'maximum_clarity',
      message: 'Maximum Clarity: Tavily deep research → Groq + Gemini (shared context) → Gemini Judge…',
    });
    onSseEvent('route', {
      strategy: 'maximum_clarity',
      legacyTarget: 'multi_agent',
      rationale: 'maximum_clarity_track',
      plan: null,
    });
    const clarityOut = await runMaximumClarityTrack({
      userId: input.userId,
      userPrompt,
      onTerminal: (message) => onSseEvent('clarity_terminal', { message }),
      onDelta: streamingOnDelta,
      timeoutMs: 240_000,
    });
    dispatchResult = {
      fullText: clarityOut.fullText,
      surface: 'maximum_clarity',
      model: clarityOut.modelLabel,
    };

  } else if (profile.preferredSynthesisClass === 'consensus') {
    // ── Dual-model consensus lane ─────────────────────────────────────────
    onSseEvent('status', {
      phase: 'consensus',
      message: 'Consensus Mode: Groq Llama 3.3 70B + Gemini 1.5 Pro → Gemini Chief Judge…',
    });
    onSseEvent('route', {
      strategy: 'cloud_consensus',
      legacyTarget: 'multi_agent',
      rationale: 'consensus_mode_dual_cloud',
      plan: null,
    });
    dispatchResult = await executeGroqGeminiDualConsensus({
      userId: input.userId,
      clientMessages: messagesWithRouting,
      evidenceBlock: dispatchContextBlock,
      onDelta: streamingOnDelta,
      onSwarmTicker: (evt) => onSseEvent('swarm_ticker', evt),
      timeoutMs: 240_000,
      userTier: input.stripeTier,
    });

  } else {
    // ── Standard swarm lane (fast_cloud) ──────────────────────────────────
    onSseEvent('status', {
      phase: 'routing',
      message: 'Atlas is routing cognitive load…',
    });
    dispatchResult = await _swarmDispatch({
      input, messagesWithRouting, conversationSnippet, routing,
      profile, policyProfile, curatedContextBlock: dispatchContextBlock,
      rationale: 'standard_swarm_route',
      onSseEvent, onDelta: streamingOnDelta,
    });
  }

  void advanceCheckpoint(input.userId, input.requestId, 5, {
    summary: `plan:dispatch_complete`,
    durationMs: Date.now() - s56,
    completedAt: new Date().toISOString(),
  }).catch(() => {});
  void advanceCheckpoint(input.userId, input.requestId, 6, {
    summary: `surface:${dispatchResult.surface} model:${dispatchResult.model}`,
    durationMs: Date.now() - s56,
    completedAt: new Date().toISOString(),
  }).catch(() => {});

  // ── Stage 7: Post-response quality + Overseer annotation ─────────────────
  // Overseer is post-hoc, never blocks delivery. 5s race timeout.
  let overseerResult: OverseerResult | null = null;
  try {
    overseerResult = await Promise.race([
      applyOverseerLens(input.userId, dispatchResult.fullText, {
        query: userPrompt,
        mode: routing.mode,
        userId: input.userId,
        conversationId: traceId,
        modelOutputs: [],
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), OVERSEER_TIMEOUT_MS)),
    ]);
  } catch (err) {
    console.error('[cognitiveOrchestrator] Stage 7 Overseer failed:', err);
  }

  void advanceCheckpoint(input.userId, input.requestId, 7, {
    summary: `overseer:${overseerResult ? 'applied' : 'skipped'}`,
    durationMs: OVERSEER_TIMEOUT_MS,
    completedAt: new Date().toISOString(),
  }).catch(() => {});
  // deleteCheckpoint marks request as cleanly completed (fire-and-forget).
  void deleteCheckpoint(input.userId, input.requestId).catch(() => {});

  // ── Stage 8: Async aftermath — caller's responsibility ────────────────────
  // triggerEvolutionAfterOmniResponse is called by omniStream.ts after conductRequest returns.

  // Phase C — asymmetryCartographerService: detect leverage asymmetries in the
  // response and persist to asymmetry_ledgers. Always fire-and-forget, never blocks.
  void cartographAsymmetries({
    userId: input.userId,
    userPrompt,
    responseText: dispatchResult.fullText,
    chamber,
    intent: routing.mode,
  }).catch(() => {});

    // Emit orchestration trace SSE event — operator/telemetry layer only.
  // Not user-facing; carries full request observability data.
  const orchestrationTrace: ConductorTrace = {
    traceId,
    requestId: input.requestId,
    redisAvailable,
    membranePath,
    membraneInvalidationReason,
    doctrineVersionHash,
    sensitivityClass: profile.sensitivityClass,
    policyProfileVersion,
    degradedStateHash: currentDegradedHash,
    highestStageReached,
    stageDurationsMs,
    capabilityResolution: {
      requested: desiredSynthesisClass,
      resolved: capabilityResolution.resolvedClass,
      downgraded: capabilityResolution.downgraded,
      reason: capabilityResolution.reason,
    },
    contextSlice: {
      sliced: sliceResult.sliced,
      budgetTokens: sliceResult.budgetTokens,
      estimatedTokens: sliceResult.estimatedTokens,
    },
  };
  onSseEvent('trace', orchestrationTrace);

  return {
    traceId,
    requestId: input.requestId,
    profile,
    fullText: dispatchResult.fullText,
    surface: dispatchResult.surface,
    model: dispatchResult.model,
    overseerResult,
    partial: false,
    orchestrationTrace,
  };
}

// ── Internal swarm dispatch helper ───────────────────────────────────────────
// Extracted to avoid duplication between standard and fallback swarm paths.

interface SwarmDispatchOpts {
  input: ConductorInput;
  messagesWithRouting: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  conversationSnippet: string;
  routing: OmniRoutingResolution;
  profile: RequestProfile;
  policyProfile: PolicyProfile;
  curatedContextBlock: string;
  rationale: string;
  onSseEvent: (event: string, data: unknown) => void;
  onDelta: (t: string) => void;
}

async function _swarmDispatch(opts: SwarmDispatchOpts): Promise<{ fullText: string; surface: string; model: string }> {
  const { input, messagesWithRouting, conversationSnippet, routing, profile, policyProfile, curatedContextBlock, onSseEvent, onDelta } = opts;
  const sovereignEligible = isSovereignOwnerEmail(input.verifiedEmail);
  const swarmHint = resolveSwarmModel(input.preferredSwarmModel);

  let plan = await planSwarmExecution({
    userPrompt: lastUserContent(input.messages),
    conversationSnippet,
    sovereignEligible,
    policyProfile,
    mirrorforge: input.mirrorforge,
    preferredModel: swarmHint ?? undefined,
    userTier: input.stripeTier ?? 'core',
  });

  if (swarmHint && (plan.strategy === 'direct' || plan.strategy === 'delegate')) {
    plan = { ...plan, model: swarmHint } as typeof plan;
  }

  const legacy = swarmPlanToGroqRoutingDecision(plan);
  onSseEvent('route', {
    strategy: plan.strategy,
    legacyTarget: legacy.target,
    rationale: opts.rationale,
    plan,
    mode: routing.mode,
    posture: routing.posture,
    lineOfInquiry: input.lineOfInquiry ?? null,
  });

  const runPipeline = () =>
    executeSwarmPipeline({
      userId: input.userId,
      plan,
      messages: messagesWithRouting,
      onDelta,
      onSwarmTicker: (evt) => onSseEvent('swarm_ticker', evt),
      timeoutMs: 180_000,
      userTier: input.stripeTier,
      curatedContextBlock,
    });

  const useGpuQueue = planUsesLocalOllama(plan) && sovereignEligible;
  return useGpuQueue
    ? enqueueGpuTask(input.userId, input.requestId, runPipeline)
    : runPipeline();
}
