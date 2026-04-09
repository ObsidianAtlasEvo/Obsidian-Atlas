/**
 * Ollama streaming client.
 * Sends requests to the local LLM via the Vite proxy at /ollama/api/chat.
 * Handles NDJSON streaming, abort control, and error categorization.
 */

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaStreamChunk {
  model: string;
  created_at: string;
  message: { role: string; content: string };
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  eval_count?: number;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (fullText: string, metrics?: { tokens: number; duration: number }) => void;
  onError: (err: OllamaError) => void;
}

export class OllamaError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NETWORK'
      | 'TIMEOUT'
      | 'MODEL_NOT_FOUND'
      | 'SERVER_ERROR'
      | 'ABORTED'
      | 'PARSE_ERROR' = 'NETWORK'
  ) {
    super(message);
    this.name = 'OllamaError';
  }
}

const CHAT_URL = process.env.OLLAMA_CHAT_URL ?? '/ollama/api/chat';
const MODEL = process.env.OLLAMA_MODEL ?? 'llama3.1:70b';
const TIMEOUT_MS = Number(process.env.OLLAMA_REQUEST_TIMEOUT_MS ?? 120_000);

/**
 * Stream a chat completion from Ollama.
 * Returns an AbortController you can call .abort() on to cancel.
 */
export function streamChat(
  messages: OllamaMessage[],
  callbacks: StreamCallbacks,
  options?: { model?: string; temperature?: number }
): AbortController {
  const controller = new AbortController();
  const { signal } = controller;

  const timeoutId = setTimeout(() => {
    controller.abort();
    callbacks.onError(new OllamaError('Request timed out', 'TIMEOUT'));
  }, TIMEOUT_MS);

  void (async () => {
    let accumulated = '';

    try {
      const res = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options?.model ?? MODEL,
          messages,
          stream: true,
          options: {
            temperature: options?.temperature ?? 0.7,
            num_ctx: 8192,
          },
        }),
        signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        if (res.status === 404) {
          throw new OllamaError(`Model '${MODEL}' not found. Run: ollama pull ${MODEL}`, 'MODEL_NOT_FOUND');
        }
        throw new OllamaError(`Server returned ${res.status}: ${res.statusText}`, 'SERVER_ERROR');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new OllamaError('No response body', 'SERVER_ERROR');

      const decoder = new TextDecoder();
      let buffer = '';
      let totalTokens = 0;
      let totalDuration = 0;

      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let chunk: OllamaStreamChunk;
          try {
            chunk = JSON.parse(trimmed) as OllamaStreamChunk;
          } catch {
            throw new OllamaError(`Failed to parse response: ${trimmed}`, 'PARSE_ERROR');
          }

          if (chunk.message?.content) {
            accumulated += chunk.message.content;
            callbacks.onToken(chunk.message.content);
          }

          if (chunk.done) {
            if (chunk.eval_count) totalTokens = chunk.eval_count;
            if (chunk.total_duration) totalDuration = chunk.total_duration / 1e6; // ns → ms
          }
        }
      }

      callbacks.onDone(accumulated, {
        tokens: totalTokens,
        duration: totalDuration,
      });
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof OllamaError) {
        callbacks.onError(err);
        return;
      }

      if (err instanceof DOMException && err.name === 'AbortError') {
        callbacks.onError(new OllamaError('Request was cancelled', 'ABORTED'));
        return;
      }

      const message = err instanceof Error ? err.message : String(err);
      const isNetwork =
        message.includes('fetch') ||
        message.includes('network') ||
        message.includes('ECONNREFUSED');
      callbacks.onError(
        new OllamaError(
          isNetwork
            ? 'Cannot reach Ollama. Is it running? (ollama serve)'
            : message,
          isNetwork ? 'NETWORK' : 'SERVER_ERROR'
        )
      );
    }
  })();

  return controller;
}

/**
 * Non-streaming single completion — for background analysis tasks.
 */
export async function complete(
  messages: OllamaMessage[],
  options?: { model?: string; temperature?: number; signal?: AbortSignal }
): Promise<string> {
  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options?.model ?? MODEL,
      messages,
      stream: false,
      options: { temperature: options?.temperature ?? 0.3 },
    }),
    signal: options?.signal,
  });

  if (!res.ok) {
    throw new OllamaError(`Server error ${res.status}`, 'SERVER_ERROR');
  }

  const data = (await res.json()) as { message: { content: string } };
  return data.message.content;
}

/**
 * Generate an embedding vector. Uses the embedding model from env.
 */
export async function embed(text: string): Promise<number[]> {
  const model = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';
  const res = await fetch('/ollama/api/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: text }),
  });

  if (!res.ok) throw new OllamaError(`Embedding error: ${res.status}`, 'SERVER_ERROR');
  const data = (await res.json()) as { embedding: number[] };
  return data.embedding;
}

/**
 * Check if Ollama is reachable and the model is available.
 */
export async function healthCheck(): Promise<{
  reachable: boolean;
  modelAvailable: boolean;
  model: string;
  error?: string;
}> {
  const model = MODEL;
  try {
    const tagsRes = await fetch('/ollama/api/tags', { signal: AbortSignal.timeout(5000) });
    if (!tagsRes.ok) return { reachable: false, modelAvailable: false, model, error: `Status ${tagsRes.status}` };

    const data = (await tagsRes.json()) as { models: { name: string }[] };
    const modelAvailable = data.models.some(
      (m) => m.name === model || m.name.startsWith(model.split(':')[0])
    );
    return { reachable: true, modelAvailable, model };
  } catch (err) {
    return {
      reachable: false,
      modelAvailable: false,
      model,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
