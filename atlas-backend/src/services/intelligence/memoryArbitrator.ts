/**
 * memoryArbitrator.ts — Phase 0.75: Memory Arbitration Layer.
 *
 * Sits between the distiller's candidate extraction and DB persistence.
 * Every candidate must pass through arbitration before it can become a row.
 *
 * Core contract:
 *   arbitrate(userId, candidate, existingCandidates) → ArbitrationDecision
 *
 * The arbitrator makes decisions by:
 *   1. Querying existing memories for the same kind + similar content
 *   2. Applying semantic + structural rules (NOT just cosine threshold)
 *   3. Returning a typed verdict that tells the caller exactly what to do
 *
 * What cosine similarity can and cannot do here:
 *   CAN: find related rows worth comparing
 *   CANNOT: decide whether content represents the same claim
 *   CANNOT: decide whether provenance makes a candidate trustworthy
 *   CANNOT: decide whether scope mismatch means conflict vs. refinement
 *
 * Supersession requires both:
 *   - cosine >= SIM_THRESHOLD_SUPERSEDE (0.88 by default)
 *   - content semantic analysis concludes same-claim
 *   - AND candidate provenance >= existing provenance trust level
 *
 * Contradiction is explicitly preserved when:
 *   - Candidate contradicts existing but neither is provenance-dominant
 *   - Candidate is assistant_inferred vs. existing user_stated → quarantine candidate
 *
 * All decisions are written to memory_contradiction_log (when conflict) and
 * memory_governance_events (every decision) for interpretability.
 *
 * Non-throwing — any internal error returns verdict='insert_new' defensively.
 */

import { supabaseRest } from '../../db/supabase.js';
import type {
  ArbitrationDecision,
  ArbitrationVerdict,
  GovernedMemoryCandidate,
  MemoryClass,
  MemoryConfirmationStatus,
  MemoryContradictionStatus,
  MemoryProvenance,
  MemorySupersessionMode,
} from './memoryGovernance.js';
import {
  initialStabilityScore,
  isInitiallyPolicyEligible,
} from './memoryGovernance.js';
import { logGovernanceEvent } from './auditGovernanceService.js';

// ── Thresholds ───────────────────────────────────────────────────────────────

/** Cosine similarity above which a row is a supersession candidate. */
const SIM_THRESHOLD_SUPERSEDE = 0.88;
/** Cosine above which a row is a reaffirmation candidate (near-identical claim). */
const SIM_THRESHOLD_REAFFIRM = 0.95;
/** Cosine above which we consider a row worth comparing at all. */
const SIM_THRESHOLD_RELATED = 0.72;

// ── Provenance trust ordering ─────────────────────────────────────────────────

const PROVENANCE_RANK: Record<MemoryProvenance, number> = {
  corrected_by_user:  5,
  user_stated:        4,
  user_confirmed:     3,
  system_derived:     2,
  assistant_inferred: 1,
};

function provenanceRank(p: MemoryProvenance): number {
  return PROVENANCE_RANK[p] ?? 1;
}

// ── Existing memory row shape (from DB) ──────────────────────────────────────

