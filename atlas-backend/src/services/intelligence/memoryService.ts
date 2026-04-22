/**
 * memoryService.ts — Per-user RAG memory layer (Phase 0 of Atlas evolution roadmap).
 *
 * Responsibilities:
 *   1. recallForOverseer()  — pre-turn: pull top-K memories + recent chunks for
 *                             the current user and format them for injection
 *                             into the Overseer system prompt.
 *   2. writeTurnAsync()     — post-turn: fire-and-forget write of the user
 *                             question + assistant answer as embedded chunks,
 *                             plus optional distilled memories.
 *
 * Design invariants:
 *   - 768-dim embeddings only (Gemini text-embedding-004). 1536-dim OpenAI
 *     vectors would break the pgvector column.
 *   - Every exported function is non-throwing at the outer layer. A failure
 *     in memory MUST never block a response.
 *   - All DB access goes through the existing supabaseRest() helper using
 *     the service-role key (bypasses RLS safely because user_id is server-
 *     derived, never client-supplied).
 *   - Feature-flag gated via env.memoryLayerEnabled. When disabled, every
 *     function is a no-op returning safe defaults.
 */

import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import { embedText } from './embeddingService.js';

// ── Types ───────────────────────────────────────────────────────────────────

export type MemoryKind = 'preference' | 'fact' | 'pattern' | 'correction' | 'goal';

export interface RecalledRow {
  source: 'memory' | 'chunk';
  kind: string;          // memory.kind OR chunk.role
  content: string;
  similarity: number;
  created_at: string;
  id: string;
  // Phase 0.75 governance fields (present on new rows, null-safe for legacy).
  memory_class?: string | null;
  provenance?: string | null;
  scope_type?: string | null;
  scope_key?: string | null;
  stability_score?: number | null;
  policy_eligible?: boolean | null;
  contradiction_status?: string | null;
}

export interface RecallOptions {
  memoryK?: number;      // top-K durable memories to return  (default 8)
  chunkK?: number;       // top-K recent conversation chunks  (default 4)
  chunkDays?: number;    // recency window in days            (default 30)
  timeoutMs?: number;    // hard cap — return empty if slower (default 2500)
}

// ── Embedding helper (Gemini-only for 768-dim compat) ──────────────────────

/**
 * Embed text and verify it's 768-dim. If the embedding service falls back to
 * OpenAI (1536-dim) or a zero vector, we drop it — the memory column is
 * vector(768) and will reject other shapes.
 */
async function embed768(text: string, signal?: AbortSignal): Promise<number[] | null> {
  if (!env.geminiApiKey && !env.disableLocalOllama) {
    // Ollama path may produce non-768-dim; we skip unless Gemini is wired.
    return null;
  }
  try {
    const vec = await embedText(text.slice(0, 8_000), signal);
    if (vec.length !== 768) return null;
    // Reject all-zero vectors (embeddingService's explicit fallback).
    if (vec.every((v) => v === 0)) return null;
    return vec;
  } catch {
    return null;
  }
}

// ── Recall ──────────────────────────────────────────────────────────────────

/**
 * Compose the memory context block to be injected into the Overseer system
 * prompt. Returns an empty string when:
 *   - feature flag is off
 *   - userId is missing
 *   - Supabase is not configured
 *   - embedding failed
 *   - RPC returned nothing
 *
 * Safe to await in the hot path; hard-capped at `timeoutMs` (default 2.5s).
 */
export async function recallForOverseer(
  userId: string | undefined,
  queryText: string,
  opts: RecallOptions = {},
): Promise<string> {
  if (!env.memoryLayerEnabled) return '';
  if (!userId || !queryText.trim()) return '';
  if (!process.env.SUPABASE_URL) return '';

  const timeoutMs = opts.timeoutMs ?? 2500;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const vec = await embed768(queryText, controller.signal);
    if (!vec) return '';

    const rpcRes = await supabaseRest<RecalledRow[]>(
      'POST',
      'rpc/atlas_recall_memories',
      {
        p_user_id: userId,
        p_query_embed: vec,
        p_memory_k: opts.memoryK ?? 8,
        p_chunk_k: opts.chunkK ?? 4,
        p_chunk_days: opts.chunkDays ?? 30,
      },
    );

    if (!rpcRes.ok || !Array.isArray(rpcRes.data) || rpcRes.data.length === 0) {
      return '';
    }

    // Fire-and-forget: bump reference_count on memory hits (sync is fine;
    // PATCH is cheap).
    const memoryHits = rpcRes.data.filter((r) => r.source === 'memory');
    if (memoryHits.length > 0) {
      void bumpMemoryReferences(memoryHits.map((m) => m.id)).catch(() => {});
    }

    return formatRecallBlock(rpcRes.data);
  } catch {
    return '';
  } finally {
    clearTimeout(t);
  }
}

/**
 * V1.0 Sovereign Execution Framework — Stage 4 context assembly.
 *
 * Same retrieval logic as recallForOverseer() but returns the raw RecalledRow[]
 * so the conductor can pass them directly into contextCuratorService.curateContext().
 * Reference-count bumping is preserved.
 *
 * Returns an empty array (never throws) when:
 *   - feature flag is off
 *   - userId / queryText missing
 *   - Supabase not configured
 *   - embedding failed
 *   - RPC returned nothing
 */
