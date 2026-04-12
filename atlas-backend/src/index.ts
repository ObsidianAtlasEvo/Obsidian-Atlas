import './bootstrapEnv.js';
import { validateEnv } from './validateEnv.js';
validateEnv();

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
import { attachAtlasSession } from './services/auth/authProvider.js';
import { registerDegradedModeRoutes } from './routes/degradedModeRoutes.js';
import { startPolling } from './services/governance/degraded/degradedModeOracle.js';
import { initAutoRecovery } from './services/governance/degraded/recoveryOrchestrator.js';
import { registerExplanationRoutes } from './routes/explanationRoutes.js';
import { registerRetentionRoutes } from './routes/retentionRoutes.js';
import { registerGovernanceConsoleRoutes } from './routes/governanceConsoleRoutes.js';
import orchestrateRoutes from './routes/orchestrate.js';
import embeddingsRoutes from './routes/embeddings.js';
import modelRoutes from './routes/models.js';
import { registerGapLedgerRoutes } from './routes/gapLedgerRoutes.js';
import { loadPersistedJobs } from './services/inference/queueManager.js';

// ---------------------------------------------------------------------------
// Validate critical env vars BEFORE anything else touches secrets or DB.
// ---------------------------------------------------------------------------
function validateRequiredEnv(): void {
  const required = ['AUTH_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `[FATAL] Missing required environment variables: ${missing.join(', ')}. Server cannot start without them.`,
    );
  }
}
validateRequiredEnv();

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

// ---------------------------------------------------------------------------
// Strip spoofable identity headers — identity must come from verified JWT only.
// x-atlas-verified-email is legitimately set by a trusted reverse-proxy when
// ATLAS_TRUST_ROUTING_EMAIL_HEADER=true, but if the request reaches the server
// directly (no proxy) those headers must not be trusted from arbitrary clients.
// ---------------------------------------------------------------------------
app.addHook('onRequest', async (request) => {
  delete request.headers['x-user-email'];
  delete request.headers['x-forwarded-user'];
  delete request.headers['x-user-id'];
  delete request.headers['x-actor-id'];
  // Only strip the routing header when there is no trusted gateway configured —
  // when the flag is on, the gateway is responsible for sanitising this header.
  if (!env.trustAtlasRoutingEmailHeader) {
    delete request.headers['x-atlas-verified-email'];
  }
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
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Atlas-Verified-Email'],
});

await registerRateLimit(app);
registerHealthRoutes(app);
registerInferenceQueueRoutes(app);
registerAuthRoutes(app);
registerOllamaCompatRoutes(app);
registerOmniStreamRoutes(app);
registerSovereigntyRoutes(app);
// ── Governance routes — all require a valid Atlas session ─────────────────
await app.register(async (protected_app) => {
  protected_app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    await attachAtlasSession(request);
    if (!request.atlasVerifiedEmail) {
      return reply.code(401).send({ error: 'Unauthorized — Atlas session required' });
    }
  });
  registerCognitiveGovernanceRoutes(protected_app);
  registerLongitudinalRoutes(protected_app);
  registerStrategicModelingRoutes(protected_app);
  registerLegacyRoutes(protected_app);
  registerSovereignOverviewRoutes(protected_app);
  registerIntelligenceChambersRoutes(protected_app);
  registerMindMapRoutes(protected_app);
  registerRetentionRoutes(protected_app);
  registerGovernanceConsoleRoutes(protected_app);
  registerGapLedgerRoutes(protected_app);
});
registerDegradedModeRoutes(app);
registerExplanationRoutes(app);
await app.register(orchestrateRoutes);
await app.register(embeddingsRoutes);
await app.register(modelRoutes);

// POST /chat forwards to the handler registered as POST /v1/chat/omni-stream (same body, no model call here).
app.post('/chat', async (request: FastifyRequest, reply: FastifyReply) => {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/chat/omni-stream',
    payload: request.body as Record<string, unknown>,
    headers: {
      'content-type': 'application/json',
      // Forward session cookie so /v1/chat is authenticated (fix: was always unauthenticated)
      ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
    },
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
      'atlas ready  GET /health  POST /chat  POST /v1/chat/omni-stream'
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
