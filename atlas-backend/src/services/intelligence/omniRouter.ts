// Atlas-Audit: [IX] Verified
import { env } from '../../config/env.js';
import type { PolicyProfile } from '../../types/atlas.js';
import { buildPrimedChatSystemPrompt } from './atlasIdentity.js';
import { isSovereignOwnerEmail, LocalOllamaAdapter } from './router.js';
import { assembleLayeredSystemPrompt } from '../../governance/chatPolicyAssembly.js';
import type { UserEvolutionProfile } from '../../types/evolutionTypes.js';
import { retrieveRelevantMemories } from '../memory/memoryVault.js';
import {
  inferSovereignResponseMode,
  isSovereignResponseMode,
  type SovereignResponseMode,
} from './sovereigntyResponseRouter.js';
import {
  groqRoutingDecisionSchema,
  routingTargetSchema,
  type GroqRoutingDecision,
  type RoutingTarget,
} from './routingTypes.js';
import { planSwarmExecution, swarmPlanToGroqRoutingDecision } from './swarmOrchestrator.js';

export { executeGroqGeminiDualConsensus } from './swarmOrchestrator.js';
import type { MirrorforgeState, UserTelemetry } from './telemetryTranslator.js';

export {
  truthStrictnessToDecile,
  userTelemetryFromPolicyProfile,
  userTelemetrySchema,
} from './telemetryTranslator.js';
export type { MirrorforgeState, UserTelemetry } from './telemetryTranslator.js';

export {
  groqRoutingDecisionSchema,
  routingTargetSchema,
  type GroqRoutingDecision,
  type RoutingTarget,
} from './routingTypes.js';

/** Posture scale: depth, challenge, and substrate budget for the Line of Inquiry (Section IX). */
export type AtlasPosture = 1 | 2 | 3 | 4 | 5;

export interface OmniRoutingResolution {
  mode: SovereignResponseMode;
  posture: AtlasPosture;
}

/** Appended to last user turn for swarm/consensus paths (stripped before sovereign priming on local). */
export const ATLAS_ROUTING_SENTINEL = '\n<<ATLAS_ROUTING_INTERNAL>>\n';

/**
 * Resolve sovereign response mode (line-of-inquiry class) + posture from explicit client hints or heuristics.
 */
export function resolveOmniRouting(
  userText: string,
  opts?: { sovereignResponseMode?: string; posture?: number }
): OmniRoutingResolution {
  const mode: SovereignResponseMode =
    opts?.sovereignResponseMode && isSovereignResponseMode(opts.sovereignResponseMode)
      ? opts.sovereignResponseMode
      : inferSovereignResponseMode(userText);

  let posture: AtlasPosture = inferDefaultPostureForMode(mode, userText);
  if (opts?.posture !== undefined && opts.posture >= 1 && opts.posture <= 5) {
    posture = opts.posture as AtlasPosture;
  }
  return { mode, posture };
}

function inferDefaultPostureForMode(mode: SovereignResponseMode, t: string): AtlasPosture {
  const s = t.trim();
  const short = s.length < 100;
  if (mode === 'direct_qa' && short && !/\b(why|how|prove|challenge|simulate|decide|tension|contradict)\b/i.test(s)) {
    return 1;
  }
  if (mode === 'truth_pressure' || mode === 'contradiction_analysis') return 3;
  if (mode === 'future_simulation' || mode === 'decision_support') return 4;
  if (mode === 'legacy_extraction' || mode === 'self_revision') return 5;
  if (
    mode === 'constitutional_alignment' ||
    mode === 'unfinished_surface' ||
    mode === 'identity_operationalization'
  ) {
    return 4;
  }
  return 2;
}

export function stripInternalRoutingFromUserText(text: string): string {
  const i = text.indexOf(ATLAS_ROUTING_SENTINEL);
  return i >= 0 ? text.slice(0, i).trimEnd() : text;
}

/**
 * Compact envelope for cloud swarm lanes (prime directive only): encodes posture + mode + epistemic contract.
 */
export function buildCompactRoutingEnvelope(mode: SovereignResponseMode, posture: AtlasPosture): string {
  const lines = [
    `ATLAS_LINE_OF_INQUIRY_CLASS=${mode}`,
    `ATLAS_POSTURE=${posture} (${postureLabel(posture)})`,
    postureEpistemicContract(posture, mode),
  ];
  return ATLAS_ROUTING_SENTINEL + lines.join('\n');
}

