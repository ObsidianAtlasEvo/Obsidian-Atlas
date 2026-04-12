import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env.js';
import type { LlmRegistryEntry } from './llmRegistry.js';

export type UniversalMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type StreamDeltaHandler = (textDelta: string) => void;

function openAiStyleMessages(msgs: UniversalMessage[]): { role: string; content: string }[] {
  return msgs.map((m) => ({ role: m.role, content: m.content }));
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

function resolveOpenRouterAuth(): { base: string; apiKey: string } | null {
  const apiKey = env.openrouterApiKey?.trim();
  if (!apiKey) return null;
  const base = (env.openrouterBaseUrl?.trim() || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  return { base, apiKey };
}

function resolveOpenAiAuth(): { base: string; apiKey: string } | null {
  const apiKey = env.openaiApiKey?.trim();
  if (!apiKey) return null;
  const base = (env.openaiBaseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
  return { base, apiKey };
}

async function streamOpenAiCompatibleChat(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: UniversalMessage[];
  onDelta: StreamDeltaHandler;
  temperature?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  extraHeaders?: Record<string, string>;
}): Promise<{ fullText: string; model: string }> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: openAiStyleMessages(params.messages),
    temperature: params.temperature ?? 0.35,
    stream: true,
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

export async function streamGeminiChat(params: {
  model: string;
  messages: UniversalMessage[];
  onDelta: StreamDeltaHandler;
  temperature?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ fullText: string; model: string }> {
  const key = env.geminiApiKey?.trim();
  if (!key) throw new Error('GEMINI_API_KEY not configured');

  const first = params.messages[0];
  const system =
    first?.role === 'system'
      ? first.content
      : params.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = params.messages.filter((m) => m.role !== 'system');

  const ai = new GoogleGenAI({ apiKey: key });
  const contents = rest.map((m) => ({
    role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
    parts: [{ text: m.content }],
  }));

  const controller = new AbortController();
  const t = params.timeoutMs ? setTimeout(() => controller.abort(), params.timeoutMs) : undefined;
  let full = '';

  try {
    const stream = await ai.models.generateContentStream({
      model: params.model,
      contents,
      config: {
        systemInstruction: system || undefined,
        temperature: params.temperature ?? 0.35,
        abortSignal: params.signal ?? controller.signal,
      },
    });

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

  switch (entry.backend) {
    case 'groq': {
      const auth = resolveGroqAuth();
      if (!auth) {
        // Local-first fail-safe for dev environments without Groq keys.
        return streamOllamaChat({
          model: env.ollamaChatModel,
          messages,
          onDelta,
          signal,
          timeoutMs,
        });
      }
      const model = env.groqDelegateModel?.trim() || entry.apiModel;
      return streamOpenAiCompatibleChat({
        baseUrl: auth.base,
        apiKey: auth.apiKey,
        model,
        messages,
        onDelta,
        signal,
        timeoutMs,
      });
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
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ text: string; model: string }> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: openAiStyleMessages(params.messages),
    temperature: params.temperature ?? 0.25,
    stream: false,
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
  const auth = resolveGroqAuth();
  if (!auth) throw new Error('Groq credentials not configured');
  return completeOpenAiCompatibleChat({
    baseUrl: auth.base,
    apiKey: auth.apiKey,
    model: params.model,
    messages: params.messages,
    temperature: params.temperature,
    signal: params.signal,
    timeoutMs: params.timeoutMs,
  });
}

/** Non-streaming Gemini completion (consensus lane). */
export async function completeGeminiChat(params: {
  model: string;
  messages: UniversalMessage[];
  temperature?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ text: string; model: string }> {
  const key = env.geminiApiKey?.trim();
  if (!key) throw new Error('GEMINI_API_KEY not configured');

  const first = params.messages[0];
  const system =
    first?.role === 'system'
      ? first.content
      : params.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = params.messages.filter((m) => m.role !== 'system');

  const ai = new GoogleGenAI({ apiKey: key });
  const contents = rest.map((m) => ({
    role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
    parts: [{ text: m.content }],
  }));

  const controller = new AbortController();
  const t = params.timeoutMs ? setTimeout(() => controller.abort(), params.timeoutMs) : undefined;
  try {
    const response = await ai.models.generateContent({
      model: params.model,
      contents,
      config: {
        systemInstruction: system || undefined,
        temperature: params.temperature ?? 0.25,
        abortSignal: params.signal ?? controller.signal,
      },
    });
    const text = typeof response.text === 'string' ? response.text : '';
    return { text: text.trim(), model: params.model };
  } finally {
    if (t) clearTimeout(t);
  }
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
  const auth = resolveGroqAuth();
  if (!auth) throw new Error('Groq credentials not configured');
  return streamOpenAiCompatibleChat({
    baseUrl: auth.base,
    apiKey: auth.apiKey,
    model: params.model,
    messages: params.messages,
    onDelta: params.onDelta,
    temperature: params.temperature,
    signal: params.signal,
    timeoutMs: params.timeoutMs,
  });
}
