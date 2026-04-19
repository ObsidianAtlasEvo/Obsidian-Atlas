/**
 * memoryDistiller.ts — Phase 0.5 of the Atlas evolution roadmap.
 *
 * Incrementally distills `conversation_chunks` into durable `user_memories`
 * (preferences, facts, patterns, corrections, goals) using a cheap LLM pass.
 * When it extracts a high-confidence preference, it also emits a policy patch
 * that the policyAutoWriter applies to SQLite `policy_profiles`, which is
 * what actually reshapes Atlas's per-user behavior on the next turn.
 *
 * Pipeline per user:
 *   1. Read memory_distiller_state → last cursor
 *   2. Fetch new chunks via atlas_pending_distiller_chunks RPC
 *   3. Pack into a compact transcript + ask Gemini Flash Lite for JSON
 *   4. For each extracted memory:
 *        - embed content (768-dim Gemini)
 *        - if a similar existing memory exists → mark it superseded_by
 *        - insert the new row
 *   5. Emit aggregated PolicyPatch for the policyAutoWriter
 *   6. Update memory_distiller_state + append memory_distiller_runs audit row
 *
 * Invariants:
 *   - Non-throwing at the outer layer. Never blocks a user turn.
 *   - Gated on env.memoryDistillerEnabled (independent of memoryLayerEnabled,
 *     though it is a no-op if chunks never get written).
 *   - Hard LLM timeout (15s default) so a stuck request cannot pin the loop.
 */

import { z } from 'zod';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import { embedText } from './embeddingService.js';
import { completeGeminiChat } from './universalAdapter.js';
import type { UniversalMessage } from './universalAdapter.js';

// ── Types ───────────────────────────────────────────────────────────────────

export type MemoryKind = 'preference' | 'fact' | 'pattern' | 'correction' | 'goal';

/**
 * A structured preference signal the distiller extracts from conversation.
 * Fed into the policyAutoWriter which maps it onto `policy_profiles`.
 */
export interface PolicyPatch {
  verbosity?: 'low' | 'medium' | 'high';
  tone?: string;
  structurePreference?: 'minimal' | 'balanced' | 'structured';
  truthFirstStrictnessDelta?: number;  // -0.1..+0.1
  preferredComputeDepth?: 'Light' | 'Heavy';
  latencyTolerance?: 'Low' | 'High';
  /** 0..1 confidence that drove these patches — gates apply-or-skip. */
  confidence: number;
  /** Provenance so the audit trail can show "why did Atlas change my tone?" */
  evidence: readonly string[];
}

export interface DistillerRunResult {
  status: 'ok' | 'skip' | 'partial' | 'error';
  userId: string;
  chunksScanned: number;
  memoriesWritten: number;
  memoriesSuperseded: number;
  policyPatch: PolicyPatch | null;
  error?: string;
}

// ── LLM extraction schema ──────────────────────────────────────────────────

const extractedMemorySchema = z.object({
  kind: z.enum(['preference', 'fact', 'pattern', 'correction', 'goal']),
  content: z.string().min(4).max(600),
  importance: z.number().min(0).max(1),
});

const policyHintSchema = z.object({
  verbosity: z.enum(['low', 'medium', 'high']).optional(),
  tone: z.string().max(40).optional(),
  structurePreference: z.enum(['minimal', 'balanced', 'structured']).optional(),
  truthFirstStrictnessDelta: z.number().min(-0.15).max(0.15).optional(),
  preferredComputeDepth: z.enum(['Light', 'Heavy']).optional(),
  latencyTolerance: z.enum(['Low', 'High']).optional(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().max(280)).max(6).optional(),
}).partial().extend({
  confidence: z.number().min(0).max(1),
});

const distillerOutputSchema = z.object({
  memories: z.array(extractedMemorySchema).max(12),
  policy_hint: policyHintSchema.nullable().optional(),
});

type DistillerOutput = z.infer<typeof distillerOutputSchema>;

// ── Prompts ────────────────────────────────────────────────────────────────

