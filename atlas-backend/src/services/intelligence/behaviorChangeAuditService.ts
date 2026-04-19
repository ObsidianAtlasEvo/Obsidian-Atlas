/**
 * behaviorChangeAuditService.ts — Phase 0.85: Behavior Change Audit
 *
 * Tracks the complete causal chain from originating signal through arbitration,
 * simulation, policy application, and downstream response. This is the full
 * provenance trail that makes any behavior change explainable.
 *
 * Governing principle: Every behavior change must have an answerable "why" —
 * from the signal that triggered it to the response that embodied it.
 */

import { randomUUID } from 'node:crypto';
import { supabaseRest } from '../../db/supabase.js';
import { env } from '../../config/env.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BehaviorChangeChain {
  id: string;
  userId: string;
  originatingSignalIds: string[];
  arbitrationDecisionIds: string[];
  simulationEventIds: string[];
  finalPolicyEventIds: string[];
  downstreamResponseIds: string[];
  behaviorShiftSummary: string;
  policyDomainsAffected: string[];
  createdAt: Date;
}

// ── Create ────────────────────────────────────────────────────────────────────

/**
 * Create a new behavior change chain record.
 * Returns the new chain ID (UUID) on success, or a local UUID on failure.
 */
export async function createChain(
  userId: string,
  input: Omit<BehaviorChangeChain, 'id' | 'createdAt'>,
): Promise<string> {
  const id = randomUUID();

  if (!env.memoryLayerEnabled) return id;

  const row = {
    id,
    user_id: userId,
    originating_signal_ids: input.originatingSignalIds,
    arbitration_decision_ids: input.arbitrationDecisionIds,
    simulation_event_ids: input.simulationEventIds,
    final_policy_event_ids: input.finalPolicyEventIds,
    downstream_response_ids: input.downstreamResponseIds,
    behavior_shift_summary: input.behaviorShiftSummary,
    policy_domains_affected: input.policyDomainsAffected,
  };

  try {
    const res = await supabaseRest<Array<Record<string, unknown>>>(
      'POST',
      'behavior_change_audit',
      row,
    );
    if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
      return (res.data[0]?.['id'] as string) ?? id;
    }
  } catch (err) {
    console.error('[behaviorChangeAudit] createChain error:', err);
  }

  return id;
}

// ── Append ────────────────────────────────────────────────────────────────────

/**
 * Append new information to an existing chain.
 * Arrays are merged (not replaced); summary and domains are overwritten if provided.
 */
export async function appendToChain(
  chainId: string,
  updates: Partial<Omit<BehaviorChangeChain, 'id' | 'userId' | 'createdAt'>>,
): Promise<void> {
  if (!env.memoryLayerEnabled) return;

  // Read current chain first so we can merge arrays
  const current = await getChain(chainId);
  if (!current) {
    console.warn(`[behaviorChangeAudit] appendToChain: chain ${chainId} not found`);
    return;
  }

  const merged = {
    originating_signal_ids: [
      ...current.originatingSignalIds,
      ...(updates.originatingSignalIds ?? []),
    ],
    arbitration_decision_ids: [
      ...current.arbitrationDecisionIds,
      ...(updates.arbitrationDecisionIds ?? []),
    ],
    simulation_event_ids: [
      ...current.simulationEventIds,
      ...(updates.simulationEventIds ?? []),
    ],
    final_policy_event_ids: [
      ...current.finalPolicyEventIds,
      ...(updates.finalPolicyEventIds ?? []),
    ],
    downstream_response_ids: [
      ...current.downstreamResponseIds,
      ...(updates.downstreamResponseIds ?? []),
    ],
    behavior_shift_summary:
      updates.behaviorShiftSummary ?? current.behaviorShiftSummary,
    policy_domains_affected: [
      ...new Set([
        ...current.policyDomainsAffected,
        ...(updates.policyDomainsAffected ?? []),
      ]),
    ],
  };

  try {
    await supabaseRest(
      'PATCH',
      `behavior_change_audit?id=eq.${encodeURIComponent(chainId)}`,
      merged,
      { Prefer: 'return=minimal' },
    );
  } catch (err) {
    console.error('[behaviorChangeAudit] appendToChain error:', err);
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Retrieve a single behavior change chain by ID.
 * Returns null if not found or on error.
 */
export async function getChain(chainId: string): Promise<BehaviorChangeChain | null> {
  if (!env.memoryLayerEnabled) return null;

  try {
    const result = await supabaseRest<Array<Record<string, unknown>>>(
      'GET',
      `behavior_change_audit?id=eq.${encodeURIComponent(chainId)}&select=*`,
    );

    if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
      return _rowToChain(result.data[0] as Record<string, unknown>);
    }
  } catch (err) {
    console.error('[behaviorChangeAudit] getChain error:', err);
  }

  return null;
}

/**
 * List the most recent behavior change chains for a user.
 */
export async function listRecentChains(
  userId: string,
  limit: number = 20,
): Promise<BehaviorChangeChain[]> {
  if (!env.memoryLayerEnabled) return [];

  const uid = encodeURIComponent(userId);

  try {
    const result = await supabaseRest<Array<Record<string, unknown>>>(
      'GET',
      `behavior_change_audit?user_id=eq.${uid}&order=created_at.desc&limit=${limit}&select=*`,
    );

    if (!result.ok || !Array.isArray(result.data)) return [];

    return result.data.map((row) => _rowToChain(row as Record<string, unknown>));
  } catch (err) {
    console.error('[behaviorChangeAudit] listRecentChains error:', err);
    return [];
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _rowToChain(row: Record<string, unknown>): BehaviorChangeChain {
  return {
    id: row['id'] as string,
    userId: row['user_id'] as string,
    originatingSignalIds: (row['originating_signal_ids'] as string[]) ?? [],
    arbitrationDecisionIds: (row['arbitration_decision_ids'] as string[]) ?? [],
    simulationEventIds: (row['simulation_event_ids'] as string[]) ?? [],
    finalPolicyEventIds: (row['final_policy_event_ids'] as string[]) ?? [],
    downstreamResponseIds: (row['downstream_response_ids'] as string[]) ?? [],
    behaviorShiftSummary: (row['behavior_shift_summary'] as string) ?? '',
    policyDomainsAffected: (row['policy_domains_affected'] as string[]) ?? [],
    createdAt: new Date((row['created_at'] as string) ?? Date.now()),
  };
}
