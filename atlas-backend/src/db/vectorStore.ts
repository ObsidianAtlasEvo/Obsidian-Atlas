// Atlas-Audit: [VIII] Verified
import fs from 'node:fs';
import path from 'node:path';
import { LocalIndex } from 'vectra';
import { z } from 'zod';
import { env } from '../config/env.js';
import type { ModelProvider } from '../services/model/modelProvider.js';

/** User-authored vs model-derived chunks — inspectability for sovereign recall (defaults to inferred). */
export const semanticChunkOriginSchema = z.enum(['user', 'inferred', 'system']);
export type SemanticChunkOrigin = z.infer<typeof semanticChunkOriginSchema>;

/** Epistemic / provenance fields persisted in Vectra metadata (primitive types only). */
export const semanticChunkKindSchema = z.enum(['ingested', 'synthesized']);
export type SemanticChunkKind = z.infer<typeof semanticChunkKindSchema>;

const epistemicTagsJsonSchema = z.string().transform((s, ctx) => {
  try {
    const v = JSON.parse(s) as unknown;
    const arr = z.array(z.string()).safeParse(v);
    if (!arr.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'epistemicTagsJson must be JSON string[]' });
      return z.NEVER;
    }
    return arr.data;
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid JSON in epistemicTagsJson' });
    return z.NEVER;
  }
});

/**
 * Optional `sqliteLedgerRef`: convention `table_name:row_id` (e.g. `memories:uuid`) to tie vectors to SQLite substrate.
 */
export const semanticVectorRecordMetadataSchema = z.object({
  userId: z.string().min(1),
  sourceId: z.string().min(1),
  timestamp: z.string().min(1),
  confidenceScore: z.number().min(0).max(1),
  chunkIndex: z.number().int().nonnegative(),
  text: z.string(),
  epistemicTagsJson: epistemicTagsJsonSchema,
  kind: semanticChunkKindSchema.optional(),
  origin: semanticChunkOriginSchema.optional(),
  sqliteLedgerRef: z.string().min(1).optional(),
});

export type SemanticVectorRecordMetadata = z.infer<typeof semanticVectorRecordMetadataSchema>;

/** One row to upsert: vector + epistemic envelope. */
export const semanticVectorUpsertSchema = z.object({
  id: z.string().min(1),
  vector: z.array(z.number()).min(1),
  userId: z.string().min(1),
  sourceId: z.string().min(1),
  timestamp: z.string().min(1),
  confidenceScore: z.number().min(0).max(1),
  chunkIndex: z.number().int().nonnegative(),
  text: z.string(),
  epistemicTags: z.array(z.string()),
  kind: semanticChunkKindSchema.optional(),
  origin: semanticChunkOriginSchema.optional(),
  sqliteLedgerRef: z.string().min(1).optional(),
});

export type SemanticVectorUpsert = z.infer<typeof semanticVectorUpsertSchema>;

export const semanticVectorSearchHitSchema = z.object({
  id: z.string(),
  score: z.number(),
  userId: z.string(),
  sourceId: z.string(),
  timestamp: z.string(),
  confidenceScore: z.number(),
  chunkIndex: z.number(),
  text: z.string(),
  epistemicTags: z.array(z.string()),
  kind: semanticChunkKindSchema.optional(),
  origin: semanticChunkOriginSchema.optional(),
  sqliteLedgerRef: z.string().optional(),
});

export type SemanticVectorSearchHit = z.infer<typeof semanticVectorSearchHitSchema>;

let _index: LocalIndex | null = null;
let _indexReady: Promise<LocalIndex> | null = null;

function metadataToVectraFields(
  m: Omit<SemanticVectorUpsert, 'id' | 'vector'>
): Record<string, string | number | boolean> {
  const base: Record<string, string | number | boolean> = {
    userId: m.userId,
    sourceId: m.sourceId,
    timestamp: m.timestamp,
    confidenceScore: m.confidenceScore,
    chunkIndex: m.chunkIndex,
    text: m.text,
    epistemicTagsJson: JSON.stringify(m.epistemicTags),
    origin: m.origin ?? 'inferred',
  };
  if (m.kind !== undefined) {
    base.kind = m.kind;
  }
  if (m.sqliteLedgerRef !== undefined) {
    base.sqliteLedgerRef = m.sqliteLedgerRef;
  }
  return base;
}

