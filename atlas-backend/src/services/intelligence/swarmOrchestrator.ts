import { z } from 'zod';
import { env } from '../../config/env.js';
import type { PolicyProfile } from '../../types/atlas.js';
import type { GroqRoutingDecision } from './routingTypes.js';
import {
  DEFAULT_SWARM_MODEL_ID,
  FALLBACK_SWARM_MODEL_ID,
  assertEntryUsable,
  getRegistryEntry,
  getLlmRegistryJsonForPrompt,
  normalizeRegistryModelId,
  type LlmRegistryEntry,
  type RegistryModelId,
} from './llmRegistry.js';
import { buildConstitutionalVerificationBundle } from './constitutionalContext.js';
import { getActiveFeatureFlags } from '../evolution/policyStore.js';
import { buildPrimeDirective, messagesWithPrimeDirective, type DelegatorMessage } from './primeDirective.js';
import {
  inferSovereignResponseMode,
  sovereignModeDirective,
  type SovereignResponseMode,
} from './sovereigntyResponseRouter.js';
import {
  buildChiefRoutingPayload,
  type MirrorforgeState,
  userTelemetryFromPolicyProfile,
} from './telemetryTranslator.js';
import { isLocalOllamaReachable } from './router.js';
import { recallForOverseer, writeTurnAsync } from './memoryService.js';
import {
  curateContext,
  formatCuratedContextWithEpistemic,
} from './contextCuratorService.js';
import { logResponseProvenance } from './responseProvenanceService.js';
import {
  composeDirectiveState,
  formatDirectiveSummary,
} from './directiveCenterService.js';
import {
  buildHomeSurface,
  formatHomeSummary,
} from './homeSurfaceService.js';
import {
  buildTransparencyRecord,
  logTransparencyRecord,
} from './behaviorTransparencyService.js';
import { TIER_MODEL_ACCESS, type SubscriptionTier } from './groundwork/v4/subscriptionSchema.js';
import {
  completeGeminiChat,
  completeGeminiOverseerFree,
  completeGroqChat,
  streamGeminiChat,
  streamGroqChat,
  streamRegistryModel,
  type UniversalMessage,
} from './universalAdapter.js';

// ---------------------------------------------------------------------------
// Zod: ExecutionPlan (Chief of Staff output)
// ---------------------------------------------------------------------------

const swarmStepSchema = z.object({
  step: z.number().int().positive(),
  model: z.string().min(1).max(120),
  task: z.string().min(1).max(12_000),
});

const directPlanSchema = z.object({
  strategy: z.literal('direct'),
  model: z.string().min(1).max(120),
  reason: z.string().max(1200).optional(),
});

const delegatePlanSchema = z.object({
  strategy: z.literal('delegate'),
  model: z.string().min(1).max(120),
  reason: z.string().max(1200).optional(),
});

const swarmPlanSchema = z.object({
  strategy: z.literal('swarm'),
  steps: z.array(swarmStepSchema).min(1).max(8),
  reason: z.string().max(1200).optional(),
});

export const executionPlanSchema = z.discriminatedUnion('strategy', [
  directPlanSchema,
  delegatePlanSchema,
  swarmPlanSchema,
]);

export type ExecutionPlan = z.infer<typeof executionPlanSchema>;

function stripJsonFence(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  return (m ? m[1] : t).trim();
}

