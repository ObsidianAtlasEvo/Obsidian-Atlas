/**
 * identityResolutionService.ts — Phase 0.8: Consumes governed memories and
 * produces resolved identity state per domain.
 *
 * Pipeline:
 *   governed user_memories
 *     → group by IdentityDomain
 *     → for each domain: pick signals, compute aggregate confidence/stability
 *     → upsert user_identity_domains
 *     → write identity_diff_log on changes
 *
 * Design invariants:
 *   - All Supabase calls guarded by env.memoryLayerEnabled.
 *   - assistant_inferred signals: max confidence cap 0.45.
 *   - session-scoped signals: never contribute to global identity.
 *   - correction_priority > 0 signals always override lower-priority in same domain+scope.
 *   - Cache-first getResolvedIdentity() — re-resolves if updated_at > 5 min ago.
 *   - No throwing at the outer layer.
 */

import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import { type RecalledRow } from './memoryService.js';
import {
  type IdentityDomain,
  type ResolvedIdentityDomain,
  type ScopeResolution,
  type ExplicitnessLevel,
  computeIdentityWeight,
  correctionPriorityScore,
  inferDomainFromContent,
} from './identityGovernance.js';
import { writeDiff } from './identityDiffService.js';

// ── Types ────────────────────────────────────────────────────────────────────

/** A single identity signal derived from a governed memory row. */
interface DerivedSignal {
  memoryId: string;
  content: string;
  domain: IdentityDomain;
  provenance: string;
  scopeType: string;
  scopeKey?: string;
  confidence: number;
  stability: number;
  identityWeight: number;
  correctionPriority: number;
  explicitnessLevel: ExplicitnessLevel;
}

// ── DB row shape ─────────────────────────────────────────────────────────────

