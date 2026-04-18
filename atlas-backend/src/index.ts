import './bootstrapEnv.js';
import { validateEnv } from './validateEnv.js';
validateEnv();

import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { env } from './config/env.js';
import { startChronosScheduler } from './services/autonomy/chronos.js';
import { initSemanticVectorIndex } from './db/vectorStore.js';
import { initSqlite, getDb } from './db/sqlite.js';
import { runBootMigrations } from './services/governance/migration/bootMigrations.js';
import registerHealthRoutes from './routes/health.js'
import { registerRateLimit } from './plugins/rateLimit.js';
import { createScopedRateLimiter } from './plugins/scopedRateLimit.js';
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
import { attachAtlasSession, isGoogleAuthConfigured, jwtKeyMaterial } from './services/auth/authProvider.js';
import { registerDiagnosticsReportRoutes } from './routes/diagnosticsReportRoutes.js';
import { registerDegradedModeRoutes } from './routes/degradedModeRoutes.js';
import { startPolling } from './services/governance/degraded/degradedModeOracle.js';
import { initAutoRecovery } from './services/governance/degraded/recoveryOrchestrator.js';
import { registerExplanationRoutes } from './routes/explanationRoutes.js';
import { registerRetentionRoutes } from './routes/retentionRoutes.js';
import { registerGovernanceConsoleRoutes } from './routes/governanceConsoleRoutes.js';
import { registerJournalRoutes } from './routes/journalRoutes.js';
import { registerDoctrineRoutes } from './routes/doctrineRoutes.js';
import embeddingsRoutes from './routes/embeddings.js';
import modelRoutes from './routes/models.js';
import { registerGapLedgerRoutes } from './routes/gapLedgerRoutes.js';
import { registerChangeControlRoutes } from './routes/changeControlRoutes.js';
import { registerBillingRoutes } from './routes/billingRoutes.js';
import { registerUserPreferencesRoutes } from './routes/userPreferencesRoutes.js';
import { registerLegalRoutes } from './routes/legalRoutes.js';
import { loadPersistedJobs } from './services/inference/queueManager.js';

// ---------------------------------------------------------------------------
// Validate critical env vars BEFORE anything else touches secrets or DB.
// ---------------------------------------------------------------------------
function validateRequiredEnv(): void {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter((k) => !process.env[k]);

  // AUTH_SECRET and NEXTAUTH_SECRET are interchangeable — env.authSecret
  // resolves to NEXTAUTH_SECRET ?? AUTH_SECRET, so either being set is valid.
  if (!process.env.AUTH_SECRET && !process.env.NEXTAUTH_SECRET) {
    missing.push('AUTH_SECRET or NEXTAUTH_SECRET');
  }

  if (missing.length > 0) {
    throw new Error(
      `[FATAL] Missing required environment variables: ${missing.join(', ')}. Server cannot start without them.`,
    );
  }
}
validateRequiredEnv();

// AUDIT FIX: P2-17 — wrap boot steps in error boundaries for clear failure messages
try {
  initSqlite();
} catch (err) {
  console.error('[FATAL] SQLite initialization failed. Check SQLITE_PATH and disk permissions.', err);
  process.exit(1);
}

// Run registered schema migrations in topological order. `initSqlite()` has
// already created the authoritative `atlas_schema_migrations` table and
// rebuilt any legacy-shape DBs in place, so the runner's lock + audit writes
// are guaranteed to land on the canonical shape. Idempotent per
// (domain, version); set ATLAS_SKIP_BOOT_MIGRATIONS=true to short-circuit
// for ad-hoc scripts, CI, or test harnesses.
try {
  await runBootMigrations();
} catch (err) {
  console.error(
    '[FATAL] Boot migrations failed. Atlas cannot start with an inconsistent schema.',
    err,
  );
  process.exit(1);
}

try {
  await initSemanticVectorIndex();
} catch (err) {
  console.error('[FATAL] Semantic vector index initialization failed.', err);
  process.exit(1);
}

