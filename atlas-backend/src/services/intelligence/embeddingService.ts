import { env } from '../../config/env.js';

type OllamaEmbeddingResponse = {
  embedding?: number[];
  embeddings?: number[][];
};

/**
 * Local-only embedding service using Ollama.
 * POST {model, prompt} -> /api/embeddings
 */
export async function embedText(text: string, signal?: AbortSignal): Promise<number[]> {
  const prompt = text.trim();
  if (!prompt) return [];

  const res = await fetch(`${env.ollamaBaseUrl}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.ollamaEmbedModel,
      prompt,
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