interface RawIdentityDomainRow {
  id: string;
  user_id: string;
  domain: string;
  confidence: number;
  stability: number;
  scope_type: string;
  scope_key?: string | null;
  last_changed_at: string;
  contradiction_status: string;
  resolution_version: string;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Re-resolve if the domain record is older than this (5 minutes). */
const STALENESS_MS = 5 * 60 * 1000;

/** Maximum identity weight for assistant_inferred signals. */
const ASSISTANT_INFERRED_CAP = 0.45;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Full resolution pass: reads non-quarantined user_memories, groups by domain,
 * computes aggregate state per domain, and upserts into user_identity_domains.
 *
 * Returns the resolved domain array on success, empty array on failure.
 */
export async function resolveIdentityForUser(
  userId: string,
): Promise<ResolvedIdentityDomain[]> {
  if (!env.memoryLayerEnabled) return [];
  if (!process.env.SUPABASE_URL) return [];
  if (!userId) return [];

  try {
    // 1. Fetch active, non-quarantined memories.
    const memories = await fetchGovernedMemories(userId);
    if (memories.length === 0) return [];

    // 2. Derive signals, group by domain.
    const byDomain = groupByDomain(memories);

    // 3. Resolve each domain and upsert.
    const results: ResolvedIdentityDomain[] = [];
    for (const [domain, domainMemories] of byDomain.entries()) {
      const resolved = await resolveDomainSignals(userId, domain, domainMemories);
      results.push(resolved);
    }

    return results;
  } catch (err) {
    console.warn('[identityResolutionService] resolveIdentityForUser threw:',
      err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Cache-first read: returns stored domain rows, re-resolves if stale (> 5 min).
 */
export async function getResolvedIdentity(
  userId: string,
): Promise<ResolvedIdentityDomain[]> {
  if (!env.memoryLayerEnabled) return [];
  if (!process.env.SUPABASE_URL) return [];
  if (!userId) return [];

  try {
    const res = await supabaseRest<RawIdentityDomainRow[]>(
      'GET',
      `user_identity_domains?user_id=eq.${encodeURIComponent(userId)}&order=domain.asc`,
    );

    if (!res.ok || !Array.isArray(res.data) || res.data.length === 0) {
      // No cached rows — run full resolution.
      return resolveIdentityForUser(userId);
    }

    // Check staleness: if ANY row is stale, re-resolve all.
    const now = Date.now();
    const anyStale = res.data.some((row) => {
      const age = now - new Date(row.updated_at).getTime();
      return age > STALENESS_MS;
    });

    if (anyStale) {
      return resolveIdentityForUser(userId);
    }

    return res.data.map(rowToResolvedDomain);
  } catch (err) {
    console.warn('[identityResolutionService] getResolvedIdentity threw:',
      err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Domain-specific resolution logic.
 *
 * Steps:
 * 1. Derive DerivedSignal array from memories for this domain.
 * 2. Apply priority law: correction_priority > 0 wins over lower in same scope.
 * 3. Cap assistant_inferred weights.
 * 4. Session-scoped signals never contribute to global identity.
 * 5. Compute aggregate confidence and stability.
 * 6. Detect contradictions (2+ unresolved) → contradictionStatus = 'unresolved'.
 * 7. Build payload from top signals.
 * 8. Upsert into user_identity_domains.
 * 9. Write diff log if payload changed.
 */
export async function resolveDomainSignals(
  userId: string,
  domain: IdentityDomain,
  memories: RecalledRow[],
): Promise<ResolvedIdentityDomain> {
  // Derive signals from memories.
  const signals = memories.map((m) => deriveSignal(m, domain));

  // Apply priority law: within the same scope+key group, demote lower-priority
  // signals if a correction-priority signal exists.
  const prioritised = applyPriorityLaw(signals);

  // Filter out session-scoped signals (they never contribute to global identity).
  const eligible = prioritised.filter((s) => s.scopeType !== 'session');

  // Compute aggregates.
  const totalWeight = eligible.reduce((acc, s) => acc + s.identityWeight, 0);
  const aggConfidence = totalWeight > 0
    ? eligible.reduce((acc, s) => acc + s.confidence * s.identityWeight, 0) / totalWeight
    : 0.3;
  const aggStability = totalWeight > 0
    ? eligible.reduce((acc, s) => acc + s.stability * s.identityWeight, 0) / totalWeight
    : 0.3;

  // Detect contradictions: count signals with flagged contradiction_status.
  const contraCount = memories.filter(
    (m) => m.contradiction_status === 'unresolved',
  ).length;
  const contradictionStatus = contraCount >= 2 ? 'unresolved' : 'none';

  // Build payload: top-3 signals by weight.
  const topSignals = [...eligible]
    .sort((a, b) => b.identityWeight - a.identityWeight)
    .slice(0, 3);

  const payload: Record<string, unknown> = {
    topSignals: topSignals.map((s) => ({
      content: s.content,
      weight: s.identityWeight,
      scope: s.scopeType,
      scopeKey: s.scopeKey ?? null,
    })),
    signalCount: eligible.length,
    correctionCount: signals.filter((s) => s.correctionPriority >= 100).length,
  };

  // Determine canonical scope: use the highest-weight signal's scope.
  const canonicalSignal = topSignals[0];
  const canonicalScope = (canonicalSignal?.scopeType as import('./identityGovernance.js').MemoryScopeType) ?? 'global';
  const canonicalScopeKey = canonicalSignal?.scopeKey;

  const nowTs = new Date();

  // Upsert into user_identity_domains.
  const previousRow = await fetchDomainRow(userId, domain, canonicalScope, canonicalScopeKey);
  await upsertDomainRow(userId, domain, {
    confidence: aggConfidence,
    stability: aggStability,
    scopeType: canonicalScope,
    scopeKey: canonicalScopeKey,
    contradictionStatus,
    payload,
    lastChangedAt: nowTs,
  });

  // Write diff log if payload changed meaningfully.
  if (payloadChanged(previousRow?.payload ?? null, payload)) {
    await writeDiff({
      userId,
      domain,
      diffType: previousRow ? 'strengthened' : 'added',
      beforePayload: previousRow?.payload ?? undefined,
      afterPayload: payload,
      reason: `Resolved domain '${domain}' from ${eligible.length} signal(s)`,
      evidenceMemoryIds: memories.map((m) => m.id).filter(Boolean),
      triggeredBy: 'distiller',
    });
  }

  return {
    domain,
    confidence: aggConfidence,
    stability: aggStability,
    scopeType: canonicalScope,
    scopeKey: canonicalScopeKey,
    contradictionStatus,
    payload,
    lastChangedAt: nowTs,
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

async function fetchGovernedMemories(userId: string): Promise<RecalledRow[]> {
  const res = await supabaseRest<Array<{
    id: string;
    kind: string;
    content: string;
    memory_class?: string | null;
    provenance?: string | null;
    scope_type?: string | null;
    scope_key?: string | null;
    stability_score?: number | null;
    policy_eligible?: boolean | null;
    contradiction_status?: string | null;
    importance?: number | null;
    created_at: string;
  }>>(
    'GET',
    `user_memories?user_id=eq.${encodeURIComponent(userId)}&quarantined=eq.false&superseded_by=is.null&order=importance.desc&limit=60`,
  );

  if (!res.ok || !Array.isArray(res.data)) return [];

  return res.data.map((row) => ({
    source: 'memory' as const,
    id: row.id,
    kind: row.kind ?? 'preference',
    content: row.content ?? '',
    similarity: 1.0,
    created_at: row.created_at,
    memory_class: row.memory_class ?? null,
    provenance: row.provenance ?? null,
    scope_type: row.scope_type ?? null,
    scope_key: row.scope_key ?? null,
    stability_score: row.stability_score ?? null,
    policy_eligible: row.policy_eligible ?? null,
    contradiction_status: row.contradiction_status ?? null,
  }));
}

function groupByDomain(
  memories: RecalledRow[],
): Map<IdentityDomain, RecalledRow[]> {
  const map = new Map<IdentityDomain, RecalledRow[]>();
  for (const m of memories) {
    const domain = inferDomainFromContent(m.content, m.kind);
    const existing = map.get(domain) ?? [];
    existing.push(m);
    map.set(domain, existing);
  }
  return map;
}

function deriveSignal(memory: RecalledRow, domain: IdentityDomain): DerivedSignal {
  const provenance = memory.provenance ?? 'assistant_inferred';
  const stability  = memory.stability_score ?? 0.5;
  const confidence = Math.max(0, Math.min(1, memory.similarity ?? 0.5));
  const cpScore    = correctionPriorityScore(memory.kind, provenance as import('./identityGovernance.js').MemoryProvenance);

  // Cap assistant_inferred confidence for identity weight.
  const cappedConf = provenance === 'assistant_inferred'
    ? Math.min(confidence, ASSISTANT_INFERRED_CAP)
    : confidence;

  // Derive explicitness level from provenance.
  const explicitnessLevel: ExplicitnessLevel =
    provenance === 'user_stated' || provenance === 'corrected_by_user'
      ? 'explicit'
      : provenance === 'system_derived'
        ? 'system_derived'
        : 'inferred';

  const weight = computeIdentityWeight(
    provenance as import('./identityGovernance.js').MemoryProvenance,
    explicitnessLevel,
    cpScore,
    stability,
    cappedConf,
  );

  return {
    memoryId: memory.id,
    content: memory.content,
    domain,
    provenance,
    scopeType: memory.scope_type ?? 'global',
    scopeKey: memory.scope_key ?? undefined,
    confidence: cappedConf,
    stability,
    identityWeight: weight,
    correctionPriority: cpScore,
    explicitnessLevel,
  };
}

/**
 * Priority law: within each (scopeType, scopeKey) group, if any signal has
 * correctionPriority >= 100, demote all others to weight 0.
 */
function applyPriorityLaw(signals: DerivedSignal[]): DerivedSignal[] {
  // Group by scopeType+scopeKey.
  const groups = new Map<string, DerivedSignal[]>();
  for (const s of signals) {
    const key = `${s.scopeType}::${s.scopeKey ?? ''}`;
    const group = groups.get(key) ?? [];
    group.push(s);
    groups.set(key, group);
  }

  const result: DerivedSignal[] = [];
  for (const group of groups.values()) {
    const hasCorrection = group.some((s) => s.correctionPriority >= 100);
    if (hasCorrection) {
      // Only keep correction signals with full weight; demote others.
      for (const s of group) {
        if (s.correctionPriority >= 100) {
          result.push(s);
        } else {
          result.push({ ...s, identityWeight: 0 });
        }
      }
    } else {
      result.push(...group);
    }
  }
  return result;
}

async function fetchDomainRow(
  userId: string,
  domain: IdentityDomain,
  scopeType: string,
  scopeKey?: string,
): Promise<{ payload: Record<string, unknown> } | null> {
  try {
    const scopeKeyFilter = scopeKey
      ? `&scope_key=eq.${encodeURIComponent(scopeKey)}`
      : '&scope_key=is.null';
    const res = await supabaseRest<RawIdentityDomainRow[]>(
      'GET',
      `user_identity_domains?user_id=eq.${encodeURIComponent(userId)}&domain=eq.${encodeURIComponent(domain)}&scope_type=eq.${encodeURIComponent(scopeType)}${scopeKeyFilter}&limit=1`,
    );
    if (!res.ok || !Array.isArray(res.data) || res.data.length === 0) return null;
    return { payload: res.data[0]?.payload ?? {} };
  } catch {
    return null;
  }
}

async function upsertDomainRow(
  userId: string,
  domain: IdentityDomain,
  data: {
    confidence: number;
    stability: number;
    scopeType: string;
    scopeKey?: string;
    contradictionStatus: 'none' | 'unresolved' | 'resolved';
    payload: Record<string, unknown>;
    lastChangedAt: Date;
  },
): Promise<void> {
  try {
    const row = {
      user_id: userId,
      domain,
      confidence: data.confidence,
      stability: data.stability,
      scope_type: data.scopeType,
      scope_key: data.scopeKey ?? null,
      last_changed_at: data.lastChangedAt.toISOString(),
      contradiction_status: data.contradictionStatus,
      payload: data.payload,
      updated_at: new Date().toISOString(),
    };

    // PostgREST upsert via ON CONFLICT using the unique index.
    await supabaseRest(
      'POST',
      'user_identity_domains',
      row,
      {
        Prefer: 'resolution=merge-duplicates,return=minimal',
        'on-conflict': 'user_id,domain,scope_type,scope_key',
      },
    );
  } catch (err) {
    console.warn('[identityResolutionService] upsertDomainRow threw:',
      err instanceof Error ? err.message : err);
  }
}

function rowToResolvedDomain(row: RawIdentityDomainRow): ResolvedIdentityDomain {
  return {
    domain: row.domain as IdentityDomain,
    confidence: row.confidence ?? 0.3,
    stability: row.stability ?? 0.3,
    scopeType: row.scope_type as import('./identityGovernance.js').MemoryScopeType ?? 'global',
    scopeKey: row.scope_key ?? undefined,
    contradictionStatus: (row.contradiction_status as 'none' | 'unresolved' | 'resolved') ?? 'none',
    payload: row.payload ?? {},
    lastChangedAt: new Date(row.last_changed_at ?? row.created_at),
  };
}

function payloadChanged(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): boolean {
  if (!before) return true;
  // Cheap comparison: serialise and compare.
  try {
    return JSON.stringify(before) !== JSON.stringify(after);
  } catch {
    return true;
  }
}

// ── Scope resolution import shim ─────────────────────────────────────────────
// (imported lazily to avoid circular-looking at type level — the actual import
//  is at the top of the file; this comment is for future readers)
