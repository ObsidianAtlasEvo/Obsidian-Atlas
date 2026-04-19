/**
 * behaviorTransparencyService.ts — Phase 0.98: Behavior transparency log.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';

export interface TransparencyRecord {
  trigger_event: string;
  reasoning_summary: string;
  policy_applied: string | null;
  confidence_level: string | null;
  transparency_metadata: Record<string, unknown>;
}

export interface TransparencyLogRow extends TransparencyRecord {
  id: string;
  user_id: string;
  logged_at: string;
  created_at: string;
}

export async function logTransparencyRecord(
  userId: string,
  data: TransparencyRecord,
): Promise<TransparencyLogRow | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const id = randomUUID();
    const now = new Date().toISOString();
    const body = {
      id,
      user_id: userId,
      trigger_event: data.trigger_event,
      reasoning_summary: data.reasoning_summary,
      policy_applied: data.policy_applied,
      confidence_level: data.confidence_level,
      transparency_metadata: data.transparency_metadata ?? {},
      logged_at: now,
      created_at: now,
    };
    const result = await supabaseRest<TransparencyLogRow[]>(
      'POST',
      'behavior_transparency_log',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as TransparencyLogRow;
    }
    return result.data[0] ?? (body as TransparencyLogRow);
  } catch (err) {
    console.error('[behaviorTransparencyService] logTransparencyRecord error:', err);
    return null;
  }
}

export async function getTransparencyLog(
  userId: string,
  limit: number = 50,
): Promise<TransparencyLogRow[]> {
  if (!env.memoryLayerEnabled) return [];
  try {
    const result = await supabaseRest<TransparencyLogRow[]>(
      'GET',
      `behavior_transparency_log?user_id=eq.${encodeURIComponent(userId)}&order=logged_at.desc&limit=${limit}`,
    );
    if (!result.ok || !result.data) return [];
    return result.data;
  } catch (err) {
    console.error('[behaviorTransparencyService] getTransparencyLog error:', err);
    return [];
  }
}

/** Pure: build a transparency record payload. */
export function buildTransparencyRecord(
  trigger: string,
  reasoning: string,
  policy?: string,
  confidence?: string,
): TransparencyRecord {
  return {
    trigger_event: trigger,
    reasoning_summary: reasoning,
    policy_applied: policy ?? null,
    confidence_level: confidence ?? null,
    transparency_metadata: {},
  };
}

/** Pure: format a transparency record for display in a UI panel. */
export function formatTransparencyPanel(record: TransparencyRecord): string {
  const policy = record.policy_applied ? ` policy=${record.policy_applied}` : '';
  const conf = record.confidence_level ? ` confidence=${record.confidence_level}` : '';
  return `[${record.trigger_event}]${policy}${conf} — ${record.reasoning_summary}`;
}