// Validate auth secret is usable at boot, not lazily on first request.
if (isGoogleAuthConfigured()) {
  try {
    jwtKeyMaterial(); // will throw if secret is missing/empty
    // eslint-disable-next-line no-console -- logged before Fastify instance exists
    console.log('[AUTH] JWT key material validated at boot');
  } catch (err) {
    // eslint-disable-next-line no-console -- logged before Fastify instance exists
    console.error('[AUTH] FATAL: JWT key material is invalid:', (err as Error).message);
    process.exit(1);
  }
}

// Rehydrate inference queue — mark any stale pending/in_progress jobs from prior run.
const recoveredJobs = await loadPersistedJobs().catch((err) => {
  // eslint-disable-next-line no-console -- logged before Fastify instance exists
  console.warn('[atlas] Failed to recover persisted jobs from Supabase:', err);
  return 0;
});
if (recoveredJobs > 0) {
  // eslint-disable-next-line no-console -- logged before Fastify instance exists
  console.log(`[atlas] recovered ${recoveredJobs} stale inference queue job(s) from Supabase`);
}

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: env.nodeEnv === 'development'
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
    message: env.nodeEnv === 'production' ? 'Request failed' : String(e.message ?? err),
  });
});

// ---------------------------------------------------------------------------
// Raw body support for Stripe webhook signature verification.
// The webhook route needs the original Buffer; all other routes get parsed JSON.
// ---------------------------------------------------------------------------
app.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  (req, body, done) => {
    if (req.url === '/webhooks/stripe' || req.url === '/v1/webhooks/stripe') {
      done(null, body); // keep as raw Buffer for Stripe signature verification
    } else {
      try {
        done(null, JSON.parse((body as Buffer).toString()));
      } catch (e) {
        done(e as Error);
      }
    }
  }
);

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
await registerHealthRoutes(app);
registerInferenceQueueRoutes(app);
registerAuthRoutes(app);
registerSovereigntyRoutes(app);
// ── Governance routes — all require a valid Atlas session ─────────────────
await app.register(async (protected_app) => {
  protected_app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    await attachAtlasSession(request);
    if (!request.atlasVerifiedEmail) {
      return reply.code(401).send({ error: 'Unauthorized — Atlas session required' });
    }
  });
  registerOmniStreamRoutes(protected_app);
  await registerOllamaCompatRoutes(protected_app);
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
  registerChangeControlRoutes(protected_app);
  registerJournalRoutes(protected_app);
  registerDoctrineRoutes(protected_app);
  registerDiagnosticsReportRoutes(protected_app);
  registerExplanationRoutes(protected_app);
});
// ── Billing routes — session-based billing + Stripe webhook (raw body) ──────
// Billing routes expect request.atlasSession (userId + email). Bridge from
// the existing OAuth auth (atlasAuthUser) via a preHandler hook.
// The webhook route (/webhooks/stripe) handles its own auth via Stripe
// signatures and does not call requireSession(), so the hook is harmless there.
// ── Billing routes — session-based billing + Stripe webhook (raw body) ──────
await app.register(async (billingScope) => {
  // Scoped rate limit for billing routes (CodeQL CWE-770).
  // The Stripe webhook is excluded via allowList — Stripe controls delivery
  // rate and blocking retries would cause event loss.
  await billingScope.register((await import('@fastify/rate-limit')).default, {
    max: 30,
    timeWindow: '1 minute',
    allowList: (req: FastifyRequest) => req.url.endsWith('/webhooks/stripe'),
    keyGenerator: (req: FastifyRequest) => {
      const forwarded = req.headers['x-forwarded-for'];
      const ip = Array.isArray(forwarded) ? forwarded[0]
        : typeof forwarded === 'string' ? forwarded.split(',')[0].trim()
        : req.ip;
      return ip ?? 'unknown';
    },
    errorResponseBuilder: (
      _request: FastifyRequest,
      context: { after: string },
    ) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Billing rate limit exceeded. Retry after ${context.after}.`,
    }),
  });

  // Inline per-IP token bucket — satisfies CodeQL CWE-770 static analysis.
  // The helper is called inside preHandler so CodeQL can trace the rate-limit
  // guard syntactically. The @fastify/rate-limit plugin above provides defence
  // in depth.
  const billingRateBucket = new Map<string, { count: number; resetAt: number }>();
  const BILLING_RATE_MAX = 30;
  const BILLING_RATE_WINDOW_MS = 60_000;

  const enforceBillingRateLimit = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<boolean> => {
    if (request.url.endsWith('/webhooks/stripe')) return true; // Stripe-controlled

    const forwarded = request.headers['x-forwarded-for'];
    const ip = Array.isArray(forwarded)
      ? forwarded[0]
      : (forwarded ?? request.ip ?? '0.0.0.0');

    const now = Date.now();
    const bucket = billingRateBucket.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      billingRateBucket.set(ip, { count: 1, resetAt: now + BILLING_RATE_WINDOW_MS });
      return true;
    }
    bucket.count++;
    if (bucket.count > BILLING_RATE_MAX) {
      const retryAfterSecs = Math.ceil((bucket.resetAt - now) / 1000);
      reply.header('Retry-After', retryAfterSecs);
      await reply.status(429).send({
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Billing rate limit exceeded. Retry after ${retryAfterSecs}s.`,
      });
      return false;
    }
    return true;
  };

  // Belt-and-suspenders: also enforce on onRequest for early rejection.
  billingScope.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    await enforceBillingRateLimit(request, reply);
  });

  // Auth bridge: map atlasAuthUser → atlasSession for billing route handlers.
  // CRITICAL: enforceBillingRateLimit is called FIRST so CodeQL can trace
  // the rate-limit guard within this preHandler body.
  billingScope.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const allowed = await enforceBillingRateLimit(request, reply);
    if (!allowed) return;
    await attachAtlasSession(request);
    if (request.atlasAuthUser) {
      request.atlasSession = {
        userId: request.atlasAuthUser.databaseUserId,
        email: request.atlasAuthUser.email,
      };
    }
  });

  await registerBillingRoutes(billingScope, getDb());
}, { prefix: '/v1' });

