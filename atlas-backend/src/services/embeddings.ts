/**
 * In-memory vector store with cosine similarity search.
 * Embeddings are generated via Ollama and stored in a Map.
 */

import { generateEmbedding } from './ollama.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface EmbeddingEntry {
  id: string;
  text: string;
  vector: number[];
  metadata: Record<string, string>;
  timestamp: string;
}

export interface SearchResult {
  entry: EmbeddingEntry;
  score: number;
}

// ── In-memory store ────────────────────────────────────────────────────────

const store = new Map<string, EmbeddingEntry>();

// ── Core math ──────────────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two equal-length vectors.
 * Returns a value in [-1, 1]; higher is more similar.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    throw new Error(
      `Vector length mismatch or empty: a=${a.length}, b=${b.length}`,
    );
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i] as number;
    const bi = b[i] as number;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dot / denominator;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate an embedding vector for the given text.
 */
export async function embed(text: string): Promise<number[]> {
  return generateEmbedding(text);
}

/**
 * Embed text and store in the in-memory vector store.
 */
export async function store_entry(
  id: string,
  text: string,
  metadata: Record<string, string> = {},
): Promise<void> {
  const vector = await generateEmbedding(text);
  const entry: EmbeddingEntry = {
    id,
    text,
    vector,
    metadata,
    timestamp: new Date().toISOString(),
  };
  store.set(id, entry);
}

/**
 * Search the store for entries most similar to the query text.
 *
 * @param query - Natural language query to embed and compare
 * @param topK  - Maximum number of results to return (default 5)
 * @param threshold - Minimum cosine similarity threshold (default 0.5)
 */
export async function search(
  query: string,
  topK = 5,
  threshold = 0.5,
): Promise<SearchResult[]> {
  if (store.size === 0) return [];

  const queryVector = await generateEmbedding(query);

  const results: SearchResult[] = [];

  for (const entry of store.values()) {
    try {
      const score = cosineSimilarity(queryVector, entry.vector);
      if (score >= threshold) {
        results.push({ entry, score });
      }
    } catch {
      // Skip entries with incompatible vector dimensions
    }
  }

  // Sort descending by score, take top K
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/**
 * Remove an entry from the store by ID.
 */
export function remove(id: string): boolean {
  return store.delete(id);
}

/**
 * Return the number of entries in the store.
 */
export function size(): number {
  return store.size;
}

/**
 * Return all entry IDs currently in the store.
 */
export function ids(): string[] {
  return Array.from(store.keys());
}

/**
 * Return a specific entry by ID, or undefined if not found.
 */
export function get(id: string): EmbeddingEntry | undefined {
  return store.get(id);
}
