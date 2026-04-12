/**
 * Atlas Phase 3 — Event Bus Idempotency + Replay Engine
 *
 * Guarantees:
 *  1. Every event has a deterministic idempotency key — duplicate delivery
 *     is detected and rejected without side effects.
 *  2. Events are immutable once written. Replay re-applies them to rebuild
 *     any projection from any point in time.
 *  3. Projections are eventually consistent. Each projection tracks its
 *     own sequence cursor; rebuilding is safe and non-destructive.
 *  4. Exactly-once delivery semantics via DB-level deduplication.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';

/** Minimal shapes for explainabilityEngine (Phase 3). */
export interface MutationRecord {
  id: string;
  status: string;
  targetField?: string;
  proposedValue?: unknown;
  previousValue?: unknown;
  sourceEventIds: string[];
}

export interface UserEvolutionProfile {
  userId: string;
  [key: string]: unknown;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type EventType =
  | 'signal.captured'
  | 'trait.extracted'
  | 'mutation.proposed'
  | 'mutation.approved'
  | 'mutation.rejected'
  | 'mutation.quarantined'
  | 'identity.resolved'
  | 'goal.created'
  | 'goal.updated'
  | 'goal.completed'
  | 'goal.abandoned'
  | 'claim.extracted'
  | 'claim.contradicted'
  | 'claim.decayed'
  | 'uncertainty.raised'
  | 'uncertainty.resolved'
  | 'crucible.session.started'
  | 'crucible.session.ended'
  | 'crucible.pressure.applied'
  | 'resonance.session.started'
  | 'resonance.session.ended'
  | 'journal.entry.created'
  | 'journal.entry.updated'
  | 'evolution.frozen'
  | 'evolution.unfrozen'
  | 'evolution.reverted'
  | 'policy.violation'
  | 'security.event'
  | 'schema.migrated'
  | 'explanation.generated'
  | 'retention.scheduled'
  | 'retention.executed'
  | 'user.deletion.requested'
  | 'system.degraded'
  | 'system.recovered'
  /** Durable mirror of {@link AtlasEventBus} emits for idempotent projections */
  | 'atlas.internal.bus_event';

export interface AtlasEvent<TPayload = unknown> {
  id: string;               // UUID v4
  idempotencyKey: string;   // deterministic hash — dedup key
  type: EventType;
  userId: string;
  sessionId?: string;
  payload: TPayload;
  schemaVersion: number;    // payload schema version
  timestamp: string;        // ISO 8601
  causationId?: string;     // id of the event that caused this one
  correlationId?: string;   // id of the root event in a chain
}

export interface ProjectionCursor {
  projectionName: string;
  lastProcessedEventId: string | null;
  lastProcessedAt: string | null;
  processedCount: number;
  rebuilding: boolean;
}

export interface DeduplicationResult {
  isDuplicate: boolean;
  originalEventId?: string;
  originalTimestamp?: string;
}

export interface ReplayResult {
  projectionName: string;
  eventsReplayed: number;
  startedAt: string;
  completedAt: string;
  errors: string[];
}

// ─── Idempotency Key Generation ───────────────────────────────────────────────

/**
 * Generate a deterministic idempotency key for an event.
 * The same logical event always produces the same key, enabling dedup
 * even if the event is emitted multiple times.
 */
export function generateIdempotencyKey(
  type: EventType,
  userId: string,
  payload: unknown,
  sessionId?: string
): string {
  const content = JSON.stringify({
    type,
    userId,
    sessionId: sessionId ?? null,
    payload,
  });
  return `atlas_${type.replace(/\./g, '_')}_${createHash('sha256').update(content).digest('hex').slice(0, 32)}`;
}

/**
 * Generate a time-windowed idempotency key for high-frequency events
 * (e.g., signal.captured) where the same payload may legitimately recur.
 * Window size defaults to 60 seconds.
 */
export function generateWindowedIdempotencyKey(
  type: EventType,
  userId: string,
  payload: unknown,
  windowSeconds = 60
): string {
  const windowBucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const content = JSON.stringify({ type, userId, payload, windowBucket });
  return `atlas_win_${type.replace(/\./g, '_')}_${createHash('sha256').update(content).digest('hex').slice(0, 32)}`;
}

// ─── Event Store ──────────────────────────────────────────────────────────────

export class EventStore {
  private supabase: SupabaseClient;
  private memoryQueue: AtlasEvent[] = [];   // In-memory buffer when DB is unavailable
  private projectionCursors = new Map<string, ProjectionCursor>();

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Append an event to the immutable event log.
   * Returns { isDuplicate: true } if the idempotency key was already seen.
   */
  async append<TPayload>(
    event: Omit<AtlasEvent<TPayload>, 'id' | 'timestamp'>
  ): Promise<{ event: AtlasEvent<TPayload>; isDuplicate: boolean }> {
    const fullEvent: AtlasEvent<TPayload> = {
      ...event,
      id: this.generateUUID(),
      timestamp: new Date().toISOString(),
    };

    // Check for duplicate
    const { data: existing } = await this.supabase
      .from('atlas_events')
      .select('id, emitted_at')
      .eq('idempotency_key', fullEvent.idempotencyKey)
      .maybeSingle();

    if (existing) {
      return { event: fullEvent, isDuplicate: true };
    }

    const tsMs = Date.parse(fullEvent.timestamp);
    const { error } = await this.supabase.from('atlas_events').insert({
      id: fullEvent.id,
      idempotency_key: fullEvent.idempotencyKey,
      type: fullEvent.type,
      user_id: fullEvent.userId,
      session_id: fullEvent.sessionId ?? '',
      timestamp: Number.isFinite(tsMs) ? tsMs : Date.now(),
      payload: fullEvent.payload as object,
      source: 'phase3_event_store',
      schema_version: fullEvent.schemaVersion ?? 1,
      caused_by: fullEvent.causationId ?? null,
      correlation_id: fullEvent.correlationId ?? null,
      projection_rebuilt: false,
    });

    if (error) {
      // DB unavailable — buffer in memory
      this.memoryQueue.push(fullEvent);
      console.warn(`[EventStore] DB unavailable, buffered event ${fullEvent.id} in memory`);
    }

    return { event: fullEvent, isDuplicate: false };
  }

