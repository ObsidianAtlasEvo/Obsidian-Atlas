/**
 * commitmentTrackerService.ts — Phase 0.95: Commitment tracking.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';

export interface CommitmentRow {
  id: string;
  user_id: string;
  description: string;
  commitment_type: 'explicit' | 'implied';
  status: 'open' | 'fulfilled' | 'broken' | 'deferred';
  source_context: string | null;
  due_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommitmentCreateInput {
  description: string;
  commitment_type?: 'explicit' | 'implied';
  status?: 'open' | 'fulfilled' | 'broken' | 'deferred';
  source_context?: string;
  due_at?: string;
}

export async function logCommitment(
  userId: string,
  data: CommitmentCreateInput,
): Promise<CommitmentRow | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const id = randomUUID();
    const now = new Date().toISOString();
    const body = {
      id,
      user_id: userId,
      description: data.description,
      commitment_type: data.commitment_type ?? 'explicit',
      status: data.status ?? 'open',
      source_context: data.source_context ?? null,
      due_at: data.due_at ?? null,
      resolved_at: null,
      created_at: now,
      updated_at: now,
    };
    const result = await supabaseRest<CommitmentRow[]>(
      'POST',
      'commitments',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as CommitmentRow;
    }
    return result.data[0] ?? (body as CommitmentRow);
  } catch (err) {
    console.error('[commitmentTrackerService] logCommitment error:', err);
    return null;
  }
}

export async function getOpenCommitments(userId: string): Promise<CommitmentRow[]> {
  if (!env.memoryLayerEnabled) return [];
  try {
    const result = await supabaseRest<CommitmentRow[]>(
      'GET',
      `commitments?user_id=eq.${encodeURIComponent(userId)}&status=eq.open&order=due_at.asc.nullslast`,
    );
    if (!result.ok || !result.data) return [];
    return result.data;
  } catch (err) {
    console.error('[commitmentTrackerService] getOpenCommitments error:', err);
    return [];
  }
}

export async function resolveCommitment(
  userId: string,
  id: string,
  status: 'fulfilled' | 'broken' | 'deferred',
): Promise<boolean> {
  if (!env.memoryLayerEnabled) return false;
  try {
    const result = await supabaseRest(
      'PATCH',
      `commitments?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`,
      {
        status,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    );
    return result.ok;
  } catch (err) {
    console.error('[commitmentTrackerService] resolveCommitment error:', err);
    return false;
  }
}

const IMPLIED_PATTERNS: readonly string[] = [
  'will',
  'going to',
  'plan to',
  'intend to',
  'promise',
  'commit to',
  'by eod',
  'by friday',
];

/**
 * Pure: detect implied commitments via keyword heuristics.
 * Returns a list of sentence snippets that appear to express commitment.
 */
export function detectImpliedCommitments(text: string): string[] {
  if (!text) return [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const matches: string[] = [];
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    for (const pattern of IMPLIED_PATTERNS) {
      if (lower.includes(pattern)) {
        matches.push(sentence.trim());
        break;
      }
    }
  }
  return matches;
}
