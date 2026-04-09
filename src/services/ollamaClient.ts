/**
 * Local Ollama client: chat (incl. streaming), embeddings, JSON mode, long timeouts for large local models (e.g. llama3.1:70b).
 * Default chat URL is same-origin `/ollama/api/chat` (Vite proxy → Ollama) to avoid mixed content over HTTPS (e.g. Cloudflare Tunnel).
 */

import { buildAtlasSystemPrompt } from './atlasSystemPrompt';
import type {
  LocalOllamaClient,
  OllamaChatOptions,
  OllamaCompleteOptions,
  OllamaMessage,
  OllamaStreamChunk,
} from './ollamaContract';

export type {
  LocalOllamaClient,
  OllamaChatOptions,
  OllamaMessage,
  OllamaRole,
  OllamaStreamChunk,
  OllamaCompleteOptions,
} from './ollamaContract';

function getChatUrl(): string {
  const u = process.env.OLLAMA_CHAT_URL;
  if (u && u.length > 0) return u;
  return 'http://localhost:11434/api/chat';
}

function getEmbedUrl(): string {
  const chatUrl = getChatUrl();
  if (/\/api\/chat\/?$/i.test(chatUrl)) {
    return chatUrl.replace(/\/api\/chat\/?$/i, '/api/embed');
  }
  const base = getOllamaBaseUrl();
  return `${base}/api/embed`;
}

function getOllamaBaseUrl(): string {
  const chatUrl = getChatUrl();
  let base = chatUrl.replace(/\/api\/chat\/?$/i, '').trim();
  if (!base) base = '/ollama';
  return base.replace(/\/$/, '');
}

function requestTimeoutMs(): number {
  const raw = process.env.OLLAMA_REQUEST_TIMEOUT_MS;
  const n = raw ? parseInt(raw, 10) : 1_200_000;
  return Number.isFinite(n) && n > 0 ? n : 1_200_000;
}

let cachedResolvedModel: string | null = null;

function modelConfigError(detail: string): Error {
  return new Error(
    `${detail}\n\n` +
      'Set OLLAMA_MODEL in .env.local to a name from `ollama list`, then restart the dev server.'
  );
}

async function resolveOllamaModel(): Promise<string> {
  const fromEnv = process.env.OLLAMA_MODEL?.trim();
  if (fromEnv) return fromEnv;
  if (cachedResolvedModel) return cachedResolvedModel;

  const base = getOllamaBaseUrl();
  let res: Response;
  try {
    res = await fetch(`${base}/api/tags`);
  } catch {
    throw modelConfigError(
      `Could not reach Ollama at ${base}/api/tags. Is Ollama running? If you use a custom URL, set OLLAMA_CHAT_URL in .env.local.`
    );
  }

  if (!res.ok) {
    throw modelConfigError(`Ollama returned ${res.status} from /api/tags. Check OLLAMA_CHAT_URL and that Ollama is running.`);
  }

  const data = (await res.json()) as { models?: { name: string }[] };
  const names = (data.models ?? []).map((m) => m.name).filter(Boolean);

  if (names.length === 0) {
    throw modelConfigError('No models are installed. Run `ollama pull <model>` or create one from a Modelfile.');
  }

  if (names.length > 1) {
    throw modelConfigError(
      `Multiple models are installed: ${names.join(', ')}. Pick one and set OLLAMA_MODEL in .env.local.`
    );
  }

  cachedResolvedModel = names[0];
  return cachedResolvedModel;
}

function resolveEmbedModel(): string {
  const fromEnv = process.env.OLLAMA_EMBED_MODEL?.trim();
  if (fromEnv) return fromEnv;
  return 'nomic-embed-text';
}

function formatOllamaError(status: number, errBody: string, model: string): string {
  const base = `Ollama request failed (${status}): ${errBody || '(no body)'}`;
  if (status === 404 && /model.*not found/i.test(errBody)) {
    return (
      `${base}\n\n` +
      `Model "${model}" is not installed. Run \`ollama list\`, then set OLLAMA_MODEL / OLLAMA_EMBED_MODEL in .env.local or \`ollama pull <name>\`.`
    );
  }
  return base;
}

function injectAtlasIdentityMessages(messages: OllamaMessage[], skip?: boolean): OllamaMessage[] {
  if (skip) return messages;
  const soul = buildAtlasSystemPrompt();
  const out = [...messages];
  if (out.length > 0 && out[0]?.role === 'system') {
    out[0] = { role: 'system', content: `${soul}\n\n---\n\n${out[0].content}` };
  } else {
    out.unshift({ role: 'system', content: soul });
  }
  return out;
}

