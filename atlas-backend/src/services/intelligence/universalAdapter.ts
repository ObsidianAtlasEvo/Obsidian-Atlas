import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env.js';
import type { LlmRegistryEntry } from './llmRegistry.js';
import { assertEntryUsable } from './llmRegistry.js'; // AUDIT FIX: P1-5 import assertEntryUsable
import { pickKey, pickNextKey, recordKeySuccess, recordKeyFailure, isRotatableError, withKeyRotation } from '../inference/keyPoolService.js';

export type UniversalMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/** Message type that supports both string and array content (multi-modal). */
export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
};

export type StreamDeltaHandler = (textDelta: string) => void;

/** User-facing message when every model in the fallback chain has failed. */
export const TRANSIENT_USER_MESSAGE = 'Atlas is momentarily overloaded. Please try again in a few seconds.';

// ─── Overseer system prompt ─────────────────────────────────────────────────

export const OVERSEER_SYSTEM_PROMPT = `You are Atlas — a sovereign intelligence layer operating as the final synthesis and identity-enforcement lens.

ROLE:
You receive the outputs of multiple specialist worker models, the user's evolution profile, memory context, and tool outputs. Your task is to synthesize these into a single, coherent, Atlas-identity response.

IDENTITY ENFORCEMENT:
- Apply Atlas doctrine to every response
- Enforce truth constraints — never speculate as fact
- Apply the user's evolution context and preferences
- Resolve contradictions between worker outputs using doctrine as the tiebreaker

OUTPUT:
- Produce the final user-facing response in Atlas voice
- If a policy conflict exists that cannot be resolved by synthesis, emit requireProAudit: true and describe the conflict. Do not resolve it yourself.
- Never expose raw worker outputs to the user
- Never break Atlas identity to defer to a model provider's style

WORKERS:
The inputs you receive come from specialist worker models. They are raw material, not final answers.`;

// ─── OpenAI Responses API types ─────────────────────────────────────────────

export interface OpenAIResponsesInput {
  messages: Array<{ role: string; content: string }>;
  systemPrompt?: string;
}

export interface OpenAIResponsesOptions {
  model: string;
  stream: boolean;
  store: boolean;
  responseFormat?: { type: string };
}

/** Detect Google Gemini transient capacity / rate-limit errors.
 *
 * IMPORTANT: Only match Gemini-specific error patterns. Bare '503' / '429'
 * substrings also appear in Groq / OpenRouter errors and must NOT be caught
 * here — otherwise the fallback chain treats non-Gemini failures as retryable
 * Gemini issues, exhausts all models, and emits the overload message.
 */
export function isGeminiTransient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('[GoogleGenerativeAI Error]') ||
    msg.includes('GoogleGenerativeAI') ||
    (msg.includes('503') && (msg.includes('Service Unavailable') || msg.includes('overloaded') || msg.includes('models/'))) ||
    msg.includes('high demand') ||
    (msg.includes('429') && (msg.includes('Resource has been exhausted') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('models/'))) ||
    msg.includes('RESOURCE_EXHAUSTED')
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry wrapper — up to `attempts` tries with exponential backoff, skipping
 * retry on abort / non-retryable errors. Used by the resilient fallback chain
 * to squeeze transient provider flakes out of secondary/tertiary hops.
 */
async function withRetry<T>(
  label: string,
  attempts: number,
  fn: () => Promise<T>,
  baseDelayMs = 800,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      // Never retry on abort
      if (msg.includes('aborted') || msg.includes('AbortError')) throw err;
      // Don't retry on auth / bad-request — those are configuration, not transient
      if (msg.includes('401') || msg.includes('403') || msg.includes('400')) throw err;
      if (i < attempts - 1) {
        await delay(baseDelayMs * (i + 1));
      }
    }
  }
  void label;
  throw lastErr;
}

function openAiStyleMessages(msgs: UniversalMessage[]): { role: string; content: string }[] {
  return msgs.map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Truncate messages to fit within Groq's per-request token limit (~12k tokens
 * on the on_demand tier for llama-3.3-70b-versatile).
 *
 * With max_tokens 2048 reserved for completion, we have ~10k input tokens.
 * Rough estimate: 1 token ≈ 4 chars.
 *   - Normal mode:     36 000 chars ≈ 9 000 tokens (safe first attempt)
 *   - Aggressive mode:  20 000 chars ≈ 5 000 tokens (retry after 413)
 *
 * Keeps the system message intact and trims from the oldest non-system messages.
 */
export function truncateForGroq(
  messages: UniversalMessage[],
  aggressive = false,
): UniversalMessage[] {
  const MAX_CHARS = aggressive ? 20_000 : 36_000;
  const system = messages[0]?.role === 'system' ? [messages[0]] : [];
  const rest = messages[0]?.role === 'system' ? messages.slice(1) : [...messages];
  let total = system.reduce((s, m) => s + m.content.length, 0);
  const kept: UniversalMessage[] = [];
  for (let i = rest.length - 1; i >= 0; i--) {
    if (total + rest[i]!.content.length > MAX_CHARS && kept.length > 0) break;
    kept.unshift(rest[i]!);
    total += rest[i]!.content.length;
  }
  return [...system, ...kept];
}

let cachedOllamaTagsAt = 0;
let cachedOllamaTags: string[] = [];

async function getInstalledOllamaModels(signal?: AbortSignal): Promise<string[]> {
  const now = Date.now();
  if (now - cachedOllamaTagsAt < 30_000 && cachedOllamaTags.length > 0) {
    return cachedOllamaTags;
  }
  try {
    const res = await fetch(`${env.ollamaBaseUrl}/tags`, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: Array<{ name?: string }> };
    const names = (data.models ?? [])
      .map((m) => (typeof m.name === 'string' ? m.name.trim() : ''))
      .filter(Boolean);
    cachedOllamaTags = names;
    cachedOllamaTagsAt = now;
    return names;
  } catch {
    return [];
  }
}

