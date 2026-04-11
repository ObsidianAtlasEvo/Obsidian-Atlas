/**
 * Atlas Event Bus
 * Phase 2 Governance
 *
 * Singleton append-only event bus.
 * All governance systems emit and subscribe through this channel.
 * 35 event types across all subsystems.
 */

export type AtlasEventType =
  // Constitution & Mutation
  | 'MUTATION_COMMITTED'
  | 'MUTATION_QUARANTINED'
  | 'MUTATION_ROLLED_BACK'
  | 'MUTATION_PENDING_APPROVAL'
  | 'CONSTITUTION_VIOLATION'
  | 'SNAPSHOT_TAKEN'
  | 'QUARANTINE_SPIKE_DETECTED'
  // Identity & Traits
  | 'TRAIT_OBSERVED'
  | 'TRAIT_CONFIRMED'
  | 'TRAIT_DECAYED'
  | 'TRAIT_CONTRADICTED'
  | 'IDENTITY_DECAY_APPLIED'
  // Evidence & Claims
  | 'CLAIM_REGISTERED'
  | 'CLAIM_CONTRADICTED'
  | 'CLAIM_EXPIRED'
  | 'UNCERTAINTY_DISCLOSED'
  | 'EVIDENCE_CONTEXT_BUILT'
  // Goal Memory
  | 'GOAL_ADDED'
  | 'GOAL_UPDATED'
  | 'GOAL_COMPLETED'
  | 'GOAL_ABANDONED'
  | 'OPEN_LOOP_ADDED'
  | 'OPEN_LOOP_RESOLVED'
  | 'DECISION_RECORDED'
  // Precedence & Infrastructure
  | 'PRECEDENCE_RESOLVED'
  | 'SAME_LAYER_CONFLICT'
  | 'SUBSYSTEM_HEALTH_CHANGED'
  | 'STATE_MIGRATION_FAILED'
  | 'STATE_MIGRATED'
  | 'DEGRADED_MODE_ENTERED'
  | 'DEGRADED_MODE_EXITED'
  // Evaluation & Regression
  | 'EVALUATION_RUN'
  | 'REGRESSION_DETECTED'
  | 'IMPROVEMENT_DETECTED'
  // User Control
  | 'EVOLUTION_FROZEN'
  | 'EVOLUTION_REVERTED'
  | 'EVOLUTION_RESET';

export interface AtlasEvent<T = unknown> {
  id: string;
  type: AtlasEventType;
  userId: string | 'system';
  timestamp: string;
  payload: T;
  source: string; // subsystem that emitted it
}

type EventHandler<T = unknown> = (event: AtlasEvent<T>) => void;

class AtlasEventBusImpl {
  private readonly log: AtlasEvent[] = [];
  private readonly handlers: Map<AtlasEventType, Set<EventHandler>> = new Map();
  private readonly wildcardHandlers: Set<EventHandler> = new Set();
  private idCounter = 0;

  emit<T>(
    type: AtlasEventType,
    userId: string | 'system',
    payload: T,
    source: string
  ): AtlasEvent<T> {
    const event: AtlasEvent<T> = {
      id: `evt-${Date.now()}-${++this.idCounter}`,
      type,
      userId,
      timestamp: new Date().toISOString(),
      payload,
      source,
    };

    // Append-only
    this.log.push(event as AtlasEvent);

    // Notify specific handlers
    const specific = this.handlers.get(type);
    if (specific) {
      for (const handler of specific) {
        try { handler(event as AtlasEvent); } catch { /* swallow handler errors */ }
      }
    }

    // Notify wildcard handlers
    for (const handler of this.wildcardHandlers) {
      try { handler(event as AtlasEvent); } catch { /* swallow */ }
    }

    return event;
  }

  on<T>(type: AtlasEventType, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler as EventHandler);
    return () => this.handlers.get(type)?.delete(handler as EventHandler);
  }

  onAll(handler: EventHandler): () => void {
    this.wildcardHandlers.add(handler);
    return () => this.wildcardHandlers.delete(handler);
  }

  /**
   * Get full append-only event log, optionally filtered.
   */
  getLog(options: {
    userId?: string;
    types?: AtlasEventType[];
    since?: string;
    limit?: number;
  } = {}): AtlasEvent[] {
    let events = [...this.log];

    if (options.userId) events = events.filter((e) => e.userId === options.userId || e.userId === 'system');
    if (options.types) events = events.filter((e) => options.types!.includes(e.type));
    if (options.since) events = events.filter((e) => e.timestamp >= options.since!);
    if (options.limit) events = events.slice(-options.limit);

    return events;
  }

  /**
   * Replay events for a user — used by stateVersionManager for projection rebuilds.
   */
  replayForUser(userId: string, fromTimestamp?: string): AtlasEvent[] {
    return this.log.filter(
      (e) =>
        (e.userId === userId || e.userId === 'system') &&
        (!fromTimestamp || e.timestamp >= fromTimestamp)
    );
  }

  getEventCount(): number {
    return this.log.length;
  }
}

// Singleton
export const AtlasEventBus = new AtlasEventBusImpl();