function postureLabel(p: AtlasPosture): string {
  switch (p) {
    case 1:
      return 'Concise/Direct';
    case 2:
      return 'Practical/Clarifying';
    case 3:
      return 'Socratic/Challenging';
    case 4:
      return 'Strategic/Multi-perspective';
    default:
      return 'Deep Synthesis';
  }
}

/**
 * Distinguishes fact vs inference vs interpretation; steers challenge/simulation/continuity/persistence behavior.
 */
export function postureEpistemicContract(posture: AtlasPosture, mode: SovereignResponseMode): string {
  const base =
    'EPISTEMIC: Label verified FACT only when supported by supplied constitution/truth ledger/evidence in context; otherwise mark INFERENCE or INTERPRETATION. Do not present inference as fact.';

  const spam =
    posture <= 2
      ? 'SURFACE: One coherent answer spine. No decorative subsystem labels (Senate, Drift, faux dashboards) in prose. At most one short follow-up question.'
      : posture <= 3
        ? 'SURFACE: Prefer a single narrative; use sections only if they sharpen thinking. Avoid gratuitous module names.'
        : 'SURFACE: Structured sections allowed when they aid cognition; still avoid theatrical subsystem branding.';

  const challenge =
    posture >= 3 && (mode === 'truth_pressure' || mode === 'contradiction_analysis')
      ? 'CHALLENGE: Press assumptions and missing evidence proportionally; offer falsifiers.'
      : posture >= 3
        ? 'CHALLENGE: Where stakes are high, name one or two pressure points—do not perform empty adversarial theater.'
        : 'CHALLENGE: Light touch only unless user asked for pressure.';

  const sim =
    mode === 'future_simulation' || mode === 'decision_support'
      ? posture >= 4
        ? 'SIMULATION: Use explicit pathways/consequences framing; state what is speculative.'
        : 'SIMULATION: Keep scenario depth proportional to posture; mark speculation.'
      : '';

  const continuity =
    posture >= 2
      ? 'CONTINUITY: Use supplied memory/trace substrate only as fallible continuity—not ground truth.'
      : 'CONTINUITY: Minimize reliance on chat substrate; answer the question directly.';

  const persist =
    posture >= 4
      ? 'PERSISTENCE_HINT: If the user states a durable principle, decision, or simulation worth saving, one closing sentence may name the appropriate ledger conceptually (no fake links). Otherwise omit.'
      : '';

  const direct =
    posture === 1 && mode === 'direct_qa'
      ? 'DIRECT: Answer first in few sentences; expand only on request.'
      : '';

  return [base, spam, challenge, sim, continuity, persist, direct].filter(Boolean).join(' ');
}

export function postureTemperature(posture: AtlasPosture): number {
  switch (posture) {
    case 1:
      return 0.22;
    case 2:
      return 0.3;
    case 3:
      return 0.35;
    case 4:
      return 0.38;
    default:
      return 0.42;
  }
}

function memoryVaultTopK(posture: AtlasPosture): number {
  if (posture <= 1) return 0;
  if (posture === 2) return 2;
  if (posture === 3) return 4;
  if (posture === 4) return 5;
  return 6;
}

export function injectAtlasRoutingIntoMessages<T extends { role: string; content: string }>(
  messages: readonly T[],
  routing: OmniRoutingResolution
): T[] {
  const block = buildCompactRoutingEnvelope(routing.mode, routing.posture);
  const out = messages.map((m) => ({ ...m })) as T[];
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i]!.role === 'user') {
      out[i] = { ...out[i]!, content: `${out[i]!.content}${block}` } as T;
      break;
    }
  }
  return out;
}

export interface EvaluateRouteContext {
  conversationSnippet?: string;
  sovereignEligible: boolean;
  mirrorforge?: Partial<MirrorforgeState>;
  /** When true, skip Chief-of-Staff — execution layer runs research + free-tier consensus. */
  maximumClarity?: boolean;
  signal?: AbortSignal;
}

/**
 * Chief-of-Staff swarm plan → legacy surface tag (queue, analytics, UI).
 * Non–sovereign users are always routed through {@link planSwarmExecution} (cloud registry only);
 * omni-stream public lane uses the same orchestrator plus optional {@link executeGroqGeminiDualConsensus}.
 */
