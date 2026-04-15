/**
 * Static LLM registry for the Swarm Orchestrator (Chief of Staff routing).
 * `apiModel` is the string passed to the provider; `backend` selects transport in {@link universalAdapter}.
 */

export type LlmCostTier = 'free' | 'premium';

export type LlmInferenceBackend = 'groq' | 'gemini_sdk' | 'ollama' | 'openrouter';

export interface LlmRegistryEntry {
  /** Canonical id — Groq must emit one of these (aliases normalized server-side). */
  id: string;
  specialty: string;
  context: string;
  tier: LlmCostTier;
  backend: LlmInferenceBackend;
  /** Provider-specific model identifier (Groq model name, Gemini id, OpenRouter slug, Ollama tag). */
  apiModel: string;
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
    id: 'claude-3-5-sonnet',
    specialty: 'Elite coding, nuanced writing, complex logic',
    context: '200k',
    tier: 'premium',
    backend: 'openrouter',
    apiModel: 'anthropic/claude-3.5-sonnet',
  },
  {
    id: 'gpt-4o',
    specialty: 'Structured data generation, general reasoning, vision',
    context: '128k',
    tier: 'premium',
    backend: 'openrouter',
    apiModel: 'openai/gpt-4o',
  },
  {
    id: 'local-ollama',
    specialty: 'Sovereign on-prem GPU, full privacy, custom weights',
    context: 'model-dependent',
    tier: 'free',
    backend: 'ollama',
    apiModel: 'local',
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
  claude: 'claude-3-5-sonnet',
  'claude-3-5-sonnet': 'claude-3-5-sonnet',
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
