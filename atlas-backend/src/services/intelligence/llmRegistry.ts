/**
 * Static LLM registry for the Swarm Orchestrator (Chief of Staff routing).
 * `apiModel` is the string passed to the provider; `backend` selects transport in {@link universalAdapter}.
 */

import { env } from '../../config/env.js';

export type LlmCostTier = 'free' | 'premium';

export type LlmInferenceBackend =
  | 'groq'
  | 'gemini_sdk'
  | 'ollama'
  | 'openrouter'
  | 'openai_responses'   // [Phase 2] OpenAI Responses API (/v1/responses)
  | 'openai_embeddings'; // [Phase 2] OpenAI Embeddings API (/v1/embeddings)

export type LlmModelStatus = 'active' | 'DEPRECATED' | 'REMOVED' | 'BLOCKED';

export interface LlmRegistryEntry {
  /** Canonical id — Groq must emit one of these (aliases normalized server-side). */
  id: string;
  /** Provider-specific model identifier (Groq model name, Gemini id, OpenRouter slug, Ollama tag, OpenAI model). */
  apiModel: string;

  // --- Legacy fields (existing Groq/Gemini/OpenRouter/Ollama entries) ---
  specialty?: string;
  context?: string;
  tier?: LlmCostTier;
  backend?: LlmInferenceBackend;

  // --- GPT-5.4+ fields ---
  provider?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  pricingInputPerMTok?: number;
  pricingCachedPerMTok?: number | null;
  pricingOutputPerMTok?: number;
  longContextThreshold?: number;
  longContextPricingInputPerMTok?: number;
  longContextPricingOutputPerMTok?: number;
  role?: string[];
  gated?: boolean;
  status?: LlmModelStatus;
  supportsStructuredOutput?: boolean;
  knowledgeCutoff?: string;
  notes?: string;

  // --- Deprecation / removal fields ---
  primaryPath?: boolean;
  allowedUse?: string;
}

