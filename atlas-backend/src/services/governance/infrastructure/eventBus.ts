/**
 * Lightweight typed event bus for governance infrastructure.
 * All governance subsystem events flow through this bus for observability and cross-cutting concerns.
 */

import { z } from 'zod';

/* ───────── Event type registry ───────── */

export const governanceEventTypeSchema = z.enum([
  'PRECEDENCE_RESOLVED',
  'SAME_LAYER_CONFLICT',
  'CONSTITUTIONAL_VIOLATION_BLOCKED',
  'STATE_MIGRATION_APPLIED',
  'STATE_MIGRATION_FAILED',
  'STATE_PROJECTION_REBUILT',
  'STATE_VERSION_CHECK',
  'SUBSYSTEM_HEALTH_CHANGED',
  'DEGRADED_MODE_CHANGED',
  'DEGRADED_FALLBACK_USED',
]);

export type GovernanceEventType = z.infer<typeof governanceEventTypeSchema>;

/* ───────── Event envelope ───────── */

export interface GovernanceEvent<T = unknown> {
  type: GovernanceEventType;
  timestamp: string;
  source: string;
  payload: T;
}

export type GovernanceEventHandler<T = unknown> = (event: GovernanceEvent<T>) => void;

/* ───────── Bus implementation ───────── */

const listeners = new Map<GovernanceEventType, GovernanceEventHandler[]>();
const globalListeners: GovernanceEventHandler[] = [];

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Emit a governance event. All registered handlers for the event type — plus global listeners — are invoked synchronously.
 */
export function emit<T>(type: GovernanceEventType, source: string, payload: T): GovernanceEvent<T> {
  const event: GovernanceEvent<T> = { type, timestamp: nowIso(), source, payload };

  const handlers = listeners.get(type);
  if (handlers) {
    for (const h of handlers) h(event);
  }
  for (const h of globalListeners) h(event);

  return event;
}

/**
 * Subscribe to a specific event type.
 */
export function on<T = unknown>(type: GovernanceEventType, handler: GovernanceEventHandler<T>): () => void {
  const list = listeners.get(type) ?? [];
  list.push(handler as GovernanceEventHandler);
  listeners.set(type, list);

  return () => {
    const idx = list.indexOf(handler as GovernanceEventHandler);
    if (idx >= 0) list.splice(idx, 1);
  };
}

/**
 * Subscribe to all events (useful for audit logging / metrics).
 */
export function onAny(handler: GovernanceEventHandler): () => void {
  globalListeners.push(handler);
  return () => {
    const idx = globalListeners.indexOf(handler);
    if (idx >= 0) globalListeners.splice(idx, 1);
  };
}

/**
 * Remove all listeners — primarily for tests.
 */
export function resetBus(): void {
  listeners.clear();
  globalListeners.length = 0;
}