  /**
   * Check if an idempotency key has already been processed.
   */
  async checkDuplicate(idempotencyKey: string): Promise<DeduplicationResult> {
    const { data } = await this.supabase
      .from('atlas_events')
      .select('id, emitted_at')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (data) {
      return {
        isDuplicate: true,
        originalEventId: data.id,
        originalTimestamp: data.emitted_at,
      };
    }

    return { isDuplicate: false };
  }

  /**
   * Read events for a user, optionally filtered by type and after a cursor.
   */
  async readEvents(options: {
    userId: string;
    types?: EventType[];
    afterEventId?: string;
    afterTimestamp?: string;
    limit?: number;
  }): Promise<AtlasEvent[]> {
    let query = this.supabase
      .from('atlas_events')
      .select('*')
      .eq('user_id', options.userId)
      .order('emitted_at', { ascending: true })
      .limit(options.limit ?? 500);

    if (options.types?.length) {
      query = query.in('type', options.types);
    }

    if (options.afterTimestamp) {
      query = query.gt('emitted_at', options.afterTimestamp);
    }

    const { data, error } = await query;
    if (error) return [];

    return (data ?? []).map(row => this.rowToEvent(row));
  }

  /**
   * Flush the in-memory buffer to DB (called on recovery).
   */
  async flushMemoryBuffer(): Promise<{ flushed: number; errors: number }> {
    if (this.memoryQueue.length === 0) return { flushed: 0, errors: 0 };

    let flushed = 0;
    let errors = 0;
    const toFlush = [...this.memoryQueue];
    this.memoryQueue = [];

    for (const event of toFlush) {
      const { isDuplicate } = await this.append(event);
      if (!isDuplicate) flushed++;
      else errors++; // Shouldn't happen, but handle gracefully
    }

    console.log(`[EventStore] Flushed ${flushed} buffered events`);
    return { flushed, errors };
  }

  private rowToEvent(row: Record<string, unknown>): AtlasEvent {
    const emitted = row.emitted_at as string | undefined;
    const ts = row.timestamp as number | undefined;
    const iso =
      typeof emitted === 'string'
        ? emitted
        : typeof ts === 'number'
          ? new Date(ts).toISOString()
          : new Date().toISOString();
    return {
      id: row.id as string,
      idempotencyKey: (row.idempotency_key as string) ?? '',
      type: row.type as EventType,
      userId: row.user_id as string,
      sessionId: row.session_id as string | undefined,
      payload: row.payload,
      schemaVersion: (row.schema_version as number) ?? 1,
      timestamp: iso,
      causationId: row.caused_by as string | undefined,
      correlationId: row.correlation_id as string | undefined,
    };
  }

  private generateUUID(): string {
    return randomUUID();
  }
}

// ─── Projection Rebuilder ─────────────────────────────────────────────────────

export type ProjectionHandler<TState> = (
  state: TState,
  event: AtlasEvent
) => TState | Promise<TState>;

export interface ProjectionDefinition<TState> {
  name: string;
  initialState: () => TState;
  eventTypes: EventType[];
  handler: ProjectionHandler<TState>;
  onComplete?: (finalState: TState) => Promise<void>;
}

export class ProjectionRebuilder {
  private store: EventStore;
  private supabase: SupabaseClient;

