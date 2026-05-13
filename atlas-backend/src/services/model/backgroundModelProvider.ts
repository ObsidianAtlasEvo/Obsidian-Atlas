/**
 * Background ModelProvider — used by Chronos heartbeats and other internal
 * autonomous workers that should NOT consume the Groq free-tier daily token
 * budget. Routes to Gemini Flash first, then OpenAI as fallback. Throws when
 * neither provider is configured rather than silently falling back to Groq.
 *
 * Rationale: Groq's free tier is capped at ~100k tokens/day. Background ticks
 * (Chronos, governance synthesis, Chief-of-Staff routing) were exhausting that
 * budget before user-facing chat could land. Gemini Flash has a generous free
 * tier and similar latency for short structured-JSON outputs.
 */
import { env } from '../../config/env.js';
import type {
  ModelProvider,
  GenerateInput,
  GenerateOutput,
  EmbeddingInput,
} from './modelProvider.js';
import {
  completeGeminiChat,
  completeOpenAiCompatibleChat,
  type UniversalMessage,
} from '../intelligence/universalAdapter.js';
import { withKeyRotation } from '../inference/keyPoolService.js';

function buildMessages(input: GenerateInput): UniversalMessage[] {
  const msgs: UniversalMessage[] = [];
  if (input.systemPrompt?.trim()) {
    msgs.push({ role: 'system', content: input.systemPrompt.trim() });
  }
  for (const m of input.messages) {
    msgs.push({ role: m.role, content: m.content });
  }
  return msgs;
}

function ensureJsonInstruction(messages: UniversalMessage[]): UniversalMessage[] {
  // Gemini doesn't have an OpenAI-style response_format toggle in this path,
  // so when callers ask for jsonMode we strengthen the system prompt instead.
  const sysIdx = messages.findIndex((m) => m.role === 'system');
  const note =
    '\n\nIMPORTANT: respond with a single valid JSON object only. No prose, no markdown fences.';
  if (sysIdx >= 0) {
    return messages.map((m, i) =>
      i === sysIdx ? { ...m, content: `${m.content}${note}` } : m,
    );
  }
  return [{ role: 'system', content: note.trim() }, ...messages];
}

export function createBackgroundModelProvider(modelId?: string): ModelProvider {
  const defaultModel = modelId?.trim() || env.backgroundModelId;

  return {
    async generate(input: GenerateInput): Promise<GenerateOutput> {
      const chosenModel = input.modelOverride?.trim() || defaultModel;
      const baseMessages = buildMessages(input);
      const messages = input.jsonMode ? ensureJsonInstruction(baseMessages) : baseMessages;

      // ── Attempt 1: Gemini ────────────────────────────────────────────────
      if (env.geminiApiKey?.trim()) {
        try {
          console.info(
            `[background-model] using gemini (${chosenModel}) — Groq reserved for user conversations`,
          );
          const res = await completeGeminiChat({
            model: chosenModel,
            messages,
            temperature: input.temperature ?? 0.2,
            timeoutMs: input.timeoutMs,
          });
          return { text: res.text, model: res.model };
        } catch (err) {
          console.warn(
            '[background-model] gemini failed, attempting openai fallback:',
            err instanceof Error ? err.message : String(err),
          );
        }
      }

      // ── Attempt 2: OpenAI ────────────────────────────────────────────────
      if (env.openaiApiKey?.trim()) {
        const base = (env.openaiBaseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
        const openaiModel =
          env.openaiRouterModel?.trim() ||
          env.openaiNanoModel?.trim() ||
          'gpt-5.4-nano';
        console.info(
          `[background-model] using openai (${openaiModel}) — Groq reserved for user conversations`,
        );
        return withKeyRotation('openai', async (apiKey) => {
          const res = await completeOpenAiCompatibleChat({
            baseUrl: base,
            apiKey,
            model: openaiModel,
            messages,
            temperature: input.temperature ?? 0.2,
            timeoutMs: input.timeoutMs,
          });
          return { text: res.text, model: res.model };
        });
      }

      throw new Error(
        '[background-model] no non-Groq provider configured (need GEMINI_API_KEY or OPENAI_API_KEY); ' +
          'background ticks must not consume Groq tokens',
      );
    },

    async embed(_input: EmbeddingInput): Promise<number[][]> {
      throw new Error(
        '[background-model] embeddings not supported; use a dedicated embedding provider',
      );
    },
  };
}
