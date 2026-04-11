/**
 * Atlas Phase 3 — Security Routes & Middleware
 *
 * Exposes sovereign-guarded admin endpoints under /api/security/
 * and registers the securityMiddleware Fastify plugin that:
 *   - Mounts SecurityHardeningLayer as fastify.security
 *   - CSRF / origin validation on every non-GET request
 *   - Role-aware rate limiting on every request
 *   - Error hook that scrubs secrets from responses
 *   - onSend hook that removes X-Powered-By and injects security headers
 */

import { createHmac, randomBytes } from 'node:crypto';
import { SecurityHardeningLayer, SecurityEventType, UserRole, SovereignAuditEntry } from './securityHardening';
import { SecretManager, getSecretManager } from './secretManager';

// ---------------------------------------------------------------------------
// Fastify type stubs — replace with actual fastify imports in your project
// ---------------------------------------------------------------------------
// import {
//   FastifyInstance, FastifyRequest, FastifyReply,
//   FastifyPluginCallback, FastifyPluginOptions
// } from 'fastify';

interface FastifyRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  url: string;
  ip: string;
  query: Record<string, string | undefined>;
  params: Record<string, string | undefined>;
  body: unknown;
  user?: {
    id: string;
    role: UserRole;
    email?: string;
    sessionId?: string;
  };
}

interface FastifyReply {
  status(code: number): FastifyReply;
  send(payload: unknown): FastifyReply;
  header(name: string, value: string): FastifyReply;
  removeHeader(name: string): FastifyReply;
}

interface FastifyInstance {
  get(
    path: string,
    opts: { preHandler?: HandlerFn[] },
    handler: HandlerFn
  ): void;
  post(
    path: string,
    opts: { preHandler?: HandlerFn[] },
    handler: HandlerFn
  ): void;
  // Typed overloads for hooks used in this file
  addHook(
    event: 'onRequest',
    handler: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  ): void;
  addHook(
    event: 'onError',
    handler: (req: FastifyRequest, reply: FastifyReply, error: unknown) => Promise<void>
  ): void;
  addHook(
    event: 'onSend',
    handler: (req: FastifyRequest, reply: FastifyReply, payload: unknown) => Promise<unknown>
  ): void;
  addHook(
    event: string,
    handler: (...args: unknown[]) => Promise<void> | void
  ): void;
  decorate(name: string, value: unknown): void;
  register(plugin: FastifyPlugin, opts?: Record<string, unknown>): void;
  // Injected via decorators
  security?: SecurityHardeningLayer;
  secrets?: SecretManager;
}

type HandlerFn = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
type FastifyPlugin = (fastify: FastifyInstance, opts: Record<string, unknown>, done: () => void) => void;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHeader(req: FastifyRequest, name: string): string {
  const val = req.headers[name.toLowerCase()];
  if (Array.isArray(val)) return val[0] ?? '';
  return val ?? '';
}

function parsePaginationQuery(query: Record<string, string | undefined>): {
  limit: number;
  offset: number;
} {
  const limit = Math.min(500, Math.max(1, parseInt(query.limit ?? '50', 10) || 50));
  const offset = Math.max(0, parseInt(query.offset ?? '0', 10) || 0);
  return { limit, offset };
}

// Sovereign HMAC token store — holds current and previous (for rotation window)
interface HmacTokenState {
  current: string;
  previous: string | null;
  rotatedAt: number;
}

let sovereignHmacState: HmacTokenState | null = null;

function getSovereignHmacState(hmacSecret: string): HmacTokenState {
  if (!sovereignHmacState) {
    const token = generateSovereignToken(hmacSecret);
    sovereignHmacState = { current: token, previous: null, rotatedAt: Date.now() };
  }
  return sovereignHmacState;
}

function generateSovereignToken(hmacSecret: string): string {
  const nonce = randomBytes(16).toString('hex');
  const timestamp = Date.now().toString();
  return createHmac('sha256', hmacSecret)
    .update(`${nonce}:${timestamp}`)
    .digest('hex');
}

