import { z } from 'zod';
import { env } from '../../config/env.js';
import type { PolicyProfile } from '../../types/atlas.js';
import type { GroqRoutingDecision } from './routingTypes.js';
import {
  DEFAULT_SWARM_MODEL_ID,
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
import {
  completeGeminiChat,
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

/** Coerce invalid / unknown models → default Groq registry id (fail-safe). */
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
  if (entry.backend === 'openrouter' && !premiumModelAvailable()) return false;
  return true;
}

/**
 * Downgrade unavailable specialists to {@link DEFAULT_SWARM_MODEL_ID} (server truth).
 */
export function enforcePlanRegistryAndCredentials(plan: ExecutionPlan): ExecutionPlan {
  const norm = normalizeExecutionPlan(plan);

  const fallback = (): RegistryModelId => DEFAULT_SWARM_MODEL_ID;

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
// Overseer — system prompt (registry + telemetry)
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
- Follow GROQ_ROUTING_DIRECTIVES.force_speed_path: when true, prefer "direct" with "groq-llama3-70b" unless the user prompt absolutely requires long-context (then gemini-2.5-flash) or elite code (claude-3-5-sonnet).
- When GROQ_ROUTING_DIRECTIVES.bias_heavy_models is true, prefer gemini-2.5-flash, claude-3-5-sonnet, gpt-4o, or a short swarm over a single shallow Groq pass.
- When GROQ_ROUTING_DIRECTIVES.skip_premium_for_speed is true, avoid premium-tier models unless indispensable.
- Use "swarm" when steps genuinely require different modalities (e.g. huge read → structured matrix). Keep steps ≤ 6 when possible.
- For prompts requiring unified psychological analysis, philosophical depth, personal calibration, self-concept examination, or holistic identity work: ALWAYS use "direct" or "delegate" strategy, NEVER "swarm". These prompts need a single coherent voice — splitting them into sub-tasks produces fragmented, duplicated, generic output.
- If you are unsure, {"strategy":"direct","model":"groq-llama3-70b","reason":"default safe path"}.

You will receive ROUTING_PAYLOAD_JSON with ROUTING_METADATA, UserTelemetry, MirrorforgeSignal, and GROQ_ROUTING_DIRECTIVES. Obey it.`;

function getOverseerConfig(): { base: string; apiKey: string; model: string } | null {
  // Prefer OpenAI (gpt-5.4-nano as Overseer) if configured
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
  const model = env.groqRouterModel?.trim() || env.cloudChatModel?.trim() || 'llama-3.1-8b-instant';
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
}

/**
 * Ask Overseer (OpenAI/Groq) for a validated {@link ExecutionPlan}.
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

  if (!cfg) {
    return { strategy: 'direct', model: DEFAULT_SWARM_MODEL_ID, reason: 'overseer_unconfigured' };
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
      return { strategy: 'direct', model: DEFAULT_SWARM_MODEL_ID, reason: 'chief_non_json' };
    }
    if (!res.ok) {
      return { strategy: 'direct', model: DEFAULT_SWARM_MODEL_ID, reason: `chief_http_${res.status}` };
    }

    const obj = data as Record<string, unknown>;
    const choices = obj?.choices;
    if (!Array.isArray(choices) || !choices[0]) {
      return { strategy: 'direct', model: DEFAULT_SWARM_MODEL_ID, reason: 'chief_missing_choices' };
    }
    const msg = (choices[0] as Record<string, unknown>).message as Record<string, unknown> | undefined;
    const content = typeof msg?.content === 'string' ? msg.content : '';
    const parsed = parseExecutionPlan(content);
    if (!parsed) {
      return { strategy: 'direct', model: DEFAULT_SWARM_MODEL_ID, reason: 'chief_parse_fail' };
    }

    let guarded = await enforceSovereignLocalGpu(parsed, input.sovereignEligible, input.signal);
    guarded = stripLocalForPublic(guarded);
    guarded = enforcePlanRegistryAndCredentials(guarded);

    // Feature flag override: if advanced_reasoning_mode is active, bias toward swarm.
    if (input.userId && guarded.strategy === 'direct') {
      const flags = getActiveFeatureFlags(input.userId);
      const armFlag = flags.find((f) => f.feature === 'advanced_reasoning_mode');
      if (armFlag && armFlag.confidence >= 0.7) {
        guarded = {
          strategy: 'swarm',
          steps: [
            { step: 1, model: guarded.model, task: 'Primary synthesis' },
            { step: 2, model: DEFAULT_SWARM_MODEL_ID, task: 'Critical review and gap analysis' },
          ],
          reason: `feature_flag:advanced_reasoning_mode(confidence=${armFlag.confidence.toFixed(2)})`,
        };
        guarded = enforcePlanRegistryAndCredentials(guarded);
      }
    }

    // mind_coherence override: if resonance confidence is critically low, force multi-agent review.
    if (input.userId && guarded.strategy !== 'swarm') {
      try {
        const { getDb } = await import('../../db/sqlite.js');
        const db = getDb();
        const coherenceRow = db
          .prepare(`SELECT confidence FROM resonance_state WHERE user_id = ?`)
          .get(input.userId) as { confidence: number } | undefined;
        const coherence = coherenceRow?.confidence ?? 1.0;
        if (coherence < 0.4) {
          const baseModel = guarded.strategy === 'direct' ? guarded.model : DEFAULT_SWARM_MODEL_ID;
          guarded = {
            strategy: 'swarm',
            steps: [
              { step: 1, model: baseModel, task: 'Primary synthesis' },
              { step: 2, model: DEFAULT_SWARM_MODEL_ID, task: 'Coherence stabilization — cross-check and reconcile' },
            ],
            reason: `mind_coherence_low(${coherence.toFixed(3)})`,
          };
          guarded = enforcePlanRegistryAndCredentials(guarded);
        }
      } catch {
        // resonance_state table may not exist yet — safe to skip
      }
    }

    return guarded;
  } catch {
    return { strategy: 'direct', model: DEFAULT_SWARM_MODEL_ID, reason: 'chief_exception' };
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
 * Execute plan: every LLM call uses Prime Directive in-system; swarm ends with a Groq synthesis pass so the user sees one Atlas voice.
 */
export async function executeSwarmPipeline(input: {
  userId: string;
  plan: ExecutionPlan;
  messages: ReadonlyArray<{ role: string; content: string }>;
  onDelta: (t: string) => void;
  onSwarmTicker?: SwarmTickerHandler | undefined;
  signal?: AbortSignal;
  timeoutMs?: number;
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
    return { fullText, surface: plan.strategy === 'delegate' ? 'delegate' : 'direct', model };
  }

  // ── Swarm strategy: collect step outputs silently, then stream only the synthesis ──
  const lastUserRaw = lastUserFromClient(input.messages);

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
  onSwarmTicker?.({
    phase: 'synthesize',
    message: 'Atlas synthesizing final response (Chief consolidation)…',
  });

  const synthEntry = getRegistryEntry(DEFAULT_SWARM_MODEL_ID)!;
  const synthMessages: UniversalMessage[] = [
    ...baseMessages.slice(0, 1),
    {
      role: 'user',
      content: `You are the final synthesis layer for Obsidian Atlas. You have received outputs from ${outputs.length} specialist models that each addressed part of the user's request. Your job is to merge them into exactly ONE unified response.

ABSOLUTE RULES — violations will be treated as synthesis failure:
1. The output MUST contain each numbered section or topic AT MOST ONCE. If two specialists answered the same section, keep the stronger answer and discard the weaker. NEVER output the same section header twice.
2. Unify the voice — the final output must read as one coherent document written by one author, not a collection of pastes from different sources.
3. Do not add new content. Only synthesize what the specialists produced.
4. Do not include ANY meta-commentary about the synthesis process, the specialists, or the steps.
5. If a specialist produced content that is redundant with another specialist's output, OMIT the redundant version entirely.
6. Output ONLY the final merged response — nothing else.

${modeDirective}

ORIGINAL_USER_REQUEST:
${lastUserRaw}

--- SPECIALIST_OUTPUTS ---
${combined.slice(0, 100_000)}`,
    },
  ];

  let synth = '';
  const { fullText: finalText, model: synthModel } = await streamRegistryModel({
    entry: synthEntry,
    messages: synthMessages,
    onDelta: (t) => {
      synth += t;
      onDelta(t);
    },
    signal,
    timeoutMs,
  });

  return {
    fullText: finalText || synth,
    surface: 'swarm',
    model: `swarm→${synthModel}`,
  };
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
