/**
 * auditGovernanceService.ts — Phase 0.985–0.99: Audit & governance log.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';

export type AuditEventType =
  | 'freeze'
  | 'revert'
  | 'policy_mutation'
  | 'suppression'
  | 'quarantine'
  | 'inspection'
  | 'approval';

export interface AuditEvent {
  id: string;
  user_id: string;
  event_type: AuditEventType;
  actor: string | null;
  target: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  audit_metadata: Record<string, unknown>;
  logged_at: string;
  created_at: string;
}

export interface AuditLogInput {
  actor?: string;
  target?: string;
  before_state?: Record<string, unknown>;
  after_state?: Record<string, unknown>;
  audit_metadata?: Record<string, unknown>;
}

export async function logGovernanceEvent(
  userId: string,
  eventType: AuditEventType,
  data: AuditLogInput = {},
): Promise<AuditEvent | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const id = randomUUID();
    const now = new Date().toISOString();
    const body = {
      id,
      user_id: userId,
      event_type: eventType,
      actor: data.actor ?? null,
      target: data.target ?? null,
      before_state: data.before_state ?? null,
      after_state: data.after_state ?? null,
      audit_metadata: data.audit_metadata ?? {},
      logged_at: now,
      created_at: now,
    };
    const result = await supabaseRest<AuditEvent[]>(
      'POST',
      'audit_governance_log',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as AuditEvent;
    }
    return result.data[0] ?? (body as AuditEvent);
  } catch (err) {
    console.error('[auditGovernanceService] logGovernanceEvent error:', err);
    return null;
  }
}

export async function getAuditLog(
  userId: string,
  eventType?: AuditEventType,
): Promise<AuditEvent[]> {
  if (!env.memoryLayerEnabled) return [];
  try {
    const typeFilter = eventType
      ? `&event_type=eq.${encodeURIComponent(eventType)}`
      : '';
    const result = await supabaseRest<AuditEvent[]>(
      'GET',
      `audit_governance_log?user_id=eq.${encodeURIComponent(userId)}${typeFilter}&order=logged_at.desc`,
    );
    if (!result.ok || !result.data) return [];
    return result.data;
  } catch (err) {
    console.error('[auditGovernanceService] getAuditLog error:', err);
    return [];
  }
}

/** Pure: format a summary of audit events grouped by event_type. */
export function formatAuditSummary(events: AuditEvent[]): string {
  const counts: Record<string, number> = {};
  for (const e of events) {
    counts[e.event_type] = (counts[e.event_type] ?? 0) + 1;
  }
  const parts = Object.entries(counts).map(
    ([type, count]) => `${type}:${count}`,
  );
  if (parts.length === 0) return 'no audit events';
  return parts.join(' ');
}