function validateSovereignToken(token: string, hmacSecret: string): boolean {
  const state = getSovereignHmacState(hmacSecret);
  if (token === state.current) return true;
  if (state.previous && token === state.previous) {
    // Accept previous token within 5-minute rotation grace window
    const gracePeriod = 5 * 60 * 1000;
    return Date.now() - state.rotatedAt < gracePeriod;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Security headers applied to every response
// ---------------------------------------------------------------------------

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",   // allow WASM for potential editor features
    "style-src 'self' 'unsafe-inline'",        // inline styles needed for Atlas SPA theming
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' wss:",                 // WebSocket for live Atlas events
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; '),
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'X-DNS-Prefetch-Control': 'off',
};

// ---------------------------------------------------------------------------
// securityMiddleware Fastify plugin
// ---------------------------------------------------------------------------

/**
 * Core middleware plugin.
 * Register this before any route plugins:
 *
 *   fastify.register(securityMiddleware, {
 *     allowedOrigins: ['https://atlas.yourdomain.com'],
 *   });
 */
export const securityMiddleware: FastifyPlugin = (
  fastify: FastifyInstance,
  opts: Record<string, unknown>,
  done: () => void
): void => {
  const allowedOrigins = (opts.allowedOrigins as string[]) ?? [];
  const secrets = getSecretManager();
  const security = new SecurityHardeningLayer(allowedOrigins);

  // Wire sovereign notification to log the event
  security.onSovereignNotification = (event) => {
    const supabaseUrl = secrets.has('SUPABASE_URL') ? secrets.get('SUPABASE_URL') : '';
    const supabaseKey = secrets.has('SUPABASE_SERVICE_KEY') ? secrets.get('SUPABASE_SERVICE_KEY') : '';
    security
      .logSecurityEvent(event, supabaseUrl, supabaseKey)
      .catch((e: Error) =>
        console.error('[securityMiddleware] Notification log error:', e.message)
      );
  };

  // Decorate fastify instance
  fastify.decorate('security', security);
  fastify.decorate('secrets', secrets);

  // -------------------------------------------------------------------------
  // onRequest — CSRF / origin validation on all non-GET requests
  // -------------------------------------------------------------------------
  fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;

    const originResult = security.validateOrigin(req);
    if (!originResult.valid) {
      const eventType: SecurityEventType = req.url.startsWith('/api/')
        ? getHeader(req, 'origin') !== ''
          ? 'origin.violation'
          : 'csrf.violation'
        : 'csrf.violation';

      const supabaseUrl = secrets.has('SUPABASE_URL') ? secrets.get('SUPABASE_URL') : '';
      const supabaseKey = secrets.has('SUPABASE_SERVICE_KEY') ? secrets.get('SUPABASE_SERVICE_KEY') : '';

      await security.logSecurityEvent(
        {
          type: eventType,
          actorId: req.user?.id ?? 'anonymous',
          actorIp: req.ip,
          action: `${req.method} ${req.url}`,
          resource: req.url,
          result: 'blocked',
          riskScore: 0.7,
          details: { reason: originResult.reason },
        },
        supabaseUrl,
        supabaseKey
      );

      reply.status(403).send({
        error: 'Forbidden',
        message: originResult.reason ?? 'CSRF or origin validation failed',
      });
    }
  });

  // -------------------------------------------------------------------------
  // onRequest — rate limiting per role (all requests)
  // -------------------------------------------------------------------------
  fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const role: UserRole = req.user?.role ?? 'anonymous';
    const identifier = req.user?.id ?? req.ip;

    // enforceRole will internally run rate-limit check
    const check = security.enforceRole(req, 'anonymous', '__rate_check__');

    // We only care about rate-limit blocks here; role denials are route-specific
    if (!check.allowed && check.reason?.includes('Rate limit')) {
      const supabaseUrl = secrets.has('SUPABASE_URL') ? secrets.get('SUPABASE_URL') : '';
      const supabaseKey = secrets.has('SUPABASE_SERVICE_KEY') ? secrets.get('SUPABASE_SERVICE_KEY') : '';

      await security.logSecurityEvent(
        {
          type: 'rate_limit.hit',
          actorId: identifier,
          actorIp: req.ip,
          action: `${req.method} ${req.url}`,
          resource: req.url,
          result: 'blocked',
          riskScore: 0.3,
          details: { role, reason: check.reason },
        },
        supabaseUrl,
        supabaseKey
      );

      reply.status(429).send({
        error: 'Too Many Requests',
        message: check.reason,
      });
    }
  });

  // -------------------------------------------------------------------------
  // onError — scrub secrets from error responses before they leave the server
  // -------------------------------------------------------------------------
  fastify.addHook(
    'onError',
    async (_req: FastifyRequest, reply: FastifyReply, error: unknown) => {
      const err = error as Error;
      const { leaked, leakedKeys } = secrets.scanForLeaks(err.message ?? '');

      if (leaked) {
        console.error(
          `[securityMiddleware] Secret leak detected in error message. Keys: ${leakedKeys.join(', ')}`
        );
        const scrubbed = secrets.scrubLeaks(err.message ?? '');
        reply.status(500).send({ error: 'Internal Server Error', message: scrubbed });
      }
    }
  );

  // -------------------------------------------------------------------------
  // onSend — remove X-Powered-By, inject security headers, scrub leaks
  // -------------------------------------------------------------------------
  fastify.addHook(
    'onSend',
    async (
      _req: FastifyRequest,
      reply: FastifyReply,
      payload: unknown
    ): Promise<unknown> => {
      // Remove server fingerprint header
      reply.removeHeader('X-Powered-By');
      reply.removeHeader('Server');

      // Apply security headers
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        reply.header(name, value);
      }

      // Scrub any leaked secrets from string payloads
      if (typeof payload === 'string') {
        const { leaked } = secrets.scanForLeaks(payload);
        if (leaked) return secrets.scrubLeaks(payload);
      }

      return payload;
    }
  );

  done();
};

