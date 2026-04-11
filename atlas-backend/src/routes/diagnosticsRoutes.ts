/**
 * Diagnostics Routes
 * POST /v1/diagnostics/scan — returns server health data for BugHunter frontend.
 * Sovereign-gated to creator email.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CREATOR_EMAIL = 'crowleyrc62@gmail.com';

function isCreator(email?: string): boolean {
  return email?.trim().toLowerCase() === CREATOR_EMAIL;
}

const scanSchema = z.object({
  userEmail: z.string().email().optional(),
});

function getBackendVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function registerDiagnosticsRoutes(app: FastifyInstance): void {
  app.post('/v1/diagnostics/scan', async (request, reply) => {
    const parsed = scanSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }

    const { userEmail } = parsed.data;
    if (!isCreator(userEmail)) {
      return reply.send({
        error: 'UNAUTHORIZED: Sovereign Creator authentication required for diagnostics.',
      });
    }

    // Check LLM availability
    const { env } = await import('../config/env.js');
    const hasLlm = !!(env.groqApiKey?.trim() || env.cloudOpenAiApiKey?.trim());
    if (!hasLlm) {
      return reply.status(503).send({
        error: 'llm_not_configured',
        response: 'KERNEL ERROR: No LLM provider configured. Set GROQ_API_KEY or ATLAS_CLOUD_OPENAI_API_KEY in the backend environment.',
      });
    }

    const checks: Array<{ name: string; status: 'ok' | 'warn' | 'fail'; detail: string }> = [];

    // Check 1: LLM Provider
    checks.push({
      name: 'LLM Provider',
      status: hasLlm ? 'ok' : 'fail',
      detail: hasLlm ? 'Groq or Cloud OpenAI API key configured' : 'No GROQ_API_KEY or ATLAS_CLOUD_OPENAI_API_KEY set',
    });

    // Check 2: Memory usage
    const heapUsedMb = process.memoryUsage().heapUsed / 1024 / 1024;
    checks.push({
      name: 'Memory Usage',
      status: heapUsedMb > 512 ? 'warn' : 'ok',
      detail: `Heap: ${heapUsedMb.toFixed(1)} MB`,
    });

    // Check 3: Uptime
    const uptimeSeconds = process.uptime();
    checks.push({
      name: 'Process Uptime',
      status: 'ok',
      detail: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`,
    });

    // Check 4: Node version
    checks.push({
      name: 'Node.js Version',
      status: 'ok',
      detail: process.version,
    });

    // Check 5: Ollama configured
    checks.push({
      name: 'Ollama Configuration',
      status: env.disableLocalOllama ? 'warn' : 'ok',
      detail: env.disableLocalOllama ? 'Local Ollama disabled' : `Ollama at ${env.ollamaBaseUrl}`,
    });

    return reply.send({
      groqConfigured: !!(env.groqApiKey?.trim()),
      backendVersion: getBackendVersion(),
      uptime: Math.floor(uptimeSeconds),
      memoryUsageMb: Math.round(heapUsedMb * 10) / 10,
      nodeVersion: process.version,
      checks,
    });
  });
}