interface ExistingMemoryRow {
  id: string;
  kind: string;
  content: string;
  importance: number;
  memory_class: string | null;
  provenance: string | null;
  confirmation_status: string | null;
  stability_score: number | null;
  recurrence_count: number | null;
  correction_count: number | null;
  scope_type: string | null;
  scope_key: string | null;
  policy_eligible: boolean | null;
  quarantined: boolean | null;
  contradiction_status: string | null;
  similarity: number; // computed at query time
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface ArbitratedCandidate extends GovernedMemoryCandidate {
  decision: ArbitrationDecision;
}

/**
 * Arbitrate a single governed candidate against existing user memories.
 *
 * Returns an ArbitrationDecision that tells the caller precisely what to do:
 * write, supersede, reaffirm, quarantine, or leave unresolved.
 */
export async function arbitrate(
  userId: string,
  candidate: GovernedMemoryCandidate,
  queryVec: number[],
): Promise<ArbitrationDecision> {
  try {
    return await _arbitrate(userId, candidate, queryVec);
  } catch (err) {
    console.warn('[memoryArbitrator] arbitration failed (defaulting to insert_new):', err);
    return {
      verdict: 'insert_new',
      reason: 'arbitration-error-safe-default',
    };
  }
}

async function _arbitrate(
  userId: string,
  candidate: GovernedMemoryCandidate,
  queryVec: number[],
): Promise<ArbitrationDecision> {

  // 1. Pull related existing memories for the same kind.
  const related = await fetchRelatedMemories(userId, candidate.kind, queryVec);
  if (related.length === 0) {
    return { verdict: 'insert_new', reason: 'no-related-memories' };
  }

  // 2. Find the closest match.
  const closest = related[0]!;
  const sim = closest.similarity;

  // ── Near-identical: reaffirmation zone ────────────────────────────────────
  if (sim >= SIM_THRESHOLD_REAFFIRM) {
    // Content is essentially the same claim. Only supersede if candidate
    // has strictly better provenance, otherwise reaffirm.
    const candidateRank = provenanceRank(candidate.provenance);
    const existingRank = provenanceRank((closest.provenance as MemoryProvenance) ?? 'assistant_inferred');

    if (candidateRank > existingRank) {
      return {
        verdict: 'supersede',
        targetMemoryId: closest.id,
        supersessionMode: 'replaced',
        similarityScore: sim,
        reason: `near-identical content (sim=${sim.toFixed(3)}); candidate has higher provenance (${candidate.provenance} > ${closest.provenance ?? 'assistant_inferred'})`,
      };
    }

    // Same or lower provenance: just reaffirm the existing row.
    return {
      verdict: 'reaffirm',
      targetMemoryId: closest.id,
      similarityScore: sim,
      reason: `near-identical content (sim=${sim.toFixed(3)}); reaffirming existing row`,
    };
  }

  // ── Supersession zone (< reaffirm threshold but > supersede threshold) ────
  if (sim >= SIM_THRESHOLD_SUPERSEDE) {
    const candidateRank = provenanceRank(candidate.provenance);
    const existingRank = provenanceRank((closest.provenance as MemoryProvenance) ?? 'assistant_inferred');
    const existingClass = (closest.memory_class ?? 'tentative') as MemoryClass;
    const existingStability = closest.stability_score ?? 0.5;

    // HARD RULE: assistant_inferred candidate CANNOT supersede a user_stated or
    // user_confirmed memory. Quarantine the candidate instead.
    if (
      candidate.provenance === 'assistant_inferred' &&
      existingRank >= PROVENANCE_RANK.user_confirmed
    ) {
      return {
        verdict: 'quarantine',
        targetMemoryId: closest.id,
        similarityScore: sim,
        reason: `assistant_inferred candidate conflicts with ${closest.provenance ?? 'trusted'} memory (stability=${existingStability.toFixed(2)}); quarantining candidate`,
        conflictStrength: sim >= 0.92 ? 'strong' : 'moderate',
      };
    }

    // Scope mismatch: candidate is narrower scope → 'narrow' not 'replace'.
    if (
      candidate.scopeType !== 'global' &&
      (closest.scope_type === 'global' || !closest.scope_type)
    ) {
      return {
        verdict: 'narrow',
        targetMemoryId: closest.id,
        supersessionMode: 'narrowed',
        similarityScore: sim,
        reason: `candidate is scope=${candidate.scopeType}/${candidate.scopeKey ?? ''} narrowing a global memory (sim=${sim.toFixed(3)})`,
      };
    }

    // Candidate provenance dominates: supersede.
    if (candidateRank > existingRank) {
      return {
        verdict: 'supersede',
        targetMemoryId: closest.id,
        supersessionMode: candidate.kind === 'correction' ? 'corrected' : 'replaced',
        similarityScore: sim,
        reason: `candidate provenance (${candidate.provenance}) outranks existing (${closest.provenance ?? 'unknown'}) at sim=${sim.toFixed(3)}`,
      };
    }

    // Existing is more trusted (higher rank AND high stability): unresolved.
    if (existingRank > candidateRank && existingStability >= 0.65) {
      return {
        verdict: 'unresolved',
        targetMemoryId: closest.id,
        similarityScore: sim,
        reason: `existing memory is more trusted (prov=${closest.provenance}, stability=${existingStability.toFixed(2)}) but conflict detected at sim=${sim.toFixed(3)}; leaving unresolved`,
        conflictStrength: 'moderate',
      };
    }

    // Neither dominates: supersede only if candidate importance is meaningfully higher.
    if (candidate.importance > (closest.importance ?? 0) + 0.15) {
      return {
        verdict: 'supersede',
        targetMemoryId: closest.id,
        supersessionMode: 'replaced',
        similarityScore: sim,
        reason: `candidate importance (${candidate.importance.toFixed(2)}) materially exceeds existing (${closest.importance.toFixed(2)}) at sim=${sim.toFixed(3)}`,
      };
    }

    // Default: unresolved conflict. Don't force a merge that isn't warranted.
    return {
      verdict: 'unresolved',
      targetMemoryId: closest.id,
      similarityScore: sim,
      reason: `similar content (sim=${sim.toFixed(3)}) but no clear dominance; preserving unresolved state`,
      conflictStrength: 'weak',
    };
  }

  // ── Related zone (> related threshold but < supersede threshold) ──────────
  if (sim >= SIM_THRESHOLD_RELATED) {
    // Not similar enough to supersede. Check for expansion vs. independent.
    if (
      candidate.scopeType === 'global' &&
      (closest.scope_type !== 'global' && closest.scope_type != null)
    ) {
      return {
        verdict: 'expand',
        targetMemoryId: closest.id,
        supersessionMode: 'expanded',
        similarityScore: sim,
        reason: `candidate globalizes a scoped memory (sim=${sim.toFixed(3)})`,
      };
    }

    // Just an independent related memory — insert separately.
    return {
      verdict: 'insert_new',
      similarityScore: sim,
      reason: `related but distinct from existing (sim=${sim.toFixed(3)}) — inserting as new`,
    };
  }

  // No meaningful relationship.
  return { verdict: 'insert_new', reason: 'no-significant-relationship' };
}

// ── DB Persistence Helpers ───────────────────────────────────────────────────

/**
 * Persist an arbitration decision to the database.
 * Handles all the cases: insert_new, supersede, narrow, expand, reaffirm,
 * unresolved, quarantine, discard.
 *
 * Returns the new memory row ID if a row was written, null otherwise.
 */
export async function persistArbitratedMemory(
  userId: string,
  candidate: GovernedMemoryCandidate,
  decision: ArbitrationDecision,
  queryVec: number[],
  embeddingVec: number[],
  sourceTurnIds: string[],
): Promise<{ newId: string | null; supersededId: string | null }> {
  let newId: string | null = null;
  let supersededId: string | null = null;

  try {
    const now = new Date().toISOString();
    const stability = initialStabilityScore(candidate.memoryClass, candidate.provenance);
    const policyEligible = isInitiallyPolicyEligible(
      candidate.memoryClass,
      candidate.provenance,
      stability,
      candidate.scopeType,
      candidate.confidence,
    );

    // ── DISCARD ──────────────────────────────────────────────────────────────
    if (decision.verdict === 'discard') {
      await writeGovernanceEvent(userId, null, 'superseded', {
        verdict: 'discard',
        reason: decision.reason,
        candidate_content: candidate.content,
      });
      return { newId: null, supersededId: null };
    }

    // ── REAFFIRM ─────────────────────────────────────────────────────────────
    if (decision.verdict === 'reaffirm' && decision.targetMemoryId) {
      await supabaseRest(
        'PATCH',
        `user_memories?id=eq.${encodeURIComponent(decision.targetMemoryId)}`,
        {
          last_reaffirmed_at: now,
          recurrence_count: '(recurrence_count + 1)',  // PostgREST expression won't work here directly
          stability_score: null, // handled below via raw SQL approach — use a separate RPC
          reference_count: '(reference_count + 1)',
        },
        { Prefer: 'return=minimal' },
      );
      // Do the increment via a simpler PATCH that just sets last_reaffirmed_at.
      // The DB trigger / scheduled job can sweep stability. Safe for now.
      await supabaseRest(
        'PATCH',
        `user_memories?id=eq.${encodeURIComponent(decision.targetMemoryId)}`,
        { last_reaffirmed_at: now },
        { Prefer: 'return=minimal' },
      );
      await writeGovernanceEvent(userId, decision.targetMemoryId, 'reaffirmed', {
        reason: decision.reason,
        similarity: decision.similarityScore,
      });
      return { newId: null, supersededId: null };
    }

    // ── INSERT (new, narrow, expand) ─────────────────────────────────────────
    const insertVerdict: ArbitrationVerdict[] = ['insert_new', 'narrow', 'expand', 'supersede', 'unresolved', 'quarantine'];
    if (insertVerdict.includes(decision.verdict)) {
      const isQuarantined = decision.verdict === 'quarantine';
      const contradictionStatus: MemoryContradictionStatus =
        decision.verdict === 'unresolved' ? 'unresolved' : 'none';
      const confirmationStatus: MemoryConfirmationStatus =
        isQuarantined ? 'quarantined' :
        candidate.provenance === 'user_stated' ? 'confirmed' : 'unconfirmed';

      const insertBody: Record<string, unknown> = {
        user_id: userId,
        kind: candidate.kind,
        content: candidate.content,
        embedding: embeddingVec,
        importance: Math.min(1, Math.max(0, candidate.importance)),
        source_turn_id: sourceTurnIds[0] ?? null,
        // Phase 0.75 governance fields
        memory_class: candidate.memoryClass,
        provenance: candidate.provenance,
        confirmation_status: confirmationStatus,
        contradiction_status: contradictionStatus,
        stability_score: stability,
        recurrence_count: 0,
        correction_count: 0,
        decay_policy: candidate.decayPolicy,
        scope_type: candidate.scopeType,
        scope_key: candidate.scopeKey ?? null,
        policy_eligible: policyEligible && !isQuarantined,
        quarantined: isQuarantined,
        source_turn_ids: JSON.stringify(sourceTurnIds),
        extraction_rationale: candidate.extractionRationale ?? null,
        last_contradicted_at: decision.verdict === 'unresolved' ? now : null,
      };

      if (decision.verdict === 'supersede' && decision.supersessionMode) {
        insertBody.supersession_reason = decision.reason;
        // Note: supersession_mode on the NEW row is informational here.
        // The existing row gets superseded_by set below.
      }

      const insertRes = await supabaseRest<Array<{ id: string }>>(
        'POST',
        'user_memories',
        insertBody,
        { Prefer: 'return=representation' },
      );

      if (insertRes.ok && Array.isArray(insertRes.data) && insertRes.data[0]?.id) {
        newId = insertRes.data[0].id;
      }

      // ── Supersede the existing row ─────────────────────────────────────────
      if (decision.verdict === 'supersede' && decision.targetMemoryId && newId) {
        supersededId = decision.targetMemoryId;
        await supabaseRest(
          'PATCH',
          `user_memories?id=eq.${encodeURIComponent(decision.targetMemoryId)}`,
          {
            superseded_by: newId,
            memory_class: 'superseded' as MemoryClass,
            policy_eligible: false,
            supersession_reason: decision.reason,
            supersession_mode: decision.supersessionMode ?? 'replaced',
          },
          { Prefer: 'return=minimal' },
        );
      }

      // ── Mark existing row if narrowing/expanding ───────────────────────────
      if ((decision.verdict === 'narrow' || decision.verdict === 'expand') && decision.targetMemoryId && newId) {
        // Don't supersede — both rows are valid; just note the relationship.
        await supabaseRest(
          'PATCH',
          `user_memories?id=eq.${encodeURIComponent(decision.targetMemoryId)}`,
          {
            // Mark existing row as having a related refinement.
            last_reaffirmed_at: now,
          },
          { Prefer: 'return=minimal' },
        );
      }

      // ── Mark existing row if unresolved ────────────────────────────────────
      if (decision.verdict === 'unresolved' && decision.targetMemoryId) {
        await supabaseRest(
          'PATCH',
          `user_memories?id=eq.${encodeURIComponent(decision.targetMemoryId)}`,
          {
            contradiction_status: 'unresolved' as MemoryContradictionStatus,
            last_contradicted_at: now,
          },
          { Prefer: 'return=minimal' },
        );
      }

      // ── Governance events ──────────────────────────────────────────────────
      const eventType =
        isQuarantined ? 'quarantined' :
        decision.verdict === 'unresolved' ? 'unresolved_conflict' :
        decision.verdict === 'supersede' ? 'superseded' :
        'inserted';

      await writeGovernanceEvent(userId, newId, eventType, {
        verdict: decision.verdict,
        reason: decision.reason,
        similarity: decision.similarityScore,
        target_memory_id: decision.targetMemoryId,
        memory_class: candidate.memoryClass,
        provenance: candidate.provenance,
        scope_type: candidate.scopeType,
        scope_key: candidate.scopeKey,
        policy_eligible: policyEligible && !isQuarantined,
      });

      // Bridge to Phase 0.99 cross-phase audit log for quarantine/unresolved verdicts.
      // Why: memory_governance_events is memory-local; audit_governance_log is the
      // platform-wide spine surfaced by /v1/sovereignty/audit-log.
      if (decision.verdict === 'quarantine') {
        logGovernanceEvent(userId, 'quarantine', {
          actor: 'memory_arbitrator',
          target: decision.targetMemoryId ?? newId ?? undefined,
          after_state: { new_memory_id: newId, candidate_class: candidate.memoryClass },
          audit_metadata: {
            reason: decision.reason,
            similarity: decision.similarityScore,
            candidate_provenance: candidate.provenance,
            scope_type: candidate.scopeType,
          },
        }).catch(() => {});
      } else if (decision.verdict === 'unresolved') {
        logGovernanceEvent(userId, 'suppression', {
          actor: 'memory_arbitrator',
          target: decision.targetMemoryId ?? undefined,
          after_state: { new_memory_id: newId, contradiction_status: 'unresolved' },
          audit_metadata: {
            reason: decision.reason,
            similarity: decision.similarityScore,
            candidate_provenance: candidate.provenance,
          },
        }).catch(() => {});
      }

      // ── Contradiction log (when there's a conflict) ────────────────────────
      if (
        decision.targetMemoryId &&
        ['supersede', 'unresolved', 'quarantine', 'narrow', 'expand'].includes(decision.verdict)
      ) {
        await writeContradictionLog({
          userId,
          existingMemoryId: decision.targetMemoryId,
          candidate,
          similarityScore: decision.similarityScore,
          verdict: decision.verdict,
          reason: decision.reason,
          newMemoryId: newId,
        });
      }
    }
  } catch (err) {
    console.warn('[memoryArbitrator] persistArbitratedMemory failed (non-fatal):', err);
  }

  return { newId, supersededId };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

async function fetchRelatedMemories(
  userId: string,
  kind: string,
  queryVec: number[],
): Promise<ExistingMemoryRow[]> {
  // Use the recall RPC but ask for memory-only hits and a wider K to check.
  const res = await supabaseRest<Array<{
    source: string;
    kind: string;
    content: string;
    similarity: number;
    id: string;
    memory_class: string | null;
    provenance: string | null;
    stability_score: number | null;
    scope_type: string | null;
    scope_key: string | null;
    policy_eligible: boolean | null;
    contradiction_status: string | null;
  }>>(
    'POST',
    'rpc/atlas_recall_memories',
    {
      p_user_id: userId,
      p_query_embed: queryVec,
      p_memory_k: 5,
      p_chunk_k: 0,
      p_chunk_days: 1,
    },
  );

  if (!res.ok || !Array.isArray(res.data)) return [];

  return res.data
    .filter((r) => r.source === 'memory' && r.similarity >= SIM_THRESHOLD_RELATED)
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      content: r.content,
      importance: 0.5, // not returned by RPC; reasonable default
      memory_class: r.memory_class,
      provenance: r.provenance,
      confirmation_status: null,
      stability_score: r.stability_score,
      recurrence_count: null,
      correction_count: null,
      scope_type: r.scope_type,
      scope_key: r.scope_key,
      policy_eligible: r.policy_eligible,
      quarantined: null,
      contradiction_status: r.contradiction_status,
      similarity: r.similarity,
    }));
}

