/**
 * memoryDistiller.ts — Phase 0.5 + Phase 0.75 Memory Distiller.
 *
 * Phase 0.75 changes from Phase 0.5:
 *   - LLM schema now requests governance metadata per candidate:
 *     provenance_hint, scope_type, scope_key, confidence, rationale
 *   - Every candidate passes through memoryArbitrator before DB write
 *   - Cosine similarity is NO LONGER the sole supersession rule
 *   - Assistant-originated chunks are tagged as assistant_inferred and
 *     quarantined if they would overwrite user-trusted memories
 *   - Contradictions are logged, not silently dropped
 *   - Audit row now tracks quarantined count + contradiction counts
 *   - Policy hints are only emitted if they survive governance checks
 *
 * Phase 0.5 contract preserved:
 *   - Non-throwing at the outer layer
 *   - Flag-gated (env.memoryDistillerEnabled)
 *   - 15s LLM hard cap
 *   - Incremental cursor via memory_distiller_state
 *   - Zod-validated LLM output
 */

import { z } from 'zod';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import { embedText } from './embeddingService.js';
import { completeGeminiChat } from './universalAdapter.js';
import type { UniversalMessage } from './universalAdapter.js';
import {
  classifyMemory,
  assignDecayPolicy,
  inferScopeType,
  initialStabilityScore,
  isInitiallyPolicyEligible,
  provenanceFromRoles,
  memoryClassSchema,
  memoryProvenanceSchema,
  memoryScopeTypeSchema,
  type GovernedMemoryCandidate,
  type MemoryProvenance,
  type MemoryScopeType,
} from './memoryGovernance.js';
import {
  arbitrate,
  persistArbitratedMemory,
} from './memoryArbitrator.js';

// ── Types ───────────────────────────────────────────────────────────────────

export type MemoryKind = 'preference' | 'fact' | 'pattern' | 'correction' | 'goal';

export interface PolicyPatch {
  verbosity?: 'low' | 'medium' | 'high';
  tone?: string;
  structurePreference?: 'minimal' | 'balanced' | 'structured';
  truthFirstStrictnessDelta?: number;
  preferredComputeDepth?: 'Light' | 'Heavy';
  latencyTolerance?: 'Low' | 'High';
  confidence: number;
  evidence: readonly string[];
  // Phase 0.75: governance metadata on the policy hint
  governanceClass?: string;
  scopeType?: string;
}

export interface DistillerRunResult {
  status: 'ok' | 'skip' | 'partial' | 'error';
  userId: string;
  chunksScanned: number;
  memoriesWritten: number;
  memoriesSuperseded: number;
  memoriesQuarantined: number;
  contradictionsFound: number;
  contradictionsUnresolved: number;
  policyPatch: PolicyPatch | null;
  error?: string;
}

// ── LLM schema (Phase 0.75 upgraded) ────────────────────────────────────────

const extractedMemorySchema = z.object({
  kind: z.enum(['preference', 'fact', 'pattern', 'correction', 'goal']),
  content: z.string().min(4).max(600),
  importance: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  // Phase 0.75: distiller now hints at scope; arbitrator makes final decision.
  scope_type: memoryScopeTypeSchema.optional().default('global'),
  scope_key: z.string().max(120).optional(),
  // Provenance hint — distiller can only hint 'user_stated' or 'assistant_inferred'.
  // Final provenance is computed by provenanceFromRoles() using chunk metadata.
  provenance_hint: z.enum(['user_stated', 'assistant_inferred']).optional(),
  rationale: z.string().max(300).optional(),
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
  scope_type: memoryScopeTypeSchema.optional().default('global'),
}).partial().extend({
  confidence: z.number().min(0).max(1),
});

const distillerOutputSchema = z.object({
  memories: z.array(extractedMemorySchema).max(12),
  policy_hint: policyHintSchema.nullable().optional(),
});

type DistillerOutput = z.infer<typeof distillerOutputSchema>;

// ── Prompts (Phase 0.75 — governance-aware) ──────────────────────────────────