export const LLM_REGISTRY: readonly LlmRegistryEntry[] = [
  {
    id: 'groq-llama3-70b',
    specialty: 'Routing, high-speed synthesis, simple reasoning',
    context: '8k',
    tier: 'free',
    backend: 'groq',
    apiModel: 'llama-3.3-70b-versatile',
  },
  {
    id: 'gemini-2.5-flash',
    specialty: 'Massive context windows, multimodal processing, document analysis',
    context: '2M',
    tier: 'free',
    backend: 'gemini_sdk',
    apiModel: 'gemini-2.5-flash',
  },
  {
    id: 'claude-sonnet-4-6',
    specialty: 'Fast elite coding, nuanced writing, strong reasoning — paid tier',
    context: '200k',
    tier: 'premium',
    backend: 'openrouter',
    apiModel: 'anthropic/claude-sonnet-4-6',
  },
  {
    id: 'claude-opus-4-6',
    specialty: 'Frontier reasoning, elite coding, nuanced writing — Sovereign only',
    context: '200k',
    tier: 'premium',
    backend: 'openrouter',
    apiModel: 'anthropic/claude-opus-4-6',
  },
  {
    id: 'gpt-4o',
    specialty: 'Structured data generation, general reasoning, vision',
    context: '128k',
    tier: 'premium',
    backend: 'openrouter',
    apiModel: 'openai/gpt-4o',
    status: 'DEPRECATED',
    primaryPath: false,
    allowedUse: 'compatibility-fallback-only',
  },
  {
    id: 'local-ollama',
    specialty: 'Sovereign on-prem GPU, full privacy, custom weights',
    context: 'model-dependent',
    tier: 'free',
    backend: 'ollama',
    apiModel: 'local',
    status: (env.disableLocalOllama ? 'BLOCKED' : 'active') as LlmModelStatus,
  },
  {
    id: 'gemini-3.1-flash-lite-preview',
    specialty: 'Free-tier Overseer (primary). PUBLIC PREVIEW — fallback: gpt-5.4-nano',
    context: '1M',
    tier: 'free',
    backend: 'gemini_sdk',
    apiModel: 'gemini-3.1-flash-lite-preview',
  },

  // ── GPT-5.4 family ──────────────────────────────────────────────────
  {
    id: 'gpt-5.4-nano',
    provider: 'openai',
    apiModel: 'gpt-5.4-nano',
    contextWindow: 400_000,
    maxOutputTokens: 128_000,
    pricingInputPerMTok: 0.20,
    pricingCachedPerMTok: 0.02,
    pricingOutputPerMTok: 1.25,
    role: ['intake-router', 'worker', 'classifier', 'overseer-free'],
    gated: false,
    status: 'active',
    supportsStructuredOutput: true,
    knowledgeCutoff: '2025-08-31',
  },
  {
    id: 'gpt-5.4-mini',
    provider: 'openai',
    apiModel: 'gpt-5.4-mini',
    contextWindow: 400_000,
    maxOutputTokens: 128_000,
    pricingInputPerMTok: 0.75,
    pricingCachedPerMTok: 0.075,
    pricingOutputPerMTok: 4.50,
    role: ['worker', 'specialist', 'intermediate-synthesis'],
    gated: false,
    status: 'active',
    supportsStructuredOutput: true,
    knowledgeCutoff: '2025-08-31',
  },
  {
    id: 'gpt-5.4',
    provider: 'openai',
    apiModel: 'gpt-5.4',
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
    pricingInputPerMTok: 2.50,
    pricingCachedPerMTok: 0.25,
    pricingOutputPerMTok: 15.00,
    longContextThreshold: 272_000,
    longContextPricingInputPerMTok: 5.00,
    longContextPricingOutputPerMTok: 22.50,
    role: ['overseer', 'worker'],
    gated: false,
    status: 'active',
    supportsStructuredOutput: true,
    knowledgeCutoff: '2025-08-31',
  },
  {
    id: 'gpt-5.4-pro',
    provider: 'openai',
    apiModel: 'gpt-5.4-pro',
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
    pricingInputPerMTok: 30.00,
    pricingCachedPerMTok: null,
    pricingOutputPerMTok: 180.00,
    longContextThreshold: 272_000,
    longContextPricingInputPerMTok: 60.00,
    longContextPricingOutputPerMTok: 270.00,
    role: ['hard-arbitration'],
    gated: true,   // requires routeDecision.requireProAudit === true
    status: 'active',
    supportsStructuredOutput: false,  // confirmed: gpt-5.4-pro does not support structured outputs
    knowledgeCutoff: '2025-08-31',
    notes: 'No structured outputs. Slowest model — use background mode for long requests. Parse arbitration output as free-form text.',
  },

  // ── Legacy stubs (not in active routing) ─────────────────────────────
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    apiModel: 'gpt-4o-mini',
    status: 'DEPRECATED',
    primaryPath: false,
    allowedUse: 'last-resort-fallback-only',
  },
  {
    id: 'gpt-3.5-turbo',
    provider: 'openai',
    apiModel: 'gpt-3.5-turbo',
    status: 'REMOVED',
    primaryPath: false,
    allowedUse: 'none',
  },
] as const;

export const REGISTRY_IDS: string[] = LLM_REGISTRY.map((e) => e.id);

const REGISTRY_ID_SET = new Set(REGISTRY_IDS);

const REGISTRY_BY_ID = new Map(LLM_REGISTRY.map((e) => [e.id, e] as const));

export type RegistryModelId = (typeof LLM_REGISTRY)[number]['id'];

/** Default when Groq hallucinates an unknown specialist. */
export const DEFAULT_SWARM_MODEL_ID: RegistryModelId = 'groq-llama3-70b';

const ALIASES: Record<string, RegistryModelId> = {
  groq: 'groq-llama3-70b',
  'groq-llama': 'groq-llama3-70b',
  'llama3-70b': 'groq-llama3-70b',
  gemini: 'gemini-2.5-flash',
  'gemini-pro': 'gemini-2.5-flash',
  claude: 'claude-sonnet-4-6',
  'claude-sonnet-4-6':         'claude-sonnet-4-6',
  'claude-opus-4-6':           'claude-opus-4-6',
  'claude-3-5-sonnet':         'claude-sonnet-4-6',       // legacy → current sonnet
  'claude-3-7-sonnet-latest':  'claude-sonnet-4-6',       // legacy → current sonnet
  'gpt-4o': 'gpt-4o',
  gpt4o: 'gpt-4o',
  local: 'local-ollama',
  ollama: 'local-ollama',
  'local_gpu': 'local-ollama',
};

