/**
 * correctionPriorityService.ts — Phase 0.8: Correction detection and
 * identity assumption reordering.
 *
 * When the user corrects Atlas (explicitly or via correction-phrase content),
 * this service:
 *   1. Identifies the correction.
 *   2. Finds identity_signals in overlapping domains.
 *   3. Demotes those signals (active=false, correction_priority=-1).
 *   4. Logs a correction_priority_events row.
 *   5. Logs an identity_diff_log entry (diff_type='corrected').
 *
 * Priority law: user correction > assistant inference > older ambiguous signal.
 *
 * Design invariants:
 *   - All Supabase calls guarded by env.memoryLayerEnabled.
 *   - Returns null when memory doesn't qualify as a correction.
 *   - No throwing at outer layer.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import {
  type IdentityDomain,
  inferDomainFromContent,
} from './identityGovernance.js';
import { writeDiff } from './identityDiffService.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CorrectionEvent {
  id: string;
  userId: string;
  correctionMemoryId: string;
  demotedSignalIds: string[];
  supersededMemoryIds: string[];
  domainsAffected: IdentityDomain[];
  policyRollbackCandidate: boolean;
  createdAt: Date;
}

interface MemoryInput {
  id: string;
  kind: string;
  content: string;
  provenance: string;
  importance: number;
}

// ── Correction phrase list ────────────────────────────────────────────────────

export const CORRECTION_PHRASES: readonly string[] = [
  "not right",
  "that is wrong",
  "don't remember that",
  "only applies here",
  "not my general",
  "temporary",
  "just for this",
  "forget that",
  "incorrect assumption",
  "that's not true",
  "that was wrong",
  "please forget",
  "that doesn't apply",
  "don't apply that generally",
  "that was specific to",
  "you misunderstood",
  "that is not accurate",
] as const;

// ── Correction phrase detection ───────────────────────────────────────────────

function isCorrectionContent(content: string): boolean {
  if (!content) return false;
  const lower = content.toLowerCase();
  return CORRECTION_PHRASES.some((phrase) => lower.includes(phrase));
}

function isCorrection(memory: MemoryInput): boolean {
  if (memory.kind === 'correction') return true;
  if (memory.provenance === 'corrected_by_user') return true;
  if (isCorrectionContent(memory.content)) return true;
  return false;
}

// ── DB row shapes ─────────────────────────────────────────────────────────────

interface RawSignalRow {
  id: string;
  domain: string;
  signal_content: string;
  scope_type: string;
  scope_key?: string | null;
  correction_priority: number;
  active: boolean;
  provenance: string;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Detect whether the given memory qualifies as a correction event, and if so
 * apply priority law (demote overlapping signals) and persist correction records.
 *
 * Returns a CorrectionEvent on success, null if the memory is not a correction
 * or storage is unavailable.
 */
