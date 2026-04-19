/**
 * creatorConsoleService.ts — Phase 0.98: Creator console state.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';

export interface CreatorConsoleState {
  id: string;
  user_id: string;
  active_chamber: string | null;
  active_mode: string | null;
  active_filters: Record<string, unknown>;
  pinned_modules: unknown[];
  console_metadata: Record<string, unknown>;
  updated_at: string;
  created_at: string;
}

export interface CreatorConsoleUpdateInput {
  active_chamber?: string;
  active_mode?: string;
  active_filters?: Record<string, unknown>;
  pinned_modules?: unknown[];
  console_metadata?: Record<string, unknown>;
}

export async function getConsoleState(
  userId: string,
): Promise<CreatorConsoleState | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const result = await supabaseRest<CreatorConsoleState[]>(
      'GET',
      `creator_console_state?user_id=eq.${encodeURIComponent(userId)}&order=updated_at.desc&limit=1`,
    );
    if (!result.ok || !result.data || result.data.length === 0) return null;
    return result.data[0] ?? null;
  } catch (err) {
    console.error('[creatorConsoleService] getConsoleState error:', err);
    return null;
  }
}

export async function updateConsoleState(
  userId: string,
  data: CreatorConsoleUpdateInput,
): Promise<CreatorConsoleState | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const now = new Date().toISOString();
    const existing = await getConsoleState(userId);
    if (existing) {
      const patch: Record<string, unknown> = { updated_at: now };
      if (data.active_chamber !== undefined) patch.active_chamber = data.active_chamber;
      if (data.active_mode !== undefined) patch.active_mode = data.active_mode;
      if (data.active_filters !== undefined) patch.active_filters = data.active_filters;
      if (data.pinned_modules !== undefined) patch.pinned_modules = data.pinned_modules;
      if (data.console_metadata !== undefined) patch.console_metadata = data.console_metadata;
      const result = await supabaseRest<CreatorConsoleState[]>(
        'PATCH',
        `creator_console_state?id=eq.${encodeURIComponent(existing.id)}&user_id=eq.${encodeURIComponent(userId)}`,
        patch,
        { Prefer: 'return=representation' },
      );
      if (!result.ok || !result.data || result.data.length === 0) {
        return { ...existing, ...patch } as CreatorConsoleState;
      }
      return result.data[0] ?? existing;
    }
    const id = randomUUID();
    const body = {
      id,
      user_id: userId,
      active_chamber: data.active_chamber ?? null,
      active_mode: data.active_mode ?? null,
      active_filters: data.active_filters ?? {},
      pinned_modules: data.pinned_modules ?? [],
      console_metadata: data.console_metadata ?? {},
      updated_at: now,
      created_at: now,
    };
    const result = await supabaseRest<CreatorConsoleState[]>(
      'POST',
      'creator_console_state',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as CreatorConsoleState;
    }
    return result.data[0] ?? (body as CreatorConsoleState);
  } catch (err) {
    console.error('[creatorConsoleService] updateConsoleState error:', err);
    return null;
  }
}
