import type { AtlasEvent } from './eventBus.js';
import { getEventStore } from './eventIdempotency.js';

/**
 * Best-effort idempotent append to Phase 3 EventStore (does not replace AtlasEventBus flush).
 */
export function mirrorAtlasBusEventToEventStore(event: AtlasEvent): void {
  const store = getEventStore();
  if (!store) return;

  void store
    .append({
      idempotencyKey: `atlas_emit_${event.id}`,
      type: 'atlas.internal.bus_event',
      userId: event.userId,
      sessionId: event.sessionId,
      payload: {
        busId: event.id,
        busType: event.type,
        busSource: event.source,
        busPayload: event.payload,
        correlationId: event.correlationId,
        causedBy: event.causedBy,
        timestamp: event.timestamp,
      },
      schemaVersion: 1,
    })
    .catch((err) => {
      console.warn('[AtlasEventBus] EventStore mirror failed:', err);
    });
}
