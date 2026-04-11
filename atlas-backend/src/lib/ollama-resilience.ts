/**
 * ollama-resilience.ts
 * ===========================================================================
 * Drop-in wrapper around Ollama API calls with automatic Groq fallback.
 *
 * How it works
 * ------------
 * 1. Before every Ollama request, a lightweight health-check hits
 *    OLLAMA_URL/api/tags (the cheapest endpoint that proves Ollama is alive).
 * 2. The result is cached for OLLAMA_HEALTH_CACHE_TTL_MS (default 60 s) so
 *    every chat message doesn't add a round-trip when Ollama is known-offline.
 * 3. If Ollama is healthy → route to Ollama.
 *    If Ollama is offline / times out → fall back to Groq silently, logging
 *    "[OLLAMA OFFLINE] Falling back to Groq" to stderr.
 * 4. The exported `isOllamaOnline()` helper lets the frontend status indicator
 *    show whether local inference is available.
 *
 * Usage
 * -----
 * Replace direct Ollama SDK calls with:
 *
 *   import { ollamaWithFallback } from './ollama-resilience';
 *
 *   const stream = await ollamaWithFallback(ollamaParams, groqFallbackFn);
 *
 * Configuration (via environment variables)
 * -----------------------------------------
 *   OLLAMA_URL                   Base URL of Ollama  (default: http://localhost:11434)
 *   OLLAMA_HEALTH_TIMEOUT_MS     Connect timeout for health check  (default: 2000 ms)
 *   OLLAMA_HEALTH_CACHE_TTL_MS   How long to cache the health result (default: 60000 ms)
 * ===========================================================================
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parameters forwarded verbatim to the Ollama /api/chat or /api/generate endpoint. */
export interface OllamaRequestParams {
  /** Ollama model name, e.g. "llama3.2:3b" */
  model: string;
  /** Full messages array (OpenAI-compatible format) */
  messages: Array<{ role: string; content: string }>;
  /** Whether to stream the response */
  stream?: boolean;
  /** Any extra Ollama options (temperature, seed, …) */
  options?: Record<string, unknown>;
  /** Raw body to POST if you want full control */
  rawBody?: Record<string, unknown>;
}

/** A function that performs a Groq completion and returns the same shape as the Ollama path. */
export type GroqFallbackFn = (
  params: OllamaRequestParams
) => Promise<ReadableStream<Uint8Array> | string>;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const OLLAMA_URL: string =
  process.env.OLLAMA_URL?.replace(/\/$/, '') ?? 'http://localhost:11434';

const HEALTH_TIMEOUT_MS: number = parseInt(
  process.env.OLLAMA_HEALTH_TIMEOUT_MS ?? '2000',
  10
);

const HEALTH_CACHE_TTL_MS: number = parseInt(
  process.env.OLLAMA_HEALTH_CACHE_TTL_MS ?? '60000',
  10
);

// ---------------------------------------------------------------------------
// Health-check cache
// ---------------------------------------------------------------------------

interface HealthCacheEntry {
  online: boolean;
  expiresAt: number; // Date.now() + TTL
}

let _healthCache: HealthCacheEntry | null = null;

/**
 * Performs (or returns a cached result of) a lightweight health check against
 * the configured Ollama instance.
 *
 * Uses AbortController for a hard timeout — Node's built-in fetch doesn't
 * respect socket-level timeouts without this.
 */
async function checkOllamaHealth(): Promise<boolean> {
  const now = Date.now();

  // Return cached result if still fresh
  if (_healthCache !== null && now < _healthCache.expiresAt) {
    return _healthCache.online;
  }

  let online = false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timer);
    online = res.ok;
  } catch {
    // Network error, ECONNREFUSED, or AbortError — all mean "offline"
    online = false;
  }

  _healthCache = { online, expiresAt: now + HEALTH_CACHE_TTL_MS };
  return online;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns `true` if Ollama is reachable (uses the same cached check).
 * Intended for use by the frontend status endpoint.
 *
 * @example
 * // In your Fastify route:
 * app.get('/api/status', async (req, reply) => {
 *   const ollamaOnline = await isOllamaOnline();
 *   return { ollama: ollamaOnline, groq: !!process.env.GROQ_API_KEY };
 * });
 */
export async function isOllamaOnline(): Promise<boolean> {
  return checkOllamaHealth();
}

/**
 * Invalidates the health-check cache immediately.
 * Call this if you know the Ollama state has changed (e.g. after a restart).
 */
export function invalidateOllamaHealthCache(): void {
  _healthCache = null;
}

/**
 * Routes an LLM request to Ollama when available, otherwise falls back to Groq.
 *
 * @param params     - Ollama-shaped request parameters
 * @param groqFallback - Your existing Groq client function; receives the same params
 * @returns          A ReadableStream (streaming) or string (non-streaming)
 *
 * @example
 * const result = await ollamaWithFallback(
 *   { model: 'llama3.2:3b', messages, stream: true },
 *   (p) => groqClient.chat(p)
 * );
 */
export async function ollamaWithFallback(
  params: OllamaRequestParams,
  groqFallback: GroqFallbackFn
): Promise<ReadableStream<Uint8Array> | string> {
  const ollamaAvailable = await checkOllamaHealth();

  if (!ollamaAvailable) {
    console.error(
      `[OLLAMA OFFLINE] Falling back to Groq` +
        ` (model requested: ${params.model}, OLLAMA_URL: ${OLLAMA_URL})`
    );
    return groqFallback(params);
  }

  // Ollama is online — forward the request
  try {
    return await callOllama(params);
  } catch (err) {
    // Ollama answered the health check but the actual request failed
    // (e.g. model not loaded, OOM, CUDA error). Fall back rather than crash.
    console.error(
      `[OLLAMA ERROR] Request failed, falling back to Groq. Reason:`,
      err instanceof Error ? err.message : err
    );
    // Bust the cache so the next request re-probes instead of assuming online
    invalidateOllamaHealthCache();
    return groqFallback(params);
  }
}

// ---------------------------------------------------------------------------
// Internal: raw Ollama request
// ---------------------------------------------------------------------------

async function callOllama(
  params: OllamaRequestParams
): Promise<ReadableStream<Uint8Array> | string> {
  const body = params.rawBody ?? {
    model: params.model,
    messages: params.messages,
    stream: params.stream ?? true,
    options: params.options ?? {},
  };

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '<unreadable>');
    throw new Error(`Ollama responded with ${res.status}: ${errText}`);
  }

  if (params.stream !== false) {
    // Return the raw readable stream so the caller can pipe it to the client
    if (!res.body) {
      throw new Error('Ollama returned streaming response with no body');
    }
    return res.body as ReadableStream<Uint8Array>;
  }

  // Non-streaming: return the full response text
  return res.text();
}

// ---------------------------------------------------------------------------
// Convenience: expose health info for /api/status routes
// ---------------------------------------------------------------------------

/**
 * Returns a status snapshot for use in health-check API routes.
 *
 * @example
 * import { getModelStatus } from './ollama-resilience';
 *
 * app.get('/api/status', async (_, reply) => {
 *   return reply.send(await getModelStatus());
 * });
 */
export async function getModelStatus(): Promise<{
  ollama: { online: boolean; url: string };
  groq:   { configured: boolean };
  activeBackend: 'ollama' | 'groq';
}> {
  const ollamaOnline = await isOllamaOnline();
  const groqConfigured = !!process.env.GROQ_API_KEY;

  return {
    ollama: { online: ollamaOnline, url: OLLAMA_URL },
    groq:   { configured: groqConfigured },
    activeBackend: ollamaOnline ? 'ollama' : 'groq',
  };
}
