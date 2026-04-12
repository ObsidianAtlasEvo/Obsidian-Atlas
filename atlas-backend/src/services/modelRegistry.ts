// ── Model Registry ──────────────────────────────────────────────────────────
// Central catalog of all supported AI providers and models.
// Each model definition carries enough metadata for the orchestrator to make
// intelligent routing decisions and for the UI to present accurate information.

export type ProviderID =
  | 'ollama'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'mistral'
  | 'deepseek'
  | 'groq'
  | 'together'
  | 'cohere'
  | 'perplexity'
  | 'xai';

export type Tier = 'free' | 'paid';

export interface ModelDefinition {
  /** Canonical ID used for routing, e.g. 'openai/gpt-4o' */
  id: string;
  provider: ProviderID;
  /** Human-readable display name */
  name: string;
  description: string;
  /** free = no payment required; paid = API key + billing needed */
  tier: Tier;
  /** Maximum context window in tokens */
  contextWindow: number;
  /** Key capability areas for routing intelligence */
  strengths: string[];
  /** Cost in USD per 1,000 tokens (input+output blended); undefined = free */
  costPer1kTokens?: number;
  /** True if the model runs locally on the user's machine */
  isLocal: boolean;
  /** Whether this model is selected by default when user hasn't configured */
  defaultEnabled: boolean;
  requiresApiKey: boolean;
}

export interface ProviderConfig {
  id: ProviderID;
  name: string;
  baseUrl: string;
  /** Environment variable name where the API key is stored */
  apiKeyEnvVar: string;
  models: ModelDefinition[];
  /** Computed at runtime: true if the provider is reachable / has a key */
  isAvailable: boolean;
}

// ── Ollama (local, free) ─────────────────────────────────────────────────────

const OLLAMA_MODELS: ModelDefinition[] = [
  {
    id: 'ollama/llama3.1:70b',
    provider: 'ollama',
    name: 'Llama 3.1 70B',
    description: "Meta's flagship open-source model. Excellent all-rounder with strong instruction-following and reasoning.",
    tier: 'free',
    contextWindow: 128_000,
    strengths: ['reasoning', 'instruction-following', 'coding', 'analysis'],
    isLocal: true,
    defaultEnabled: true,
    requiresApiKey: false,
  },
  {
    id: 'ollama/llama3.1:8b',
    provider: 'ollama',
    name: 'Llama 3.1 8B',
    description: 'Lightweight Llama 3.1. Fast local inference with surprisingly strong performance for its size.',
    tier: 'free',
    contextWindow: 128_000,
    strengths: ['speed', 'general-purpose', 'low-resource'],
    isLocal: true,
    defaultEnabled: true,
    requiresApiKey: false,
  },
  {
    id: 'ollama/mistral-nemo',
    provider: 'ollama',
    name: 'Mistral Nemo',
    description: 'Mistral\'s compact 12B model trained with Nvidia. Excellent multilingual support and function calling.',
    tier: 'free',
    contextWindow: 128_000,
    strengths: ['multilingual', 'function-calling', 'code', 'speed'],
    isLocal: true,
    defaultEnabled: false,
    requiresApiKey: false,
  },
  {
    id: 'ollama/qwen2.5:72b',
    provider: 'ollama',
    name: 'Qwen 2.5 72B',
    description: "Alibaba's top open model. Exceptional at coding, math, and structured data tasks.",
    tier: 'free',
    contextWindow: 128_000,
    strengths: ['coding', 'math', 'structured-data', 'multilingual'],
    isLocal: true,
    defaultEnabled: false,
    requiresApiKey: false,
  },
  {
    id: 'ollama/deepseek-r1:70b',
    provider: 'ollama',
    name: 'DeepSeek R1 70B',
    description: 'Local version of DeepSeek\'s reasoning model. Shows chain-of-thought, excellent for complex problems.',
    tier: 'free',
    contextWindow: 128_000,
    strengths: ['chain-of-thought', 'math', 'reasoning', 'logic'],
    isLocal: true,
    defaultEnabled: false,
    requiresApiKey: false,
  },
  {
    id: 'ollama/gemma2:27b',
    provider: 'ollama',
    name: 'Gemma 2 27B',
    description: "Google's open Gemma 2 model. Strong at summarization, Q&A, and text comprehension.",
    tier: 'free',
    contextWindow: 8_192,
    strengths: ['summarization', 'qa', 'text-comprehension', 'safety'],
    isLocal: true,
    defaultEnabled: false,
    requiresApiKey: false,
  },
  {
    id: 'ollama/phi-3:14b',
    provider: 'ollama',
    name: 'Phi-3 14B',
    description: "Microsoft's Phi-3 medium. Punches above its weight on reasoning benchmarks for a 14B model.",
    tier: 'free',
    contextWindow: 128_000,
    strengths: ['reasoning', 'math', 'efficiency'],
    isLocal: true,
    defaultEnabled: false,
    requiresApiKey: false,
  },
  {
    id: 'ollama/codellama:34b',
    provider: 'ollama',
    name: 'Code Llama 34B',
    description: "Meta's code-specialized Llama. Deep code generation, completion, and debugging across many languages.",
    tier: 'free',
    contextWindow: 100_000,
    strengths: ['code-generation', 'code-completion', 'debugging', 'code-explanation'],
    isLocal: true,
    defaultEnabled: false,
    requiresApiKey: false,
  },
];