export function parseExecutionPlan(rawText: string): ExecutionPlan | null {
  try {
    const json: unknown = JSON.parse(stripJsonFence(rawText));
    const p = executionPlanSchema.safeParse(json);
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}

function normalizePlanModelField(model: string): RegistryModelId {
  return normalizeRegistryModelId(model);
}

/** Coerce invalid / unknown models → default registry id (fail-safe). */
export function normalizeExecutionPlan(plan: ExecutionPlan): ExecutionPlan {
  if (plan.strategy === 'swarm') {
    return {
      ...plan,
      steps: plan.steps
        .slice()
        .sort((a, b) => a.step - b.step)
        .map((s) => ({
          ...s,
          model: normalizePlanModelField(s.model),
        })),
    };
  }
  return {
    ...plan,
    model: normalizePlanModelField(plan.model),
  };
}

function premiumModelAvailable(): boolean {
  return Boolean(env.openrouterApiKey?.trim() || env.openaiApiKey?.trim());
}

function canRunRegistryEntry(entry: LlmRegistryEntry): boolean {
  if (entry.tier === 'premium' && !premiumModelAvailable()) return false;
  if (entry.backend === 'gemini_sdk' && !env.geminiApiKey?.trim()) return false;
  if (entry.backend === 'groq' && !(env.groqApiKey?.trim() || env.cloudOpenAiApiKey?.trim())) return false;
  if (entry.backend === 'openai_chat' && !env.openaiApiKey?.trim()) return false;
  if (entry.backend === 'openrouter' && !premiumModelAvailable()) return false;
  if (entry.backend === 'ollama' && env.disableLocalOllama) return false;
  return true;
}

/**
 * Downgrade unavailable specialists to {@link FALLBACK_SWARM_MODEL_ID} (server truth).
 */
export function enforcePlanRegistryAndCredentials(plan: ExecutionPlan): ExecutionPlan {
  const norm = normalizeExecutionPlan(plan);

  const fallback = (): RegistryModelId => FALLBACK_SWARM_MODEL_ID;

  if (norm.strategy === 'swarm') {
    return {
      ...norm,
      steps: norm.steps.map((s) => {
        const id = normalizeRegistryModelId(s.model);
        const entry = getRegistryEntry(id);
        if (!entry || !canRunRegistryEntry(entry)) {
          return { ...s, model: fallback() };
        }
        return { ...s, model: id };
      }),
    };
  }

  const id = normalizeRegistryModelId(norm.model);
  const entry = getRegistryEntry(id);
  if (!entry || !canRunRegistryEntry(entry)) {
    return { ...norm, model: fallback() };
  }
  return { ...norm, model: id };
}

/**
 * Fix 3: Enforce tier model access — downgrade any model the Chief of Staff assigned
 * that is not in the user's tier allowlist. Prevents cost leaks from free-tier users
 * being routed to claude-opus or gpt-5.4.
 */
export function enforceTierModelAccess(plan: ExecutionPlan, userTier?: SubscriptionTier): ExecutionPlan {
  if (!userTier) return plan; // no tier info — skip enforcement

  const tierAccess = TIER_MODEL_ACCESS[userTier];
  if (!tierAccess) return plan;

  const allowedSet = new Set(tierAccess.modelIds);
  // Also allow the swarm-level IDs that map from the canonical TIER_MODEL_ACCESS IDs.
  // TIER_MODEL_ACCESS uses bare IDs like 'groq/llama-3.3-70b-versatile' and 'gpt-5.4-nano'.
  // The swarm uses IDs like 'groq-llama3-70b'. Map the Groq one explicitly.
  if (allowedSet.has('groq/llama-3.3-70b-versatile')) {
    allowedSet.add('groq-llama3-70b');
  }
  // gemini-3.1-flash-lite-preview is the free-tier Overseer — always allow it for free tier
  if (userTier === 'free') {
    allowedSet.add('gemini-3.1-flash-lite-preview');
  }

  const freeTierDefault: RegistryModelId = FALLBACK_SWARM_MODEL_ID; // groq-llama3-70b — fast safe fallback

  if (plan.strategy === 'swarm') {
    return {
      ...plan,
      steps: plan.steps.map((s) => {
        if (allowedSet.has(s.model)) return s;
        console.warn(`[swarm] Tier enforcement: downgrading ${s.model} → ${freeTierDefault} for tier '${userTier}'`);
        return { ...s, model: freeTierDefault };
      }),
    };
  }

  if (!allowedSet.has(plan.model)) {
    console.warn(`[swarm] Tier enforcement: downgrading ${plan.model} → ${freeTierDefault} for tier '${userTier}'`);
    return { ...plan, model: freeTierDefault };
  }
  return plan;
}

export async function enforceSovereignLocalGpu(
  plan: ExecutionPlan,
  sovereignEligible: boolean,
  signal?: AbortSignal
): Promise<ExecutionPlan> {
  const swap = (): ExecutionPlan => {
    if (plan.strategy === 'swarm') {
      return {
        ...plan,
        steps: plan.steps.map((s) =>
          s.model === 'local-ollama' ? { ...s, model: DEFAULT_SWARM_MODEL_ID } : s
        ),
      };
    }
    if (plan.model === 'local-ollama') {
      return { ...plan, model: DEFAULT_SWARM_MODEL_ID };
    }
    return plan;
  };

  if (plan.strategy === 'swarm') {
    const hasLocal = plan.steps.some((s) => s.model === 'local-ollama');
    if (!hasLocal) return plan;
    if (!sovereignEligible) return swap();
    const ok = await isLocalOllamaReachable(signal);
    if (!ok) return swap();
    return plan;
  }

  if (plan.model !== 'local-ollama') return plan;
  if (!sovereignEligible) return swap();
  const ok = await isLocalOllamaReachable(signal);
  if (!ok) return swap();
  return plan;
}

// ---------------------------------------------------------------------------
// Overseer — identity-enforcement system prompt (final synthesis layer)
// ---------------------------------------------------------------------------

const OVERSEER_SYSTEM_PROMPT = `
You are Atlas — a sovereign intelligence layer operating as the final synthesis and identity-enforcement lens.

ROLE:
You receive the outputs of multiple specialist worker models, the user's evolution profile, memory context, and tool outputs. Your task is to synthesize these into a single, coherent, Atlas-identity response.

IDENTITY ENFORCEMENT:
- Apply Atlas doctrine to every response
- Enforce truth constraints — never speculate as fact
- Apply the user's evolution context and preferences
- Resolve contradictions between worker outputs using doctrine as the tiebreaker

OUTPUT:
- Produce the final user-facing response in Atlas voice
- If a policy conflict exists that cannot be resolved by synthesis, emit requireProAudit: true and describe the conflict. Do not resolve it yourself.
- Never expose raw worker outputs to the user
- Never break Atlas identity to defer to a model provider's style

WORKERS:
The inputs you receive come from specialist worker models. They are raw material, not final answers.
`.trim();

/**
 * Resolve the correct Overseer model for the user's subscription tier.
 * Free → gpt-5.4-nano; Core + Sovereign → gpt-5.4.
 */
function resolveOverseerModel(tier?: string): string {
  if (tier === 'free') return 'gpt-5.4-nano';
  return 'gpt-5.4'; // Core + Sovereign
}

/**
 * Intermediate synthesis model for swarm pipelines (between workers and Overseer).
 * Used when multi-step swarms need consolidation before the final Overseer pass.
 * Exported for use by future intermediate synthesis steps — not Groq.
 */
export const INTERMEDIATE_SYNTHESIS_MODEL = 'gpt-5.4-mini';

// ---------------------------------------------------------------------------
// Chief of Staff — routing planner (decides strategy, NOT the final synthesis)
// ---------------------------------------------------------------------------

const CHIEF_OF_STAFF_SYSTEM = `You are Atlas Overseer (OpenAI): a swarm orchestrator. You decide HOW compute is dispatched across registered specialists.

AVAILABLE_LLM_REGISTRY (JSON array — you MUST only assign work to "id" values present here):
${getLlmRegistryJsonForPrompt()}

OUTPUT RULES:
- Output exactly ONE JSON object. No markdown fences, no prose outside JSON.
- The JSON MUST match one of these shapes:

1) Single-shot (you handle via fast path or one model only):
{"strategy":"direct","model":"<registry id>","reason":"..."}

2) Delegation (one specialist owns the whole user turn):
{"strategy":"delegate","model":"<registry id>","reason":"..."}

3) Swarm (multi-step pipeline — each step names a registry id and a concrete sub-task):
{"strategy":"swarm","steps":[{"step":1,"model":"<registry id>","task":"..."},{"step":2,"model":"<registry id>","task":"..."}],"reason":"..."}

OPERATIONAL LAW:
- VIP SOVEREIGN: You may use "local-ollama" ONLY when ROUTING_PAYLOAD.ROUTING_METADATA.sovereign_eligible is true. Otherwise never emit local-ollama.
- Follow GROQ_ROUTING_DIRECTIVES.force_speed_path: when true, prefer "direct" with "groq-llama3-70b" unless the user prompt absolutely requires long-context (then gemini-2.5-flash) or elite code (claude-sonnet-4-6).
- When GROQ_ROUTING_DIRECTIVES.bias_heavy_models is true, prefer gemini-2.5-flash, claude-sonnet-4-6, gpt-5.4-mini, or a short swarm over a single shallow Groq pass.
- When GROQ_ROUTING_DIRECTIVES.skip_premium_for_speed is true, avoid premium-tier models unless indispensable.
- Use "swarm" when steps genuinely require different modalities (e.g. huge read → structured matrix). Keep steps ≤ 6 when possible.
- For prompts requiring unified psychological analysis, philosophical depth, personal calibration, self-concept examination, or holistic identity work: ALWAYS use "direct" or "delegate" strategy, NEVER "swarm". These prompts need a single coherent voice — splitting them into sub-tasks produces fragmented, duplicated, generic output.
- If you are unsure, {"strategy":"direct","model":"gemini-2.5-flash","reason":"default primary path"}.
- If the task is very simple or speed is critical, {"strategy":"direct","model":"groq-llama3-70b","reason":"fast fallback"}.

You will receive ROUTING_PAYLOAD_JSON with ROUTING_METADATA, UserTelemetry, MirrorforgeSignal, and GROQ_ROUTING_DIRECTIVES. Obey it.`;

function getOverseerConfig(): { base: string; apiKey: string; model: string } | null {
  // Prefer OpenAI (gpt-5.4-nano as routing planner) if configured
  const openaiKey = env.openaiApiKey?.trim();
  if (openaiKey) {
    const base = (env.openaiBaseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = env.openaiRouterModel?.trim() || 'gpt-5.4-nano';
    return { base, apiKey: openaiKey, model };
  }

  // Fallback: Groq (preserves backward compatibility when OpenAI key is absent)
  const groqKey = env.groqApiKey?.trim() || env.cloudOpenAiApiKey?.trim();
  if (!groqKey) return null;
  const base = (
    env.groqBaseUrl?.trim() ||
    env.cloudOpenAiBaseUrl?.trim() ||
    'https://api.groq.com/openai/v1'
  ).replace(/\/$/, '');
  const model = env.groqRouterModel?.trim() || env.cloudChatModel?.trim() || 'llama-3.3-70b-versatile';
  return { base, apiKey: groqKey, model };
}

export interface PlanSwarmExecutionInput {
  userPrompt: string;
  conversationSnippet?: string;
  sovereignEligible: boolean;
  policyProfile: PolicyProfile;
  mirrorforge?: Partial<MirrorforgeState> | undefined;
  signal?: AbortSignal;
  /** Optional: used to read active feature flags for plan overrides. */
  userId?: string;
  /** User's preferred swarm-level model ID (from llmRegistry). When set, the
   *  Overseer is instructed to route to this model for direct/delegate strategies
   *  unless technically inappropriate. */
  preferredModel?: string;
  /** Subscription tier — when 'free', the Overseer routes through Gemini
   *  (gemini-3.1-flash-lite-preview) with gpt-5.4-nano as degraded fallback. */
  userTier?: SubscriptionTier;
}

/** Apply feature-flag and coherence overrides after initial plan guarding. */
async function applyPostGuards(input: PlanSwarmExecutionInput, guarded: ExecutionPlan): Promise<ExecutionPlan> {
  let plan = guarded;

  // Feature flag override: if advanced_reasoning_mode is active, bias toward swarm.
  if (input.userId && plan.strategy === 'direct') {
    const flags = getActiveFeatureFlags(input.userId);
    const armFlag = flags.find((f) => f.feature === 'advanced_reasoning_mode');
    if (armFlag && armFlag.confidence >= 0.7) {
      plan = {
        strategy: 'swarm',
        steps: [
          { step: 1, model: plan.model, task: 'Primary synthesis' },
          { step: 2, model: FALLBACK_SWARM_MODEL_ID, task: 'Critical review and gap analysis' },
        ],
        reason: `feature_flag:advanced_reasoning_mode(confidence=${armFlag.confidence.toFixed(2)})`,
      };
      plan = enforcePlanRegistryAndCredentials(plan);
    }
  }

  // mind_coherence override: if resonance confidence is critically low, force multi-agent review.
  if (input.userId && plan.strategy !== 'swarm') {
    try {
      const { getDb } = await import('../../db/sqlite.js');
      const db = getDb();
      const coherenceRow = db
        .prepare(`SELECT confidence FROM resonance_state WHERE user_id = ?`)
        .get(input.userId) as { confidence: number } | undefined;
      const coherence = coherenceRow?.confidence ?? 1.0;
      if (coherence < 0.4) {
        const baseModel = plan.strategy === 'direct' ? plan.model : FALLBACK_SWARM_MODEL_ID;
        plan = {
          strategy: 'swarm',
          steps: [
            { step: 1, model: baseModel, task: 'Primary synthesis' },
            { step: 2, model: FALLBACK_SWARM_MODEL_ID, task: 'Coherence stabilization — cross-check and reconcile' },
          ],
          reason: `mind_coherence_low(${coherence.toFixed(3)})`,
        };
        plan = enforcePlanRegistryAndCredentials(plan);
      }
    } catch (err) {
      console.warn('[swarm] Resonance coherence check failed (safe to skip):', err); // AUDIT FIX: P1-6 log silent failure
    }
  }

  return plan;
}

/**
 * Ask Overseer for a validated {@link ExecutionPlan}.
 *
 * Free-tier: Gemini (gemini-3.1-flash-lite-preview) primary → gpt-5.4-nano fallback.
 * Core/Sovereign: OpenAI (gpt-5.4-nano or configured model) / Groq.
 */
export async function planSwarmExecution(input: PlanSwarmExecutionInput): Promise<ExecutionPlan> {
  const cfg = getOverseerConfig();
  const payload = buildChiefRoutingPayload({
    userPrompt: input.userPrompt,
    conversationSnippet: input.conversationSnippet,
    sovereignEligible: input.sovereignEligible,
    policyProfile: input.policyProfile,
    mirrorforge: input.mirrorforge,
    userTelemetryOverride: userTelemetryFromPolicyProfile(input.policyProfile),
  });

  if (!cfg && input.userTier !== 'free') {
    return { strategy: 'direct', model: FALLBACK_SWARM_MODEL_ID, reason: 'overseer_unconfigured' };
  }

  /** Swarm doctrine: non-sovereign tenants never touch on-prem models in plans. */
  const stripLocalForPublic = (plan: ExecutionPlan): ExecutionPlan => {
    if (input.sovereignEligible) return plan;
    const swapId = (): RegistryModelId => DEFAULT_SWARM_MODEL_ID;
    if (plan.strategy === 'swarm') {
      return {
        ...plan,
        steps: plan.steps.map((s) =>
          s.model === 'local-ollama' ? { ...s, model: swapId() } : s
        ),
      };
    }
    if (plan.model === 'local-ollama') return { ...plan, model: swapId() };
    return plan;
  };

  const preferredHint = input.preferredModel
    ? `\n\nUSER_PREFERRED_MODEL: "${input.preferredModel}" — route to this model for direct/delegate strategies unless technically inappropriate for the task.`
    : '';
  const userContent = `ROUTING_PAYLOAD_JSON:\n${JSON.stringify(payload)}${preferredHint}\n\nReturn ExecutionPlan JSON only.`;

  /** Parse an ExecutionPlan from raw LLM text (strips fences, validates). */
  const tryParse = (raw: string): ExecutionPlan | null => parseExecutionPlan(raw);

  // ── Free-tier path: Gemini primary → gpt-5.4-nano fallback ───────────────
  if (input.userTier === 'free' && env.geminiApiKey?.trim()) {
    let content: string | null = null;
    try {
      console.warn('[overseer] Free-tier routing via gemini-3.1-flash-lite-preview (PUBLIC PREVIEW)');
      const geminiResult = await completeGeminiOverseerFree({
        systemPrompt: CHIEF_OF_STAFF_SYSTEM,
        userContent,
        temperature: 0.08,
        timeoutMs: env.omniRouterTimeoutMs,
      });
      content = geminiResult.text;
    } catch (geminiErr) {
      console.warn('[overseer] gemini-3.1-flash-lite-preview unavailable, falling back to gpt-5.4-nano:', geminiErr);
    }

    // If Gemini failed or returned unparseable output, fall back to nano via OpenAI
    const parsed = content ? tryParse(content) : null;
    if (!parsed) {
      if (cfg) {
        // Fall through to standard OpenAI path below
        console.warn('[overseer] Gemini parse failure — degrading to gpt-5.4-nano');
      } else {
        return { strategy: 'direct', model: FALLBACK_SWARM_MODEL_ID, reason: 'gemini_overseer_failed_no_fallback' };
      }
    } else {
      // Gemini succeeded — apply guards and return
      let guarded = await enforceSovereignLocalGpu(parsed, input.sovereignEligible, input.signal);
      guarded = stripLocalForPublic(guarded);
      guarded = enforcePlanRegistryAndCredentials(guarded);
      guarded = enforceTierModelAccess(guarded, input.userTier);
      return applyPostGuards(input, guarded);
    }
  }

  // ── Core/Sovereign path (or free-tier Gemini fallback): OpenAI/Groq ──────
  if (!cfg) {
    return { strategy: 'direct', model: FALLBACK_SWARM_MODEL_ID, reason: 'overseer_unconfigured' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.omniRouterTimeoutMs);
  try {
    const res = await fetch(`${cfg.base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.08,
        max_tokens: 1024,
        stream: false,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: CHIEF_OF_STAFF_SYSTEM },
          { role: 'user', content: userContent },
        ],
      }),
      signal: input.signal ?? controller.signal,
    });

    const rawText = await res.text();
    let data: unknown;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      return { strategy: 'direct', model: FALLBACK_SWARM_MODEL_ID, reason: 'chief_non_json' };
    }
    if (!res.ok) {
      return { strategy: 'direct', model: FALLBACK_SWARM_MODEL_ID, reason: `chief_http_${res.status}` };
    }

    const obj = data as Record<string, unknown>;
    const choices = obj?.choices;
    if (!Array.isArray(choices) || !choices[0]) {
      return { strategy: 'direct', model: FALLBACK_SWARM_MODEL_ID, reason: 'chief_missing_choices' };
    }
    const msg = (choices[0] as Record<string, unknown>).message as Record<string, unknown> | undefined;
    const content = typeof msg?.content === 'string' ? msg.content : '';
    const parsed = parseExecutionPlan(content);
    if (!parsed) {
      return { strategy: 'direct', model: FALLBACK_SWARM_MODEL_ID, reason: 'chief_parse_fail' };
    }

    let guarded = await enforceSovereignLocalGpu(parsed, input.sovereignEligible, input.signal);
    guarded = stripLocalForPublic(guarded);
    guarded = enforcePlanRegistryAndCredentials(guarded);
    guarded = enforceTierModelAccess(guarded, input.userTier);

    return applyPostGuards(input, guarded);
  } catch (err) {
    console.warn('[swarm] Chief of Staff routing failed:', err); // AUDIT FIX: P1-6 log silent failure
    return { strategy: 'direct', model: FALLBACK_SWARM_MODEL_ID, reason: 'chief_exception' };
  } finally {
    clearTimeout(timeout);
  }
}

export function planUsesLocalOllama(plan: ExecutionPlan): boolean {
  if (plan.strategy === 'swarm') return plan.steps.some((s) => s.model === 'local-ollama');
  return plan.model === 'local-ollama';
}

/** Map swarm plan → legacy queue / analytics target (GPU stream, multi_agent, etc.). */
export function swarmPlanToGroqRoutingDecision(plan: ExecutionPlan): GroqRoutingDecision {
  if (plan.strategy === 'swarm') {
    return { target: 'multi_agent', rationale: plan.reason };
  }
  const id = normalizeRegistryModelId(plan.model);
  if (id === 'local-ollama') return { target: 'local_gpu', rationale: plan.reason };
  if (id === 'gemini-2.5-flash') return { target: 'gemini_pro', rationale: plan.reason };
  return { target: 'groq', rationale: plan.reason };
}

function delegatorMessagesToUniversal(msgs: DelegatorMessage[]): UniversalMessage[] {
  return msgs.map((m) => ({ role: m.role, content: m.content }));
}

function lastUserFromClient(messages: ReadonlyArray<{ role: string; content: string }>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user') return messages[i]!.content;
  }
  return '';
}

export type SwarmTickerHandler = (evt: {
  phase: 'step' | 'synthesize';
  message: string;
  step?: number;
  model?: string;
}) => void;

/**
 * Execute plan: every LLM call uses Prime Directive in-system; swarm ends with
 * a gpt-5.4 Overseer synthesis pass (tier-gated) so the user sees one Atlas voice.
 */
export async function executeSwarmPipeline(input: {
  userId: string;
  plan: ExecutionPlan;
  messages: ReadonlyArray<{ role: string; content: string }>;
  onDelta: (t: string) => void;
  onSwarmTicker?: SwarmTickerHandler | undefined;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** User subscription tier — determines Overseer model (free → gpt-5.4-nano, else gpt-5.4). */
  userTier?: string;
  /**
   * V1.0 — pre-built curated context block from the conductor’s Stage 4.
   * When present, replaces the inline contextCuratorService call so the
   * conductor owns the single context assembly point for both execution paths.
   * When absent, falls back to existing inline curation (backward compat).
   */
  curatedContextBlock?: string;
}): Promise<{ fullText: string; surface: string; model: string }> {
  const prepared = messagesWithPrimeDirective(input.userId, input.messages);
  const baseMessages = delegatorMessagesToUniversal(prepared);
  const { onDelta, onSwarmTicker, signal, timeoutMs } = input;
  const plan = input.plan;

  // For direct/delegate strategies, stream directly to the client — single model, no synthesis needed.
  if (plan.strategy === 'direct' || plan.strategy === 'delegate') {
    const entry = getRegistryEntry(plan.model);
    if (!entry) {
      throw new Error('Swarm: registry entry missing after normalization');
    }

    // Fix 2: Validate entry is usable before dispatch (not DEPRECATED/REMOVED/gated)
    try {
      assertEntryUsable(entry);
    } catch (usableErr) {
      console.error(`[swarm] assertEntryUsable failed for ${entry.id}, falling back to default:`, usableErr);
      const fallbackEntry = getRegistryEntry(DEFAULT_SWARM_MODEL_ID)!;
      onSwarmTicker?.({
        phase: 'step',
        message: `Atlas fallback: ${entry.id} unavailable, routing to ${fallbackEntry.id}…`,
        step: 1,
        model: fallbackEntry.id,
      });
      const { fullText, model } = await streamRegistryModel({
        entry: fallbackEntry,
        messages: baseMessages,
        onDelta,
        signal,
        timeoutMs,
      });
      return { fullText, surface: plan.strategy === 'delegate' ? 'delegate' : 'direct', model };
    }

    onSwarmTicker?.({
      phase: 'step',
      message:
        plan.strategy === 'delegate'
          ? `Atlas delegating: ${entry.id} is handling the request…`
          : `Atlas executing on ${entry.id}…`,
      step: 1,
      model: entry.id,
    });
    const { fullText, model } = await streamRegistryModel({
      entry,
      messages: baseMessages,
      onDelta,
      signal,
      timeoutMs,
    });
    // TODO: Wire Overseer synthesis here — currently direct/delegate paths bypass constitutional governance.
    // The Overseer's 4-step pipeline (synthesis, completeness, user lens, constitutional check) only runs
    // on multi-model swarm paths. To wire it here: collect fullText, then call applyOverseerLens() from
    // overseerService.ts post-streaming, and emit a replacement event. This requires architectural changes
    // to the streaming pipeline (the client expects a single stream, not a post-hoc replacement) and risks
    // breaking the real-time delta flow, so it is deferred to a dedicated PR.
    return { fullText, surface: plan.strategy === 'delegate' ? 'delegate' : 'direct', model };
  }

  // ── Swarm strategy: collect step outputs silently, then stream only the synthesis ──
  const lastUserRaw = lastUserFromClient(input.messages);

  // Phase 0.9: Identity-aware context curation replaces raw recall when MEMORY_LAYER_ENABLED.
  // Falls back to raw recallForOverseer (Phase 0 path) so the hot path is never blocked.
  // contextCuratorService: 4-tier curation (direct/compressed/latent/suppress), hard-capped 2000 chars.
  let memoryBlock: string;
  let _curatedMemoryIds: string[] = [];
  let _curatedDomains: string[] = [];
  let _curationDecisions: string[] = [];
  let _suppressedCount = 0;
  if (env.memoryLayerEnabled) {
    try {
      // V1.0: if conductor pre-built the curated block, use it directly.
      // This means context assembly happened at Stage 4 with full posture/chamber/topic context.
      // Otherwise fall through to the inline curation path (backward compat).
      if (input.curatedContextBlock?.trim()) {
        memoryBlock = input.curatedContextBlock;
      } else {
      // Inline curation path: use recallRawRows() to get rows for the curator.
      const recalledRows = await (async () => {
        try {
          const { recallRawRows } = await import('./memoryService.js');
          return await recallRawRows(input.userId, lastUserRaw);
        } catch {
          return [] as import('./contextCuratorService.js').CurateContextInput['recalledMemories'];
        }
      })();

      const pkg = await curateContext({
        userId: input.userId,
        tokenBudget: 500,
        recalledMemories: recalledRows,
      });
      memoryBlock = await formatCuratedContextWithEpistemic(input.userId, pkg);
      // CurationDecision.entityId is the memory/domain/gap ID; entityType distinguishes them
      _curatedMemoryIds = pkg.curationDecisions
        .filter((d) => (d.tier === 'direct' || d.tier === 'compressed') && d.entityType === 'memory')
        .map((d) => d.entityId);
      _curatedDomains = pkg.curationDecisions
        .filter((d) => d.tier !== 'suppress' && d.entityType === 'identity_domain')
        .map((d) => d.entityId);
      _suppressedCount = pkg.suppressedCount;
      _curationDecisions = pkg.curationDecisions.map((d) => `${d.tier}:${d.entityId}`);
      } // end else (inline curation path)
    } catch (err) {
      console.warn('[swarm] contextCurator failed (falling back to recallForOverseer):', err);
      memoryBlock = await recallForOverseer(input.userId, lastUserRaw);
    }
  } else {
    // Phase 0 path: raw recall
    memoryBlock = await recallForOverseer(input.userId, lastUserRaw);
  }

  // Phase 0.95 + 0.98 wiring (fire-and-forget, never throws)
  try {
    const directiveState = await composeDirectiveState(input.userId);
    const homeSurface = await buildHomeSurface(input.userId);
    const directiveSummary = formatDirectiveSummary(directiveState);
    const homeSummary = formatHomeSummary(homeSurface);
    memoryBlock = `[DIRECTIVE STATE]\n${directiveSummary}\n\n[HOME SURFACE]\n${homeSummary}\n\n${memoryBlock}`;
  } catch (err) {
    console.error('[swarmOrchestrator] directive/home surface injection error:', err);
  }
  // Fire transparency record (fire-and-forget)
  logTransparencyRecord(
    input.userId,
    buildTransparencyRecord(
      'swarm_orchestrator_response',
      'Standard orchestration pipeline',
      'prime_directive',
      'high',
    ),
  ).catch(() => {});

  // Detect sovereign response mode from user text so swarm steps and synthesis
  // receive the full mode directive (e.g. truth_pressure anti-therapy-speak rules).
  const detectedMode: SovereignResponseMode = inferSovereignResponseMode(lastUserRaw);
  const modeDirective = sovereignModeDirective(detectedMode);

  const baseSystemContent = prepared[0]!.content;
  // Inject mode directive into swarm system prompt so steps respect truth_pressure, etc.
  const systemContent = `${baseSystemContent}\n\n---\n${modeDirective}`;

  const dialog = prepared.slice(1);
  const historySnippet = dialog
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n')
    .slice(0, 12_000);

  const outputs: string[] = [];
  for (const s of plan.steps) {
    const entry = getRegistryEntry(s.model);
    if (!entry) continue;

    // Fix 2: Validate entry is usable before dispatch (not DEPRECATED/REMOVED/gated)
    try {
      assertEntryUsable(entry);
    } catch (usableErr) {
      console.warn(`[swarm] Step ${s.step}: ${entry.id} is not usable, skipping:`, usableErr);
      outputs.push(`Step ${s.step} (${entry.id}): [SKIPPED — model not usable: ${usableErr instanceof Error ? usableErr.message : String(usableErr)}]`);
      continue;
    }

    onSwarmTicker?.({
      phase: 'step',
      message: `Atlas swarm — ${entry.id}: ${s.task.slice(0, 120)}${s.task.length > 120 ? '…' : ''}`,
      step: s.step,
      model: entry.id,
    });
    const prior =
      outputs.length > 0
        ? `\n\n--- PRIOR_STEP_OUTPUTS ---\n${outputs.map((o, i) => `### Step ${i + 1}\n${o}`).join('\n\n')}`
        : '';
    const stepUser = [
      'CONVERSATION_CONTEXT (recent turns):',
      historySnippet || '(single-turn)',
      '',
      'PRIMARY_USER_REQUEST:',
      lastUserRaw,
      '',
      `--- SWARM_STEP ${s.step} — assigned specialist: ${entry.id} ---`,
      s.task,
      prior,
    ].join('\n');

    const stepMessages: UniversalMessage[] = [
      { role: 'system', content: systemContent },
      { role: 'user', content: stepUser },
    ];

    // Collect step output silently — do NOT stream intermediate steps to the client.
    // Only the final synthesis pass streams via onDelta.
    const { fullText } = await streamRegistryModel({
      entry,
      messages: stepMessages,
      onDelta: () => {},  // silent — step output collected, not streamed
      signal,
      timeoutMs,
    });
    outputs.push(`Step ${s.step} (${entry.id}):\n${fullText}`);
  }

  const combined = outputs.join('\n\n');

  // ── Overseer: gpt-5.4 (Core/Sovereign) or gpt-5.4-nano (Free) ──
  // The Overseer is the LAST step — all worker outputs must be fully collected
  // before this point. Groq must NOT be used at or after the Overseer position.
  const overseerModelId = resolveOverseerModel(input.userTier);
  const overseerEntry = getRegistryEntry(overseerModelId);

  onSwarmTicker?.({
    phase: 'synthesize',
    message: `Atlas Overseer (${overseerModelId}) synthesizing final response…`,
  });

  const overseerMessages: UniversalMessage[] = [
    { role: 'system', content: OVERSEER_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${modeDirective}${memoryBlock ? `\n\n${memoryBlock}` : ''}

ORIGINAL_USER_REQUEST:
${lastUserRaw}

CONVERSATION_CONTEXT:
${historySnippet || '(single-turn)'}

--- SPECIALIST_WORKER_OUTPUTS (${outputs.length} workers) ---
${combined.slice(0, 100_000)}

Synthesize the above into a single, coherent Atlas-identity response. Do not expose worker identities or meta-commentary about the synthesis process.`,
    },
  ];

  let synth = '';

  // Fix 1 (part 2): Wrap entire Overseer dispatch in try/catch so that if
  // streamRegistryModel throws (e.g. "Unknown backend: undefined", temporary
  // API outage), the pipeline degrades gracefully — return raw worker synthesis
  // rather than crashing the entire response.
  try {
    // Use registry-based streaming if the Overseer model has a registry entry;
    // otherwise fall back to direct OpenAI Chat Completions API.
    if (overseerEntry) {
      const { fullText: finalText, model: synthModel } = await streamRegistryModel({
        entry: overseerEntry,
        messages: overseerMessages,
        onDelta: (t) => {
          synth += t;
          onDelta(t);
        },
        signal,
        timeoutMs,
      });
      void writeTurnAsync({
        userId: input.userId,
        userMessage: lastUserRaw,
        assistantMessage: finalText || synth,
        modelId: synthModel,
      });
      // Phase 0.85: fire-and-forget response provenance audit (MUST NOT block)
      void logResponseProvenance({
        userId: input.userId,
        activeMemoryIds: _curatedMemoryIds,
        activeIdentityDomains: _curatedDomains,
        activePolicyInputs: {},
        chamberModifiers: {},
        contradictionFlags: [],
        suppressedSignals: _curationDecisions.filter((d) => d.startsWith('suppress:')),
        personalizationIntensity: 'moderate',
        arbitrationSuppressions: [],
      });
      return {
        fullText: finalText || synth,
        surface: 'swarm',
        model: `swarm→overseer:${synthModel}`,
      };
    }

    // Fallback: direct OpenAI API call for gpt-5.4 family models not yet in the registry
    const openaiKey = env.openaiApiKey?.trim();
    if (!openaiKey) {
      // Last resort: fall back to default swarm model if OpenAI is unavailable
      const fallbackEntry = getRegistryEntry(DEFAULT_SWARM_MODEL_ID)!;
      const { fullText: finalText, model: synthModel } = await streamRegistryModel({
        entry: fallbackEntry,
        messages: overseerMessages,
        onDelta: (t) => {
          synth += t;
          onDelta(t);
        },
        signal,
        timeoutMs,
      });
      void writeTurnAsync({
        userId: input.userId,
        userMessage: lastUserRaw,
        assistantMessage: finalText || synth,
        modelId: synthModel,
      });
      // Phase 0.85: fire-and-forget provenance (fallback path)
      void logResponseProvenance({
        userId: input.userId,
        activeMemoryIds: _curatedMemoryIds,
        activeIdentityDomains: _curatedDomains,
        activePolicyInputs: {},
        chamberModifiers: {},
        contradictionFlags: [],
        suppressedSignals: _curationDecisions.filter((d) => d.startsWith('suppress:')),
        personalizationIntensity: 'moderate',
        arbitrationSuppressions: [],
      });
      return {
        fullText: finalText || synth,
        surface: 'swarm',
        model: `swarm→fallback:${synthModel}`,
      };
    }

    const openaiBase = (env.openaiBaseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs ?? 120_000);
    try {
      const res = await fetch(`${openaiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: overseerModelId,
          temperature: 0.25,
          stream: true,
          messages: overseerMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: signal ?? controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Overseer API error: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;
          try {
            const chunk = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
            const text = chunk.choices?.[0]?.delta?.content;
            if (text) {
              synth += text;
              onDelta(text);
            }
          } catch { /* skip malformed chunk */ }
        }
      }
      void writeTurnAsync({
        userId: input.userId,
        userMessage: lastUserRaw,
        assistantMessage: synth,
        modelId: overseerModelId,
      });
      // Phase 0.85: fire-and-forget provenance (direct OpenAI path)
      void logResponseProvenance({
        userId: input.userId,
        activeMemoryIds: _curatedMemoryIds,
        activeIdentityDomains: _curatedDomains,
        activePolicyInputs: {},
        chamberModifiers: {},
        contradictionFlags: [],
        suppressedSignals: _curationDecisions.filter((d) => d.startsWith('suppress:')),
        personalizationIntensity: 'moderate',
        arbitrationSuppressions: [],
      });
      return {
        fullText: synth,
        surface: 'swarm',
        model: `swarm→overseer:${overseerModelId}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (overseerErr) {
    // Overseer synthesis failed — degrade gracefully by returning raw worker output
    console.error(`[swarm] Overseer synthesis failed, returning raw worker output:`, overseerErr);
    // Emit the combined worker output to the client since Overseer couldn't synthesize
    onDelta(combined);
    return {
      fullText: combined,
      surface: 'swarm',
      model: `swarm→overseer-degraded:${overseerModelId}`,
    };
  }
}

const SHARED_LANE_RULES = `Shared rules: If VERIFIED_LIVE_WEB_CONTEXT is present, cite only URLs from that block when referencing the web. If absent, reason from the conversation and state limits clearly. Output a structured hypothesis (bullets/sections OK). A parallel model lane runs independently — be thorough.`;

/**
 * Cloud Swarm — dual lane: Groq Llama 3.3 70B + Gemini 1.5 Pro in parallel on the **same** user payload
 * (including optional Tavily / research block), then **Gemini as Chief Judge** streaming the unified answer
 * (falls back to Groq judge if Gemini unavailable).
 */
export async function executeGroqGeminiDualConsensus(input: {
  userId: string;
  clientMessages: ReadonlyArray<{ role: string; content: string }>;
  /** Same formatted block passed to both lanes (e.g. {@link formatVerifiedEvidenceForPrompt}). */
  evidenceBlock: string;
  onDelta: (t: string) => void;
  onSwarmTicker?: SwarmTickerHandler | undefined;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** User subscription tier — determines Overseer model for final synthesis. */
  userTier?: string;
}): Promise<{ fullText: string; surface: string; model: string }> {
  const { userId, clientMessages, evidenceBlock, onDelta, onSwarmTicker, signal, timeoutMs } = input;
  const budget = timeoutMs ?? 180_000;
  const perLaneMs = Math.min(Math.floor(budget * 0.45), 120_000);
  const judgeTimeout = Math.max(30_000, budget - perLaneMs - 5000);

  const prepared = messagesWithPrimeDirective(userId, clientMessages);
  const dialog = prepared.slice(1);
  const historySnippet = dialog.map((m) => `${m.role}: ${m.content}`).join('\n').slice(0, 12_000);
  const lastUserRaw = lastUserFromClient(clientMessages);
  const evidenceSection = evidenceBlock.trim()
    ? `\n\nVERIFIED_LIVE_WEB_CONTEXT:\n${evidenceBlock.trim()}`
    : '';

  const laneUserContent = [
    'CONVERSATION_CONTEXT (recent turns):',
    historySnippet || '(single-turn)',
    '',
    'PRIMARY_USER_REQUEST:',
    lastUserRaw,
    evidenceSection,
  ].join('\n');

  const groqModel = env.consensusGroqAnalystModel;
  const geminiModel = env.consensusGeminiModel;

  onSwarmTicker?.({
    phase: 'step',
    message: 'Cloud Swarm: Groq Llama 3.3 70B and Gemini 1.5 Pro analyzing in parallel (shared context)…',
    step: 1,
    model: 'groq+gemini',
  });

  const groqLane: UniversalMessage[] = [
    {
      role: 'system',
      content: `${buildPrimeDirective(userId)}\n\nYou are the Groq Llama 3.3 70B speed lane.\n${SHARED_LANE_RULES}`,
    },
    { role: 'user', content: laneUserContent },
  ];

  const geminiLane: UniversalMessage[] = [
    {
      role: 'system',
      content: `${buildPrimeDirective(userId)}\n\nYou are the Gemini 2.5 Flash reasoning lane.\n${SHARED_LANE_RULES}`,
    },
    { role: 'user', content: laneUserContent },
  ];

  const [groqRes, geminiRes] = await Promise.all([
    completeGroqChat({
      model: groqModel,
      messages: groqLane,
      temperature: 0.22,
      signal,
      timeoutMs: perLaneMs,
    }).catch((e) => {
      onSwarmTicker?.({
        phase: 'step',
        message: `Groq lane degraded: ${e instanceof Error ? e.message : String(e)}`,
        step: 2,
        model: 'groq-llama3-70b',
      });
      return { text: '(Groq lane unavailable)', model: groqModel };
    }),
    completeGeminiChat({
      model: geminiModel,
      messages: geminiLane,
      temperature: 0.22,
      signal,
      timeoutMs: perLaneMs,
    }).catch((e) => {
      onSwarmTicker?.({
        phase: 'step',
        message: `Gemini lane degraded: ${e instanceof Error ? e.message : String(e)}`,
        step: 2,
        model: 'gemini-2.5-flash',
      });
      return { text: '(Gemini lane unavailable)', model: geminiModel };
    }),
  ]);

  const groqOk = Boolean(groqRes.text?.trim()) && !groqRes.text.startsWith('(');
  const gemOk = Boolean(geminiRes.text?.trim()) && !geminiRes.text.startsWith('(');
  if (!groqOk && !gemOk) {
    throw new Error('Cloud Swarm consensus: both Groq and Gemini lanes failed');
  }

  onSwarmTicker?.({
    phase: 'synthesize',
    message: 'Gemini Chief Judge: unifying dual-lane outputs into a single Atlas truth…',
  });

  const bundle = buildConstitutionalVerificationBundle(userId);
  const judgeSystem = [
    buildPrimeDirective(userId),
    '---',
    'ATLAS_CONSTITUTION_AND_DOCTRINE (do not violate; surface tension if user request conflicts):',
    bundle.atlasConstitution,
    '---',
    'USER_TRUTH_LEDGER (verified — final answer must not silently contradict):',
    bundle.truthLedger,
    '---',
    'LONGITUDINAL_CONTEXT (evolution / twin / unfinished — not chat transcript; use for continuity and calibration):',
    bundle.longitudinalContext,
    '---',
    'STRATEGIC_MODELING (simulation forge / reality graph / identity→action / self-revision — structural, not analytics chrome):',
    bundle.strategicModelingContext,
    '---',
    'LEGACY_CODEX (durable doctrine / principles — not chat):',
    bundle.legacyCodex,
    '---',
    'ADVERSARIAL_TRUTH_DIGEST (recent structured pressure):',
    bundle.adversarialDigest,
    '---',
    'CHIEF_JUDGE_INSTRUCTIONS:',
    'You are the Chief Judge for the Atlas Cloud Swarm.',
    'You receive two parallel hypotheses: (A) Groq Llama 3.3 70B — fast synthesis; (B) Gemini 1.5 Pro — parallel reasoning.',
    'Compare them; resolve contradictions using VERIFIED_LIVE_WEB_CONTEXT first when present, then constitutional doctrine, then truth ledger.',
    'Produce ONE definitive Atlas answer: Quiet Power, structural, truth-first.',
    'If web context existed, use inline [n] citations mapping to URLs in a closing SOURCES block.',
    'If web context was absent or weak, state uncertainty plainly.',
  ].join('\n');

  const judgeUser = [
    `ORIGINAL_USER_REQUEST:\n${lastUserRaw}`,
    '',
    'CONVERSATION_SNIPPET:',
    historySnippet.slice(0, 8000),
    '',
    evidenceBlock.trim()
      ? `VERIFIED_LIVE_WEB_CONTEXT:\n${evidenceBlock.trim().slice(0, 80_000)}`
      : '(no live web context for this run)',
    '',
    '--- HYPOTHESIS_GROQ_LLAMA70B ---',
    groqRes.text,
    '',
    '--- HYPOTHESIS_GEMINI_PRO ---',
    geminiRes.text,
  ].join('\n');

  const judgeMessages: UniversalMessage[] = [
    { role: 'system', content: judgeSystem },
    { role: 'user', content: judgeUser },
  ];

  if (env.geminiApiKey?.trim()) {
    const { fullText, model } = await streamGeminiChat({
      model: geminiModel,
      messages: judgeMessages,
      onDelta,
      temperature: 0.2,
      signal,
      timeoutMs: judgeTimeout,
    });
    return { fullText, surface: 'cloud_consensus', model: `swarm:judge:gemini:${model}` };
  }

  const { fullText, model } = await streamGroqChat({
    model: env.consensusGroqJudgeModel,
    messages: judgeMessages,
    onDelta,
    temperature: 0.2,
    signal,
    timeoutMs: judgeTimeout,
  });
  return { fullText, surface: 'cloud_consensus', model: `swarm:judge:groq:${model}` };
}
