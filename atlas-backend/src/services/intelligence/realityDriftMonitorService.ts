/**
 * realityDriftMonitorService.ts — Phase 0.97: Drift event logging & classification.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';

export type DriftClass =
  | 'epistemic'
  | 'project'
  | 'strategic'
  | 'self_model'
  | 'assumption'
  | 'narrative'
  | 'confidence';

export type DriftSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface DriftEventRow {
  id: string;
  user_id: string;
  drift_class: DriftClass;
  description: string;
  severity: DriftSeverity;
  detected_at: string;
  drift_metadata: Record<string, unknown>;
  created_at: string;
}

export interface DriftEventCreateInput {
  drift_class?: DriftClass;
  description: string;
  severity?: DriftSeverity;
  drift_metadata?: Record<string, unknown>;
}

export async function logDriftEvent(
  userId: string,
  data: DriftEventCreateInput,
): Promise<DriftEventRow | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const id = randomUUID();
    const now = new Date().toISOString();
    const body = {
      id,
      user_id: userId,
      drift_class: data.drift_class ?? classifyDrift(data.description),
      description: data.description,
      severity: data.severity ?? 'medium',
      detected_at: now,
      drift_metadata: data.drift_metadata ?? {},
      created_at: now,
    };
    const result = await supabaseRest<DriftEventRow[]>(
      'POST',
      'reality_drift_events',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as DriftEventRow;
    }
    return result.data[0] ?? (body as DriftEventRow);
  } catch (err) {
    console.error('[realityDriftMonitorService] logDriftEvent error:', err);
    return null;
  }
}

export async function getDriftEvents(userId: string): Promise<DriftEventRow[]> {
  if (!env.memoryLayerEnabled) return [];
  try {
    const result = await supabaseRest<DriftEventRow[]>(
      'GET',
      `reality_drift_events?user_id=eq.${encodeURIComponent(userId)}&order=detected_at.desc`,
    );
    if (!result.ok || !result.data) return [];
    return result.data;
  } catch (err) {
    console.error('[realityDriftMonitorService] getDriftEvents error:', err);
    return [];
  }
}

/**
 * Pure: classify a drift description into a DriftClass via keyword matching.
 * Defaults to 'epistemic' if nothing matches.
 */
export function classifyDrift(description: string): DriftClass {
  const text = description.toLowerCase();
  if (/\b(identity|self|who i am|self-image|self-model)\b/.test(text)) return 'self_model';
  if (/\b(assumption|assumed|presume|presumption)\b/.test(text)) return 'assumption';
  if (/\b(project|milestone|deadline|timeline|workstream)\b/.test(text)) return 'project';
  if (/\b(strategy|strategic|arena|front|direction)\b/.test(text)) return 'strategic';
  if (/\b(narrative|story|framing|frame)\b/.test(text)) return 'narrative';
  if (/\b(confidence|certainty|sure|unsure|doubt)\b/.test(text)) return 'confidence';
  return 'epistemic';
}

const SEVERITY_SCORE: Record<DriftSeverity, number> = {
  critical: 1,
  high: 0.75,
  medium: 0.5,
  low: 0.25,
};

/** Pure: mean severity as a 0..1 risk score. */
export function computeDriftRisk(events: DriftEventRow[]): number {
  if (events.length === 0) return 0;
  const total = events.reduce(
    (sum, e) => sum + (SEVERITY_SCORE[e.severity] ?? 0.5),
    0,
  );
  return total / events.length;
}
