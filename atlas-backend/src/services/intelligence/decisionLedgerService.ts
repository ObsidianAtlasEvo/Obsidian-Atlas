/**
 * decisionLedgerService.ts — Phase 0.95: Decision ledger.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';

export interface DecisionRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  rationale: string | null;
  options: unknown[];
  chosen_option: string | null;
  reversibility: 'reversible' | 'partially_reversible' | 'irreversible';
  decision_metadata: Record<string, unknown>;
  decided_at: string;
  created_at: string;
}

export interface DecisionCreateInput {
  title: string;
  description?: string;
  rationale?: string;
  options?: unknown[];
  chosen_option?: string;
  reversibility?: 'reversible' | 'partially_reversible' | 'irreversible';
  decision_metadata?: Record<string, unknown>;
}

export async function recordDecision(
  userId: string,
  data: DecisionCreateInput,
): Promise<DecisionRow | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const id = randomUUID();
    const now = new Date().toISOString();
    const body = {
      id,
      user_id: userId,
      title: data.title,
      description: data.description ?? null,
      rationale: data.rationale ?? null,
      options: data.options ?? [],
      chosen_option: data.chosen_option ?? null,
      reversibility: data.reversibility ?? 'reversible',
      decision_metadata: data.decision_metadata ?? {},
      decided_at: now,
      created_at: now,
    };
    const result = await supabaseRest<DecisionRow[]>(
      'POST',
      'decisions',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as DecisionRow;
    }
    return result.data[0] ?? (body as DecisionRow);
  } catch (err) {
    console.error('[decisionLedgerService] recordDecision error:', err);
    return null;
  }
}

export async function getDecisions(userId: string): Promise<DecisionRow[]> {
  if (!env.memoryLayerEnabled) return [];
  try {
    const result = await supabaseRest<DecisionRow[]>(
      'GET',
      `decisions?user_id=eq.${encodeURIComponent(userId)}&order=decided_at.desc`,
    );
    if (!result.ok || !result.data) return [];
    return result.data;
  } catch (err) {
    console.error('[decisionLedgerService] getDecisions error:', err);
    return [];
  }
}