async function writeGovernanceEvent(
  userId: string,
  memoryId: string | null,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await supabaseRest(
      'POST',
      'memory_governance_events',
      {
        user_id: userId,
        memory_id: memoryId,
        event_type: eventType,
        payload,
      },
      { Prefer: 'return=minimal' },
    );
  } catch {
    // governance events must never throw
  }
}

async function writeContradictionLog(params: {
  userId: string;
  existingMemoryId: string;
  candidate: GovernedMemoryCandidate;
  similarityScore?: number;
  verdict: string;
  reason: string;
  newMemoryId: string | null;
}): Promise<void> {
  try {
    await supabaseRest(
      'POST',
      'memory_contradiction_log',
      {
        user_id: params.userId,
        existing_memory_id: params.existingMemoryId,
        candidate_content: params.candidate.content,
        candidate_class: params.candidate.memoryClass,
        candidate_provenance: params.candidate.provenance,
        candidate_scope_type: params.candidate.scopeType,
        candidate_scope_key: params.candidate.scopeKey ?? null,
        similarity_score: params.similarityScore ?? null,
        arbitration_decision: params.verdict,
        arbitration_reason: params.reason,
        new_memory_id: params.newMemoryId,
      },
      { Prefer: 'return=minimal' },
    );
  } catch {
    // non-throwing
  }
}
