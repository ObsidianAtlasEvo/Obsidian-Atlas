/**
 * AtlasEventBus
 *
 * Single append-only event architecture for all Atlas systems.
 * Every significant action emits an event here — this is the source of truth
 * for the cognition map, evolution timeline, audit logs, and debugging.
 *
 * Design:
 *  - emit() is synchronous for local handler dispatch (never blocks caller)
 *  - Async Supabase writes happen in the background via batched flushQueue
 *  - In-memory ledger is a fixed-size circular buffer (1000 events)
 *  - Errors in one handler never block others (isolated try/catch per handler)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AtlasEventType =
  // Evolution events
  | 'signal.captured'
  | 'signal.processed'
  | 'trait.extracted'
  | 'trait.updated'
  | 'trait.contradicted'
  | 'trait.decayed'
  | 'mutation.proposed'
  | 'mutation.validated'
  | 'mutation.committed'
  | 'mutation.rejected'
  | 'mutation.quarantined'
  | 'mutation.rolled_back'
  | 'evolution.cycle.started'
  | 'evolution.cycle.completed'
  | 'evolution.quarantined'
  // Overseer events
  | 'overseer.evaluated'
  | 'overseer.enhanced'
  | 'overseer.rewritten'
  // Chat events
  | 'chat.message.received'
  | 'chat.response.sent'
  | 'chat.model.selected'
  | 'chat.synthesis.completed'
  // Crucible events
  | 'crucible.session.started'
  | 'crucible.round.completed'
  | 'crucible.session.ended'
  | 'crucible.weakness.identified'
  | 'crucible.difficulty.adjusted'
  // Journal/Resonance events
  | 'journal.entry.saved'
  | 'resonance.triggered'
  | 'resonance.completed'
  | 'resonance.guardrail.triggered'
  // Evidence events
  | 'claim.extracted'
  | 'claim.verified'
  | 'claim.contradicted'
  | 'claim.decayed'
  | 'uncertainty.recorded'
  // Mission events
  | 'goal.detected'
  | 'goal.updated'
  | 'project.updated'
  | 'decision.recorded'
  | 'loop.opened'
  | 'loop.resolved'
  // Sovereign/system events
  | 'sovereign.prompt.edited'
  | 'sovereign.flag.toggled'
  | 'sovereign.deploy.triggered'
  | 'bug.reported'
  | 'release.published';

export interface AtlasEvent {
  /** Unique UUID for this event */
  id: string;
  type: AtlasEventType;
  /** 'system' for non-user events */
  userId: string;
  sessionId: string;
  /** Unix ms timestamp */
  timestamp: number;
  /** Arbitrary structured data specific to each event type */
  payload: Record<string, unknown>;
  /** Which Atlas subsystem emitted this (e.g. 'evolution-engine', 'chat-router') */
  source: string;
  /** Links events in the same logical operation (proposal → validation → commit) */
  correlationId?: string;
  /** Event ID that directly caused this one */
  causedBy?: string;
}

export type EventHandler = (event: AtlasEvent) => void | Promise<void>;

export interface EventSubscription {
  id: string;
  /** Subscribe to one or many event types */
  eventTypes: AtlasEventType[];
  handler: EventHandler;
  /** Optional predicate — handler is only called when this returns true */
  filter?: (event: AtlasEvent) => boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEDGER_MAX_SIZE = 1000;
const FLUSH_INTERVAL_MS = 10_000; // 10 seconds
const FLUSH_BATCH_SIZE = 100;
const SUPABASE_TABLE = 'atlas_events';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  // Crypto UUID if available (Node 14.17+ / modern browsers), else fallback
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// AtlasEventBus
// ---------------------------------------------------------------------------

export class AtlasEventBus {
  private static instance: AtlasEventBus | null = null;

  /** event type → list of active subscriptions */
  private handlers: Map<AtlasEventType, EventSubscription[]> = new Map();

  /** Circular buffer — newest events at the end */
  private ledger: AtlasEvent[] = [];

  /** Pending events waiting to be written to Supabase */
  private flushQueue: AtlasEvent[] = [];

  private flushTimer: ReturnType<typeof setInterval> | null = null;

  private supabaseUrl: string;
  private supabaseKey: string;

  // -------------------------------------------------------------------------
  // Construction / Singleton
  // -------------------------------------------------------------------------

  private constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
  }

  /**
   * Returns the singleton instance.
   * First call must supply supabaseUrl + supabaseKey; subsequent calls can
   * omit them to retrieve the existing instance.
   */
  static getInstance(supabaseUrl?: string, supabaseKey?: string): AtlasEventBus {
    if (!AtlasEventBus.instance) {
      if (!supabaseUrl || !supabaseKey) {
        throw new Error(
          'AtlasEventBus: supabaseUrl and supabaseKey are required on first initialization.',
        );
      }
      AtlasEventBus.instance = new AtlasEventBus(supabaseUrl, supabaseKey);
    }
    return AtlasEventBus.instance;
  }

  /** Replace the singleton (useful in tests) */
  static resetInstance(): void {
    if (AtlasEventBus.instance) {
      AtlasEventBus.instance.stopFlush();
      AtlasEventBus.instance = null;
    }
  }

  // -------------------------------------------------------------------------
  // Core: emit
  // -------------------------------------------------------------------------

