import { env } from '../../config/env.js';

type OllamaEmbeddingResponse = {
  embedding?: number[];
  embeddings?: number[][];
};

// ── Cloud fallback helpers ────────────────────────────────────────────────

async function embedViaGemini(text: string, signal?: AbortSignal): Promise<number[]> {
  const apiKey = env.geminiApiKey;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: { parts: [{ text }] } }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini embeddings failed (${res.status}): ${body.slice(0, 240)}`);
  }

  const data = (await res.json()) as { embedding?: { values?: number[] } };
  const vector = data.embedding?.values;
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error('Gemini embeddings response missing vector');
  }
  return vector; // 768-dim
}

async function embedViaOpenAI(text: string, signal?: AbortSignal): Promise<number[]> {
  const apiKey = env.openaiApiKey;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const base = env.openaiBaseUrl?.replace(/\/$/, '') || 'https://api.openai.com/v1';
  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI embeddings failed (${res.status}): ${body.slice(0, 240)}`);
  }

  const data = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
  const vector = data.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error('OpenAI embeddings response missing vector');
  }
  return vector; // 1536-dim
}

/**
 * Attempt cloud embedding providers in priority order:
 *   1. Gemini (768-dim)
 *   2. OpenAI (1536-dim)
 *   3. Zero vector fallback (768-dim)
 */
async function embedViaCloudFallback(text: string, signal?: AbortSignal): Promise<number[]> {
  // 1. Gemini
  if (env.geminiApiKey) {
    try {
      return await embedViaGemini(text, signal);
    } catch (e) {
      console.warn('[embeddingService] Gemini embedding failed, trying next fallback:', e);
    }
  }

  // 2. OpenAI (skip Groq — it doesn't support embeddings natively)
  if (env.openaiApiKey) {
    try {
      return await embedViaOpenAI(text, signal);
    } catch (e) {
      console.warn('[embeddingService] OpenAI embedding failed, trying next fallback:', e);
    }
  }

  // 3. Zero vector — preserves functionality without crashing
  console.warn(
    '[embeddingService] No cloud embedding provider available. Returning zero vector — memory similarity will be degraded.'
  );
  return new Array(768).fill(0) as number[];
}

// ── Ollama local embedding ────────────────────────────────────────────────

async function embedViaOllama(text: string, signal?: AbortSignal): Promise<number[]> {
  const res = await fetch(`${env.ollamaBaseUrl}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.ollamaEmbedModel,
      prompt: text,
    }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama embeddings failed (${res.status}): ${body.slice(0, 240)}`);
  }

  const data = (await res.json()) as OllamaEmbeddingResponse;
  const vector =
    Array.isArray(data.embedding) ? data.embedding : Array.isArray(data.embeddings?.[0]) ? data.embeddings[0] : null;

  if (!vector) throw new Error('Ollama embeddings response missing vector');
  return vector;
}

// ── Public API (signature unchanged) ──────────────────────────────────────

/**
 * Generate an embedding vector for the given text.
 * When Ollama is disabled or unreachable, falls back to cloud providers
 * (Gemini → OpenAI → zero vector).
 */
export async function embedText(text: string, signal?: AbortSignal): Promise<number[]> {
  const prompt = text.trim();
  if (!prompt) return [];

  // Skip Ollama entirely when disabled
  if (env.disableLocalOllama) {
    return embedViaCloudFallback(prompt, signal);
  }

  // Try Ollama first; on failure, fall back to cloud
  try {
    return await embedViaOllama(prompt, signal);
  } catch (e) {
    console.warn('[embeddingService] Ollama embedding failed, falling back to cloud:', e);
    return embedViaCloudFallback(prompt, signal);
  }
}