const DISTILLER_SYSTEM_PROMPT = `You are a memory distiller for Atlas — an AI system that evolves per user.

Your job: read a short slice of a user's recent conversation with Atlas and extract DURABLE facts/preferences/patterns/corrections/goals about THIS USER that should persist across sessions.

CRITICAL RULES:
- You may ONLY extract signals that originate from the USER's messages, not from Atlas's responses.
- If a claim about the user appears only in Atlas's output, set provenance_hint="assistant_inferred" and importance <= 0.4.
- DO NOT extract ephemeral task state ("user wants to know X right now").
- DO NOT globalize scoped preferences ("for this project, keep it concise" → scope_type="project", NOT global preference).
- Return {"memories": [], "policy_hint": null} if nothing durable is present.

OUTPUT FORMAT — strict JSON, no prose, no code fences:
{
  "memories": [
    {
      "kind": "preference"|"fact"|"pattern"|"correction"|"goal",
      "content": "<one self-contained sentence about the user; no 'the user said'>",
      "importance": 0.0-1.0,
      "confidence": 0.0-1.0,
      "scope_type": "global"|"topic"|"chamber"|"project"|"session",
      "scope_key": "<topic/project name if scoped, else omit>",
      "provenance_hint": "user_stated"|"assistant_inferred",
      "rationale": "<brief reason for extraction>"
    }
  ],
  "policy_hint": {
    "verbosity":             "low"|"medium"|"high",
    "tone":                  "warm"|"direct"|"analytical"|"professional",
    "structurePreference":   "minimal"|"balanced"|"structured",
    "truthFirstStrictnessDelta": -0.15..+0.15,
    "preferredComputeDepth": "Light"|"Heavy",
    "latencyTolerance":      "Low"|"High",
    "confidence":            0.0-1.0,
    "evidence":              ["<verbatim excerpt>"],
    "scope_type":            "global"|"topic"|"session"
  }
}

MEMORY RULES:
- importance 0.9+ = explicit correction or strong repeated preference.
- importance 0.6-0.8 = clear preference stated multiple times.
- importance 0.3-0.5 = single incidental mention.
- confidence < 0.5 → do not emit at all.
- provenance_hint="assistant_inferred" → importance must be <= 0.4.
- scope_type: session=only this conversation, project=named repo/project, topic=subject area, global=always applies.

POLICY HINT RULES:
- policy_hint.confidence >= 0.8 ONLY when user explicitly and clearly stated a preference.
- policy_hint.scope_type must be "global" before this can affect user-level policy.
- Do NOT emit a policy_hint for session or project-scoped observations.

Write memory.content in third person: "Prefers concise answers" NOT "The user said to be concise".`;

function buildDistillerUser(
  transcript: string,
  existingMemories: string[],
  hasAssistantChunks: boolean,
): string {
  const warning = hasAssistantChunks
    ? '\n\nWARNING: This transcript includes Atlas assistant turns. Extract ONLY signals from [user] turns. Do not treat Atlas\'s characterizations of the user as user-stated facts.\n'
    : '';

  const prior = existingMemories.length
    ? `\n\n--- EXISTING_DURABLE_MEMORIES (do NOT re-emit unless corrected) ---\n${existingMemories.slice(0, 20).map((m, i) => `${i + 1}. ${m}`).join('\n')}`
    : '';

  return `--- RECENT_CONVERSATION (oldest→newest) ---\n${transcript}${warning}${prior}\n\nExtract durable memories and any reliable policy_hint. Return JSON only.`;
}

// ── Public entry point ───────────────────────────────────────────────────────

