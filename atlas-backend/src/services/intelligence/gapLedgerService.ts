/**
 * gapLedgerService.ts — Phase 0.9: Temporal Cognition Stack
 *
 * Tracks and ranks unresolved uncertainty in the user's identity model.
 * Law of Explicit Incompleteness: surface and rank what Atlas doesn't yet know.
 *
 * Design invariants:
 * - Non-throwing: all errors caught, safe defaults returned.
 * - Feature-flagged: all Supabase calls gated on env.MEMORY_LAYER_ENABLED.
 * - No LLM required: gap detection is pure heuristic analysis of DB state.
 * - Deduplicates by (user_id, gap_type, gap_domain) to avoid duplicate ledger entries.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type GapType =
  | 'unresolved_preference'
  | 'unresolved_contradiction'
  | 'underconfirmed_trait'
  | 'missing_chamber_preference'
  | 'unknown_workflow_preference'
  | 'unclear_scope_boundary'
  | 'insufficient_evidence'
  | 'unclear_project_priority'
  | 'unstable_recent_change';

export interface GapEntry {
  id: string;
  userId: string;
  gapType: GapType;
  gapDomain?: string;
  ambiguityScore: number;
  impactScore: number;
  confirmationPriority: number;
  blockedActions: string[];
  nextConfirmationPath?: string;
  evidenceScarcityReason?: string;
  status: 'open' | 'resolved' | 'acknowledged' | 'suppressed';
  relatedMemoryIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface RawGapRow {
  id: string;
  user_id: string;
  gap_type: string;
  gap_domain?: string | null;
  ambiguity_score: number;
  impact_score: number;
  confirmation_priority: number;
  blocked_actions: string[];
  next_confirmation_path?: string | null;
  evidence_scarcity_reason?: string | null;
  status: string;
  related_memory_ids: string[];
  created_at: string;
  updated_at: string;
}

// ── Mappers ──────────────────────────────────────────────────────────────────

function rowToGap(row: RawGapRow): GapEntry {
  return {
    id: row.id,
    userId: row.user_id,
    gapType: row.gap_type as GapType,
    gapDomain: row.gap_domain ?? undefined,
    ambiguityScore: row.ambiguity_score ?? 0.5,
    impactScore: row.impact_score ?? 0.5,
    confirmationPriority: row.confirmation_priority ?? 0.5,
    blockedActions: Array.isArray(row.blocked_actions) ? row.blocked_actions : [],
    nextConfirmationPath: row.next_confirmation_path ?? undefined,
    evidenceScarcityReason: row.evidence_scarcity_reason ?? undefined,
    status: row.status as GapEntry['status'],
    relatedMemoryIds: Array.isArray(row.related_memory_ids) ? row.related_memory_ids : [],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ── Gap detection helpers ────────────────────────────────────────────────────

interface IdentityDomainRow {
  id: string;
  domain: string;
  confidence: number;
  contradiction_status: string;
  payload: Record<string, unknown>;
}

interface ContradictionRow {
  id: string;
  domain?: string | null;
  memory_a_id?: string | null;
  memory_b_id?: string | null;
}

/**
 * Load user identity domains for gap analysis.
 */
async function loadIdentityDomains(userId: string): Promise<IdentityDomainRow[]> {
  const result = await supabaseRest<IdentityDomainRow[]>(
    'GET',
    `user_identity_domains?user_id=eq.${encodeURIComponent(userId)}&select=id,domain,confidence,contradiction_status,payload`,
  );
  return result.ok && result.data ? result.data : [];
}

/**
 * Load unresolved contradictions for gap analysis.
 */
async function loadContradictions(userId: string): Promise<ContradictionRow[]> {
  const result = await supabaseRest<ContradictionRow[]>(
    'GET',
    `identity_diff_log?user_id=eq.${encodeURIComponent(userId)}&contradiction_status=eq.unresolved&select=id,domain,memory_a_id,memory_b_id`,
  );
  return result.ok && result.data ? result.data : [];
}

// ── Upsert logic ─────────────────────────────────────────────────────────────

interface GapUpsertInput {
  userId: string;
  gapType: GapType;
  gapDomain?: string;
  ambiguityScore: number;
  impactScore: number;
  confirmationPriority: number;
  blockedActions?: string[];
  nextConfirmationPath?: string;
  evidenceScarcityReason?: string;
  relatedMemoryIds?: string[];
}

/**
 * Upsert a gap entry. Deduplicates by (user_id, gap_type, gap_domain).
 * Returns the gap ID.
 */