function mergeAbortSignals(user?: AbortSignal): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const cancel = (): void => {
    controller.abort();
  };
  const t = window.setTimeout(() => controller.abort(new DOMException('Ollama request timed out', 'TimeoutError')), requestTimeoutMs());
  const onAbort = (): void => {
    controller.abort(user?.reason);
  };
  user?.addEventListener('abort', onAbort, { once: true });
  const cleanup = (): void => {
    window.clearTimeout(t);
    user?.removeEventListener('abort', onAbort);
  };
  controller.signal.addEventListener('abort', cleanup, { once: true });
  return { signal: controller.signal, cancel };
}

async function maybeTrace(userId: string, channel: string, role: 'user' | 'assistant', content: string): Promise<void> {
  try {
    const { appendConversationTrace } = await import('./firebase');
    await appendConversationTrace({ userId, channel, role, content });
  } catch {
    /* non-fatal */
  }
}

export async function ollamaChat(options: OllamaChatOptions): Promise<string> {
  const url = getChatUrl();
  const model = await resolveOllamaModel();
  const messages = injectAtlasIdentityMessages(options.messages, options.injectAtlasIdentity === false);
  const { signal, cancel } = mergeAbortSignals(options.signal);

  if (options.trace) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      void maybeTrace(options.trace.userId, options.trace.channel, 'user', lastUser.content);
    }
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...(options.json ? { format: 'json' } : {}),
      }),
      signal,
    });
  } catch (e) {
    cancel();
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error(
        'Ollama request aborted or timed out. Large models (e.g. 70B) can take many minutes — increase OLLAMA_REQUEST_TIMEOUT_MS if needed.'
      );
    }
    throw e;
  } finally {
    cancel();
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(formatOllamaError(res.status, errText, model));
  }

  const data = (await res.json()) as { message?: { content?: string } };
  const text = data.message?.content ?? '';

  if (options.trace) {
    void maybeTrace(options.trace.userId, options.trace.channel, 'assistant', text);
  }

  return text;
}

/**
 * Streaming chat (NDJSON). Yields incremental assistant content. Same identity injection as `ollamaChat`.
 */
export async function ollamaChatStream(
  options: OllamaChatOptions,
  onChunk?: (chunk: OllamaStreamChunk) => void
): Promise<string> {
  const url = getChatUrl();
  const model = await resolveOllamaModel();
  const messages = injectAtlasIdentityMessages(options.messages, options.injectAtlasIdentity === false);
  const { signal, cancel } = mergeAbortSignals(options.signal);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      ...(options.json ? { format: 'json' } : {}),
    }),
    signal,
  }).finally(() => cancel());

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(formatOllamaError(res.status, errText, model));
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error('Ollama streaming response had no body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed) as { message?: { content?: string }; done?: boolean };
        const delta = obj.message?.content ?? '';
        if (delta) {
          full += delta;
          onChunk?.({ contentDelta: delta, done: false });
        }
        if (obj.done) {
          onChunk?.({ contentDelta: '', done: true });
        }
      } catch {
        /* ignore partial JSON lines */
      }
    }
  }

  if (options.trace) {
    void maybeTrace(options.trace.userId, options.trace.channel, 'assistant', full);
  }

  return full;
}

export async function ollamaComplete(
  userContent: string,
  opts?: OllamaCompleteOptions
): Promise<string> {
  const messages: OllamaMessage[] = [];
  if (opts?.system) {
    messages.push({ role: 'system', content: opts.system });
  }
  messages.push({ role: 'user', content: userContent });
  return ollamaChat({
    messages,
    json: opts?.json,
    signal: opts?.signal,
    injectAtlasIdentity: opts?.injectAtlasIdentity,
    trace: opts?.trace,
  });
}

export async function ollamaEmbed(
  input: string | string[],
  opts?: { signal?: AbortSignal }
): Promise<number[][]> {
  const url = getEmbedUrl();
  const model = resolveEmbedModel();
  const { signal, cancel } = mergeAbortSignals(opts?.signal);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input }),
      signal,
    });
  } finally {
    cancel();
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(formatOllamaError(res.status, errText, model));
  }

  const data = (await res.json()) as { embeddings?: number[][]; embedding?: number[] };
  if (data.embeddings?.length) {
    return data.embeddings;
  }
  if (data.embedding) {
    return [data.embedding];
  }
  throw new Error('Ollama embed response missing embeddings');
}

export function parseJsonFromAssistant<T = unknown>(raw: string): T {
  const trimmed = raw.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  const jsonStr = (fence ? fence[1] : trimmed).trim();
  return JSON.parse(jsonStr) as T;
}

/** Default implementation of {@link LocalOllamaClient} for DI / testing. */
export const localOllama: LocalOllamaClient = {
  chat: ollamaChat,
  chatStream: ollamaChatStream,
  complete: ollamaComplete,
  embed: ollamaEmbed,
  parseJsonFromAssistant,
};