export async function evaluateRoute(
  userPrompt: string,
  policyProfile: PolicyProfile,
  ctx: EvaluateRouteContext
): Promise<GroqRoutingDecision> {
  if (ctx.maximumClarity) {
    return { target: 'multi_agent', rationale: 'maximum_clarity_consensus_track' };
  }
  const plan = await planSwarmExecution({
    userPrompt,
    conversationSnippet: ctx.conversationSnippet,
    sovereignEligible: ctx.sovereignEligible,
    policyProfile,
    mirrorforge: ctx.mirrorforge,
    signal: ctx.signal,
  });
  return swarmPlanToGroqRoutingDecision(plan);
}

// ---------------------------------------------------------------------------
// Hybrid Intelligence Router — server-side identity bifurcation (email never in client bundles)
// ---------------------------------------------------------------------------

export type OmniComputeLane = 'sovereign_local' | 'public_swarm';

/**
 * Resolved from verified session / gateway email inside Node only.
 */
export function resolveOmniComputeLane(verifiedEmail: string | null | undefined): OmniComputeLane {
  return isSovereignOwnerEmail(verifiedEmail) ? 'sovereign_local' : 'public_swarm';
}

/** Unified omni-stream result shape for God Mode and public swarm. */
export type StreamingOmniResult = { fullText: string; surface: string; model: string };

/**
 * Sovereign local lane: full primed sovereign pack + posture/temperature + optional semantic vault recall.
 * Routing: `buildPrimedChatSystemPrompt` applies line-of-inquiry class; appendix tightens epistemic surface behavior.
 */
export async function executeLocalOllama(input: {
  userId: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  onDelta: (t: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
  routing?: OmniRoutingResolution;
  evolutionProfile?: UserEvolutionProfile | null;
}): Promise<StreamingOmniResult> {
  const adapter = new LocalOllamaAdapter();
  const rawLast =
    [...input.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const lastUser = stripInternalRoutingFromUserText(rawLast);
  const routing =
    input.routing ?? resolveOmniRouting(lastUser, {});

  const primedSystem = buildPrimedChatSystemPrompt(input.userId, lastUser, {
    sovereignResponseMode: routing.mode,
  });

  const appendix = [
    '=== ATLAS_POSTURE_CONTRACT (Section IX) ===',
    `POSTURE_LEVEL=${routing.posture} (${postureLabel(routing.posture)})`,
    postureEpistemicContract(routing.posture, routing.mode),
  ].join('\n');

  const k = memoryVaultTopK(routing.posture);
  let vaultBlock = '';
  if (k > 0) {
    const recalled = await retrieveRelevantMemories(input.userId, lastUser, k);
    if (recalled.length > 0) {
      vaultBlock = `\n\n[SEMANTIC_MEMORY_VAULT_RECALL — inferred embedding match; not verified fact]\n${recalled
        .map((m, i) => `(${i + 1}) [${m.type}] relevance=${m.relevance.toFixed(3)} :: ${m.content}`)
        .join('\n')}`;
    }
  }

  const basePack = `${primedSystem}\n\n${appendix}${vaultBlock}`;
  const systemContent = assembleLayeredSystemPrompt({
    userId: input.userId,
    baseSystemPrompt: basePack,
    sessionMode: routing.mode,
    evolutionProfile: input.evolutionProfile ?? null,
  });

  const turns = input.messages
    .filter(
      (m): m is { role: 'user' | 'assistant'; content: string } =>
        m.role === 'user' || m.role === 'assistant'
    )
    .map((m) => ({
      role: m.role,
      content: m.role === 'user' ? stripInternalRoutingFromUserText(m.content) : m.content,
    }));

  const out = await adapter.generateStreaming(
    {
      userId: input.userId,
      userEmail: null,
      messages: turns,
      systemPrompt: systemContent,
      temperature: postureTemperature(routing.posture),
      signal: input.signal,
      timeoutMs: input.timeoutMs ?? env.omniLocalTimeoutMs,
    },
    (chunk) => {
      if (chunk.textDelta) input.onDelta(chunk.textDelta);
    },
  );

  return { fullText: out.text, surface: 'god_mode_local', model: out.model };
}
