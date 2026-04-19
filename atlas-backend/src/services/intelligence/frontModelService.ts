/**
 * frontModelService.ts — Phase 0.95: Strategic front model.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import type { WorkstreamRow } from './workstreamStateService.js';

export interface FrontRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: 'open' | 'frozen' | 'won' | 'lost' | 'abandoned';
  front_type: string | null;
  arena: string | null;
  priority: number;
  front_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FrontCreateInput {
  name: string;
  description?: string;
  status?: 'open' | 'frozen' | 'won' | 'lost' | 'abandoned';
  front_type?: string;
  arena?: string;
  priority?: number;
  front_metadata?: Record<string, unknown>;
}

export async function createFront(
  userId: string,
  data: FrontCreateInput,
): Promise<FrontRow | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const id = randomUUID();
    const now = new Date().toISOString();
    const body = {
      id,
      user_id: userId,
      name: data.name,
      description: data.description ?? null,
      status: data.status ?? 'open',
      front_type: data.front_type ?? null,
      arena: data.arena ?? null,
      priority: data.priority ?? 5,
      front_metadata: data.front_metadata ?? {},
      created_at: now,
      updated_at: now,
    };
    const result = await supabaseRest<FrontRow[]>(
      'POST',
      'strategic_fronts',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as FrontRow;
    }
    return result.data[0] ?? (body as FrontRow);
  } catch (err) {
    console.error('[frontModelService] createFront error:', err);
    return null;
  }
}

export async function getFronts(userId: string): Promise<FrontRow[]> {
  if (!env.memoryLayerEnabled) return [];
  try {
    const result = await supabaseRest<FrontRow[]>(
      'GET',
      `strategic_fronts?user_id=eq.${encodeURIComponent(userId)}&order=priority.desc`,
    );
    if (!result.ok || !result.data) return [];
    return result.data;
  } catch (err) {
    console.error('[frontModelService] getFronts error:', err);
    return [];
  }
}

/**
 * Pure: compute a front health score based on associated workstreams
 * and status. Returns 0..1.
 */
export function computeFrontHealth(
  front: FrontRow,
  workstreams: WorkstreamRow[],
): number {
  if (front.status === 'won') return 1;
  if (front.status === 'lost' || front.status === 'abandoned') return 0;
  if (front.status === 'frozen') return 0.3;
  const arenaWorkstreams = workstreams.filter(
    (w) => w.status === 'active' || w.status === 'paused',
  );
  if (arenaWorkstreams.length === 0) return 0.2;
  const avgHealth =
    arenaWorkstreams.reduce((sum, w) => sum + (w.health_score ?? 0.5), 0) /
    arenaWorkstreams.length;
  return Math.max(0, Math.min(1, avgHealth));
}