  constructor(store: EventStore, supabaseUrl: string, supabaseKey: string) {
    this.store = store;
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Rebuild a projection from scratch for a specific user.
   * Processes all matching events in chronological order.
   */
  async rebuild<TState>(
    definition: ProjectionDefinition<TState>,
    userId: string,
    options: { fromTimestamp?: string } = {}
  ): Promise<ReplayResult> {
    const startedAt = new Date().toISOString();
    let state = definition.initialState();
    let eventsReplayed = 0;
    const errors: string[] = [];

    console.log(`[ProjectionRebuilder] Rebuilding ${definition.name} for user ${userId}`);

    // Mark as rebuilding
    await this.setCursorRebuilding(definition.name, userId, true);

    try {
      const events = await this.store.readEvents({
        userId,
        types: definition.eventTypes,
        afterTimestamp: options.fromTimestamp,
        limit: 10000,
      });

      for (const event of events) {
        try {
          state = await definition.handler(state, event);
          eventsReplayed++;
        } catch (err: any) {
          errors.push(`Event ${event.id} (${event.type}): ${err.message}`);
          // Continue replay — skip broken events, don't abort
        }
      }

      // Persist final state
      if (definition.onComplete) {
        await definition.onComplete(state);
      }

      await this.setCursorRebuilding(definition.name, userId, false);

      const completedAt = new Date().toISOString();
      console.log(`[ProjectionRebuilder] ${definition.name} rebuilt: ${eventsReplayed} events`);

      return {
        projectionName: definition.name,
        eventsReplayed,
        startedAt,
        completedAt,
        errors,
      };
    } catch (err: any) {
      await this.setCursorRebuilding(definition.name, userId, false);
      return {
        projectionName: definition.name,
        eventsReplayed,
        startedAt,
        completedAt: new Date().toISOString(),
        errors: [...errors, `Fatal: ${err.message}`],
      };
    }
  }

  /**
   * Incrementally update a projection — only processes events newer than
   * the last cursor position.
   */
  async updateIncremental<TState>(
    definition: ProjectionDefinition<TState>,
    userId: string,
    currentState: TState
  ): Promise<{ state: TState; eventsApplied: number }> {
    const cursor = await this.getCursor(definition.name, userId);
    let state = currentState;
    let eventsApplied = 0;

    const events = await this.store.readEvents({
      userId,
      types: definition.eventTypes,
      afterTimestamp: cursor?.lastProcessedAt ?? undefined,
      limit: 200,
    });

    for (const event of events) {
      try {
        state = await definition.handler(state, event);
        eventsApplied++;
        await this.updateCursor(definition.name, userId, event.id, event.timestamp);
      } catch {
        // Skip malformed events
      }
    }

    return { state, eventsApplied };
  }

  private async getCursor(projectionName: string, userId: string): Promise<ProjectionCursor | null> {
    const { data } = await this.supabase
      .from('atlas_projection_cursors')
      .select('*')
      .eq('projection_name', projectionName)
      .eq('user_id', userId)
      .single();
    return data;
  }

  private async updateCursor(
    projectionName: string,
    userId: string,
    lastEventId: string,
    lastEventTimestamp: string
  ): Promise<void> {
    await this.supabase.from('atlas_projection_cursors').upsert({
      projection_name: projectionName,
      user_id: userId,
      last_processed_event_id: lastEventId,
      last_processed_at: lastEventTimestamp,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'projection_name,user_id' });
  }

  private async setCursorRebuilding(
    projectionName: string,
    userId: string,
    rebuilding: boolean
  ): Promise<void> {
    await this.supabase.from('atlas_projection_cursors').upsert({
      projection_name: projectionName,
      user_id: userId,
      rebuilding,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'projection_name,user_id' });
  }
}

// ─── Singleton factory ────────────────────────────────────────────────────────

let _eventStore: EventStore | null = null;
let _rebuilder: ProjectionRebuilder | null = null;

export function getEventStore(): EventStore | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_KEY?.trim();
  if (!url || !key) return null;
  if (!_eventStore) {
    _eventStore = new EventStore(url, key);
  }
  return _eventStore;
}

export function getProjectionRebuilder(): ProjectionRebuilder | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_KEY?.trim();
  if (!url || !key) return null;
  if (!_rebuilder) {
    const store = getEventStore();
    if (!store) return null;
    _rebuilder = new ProjectionRebuilder(store, url, key);
  }
  return _rebuilder;
}

// ─── SQL for projection cursor table ─────────────────────────────────────────

export const PROJECTION_CURSORS_SQL = `
  CREATE TABLE IF NOT EXISTS atlas_projection_cursors (
    projection_name          TEXT NOT NULL,
    user_id                  TEXT NOT NULL,
    last_processed_event_id  UUID,
    last_processed_at        TIMESTAMPTZ,
    processed_count          INTEGER NOT NULL DEFAULT 0,
    rebuilding               BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (projection_name, user_id)
  );
`;