export function getRegistryEntry(id: string): LlmRegistryEntry | undefined {
  return REGISTRY_BY_ID.get(id);
}

export function isRegistryModelId(id: string): boolean {
  return REGISTRY_ID_SET.has(id);
}

/**
 * Normalize Chief-of-Staff output to a registry id; unknown → {@link DEFAULT_SWARM_MODEL_ID}.
 */
export function normalizeRegistryModelId(raw: string): RegistryModelId {
  const t = raw.trim();
  if (REGISTRY_ID_SET.has(t)) return t as RegistryModelId;
  const aliased = ALIASES[t.toLowerCase()];
  if (aliased) return aliased;
  return DEFAULT_SWARM_MODEL_ID;
}

/** Compact JSON blob embedded in the Groq system prompt. */
export function getLlmRegistryJsonForPrompt(): string {
  return JSON.stringify(
    LLM_REGISTRY.map(({ id, specialty, context, tier }) => ({ id, specialty, context, tier })),
    null,
    0
  );
}

/**
 * Maps a modelRegistry.ts canonical ID (e.g. 'openai/gpt-4o') to the
 * corresponding swarm llmRegistry ID (e.g. 'gpt-4o').
 * Returns undefined if no swarm-level entry exists for the given model.
 */
const MODEL_REGISTRY_TO_SWARM: Record<string, RegistryModelId | null> = {
  'openai/gpt-4o':             'gpt-4o',
  'openai/gpt-4o-mini':        'gpt-4o',
  'openai/gpt-4-turbo':        'gpt-4o',
  'openai/gpt-3.5-turbo':      'groq-llama3-70b',
  'openai/o1-preview':         'gpt-4o',
  'openai/o1-mini':            'gpt-4o',
  'anthropic/claude-sonnet-4-6':        'claude-sonnet-4-6',
  'anthropic/claude-opus-4-6':          'claude-opus-4-6',
  'anthropic/claude-3.5-sonnet':        'claude-sonnet-4-6',       // legacy passthrough
  'anthropic/claude-3-7-sonnet-latest': 'claude-sonnet-4-6',       // legacy passthrough
  'anthropic/claude-3-opus':            'claude-opus-4-6',         // legacy passthrough
  'anthropic/claude-3-haiku':           'claude-sonnet-4-6',       // legacy passthrough
  'google/gemini-2.5-flash':   'gemini-2.5-flash',
  'google/gemini-2.0-flash':   'gemini-2.5-flash',
  'groq/llama-3.1-70b-versatile': 'groq-llama3-70b',
  'groq/mixtral-8x7b-32768':  'groq-llama3-70b',
  'groq/gemma2-9b-it':         'groq-llama3-70b',
  'google/gemini-3.1-flash-lite-preview': 'gemini-3.1-flash-lite-preview',
  // omnirouter = "let Atlas decide" — no swarm model override
  'omnirouter':                 null,
  // GPT-5.4 family
  'openai/gpt-5.4-nano':       'gpt-5.4-nano',
  'openai/gpt-5.4-mini':       'gpt-5.4-mini',
  'openai/gpt-5.4':            'gpt-5.4',
  'openai/gpt-5.4-pro':        null,  // arbitration only, not a swarm strategy
};

export function mapModelRegistryIdToSwarm(modelRegistryId: string): RegistryModelId | null | undefined {
  if (!(modelRegistryId in MODEL_REGISTRY_TO_SWARM)) return undefined;
  return MODEL_REGISTRY_TO_SWARM[modelRegistryId];
}

/**
 * Validate that a registry entry may be dispatched in the current routing context.
 * Throws on REMOVED/BLOCKED entries and on gated entries without pro-audit authorization.
 */
export function assertEntryUsable(
  entry: LlmRegistryEntry,
  routeDecision?: { requireProAudit?: boolean }
): void {
  if (entry.status === 'REMOVED') {
    throw new Error(`Model '${entry.id}' is REMOVED and must not be used in any Atlas path.`);
  }
  if ((entry.status as string) === 'DEPRECATED' && entry.allowedUse === 'none') {
    throw new Error(`Model '${entry.id}' is REMOVED. Do not use.`);
  }
  if (entry.gated && routeDecision?.requireProAudit !== true) {
    throw new Error(
      `Model '${entry.id}' is gated and may only be dispatched when routeDecision.requireProAudit === true.`
    );
  }
}