async function resolveOllamaCandidates(requestedModel: string, signal?: AbortSignal): Promise<string[]> {
  const initial = requestedModel === 'local' ? env.ollamaChatModel : requestedModel;
  const installed = await getInstalledOllamaModels(signal);
  const pool = env.ollamaModelPool;
  const explicit = pool.length > 0 ? pool : installed;
  const merged = [initial, ...explicit, ...installed];
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const m of merged) {
    const t = m.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    unique.push(t);
  }
  return unique;
}

function resolveGroqAuth(): { base: string; apiKey: string } | null {
  const apiKey = env.groqApiKey?.trim() || env.cloudOpenAiApiKey?.trim();
  if (!apiKey) return null;
  const base = (
    env.groqBaseUrl?.trim() ||
    env.cloudOpenAiBaseUrl?.trim() ||
    'https://api.groq.com/openai/v1'
  ).replace(/\/$/, '');
  return { base, apiKey };
}

/** Pool-aware Groq auth: tries env key first, then rotates through pool on 429/503. */
async function resolveGroqAuthWithPool(): Promise<{ base: string; apiKey: string } | null> {
  const base = (
    env.groqBaseUrl?.trim() ||
    env.cloudOpenAiBaseUrl?.trim() ||
    'https://api.groq.com/openai/v1'
  ).replace(/\/$/, '');
  const poolKey = await pickKey('groq');
  if (!poolKey) {
    // Fall back to env key (original behavior)
    const apiKey = env.groqApiKey?.trim() || env.cloudOpenAiApiKey?.trim();
    return apiKey ? { base, apiKey } : null;
  }
  return { base, apiKey: poolKey.apiKey, _poolKey: poolKey } as { base: string; apiKey: string };
}

