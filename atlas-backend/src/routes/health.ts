import type { FastifyInstance } from 'fastify';
import { ping } from '../services/ollama.js';

const startTime = Date.now();

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
  app.get('/v1/health', async (_request, reply) => {
    const checks = await Promise.all([
      // 1. Ollama (local inference engine)
      probeWithTimeout('ollama', async () => {
        const reachable = await ping();
        if (!reachable) throw new Error('ollama unreachable');
      }),

      // 2. Groq LLM availability
      probeWithTimeout('groq', async () => {
        if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }),

      // 3. Memory / heap usage (fail if heap used > 90%)
      probeWithTimeout('memory', async () => {
        const { heapUsed, heapTotal } = process.memoryUsage();
        const pct = heapUsed / heapTotal;
        if (pct > 0.9) throw new Error(`Heap at ${Math.round(pct * 100)}%`);
      }),
    ]);

    const allOk = checks.every((c) => c.ok);

    return reply.code(allOk ? 200 : 503).send({
      status: allOk ? 'ok' : 'degraded',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      checks,
    });
  });
}
