/**
 * ⚠️  LEGACY ENTRY POINT — NOT USED IN PRODUCTION
 *
 * Production entry: src/index.ts  (compiled → dist/index.js)
 * Production start: `node dist/index.js` or PM2 process atlas-backend
 *
 * This file was the original Fastify orchestrator demo. It registers only a
 * subset of routes and reads from config.ts (which uses different env var
 * names — OLLAMA_URL, CHAT_MODEL — rather than the canonical env.ts schema).
 *
 * It does NOT register: billing, auth, rate-limiting, omniStream, sovereignty,
 * cognitive governance, journal, doctrine, or any route required for Atlas to
 * function in production.
 *
 * To run the full server locally:
 *   tsx watch src/index.ts
 *
 * Do NOT add new routes here. This file is retained for reference only.
 */
import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { config } from './config.js';
import healthRoutes from './routes/health.js';
import embeddingsRoutes from './routes/embeddings.js';
import modelRoutes from './routes/models.js';
import { registerGovernanceConsoleRoutes } from './routes/governanceConsoleRoutes.js';
import { registerDiagnosticsRoutes } from './routes/diagnosticsRoutes.js';

const app = Fastify({
  logger: {
    level: process.env['NODE_ENV'] === 'production' ? 'warn' : 'info',
    transport:
      process.env['NODE_ENV'] !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
});

async function bootstrap(): Promise<void> {
  // ── Plugins ────────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  });

  await app.register(cookie);

  // ── Routes ─────────────────────────────────────────────────────────────────
  await app.register(healthRoutes);
  await app.register(embeddingsRoutes);
  await app.register(modelRoutes);
  registerGovernanceConsoleRoutes(app);
  registerDiagnosticsRoutes(app);

  // ── Global error handler ───────────────────────────────────────────────────
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    app.log.error({ err: error }, 'Unhandled route error');
    const statusCode = error.statusCode ?? 500;
    void reply.status(statusCode).send({
      error: error.message ?? 'Internal Server Error',
      statusCode,
    });
  });

  // ── Start ──────────────────────────────────────────────────────────────────
  await app.listen({ port: config.port, host: config.host });

  app.log.info(
    `Atlas Backend listening on http://${config.host}:${config.port}`,
  );
  app.log.info(`Ollama URL: ${config.ollamaUrl}`);
  app.log.info(`Chat model: ${config.chatModel}`);
  app.log.info(`Embed model: ${config.embedModel}`);
  app.log.info(`CORS origins: ${config.corsOrigins.join(', ')}`);
}

// ── Graceful shutdown ──────────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  app.log.info(`Received ${signal} — shutting down gracefully`);
  try {
    await app.close();
    app.log.info('Server closed');
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  app.log.error({ reason }, 'Unhandled Promise rejection');
});

// ── Entry point ────────────────────────────────────────────────────────────
bootstrap().catch((err: unknown) => {
  console.error('Failed to start Atlas Backend:', err);
  process.exit(1);
});

