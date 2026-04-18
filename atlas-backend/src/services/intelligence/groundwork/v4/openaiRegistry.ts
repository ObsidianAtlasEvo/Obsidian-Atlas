/**
 * openaiRegistry.ts — Phase 2 stub
 *
 * TODO: Wire real OpenAI model registry when Phase 2 is promoted.
 * This stub satisfies imports from openaiUniversalAdapterPatch.ts
 * so the groundwork/v4 files compile.
 */

// ─── Registry entry types ────────────────────────────────────────────────────

export interface LlmRegistryEntry {
  id: string;
  modelId: string;
  supportsStructuredOutput: boolean;
  gated: boolean;
}

export interface EmbeddingRegistryEntry {
  id: string;
  apiModel: string;
  dimensions: number;
}

// ─── Registry lookup ─────────────────────────────────────────────────────────

// TODO: Replace with real registry backed by config/env when Phase 2 is promoted.
const EMBEDDING_REGISTRY: Record<string, EmbeddingRegistryEntry> = {
  'openai-embed-small': {
    id: 'openai-embed-small',
    apiModel: 'text-embedding-3-small',
    dimensions: 1536,
  },
  'openai-embed-large': {
    id: 'openai-embed-large',
    apiModel: 'text-embedding-3-large',
    dimensions: 3072,
  },
};

export function getEmbeddingRegistryEntry(id: string): EmbeddingRegistryEntry | undefined {
  return EMBEDDING_REGISTRY[id];
}