const DISTILLER_SYSTEM_PROMPT = `You are a memory distiller for Atlas — an AI system that evolves per user.

Your job: read a short slice of a user's recent conversation with Atlas and extract DURABLE facts/preferences/patterns/corrections/goals about THIS USER that should persist across sessions.

OUTPUT FORMAT — strict JSON, no prose, no code fences:
{
  "memories": [
    { "kind": "preference"|"fact"|"pattern"|"correction"|"goal",
      "content": "<one self-contained sentence about the user; no 'the user said'>",
      "importance": 0.0-1.0 }
  ],
  "policy_hint": {
    "verbosity":            "low"|"medium"|"high",            // optional
    "tone":                 "warm"|"direct"|"analytical"|...,  // optional, one word
    "structurePreference":  "minimal"|"balanced"|"structured", // optional
    "truthFirstStrictnessDelta": -0.15..+0.15,                 // optional
    "preferredComputeDepth": "Light"|"Heavy",                  // optional
    "latencyTolerance":     "Low"|"High",                      // optional
    "confidence":           0.0-1.0,
    "evidence": ["<verbatim excerpt>", ...]                    // up to 6, concise
  }
}

RULES:
- Return {"memories": [], "policy_hint": null} if nothing durable is present. Do NOT invent.
- "preference" = how the user wants Atlas to behave. "fact" = something true about the user (job, timezone, tools they use). "pattern" = recurring behavior. "correction" = user told Atlas to stop/change something. "goal" = explicit objective.
- importance 0.9+ = explicit correction or strong stated preference. 0.6-0.8 = repeated pattern or clear preference. 0.3-0.5 = single incidental mention.
- policy_hint.confidence should ONLY be ≥ 0.7 when the user explicitly told Atlas to behave a certain way, or did so at least twice.
- DO NOT extract ephemeral task state (e.g. "user wants to know X right now").
- Write memory.content in third person: "Prefers concise answers" NOT "The user said to be concise".`;

function buildDistillerUser(transcript: string, existingMemories: string[]): string {
  const prior = existingMemories.length
    ? `\n\n--- EXISTING_DURABLE_MEMORIES (do NOT re-emit; emit a contradicting memory if corrected) ---\n${existingMemories.slice(0, 20).map((m, i) => `${i + 1}. ${m}`).join('\n')}`
    : '';
  return `--- RECENT_CONVERSATION (oldest→newest) ---\n${transcript}${prior}\n\nExtract durable memories and any reliable policy_hint. Return JSON only.`;
}

// ── Public entry points ────────────────────────────────────────────────────

/**
 * Distill a single user's backlog. Non-throwing; returns a result object.
 */
