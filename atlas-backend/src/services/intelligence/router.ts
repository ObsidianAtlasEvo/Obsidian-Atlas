import { env } from '../../config/env.js';
import { getFailureModeDoctrine } from '../../resilience/failureModeDoctrine.js';
import type { GenerateInput, GenerateOutput, ModelProvider } from '../model/modelProvider.js';
import { createOllamaModelProvider } from '../model/ollamaClient.js';
import type { IntelligenceSurface, RoutedGenerateInput, StreamChunk } from './types.js';

/** Server-only sovereign operator identity; normalized before compare. */
export const SOVEREIGN_OWNER_EMAIL_RAW = 'crowleyrc62@gmail.com';

const SOVEREIGN_OWNER_EMAIL_NORMALIZED = normalizeEmail(SOVEREIGN_OWNER_EMAIL_RAW);

export function normalizeEmail(email: string | null | undefined): string | null {
  if (email == null || typeof email !== 'string') return null;
  const t = email.trim().toLowerCase();
  return t.length ? t : null;
}

/** Ollama HTTP API path (handles `OLLAMA_BASE_URL` with or without trailing `/api`). */
function ollamaApiUrl(path: string): string {
  const base = env.ollamaBaseUrl.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return base.endsWith('/api') ? `${base}${p}` : `${base}/api${p}`;
}

export function isSovereignOwnerEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email) === SOVEREIGN_OWNER_EMAIL_NORMALIZED;
}

let ollamaReachableCache: { at: number; ok: boolean } | null = null;
const OLLAMA_HEALTH_TTL_MS = 5000;

export async function isLocalOllamaReachable(signal?: AbortSignal): Promise<boolean> {
  const now = Date.now();
  if (ollamaReachableCache && now - ollamaReachableCache.at < OLLAMA_HEALTH_TTL_MS) {
    return ollamaReachableCache.ok;
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(ollamaApiUrl('/tags'), {
      method: 'GET',
      signal: signal ?? controller.signal,
    });
    const ok = res.ok;
    ollamaReachableCache = { at: Date.now(), ok };
    return ok;
  } catch {
    ollamaReachableCache = { at: Date.now(), ok: false };
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * True when this request should hit the local GPU/Ollama path (subject to runtime health — router applies fallback).
 * For queue serialization: only local inference should use {@link enqueueGpuTask}.
 */
export async function shouldUseLocalOllamaCompute(userEmail: string | null | undefined): Promise<boolean> {
  if (!isSovereignOwnerEmail(userEmail)) return false;
  return isLocalOllamaReachable();
}

function toOllamaMessages(input: RoutedGenerateInput): { role: string; content: string }[] {
  const msgs: { role: string; content: string }[] = [];
  if (input.systemPrompt?.trim()) {
    msgs.push({ role: 'system', content: input.systemPrompt.trim() });
  }
  for (const m of input.messages) {
    msgs.push({ role: m.role, content: m.content });
  }
  return msgs;
}

function toOpenAiMessages(input: RoutedGenerateInput): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const msgs: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
  if (input.systemPrompt?.trim()) {
    msgs.push({ role: 'system', content: input.systemPrompt.trim() });
  }
  for (const m of input.messages) {
    msgs.push({ role: m.role, content: m.content });
  }
  return msgs;
}

function assertCloudConfigured(): { base: string; apiKey: string; model: string } {
  const base = env.cloudOpenAiBaseUrl?.replace(/\/$/, '') ?? '';
  const apiKey = env.cloudOpenAiApiKey?.trim() ?? '';
  const model = env.cloudChatModel?.trim() ?? '';
  if (!base || !apiKey || !model) {
    throw new Error(
      'Cloud inference is required but ATLAS_CLOUD_OPENAI_BASE_URL, ATLAS_CLOUD_OPENAI_API_KEY, and ATLAS_CLOUD_CHAT_MODEL are not all set'
    );
  }
  return { base, apiKey, model };
}

async function postJsonCloud(
  url: string,
  apiKey: string,
  body: unknown,
  signal?: AbortSignal
): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  const rawText = await res.text();
  let data: unknown;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    throw new Error(`Cloud chat returned non-JSON (${res.status}): ${rawText.slice(0, 200)}`);
  }
  if (!res.ok) {
    const detail =
      typeof data === 'object' && data !== null && 'error' in data
        ? JSON.stringify((data as { error?: unknown }).error).slice(0, 400)
        : rawText.slice(0, 300);
    throw new Error(`Cloud chat failed (${res.status}): ${detail}`);
  }
  return data;
}