// ── OpenAI ───────────────────────────────────────────────────────────────────

const OPENAI_MODELS: ModelDefinition[] = [
  {
    id: 'openai/gpt-4o',
    provider: 'openai',
    name: 'GPT-4o',
    description: "OpenAI's flagship multimodal model. Exceptional reasoning, nuanced writing, and instruction adherence.",
    tier: 'paid',
    contextWindow: 128_000,
    strengths: ['reasoning', 'writing', 'analysis', 'instruction-following', 'coding'],
    costPer1kTokens: 0.005,
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
  {
    id: 'openai/gpt-4o-mini',
    provider: 'openai',
    name: 'GPT-4o Mini',
    description: 'Faster, cheaper GPT-4o variant. Strong performance for everyday tasks at a fraction of the cost.',
    tier: 'paid',
    contextWindow: 128_000,
    strengths: ['speed', 'cost-efficiency', 'general-purpose'],
    costPer1kTokens: 0.00015,
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
  {
    id: 'openai/gpt-4-turbo',
    provider: 'openai',
    name: 'GPT-4 Turbo',
    description: 'High-capability GPT-4 with a large context window. Reliable for complex, long-form tasks.',
    tier: 'paid',
    contextWindow: 128_000,
    strengths: ['long-context', 'complex-reasoning', 'reliability'],
    costPer1kTokens: 0.01,
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
  {
    id: 'openai/gpt-3.5-turbo',
    provider: 'openai',
    name: 'GPT-3.5 Turbo',
    description: 'Fast and affordable. Best for simple tasks where speed matters more than maximum capability.',
    tier: 'paid',
    contextWindow: 16_385,
    strengths: ['speed', 'cost-efficiency', 'simple-tasks'],
    costPer1kTokens: 0.001,
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
  {
    id: 'openai/o1-preview',
    provider: 'openai',
    name: 'o1 Preview',
    description: "OpenAI's reasoning model. Thinks step-by-step before answering. Best for math, science, and complex logic.",
    tier: 'paid',
    contextWindow: 128_000,
    strengths: ['chain-of-thought', 'math', 'science', 'complex-logic', 'reasoning'],
    costPer1kTokens: 0.015,
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
  {
    id: 'openai/o1-mini',
    provider: 'openai',
    name: 'o1 Mini',
    description: 'Smaller, faster reasoning model. Strong on coding and math at reduced cost vs o1 preview.',
    tier: 'paid',
    contextWindow: 128_000,
    strengths: ['reasoning', 'coding', 'math', 'speed'],
    costPer1kTokens: 0.003,
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
];

// ── Anthropic ────────────────────────────────────────────────────────────────

const ANTHROPIC_MODELS: ModelDefinition[] = [
  {
    id: 'anthropic/claude-3.5-sonnet',
    provider: 'anthropic',
    name: 'Claude 3.5 Sonnet',
    description: "Anthropic's best model. Remarkable at nuanced writing, analysis, and following complex instructions with safety.",
    tier: 'paid',
    contextWindow: 200_000,
    strengths: ['nuanced-writing', 'analysis', 'complex-instructions', 'safety', 'long-context'],
    costPer1kTokens: 0.003,
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
  {
    id: 'anthropic/claude-3-opus',
    provider: 'anthropic',
    name: 'Claude 3 Opus',
    description: "Anthropic's most powerful model for highly complex tasks. Exceptional at creative and research work.",
    tier: 'paid',
    contextWindow: 200_000,
    strengths: ['creative-writing', 'research', 'complex-analysis', 'nuance'],
    costPer1kTokens: 0.015,
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
  {
    id: 'anthropic/claude-3-haiku',
    provider: 'anthropic',
    name: 'Claude 3 Haiku',
    description: "Anthropic's fastest and most compact model. Great for high-throughput tasks where speed is priority.",
    tier: 'paid',
    contextWindow: 200_000,
    strengths: ['speed', 'cost-efficiency', 'summarization', 'classification'],
    costPer1kTokens: 0.00025,
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
];

// ── Google ────────────────────────────────────────────────────────────────────

const GOOGLE_MODELS: ModelDefinition[] = [
  {
    id: 'google/gemini-2.5-flash',
    provider: 'google',
    name: 'Gemini 2.5 Flash',
    description: "Google's most capable Gemini model. Industry-leading 2M token context, strong at multimodal and long-doc tasks.",
    tier: 'free',
    contextWindow: 2_000_000,
    strengths: ['long-context', 'multimodal', 'document-analysis', 'coding', 'reasoning'],
    costPer1kTokens: 0.00125,
    isLocal: false,
    defaultEnabled: true,
    requiresApiKey: true,
  },
  {
    id: 'google/gemini-1.5-flash',
    provider: 'google',
    name: 'Gemini 1.5 Flash',
    description: "Google's fast Gemini variant. Optimized for latency-sensitive tasks with a still-impressive 1M context.",
    tier: 'free',
    contextWindow: 1_000_000,
    strengths: ['speed', 'long-context', 'cost-efficiency', 'multimodal'],
    costPer1kTokens: 0.000075,
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
  {
    id: 'google/gemini-2.0-flash',
    provider: 'google',
    name: 'Gemini 2.0 Flash',
    description: "Google's latest generation flash model. Improved reasoning and agentic capabilities with near-realtime performance.",
    tier: 'free',
    contextWindow: 1_000_000,
    strengths: ['speed', 'agentic', 'reasoning', 'multimodal', 'realtime'],
    costPer1kTokens: 0.0001,
    isLocal: false,
    defaultEnabled: true,
    requiresApiKey: true,
  },
];

// ── Mistral ───────────────────────────────────────────────────────────────────

const MISTRAL_MODELS: ModelDefinition[] = [
  {
    id: 'mistral/mistral-large',
    provider: 'mistral',
    name: 'Mistral Large',
    description: "Mistral's top model. Competitive with GPT-4 class on reasoning and coding, strong European alternative.",
    tier: 'free',
    contextWindow: 128_000,
    strengths: ['reasoning', 'coding', 'multilingual', 'instruction-following'],
    costPer1kTokens: 0.002,
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
  {
    id: 'mistral/mistral-small',
    provider: 'mistral',
    name: 'Mistral Small',
    description: 'Cost-effective Mistral model for high-volume use. Reliable for classification, summarization, and simple Q&A.',
    tier: 'free',
    contextWindow: 32_000,
    strengths: ['cost-efficiency', 'classification', 'summarization', 'speed'],
    costPer1kTokens: 0.0002,
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
  {
    id: 'mistral/mistral-nemo',
    provider: 'mistral',
    name: 'Mistral Nemo',
    description: '12B model co-developed with NVIDIA. Excellent multilingual performance and function calling on a free tier.',
    tier: 'free',
    contextWindow: 128_000,
    strengths: ['multilingual', 'function-calling', 'cost-efficiency'],
    costPer1kTokens: 0.00015,
    isLocal: false,
    defaultEnabled: true,
    requiresApiKey: true,
  },
  {
    id: 'mistral/codestral',
    provider: 'mistral',
    name: 'Codestral',
    description: "Mistral's dedicated code model. Trained on 80+ programming languages, optimized for code generation and completion.",
    tier: 'free',
    contextWindow: 32_000,
    strengths: ['code-generation', 'code-completion', 'multi-language-code'],
    costPer1kTokens: 0.0003,
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
];

// ── DeepSeek ──────────────────────────────────────────────────────────────────

const DEEPSEEK_MODELS: ModelDefinition[] = [
  {
    id: 'deepseek/deepseek-chat',
    provider: 'deepseek',
    name: 'DeepSeek V3',
    description: 'DeepSeek\'s flagship chat model (V3). Competitive with GPT-4 at a fraction of the cost. Excellent at coding.',
    tier: 'free',
    contextWindow: 64_000,
    strengths: ['coding', 'reasoning', 'math', 'cost-efficiency'],
    costPer1kTokens: 0.00014,
    isLocal: false,
    defaultEnabled: true,
    requiresApiKey: true,
  },
  {
    id: 'deepseek/deepseek-reasoner',
    provider: 'deepseek',
    name: 'DeepSeek R1',
    description: 'DeepSeek\'s reasoning model. Uses chain-of-thought to solve complex math and logic problems with transparency.',
    tier: 'free',
    contextWindow: 64_000,
    strengths: ['chain-of-thought', 'math', 'logic', 'reasoning', 'transparency'],
    costPer1kTokens: 0.00055,
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
];

// ── Groq ──────────────────────────────────────────────────────────────────────

const GROQ_MODELS: ModelDefinition[] = [
  {
    id: 'groq/llama-3.1-70b-versatile',
    provider: 'groq',
    name: 'Llama 3.1 70B (Groq)',
    description: 'Llama 3.1 70B running on Groq\'s LPU hardware. Extremely fast inference — often 200-500 tokens/sec.',
    tier: 'free',
    contextWindow: 128_000,
    strengths: ['speed', 'reasoning', 'instruction-following', 'free-tier'],
    isLocal: false,
    defaultEnabled: true,
    requiresApiKey: true,
  },
  {
    id: 'groq/mixtral-8x7b-32768',
    provider: 'groq',
    name: 'Mixtral 8x7B (Groq)',
    description: 'Mixtral\'s sparse MoE model on Groq hardware. Fast and capable, particularly strong at multilingual tasks.',
    tier: 'free',
    contextWindow: 32_768,
    strengths: ['speed', 'multilingual', 'mixture-of-experts', 'free-tier'],
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
  {
    id: 'groq/gemma2-9b-it',
    provider: 'groq',
    name: 'Gemma 2 9B IT (Groq)',
    description: "Google's Gemma 2 9B instruction-tuned, running on Groq. Very fast for lightweight reasoning and Q&A.",
    tier: 'free',
    contextWindow: 8_192,
    strengths: ['speed', 'q-and-a', 'summarization', 'free-tier'],
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
];

// ── Together.ai ───────────────────────────────────────────────────────────────

const TOGETHER_MODELS: ModelDefinition[] = [
  {
    id: 'together/meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    provider: 'together',
    name: 'Llama 3.1 70B Turbo (Together)',
    description: 'Llama 3.1 70B optimized for throughput on Together\'s infrastructure. Free tier available.',
    tier: 'free',
    contextWindow: 128_000,
    strengths: ['reasoning', 'instruction-following', 'coding', 'free-tier'],
    costPer1kTokens: 0.00088,
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
  {
    id: 'together/mistralai/Mixtral-8x22B-Instruct-v0.1',
    provider: 'together',
    name: 'Mixtral 8x22B (Together)',
    description: 'Mixtral\'s largest MoE model. Strong multilingual, coding, and reasoning capabilities.',
    tier: 'free',
    contextWindow: 65_536,
    strengths: ['multilingual', 'coding', 'reasoning', 'mixture-of-experts'],
    costPer1kTokens: 0.0012,
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
];

// ── Cohere ────────────────────────────────────────────────────────────────────

const COHERE_MODELS: ModelDefinition[] = [
  {
    id: 'cohere/command-r-plus',
    provider: 'cohere',
    name: 'Command R+',
    description: "Cohere's most powerful model. Excels at RAG, tool use, and enterprise knowledge tasks.",
    tier: 'free',
    contextWindow: 128_000,
    strengths: ['rag', 'tool-use', 'enterprise-knowledge', 'document-qa'],
    costPer1kTokens: 0.003,
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
  {
    id: 'cohere/command-r',
    provider: 'cohere',
    name: 'Command R',
    description: "Cohere's efficient retrieval-focused model. Built for RAG pipelines with strong grounding.",
    tier: 'free',
    contextWindow: 128_000,
    strengths: ['rag', 'grounding', 'summarization', 'cost-efficiency'],
    costPer1kTokens: 0.00015,
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
];

// ── Perplexity ────────────────────────────────────────────────────────────────

const PERPLEXITY_MODELS: ModelDefinition[] = [
  {
    id: 'perplexity/llama-3.1-sonar-large-128k-online',
    provider: 'perplexity',
    name: 'Sonar Large (Online)',
    description: 'Perplexity\'s large online model. Real-time web search grounding — answers include current information.',
    tier: 'paid',
    contextWindow: 128_000,
    strengths: ['real-time-search', 'current-events', 'factual-grounding', 'citations'],
    costPer1kTokens: 0.001,
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
  {
    id: 'perplexity/llama-3.1-sonar-small-128k-online',
    provider: 'perplexity',
    name: 'Sonar Small (Online)',
    description: "Perplexity's small online model. Faster and cheaper real-time search for high-volume queries.",
    tier: 'paid',
    contextWindow: 128_000,
    strengths: ['real-time-search', 'speed', 'cost-efficiency', 'current-events'],
    costPer1kTokens: 0.0002,
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
];

// ── xAI ───────────────────────────────────────────────────────────────────────

const XAI_MODELS: ModelDefinition[] = [
  {
    id: 'xai/grok-2',
    provider: 'xai',
    name: 'Grok 2',
    description: "xAI's flagship model. Strong reasoning with real-time X (Twitter) data access and a distinctive no-filter perspective.",
    tier: 'paid',
    contextWindow: 131_072,
    strengths: ['reasoning', 'real-time-data', 'unconventional-thinking', 'analysis'],
    costPer1kTokens: 0.002,
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
  {
    id: 'xai/grok-2-mini',
    provider: 'xai',
    name: 'Grok 2 Mini',
    description: "xAI's smaller, faster Grok 2. Good balance of capability and cost for everyday tasks.",
    tier: 'paid',
    contextWindow: 131_072,
    strengths: ['speed', 'cost-efficiency', 'reasoning'],
    costPer1kTokens: 0.0002,
    isLocal: false,
    defaultEnabled: false,
    requiresApiKey: true,
  },
];

// ── Provider Configs ──────────────────────────────────────────────────────────

export const ALL_PROVIDERS: ProviderConfig[] = [
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    baseUrl: process.env['OLLAMA_URL'] ?? 'http://127.0.0.1:11434',
    apiKeyEnvVar: '',
    models: OLLAMA_MODELS,
    isAvailable: false,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    models: OPENAI_MODELS,
    isAvailable: false,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    models: ANTHROPIC_MODELS,
    isAvailable: false,
  },
  {
    id: 'google',
    name: 'Google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKeyEnvVar: 'GOOGLE_API_KEY',
    models: GOOGLE_MODELS,
    isAvailable: false,
  },
  {
    id: 'mistral',
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    apiKeyEnvVar: 'MISTRAL_API_KEY',
    models: MISTRAL_MODELS,
    isAvailable: false,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
    models: DEEPSEEK_MODELS,
    isAvailable: false,
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnvVar: 'GROQ_API_KEY',
    models: GROQ_MODELS,
    isAvailable: false,
  },
  {
    id: 'together',
    name: 'Together.ai',
    baseUrl: 'https://api.together.xyz/v1',
    apiKeyEnvVar: 'TOGETHER_API_KEY',
    models: TOGETHER_MODELS,
    isAvailable: false,
  },
  {
    id: 'cohere',
    name: 'Cohere',
    baseUrl: 'https://api.cohere.com/v1',
    apiKeyEnvVar: 'COHERE_API_KEY',
    models: COHERE_MODELS,
    isAvailable: false,
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    apiKeyEnvVar: 'PERPLEXITY_API_KEY',
    models: PERPLEXITY_MODELS,
    isAvailable: false,
  },
  {
    id: 'xai',
    name: 'xAI',
    baseUrl: 'https://api.x.ai/v1',
    apiKeyEnvVar: 'XAI_API_KEY',
    models: XAI_MODELS,
    isAvailable: false,
  },
];

// ── Derived Collections ───────────────────────────────────────────────────────

export const ALL_MODELS: ModelDefinition[] = ALL_PROVIDERS.flatMap(
  (p) => p.models,
);

// ── Query Helpers ─────────────────────────────────────────────────────────────

export function getModelById(id: string): ModelDefinition | undefined {
  return ALL_MODELS.find((m) => m.id === id);
}

export function getProviderModels(provider: ProviderID): ModelDefinition[] {
  return ALL_MODELS.filter((m) => m.provider === provider);
}

export function getFreeModels(): ModelDefinition[] {
  return ALL_MODELS.filter((m) => m.tier === 'free');
}

export function getPaidModels(): ModelDefinition[] {
  return ALL_MODELS.filter((m) => m.tier === 'paid');
}

export function getProviderById(id: ProviderID): ProviderConfig | undefined {
  return ALL_PROVIDERS.find((p) => p.id === id);
}

/** Returns the raw model name portion after the provider prefix, e.g. 'gpt-4o' */
export function getModelName(modelId: string): string {
  const slashIdx = modelId.indexOf('/');
  return slashIdx >= 0 ? modelId.slice(slashIdx + 1) : modelId;
}