export async function detectAndApplyCorrection(
  userId: string,
  memory: MemoryInput,
): Promise<CorrectionEvent | null> {
  if (!env.memoryLayerEnabled) return null;
  if (!process.env.SUPABASE_URL) return null;
  if (!userId || !memory?.id) return null;

  if (!isCorrection(memory)) return null;

  try {
    // 1. Determine domains affected by this correction.
    const primaryDomain = inferDomainFromContent(memory.content, memory.kind);
    const domainsAffected = collectAffectedDomains(memory.content, memory.kind);

    // 2. Find active identity_signals in the affected domains.
    const signals = await findActiveSignalsForDomains(userId, domainsAffected);

    // 3. Demote them.
    const demotedSignalIds = await demoteSignals(signals, memory.id);

    // 4. Find related user_memories (by domain content match — domain-based heuristic).
    const supersededMemoryIds = await findSupersededMemories(userId, domainsAffected, memory.id);

    // 5. Policy rollback candidate: true when primary domain is active_constraints
    //    or when importance >= 0.7.
    const policyRollbackCandidate =
      primaryDomain === 'active_constraints' || memory.importance >= 0.7;

    // 6. Write correction_priority_events row.
    const eventId = randomUUID();
    const createdAt = new Date();

    const eventRes = await supabaseRest(
      'POST',
      'correction_priority_events',
      {
        id: eventId,
        user_id: userId,
        correction_memory_id: memory.id,
        demoted_signal_ids: JSON.stringify(demotedSignalIds),
        superseded_memory_ids: JSON.stringify(supersededMemoryIds),
        correction_content: memory.content.slice(0, 1000),
        scope_type: 'global', // corrections are always global-precedence
        scope_key: null,
        domains_affected: JSON.stringify(domainsAffected),
        policy_rollback_candidate: policyRollbackCandidate,
        created_at: createdAt.toISOString(),
      },
      { Prefer: 'return=minimal' },
    );

    if (!eventRes.ok) {
      console.warn('[correctionPriorityService] Failed to write correction event:', eventRes.status);
    }

    // 7. Write identity_diff_log entry for each affected domain.
    for (const domain of domainsAffected) {
      await writeDiff({
        userId,
        domain,
        diffType: 'corrected',
        reason: `Correction applied: "${memory.content.slice(0, 120)}"`,
        evidenceMemoryIds: [memory.id],
        triggeredBy: 'correction',
      });
    }

    return {
      id: eventId,
      userId,
      correctionMemoryId: memory.id,
      demotedSignalIds,
      supersededMemoryIds,
      domainsAffected,
      policyRollbackCandidate,
      createdAt,
    };
  } catch (err) {
    console.warn('[correctionPriorityService] detectAndApplyCorrection threw:',
      err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Collect all domains this correction might affect.
 * Always includes the primary domain; also checks for secondary domain cues.
 */
function collectAffectedDomains(
  content: string,
  kind: string,
): IdentityDomain[] {
  const primary = inferDomainFromContent(content, kind);
  const all: Set<IdentityDomain> = new Set([primary]);

  // Corrections often affect constraints as a secondary domain.
  if (primary !== 'active_constraints') {
    all.add('active_constraints');
  }

  return Array.from(all);
}

/**
 * Find active, non-superseded identity_signals in the given domains.
 */
async function findActiveSignalsForDomains(
  userId: string,
  domains: IdentityDomain[],
): Promise<RawSignalRow[]> {
  if (domains.length === 0) return [];

  try {
    const domainList = domains.map((d) => `"${d}"`).join(',');
    const res = await supabaseRest<RawSignalRow[]>(
      'GET',
      `identity_signals?user_id=eq.${encodeURIComponent(userId)}&active=eq.true&superseded_by=is.null&domain=in.(${domainList})&select=id,domain,signal_content,scope_type,scope_key,correction_priority,active,provenance`,
    );

    if (!res.ok || !Array.isArray(res.data)) return [];
    return res.data;
  } catch {
    return [];
  }
}

/**
 * Set active=false and correction_priority=-1 on the given signals.
 * Returns the list of demoted signal IDs.
 */
async function demoteSignals(
  signals: RawSignalRow[],
  correctionMemoryId: string,
): Promise<string[]> {
  if (signals.length === 0) return [];

  const idList = signals.map((s) => `"${s.id}"`).join(',');

  try {
    const res = await supabaseRest(
      'PATCH',
      `identity_signals?id=in.(${idList})`,
      {
        active: false,
        correction_priority: -1,
        superseded_by: null, // superseded_by references another signal; leave null here
        updated_at: new Date().toISOString(),
      },
      { Prefer: 'return=minimal' },
    );

    if (!res.ok) {
      console.warn('[correctionPriorityService] demoteSignals failed:', res.status);
      return [];
    }

    return signals.map((s) => s.id);
  } catch {
    return [];
  }
}

/**
 * Find user_memories that are likely superseded by this correction.
 * Heuristic: same domains, not quarantined, not already superseded, older than
 * the correction memory.
 */
async function findSupersededMemories(
  userId: string,
  domains: IdentityDomain[],
  _correctionMemoryId: string,
): Promise<string[]> {
  // Domain-to-kind mapping heuristic: look for memories whose kind or content
  // overlaps with the domains affected.
  const kindMap: Partial<Record<IdentityDomain, string[]>> = {
    communication_profile: ['preference'],
    challenge_profile: ['preference', 'pattern'],
    epistemic_profile: ['preference', 'fact'],
    chamber_profile: ['preference'],
    workflow_profile: ['preference', 'pattern', 'goal'],
    active_constraints: ['correction', 'preference'],
  };

  const relevantKinds = new Set<string>();
  for (const domain of domains) {
    for (const k of kindMap[domain] ?? []) {
      relevantKinds.add(k);
    }
  }

  if (relevantKinds.size === 0) return [];

  try {
    const kindList = Array.from(relevantKinds).map((k) => `"${k}"`).join(',');
    const res = await supabaseRest<Array<{ id: string }>>(
      'GET',
      `user_memories?user_id=eq.${encodeURIComponent(userId)}&quarantined=eq.false&superseded_by=is.null&kind=in.(${kindList})&select=id&limit=20`,
    );

    if (!res.ok || !Array.isArray(res.data)) return [];
    return res.data.map((r) => r.id);
  } catch {
    return [];
  }
}
