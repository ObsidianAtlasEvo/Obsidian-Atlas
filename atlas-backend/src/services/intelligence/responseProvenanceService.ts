/**
 * responseProvenanceService.ts — Phase 0.85: Response Provenance
 *
 * Logs what shaped each response — which memories were active, which policies
 * contributed, which signals were suppressed, and what personalization intensity
 * was applied. This provides the causal chain that makes every Atlas response
 * explainable in retrospect.
 *
 * CRITICAL: logResponseProvenance MUST be called fire-and-forget.
 * It must NEVER block the response path. Use: void logResponseProvenance(...)
 *
 * Governing principle: Every response that was shaped by user data must leave
 * an audit trail answering who, what, and why.
 */

import { randomUUID } from 'node:crypto';
import { supabaseRest } from '../../db/supabase.js';
import { env } from '../../config/env.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProvenanceRecord {
  userId: string;
  turnId?: string;
  activeMemoryIds: string[];
  activeIdentityDomains: string[];
  activePolicyInputs: Record<string, unknown>;
  chamberModifiers: Record<string, unknown>;
  contradictionFlags: string[];
  suppressedSignals: string[];
  personalizationIntensity: string;
  arbitrationSuppressions: string[];
}

// ── Log (fire-and-forget) ─────────────────────────────────────────────────────

/**
 * Persist a provenance record for a completed response.
 *
 * USAGE: ALWAYS call this without await in hot paths:
 *   void logResponseProvenance(record)
 *
 * Returns the new record ID on success. On failure, logs the error and
 * returns an empty string — never throws.
 */
export async function logResponseProvenance(
  record: ProvenanceRecord,
): Promise<string> {
  if (!env.memoryLayerEnabled) return '';

  const id = randomUUID();
  const row = {
    id,
    user_id: record.userId,
    turn_id: record.turnId ?? null,
    active_memory_ids: record.activeMemoryIds,
    active_identity_domains: record.activeIdentityDomains,
    active_policy_inputs: record.activePolicyInputs,
    chamber_modifiers: record.chamberModifiers,
    contradiction_flags: record.contradictionFlags,
    suppressed_signals: record.suppressedSignals,
    personalization_intensity: record.personalizationIntensity,
    arbitration_suppressions: record.arbitrationSuppressions,
    governance_version: '0.85',
  };

  try {
    const res = await supabaseRest<Array<Record<string, unknown>>>(
      'POST',
      'response_provenance_log',
      row,
    );
    if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
      return (res.data[0]?.['id'] as string) ?? id;
    }
  } catch (err) {
    // MUST NOT propagate — this is a fire-and-forget audit log
    console.error('[responseProvenance] log error:', err);
  }

  return id;
}

// ── Audit formatting ──────────────────────────────────────────────────────────

/**
 * Produce a compact human-readable audit string for a provenance record.
 * Suitable for structured logs, console output, and debug traces.
 */
export function formatProvenanceForAudit(record: ProvenanceRecord): string {
  const lines: string[] = [
    `[provenance v0.85] turn=${record.turnId ?? 'none'} user=${record.userId}`,
    `  memories: ${record.activeMemoryIds.length} active`,
    `  identity_domains: ${record.activeIdentityDomains.join(', ') || 'none'}`,
    `  personalization_intensity: ${record.personalizationIntensity}`,
  ];

  if (Object.keys(record.activePolicyInputs).length > 0) {
    const fields = Object.keys(record.activePolicyInputs).join(', ');
    lines.push(`  policy_inputs: ${fields}`);
  }

  if (record.contradictionFlags.length > 0) {
    lines.push(`  contradiction_flags: ${record.contradictionFlags.join(', ')}`);
  }

  if (record.suppressedSignals.length > 0) {
    lines.push(`  suppressed_signals: ${record.suppressedSignals.join(', ')}`);
  }

  if (record.arbitrationSuppressions.length > 0) {
    lines.push(`  arbitration_suppressions: ${record.arbitrationSuppressions.join(', ')}`);
  }

  if (Object.keys(record.chamberModifiers).length > 0) {
    const mods = Object.keys(record.chamberModifiers).join(', ');
    lines.push(`  chamber_modifiers: ${mods}`);
  }

  return lines.join('\n');
}

// ── Query helpers ─────────────────────────────────────────────────────────────

/**
 * Retrieve recent provenance records for a user.
 * Automatically filters to the last 90 days (retention policy).
 */
export async function getRecentProvenance(
  userId: string,
  limit: number = 20,
): Promise<ProvenanceRecord[]> {
  if (!env.memoryLayerEnabled) return [];

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const uid = encodeURIComponent(userId);

  try {
    const result = await supabaseRest<Array<Record<string, unknown>>>(
      'GET',
      `response_provenance_log?user_id=eq.${uid}&created_at=gte.${encodeURIComponent(ninetyDaysAgo)}&order=created_at.desc&limit=${limit}&select=*`,
    );

    if (!result.ok || !Array.isArray(result.data)) return [];

    return result.data.map(_rowToRecord);
  } catch (err) {
    console.error('[responseProvenance] getRecentProvenance error:', err);
    return [];
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _rowToRecord(row: Record<string, unknown>): ProvenanceRecord {
  return {
    userId: row['user_id'] as string,
    turnId: (row['turn_id'] as string) ?? undefined,
    activeMemoryIds: (row['active_memory_ids'] as string[]) ?? [],
    activeIdentityDomains: (row['active_identity_domains'] as string[]) ?? [],
    activePolicyInputs: (row['active_policy_inputs'] as Record<string, unknown>) ?? {},
    chamberModifiers: (row['chamber_modifiers'] as Record<string, unknown>) ?? {},
    contradictionFlags: (row['contradiction_flags'] as string[]) ?? [],
    suppressedSignals: (row['suppressed_signals'] as string[]) ?? [],
    personalizationIntensity: (row['personalization_intensity'] as string) ?? 'light',
    arbitrationSuppressions: (row['arbitration_suppressions'] as string[]) ?? [],
  };
}