export async function distillUserMemories(userId: string): Promise<DistillerRunResult> {
  const empty: DistillerRunResult = {
    status: 'skip',
    userId,
    chunksScanned: 0,
    memoriesWritten: 0,
    memoriesSuperseded: 0,
    policyPatch: null,
  };

  if (!env.memoryDistillerEnabled) return empty;
  if (!userId) return empty;
  if (!process.env.SUPABASE_URL) return empty;
  if (!env.geminiApiKey) {
    // Without a Gemini key we have neither extraction nor 768-dim embeddings.
    return { ...empty, status: 'skip', error: 'gemini-key-missing' };
  }

  const startedAt = new Date().toISOString();
  let chunksScanned = 0;
  let memoriesWritten = 0;
  let memoriesSuperseded = 0;
  let policyPatch: PolicyPatch | null = null;
  let modelId = env.geminiOverseerModelFree;
  let status: DistillerRunResult['status'] = 'ok';
  let errorMessage: string | undefined;

  try {
    // 1. Cursor
    const stateRes = await supabaseRest<Array<{ last_chunk_id: string | null; last_chunk_created_at: string | null }>>(
      'GET',
      `memory_distiller_state?user_id=eq.${encodeURIComponent(userId)}&select=last_chunk_id,last_chunk_created_at`,
    );
    const cursor = stateRes.ok && stateRes.data?.[0]?.last_chunk_id
      ? stateRes.data[0].last_chunk_id
      : null;

    // 2. Fetch new chunks
    const chunksRes = await supabaseRest<Array<{ id: string; turn_id: string; role: string; content: string; created_at: string }>>(
      'POST',
      'rpc/atlas_pending_distiller_chunks',
      { p_user_id: userId, p_after_chunk: cursor, p_limit: 40 },
    );
    if (!chunksRes.ok || !Array.isArray(chunksRes.data) || chunksRes.data.length === 0) {
      status = 'skip';
      return { status, userId, chunksScanned: 0, memoriesWritten: 0, memoriesSuperseded: 0, policyPatch: null };
    }
    const chunks = chunksRes.data;
    chunksScanned = chunks.length;

    // 3. Existing memories (for no-redundancy hint)
    const existingRes = await supabaseRest<Array<{ content: string }>>(
      'GET',
      `user_memories?user_id=eq.${encodeURIComponent(userId)}&superseded_by=is.null&select=content&order=importance.desc&limit=20`,
    );
    const existing = existingRes.ok && Array.isArray(existingRes.data)
      ? existingRes.data.map((r) => r.content).filter(Boolean)
      : [];

    const transcript = chunks
      .map((c) => `[${c.role}] ${truncate(c.content, 600)}`)
      .join('\n')
      .slice(0, 12_000);

    // 4. LLM call
    const model = env.geminiOverseerModelFree; // cheapest Gemini; falls back to Groq internally
    modelId = model;
    const messages: UniversalMessage[] = [
      { role: 'system', content: DISTILLER_SYSTEM_PROMPT },
      { role: 'user',   content: buildDistillerUser(transcript, existing) },
    ];

    const { text } = await completeGeminiChat({
      model,
      messages,
      temperature: 0.1,
      timeoutMs: 15_000,
    });

    const extracted = parseDistillerJson(text);
    if (!extracted) {
      status = 'error';
      errorMessage = 'extract-parse-failed';
      await writeAuditRun({
        userId, startedAt, chunksScanned, memoriesWritten: 0, memoriesSuperseded: 0,
        policyPatched: false, policyPatch: null, modelId, status, errorMessage,
      });
      return { status, userId, chunksScanned, memoriesWritten, memoriesSuperseded, policyPatch, error: errorMessage };
    }

    // 5. Write memories + supersede similar ones
    for (const mem of extracted.memories) {
      try {
        const vec = await embed768(mem.content);
        if (!vec) continue;

        // Supersede: find an existing memory of the same kind with cosine sim >= 0.9
        const supersedeId = await findSupersedeCandidate(userId, mem.kind, vec);
        if (supersedeId) {
          memoriesSuperseded += 1;
        }

        // Use a recent turn_id as provenance (best-effort).
        const firstTurn = chunks[0]?.turn_id;

        const insertRes = await supabaseRest<Array<{ id: string }>>(
          'POST',
          'user_memories',
          {
            user_id: userId,
            kind: mem.kind,
            content: mem.content,
            embedding: vec,
            importance: Math.min(1, Math.max(0, mem.importance)),
            source_turn_id: firstTurn ?? null,
          },
          { Prefer: 'return=representation' },
        );

        if (insertRes.ok && Array.isArray(insertRes.data) && insertRes.data[0]?.id) {
          memoriesWritten += 1;

          if (supersedeId) {
            await supabaseRest(
              'PATCH',
              `user_memories?id=eq.${encodeURIComponent(supersedeId)}`,
              { superseded_by: insertRes.data[0].id },
              { Prefer: 'return=minimal' },
            );
          }
        }
      } catch (memErr) {
        console.warn('[memoryDistiller] memory insert failed (non-fatal):', memErr);
      }
    }

    // 6. Policy hint
    if (extracted.policy_hint && extracted.policy_hint.confidence >= 0.7) {
      policyPatch = {
        verbosity: extracted.policy_hint.verbosity,
        tone: extracted.policy_hint.tone,
        structurePreference: extracted.policy_hint.structurePreference,
        truthFirstStrictnessDelta: extracted.policy_hint.truthFirstStrictnessDelta,
        preferredComputeDepth: extracted.policy_hint.preferredComputeDepth,
        latencyTolerance: extracted.policy_hint.latencyTolerance,
        confidence: extracted.policy_hint.confidence,
        evidence: extracted.policy_hint.evidence ?? [],
      };
    }

    // 7. Cursor update
    const lastChunk = chunks[chunks.length - 1]!;
    await supabaseRest(
      'POST',
      'memory_distiller_state',
      {
        user_id: userId,
        last_chunk_id: lastChunk.id,
        last_chunk_created_at: lastChunk.created_at,
        last_run_at: new Date().toISOString(),
        run_count: 1, // upsert bumps this via merge
        last_error: null,
      },
      { Prefer: 'resolution=merge-duplicates,return=minimal' },
    );
  } catch (err) {
    status = 'error';
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  await writeAuditRun({
    userId, startedAt, chunksScanned, memoriesWritten, memoriesSuperseded,
    policyPatched: false, // policyAutoWriter will flip this when it applies the patch
    policyPatch, modelId, status, errorMessage,
  });

  return {
    status,
    userId,
    chunksScanned,
    memoriesWritten,
    memoriesSuperseded,
    policyPatch,
    ...(errorMessage ? { error: errorMessage } : {}),
  };
}

/**
 * List users with enough un-distilled chunks to justify a run.
 * Returns [] on any failure.
 */
export async function listUsersNeedingDistillation(limit = 10, minNewChunks = 4): Promise<string[]> {
  if (!env.memoryDistillerEnabled) return [];
  if (!process.env.SUPABASE_URL) return [];
  try {
    const res = await supabaseRest<Array<{ user_id: string; new_chunks: number }>>(
      'POST',
      'rpc/atlas_users_needing_distillation',
      { p_limit: limit, p_min_new_chunks: minNewChunks },
    );
    if (!res.ok || !Array.isArray(res.data)) return [];
    return res.data.map((r) => r.user_id).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Internals ──────────────────────────────────────────────────────────────

async function embed768(text: string): Promise<number[] | null> {
  try {
    const vec = await embedText(text.slice(0, 8_000));
    if (vec.length !== 768) return null;
    if (vec.every((v) => v === 0)) return null;
    return vec;
  } catch {
    return null;
  }
}

async function findSupersedeCandidate(
  userId: string,
  kind: string,
  queryVec: number[],
): Promise<string | null> {
  const res = await supabaseRest<Array<{ source: string; id: string; similarity: number; kind: string }>>(
    'POST',
    'rpc/atlas_recall_memories',
    {
      p_user_id: userId,
      p_query_embed: queryVec,
      p_memory_k: 3,
      p_chunk_k: 0,
      p_chunk_days: 1,
    },
  );
  if (!res.ok || !Array.isArray(res.data)) return null;
  const hit = res.data.find((r) => r.source === 'memory' && r.kind === kind && r.similarity >= 0.9);
  return hit?.id ?? null;
}

function parseDistillerJson(raw: string): DistillerOutput | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    const obj = JSON.parse(cleaned) as unknown;
    const parsed = distillerOutputSchema.safeParse(obj);
    return parsed.success ? parsed.data : null;
  } catch {
    // Try to recover: first top-level {...} block
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const obj = JSON.parse(match[0]) as unknown;
      const parsed = distillerOutputSchema.safeParse(obj);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
}

function truncate(s: string, n: number): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

async function writeAuditRun(params: {
  userId: string;
  startedAt: string;
  chunksScanned: number;
  memoriesWritten: number;
  memoriesSuperseded: number;
  policyPatched: boolean;
  policyPatch: PolicyPatch | null;
  modelId: string;
  status: DistillerRunResult['status'];
  errorMessage?: string | undefined;
}): Promise<void> {
  try {
    await supabaseRest(
      'POST',
      'memory_distiller_runs',
      {
        user_id: params.userId,
        started_at: params.startedAt,
        finished_at: new Date().toISOString(),
        chunks_scanned: params.chunksScanned,
        memories_written: params.memoriesWritten,
        memories_superseded: params.memoriesSuperseded,
        policy_patched: params.policyPatched,
        policy_patch: params.policyPatch ? (params.policyPatch as unknown as Record<string, unknown>) : null,
        model_id: params.modelId,
        status: params.status,
        error_message: params.errorMessage ?? null,
      },
      { Prefer: 'return=minimal' },
    );
  } catch {
    // audit write must never block
  }
}

/** Flip `policy_patched=true` on the most recent run for this user. Non-throwing. */
export async function markPolicyPatched(userId: string, patchApplied: Record<string, unknown>): Promise<void> {
  try {
    // Grab most recent run_id first.
    const recent = await supabaseRest<Array<{ id: string }>>(
      'GET',
      `memory_distiller_runs?user_id=eq.${encodeURIComponent(userId)}&order=started_at.desc&limit=1&select=id`,
    );
    const runId = recent.ok && recent.data?.[0]?.id ? recent.data[0].id : null;
    if (!runId) return;
    await supabaseRest(
      'PATCH',
      `memory_distiller_runs?id=eq.${encodeURIComponent(runId)}`,
      { policy_patched: true, policy_patch: patchApplied },
      { Prefer: 'return=minimal' },
    );
  } catch {
    // ignore
  }
}

// Exported for tests
export const __internal = {
  parseDistillerJson,
  distillerOutputSchema,
  DISTILLER_SYSTEM_PROMPT,
  buildDistillerUser,
};
