import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
import { embedText } from '../intelligence/embeddingService.js';

export type MemoryVaultType = 'EPISODIC' | 'TRUTH' | 'DIRECTIVE' | 'PROJECT';

export type MemoryVaultRecord = {
  id: string;
  userId: string;
  content: string;
  type: MemoryVaultType;
  embedding: number[];
  confidence: number;
  createdAt: string;
};

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 0;
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    aa += x * x;
    bb += y * y;
  }
  const denom = Math.sqrt(aa) * Math.sqrt(bb);
  return denom > 0 ? dot / denom : 0;
}

export async function ingestMemory(
  userId: string,
  content: string,
  type: MemoryVaultType,
  confidence = 0.7,
  options?: { sourceTraceId?: string | null }
): Promise<MemoryVaultRecord | null> {
  const clean = content.trim();
  if (!clean) return null;

  try {
    const embedding = await embedText(clean);
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const traceId = options?.sourceTraceId?.trim() || null;
    getDb()
      .prepare(
        `INSERT INTO memory_vault (id, user_id, content, type, embedding_json, confidence, created_at, origin, source_trace_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        userId,
        clean,
        type,
        JSON.stringify(embedding),
        confidence,
        createdAt,
        traceId ? 'evolution_ingest' : 'inferred',
        traceId
      );

    return { id, userId, content: clean, type, embedding, confidence, createdAt };
  } catch (e) {
    // Graceful failure: memory ingest should never block chat.
    console.warn('[memoryVault] ingest skipped:', e);
    return null;
  }
}

export async function retrieveRelevantMemories(
  userId: string,
  queryText: string,
  limit = 5
): Promise<Array<MemoryVaultRecord & { relevance: number }>> {
  const clean = queryText.trim();
  if (!clean) return [];

  try {
    const queryEmbedding = await embedText(clean);
    const rows = getDb()
      .prepare(
        `SELECT id, user_id, content, type, embedding_json, confidence, created_at
         FROM memory_vault
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 400`
      )
      .all(userId) as Array<{
      id: string;
      user_id: string;
      content: string;
      type: MemoryVaultType;
      embedding_json: string;
      confidence: number;
      created_at: string;
    }>;

    const scored = rows
      .map((r) => {
        let emb: number[] = [];
        try {
          emb = JSON.parse(r.embedding_json) as number[];
        } catch {
          emb = [];
        }
        const relevance = cosineSimilarity(queryEmbedding, emb);
        return {
          id: r.id,
          userId: r.user_id,
          content: r.content,
          type: r.type,
          embedding: emb,
          confidence: r.confidence,
          createdAt: r.created_at,
          relevance,
        };
      })
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);

    return scored;
  } catch (e) {
    // Graceful failure: retrieval should never block chat.
    console.warn('[memoryVault] retrieval skipped:', e);
    return [];
  }
}