  /**
   * Emit an event.
   *
   * - Synchronously dispatches to all matching local handlers.
   * - Appends to the in-memory ledger (capped at LEDGER_MAX_SIZE).
   * - Queues the event for async background write to Supabase.
   *
   * Returns the generated event ID.
   */
  emit(event: Omit<AtlasEvent, 'id' | 'timestamp'>): string {
    const fullEvent: AtlasEvent = {
      ...event,
      id: generateId(),
      timestamp: Date.now(),
    };

    // 1. Append to in-memory circular ledger
    this.ledger.push(fullEvent);
    if (this.ledger.length > LEDGER_MAX_SIZE) {
      this.ledger.splice(0, this.ledger.length - LEDGER_MAX_SIZE);
    }

    // 2. Queue for Supabase write
    this.flushQueue.push(fullEvent);

    // 3. Synchronous local dispatch — errors are isolated per handler
    this.dispatchToHandlers(fullEvent);

    // 4. Phase 3 — idempotent mirror for projections (non-blocking)
    void import('./eventBusMirror.js').then(({ mirrorAtlasBusEventToEventStore }) => {
      mirrorAtlasBusEventToEventStore(fullEvent);
    });

    return fullEvent.id;
  }

  /** Synchronous dispatch loop — never throws to caller */
  private dispatchToHandlers(event: AtlasEvent): void {
    const subs = this.handlers.get(event.type);
    if (!subs || subs.length === 0) return;

    for (const sub of subs) {
      try {
        // Apply optional filter predicate
        if (sub.filter && !sub.filter(event)) continue;

        const result = sub.handler(event);

        // If the handler returned a promise, catch async errors silently
        if (result instanceof Promise) {
          result.catch((err) => {
            console.error(
              `[AtlasEventBus] Async handler error (sub ${sub.id}, event ${event.type}):`,
              err,
            );
          });
        }
      } catch (err) {
        console.error(
          `[AtlasEventBus] Sync handler error (sub ${sub.id}, event ${event.type}):`,
          err,
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Subscribe / Unsubscribe
  // -------------------------------------------------------------------------

  /**
   * Register a handler for one or more event types.
   * Returns the subscription ID (needed to unsubscribe).
   */
  subscribe(subscription: Omit<EventSubscription, 'id'>): string {
    const id = generateId();
    const fullSub: EventSubscription = { ...subscription, id };

    for (const type of subscription.eventTypes) {
      if (!this.handlers.has(type)) {
        this.handlers.set(type, []);
      }
      this.handlers.get(type)!.push(fullSub);
    }

    return id;
  }

  /** Remove a subscription by its ID */
  unsubscribe(subscriptionId: string): void {
    for (const [type, subs] of this.handlers.entries()) {
      const filtered = subs.filter((s) => s.id !== subscriptionId);
      if (filtered.length !== subs.length) {
        this.handlers.set(type, filtered);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Query in-memory ledger
  // -------------------------------------------------------------------------

  /**
   * Return the most recent N events for a user (or all users if userId is 'system').
   * Results are in chronological order (oldest first).
   */
  getRecent(userId: string, limit = 50): AtlasEvent[] {
    const filtered =
      userId === 'system'
        ? this.ledger
        : this.ledger.filter((e) => e.userId === userId);

    return filtered.slice(-limit);
  }

  /** Return recent events of a specific type for a user */
  getByType(type: AtlasEventType, userId: string, limit = 50): AtlasEvent[] {
    const filtered = this.ledger.filter(
      (e) => e.type === type && (userId === 'system' || e.userId === userId),
    );
    return filtered.slice(-limit);
  }

  /**
   * Return all in-memory events that share a correlationId.
   * Useful for tracing a mutation proposal → validation → commit chain.
   */
  getCorrelationChain(correlationId: string): AtlasEvent[] {
    return this.ledger
      .filter((e) => e.correlationId === correlationId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  // -------------------------------------------------------------------------
  // Supabase flush
  // -------------------------------------------------------------------------

  /**
   * Drain the flushQueue and write to Supabase in batches.
   * Called automatically by the periodic timer; can also be called manually.
   */
  async flush(): Promise<void> {
    if (this.flushQueue.length === 0) return;

    // Drain the queue atomically
    const batch = this.flushQueue.splice(0, Math.min(this.flushQueue.length, FLUSH_BATCH_SIZE));

    if (batch.length === 0) return;

    const rows = batch.map((e) => ({
      id: e.id,
      type: e.type,
      user_id: e.userId,
      session_id: e.sessionId,
      timestamp: e.timestamp,
      payload: e.payload,
      source: e.source,
      correlation_id: e.correlationId ?? null,
      caused_by: e.causedBy ?? null,
    }));

    try {
      const response = await fetch(
        `${this.supabaseUrl}/rest/v1/${SUPABASE_TABLE}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.supabaseKey,
            Authorization: `Bearer ${this.supabaseKey}`,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(rows),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Supabase insert failed (${response.status}): ${text}`);
      }

      // If there are more items in the queue (we only took FLUSH_BATCH_SIZE),
      // schedule an immediate follow-up flush
      if (this.flushQueue.length > 0) {
        // Non-blocking follow-up
        Promise.resolve().then(() => this.flush()).catch(console.error);
      }
    } catch (err) {
      // Put events back at the front of the queue so they aren't lost
      this.flushQueue.unshift(...batch);
      console.error('[AtlasEventBus] Flush to Supabase failed:', err);
    }
  }

  /** Start the periodic background flush timer */
  startFlush(): void {
    if (this.flushTimer !== null) return; // already running
    this.flushTimer = setInterval(() => {
      this.flush().catch(console.error);
    }, FLUSH_INTERVAL_MS);
  }

  /** Stop the periodic background flush timer */
  stopFlush(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Diagnostics
  // -------------------------------------------------------------------------

  get ledgerSize(): number {
    return this.ledger.length;
  }

  get queueSize(): number {
    return this.flushQueue.length;
  }

  get handlerCount(): number {
    let total = 0;
    for (const subs of this.handlers.values()) total += subs.length;
    return total;
  }
}
