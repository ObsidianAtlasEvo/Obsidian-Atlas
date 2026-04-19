/**
 * actionResultIngestionService.ts — Phase 0.985: ingest dispatch results back into the spine.
 *
 * - Extracts referenced entities (workstreams, claims, decisions) from the result payload
 * - Updates referenced workstream status when the contract affected one
 * - Inserts new contradictions/evidence rows when the result surfaced them
 * - Writes a transparency_log record for every ingestion
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import type { DispatchResult } from './actionDispatchBroker.js';
import { _fetchContract } from './actionExecutorService.js';
import { logTransparencyRecord } from './behaviorTransparencyService.js';

export interface IngestionSummary {
  contractId: string;
  workstreamsUpdated: number;
  contradictionsInserted: number;
  evidenceInserted: number;
  transparencyLogged: boolean;
}

interface ResultPayloadShape {
  workstream_ids?: string[];
  workstream_status?: string;
  claim_ids?: string[];
  decision_ids?: string[];
  contradictions?: Array<Record<string, unknown>>;
  evidence?: Array<Record<string, unknown>>;
}

/** Pure: extract referenced entities from a dispatch result's step details. */
export function extractEntities(result: DispatchResult): ResultPayloadShape {
  const out: ResultPayloadShape = {};
  for (const step of result.steps) {
    if (!step.detail) continue;
    try {
      const parsed = JSON.parse(step.detail) as ResultPayloadShape;
      if (Array.isArray(parsed.workstream_ids)) {
        out.workstream_ids = [...(out.workstream_ids ?? []), ...parsed.workstream_ids];
      }
      if (typeof parsed.workstream_status === 'string') {
        out.workstream_status = parsed.workstream_status;
      }
      if (Array.isArray(parsed.claim_ids)) {
        out.claim_ids = [...(out.claim_ids ?? []), ...parsed.claim_ids];
      }
      if (Array.isArray(parsed.decision_ids)) {
        out.decision_ids = [...(out.decision_ids ?? []), ...parsed.decision_ids];
      }
      if (Array.isArray(parsed.contradictions)) {
        out.contradictions = [...(out.contradictions ?? []), ...parsed.contradictions];
      }
      if (Array.isArray(parsed.evidence)) {
        out.evidence = [...(out.evidence ?? []), ...parsed.evidence];
      }
    } catch {
      // Not JSON — skip silently. Non-JSON details aren't a signal source.
    }
  }
  return out;
}

async function updateWorkstreamStatus(
  userId: string,
  workstreamId: string,
  status: string,
): Promise<boolean> {
  if (!env.memoryLayerEnabled) return false;
  try {
    const result = await supabaseRest(
      'PATCH',
      `workstreams?id=eq.${encodeURIComponent(workstreamId)}&user_id=eq.${encodeURIComponent(userId)}`,
      { status, updated_at: new Date().toISOString() },
    );
    return result.ok;
  } catch (err) {
    console.error('[actionResultIngestionService] updateWorkstreamStatus error:', err);
    return false;
  }
}

async function insertContradictions(
  userId: string,
  contractId: string,
  rows: Array<Record<string, unknown>>,
): Promise<number> {
  if (!env.memoryLayerEnabled || rows.length === 0) return 0;
  try {
    let count = 0;
    for (const row of rows) {
      const body = {
        id: randomUUID(),
        user_id: userId,
        claim_a_id: typeof row['claim_a_id'] === 'string' ? row['claim_a_id'] : null,
        claim_b_id: typeof row['claim_b_id'] === 'string' ? row['claim_b_id'] : null,
        tension_description:
          typeof row['description'] === 'string' ? row['description'] : 'action_dispatch_surfaced',
        severity: typeof row['severity'] === 'string' ? row['severity'] : 'medium',
        resolved: false,
        contradiction_metadata: { source: 'action_result', contract_id: contractId, raw: row },
        detected_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      const result = await supabaseRest('POST', 'contradictions', body);
      if (result.ok) count++;
    }
    return count;
  } catch (err) {
    console.error('[actionResultIngestionService] insertContradictions error:', err);
    return 0;
  }
}

async function insertEvidence(
  userId: string,
  contractId: string,
  rows: Array<Record<string, unknown>>,
): Promise<number> {
  if (!env.memoryLayerEnabled || rows.length === 0) return 0;
  try {
    let count = 0;
    for (const row of rows) {
      const body = {
        id: randomUUID(),
        user_id: userId,
        claim_id: typeof row['claim_id'] === 'string' ? row['claim_id'] : null,
        evidence_type: typeof row['evidence_type'] === 'string' ? row['evidence_type'] : 'action_result',
        evidence_description:
          typeof row['description'] === 'string' ? row['description'] : 'action_dispatch_surfaced',
        weight: typeof row['weight'] === 'number' ? row['weight'] : 0.5,
        evidence_metadata: { source: 'action_result', contract_id: contractId, raw: row },
        created_at: new Date().toISOString(),
      };
      const result = await supabaseRest('POST', 'evidence', body);
      if (result.ok) count++;
    }
    return count;
  } catch (err) {
    console.error('[actionResultIngestionService] insertEvidence error:', err);
    return 0;
  }
}

export async function ingestActionResult(
  userId: string,
  contractId: string,
  result: DispatchResult,
): Promise<IngestionSummary> {
  const summary: IngestionSummary = {
    contractId,
    workstreamsUpdated: 0,
    contradictionsInserted: 0,
    evidenceInserted: 0,
    transparencyLogged: false,
  };
  try {
    const extracted = extractEntities(result);
    const contract = await _fetchContract(userId, contractId);

    if (extracted.workstream_ids && extracted.workstream_status) {
      for (const wid of extracted.workstream_ids) {
        const ok = await updateWorkstreamStatus(userId, wid, extracted.workstream_status);
        if (ok) summary.workstreamsUpdated++;
      }
    }

    if (extracted.contradictions) {
      summary.contradictionsInserted = await insertContradictions(
        userId,
        contractId,
        extracted.contradictions,
      );
    }

    if (extracted.evidence) {
      summary.evidenceInserted = await insertEvidence(userId, contractId, extracted.evidence);
    }

    const rec = await logTransparencyRecord(userId, {
      trigger_event: 'action_result_ingested',
      reasoning_summary: `Ingested dispatch result for contract ${contractId}: success=${result.success}, steps=${result.steps.length}, errors=${result.errors.length}`,
      policy_applied: 'action_ingestion',
      confidence_level: result.success ? 'high' : 'medium',
      transparency_metadata: {
        contract_id: contractId,
        contract_type: contract?.action_type ?? null,
        dispatch_success: result.success,
        steps: result.steps.length,
        errors_count: result.errors.length,
        workstreams_updated: summary.workstreamsUpdated,
        contradictions_inserted: summary.contradictionsInserted,
        evidence_inserted: summary.evidenceInserted,
      },
    });
    summary.transparencyLogged = rec !== null;
    return summary;
  } catch (err) {
    console.error('[actionResultIngestionService] ingestActionResult error:', err);
    return summary;
  }
}