function parseHitMetadata(
  raw: Record<string, string | number | boolean>,
  id: string,
  score: number
): SemanticVectorSearchHit {
  const kindRaw = raw.kind;
  const originRaw = raw.origin;
  const ledgerRaw = raw.sqliteLedgerRef;
  const parsed = semanticVectorRecordMetadataSchema.safeParse({
    ...raw,
    epistemicTagsJson: String(raw.epistemicTagsJson ?? '[]'),
    kind:
      kindRaw === undefined || kindRaw === null
        ? undefined
        : typeof kindRaw === 'string'
          ? kindRaw
          : undefined,
    origin:
      originRaw === undefined || originRaw === null
        ? undefined
        : typeof originRaw === 'string'
          ? originRaw
          : undefined,
    sqliteLedgerRef:
      ledgerRaw === undefined || ledgerRaw === null
        ? undefined
        : typeof ledgerRaw === 'string'
          ? ledgerRaw
          : undefined,
  });
  if (!parsed.success) {
    throw new Error(`Corrupt vector metadata for id=${id}: ${parsed.error.message}`);
  }
  const m = parsed.data;
  return {
    id,
    score,
    userId: m.userId,
    sourceId: m.sourceId,
    timestamp: m.timestamp,
    confidenceScore: m.confidenceScore,
    chunkIndex: m.chunkIndex,
    text: m.text,
    epistemicTags: m.epistemicTagsJson,
    kind: m.kind,
    origin: m.origin ?? 'inferred',
    sqliteLedgerRef: m.sqliteLedgerRef,
  };
}

/**
 * Ensures the on-disk Vectra index exists under `env.semanticVectorIndexPath`.
 * Call once at process startup (after SQLite dirs exist).
 */
export async function initSemanticVectorIndex(): Promise<LocalIndex> {
  if (_index) return _index;
  if (_indexReady) return _indexReady;

  _indexReady = (async () => {
    const folder = env.semanticVectorIndexPath;
    fs.mkdirSync(folder, { recursive: true });
    const idx = new LocalIndex(folder);
    if (!(await idx.isIndexCreated())) {
      await idx.createIndex({ version: 1 });
    }
    _index = idx;
    return idx;
  })();

  try {
    return await _indexReady;
  } finally {
    _indexReady = null;
  }
}

export async function getSemanticLocalIndex(): Promise<LocalIndex> {
  if (_index) return _index;
  return initSemanticVectorIndex();
}

/**
 * Fetch one vector index row by chunk id, enforcing `userId` on stored metadata (read-only).
 */
export async function getSemanticChunkForUser(
  userId: string,
  chunkId: string
): Promise<SemanticVectorSearchHit | null> {
  const idx = await getSemanticLocalIndex();
  const item = await idx.getItem(chunkId);
  if (!item?.metadata) return null;
  const raw = item.metadata as Record<string, string | number | boolean>;
  if (raw.userId !== userId) return null;
  return parseHitMetadata(raw, item.id, 1);
}

export interface SemanticVectorStore {
  embedTexts(texts: string[], timeoutMs?: number): Promise<number[][]>;
  upsertRecords(records: SemanticVectorUpsert[]): Promise<void>;
  searchByVector(userId: string, queryVector: number[], topK: number): Promise<SemanticVectorSearchHit[]>;
  searchByQuery(userId: string, queryText: string, topK: number): Promise<SemanticVectorSearchHit[]>;
}

/**
 * Semantic memory backed by Vectra (local folder) with embeddings from `model.embed` (Ollama `/api/embed`).
 */
export function createSemanticVectorStore(model: ModelProvider): SemanticVectorStore {
  return {
    async embedTexts(texts: string[], timeoutMs?: number): Promise<number[][]> {
      return model.embed({ input: texts, timeoutMs });
    },

    async upsertRecords(records: SemanticVectorUpsert[]): Promise<void> {
      if (records.length === 0) return;
      const validated = records.map((r) => semanticVectorUpsertSchema.parse(r));
      const index = await getSemanticLocalIndex();
      await index.beginUpdate();
      try {
        for (const r of validated) {
          await index.upsertItem({
            id: r.id,
            vector: r.vector,
            metadata: metadataToVectraFields(r),
          });
        }
      } finally {
        await index.endUpdate();
      }
    },

    async searchByVector(userId: string, queryVector: number[], topK: number): Promise<SemanticVectorSearchHit[]> {
      const index = await getSemanticLocalIndex();
      const rows = await index.queryItems(
        queryVector,
        '',
        topK,
        { userId: { $eq: userId } },
        false
      );
      return rows.map((r) =>
        parseHitMetadata(
          r.item.metadata as Record<string, string | number | boolean>,
          r.item.id,
          r.score
        )
      );
    },

    async searchByQuery(userId: string, queryText: string, topK: number): Promise<SemanticVectorSearchHit[]> {
      const [vec] = await model.embed({ input: [queryText] });
      if (!vec) {
        throw new Error('semantic search: empty embedding response');
      }
      return this.searchByVector(userId, vec, topK);
    },
  };
}

/** Stable chunk id for idempotent re-ingestion of the same source. */
export function semanticChunkId(sourceId: string, chunkIndex: number): string {
  const safeSource = sourceId.replace(/:/g, '_');
  return `${safeSource}:chunk:${chunkIndex}`;
}
