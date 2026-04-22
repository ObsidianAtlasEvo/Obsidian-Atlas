/**
 * Lightweight Groq ModelProvider implementation.
 * Used as the default for background services (Chronos, Evolution)
 * so they don't depend on a local Ollama installation.
 */
import { env } from '../../config/env.js';
import type { ModelProvider, GenerateInput, GenerateOutput, EmbeddingInput } from './modelProvider.js';
import { truncateForGroq } from '../intelligence/universalAdapter.js';
import { withKeyRotation } from '../inference/keyPoolService.js';

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const DEFAULT_CHRONOS_MODEL = 'llama-3.3-70b-versatile';

export function createGroqModelProvider(modelId?: string): ModelProvider {
  const model = modelId ?? DEFAULT_CHRONOS_MODEL;

  return {
    async generate(input: GenerateInput): Promise<GenerateOutput> {
      const msgs: { role: string; content: string }[] = [];
      if (input.systemPrompt?.trim()) {
        msgs.push({ role: 'system', content: input.systemPrompt.trim() });
      }
      for (const m of input.messages) {
        msgs.push({ role: m.role, content: m.content });
      }

      const chosenModel = input.modelOverride?.trim() || model;
      const truncated = truncateForGroq(msgs as { role: 'system' | 'user' | 'assistant'; content: string }[]);

      return withKeyRotation('groq', async (apiKey) => {
        if (!apiKey) throw new Error('Groq unavailable — no key configured in env or pool');

        const controller = new AbortController();
        const timeout = input.timeoutMs
          ? setTimeout(() => controller.abort(), input.timeoutMs)
          : undefined;

        const base = (
          env.groqBaseUrl?.trim() ||
          env.cloudOpenAiBaseUrl?.trim() ||
          GROQ_BASE
        ).replace(/\/$/, '');

        try {
          const res = await fetch(`${base}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: chosenModel,
              messages: truncated,
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
      });
    },

    async embed(_input: EmbeddingInput): Promise<number[][]> {
      // AUDIT FIX: P2-16 — Groq does not support embeddings. Throw instead of returning empty vectors
      // which cause downstream vector search to return meaningless results.
      throw new Error('Groq does not support embeddings. Configure a dedicated embedding provider (e.g., GEMINI_API_KEY for Gemini embeddings).');
    },
  };
}