export async function recallRawRows(
  userId: string | undefined,
  queryText: string,
  opts: RecallOptions = {},
): Promise<RecalledRow[]> {
  if (!env.memoryLayerEnabled) return [];
  if (!userId || !queryText.trim()) return [];
  if (!process.env.SUPABASE_URL) return [];

  const timeoutMs = opts.timeoutMs ?? 2500;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const vec = await embed768(queryText, controller.signal);
    if (!vec) return [];

    const rpcRes = await supabaseRest<RecalledRow[]>(
      'POST',
      'rpc/atlas_recall_memories',
      {
        p_user_id: userId,
        p_query_embed: vec,
        p_memory_k: opts.memoryK ?? 8,
        p_chunk_k: opts.chunkK ?? 4,
        p_chunk_days: opts.chunkDays ?? 30,
      },
    );

    if (!rpcRes.ok || !Array.isArray(rpcRes.data) || rpcRes.data.length === 0) {
      return [];
    }

    const memoryHits = rpcRes.data.filter((r) => r.source === 'memory');
    if (memoryHits.length > 0) {
      void bumpMemoryReferences(memoryHits.map((m) => m.id)).catch(() => {});
    }

    return rpcRes.data;
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

/**
 * Render recalled rows as an LLM-friendly block. Memories first (durable
 * signal), then conversation snippets (recent signal).
 */
function formatRecallBlock(rows: readonly RecalledRow[]): string {
  const memories = rows.filter((r) => r.source === 'memory');
  const chunks = rows.filter((r) => r.source === 'chunk');

  const lines: string[] = [];
  lines.push('USER_EVOLUTION_CONTEXT (retrieved from user-specific memory):');

  if (memories.length > 0) {
    lines.push('', 'Durable memories (apply where relevant):');
    for (const m of memories) {
      const sim = m.similarity.toFixed(2);
      // Phase 0.75: surface scope so Overseer knows when to apply.
      const scope = m.scope_type && m.scope_type !== 'global'
        ? ` [scope:${m.scope_type}${m.scope_key ? `/${m.scope_key}` : ''}]`
        : '';
      // Phase 0.75: flag contested memories — Overseer should not blindly apply.
      const contested = m.contradiction_status === 'unresolved' ? ' [CONTESTED-apply-with-caution]' : '';
      const cls = m.memory_class && m.memory_class !== 'tentative' ? `/${m.memory_class}` : '';
      lines.push(`- [${m.kind}${cls}${scope}${contested}] (rel=${sim}) ${truncate(m.content, 300)}`);
    }
  }

  if (chunks.length > 0) {
    lines.push('', 'Relevant prior turns (recent context):');
    for (const c of chunks) {
      const sim = c.similarity.toFixed(2);
      lines.push(`- [${c.kind}] (rel=${sim}) ${truncate(c.content, 260)}`);
    }
  }

  lines.push(
    '',
    'Apply durable memories when relevant and not contested. Scoped memories apply only within their stated scope. Do not quote prior turns verbatim unless the user asks.',
  );
  return lines.join('\n');
}

function truncate(s: string, n: number): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

async function bumpMemoryReferences(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  // PostgREST IN filter.
  const inList = ids.map((id) => `"${id}"`).join(',');
  await supabaseRest(
    'PATCH',
    `user_memories?id=in.(${inList})`,
    {
      last_referenced_at: new Date().toISOString(),
    },
    { Prefer: 'return=minimal' },
  );
}

// ── Write ───────────────────────────────────────────────────────────────────

export interface TurnWriteInput {
  userId: string;
  turnId?: string;
  userMessage: string;
  assistantMessage: string;
  modelId?: string;
}

/**
 * Persist a turn (user + assistant) as two embedded chunks. Fire-and-forget.
 * Returns a promise you may choose to ignore; any internal failure is logged
 * and swallowed.
 */
export function writeTurnAsync(input: TurnWriteInput): Promise<void> {
  return writeTurn(input).catch((err) => {
    console.warn('[memoryService] writeTurn failed (non-fatal):',
      err instanceof Error ? err.message : err);
  });
}

async function writeTurn(input: TurnWriteInput): Promise<void> {
  if (!env.memoryLayerEnabled) return;
  if (!input.userId) return;
  if (!process.env.SUPABASE_URL) return;

  const turnId = input.turnId || cryptoRandomUuid();

  const rows: Array<Record<string, unknown>> = [];

  const userTrim = input.userMessage.trim();
  if (userTrim) {
    const vec = await embed768(userTrim);
    if (vec) {
      rows.push({
        user_id: input.userId,
        turn_id: turnId,
        role: 'user',
        content: userTrim.slice(0, 8_000),
        content_tokens: approxTokens(userTrim),
        embedding: vec,
      });
    }
  }

  const asstTrim = input.assistantMessage.trim();
  if (asstTrim) {
    const vec = await embed768(asstTrim);
    if (vec) {
      rows.push({
        user_id: input.userId,
        turn_id: turnId,
        role: 'assistant',
        content: asstTrim.slice(0, 8_000),
        content_tokens: approxTokens(asstTrim),
        embedding: vec,
        model_id: input.modelId ?? null,
      });
    }
  }

  if (rows.length === 0) return;

  await supabaseRest(
    'POST',
    'conversation_chunks',
    rows,
    { Prefer: 'return=minimal' },
  );
}

function approxTokens(text: string): number {
  // Rough heuristic — good enough for a budget column.
  return Math.max(1, Math.ceil(text.length / 4));
}

function cryptoRandomUuid(): string {
  // Node 20+ has globalThis.crypto.randomUUID. Fall back to a simple shim.
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  // Fallback: RFC4122 v4-ish using Math.random (good enough for a server-derived id).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
