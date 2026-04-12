import type { FastifyInstance } from 'fastify';
import { ping } from '../services/ollama.js';
import { getFailureModeDoctrine } from '../resilience/failureModeDoctrine.js';
import { getSchemaVersionManager } from '../persistence/schemaVersioning.js';

// ---------------------------------------------------------------------------
// Dependency probe with timeout
// ---------------------------------------------------------------------------

interface DependencyStatus {
  name: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

async function probeWithTimeout<T>(
  name: string,
  fn: () => Promise<T>,
  timeoutMs = 3000
): Promise<DependencyStatus> {
  const start = Date.now();
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    return { name, ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { name, ok: false, latencyMs: Date.now() - start, error: (e as Error).message };
  }
}

const startTime = Date.now();

export default async function healthRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/health — Ollama + Phase 3 doctrine snapshot (SPA / ops default).
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

  /**
   * GET /health — dependency probes (Supabase, Groq, heap) for deploy dashboards.
   */
  app.get('/health', async (_request, reply) => {
    const checks = await Promise.all([
      probeWithTimeout('supabase', async () => {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error('SUPABASE credentials not set');
        const res = await fetch(`${url}/rest/v1/`, {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }),

      probeWithTimeout('groq', async () => {
        if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }),

      probeWithTimeout('memory', async () => {
        const { heapUsed, heapTotal } = process.memoryUsage();
        const pct = heapUsed / heapTotal;
        if (pct > 0.97) throw new Error(`Heap at ${Math.round(pct * 100)}%`);
      }),
    ]);

    const allOk = checks.every((c) => c.ok);

    return reply.code(allOk ? 200 : 503).send({
      status: allOk ? 'ok' : 'degraded',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      checks,
    });
  });
}