function resolveOpenRouterAuth(): { base: string; apiKey: string } | null {
  const apiKey = env.openrouterApiKey?.trim();
  if (!apiKey) return null;
  const base = (env.openrouterBaseUrl?.trim() || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  return { base, apiKey };
}

async function resolveOpenRouterAuthWithPool(): Promise<{ base: string; apiKey: string } | null> {
  const base = (env.openrouterBaseUrl?.trim() || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  const poolKey = await pickKey('openrouter');
  if (!poolKey) {
    const apiKey = env.openrouterApiKey?.trim();
    return apiKey ? { base, apiKey } : null;
  }
  return { base, apiKey: poolKey.apiKey, _poolKey: poolKey } as { base: string; apiKey: string };
}

function resolveOpenAiAuth(): { base: string; apiKey: string } | null {
  const apiKey = env.openaiApiKey?.trim();
  if (!apiKey) return null;
  const base = (env.openaiBaseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
  return { base, apiKey };
}

async function resolveOpenAiAuthWithPool(): Promise<{ base: string; apiKey: string } | null> {
  const base = (env.openaiBaseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
  const poolKey = await pickKey('openai');
  if (!poolKey) {
    const apiKey = env.openaiApiKey?.trim();
    return apiKey ? { base, apiKey } : null;
  }
  return { base, apiKey: poolKey.apiKey, _poolKey: poolKey } as { base: string; apiKey: string };
}

async function streamOpenAiCompatibleChat(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: UniversalMessage[];
  onDelta: StreamDeltaHandler;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  extraHeaders?: Record<string, string>;
}): Promise<{ fullText: string; model: string }> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: openAiStyleMessages(params.messages),
    temperature: params.temperature ?? 0.35,
    stream: true,
    ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
  };

  const controller = new AbortController();
  const t = params.timeoutMs ? setTimeout(() => controller.abort(), params.timeoutMs) : undefined;
  let full = '';
  let outModel = params.model;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${params.apiKey}`,
    ...params.extraHeaders,
  };

  try {
    const res = await fetch(`${params.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: params.signal ?? controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI-compat stream failed (${res.status}): ${errText.slice(0, 240)}`);
    }
    if (!res.body) throw new Error('OpenAI-compat stream: empty body');

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const block of parts) {
        for (const line of block.split('\n')) {
          const s = line.trim();
          if (!s.startsWith('data:')) continue;
          const payload = s.slice(5).trim();
          if (payload === '[DONE]') continue;
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(payload) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (typeof data.model === 'string') outModel = data.model;
          const choices = data.choices;
          if (!Array.isArray(choices) || !choices[0]) continue;
          const ch = choices[0] as Record<string, unknown>;
          const delta = ch.delta as Record<string, unknown> | undefined;
          const piece = typeof delta?.content === 'string' ? delta.content : '';
          if (piece) {
            full += piece;
            params.onDelta(piece);
          }
        }
      }
    }
    return { fullText: full.trim(), model: outModel };
  } finally {
    if (t) clearTimeout(t);
  }
}

// Default timeout for Gemini streaming calls — prevents hung connections
// when the @google/genai SDK does not respect the AbortSignal natively.
const GEMINI_STREAM_TIMEOUT_MS = 45_000;

async function streamGeminiChatRaw(params: {
  model: string;
  messages: UniversalMessage[];
  onDelta: StreamDeltaHandler;
  temperature?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ fullText: string; model: string }> {
  const client = getGeminiGenAiClient();

  const first = params.messages[0];
  const system =
    first?.role === 'system'
      ? first.content
      : params.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = params.messages.filter((m) => m.role !== 'system');

  const contents = rest.map((m) => ({
    role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
    parts: [{ text: m.content }],
  }));

  // Wire abort signal: merge caller signal + internal timeout into one controller.
  // The @google/genai SDK does not natively accept AbortSignal, so we wrap the
  // entire stream in a Promise.race to enforce the timeout externally.
  const timeoutMs = params.timeoutMs ?? GEMINI_STREAM_TIMEOUT_MS;
  const controller = new AbortController();
  // Propagate caller abort into our controller
  params.signal?.addEventListener('abort', () => controller.abort());
  const t = setTimeout(() => controller.abort(), timeoutMs);
  let full = '';

  try {
    const streamPromise = client.models.generateContentStream({
      model: params.model?.trim() || env.geminiModel?.trim() || 'gemini-2.0-flash',
      contents,
      config: {
        systemInstruction: system || undefined,
        temperature: params.temperature ?? 0.35,
      },
    });

    // Race stream initiation against abort
    const stream = await Promise.race([
      streamPromise,
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener('abort', () =>
          reject(new Error('[GoogleGenerativeAI Error] Request aborted (timeout)'))
        )
      ),
    ]);

    for await (const chunk of stream) {
      const piece = typeof chunk.text === 'string' ? chunk.text : '';
      if (piece) {
        full += piece;
        params.onDelta(piece);
      }
    }
    return { fullText: full.trim(), model: params.model };
  } finally {
    if (t) clearTimeout(t);
  }
}

/**
 * Try OpenAI → OpenRouter (Anthropic) → OpenRouter (fallback) as tertiary
 * providers after Gemini + Groq have both failed. Returns on first success,
 * throws if none are configured OR all configured providers fail.
 *
 * This is the last line of defense before the "Atlas is overloaded" message.
 */
async function streamTertiaryFallback(params: {
  messages: UniversalMessage[];
  onDelta: StreamDeltaHandler;
  temperature?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ fullText: string; model: string }> {
  const errors: string[] = [];

  // Tier 1: OpenAI direct (gpt-4o-mini — fast, cheap, 128k context)
  const openaiAuth = resolveOpenAiAuth();
  if (openaiAuth) {
    try {
      return await withRetry('openai-gpt-4o-mini', 2, () =>
        streamOpenAiCompatibleChat({
          baseUrl: openaiAuth.base,
          apiKey: openaiAuth.apiKey,
          model: 'gpt-4o-mini',
          messages: params.messages,
          onDelta: params.onDelta,
          temperature: params.temperature,
          maxTokens: 2048,
          signal: params.signal,
          timeoutMs: params.timeoutMs,
        }),
      );
    } catch (e) {
      errors.push(`openai:${e instanceof Error ? e.message.slice(0, 80) : 'err'}`);
    }
  }

  // Tier 2: OpenRouter (Anthropic Claude Haiku — fast, different infra than OpenAI)
  const openrouterAuth = resolveOpenRouterAuth();
  if (openrouterAuth) {
    try {
      return await withRetry('openrouter-claude-haiku', 2, () =>
        streamOpenAiCompatibleChat({
          baseUrl: openrouterAuth.base,
          apiKey: openrouterAuth.apiKey,
          model: 'anthropic/claude-3-5-haiku',
          messages: params.messages,
          onDelta: params.onDelta,
          temperature: params.temperature,
          maxTokens: 2048,
          signal: params.signal,
          timeoutMs: params.timeoutMs,
          extraHeaders: {
            'HTTP-Referer': env.openrouterReferer?.trim() || 'https://obsidianatlastech.com',
            'X-Title': 'Obsidian Atlas',
          },
        }),
      );
    } catch (e) {
      errors.push(`openrouter-anthropic:${e instanceof Error ? e.message.slice(0, 80) : 'err'}`);
    }

    // Tier 3: OpenRouter auto-route — last resort, picks whatever provider is healthy
    try {
      return await withRetry('openrouter-auto', 1, () =>
        streamOpenAiCompatibleChat({
          baseUrl: openrouterAuth.base,
          apiKey: openrouterAuth.apiKey,
          model: 'openrouter/auto',
          messages: params.messages,
          onDelta: params.onDelta,
          temperature: params.temperature,
          maxTokens: 2048,
          signal: params.signal,
          timeoutMs: params.timeoutMs,
          extraHeaders: {
            'HTTP-Referer': env.openrouterReferer?.trim() || 'https://obsidianatlastech.com',
            'X-Title': 'Obsidian Atlas',
          },
        }),
      );
    } catch (e) {
      errors.push(`openrouter-auto:${e instanceof Error ? e.message.slice(0, 80) : 'err'}`);
    }
  }

  throw new Error(
    errors.length > 0
      ? `All tertiary fallbacks failed: ${errors.join(' | ')}`
      : 'No tertiary fallback providers configured (set OPENAI_API_KEY and/or OPENROUTER_API_KEY)',
  );
}

/** Non-streaming twin of streamTertiaryFallback. */
async function completeTertiaryFallback(params: {
  messages: UniversalMessage[];
  temperature?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ text: string; model: string }> {
  const errors: string[] = [];

  const openaiAuth = resolveOpenAiAuth();
  if (openaiAuth) {
    try {
      return await withRetry('openai-gpt-4o-mini-complete', 2, () =>
        completeOpenAiCompatibleChat({
          baseUrl: openaiAuth.base,
          apiKey: openaiAuth.apiKey,
          model: 'gpt-4o-mini',
          messages: params.messages,
          temperature: params.temperature,
          maxTokens: 2048,
          signal: params.signal,
          timeoutMs: params.timeoutMs,
        }),
      );
    } catch (e) {
      errors.push(`openai:${e instanceof Error ? e.message.slice(0, 80) : 'err'}`);
    }
  }

  const openrouterAuth = resolveOpenRouterAuth();
  if (openrouterAuth) {
    try {
      return await withRetry('openrouter-claude-haiku-complete', 2, () =>
        completeOpenAiCompatibleChat({
          baseUrl: openrouterAuth.base,
          apiKey: openrouterAuth.apiKey,
          model: 'anthropic/claude-3-5-haiku',
          messages: params.messages,
          temperature: params.temperature,
          maxTokens: 2048,
          signal: params.signal,
          timeoutMs: params.timeoutMs,
        }),
      );
    } catch (e) {
      errors.push(`openrouter-anthropic:${e instanceof Error ? e.message.slice(0, 80) : 'err'}`);
    }

    try {
      return await withRetry('openrouter-auto-complete', 1, () =>
        completeOpenAiCompatibleChat({
          baseUrl: openrouterAuth.base,
          apiKey: openrouterAuth.apiKey,
          model: 'openrouter/auto',
          messages: params.messages,
          temperature: params.temperature,
          maxTokens: 2048,
          signal: params.signal,
          timeoutMs: params.timeoutMs,
        }),
      );
    } catch (e) {
      errors.push(`openrouter-auto:${e instanceof Error ? e.message.slice(0, 80) : 'err'}`);
    }
  }

  throw new Error(
    errors.length > 0
      ? `All tertiary fallbacks failed: ${errors.join(' | ')}`
      : 'No tertiary fallback providers configured (set OPENAI_API_KEY and/or OPENROUTER_API_KEY)',
  );
}

/**
 * Stream Gemini with transient-error fallback chain:
 * 1. Try requested model
 * 2. Wait 1.5s, retry same model
 * 3. Try gemini-2.0-flash (secondary)
 * 4. Fall back to Groq llama-3.3-70b-versatile
 * 5. Fall back to OpenAI / OpenRouter tertiary chain
 * 6. Throw clean user-facing error
 */
export async function streamGeminiChat(params: {
  model: string;
  messages: UniversalMessage[];
  onDelta: StreamDeltaHandler;
  temperature?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ fullText: string; model: string }> {
  // Attempt 1: primary model
  try {
    return await streamGeminiChatRaw(params);
  } catch (err) {
    if (!isGeminiTransient(err)) throw err;
  }

  // Attempt 2: retry same model after delay
  await delay(1500);
  try {
    return await streamGeminiChatRaw(params);
  } catch (err) {
    if (!isGeminiTransient(err)) throw err;
  }

  // Attempt 3: secondary Gemini model (gemini-2.0-flash)
  const secondary = 'gemini-2.0-flash';
  if (params.model?.trim() !== secondary) {
    try {
      return await streamGeminiChatRaw({ ...params, model: secondary });
    } catch (err) {
      if (!isGeminiTransient(err)) throw err;
    }
  }

  // Attempt 4: fall back to Groq with key-pool rotation (pre-truncate to stay within 12k token limit)
  const groqBase = (
    env.groqBaseUrl?.trim() ||
    env.cloudOpenAiBaseUrl?.trim() ||
    'https://api.groq.com/openai/v1'
  ).replace(/\/$/, '');
  try {
    const groqMessages = truncateForGroq(params.messages);
    const result = await withKeyRotation('groq', async (apiKey) => {
      // 413 guard: try normal truncation first, then aggressive
      try {
        return await streamOpenAiCompatibleChat({
          baseUrl: groqBase,
          apiKey,
          model: 'llama-3.3-70b-versatile',
          messages: groqMessages,
          onDelta: params.onDelta,
          temperature: params.temperature,
          maxTokens: 2048,
          signal: params.signal,
          timeoutMs: params.timeoutMs,
        });
      } catch (groqErr) {
        const groqMsg = groqErr instanceof Error ? groqErr.message : String(groqErr);
        if (groqMsg.includes('413') || groqMsg.includes('Request too large')) {
          const aggressiveMessages = truncateForGroq(params.messages, true);
          return await streamOpenAiCompatibleChat({
            baseUrl: groqBase,
            apiKey,
            model: 'llama-3.3-70b-versatile',
            messages: aggressiveMessages,
            onDelta: params.onDelta,
            temperature: params.temperature,
            maxTokens: 2048,
            signal: params.signal,
            timeoutMs: params.timeoutMs,
          });
        }
        throw groqErr;
      }
    });
    return result;
  } catch {
    // withKeyRotation exhausted all keys — fall through to tertiary chain
  }

  // Attempt 5: tertiary fallback chain (OpenAI → OpenRouter)
  try {
    return await streamTertiaryFallback({
      messages: params.messages,
      onDelta: params.onDelta,
      temperature: params.temperature,
      signal: params.signal,
      timeoutMs: params.timeoutMs,
    });
  } catch (tertiaryErr) {
    // Log for ops visibility; user still gets the clean message
    console.warn('[universalAdapter] tertiary fallback failed:',
      tertiaryErr instanceof Error ? tertiaryErr.message.slice(0, 200) : tertiaryErr);
  }

  throw new Error(TRANSIENT_USER_MESSAGE);
}

async function streamOllamaChat(params: {
  model: string;
  messages: UniversalMessage[];
  onDelta: StreamDeltaHandler;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ fullText: string; model: string }> {
  const candidates = await resolveOllamaCandidates(params.model, params.signal);
  let lastError = 'No Ollama candidate models available';

  const controller = new AbortController();
  const t = params.timeoutMs ? setTimeout(() => controller.abort(), params.timeoutMs) : undefined;

  try {
    for (const model of candidates) {
      const body = {
        model,
        messages: openAiStyleMessages(params.messages),
        stream: true,
        options: { temperature: 0.35 },
      };
      let full = '';
      try {
        const res = await fetch(`${env.ollamaBaseUrl}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: params.signal ?? controller.signal,
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Ollama stream failed (${res.status}) for ${model}: ${errText.slice(0, 200)}`);
        }
        if (!res.body) throw new Error(`Ollama stream empty body for ${model}`);

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += dec.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const s = line.trim();
            if (!s) continue;
            let data: Record<string, unknown>;
            try {
              data = JSON.parse(s) as Record<string, unknown>;
            } catch {
              continue;
            }
            const message = data.message as Record<string, unknown> | undefined;
            const piece = typeof message?.content === 'string' ? message.content : '';
            if (piece) {
              full += piece;
              params.onDelta(piece);
            }
          }
        }
        return { fullText: full.trim(), model };
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        continue;
      }
    }
    throw new Error(lastError);
  } finally {
    if (t) clearTimeout(t);
  }
}

/**
 * Stream a completion for a registry entry using the correct backend (OpenAI-compatible, Gemini SDK, or Ollama).
 */
export async function streamRegistryModel(params: {
  entry: LlmRegistryEntry;
  messages: UniversalMessage[];
  onDelta: StreamDeltaHandler;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ fullText: string; model: string }> {
  const { entry, messages, onDelta, signal, timeoutMs } = params;

  // AUDIT FIX: P1-5 — validate entry is usable before dispatch (not DEPRECATED/REMOVED/gated)
  assertEntryUsable(entry);

  switch (entry.backend) {
    case 'groq': {
      const groqRegistryBase = (
        env.groqBaseUrl?.trim() ||
        env.cloudOpenAiBaseUrl?.trim() ||
        'https://api.groq.com/openai/v1'
      ).replace(/\/$/, '');
      const groqRegistryModel = env.groqDelegateModel?.trim() || entry.apiModel;
      // Try pool-rotation first; if pool is empty (no env key either), fall back to Ollama
      try {
        return await withKeyRotation('groq', (apiKey) =>
          streamOpenAiCompatibleChat({
            baseUrl: groqRegistryBase,
            apiKey,
            model: groqRegistryModel,
            messages: truncateForGroq(messages),
            onDelta,
            maxTokens: 2048,
            signal,
            timeoutMs,
          }),
        );
      } catch (registryGroqErr) {
        // If the pool threw because all keys are exhausted, fall back to Ollama (dev safety net)
        const errMsg = registryGroqErr instanceof Error ? registryGroqErr.message : String(registryGroqErr);
        if (errMsg.includes('not configured') || errMsg.includes('exhausted') || errMsg.includes('cooldown')) {
          return streamOllamaChat({
            model: env.ollamaChatModel,
            messages,
            onDelta,
            signal,
            timeoutMs,
          });
        }
        throw registryGroqErr;
      }
    }
    case 'openrouter': {
      const or = resolveOpenRouterAuth();
      if (or) {
        return streamOpenAiCompatibleChat({
          baseUrl: or.base,
          apiKey: or.apiKey,
          model: entry.apiModel,
          messages,
          onDelta,
          signal,
          timeoutMs,
          extraHeaders: {
            'HTTP-Referer': env.openrouterReferer?.trim() || 'https://obsidian-atlas.local',
            'X-Title': 'Obsidian Atlas',
          },
        });
      }
      const oa = resolveOpenAiAuth();
      if (oa && entry.apiModel.startsWith('openai/')) {
        return streamOpenAiCompatibleChat({
          baseUrl: oa.base,
          apiKey: oa.apiKey,
          model: entry.apiModel.replace(/^openai\//, ''),
          messages,
          onDelta,
          signal,
          timeoutMs,
        });
      }
      throw new Error('OpenRouter (or OpenAI) credentials not configured for this model');
    }
    case 'gemini_sdk': {
      const model = entry.apiModel || env.geminiModel?.trim() || 'gemini-2.5-flash';
      return streamGeminiChat({
        model,
        messages,
        onDelta,
        signal,
        timeoutMs,
      });
    }
    case 'openai_chat': {
      const oa = resolveOpenAiAuth();
      if (!oa) throw new Error('OpenAI credentials not configured for openai_chat backend');
      return streamOpenAiCompatibleChat({
        baseUrl: oa.base,
        apiKey: oa.apiKey,
        model: entry.apiModel,
        messages,
        onDelta,
        signal,
        timeoutMs,
      });
    }
    case 'ollama': {
      return streamOllamaChat({
        model: entry.apiModel,
        messages,
        onDelta,
        signal,
        timeoutMs,
      });
    }
    default:
      throw new Error(`Unknown backend: ${(entry as LlmRegistryEntry).backend}`);
  }
}

function extractOpenAiMessageText(data: unknown): { text: string; model: string } {
  const obj = data as Record<string, unknown>;
  const choices = obj?.choices as unknown[] | undefined;
  const c0 = choices?.[0] as Record<string, unknown> | undefined;
  const message = c0?.message as Record<string, unknown> | undefined;
  const content = typeof message?.content === 'string' ? message.content : '';
  const model = typeof obj.model === 'string' ? obj.model : 'unknown';
  return { text: content.trim(), model };
}

/** Non-streaming OpenAI-compatible completion (consensus parallel lanes). */
export async function completeOpenAiCompatibleChat(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: UniversalMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ text: string; model: string }> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: openAiStyleMessages(params.messages),
    temperature: params.temperature ?? 0.25,
    stream: false,
    ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
  };

  const controller = new AbortController();
  const t = params.timeoutMs ? setTimeout(() => controller.abort(), params.timeoutMs) : undefined;
  try {
    const res = await fetch(`${params.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: params.signal ?? controller.signal,
    });
    const rawText = await res.text();
    let data: unknown;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      throw new Error(`OpenAI-compat: invalid JSON (${res.status})`);
    }
    if (!res.ok) {
      throw new Error(`OpenAI-compat complete failed (${res.status}): ${rawText.slice(0, 240)}`);
    }
    return extractOpenAiMessageText(data);
  } finally {
    if (t) clearTimeout(t);
  }
}