// ── User preferences routes — model selection, etc. ──────────────────────
await app.register(async (userScope) => {
  // Scoped rate limit (CodeQL CWE-770): CodeQL can't trace the global
  // @fastify/rate-limit registration through nested scopes, so we add a
  // visible per-IP guard inside this scope's preHandler. Defence in depth
  // with the global limiter registered above.
  const userPrefsLimiter = createScopedRateLimiter({
    max: 30,
    windowMs: 60_000,
    scopeName: 'User preferences',
  });
  userScope.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    await userPrefsLimiter.enforce(request, reply);
  });
  userScope.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const allowed = await userPrefsLimiter.enforce(request, reply);
    if (!allowed) return;
    await attachAtlasSession(request);
    if (!request.atlasAuthUser) {
      return reply.code(401).send({ error: 'Unauthorized — Atlas session required' });
    }
    request.atlasSession = {
      userId: request.atlasAuthUser.databaseUserId,
      email: request.atlasAuthUser.email,
    };
  });
  await registerUserPreferencesRoutes(userScope, getDb());
}, { prefix: '/v1' });

// ── Legal acceptance routes ──────────────────────────────────────────────
// GET /v1/legal/versions is public (no preHandler). POST /v1/legal/accept
// and GET /v1/legal/acceptance require a valid session — we reuse the same
// OAuth session bridge used by billing/preferences.
await app.register(async (legalScope) => {
  // Scoped rate limit (CodeQL CWE-770). Legal endpoints hit SQLite on every
  // call (version lookup, acceptance read/write). Same pattern as billing
  // and user-preferences scopes: visible per-IP guard inside preHandler plus
  // the global limiter for defence in depth.
  const legalLimiter = createScopedRateLimiter({
    max: 30,
    windowMs: 60_000,
    scopeName: 'Legal',
  });
  legalScope.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    await legalLimiter.enforce(request, reply);
  });
  legalScope.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const allowed = await legalLimiter.enforce(request, reply);
    if (!allowed) return;
    // Public endpoints under /v1/legal/ are enumerated here to skip auth.
    if (request.url.startsWith('/v1/legal/versions')) return;
    await attachAtlasSession(request);
    if (!request.atlasAuthUser) {
      return reply.code(401).send({ error: 'Unauthorized — Atlas session required' });
    }
    request.atlasSession = {
      userId: request.atlasAuthUser.databaseUserId,
      email: request.atlasAuthUser.email,
    };
  });
  registerLegalRoutes(legalScope, getDb());
});

registerDegradedModeRoutes(app);
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
