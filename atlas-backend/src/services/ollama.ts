import { request } from 'undici';
import { config } from '../config.js';

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
export function streamChat(
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
