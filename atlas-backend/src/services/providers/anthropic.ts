// ── Anthropic Provider ────────────────────────────────────────────────────────
// Implements the ModelProvider interface using Anthropic's Messages API.
// The Anthropic API differs from OpenAI: system messages are a top-level field,
// and the versioned header 'anthropic-version' is required.

import type { ModelProvider, ProviderMessage, CompletionOptions, CompletionResult } from './base.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;

// ── Anthropic API types ───────────────────────────────────────────────────────

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string;
  temperature?: number;
}

interface AnthropicContentBlock {
  type: 'text';
  text: string;
}

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

interface AnthropicResponse {
  id: string;
  model: string;
  stop_reason: string;
  usage: AnthropicUsage;
  content: AnthropicContentBlock[];
}

interface AnthropicErrorBody {
  error?: { message?: string };
}

/** Strip the 'anthropic/' prefix from a model ID. */
function rawModelName(modelId: string): string {
  return modelId.startsWith('anthropic/') ? modelId.slice(10) : modelId;
}

export class AnthropicProvider implements ModelProvider {
  readonly id = 'anthropic';
  readonly name = 'Anthropic';

  async complete(
    messages: ProviderMessage[],
    options: CompletionOptions,
  ): Promise<CompletionResult> {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      throw new Error(
        'Anthropic API key not configured. Set the ANTHROPIC_API_KEY environment variable.',
      );
    }

    const modelName = rawModelName(options.model);
    const startedAt = Date.now();
    const timeoutMs = options.timeoutMs ?? 30_000;

    // Anthropic separates system messages from the conversation array
    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    // Anthropic requires messages to alternate user/assistant, starting with user
    const anthropicMessages: AnthropicMessage[] = conversationMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const body: AnthropicRequest = {
      model: modelName,
      max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: anthropicMessages,
      ...(systemMessage ? { system: systemMessage.content } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const durationMs = Date.now() - startedAt;

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = `Anthropic API error ${response.status}`;
        try {
          const errBody = JSON.parse(errText) as AnthropicErrorBody;
          if (errBody.error?.message) errMsg += `: ${errBody.error.message}`;
        } catch {
          errMsg += `: ${errText.slice(0, 200)}`;
        }
        throw new Error(errMsg);
      }

      const data = (await response.json()) as AnthropicResponse;

      const textContent = data.content
        .filter((block): block is AnthropicContentBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      if (!textContent) {
        throw new Error('Anthropic returned no text content');
      }

      return {
        content: textContent,
        model: data.model || modelName,
        provider: this.id,
        tokensUsed: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
        durationMs,
        finishReason: data.stop_reason,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async isAvailable(): Promise<boolean> {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    return Boolean(apiKey && apiKey.length > 0);
  }
}
