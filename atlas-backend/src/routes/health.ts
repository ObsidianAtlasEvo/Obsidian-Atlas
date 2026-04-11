import type { FastifyInstance } from 'fastify';
import { ping } from '../services/ollama.js';
import { getFailureModeDoctrine } from '../resilience/failureModeDoctrine.js';
import { getSchemaVersionManager } from '../persistence/schemaVersioning.js';

const startTime = Date.now();

export default async function healthRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/health
   * Returns server status, uptime, and Ollama reachability.
   */
  app.get('/v1/health', async (_request, reply) => {
    const ollamaReachable = await ping();

    const doctrine = getFailureModeDoctrine();
    const systems = doctrine.getHealthSnapshot();
    const degraded = systems.filter((s) => s.status === 'degraded' || s.status === 'failed');
    const schema = getSchemaVersionManager();
    const storeHealth = schema.getStoreHealth();
    const pendingMigrations = storeHealth.filter((s) => !s.isHealthy).length;

    return reply.status(200).send({
      status: degraded.length === 0 ? 'ok' : 'degraded',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      ollamaReachable,
      phase3: {
        degradedSystems: degraded.map((s) => s.system),
        pendingMigrations,
      },
    });
  });
}
