import { request } from 'undici';
import { config } from '../config.js';
import { truncateForGroq } from './intelligence/universalAdapter.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface ChatChunk {
  model: string;
  created_at: string;
  message: { role: string; content: string };
  done: boolean;
  total_duration?: number;
  eval_count?: number;
  prompt_eval_count?: number;
}

export interface EmbeddingResponse {
  embedding: number[];
}

export class OllamaError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly category?: 'timeout' | 'network' | 'model' | 'server',
  ) {
    super(message);
    this.name = 'OllamaError';
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function categorizeError(
  err: unknown,
  statusCode?: number,
): OllamaError['category'] {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout';
    if (msg.includes('econnrefused') || msg.includes('network')) return 'network';
  }
  if (statusCode && statusCode >= 500) return 'server';
  if (statusCode === 404) return 'model';
  return 'network';
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 1,
  label = 'ollama',
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        // Brief pause before retry
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }
  throw lastErr instanceof OllamaError
    ? lastErr
    : new OllamaError(
        `${label} failed after ${retries + 1} attempts: ${String(lastErr)}`,
        undefined,
        categorizeError(lastErr),
      );
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Stream chat completions from Ollama.
 * Returns a ReadableStream that yields raw NDJSON lines (each a ChatChunk).
 */
function streamChatOllama(
  messages: ChatMessage[],
  options: ChatOptions = {},
): ReadableStream<string> {
  const {
    model = config.chatModel,
    temperature = 0.7,
    topP = 0.9,
    maxTokens,
    timeoutMs = config.requestTimeoutMs,
  } = options;

  const body = JSON.stringify({
    model,
    messages,
    stream: true,
    options: {
      temperature,
      top_p: topP,
      ...(maxTokens != null ? { num_predict: maxTokens } : {}),
    },
  });

  return new ReadableStream<string>({
    async start(controller) {
      let statusCode: number | undefined;
      try {
        const { statusCode: sc, body: responseBody } = await request(
          `${config.ollamaUrl}/api/chat`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            bodyTimeout: timeoutMs,
            headersTimeout: 10_000,
          },
        );

        statusCode = sc;

        if (sc !== 200) {
          const errText = await responseBody.text();
          controller.error(
            new OllamaError(
              `Ollama /api/chat returned ${sc}: ${errText}`,
              sc,
              categorizeError(null, sc),
            ),
          );
          return;
        }

        for await (const chunk of responseBody) {
          const text =
            chunk instanceof Buffer ? chunk.toString('utf8') : String(chunk);
          // A single chunk may contain multiple NDJSON lines
          const lines = text.split('\n').filter((l) => l.trim().length > 0);
          for (const line of lines) {
            controller.enqueue(line);
          }
        }

        controller.close();
      } catch (err) {
        controller.error(
          new OllamaError(
            `Stream error: ${String(err)}`,
            statusCode,
            categorizeError(err, statusCode),
          ),
        );
      }
    },
  });
}

/**
 * Non-streaming chat completion.
 * Returns the full assistant message content.
 */
export async function complete(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<string> {
  return withRetry(async () => {
    const {
      model = config.chatModel,
      temperature = 0.7,
      topP = 0.9,
      maxTokens,
      timeoutMs = config.requestTimeoutMs,
    } = options;

    const { statusCode, body } = await request(
      `${config.ollamaUrl}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: {
            temperature,
            top_p: topP,
            ...(maxTokens != null ? { num_predict: maxTokens } : {}),
          },
        }),
        bodyTimeout: timeoutMs,
        headersTimeout: 10_000,
      },
    );

    const text = await body.text();

    if (statusCode !== 200) {
      throw new OllamaError(
        `Ollama /api/chat returned ${statusCode}: ${text}`,
        statusCode,
        categorizeError(null, statusCode),
      );
    }

    const parsed = JSON.parse(text) as { message: { content: string } };
    return parsed.message.content;
  }, 1, 'complete');
}

/**
 * Generate an embedding vector for the given text.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  return withRetry(async () => {
    const { statusCode, body } = await request(
      `${config.ollamaUrl}/api/embeddings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: config.embedModel, prompt: text }),
        bodyTimeout: 30_000,
        headersTimeout: 10_000,
      },
    );

    const raw = await body.text();

    if (statusCode !== 200) {
      throw new OllamaError(
        `Ollama /api/embeddings returned ${statusCode}: ${raw}`,
        statusCode,
        categorizeError(null, statusCode),
      );
    }

    const parsed = JSON.parse(raw) as EmbeddingResponse;
    if (!Array.isArray(parsed.embedding) || parsed.embedding.length === 0) {
      throw new OllamaError('Empty embedding returned from Ollama', 200, 'model');
    }
    return parsed.embedding;
  }, 1, 'generateEmbedding');
}

/**
 * Check if Ollama is reachable by hitting /api/tags.
 */
export async function ping(): Promise<boolean> {
  try {
    const { statusCode } = await request(`${config.ollamaUrl}/api/tags`, {
      method: 'GET',
      headersTimeout: 5_000,
      bodyTimeout: 5_000,
    });
    return statusCode === 200;
  } catch {
    return false;
  }
}

// ── Groq fallback (when GROQ_API_KEY is set and Ollama is unavailable) ─────

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? '';
const GROQ_BASE_URL = process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1';
const GROQ_MODEL = process.env.GROQ_DELEGATE_MODEL ?? 'llama-3.3-70b-versatile';
const USE_GROQ = GROQ_API_KEY.length > 0 && (process.env.DISABLE_LOCAL_OLLAMA === 'true');

function streamChatGroq(
  messages: ChatMessage[],
  options: ChatOptions = {},
): ReadableStream<string> {
  const {
    temperature = 0.7,
    timeoutMs = 60_000,
  } = options;

  return new ReadableStream<string>({
    async start(controller) {
      try {
        const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: GROQ_MODEL,
            messages: truncateForGroq(messages).map(m => ({ role: m.role, content: m.content })),
            temperature,
            stream: true,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!res.ok) {
          const errText = await res.text();
          controller.error(new OllamaError(`Groq returned ${res.status}: ${errText}`, res.status, 'server'));
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) { controller.error(new OllamaError('No response body', undefined, 'server')); return; }

        const decoder = new TextDecoder();
        let buffer = '';
        let totalContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            if (!trimmed.startsWith('data: ')) continue;

            try {
              const json = JSON.parse(trimmed.slice(6));
              const delta = json.choices?.[0]?.delta?.content ?? '';
              if (delta) {
                totalContent += delta;
                // Emit in Ollama NDJSON format so the rest of the code works unchanged
                controller.enqueue(JSON.stringify({
                  model: GROQ_MODEL,
                  message: { role: 'assistant', content: delta },
                  done: false,
                }));
              }
            } catch { /* skip malformed lines */ }
          }
        }

        // Emit final done message in Ollama format
        controller.enqueue(JSON.stringify({
          model: GROQ_MODEL,
          message: { role: 'assistant', content: '' },
          done: true,
          eval_count: totalContent.split(/\s+/).length * 2,
          total_duration: 0,
        }));

        controller.close();
      } catch (err) {
        controller.error(new OllamaError(`Groq stream error: ${String(err)}`, undefined, 'network'));
      }
    },
  });
}

// ── Unified streamChat — routes to Groq or Ollama based on config ──────────

export function streamChat(
  messages: ChatMessage[],
  options: ChatOptions = {},
): ReadableStream<string> {
  if (USE_GROQ) {
    return streamChatGroq(messages, options);
  }
  return streamChatOllama(messages, options);
}
