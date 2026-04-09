import { z } from 'zod';
import { getSemanticChunkForUser, type SemanticVectorStore } from '../../db/vectorStore.js';
import { getMemoryById } from '../memory/memoryStore.js';

/** Ollama `/api/chat` tool schema: OpenAI-style function objects. */
export type OllamaToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      required?: string[];
      properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    };
  };
};

export const ATLAS_TOOL_NAMES = [
  'search_semantic_graph',
  'read_atlas_artifact',
  'system_time_check',
] as const;

export type AtlasToolName = (typeof ATLAS_TOOL_NAMES)[number];

export const searchSemanticGraphArgsSchema = z.object({
  query: z.string().min(1).describe('Natural-language query for semantic / vector retrieval'),
  top_k: z.number().int().min(1).max(32).optional().default(8),
});

export const readAtlasArtifactArgsSchema = z.object({
  artifact_id: z.string().min(1).describe('Memory id or semantic chunk id from prior retrieval'),
  artifact_type: z.enum(['auto', 'memory', 'semantic_chunk']).optional().default('auto'),
});

export const systemTimeCheckArgsSchema = z.object({}).strict();

export type ToolExecutionContext = {
  userId: string;
  semantic: SemanticVectorStore;
};

const searchSemanticGraphTool: OllamaToolDefinition = {
  type: 'function',
  function: {
    name: 'search_semantic_graph',
    description:
      'Search the local semantic vector index (Vectra + Ollama embeddings) for passages ' +
      'linked to concepts, notes, and ingested knowledge. Read-only; returns ranked excerpts with scores.',
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'What to search for in the knowledge base' },
        top_k: { type: 'number', description: 'Max hits to return (1–32), default 8' },
      },
    },
  },
};

const readAtlasArtifactTool: OllamaToolDefinition = {
  type: 'function',
  function: {
    name: 'read_atlas_artifact',
    description:
      'Load the full text of a saved Atlas artifact: a structured memory row (SQLite) or a ' +
      'semantic chunk from the vector index. Use ids returned by search_semantic_graph or memory APIs.',
    parameters: {
      type: 'object',
      required: ['artifact_id'],
      properties: {
        artifact_id: { type: 'string', description: 'Memory UUID or semantic chunk id' },
        artifact_type: {
          type: 'string',
          enum: ['auto', 'memory', 'semantic_chunk'],
          description: 'auto tries memory first, then vector chunk',
        },
      },
    },
  },
};

const systemTimeCheckTool: OllamaToolDefinition = {
  type: 'function',
  function: {
    name: 'system_time_check',
    description:
      'Returns the current server date/time in ISO-8601 and local timezone string for grounding answers.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

/** Tool definitions to pass verbatim to Ollama `tools` on `/api/chat`. */
export const OLLAMA_ATLAS_TOOLS: readonly OllamaToolDefinition[] = [
  searchSemanticGraphTool,
  readAtlasArtifactTool,
  systemTimeCheckTool,
] as const;

const MAX_EXCERPT = 4000;

function jsonResult(payload: unknown): string {
  return JSON.stringify(payload);
}

async function runSearchSemanticGraph(
  raw: unknown,
  ctx: ToolExecutionContext
): Promise<string> {
  const parsed = searchSemanticGraphArgsSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResult({ error: 'invalid_arguments', details: parsed.error.flatten() });
  }
  const { query, top_k } = parsed.data;
  try {
    const hits = await ctx.semantic.searchByQuery(ctx.userId, query, top_k);
    return jsonResult({
      hits: hits.map((h) => ({
        id: h.id,
        score: h.score,
        source_id: h.sourceId,
        confidence: h.confidenceScore,
        tags: h.epistemicTags,
        excerpt: h.text.length > MAX_EXCERPT ? `${h.text.slice(0, MAX_EXCERPT)}…` : h.text,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResult({ error: 'search_failed', message });
  }
}

async function runReadAtlasArtifact(raw: unknown, ctx: ToolExecutionContext): Promise<string> {
  const parsed = readAtlasArtifactArgsSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResult({ error: 'invalid_arguments', details: parsed.error.flatten() });
  }
  const { artifact_id, artifact_type } = parsed.data;

  const tryMemory = async (): Promise<string | null> => {
    const mem = getMemoryById(ctx.userId, artifact_id);
    if (!mem) return null;
    return jsonResult({
      kind: 'memory',
      id: mem.id,
      memory_kind: mem.kind,
      summary: mem.summary,
      detail: mem.detail,
      confidence: mem.confidence,
      tags: mem.tags,
      source_trace_id: mem.sourceTraceId,
      created_at: mem.createdAt,
    });
  };

  const tryChunk = async (): Promise<string | null> => {
    const hit = await getSemanticChunkForUser(ctx.userId, artifact_id);
    if (!hit) return null;
    return jsonResult({
      kind: 'semantic_chunk',
      id: hit.id,
      source_id: hit.sourceId,
      confidence: hit.confidenceScore,
      tags: hit.epistemicTags,
      text: hit.text,
    });
  };

  try {
    if (artifact_type === 'memory') {
      const m = await tryMemory();
      return m ?? jsonResult({ error: 'not_found', artifact_id, tried: 'memory' });
    }
    if (artifact_type === 'semantic_chunk') {
      const c = await tryChunk();
      return c ?? jsonResult({ error: 'not_found', artifact_id, tried: 'semantic_chunk' });
    }
    const m = await tryMemory();
    if (m) return m;
    const c = await tryChunk();
    if (c) return c;
    return jsonResult({ error: 'not_found', artifact_id, tried: 'auto' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResult({ error: 'read_failed', message });
  }
}

function runSystemTimeCheck(raw: unknown): string {
  const parsed = systemTimeCheckArgsSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResult({ error: 'invalid_arguments', details: parsed.error.flatten() });
  }
  const now = new Date();
  return jsonResult({
    iso_utc: now.toISOString(),
    unix_ms: now.getTime(),
    locale_string: now.toString(),
    timezone_offset_minutes: now.getTimezoneOffset(),
  });
}

/**
 * Dispatch a single tool call by name with already-parsed arguments (object).
 * Always returns a string suitable for Ollama `role: tool` `content`.
 */
export async function executeAtlasTool(
  name: string,
  args: unknown,
  ctx: ToolExecutionContext
): Promise<string> {
  if (!ATLAS_TOOL_NAMES.includes(name as AtlasToolName)) {
    return jsonResult({ error: 'unknown_tool', name });
  }

  switch (name as AtlasToolName) {
    case 'search_semantic_graph':
      return runSearchSemanticGraph(args, ctx);
    case 'read_atlas_artifact':
      return runReadAtlasArtifact(args, ctx);
    case 'system_time_check':
      return Promise.resolve(runSystemTimeCheck(args));
    default:
      return jsonResult({ error: 'unknown_tool', name });
  }
}