// ---------------------------------------------------------------------------
// Sovereign guard preHandler factory
// ---------------------------------------------------------------------------

/**
 * Build a preHandler array that enforces sovereign role + action on a route,
 * and additionally validates the X-Sovereign-Token HMAC header.
 */
function sovereignGuard(
  security: SecurityHardeningLayer,
  secrets: SecretManager,
  action: string
): HandlerFn[] {
  const roleCheck = security.createRoleGuard('sovereign', action);

  const hmacCheck: HandlerFn = async (req, reply) => {
    const token = getHeader(req, 'x-sovereign-token');
    const hmacSecret = secrets.has('SOVEREIGN_HMAC_SECRET')
      ? secrets.get('SOVEREIGN_HMAC_SECRET')
      : '';

    if (!token || !validateSovereignToken(token, hmacSecret)) {
      const supabaseUrl = secrets.has('SUPABASE_URL') ? secrets.get('SUPABASE_URL') : '';
      const supabaseKey = secrets.has('SUPABASE_SERVICE_KEY') ? secrets.get('SUPABASE_SERVICE_KEY') : '';

      await security.logSecurityEvent(
        {
          type: 'auth.anomaly',
          actorId: req.user?.id ?? 'anonymous',
          actorIp: req.ip,
          action,
          resource: req.url,
          result: 'blocked',
          riskScore: 0.9,
          details: { reason: 'Invalid or missing X-Sovereign-Token' },
        },
        supabaseUrl,
        supabaseKey
      );

      reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid sovereign token',
      });
    }
  };

  return [hmacCheck, roleCheck];
}

// ---------------------------------------------------------------------------
// Security admin routes plugin
// ---------------------------------------------------------------------------

/**
 * Register all /api/security/* admin routes.
 * Must be registered AFTER securityMiddleware so that fastify.security
 * and fastify.secrets decorators exist.
 *
 * Usage:
 *   fastify.register(securityRoutes, { prefix: '/api/security' });
 */
