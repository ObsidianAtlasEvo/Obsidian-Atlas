import './bootstrapEnv.js';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { env } from './config/env.js';
import { startChronosScheduler } from './services/autonomy/chronos.js';
import { initSemanticVectorIndex } from './db/vectorStore.js';
import { initSqlite } from './db/sqlite.js';
import registerHealthRoutes from './routes/health.js'
import { registerRateLimit } from './plugins/rateLimit.js';
import { registerOllamaCompatRoutes } from './routes/ollamaCompat.js';
import { registerInferenceQueueRoutes } from './routes/inferenceQueue.js';
import { registerOmniStreamRoutes } from './routes/omniStream.js';
import { registerCognitiveGovernanceRoutes } from './routes/cognitiveGovernanceRoutes.js';
import { registerLongitudinalRoutes } from './routes/longitudinalRoutes.js';
import { registerStrategicModelingRoutes } from './routes/strategicModelingRoutes.js';
import { registerLegacyRoutes } from './routes/legacyRoutes.js';
import { registerSovereignOverviewRoutes } from './routes/sovereignOverviewRoutes.js';
import { registerIntelligenceChambersRoutes } from './routes/intelligenceChambersRoutes.js';
import { registerMindMapRoutes } from './routes/mindMapRoutes.js';
import { registerSovereigntyRoutes } from './routes/sovereigntyRoutes.js';
import { registerAuthRoutes } from './routes/authRoutes.js';
import { registerDegradedModeRoutes } from './routes/degradedModeRoutes.js';
import { startPolling } from './services/governance/degraded/degradedModeOracle.js';
import { initAutoRecovery } from './services/governance/degraded/recoveryOrchestrator.js';
import { registerExplanationRoutes } from './routes/explanationRoutes.js';
import { registerRetentionRoutes } from './routes/retentionRoutes.js';
import { registerGovernanceConsoleRoutes } from './routes/governanceConsoleRoutes.js';
import { registerGapLedgerRoutes } from './routes/gapLedgerRoutes.js';
import { loadPersistedJobs } from './services/inference/queueManager.js';

initSqlite();
await initSemanticVectorIndex();

// Rehydrate inference queue — mark any stale pending/in_progress jobs from prior run.
const recoveredJobs = await loadPersistedJobs().catch(() => 0);
if (recoveredJobs > 0) {
  // eslint-disable-next-line no-console -- logged before Fastify instance exists
  console.log(`[atlas] recovered ${recoveredJobs} stale inference queue job(s) from Supabase`);
}

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
    redact: ['req.headers.authorization', 'req.headers["x-api-key"]', 'req.body.password'],
  },
});

app.setErrorHandler((err, request, reply) => {
  request.log.error(err);
  if (reply.sent) return;
  const e = err as Error & { statusCode?: number };
  const status = e.statusCode ?? 500;
  reply.status(status >= 400 && status < 600 ? status : 500).send({
    error: 'internal_error',
    message: process.env.NODE_ENV === 'production' ? 'Request failed' : String(e.message ?? err),
  });
});

await app.register(cookie);

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) {
      cb(null, true);
      return;
    }
    if (env.corsOrigins.includes(origin)) {
      cb(null, true);
      return;
    }
    cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
});

await registerRateLimit(app);
registerHealthRoutes(app);
registerInferenceQueueRoutes(app);
registerAuthRoutes(app);
registerOllamaCompatRoutes(app);
registerOmniStreamRoutes(app);
registerSovereigntyRoutes(app);
registerCognitiveGovernanceRoutes(app);
registerLongitudinalRoutes(app);
registerStrategicModelingRoutes(app);
registerLegacyRoutes(app);
registerSovereignOverviewRoutes(app);
registerIntelligenceChambersRoutes(app);
registerMindMapRoutes(app);
registerDegradedModeRoutes(app);
registerExplanationRoutes(app);
registerRetentionRoutes(app);
registerGovernanceConsoleRoutes(app);
registerGapLedgerRoutes(app);

// POST /chat forwards to the handler registered as POST /v1/chat (same body, no model call here).
app.post('/chat', async (request: FastifyRequest, reply: FastifyReply) => {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/chat',
    payload: request.body as Record<string, unknown>,
    headers: { 'content-type': 'application/json' },
  });
  reply.code(res.statusCode);
  const ct = res.headers['content-type'];
  if (ct) reply.header('content-type', ct);
  const raw = res.payload;
  try {
    return reply.send(JSON.parse(typeof raw === 'string' ? raw : String(raw)));
  } catch {
    return reply.send(raw);
  }
});

app
  .listen({ port: env.port, host: env.host })
  .then(() => {
    if (env.chronosEnabled) {
      startChronosScheduler();
      app.log.info(
        { chronosTickMs: env.chronosTickMs, chronosIdleMs: env.chronosIdleMs, filterUser: env.chronosUserId ?? 'any' },
        'chronos enabled'
      );
    }
    app.log.info(
      { host: env.host, port: env.port, ollamaBaseUrl: env.ollamaBaseUrl },
      'atlas ready  GET /health  POST /chat  POST /v1/chat'
    );
    app.log.info({ corsOrigins: env.corsOrigins }, 'cors origins');
    startPolling();
    initAutoRecovery();
    app.log.info('degraded mode oracle started (30s poll interval)');
  })
  .catch((err: unknown) => {
    app.log.error(err);
    process.exit(1);
  });
