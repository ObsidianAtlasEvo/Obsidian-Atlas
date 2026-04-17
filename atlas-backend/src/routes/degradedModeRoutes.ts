/**
 * Degraded Mode Routes
 * Phase 4 Section 3 — API endpoint exposing the current degraded mode,
 * health signals, and mode timestamp for frontend polling.
 */

import type { FastifyInstance } from 'fastify';
import {
  getCurrentMode,
  getCurrentSignals,
  getModeSince,
} from '../services/governance/degraded/degradedModeOracle.js';

export function registerDegradedModeRoutes(app: FastifyInstance): void {
  app.get('/v1/governance/mode', async (_request, reply) => {
    const mode = getCurrentMode();
    const signals = getCurrentSignals();
    const since = getModeSince();

    return reply.send({ mode, signals, since });
  });
}
