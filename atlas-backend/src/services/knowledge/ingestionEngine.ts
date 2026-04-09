import { z } from 'zod';
import { env } from '../../config/env.js';
import type { ModelProvider } from '../model/modelProvider.js';
import {
  createSemanticVectorStore,
  type SemanticVectorStore,
  semanticChunkId,
} from '../../db/vectorStore.js';

export const DEFAULT_CHUNK_MAX_CHARS = 1200;
export const DEFAULT_CHUNK_OVERLAP_CHARS = 160;

const chunkOptionsSchema = z.object({
  maxChars: z.number().int().positive().default(DEFAULT_CHUNK_MAX_CHARS),
  overlapChars: z.number().int().nonnegative().default(DEFAULT_CHUNK_OVERLAP_CHARS),
});

export type ChunkOptions = z.infer<typeof chunkOptionsSchema>;

/**
 * Recursive-style splitting: prefer paragraph / line / sentence boundaries, then hard cap by size.
 */
export function chunkTextForKnowledge(raw: string, options?: Partial<ChunkOptions>): string[] {
  const { maxChars, overlapChars } = chunkOptionsSchema.parse({ ...options });
  const text = raw.replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  if (text.length <= maxChars) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const preferBreak = Math.max(
        window.lastIndexOf('\n\n'),
        window.lastIndexOf('\n'),
        window.lastIndexOf('. ')
      );
      if (preferBreak >= Math.floor(maxChars * 0.25)) {
        end = start + preferBreak + (window[preferBreak] === '.' ? 2 : 1);
      }
    }

    const piece = text.slice(start, end).trim();
    if (piece.length > 0) {
      chunks.push(piece);
    }

    if (end >= text.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }

  return chunks;
}

export const knowledgeIngestionInputSchema = z.object({
  userId: z.string().min(1),
  /** Stable id for this document or observation (e.g. file path, trace id). */
  sourceId: z.string().min(1),
  rawText: z.string(),
  confidenceScore: z.number().min(0).max(1).default(0.85),
  epistemicTags: z.array(z.string()).default([]),
  kind: z.enum(['ingested', 'synthesized']).optional().default('ingested'),
  chunkOptions: chunkOptionsSchema.partial().optional(),
});

export type KnowledgeIngestionInput = z.infer<typeof knowledgeIngestionInputSchema>;

export const knowledgeIngestionResultSchema = z.object({
  sourceId: z.string(),
  chunkCount: z.number().int().nonnegative(),
  ids: z.array(z.string()),
});

export type KnowledgeIngestionResult = z.infer<typeof knowledgeIngestionResultSchema>;

export interface IngestionEngineDeps {
  model: ModelProvider;
  vectorStore?: SemanticVectorStore;
}

/**
 * Chunks raw text, embeds via local Ollama, upserts into the semantic vector index with epistemic metadata.
 */
export async function ingestKnowledge(
  input: KnowledgeIngestionInput,
  deps: IngestionEngineDeps
): Promise<KnowledgeIngestionResult> {
  const parsed = knowledgeIngestionInputSchema.parse(input);
  const chunks = chunkTextForKnowledge(parsed.rawText, parsed.chunkOptions);
  if (chunks.length === 0) {
    return { sourceId: parsed.sourceId, chunkCount: 0, ids: [] };
  }

  const store = deps.vectorStore ?? createSemanticVectorStore(deps.model);
  const timestamp = new Date().toISOString();

  const vectors = await store.embedTexts(chunks, env.evolutionLlmTimeoutMs);

  const records = chunks.map((text, chunkIndex) => ({
    id: semanticChunkId(parsed.sourceId, chunkIndex),
    vector: vectors[chunkIndex]!,
    userId: parsed.userId,
    sourceId: parsed.sourceId,
    timestamp,
    confidenceScore: parsed.confidenceScore,
    chunkIndex,
    text,
    epistemicTags: parsed.epistemicTags,
    kind: parsed.kind,
  }));

  await store.upsertRecords(records);

  return {
    sourceId: parsed.sourceId,
    chunkCount: records.length,
    ids: records.map((r) => r.id),
  };
}