export async function completeGroqChat(params: {
  model: string;
  messages: UniversalMessage[];
  temperature?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ text: string; model: string }> {
  const groqCompleteBase = (
    env.groqBaseUrl?.trim() ||
    env.cloudOpenAiBaseUrl?.trim() ||
    'https://api.groq.com/openai/v1'
  ).replace(/\/$/, '');
  const truncated = truncateForGroq(params.messages);
  return withKeyRotation('groq', (apiKey) =>
    completeOpenAiCompatibleChat({
      baseUrl: groqCompleteBase,
      apiKey,
      model: params.model,
      messages: truncated,
      temperature: params.temperature,
      signal: params.signal,
      timeoutMs: params.timeoutMs,
    }),
  );
}

/** Raw non-streaming Gemini completion (no retry/fallback). */
// Default timeout for non-streaming Gemini calls
const GEMINI_COMPLETE_TIMEOUT_MS = 30_000;

async function completeGeminiChatRaw(params: {
  model: string;
  messages: UniversalMessage[];
  temperature?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ text: string; model: string }> {
  const client = getGeminiGenAiClient();

  const first = params.messages[0];
  const system =
    first?.role === 'system'
      ? first.content
      : params.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = params.messages.filter((m) => m.role !== 'system');

  const contents = rest.map((m) => ({
    role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
    parts: [{ text: m.content }],
  }));

  const timeoutMs = params.timeoutMs ?? GEMINI_COMPLETE_TIMEOUT_MS;
  const controller = new AbortController();
  params.signal?.addEventListener('abort', () => controller.abort());
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const responsePromise = client.models.generateContent({
      model: params.model?.trim() || env.geminiModel?.trim() || 'gemini-2.0-flash',
      contents,
      config: {
        systemInstruction: system || undefined,
        temperature: params.temperature ?? 0.25,
      },
    });

    const response = await Promise.race([
      responsePromise,
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener('abort', () =>
          reject(new Error('[GoogleGenerativeAI Error] Request aborted (timeout)'))
        )
      ),
    ]);
    const text = typeof response.text === 'string' ? response.text : '';
    return { text: text.trim(), model: params.model };
  } finally {
    if (t) clearTimeout(t);
  }
}

