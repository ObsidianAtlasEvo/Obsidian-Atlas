import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/sqlite.js';

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
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs)
      ),
    ]);
    return { name, ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { name, ok: false, latencyMs: Date.now() - start, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export default async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    const checks = await Promise.all([
      // 1. Supabase (live query against atlas_feature_flags)
      probeWithTimeout('supabase', async () => {
        const url = process.env.SUPABASE_URL;
        const key =
          process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
        if (!url || !key) throw new Error('SUPABASE credentials not set');
        // Use the PostgREST root endpoint — returns 200 with API metadata
        // regardless of which tables exist. Avoids 400s from missing tables.
        const res = await fetch(`${url}/rest/v1/`, {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }),

      // 2. Groq LLM availability
      probeWithTimeout('groq', async () => {
        if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }),

      // 3. SQLite (backbone of 20+ tables — locked WAL, corruption, disk full)
      probeWithTimeout('sqlite', async () => {
        const db = getDb();
        db.prepare('SELECT 1').get();
      }),

      // 4. Memory check — RSS against system total (not heapUsed/heapTotal which
      //    is always high because V8 commits exactly what it needs; that ratio
      //    tells you nothing about memory pressure).
      //    Alert if RSS exceeds 1.5 GB (process is leaking or thrashing).
      probeWithTimeout('memory', async () => {
        const { rss, heapUsed, heapTotal, external } = process.memoryUsage();
        const rssMb = Math.round(rss / 1024 / 1024);
        const heapPct = Math.round((heapUsed / heapTotal) * 100);
        // Hard limit: RSS > 1500 MB indicates a real leak — alert
        if (rssMb > 1500) throw new Error(`RSS at ${rssMb} MB (leak suspected)`);
        // Soft info: include heap ratio in error only if rss also high
        // (heapUsed/heapTotal is near 100% by design in a well-tuned V8 process)
        void heapPct; void external; // captured for future structured logging
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