function extractOpenAiNonStreamText(data: unknown): { text: string; model: string; pt?: number; ct?: number } {
  if (typeof data !== 'object' || data === null) throw new Error('Cloud: expected JSON object');
  const d = data as Record<string, unknown>;
  const choices = d.choices;
  if (!Array.isArray(choices) || choices.length === 0) throw new Error('Cloud: missing choices[0]');
  const c0 = choices[0];
  if (typeof c0 !== 'object' || c0 === null) throw new Error('Cloud: invalid choice');
  const msg = (c0 as Record<string, unknown>).message;
  if (typeof msg !== 'object' || msg === null) throw new Error('Cloud: missing message');
  const content = (msg as Record<string, unknown>).content;
  const text = typeof content === 'string' ? content : '';
  const model = typeof d.model === 'string' ? d.model : 'cloud';
  const usage = d.usage;
  let pt: number | undefined;
  let ct: number | undefined;
  if (typeof usage === 'object' && usage !== null) {
    const u = usage as Record<string, unknown>;
    if (typeof u.prompt_tokens === 'number') pt = u.prompt_tokens;
    if (typeof u.completion_tokens === 'number') ct = u.completion_tokens;
  }
  return { text: text.trim(), model, pt, ct };
}

/** Local Ollama `/api/chat` — same contract as cloud for Action Modules. */
export class LocalOllamaAdapter implements IntelligenceSurface {
  readonly surfaceId = 'local-ollama' as const;
  private readonly inner = createOllamaModelProvider();

  async generateStructured(input: RoutedGenerateInput): Promise<GenerateOutput> {
    return this.inner.generate({
      userId: input.userId,
      messages: toOllamaMessages(input).map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
      systemPrompt: undefined,
      jsonMode: input.jsonMode,
      temperature: input.temperature,
      modelOverride: input.modelOverride,
      timeoutMs: input.timeoutMs,
    });
  }

  async generateStreaming(
    input: RoutedGenerateInput,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<GenerateOutput> {
    const model = input.modelOverride?.trim() || env.ollamaChatModel;
    const msgs = toOllamaMessages(input);
    const body: Record<string, unknown> = {
      model,
      messages: msgs,
      stream: true,
      options: { temperature: input.temperature ?? 0.35 },
    };
    if (input.jsonMode) body.format = 'json';

    const controller = new AbortController();
    const timeout = input.timeoutMs ? setTimeout(() => controller.abort(), input.timeoutMs) : undefined;
    let full = '';
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;

    try {
      const res = await fetch(`${env.ollamaBaseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: input.signal ?? controller.signal,
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Ollama stream failed (${res.status}): ${t.slice(0, 200)}`);
      }
      if (!res.body) throw new Error('Ollama stream: missing body');

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
          if (typeof data.prompt_eval_count === 'number') promptTokens = data.prompt_eval_count;
          if (typeof data.eval_count === 'number') completionTokens = data.eval_count;
          const message = data.message;
          if (typeof message === 'object' && message !== null && 'content' in message) {
            const piece = (message as { content?: unknown }).content;
            if (typeof piece === 'string' && piece.length) {
              full += piece;
              onChunk({ textDelta: piece, done: false });
            }
          }
          if (data.done === true) {
            onChunk({ textDelta: '', done: true });
          }
        }
      }
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    return {
      text: full.trim(),
      model,
      promptTokens,
      completionTokens,
    };
  }
}

/** OpenAI-compatible chat completions (Groq, OpenRouter, vLLM, etc.). */
export class CloudOpenAiCompatibleAdapter implements IntelligenceSurface {
  readonly surfaceId = 'cloud-openai-compatible' as const;

