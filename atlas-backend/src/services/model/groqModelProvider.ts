/**
 * Lightweight Groq ModelProvider implementation.
 * Used as the default for background services (Chronos, Evolution)
 * so they don't depend on a local Ollama installation.
 */
import { env } from '../../config/env.js';
import type { ModelProvider, GenerateInput, GenerateOutput, EmbeddingInput } from './modelProvider.js';

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const DEFAULT_CHRONOS_MODEL = 'llama-3.1-8b-instant';

export function createGroqModelProvider(modelId?: string): ModelProvider {
  const apiKey = env.groqApiKey;
  const model = modelId ?? DEFAULT_CHRONOS_MODEL;

  return {
    async generate(input: GenerateInput): Promise<GenerateOutput> {
      if (!apiKey) throw new Error('Groq unavailable — GROQ_API_KEY not configured');

      const msgs: { role: string; content: string }[] = [];
      if (input.systemPrompt?.trim()) {
        msgs.push({ role: 'system', content: input.systemPrompt.trim() });
      }
      for (const m of input.messages) {
        msgs.push({ role: m.role, content: m.content });
      }

      const chosenModel = input.modelOverride?.trim() || model;

      const controller = new AbortController();
      const timeout = input.timeoutMs
        ? setTimeout(() => controller.abort(), input.timeoutMs)
        : undefined;

      try {
        const res = await fetch(`${GROQ_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: chosenModel,
            messages: msgs,
            temperature: input.temperature ?? 0.2,
            max_tokens: 2048,
            stream: false,
            ...(input.jsonMode ? { response_format: { type: 'json_object' } } : {}),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.text().catch(() => res.statusText);
          throw new Error(`Groq ${res.status}: ${err.slice(0, 200)}`);
        }

        const data = (await res.json()) as {
          choices: { message: { content: string } }[];
          model: string;
          usage?: { prompt_tokens: number; completion_tokens: number };
        };

        const text = data.choices[0]?.message?.content ?? '';
        return {
          text: text.trim(),
          model: data.model ?? chosenModel,
          promptTokens: data.usage?.prompt_tokens,
          completionTokens: data.usage?.completion_tokens,
        };
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    },

    async embed(_input: EmbeddingInput): Promise<number[][]> {
      // Groq does not offer an embeddings endpoint — return empty vectors
      // Background services that call embed() will need to handle this gracefully
      return _input.input.map(() => []);
    },
  };
}