async function upsertGap(input: GapUpsertInput): Promise<string> {
  const { userId, gapType, gapDomain } = input;

  // Check for existing open gap of same type+domain
  const parts = [
    `user_id=eq.${encodeURIComponent(userId)}`,
    `gap_type=eq.${encodeURIComponent(gapType)}`,
    `status=eq.open`,
    `limit=1`,
  ];
  if (gapDomain) parts.push(`gap_domain=eq.${encodeURIComponent(gapDomain)}`);
  else parts.push('gap_domain=is.null');

  const existing = await supabaseRest<RawGapRow[]>(
    'GET',
    `gap_ledger?${parts.join('&')}`,
  );

  if (existing.ok && existing.data && existing.data.length > 0) {
    // Update existing
    const existingId = existing.data[0]!.id;
    await supabaseRest(
      'PATCH',
      `gap_ledger?id=eq.${encodeURIComponent(existingId)}`,
      {
        ambiguity_score: input.ambiguityScore,
        impact_score: input.impactScore,
        confirmation_priority: input.confirmationPriority,
        blocked_actions: input.blockedActions ?? [],
        next_confirmation_path: input.nextConfirmationPath ?? null,
        evidence_scarcity_reason: input.evidenceScarcityReason ?? null,
        related_memory_ids: input.relatedMemoryIds ?? [],
        updated_at: new Date().toISOString(),
      },
    );
    return existingId;
  }

  // Insert new
  const id = randomUUID();
  await supabaseRest('POST', 'gap_ledger', {
    id,
    user_id: userId,
    gap_type: gapType,
    gap_domain: gapDomain ?? null,
    ambiguity_score: input.ambiguityScore,
    impact_score: input.impactScore,
    confirmation_priority: input.confirmationPriority,
    blocked_actions: input.blockedActions ?? [],
    next_confirmation_path: input.nextConfirmationPath ?? null,
    evidence_scarcity_reason: input.evidenceScarcityReason ?? null,
    status: 'open',
    related_memory_ids: input.relatedMemoryIds ?? [],
  });
  return id;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Detect and upsert gaps for a user based on current memory/identity state.
 * Returns all open gaps ranked by impactScore DESC.
 */
export async function detectAndUpsertGaps(userId: string): Promise<GapEntry[]> {
  if (!env.memoryLayerEnabled) return [];

  try {
    const [domains, contradictions] = await Promise.all([
      loadIdentityDomains(userId),
      loadContradictions(userId),
    ]);

    const upsertPromises: Promise<string>[] = [];

    // Gap: unresolved contradiction per domain
    for (const c of contradictions) {
      const relatedIds: string[] = [];
      if (c.memory_a_id) relatedIds.push(c.memory_a_id);
      if (c.memory_b_id) relatedIds.push(c.memory_b_id);

      upsertPromises.push(
        upsertGap({
          userId,
          gapType: 'unresolved_contradiction',
          gapDomain: c.domain ?? undefined,
          ambiguityScore: 0.8,
          impactScore: 0.75,
          confirmationPriority: 0.85,
          blockedActions: ['identity_domain_update', 'policy_application'],
          nextConfirmationPath:
            'Ask user to clarify which memory is correct or merge both perspectives.',
          evidenceScarcityReason: 'Two contradictory signals exist with no resolution.',
          relatedMemoryIds: relatedIds,
        }),
      );
    }

    // Gap: underconfirmed traits (confidence < 0.4)
    for (const d of domains) {
      if (d.confidence < 0.4) {
        upsertPromises.push(
          upsertGap({
            userId,
            gapType: 'underconfirmed_trait',
            gapDomain: d.domain,
            ambiguityScore: 1 - d.confidence,
            impactScore: 0.5 + (0.4 - d.confidence),
            confirmationPriority: 0.6,
            blockedActions: ['strong_personalization', 'policy_write'],
            nextConfirmationPath: `Gather more signals for the '${d.domain}' domain.`,
            evidenceScarcityReason: `Domain confidence is ${d.confidence.toFixed(2)} — below threshold.`,
          }),
        );
      }

      // Gap: unresolved contradiction status on domain
      if (d.contradiction_status === 'unresolved') {
        upsertPromises.push(
          upsertGap({
            userId,
            gapType: 'unresolved_preference',
            gapDomain: d.domain,
            ambiguityScore: 0.7,
            impactScore: 0.65,
            confirmationPriority: 0.7,
            blockedActions: ['identity_resolution', 'policy_application'],
            nextConfirmationPath: `Resolve contradiction in domain '${d.domain}'.`,
          }),
        );
      }
    }

    // Gap: missing chamber preference domains
    const coveredDomains = new Set(domains.map((d) => d.domain));
    const expectedDomains = [
      'communication_profile',
      'challenge_profile',
      'epistemic_profile',
      'chamber_profile',
      'workflow_profile',
      'active_constraints',
    ];
    for (const expected of expectedDomains) {
      if (!coveredDomains.has(expected)) {
        const gapType: GapType =
          expected === 'chamber_profile'
            ? 'missing_chamber_preference'
            : expected === 'workflow_profile'
              ? 'unknown_workflow_preference'
              : 'insufficient_evidence';

        upsertPromises.push(
          upsertGap({
            userId,
            gapType,
            gapDomain: expected,
            ambiguityScore: 0.9,
            impactScore: 0.4,
            confirmationPriority: 0.3,
            blockedActions: ['domain_personalization'],
            nextConfirmationPath: `Collect initial signals for domain '${expected}'.`,
            evidenceScarcityReason: `No signals recorded for '${expected}'.`,
          }),
        );
      }
    }

    await Promise.allSettled(upsertPromises);

    return getGapLedger(userId);
  } catch (err) {
    console.error('[gapLedger] detectAndUpsertGaps error:', err);
    return [];
  }
}

/**
 * Get all open gaps for a user, sorted by impactScore DESC then confirmationPriority DESC.
 */
export async function getGapLedger(userId: string): Promise<GapEntry[]> {
  if (!env.memoryLayerEnabled) return [];

  try {
    const qs = [
      `user_id=eq.${encodeURIComponent(userId)}`,
      `status=eq.open`,
      `order=impact_score.desc,confirmation_priority.desc`,
    ].join('&');

    const result = await supabaseRest<RawGapRow[]>('GET', `gap_ledger?${qs}`);
    if (!result.ok || !result.data) return [];
    return result.data.map(rowToGap);
  } catch (err) {
    console.error('[gapLedger] getGapLedger error:', err);
    return [];
  }
}

/**
 * Mark a gap as resolved.
 */
export async function resolveGap(gapId: string): Promise<void> {
  if (!env.memoryLayerEnabled) return;

  try {
    await supabaseRest(
      'PATCH',
      `gap_ledger?id=eq.${encodeURIComponent(gapId)}`,
      { status: 'resolved', updated_at: new Date().toISOString() },
    );
  } catch (err) {
    console.error('[gapLedger] resolveGap error:', err);
  }
}

/**
 * Mark a gap as acknowledged (user is aware but hasn't resolved it).
 */
export async function acknowledgeGap(gapId: string): Promise<void> {
  if (!env.memoryLayerEnabled) return;

  try {
    await supabaseRest(
      'PATCH',
      `gap_ledger?id=eq.${encodeURIComponent(gapId)}`,
      { status: 'acknowledged', updated_at: new Date().toISOString() },
    );
  } catch (err) {
    console.error('[gapLedger] acknowledgeGap error:', err);
  }
}

/**
 * Format top gaps as a compact injection string. Max ~100 tokens.
 * Format: "[GAP: domain unclear | GAP: contradiction in X | GAP: weak evidence for Y]"
 */
export function formatGapSummary(gaps: GapEntry[]): string {
  if (gaps.length === 0) return '';

  const top3 = gaps.slice(0, 3);
  const parts = top3.map((g) => {
    const domain = g.gapDomain ?? 'general';
    switch (g.gapType) {
      case 'unresolved_contradiction':
        return `GAP: contradiction in ${domain}`;
      case 'underconfirmed_trait':
        return `GAP: weak evidence for ${domain}`;
      case 'missing_chamber_preference':
        return `GAP: no chamber prefs for ${domain}`;
      case 'unknown_workflow_preference':
        return `GAP: unknown workflow in ${domain}`;
      case 'unresolved_preference':
        return `GAP: preference unclear in ${domain}`;
      case 'insufficient_evidence':
        return `GAP: insufficient evidence for ${domain}`;
      case 'unclear_scope_boundary':
        return `GAP: scope boundary unclear in ${domain}`;
      case 'unclear_project_priority':
        return `GAP: project priority unclear in ${domain}`;
      case 'unstable_recent_change':
        return `GAP: recent change unstable in ${domain}`;
      default:
        return `GAP: ${domain} unclear`;
    }
  });

  return `[${parts.join(' | ')}]`;
}
