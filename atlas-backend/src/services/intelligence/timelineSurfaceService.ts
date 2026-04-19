/**
 * timelineSurfaceService.ts — Phase 0.98: Timeline surface events.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';

export interface TimelineEvent {
  id: string;
  user_id: string;
  event_type: string;
  title: string;
  description: string | null;
  event_at: string;
  group_key: string | null;
  event_metadata: Record<string, unknown>;
  created_at: string;
}

export interface TimelineEventCreateInput {
  event_type: string;
  title: string;
  description?: string;
  event_at?: string;
  group_key?: string;
  event_metadata?: Record<string, unknown>;
}

export async function logTimelineEvent(
  userId: string,
  data: TimelineEventCreateInput,
): Promise<TimelineEvent | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const id = randomUUID();
    const now = new Date().toISOString();
    const body = {
      id,
      user_id: userId,
      event_type: data.event_type,
      title: data.title,
      description: data.description ?? null,
      event_at: data.event_at ?? now,
      group_key: data.group_key ?? null,
      event_metadata: data.event_metadata ?? {},
      created_at: now,
    };
    const result = await supabaseRest<TimelineEvent[]>(
      'POST',
      'timeline_events',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as TimelineEvent;
    }
    return result.data[0] ?? (body as TimelineEvent);
  } catch (err) {
    console.error('[timelineSurfaceService] logTimelineEvent error:', err);
    return null;
  }
}

export async function getTimelineEvents(
  userId: string,
  limit: number = 100,
): Promise<TimelineEvent[]> {
  if (!env.memoryLayerEnabled) return [];
  try {
    const result = await supabaseRest<TimelineEvent[]>(
      'GET',
      `timeline_events?user_id=eq.${encodeURIComponent(userId)}&order=event_at.desc&limit=${limit}`,
    );
    if (!result.ok || !result.data) return [];
    return result.data;
  } catch (err) {
    console.error('[timelineSurfaceService] getTimelineEvents error:', err);
    return [];
  }
}

/** Pure: group events by group_key (ungrouped events keyed as '__ungrouped'). */
export function groupTimelineEvents(
  events: TimelineEvent[],
): Record<string, TimelineEvent[]> {
  const groups: Record<string, TimelineEvent[]> = {};
  for (const e of events) {
    const key = e.group_key ?? '__ungrouped';
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }
  return groups;
}
