/**
 * vectorUtils — pgvector wire-format helpers.
 * Canonical Atlas embedding dim is 768 (Gemini text-embedding-004).
 */
export function serializeEmbedding(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

export function assertEmbeddingDimension(embedding: number[], expected = 768): void {
  if (embedding.length !== expected) {
    throw new Error(
      `Embedding dimension mismatch: got ${embedding.length}, expected ${expected}`,
    );
  }
}

/** Reference: services should normally use the existing `match_user_memories()` RPC. */
export function buildVectorSearchClause(): string {
  return 'embedding <=> $1::vector';
}