export async function distillUserMemories(userId: string): Promise<DistillerRunResult> {
  const empty: DistillerRunResult = {
    status: 'skip',
    userId,
    chunksScanned: 0,
    memoriesWritten: 0,
    memoriesSuperseded: 0,
    memoriesQuarantined: 0,
    contradictionsFound: 0,
    contradictionsUnresolved: 0,
    policyPatch: null,
  };

  if (!env.memoryDistillerEnabled) return empty;
  if (!userId) return empty;
  if (!process.env.SUPABASE_URL) return empty;
  if (!env.geminiApiKey) {
    return { ...empty, status: 'skip', error: 'gemini-key-missing' };
  }

  const startedAt = new Date().toISOString();
  let chunksScanned = 0;
  let memoriesWritten = 0;
  let memoriesSuperseded = 0;
  let memoriesQuarantined = 0;
  let contradictionsFound = 0;
  let contradictionsUnresolved = 0;
  let policyPatch: PolicyPatch | null = null;
  let modelId = env.geminiOverseerModelFree ?? 'gemini-2.0-flash-lite';
  let status: DistillerRunResult['status'] = 'ok';
  let errorMessage: string | undefined;
  // Hoisted so it's accessible in the outer catch / audit write scope.
  let chunkBasedProvenance: ReturnType<typeof provenanceFromRoles> = 'assistant_inferred';

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
    const chunksRes = await supabaseRest<Array<{
      id: string;
      turn_id: string;
      role: string;
      content: string;
      created_at: string;
    }>>(
      'POST',
      'rpc/atlas_pending_distiller_chunks',
      { p_user_id: userId, p_after_chunk: cursor, p_limit: 40 },
    );

    if (!chunksRes.ok || !Array.isArray(chunksRes.data) || chunksRes.data.length === 0) {
      return { ...empty, status: 'skip' };
    }
    const chunks = chunksRes.data;
    chunksScanned = chunks.length;

    // Track which turns are user-origin vs assistant-origin for provenance.
    const rolesByTurnId = new Map<string, Set<string>>();
    for (const c of chunks) {
      if (!rolesByTurnId.has(c.turn_id)) rolesByTurnId.set(c.turn_id, new Set());
      rolesByTurnId.get(c.turn_id)!.add(c.role);
    }

    const hasAssistantChunks = chunks.some((c) => c.role === 'assistant');
    chunkBasedProvenance = provenanceFromRoles(chunks.map((c) => c.role));

    // 3. Existing memories for no-redundancy hint
    const existingRes = await supabaseRest<Array<{ content: string }>>(
      'GET',
      `user_memories?user_id=eq.${encodeURIComponent(userId)}&superseded_by=is.null&quarantined=eq.false&select=content&order=importance.desc&limit=20`,
    );
    const existing = existingRes.ok && Array.isArray(existingRes.data)
      ? existingRes.data.map((r) => r.content).filter(Boolean)
      : [];

    // 4. Build transcript — ONLY include user turns for extraction fidelity.
    // We still pass assistant turns for context, but we warn the LLM.
    const transcript = chunks
      .map((c) => `[${c.role}] ${truncate(c.content, 600)}`)
      .join('\n')
      .slice(0, 12_000);

    // 5. LLM call
    const model = env.geminiOverseerModelFree ?? 'gemini-2.0-flash-lite';
    modelId = model;
    const messages: UniversalMessage[] = [
      { role: 'system', content: DISTILLER_SYSTEM_PROMPT },
      { role: 'user',   content: buildDistillerUser(transcript, existing, hasAssistantChunks) },
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
        memoriesQuarantined: 0, contradictionsFound: 0, contradictionsUnresolved: 0,
        policyPatched: false, policyPatch: null, modelId, status, errorMessage,
      });
      return { status, userId, chunksScanned, memoriesWritten, memoriesSuperseded, memoriesQuarantined, contradictionsFound, contradictionsUnresolved, policyPatch, error: errorMessage };
    }

    // 6. Process each extracted memory through governance + arbitration
    const allTurnRoles = chunks.map((c) => c.role);
    const sourceTurnIds = [...new Set(chunks.map((c) => c.turn_id))];

    for (const mem of extracted.memories) {
      try {
        // Skip low-confidence candidates entirely.
        if (mem.confidence < 0.45) continue;

        // Hard cap: assistant_inferred cannot have importance > 0.4.
        const importance = mem.provenance_hint === 'assistant_inferred'
          ? Math.min(0.4, mem.importance)
          : Math.min(1, mem.importance);

        // Determine real provenance from chunk roles (not just LLM hint).
        const chunkBasedProvenanceForTurn = provenanceFromRoles(allTurnRoles);

        // Reconcile: LLM provenance hint + chunk roles.
        // If chunks are mixed user+assistant and LLM says user_stated, be conservative.
        let provenance: MemoryProvenance;
        if (mem.provenance_hint === 'assistant_inferred') {
          provenance = 'assistant_inferred';
        } else if (chunkBasedProvenanceForTurn === 'user_stated') {
          provenance = 'user_stated';
        } else {
          // mixed or assistant-only turns → conservative downgrade
          provenance = chunkBasedProvenanceForTurn;
        }

        // Infer scope from content if LLM didn't provide one.
        const scopeTypeFromContent = inferScopeType(mem.content);
        const scopeType: MemoryScopeType = mem.scope_type ?? scopeTypeFromContent.scopeType;
        const scopeKey = mem.scope_key ?? (scopeType !== 'global' ? scopeTypeFromContent.scopeKey : undefined);

        // Classify memory.
        const memoryClass = classifyMemory(provenance, mem.kind, mem.content, importance);
        const decayPolicy = assignDecayPolicy(memoryClass, scopeType);

        // Embed.
        const embVec = await embed768(mem.content);
        if (!embVec) continue;

        // Build governed candidate.
        const candidate: GovernedMemoryCandidate = {
          kind: mem.kind,
          content: mem.content,
          memoryClass,
          provenance,
          scopeType,
          scopeKey: scopeKey || undefined,
          decayPolicy,
          confidence: mem.confidence,
          importance,
          sourceTurnIds,
          extractionRationale: mem.rationale,
          policyEligibleCandidate: isInitiallyPolicyEligible(
            memoryClass,
            provenance,
            initialStabilityScore(memoryClass, provenance),
            scopeType,
            mem.confidence,
          ),
        };

        // Arbitrate.
        const decision = await arbitrate(userId, candidate, embVec);

        // Persist the arbitration result.
        const { newId, supersededId } = await persistArbitratedMemory(
          userId,
          candidate,
          decision,
          embVec,
          embVec,
          sourceTurnIds,
        );

        // Track counts for audit row.
        if (decision.verdict === 'insert_new' || decision.verdict === 'narrow' || decision.verdict === 'expand') {
          if (newId) memoriesWritten += 1;
        } else if (decision.verdict === 'supersede') {
          if (newId) memoriesWritten += 1;
          if (supersededId) memoriesSuperseded += 1;
          contradictionsFound += 1;
        } else if (decision.verdict === 'quarantine') {
          memoriesQuarantined += 1;
          contradictionsFound += 1;
        } else if (decision.verdict === 'unresolved') {
          if (newId) memoriesWritten += 1;
          contradictionsFound += 1;
          contradictionsUnresolved += 1;
        } else if (decision.verdict === 'reaffirm') {
          // No new row written; stability bumped on existing.
        }
        // discard → nothing to count.

      } catch (memErr) {
        console.warn('[memoryDistiller] memory processing failed (non-fatal):', memErr);
      }
    }

    // 7. Policy hint — Phase 0.75 governance gate.
    if (extracted.policy_hint && extracted.policy_hint.confidence >= 0.7) {
      const hint = extracted.policy_hint;

      // CRITICAL: Policy hints from session/project scope must not write global policy.
      const hintScope = hint.scope_type ?? 'global';
      const hintIsGlobal = hintScope === 'global';

      // CRITICAL: Reject policy hints that originated from assistant-only chunks.
      const policyProvenanceOk = chunkBasedProvenance !== 'assistant_inferred';

      if (hintIsGlobal && policyProvenanceOk) {
        policyPatch = {
          verbosity: hint.verbosity,
          tone: hint.tone,
          structurePreference: hint.structurePreference,
          truthFirstStrictnessDelta: hint.truthFirstStrictnessDelta,
          preferredComputeDepth: hint.preferredComputeDepth,
          latencyTolerance: hint.latencyTolerance,
          confidence: hint.confidence,
          evidence: hint.evidence ?? [],
          scopeType: hintScope,
        };
      } else {
        console.info(
          `[memoryDistiller] policy_hint suppressed: scope=${hintScope}, policyProvenanceOk=${policyProvenanceOk}`,
        );
      }
    }

    // 8. Advance cursor.
    const lastChunk = chunks[chunks.length - 1]!;
    await supabaseRest(
      'POST',
      'memory_distiller_state',
      {
        user_id: userId,
        last_chunk_id: lastChunk.id,
        last_chunk_created_at: lastChunk.created_at,
        last_run_at: new Date().toISOString(),
        run_count: 1,
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
    memoriesQuarantined, contradictionsFound, contradictionsUnresolved,
    policyPatched: false, policyPatch, modelId, status, errorMessage,
  });

  return {
    status,
    userId,
    chunksScanned,
    memoriesWritten,
    memoriesSuperseded,
    memoriesQuarantined,
    contradictionsFound,
    contradictionsUnresolved,
    policyPatch,
    ...(errorMessage ? { error: errorMessage } : {}),
  };
}

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

// ── Internals ─────────────────────────────────────────────────────────────────

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
  memoriesQuarantined: number;
  contradictionsFound: number;
  contradictionsUnresolved: number;
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
        memories_quarantined: params.memoriesQuarantined,
        contradictions_found: params.contradictionsFound,
        contradictions_unresolved: params.contradictionsUnresolved,
        policy_patched: params.policyPatched,
        policy_patch: params.policyPatch ? (params.policyPatch as unknown as Record<string, unknown>) : null,
        model_id: params.modelId,
        status: params.status,
        error_message: params.errorMessage ?? null,
        governance_version: '0.75',
      },
      { Prefer: 'return=minimal' },
    );
  } catch {
    // audit write must never block
  }
}

export async function markPolicyPatched(userId: string, patchApplied: Record<string, unknown>): Promise<void> {
  try {
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
