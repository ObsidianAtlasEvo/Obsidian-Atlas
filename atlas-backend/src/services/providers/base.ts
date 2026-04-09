// ── Provider Base Interface ──────────────────────────────────────────────────
// Defines the common interface all model providers must implement, plus a
// factory for OpenAI-compatible APIs (the industry standard that covers
// OpenAI, Groq, Together, DeepSeek, Mistral, Perplexity, and xAI).

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  /** Full model ID including provider prefix, e.g. 'openai/gpt-4o' */
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface CompletionResult {
  content: string;
  /** Raw model name as returned by or sent to the provider */
  model: string;
  /** Provider ID string */
  provider: string;
  tokensUsed?: number;
  durationMs: number;
  finishReason?: string;
}

export interface ModelProvider {
  readonly id: string;
  readonly name: string;
  complete(
    messages: ProviderMessage[],
    options: CompletionOptions,
  ): Promise<CompletionResult>;
  /** Light health check — returns false if the provider is unreachable */
  isAvailable(): Promise<boolean>;
}

// ── OpenAI-Compatible Provider Factory ───────────────────────────────────────
// Creates a ModelProvider instance for any API that speaks the OpenAI
// /v1/chat/completions protocol.  This covers:
//   OpenAI, Groq, Together.ai, DeepSeek, Mistral, Perplexity, xAI, Cohere

interface OpenAIMessage {
  role: string;
  content: string;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
}

interface OpenAIChoice {
  message: { content: string };
  finish_reason: string;
}

interface OpenAIUsage {
  total_tokens: number;
}

interface OpenAIResponse {
  model: string;
  choices: OpenAIChoice[];
  usage?: OpenAIUsage;
}

interface OpenAIErrorBody {
  error?: { message?: string };
}

/** Strip the 'provider/' prefix from a model ID to get the raw model name. */
function rawModelName(modelId: string): string {
  const idx = modelId.indexOf('/');
  // Handle models like 'together/meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo'
  // where the actual model path starts after the first slash
  return idx >= 0 ? modelId.slice(idx + 1) : modelId;
}

export function createOpenAICompatibleProvider(
  id: string,
  name: string,
  baseUrl: string,
  apiKeyEnvVar: string,
  defaultModel: string,
): ModelProvider {
  return {
    id,
    name,

    async complete(
      messages: ProviderMessage[],
      options: CompletionOptions,
    ): Promise<CompletionResult> {
      const apiKey = process.env[apiKeyEnvVar];
      if (!apiKey) {
        throw new Error(
          `${name} API key not configured. Set the ${apiKeyEnvVar} environment variable.`,
        );
      }

      const modelName = rawModelName(options.model) || rawModelName(defaultModel);
      const startedAt = Date.now();
      const timeoutMs = options.timeoutMs ?? 30_000;

      const body: OpenAIRequest = {
        model: modelName,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        const durationMs = Date.now() - startedAt;

        if (!response.ok) {
          const errText = await response.text();
          let errMsg = `${name} API error ${response.status}`;
          try {
            const errBody = JSON.parse(errText) as OpenAIErrorBody;
            if (errBody.error?.message) errMsg += `: ${errBody.error.message}`;
          } catch {
            errMsg += `: ${errText.slice(0, 200)}`;
          }
          throw new Error(errMsg);
        }

        const data = (await response.json()) as OpenAIResponse;
        const choice = data.choices[0];

        if (!choice) {
          throw new Error(`${name} returned no choices`);
        }

        return {
          content: choice.message.content,
          model: data.model || modelName,
          provider: id,
          tokensUsed: data.usage?.total_tokens,
          durationMs,
          finishReason: choice.finish_reason,
        };
      } finally {
        clearTimeout(timer);
      }
    },

    async isAvailable(): Promise<boolean> {
      const apiKey = process.env[apiKeyEnvVar];
      return Boolean(apiKey && apiKey.length > 0);
    },
  };
}