export const securityRoutes: FastifyPlugin = (
  fastify: FastifyInstance,
  _opts: Record<string, unknown>,
  done: () => void
): void => {
  // These are guaranteed by securityMiddleware being registered first
  const security = fastify.security!;
  const secrets = fastify.secrets!;

  // Helper: build preHandler for every sovereign route
  const guard = (action: string): HandlerFn[] =>
    sovereignGuard(security, secrets, action);

  // ---------------------------------------------------------------------------
  // GET /api/security/events
  // Recent security events — paginated, filterable by type and result
  // ---------------------------------------------------------------------------
  fastify.get(
    '/events',
    { preHandler: guard('sovereign.security.events.read') },
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const { limit, offset } = parsePaginationQuery(req.query);
      const filterType = req.query.type as SecurityEventType | undefined;
      const filterResult = req.query.result as 'allowed' | 'blocked' | 'flagged' | undefined;

      const { events, total } = security.getRecentEvents(limit, offset, filterType, filterResult);

      reply.status(200).send({
        data: events,
        pagination: { limit, offset, total },
      });
    }
  );

  // ---------------------------------------------------------------------------
  // GET /api/security/risk/:identifier
  // Current risk score for a userId or IP address
  // ---------------------------------------------------------------------------
  fastify.get(
    '/risk/:identifier',
    { preHandler: guard('sovereign.security.risk.read') },
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const identifier = req.params.identifier;
      if (!identifier) {
        reply.status(400).send({ error: 'Bad Request', message: 'identifier is required' });
        return;
      }

      const riskScore = security.getRiskScore(identifier);

      reply.status(200).send({
        identifier,
        riskScore,
        level: riskScore >= 0.8 ? 'critical' : riskScore >= 0.5 ? 'high' : riskScore >= 0.2 ? 'medium' : 'low',
      });
    }
  );

  // ---------------------------------------------------------------------------
  // POST /api/security/unblock/:identifier
  // Manually unblock a brute-forced IP or userId
  // ---------------------------------------------------------------------------
  fastify.post(
    '/unblock/:identifier',
    { preHandler: guard('sovereign.security.unblock') },
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const identifier = req.params.identifier;
      if (!identifier) {
        reply.status(400).send({ error: 'Bad Request', message: 'identifier is required' });
        return;
      }

      const cleared = security.clearBlock(identifier);

      const supabaseUrl = secrets.has('SUPABASE_URL') ? secrets.get('SUPABASE_URL') : '';
      const supabaseKey = secrets.has('SUPABASE_SERVICE_KEY') ? secrets.get('SUPABASE_SERVICE_KEY') : '';

      await security.logSecurityEvent(
        {
          type: 'sovereign.action',
          actorId: req.user?.id ?? 'sovereign',
          actorIp: req.ip,
          action: 'security.unblock',
          resource: identifier,
          result: 'allowed',
          riskScore: 0,
          details: { cleared, unblocked: identifier },
        },
        supabaseUrl,
        supabaseKey
      );

      reply.status(200).send({
        success: cleared,
        message: cleared
          ? `Block cleared for '${identifier}'`
          : `No block found for '${identifier}'`,
      });
    }
  );

  // ---------------------------------------------------------------------------
  // GET /api/security/audit/verify
  // Run audit chain integrity check
  // ---------------------------------------------------------------------------
  fastify.get(
    '/audit/verify',
    { preHandler: guard('sovereign.audit.verify') },
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      // Fetch recent audit entries from Supabase
      const supabaseUrl = secrets.has('SUPABASE_URL') ? secrets.get('SUPABASE_URL') : '';
      const supabaseKey = secrets.has('SUPABASE_SERVICE_KEY') ? secrets.get('SUPABASE_SERVICE_KEY') : '';

      let entries: SovereignAuditEntry[] = [];

      if (supabaseUrl && supabaseKey) {
        try {
          const response = await fetch(
            `${supabaseUrl}/rest/v1/sovereign_audit_log?select=*&order=timestamp.asc&limit=10000`,
            {
              headers: {
                apikey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`,
                Accept: 'application/json',
              },
            }
          );
          if (response.ok) {
            entries = (await response.json()) as SovereignAuditEntry[];
          }
        } catch (err) {
          console.error('[securityRoutes] Failed to fetch audit entries:', (err as Error).message);
        }
      }

      const result = security.verifyAuditIntegrity(entries);

      if (!result.intact) {
        await security.logSecurityEvent(
          {
            type: 'audit.tamper_attempt',
            actorId: req.user?.id ?? 'sovereign',
            actorIp: req.ip,
            action: 'audit.verify',
            resource: 'sovereign_audit_log',
            result: 'flagged',
            riskScore: 1.0,
            details: { firstCorruptedEntry: result.firstCorruptedEntry },
          },
          supabaseUrl,
          supabaseKey
        );
      }

      reply.status(200).send({
        intact: result.intact,
        entriesChecked: entries.length,
        firstCorruptedEntry: result.firstCorruptedEntry ?? null,
        checkedAt: new Date().toISOString(),
      });
    }
  );

  // ---------------------------------------------------------------------------
  // GET /api/security/export-log
  // All export requests in the last 30 days
  // ---------------------------------------------------------------------------
  fastify.get(
    '/export-log',
    { preHandler: guard('sovereign.security.export_log.read') },
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const log = security.getExportLog(thirtyDaysAgo);

      reply.status(200).send({
        data: log,
        count: log.length,
        since: new Date(thirtyDaysAgo).toISOString(),
      });
    }
  );

  // ---------------------------------------------------------------------------
  // POST /api/security/rotate-token
  // Rotate the sovereign HMAC token
  // ---------------------------------------------------------------------------
  fastify.post(
    '/rotate-token',
    { preHandler: guard('sovereign.security.token.rotate') },
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const hmacSecret = secrets.has('SOVEREIGN_HMAC_SECRET')
        ? secrets.get('SOVEREIGN_HMAC_SECRET')
        : '';

      if (!hmacSecret) {
        reply.status(500).send({
          error: 'Configuration Error',
          message: 'SOVEREIGN_HMAC_SECRET is not configured',
        });
        return;
      }

      const newToken = generateSovereignToken(hmacSecret);
      const previousToken = sovereignHmacState?.current ?? null;

      sovereignHmacState = {
        current: newToken,
        previous: previousToken,
        rotatedAt: Date.now(),
      };

      const supabaseUrl = secrets.has('SUPABASE_URL') ? secrets.get('SUPABASE_URL') : '';
      const supabaseKey = secrets.has('SUPABASE_SERVICE_KEY') ? secrets.get('SUPABASE_SERVICE_KEY') : '';

      await security.logSecurityEvent(
        {
          type: 'sovereign.action',
          actorId: req.user?.id ?? 'sovereign',
          actorIp: req.ip,
          action: 'security.rotate_token',
          resource: 'sovereign_hmac_token',
          result: 'allowed',
          riskScore: 0,
          details: {
            rotatedAt: new Date().toISOString(),
            previousTokenPresent: previousToken !== null,
            gracePeriodMinutes: 5,
          },
        },
        supabaseUrl,
        supabaseKey
      );

      reply.status(200).send({
        success: true,
        token: newToken,
        rotatedAt: new Date().toISOString(),
        gracePeriodMinutes: 5,
        message: 'Previous token remains valid for 5 minutes after rotation.',
      });
    }
  );

  // ---------------------------------------------------------------------------
  // GET /api/security/anomalies
  // Users and IPs with elevated risk scores
  // ---------------------------------------------------------------------------
  fastify.get(
    '/anomalies',
    { preHandler: guard('sovereign.security.anomalies.read') },
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const thresholdParam = req.query.threshold;
      const threshold = thresholdParam ? parseFloat(thresholdParam) : 0.4;

      if (isNaN(threshold) || threshold < 0 || threshold > 1) {
        reply.status(400).send({
          error: 'Bad Request',
          message: 'threshold must be a number between 0 and 1',
        });
        return;
      }

      const anomalies = security.getAnomalousUsers(threshold);

      reply.status(200).send({
        data: anomalies.map((a) => ({
          ...a,
          level:
            a.riskScore >= 0.8
              ? 'critical'
              : a.riskScore >= 0.5
              ? 'high'
              : 'medium',
        })),
        count: anomalies.length,
        threshold,
      });
    }
  );

  done();
};

// ---------------------------------------------------------------------------
// Convenience: register both plugins together
// ---------------------------------------------------------------------------

/**
 * Register security middleware + all admin routes in one call.
 *
 * Usage:
 *   import { registerSecurity } from './securityRoutes';
 *   registerSecurity(fastify, {
 *     allowedOrigins: ['https://atlas.yourdomain.com'],
 *     prefix: '/api/security',
 *   });
 */
export function registerSecurity(
  fastify: FastifyInstance,
  opts: {
    allowedOrigins: string[];
    prefix?: string;
  }
): void {
  // 1. Register middleware (decorates fastify.security and fastify.secrets)
  fastify.register(securityMiddleware, { allowedOrigins: opts.allowedOrigins });

  // 2. Register admin routes under /api/security/
  fastify.register(securityRoutes, { prefix: opts.prefix ?? '/api/security' });
}