  async generateStructured(input: RoutedGenerateInput): Promise<GenerateOutput> {
    const { base, apiKey, model: defaultModel } = assertCloudConfigured();
    const model = input.modelOverride?.trim() || defaultModel;
    const body: Record<string, unknown> = {
      model,
      messages: toOpenAiMessages(input),
      temperature: input.temperature ?? 0.35,
      stream: false,
    };
    if (input.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const controller = new AbortController();
    const timeout = input.timeoutMs ? setTimeout(() => controller.abort(), input.timeoutMs) : undefined;
    try {
      const data = await postJsonCloud(
        `${base}/chat/completions`,
        apiKey,
        body,
        input.signal ?? controller.signal
      );
      const { text, model: mId, pt, ct } = extractOpenAiNonStreamText(data);
      return { text, model: mId, promptTokens: pt, completionTokens: ct };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async generateStreaming(
    input: RoutedGenerateInput,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<GenerateOutput> {
    const { base, apiKey, model: defaultModel } = assertCloudConfigured();
    const model = input.modelOverride?.trim() || defaultModel;
    const body: Record<string, unknown> = {
      model,
      messages: toOpenAiMessages(input),
      temperature: input.temperature ?? 0.35,
      stream: true,
    };
    if (input.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const controller = new AbortController();
    const timeout = input.timeoutMs ? setTimeout(() => controller.abort(), input.timeoutMs) : undefined;
    let full = '';
    let pt: number | undefined;
    let ct: number | undefined;

    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: input.signal ?? controller.signal,
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Cloud stream failed (${res.status}): ${t.slice(0, 200)}`);
      }
      if (!res.body) throw new Error('Cloud stream: missing body');

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
          const lines = block.split('\n').map((l) => l.trim());
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') {
              onChunk({ textDelta: '', done: true });
              continue;
            }
            let data: Record<string, unknown>;
            try {
              data = JSON.parse(payload) as Record<string, unknown>;
            } catch {
              continue;
            }
            const usage = data.usage;
            if (typeof usage === 'object' && usage !== null) {
              const u = usage as Record<string, unknown>;
              if (typeof u.prompt_tokens === 'number') pt = u.prompt_tokens;
              if (typeof u.completion_tokens === 'number') ct = u.completion_tokens;
            }
            const choices = data.choices;
            if (!Array.isArray(choices) || !choices[0]) continue;
            const ch = choices[0] as Record<string, unknown>;
            const delta = ch.delta;
            if (typeof delta === 'object' && delta !== null && 'content' in delta) {
              const piece = (delta as { content?: unknown }).content;
              if (typeof piece === 'string' && piece.length) {
                full += piece;
                onChunk({ textDelta: piece, done: false });
              }
            }
            if (ch.finish_reason != null) {
              onChunk({ textDelta: '', done: true });
            }
          }
        }
      }
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    return {
      text: full.trim(),
      model,
      promptTokens: pt,
      completionTokens: ct,
    };
  }
}

export class IntelligenceRouter {
  constructor(
    private readonly local: LocalOllamaAdapter,
    private readonly cloud: CloudOpenAiCompatibleAdapter
  ) {}

  /**
   * Owner + healthy Ollama → local first; on transport/model failure, invalidate health cache and fall through to cloud.
   * Non-owner → cloud.
   */
  async generateStructured(input: RoutedGenerateInput): Promise<GenerateOutput> {
    const doctrine = getFailureModeDoctrine();
    if (isSovereignOwnerEmail(input.userEmail) && (await isLocalOllamaReachable(input.signal))) {
      try {
        return await this.local.generateStructured(input);
      } catch {
        ollamaReachableCache = { at: Date.now(), ok: false };
      }
    }
    return doctrine.withFallback(
      'groq_api',
      () => this.cloud.generateStructured(input),
      async () => ({
        text:
          'Atlas cloud inference is temporarily unavailable. Please try again in a few minutes.',
        model: 'atlas_cloud_fallback',
      }),
      { userId: input.userId },
    );
  }

  async generateStreaming(
    input: RoutedGenerateInput,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<GenerateOutput> {
    if (isSovereignOwnerEmail(input.userEmail) && (await isLocalOllamaReachable(input.signal))) {
      try {
        return await this.local.generateStreaming(input, onChunk);
      } catch {
        ollamaReachableCache = { at: Date.now(), ok: false };
      }
    }
    return this.cloud.generateStreaming(input, onChunk);
  }
}

let singletonRouter: IntelligenceRouter | null = null;

export function getIntelligenceRouter(): IntelligenceRouter {
  if (!singletonRouter) {
    singletonRouter = new IntelligenceRouter(new LocalOllamaAdapter(), new CloudOpenAiCompatibleAdapter());
  }
  return singletonRouter;
}

/**
 * Evolution / background jobs: `generate` follows the same routing as the user's chat; `embed` stays on local Ollama
 * until a dimension-matched cloud embed path exists for public tenants.
 */
export function createRoutedEvolutionModelProvider(
  userEmail: string | null | undefined,
  tenantUserId: string,
  router: IntelligenceRouter = getIntelligenceRouter()
): ModelProvider {
  const local = createOllamaModelProvider();
  return {
    async generate(input: GenerateInput): Promise<GenerateOutput> {
      const messages = input.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const extraSystem = input.messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content.trim())
        .filter(Boolean)
        .join('\n\n');

      const systemPrompt = [input.systemPrompt?.trim(), extraSystem].filter(Boolean).join('\n\n');

      return router.generateStructured({
        userId: tenantUserId,
        userEmail,
        messages,
        systemPrompt,
        jsonMode: input.jsonMode,
        temperature: input.temperature,
        modelOverride: input.modelOverride,
        timeoutMs: input.timeoutMs,
      });
    },
    embed: (inp) => local.embed(inp),
  };
}