/**
 * Non-streaming Gemini completion with transient-error fallback chain:
 * retry → secondary model → Groq → clean error.
 */
export async function completeGeminiChat(params: {
  model: string;
  messages: UniversalMessage[];
  temperature?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ text: string; model: string }> {
  // Attempt 1: primary model
  try {
    return await completeGeminiChatRaw(params);
  } catch (err) {
    if (!isGeminiTransient(err)) throw err;
  }

  // Attempt 2: retry after delay
  await delay(1500);
  try {
    return await completeGeminiChatRaw(params);
  } catch (err) {
    if (!isGeminiTransient(err)) throw err;
  }

  // Attempt 3: secondary Gemini model
  const secondary = 'gemini-2.0-flash';
  if (params.model?.trim() !== secondary) {
    try {
      return await completeGeminiChatRaw({ ...params, model: secondary });
    } catch (err) {
      if (!isGeminiTransient(err)) throw err;
    }
  }

  // Attempt 4: fall back to Groq with key-pool rotation (pre-truncate to stay within 12k token limit)
  const groqCompleteGeminiBase = (
    env.groqBaseUrl?.trim() ||
    env.cloudOpenAiBaseUrl?.trim() ||
    'https://api.groq.com/openai/v1'
  ).replace(/\/$/, '');
  try {
    const groqMessages = truncateForGroq(params.messages);
    const result = await withKeyRotation('groq', async (apiKey) => {
      try {
        return await completeOpenAiCompatibleChat({
          baseUrl: groqCompleteGeminiBase,
          apiKey,
          model: 'llama-3.3-70b-versatile',
          messages: groqMessages,
          temperature: params.temperature,
          maxTokens: 2048,
          signal: params.signal,
          timeoutMs: params.timeoutMs,
        });
      } catch (groqErr) {
        const groqMsg = groqErr instanceof Error ? groqErr.message : String(groqErr);
        if (groqMsg.includes('413') || groqMsg.includes('Request too large')) {
          const aggressiveMessages = truncateForGroq(params.messages, true);
          return await completeOpenAiCompatibleChat({
            baseUrl: groqCompleteGeminiBase,
            apiKey,
            model: 'llama-3.3-70b-versatile',
            messages: aggressiveMessages,
            temperature: params.temperature,
            maxTokens: 2048,
            signal: params.signal,
            timeoutMs: params.timeoutMs,
          });
        }
        throw groqErr;
      }
    });
    return result;
  } catch {
    // withKeyRotation exhausted all keys — fall through to tertiary chain
  }

  // Attempt 5: tertiary fallback chain (OpenAI → OpenRouter)
  try {
    return await completeTertiaryFallback({
      messages: params.messages,
      temperature: params.temperature,
      signal: params.signal,
      timeoutMs: params.timeoutMs,
    });
  } catch (tertiaryErr) {
    // Log for ops visibility; user still gets the clean message
    console.warn('[universalAdapter] tertiary fallback failed:',
      tertiaryErr instanceof Error ? tertiaryErr.message.slice(0, 200) : tertiaryErr);
  }

  throw new Error(TRANSIENT_USER_MESSAGE);
}

/** Stream final judge output (Maximum Clarity synthesis). */
export async function streamGroqChat(params: {
  model: string;
  messages: UniversalMessage[];
  onDelta: StreamDeltaHandler;
  temperature?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ fullText: string; model: string }> {
  const groqStreamBase = (
    env.groqBaseUrl?.trim() ||
    env.cloudOpenAiBaseUrl?.trim() ||
    'https://api.groq.com/openai/v1'
  ).replace(/\/$/, '');
  const truncated = truncateForGroq(params.messages);
  return withKeyRotation('groq', (apiKey) =>
    streamOpenAiCompatibleChat({
      baseUrl: groqStreamBase,
      apiKey,
      model: params.model,
      messages: truncated,
      onDelta: params.onDelta,
      temperature: params.temperature,
      maxTokens: 2048,
      signal: params.signal,
      timeoutMs: params.timeoutMs,
    }),
  );
}

// ---------------------------------------------------------------------------
// Gemini shared client (@google/genai SDK — used by both worker and overseer
// paths; the legacy @google/generative-ai SDK is no longer used here)
// ---------------------------------------------------------------------------

/** Lazy singleton — allocated on the first Gemini call (worker or overseer). */
let _geminiGenAiClient: InstanceType<typeof GoogleGenAI> | null = null;
function getGeminiGenAiClient(): InstanceType<typeof GoogleGenAI> {
  if (!_geminiGenAiClient) {
    const key = env.geminiApiKey?.trim();
    if (!key) throw new Error('GEMINI_API_KEY not configured');
    _geminiGenAiClient = new GoogleGenAI({ apiKey: key });
  }
  return _geminiGenAiClient;
}

/** Convert @google/genai async-iterable stream to a web ReadableStream<Uint8Array>. */
function geminiStreamToReadableStream(
  geminiStream: AsyncIterable<{ text?: string }>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of geminiStream) {
          if (chunk.text) {
            controller.enqueue(encoder.encode(chunk.text));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/**
 * Stream the Gemini Free-tier Overseer (primary path).
 * Uses the new @google/genai SDK with `generateContentStream`.
 */
export async function streamGeminiOverseerFree(params: {
  systemPrompt: string;
  userContent: string;
  temperature?: number;
  onDelta: StreamDeltaHandler;
  timeoutMs?: number;
}): Promise<{ fullText: string; model: string }> {
  const client = getGeminiGenAiClient();
  const model = env.geminiOverseerModelFree;

  const controller = new AbortController();
  const t = params.timeoutMs ? setTimeout(() => controller.abort(), params.timeoutMs) : undefined;
  let full = '';

  try {
    const stream = await client.models.generateContentStream({
      model,
      contents: params.userContent,
      config: {
        systemInstruction: params.systemPrompt,
        temperature: params.temperature ?? 0.08,
      },
    });

    for await (const chunk of stream) {
      const piece = typeof chunk.text === 'string' ? chunk.text : '';
      if (piece) {
        full += piece;
        params.onDelta(piece);
      }
    }
    return { fullText: full.trim(), model };
  } finally {
    if (t) clearTimeout(t);
  }
}

/**
 * Non-streaming Gemini Free-tier Overseer completion (for routing JSON).
 */
export async function completeGeminiOverseerFree(params: {
  systemPrompt: string;
  userContent: string;
  temperature?: number;
  timeoutMs?: number;
}): Promise<{ text: string; model: string }> {
  const client = getGeminiGenAiClient();
  const model = env.geminiOverseerModelFree;

  const controller = new AbortController();
  const t = params.timeoutMs ? setTimeout(() => controller.abort(), params.timeoutMs) : undefined;

  try {
    const response = await client.models.generateContent({
      model,
      contents: params.userContent,
      config: {
        systemInstruction: params.systemPrompt,
        temperature: params.temperature ?? 0.08,
        responseMimeType: 'application/json',
      },
    });

    const text = typeof response.text === 'string' ? response.text : '';
    return { text: text.trim(), model };
  } finally {
    if (t) clearTimeout(t);
  }
}

// ─── GPT-5.4 Responses API path ────────────────────────────────────────────

/**
 * Hard gate: gpt-5.4-pro does not support structured outputs.
 * Call this at the top of any function that builds an OpenAI API call body.
 */
export function assertNoStructuredOutput(
  modelId: string,
  options?: { responseFormat?: { type: string } },
): void {
  if (modelId === 'gpt-5.4-pro' && options?.responseFormat?.type === 'json_schema') {
    throw new Error(
      'gpt-5.4-pro does not support structured outputs. Remove response_format from this call.',
    );
  }
}

/**
 * Invoke the OpenAI Responses API (/v1/responses).
 *
 * Uses the existing resolveOpenAiAuth() credentials — does NOT create a new SDK instance.
 * store: false is enforced on ALL calls — Atlas manages its own memory layer.
 *
 * When stream=true, returns a Response object (caller reads SSE from response.body).
 * When stream=false, returns the parsed JSON response body.
 */
export async function invokeOpenAIResponses(
  input: OpenAIResponsesInput,
  options: OpenAIResponsesOptions,
): Promise<Response | object> {
  const auth = resolveOpenAiAuth();
  if (!auth) throw new Error('OpenAI credentials not configured for Responses API');

  // Hard gate: gpt-5.4-pro cannot use structured outputs
  assertNoStructuredOutput(options.model, options);

  const body: Record<string, unknown> = {
    model: options.model,
    input: input.messages,
    store: false, // critical: never let OpenAI store conversation history
    stream: options.stream,
  };

  if (input.systemPrompt) {
    body.instructions = input.systemPrompt;
  }

  const res = await fetch(`${auth.base}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.apiKey}`,
      ...(options.stream ? { Accept: 'text/event-stream' } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `OpenAI Responses API failed (${res.status}): ${errText.slice(0, 240)}`,
    );
  }

  if (options.stream) {
    return res;
  }

  return (await res.json()) as object;
}

// ─── Overseer model resolution ──────────────────────────────────────────────

/**
 * Resolve the Overseer model based on user tier.
 * Free tier uses gemini-3.1-flash-lite-preview (fallback: gpt-5.4-nano); Core + Sovereign use gpt-5.4.
 */
export function resolveOverseerModel(tier: 'free' | 'core' | 'sovereign'): string {
  if (tier === 'free') return env.geminiOverseerModelFree;
  return 'gpt-5.4';
}

/**
 * Build the Overseer input from worker outputs, memory, evolution context, and history.
 * All worker outputs must be collected BEFORE calling this.
 */
export function buildOverseerInput(params: {
  userPrompt: string;
  workerOutputs: string[];
  memoryContext?: string;
  evolutionContext?: string;
  toolOutputs?: string[];
  conversationHistory: ChatMessage[];
}): OpenAIResponsesInput {
  const parts: string[] = [];

  // Conversation history (prior turns)
  if (params.conversationHistory.length > 0) {
    parts.push('=== CONVERSATION HISTORY ===');
    for (const msg of params.conversationHistory) {
      const content = typeof msg.content === 'string'
        ? msg.content
        : (msg.content as Array<{ type: string; text?: string }>)
            .filter((p) => p.type === 'text')
            .map((p) => p.text ?? '')
            .join('\n');
      parts.push(`[${msg.role}]: ${content}`);
    }
  }

  // Memory context
  if (params.memoryContext) {
    parts.push('=== MEMORY CONTEXT ===');
    parts.push(params.memoryContext);
  }

  // Evolution context
  if (params.evolutionContext) {
    parts.push('=== EVOLUTION CONTEXT ===');
    parts.push(params.evolutionContext);
  }

  // Worker outputs
  parts.push('=== WORKER OUTPUTS ===');
  for (let i = 0; i < params.workerOutputs.length; i++) {
    parts.push(`--- Worker ${i + 1} ---`);
    parts.push(params.workerOutputs[i]!);
  }

  // Tool outputs
  if (params.toolOutputs && params.toolOutputs.length > 0) {
    parts.push('=== TOOL OUTPUTS ===');
    for (const output of params.toolOutputs) {
      parts.push(output);
    }
  }

  // User prompt (always last — most salient)
  parts.push('=== USER PROMPT ===');
  parts.push(params.userPrompt);

  return {
    messages: [{ role: 'user', content: parts.join('\n\n') }],
    systemPrompt: OVERSEER_SYSTEM_PROMPT,
  };
}

/**
 * Invoke the Overseer using the collect-then-stream pattern.
 *
 * Free tier: routes to Gemini gemini-3.1-flash-lite-preview via streamGeminiOverseerFree,
 * with gpt-5.4-nano as fallback. Core/Sovereign: routes to gpt-5.4 via OpenAI Responses API.
 *
 * Returns the raw Response (SSE stream) — caller reads from response.body.
 */
export async function invokeOverseer(params: {
  userPrompt: string;
  workerOutputs: string[];
  memoryContext?: string;
  evolutionContext?: string;
  toolOutputs?: string[];
  conversationHistory: ChatMessage[];
  userTier: 'free' | 'core' | 'sovereign';
}): Promise<Response> {
  const overseerModel = resolveOverseerModel(params.userTier);
  const overseerInput = buildOverseerInput(params);

  // Free tier: try Gemini overseer first, fall back to gpt-5.4-nano
  if (params.userTier === 'free') {
    try {
      let fullText = '';
      const streamResult = await streamGeminiOverseerFree({
        systemPrompt: overseerInput.systemPrompt ?? OVERSEER_SYSTEM_PROMPT,
        userContent: overseerInput.messages.map((m) => m.content).join('\n\n'),
        onDelta: () => {},
        timeoutMs: 30_000,
      });
      fullText = streamResult.fullText;
      // Wrap the completed text in a synthetic Response for consistent return type
      const encoder = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'response.output_text.delta', delta: fullText })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
    } catch {
      // Gemini overseer failed — fall back to gpt-5.4-nano via OpenAI Responses API
      const fallbackResult = await invokeOpenAIResponses(overseerInput, {
        model: env.geminiOverseerFallback,
        stream: true,
        store: false,
      });
      return fallbackResult as Response;
    }
  }

  // Core/Sovereign: use OpenAI Responses API with gpt-5.4
  const result = await invokeOpenAIResponses(overseerInput, {
    model: overseerModel,
    stream: true,
    store: false,
  });

  // When streaming, invokeOpenAIResponses returns a Response object
  return result as Response;
}

// ─── extractSystemContent ───────────────────────────────────────────────────

/**
 * Extract system message content, handling both string and array content parts.
 * Returns empty string if no system message is found.
 */
export function extractSystemContent(messages: ChatMessage[]): string {
  const sys = messages.find((m) => m.role === 'system');
  if (!sys) return '';
  if (typeof sys.content === 'string') return sys.content;
  if (Array.isArray(sys.content)) {
    return sys.content
      .filter((p: { type: string; text?: string }) => p.type === 'text')
      .map((p: { type: string; text?: string }) => p.text ?? '')
      .join('\n');
  }
  return '';
}

// ─── extractJsonFromPlainText ───────────────────────────────────────────────

/**
 * Extract JSON from plain text output.
 * 1. Tries fenced code blocks (```json ... ```)
 * 2. Falls back to balanced bracket extraction (not greedy regex)
 * 3. Returns null if no valid JSON found (does not throw)
 */
export function extractJsonFromPlainText(text: string): unknown | null {
  // 1. Try fenced code block first
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]!.trim());
    } catch {
      // fenced block wasn't valid JSON — fall through
    }
  }

  // 2. Balanced bracket extraction
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          // malformed JSON — continue scanning is unlikely to help
        }
      }
    }
  }

  return null;
}
