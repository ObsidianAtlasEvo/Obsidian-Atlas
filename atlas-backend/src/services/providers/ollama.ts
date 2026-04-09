// ── Ollama Provider ───────────────────────────────────────────────────────────
// Wraps the existing ollama service for use within the multi-model orchestrator.
// Delegates all HTTP communication to ../ollama.ts so we stay DRY.

import { complete, ping } from '../ollama.js';
import type { ModelProvider, ProviderMessage, CompletionOptions, CompletionResult } from './base.js';

/** Strip the 'ollama/' prefix from a model ID to get the raw Ollama model tag. */
function rawModelName(modelId: string): string {
  return modelId.startsWith('ollama/') ? modelId.slice(7) : modelId;
}

export class OllamaProvider implements ModelProvider {
  readonly id = 'ollama';
  readonly name = 'Ollama (Local)';

  async complete(
    messages: ProviderMessage[],
    options: CompletionOptions,
  ): Promise<CompletionResult> {
    const modelName = rawModelName(options.model);
    const startedAt = Date.now();

    // The existing complete() from ollama.ts returns the content string directly.
    // We wrap it to conform to the CompletionResult interface.
    const content = await complete(
      messages.map((m) => ({ role: m.role, content: m.content })),
      {
        model: modelName,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        timeoutMs: options.timeoutMs,
      },
    );

    return {
      content,
      model: modelName,
      provider: this.id,
      durationMs: Date.now() - startedAt,
      finishReason: 'stop',
    };
  }

  async isAvailable(): Promise<boolean> {
    return ping();
  }
}
