/**
 * sovereignSecurity.ts
 *
 * Hardens the Sovereign Console with real backend authorization, audit logging,
 * session management, rate limiting, and per-action permission policies.
 *
 * Destination: atlas-backend/src/sovereign/sovereignSecurity.ts
 */

import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SovereignAction =
  | 'prompt.read'
  | 'prompt.edit'
  | 'prompt.publish'
  | 'prompt.rollback'
  | 'flag.read'
  | 'flag.toggle'
  | 'flag.create'
  | 'flag.delete'
  | 'users.read'
  | 'users.evolution.read'
  | 'users.evolution.reset'
  | 'bugs.read'
  | 'bugs.update'
  | 'deploy.trigger'
  | 'release.publish'
  | 'logs.stream'
  | 'evolution.rebuild'
  | 'evolution.quarantine_override';

export interface SovereignAuditEntry {
  id: string;
  timestamp: number;
  action: SovereignAction;
  actorEmail: string;
  actorIp: string;
  targetUserId?: string;
  payload: Record<string, unknown>; // sanitized — no secrets
  result: 'success' | 'denied' | 'error';
  durationMs: number;
  sessionId: string;
}

export interface SovereignSession {
  sessionId: string;
  email: string;
  createdAt: number;
  lastActivityAt: number;
  ipAddress: string;
  userAgent: string;
  actionsPerformed: SovereignAction[];
  expiresAt: number; // 4-hour TTL
}

export interface SovereignPermissionPolicy {
  action: SovereignAction;
  requiresEmailMatch: boolean;    // must match SOVEREIGN_EMAIL env var
  requiresRecentAuth: boolean;    // must have authenticated within last 30 mins
  requiresConfirmation: boolean;  // destructive — requires a confirm step
  auditLevel: 'standard' | 'detailed' | 'critical';
  rateLimit: number;              // max calls per hour (0 = unlimited)
}

// ---------------------------------------------------------------------------
// Permission Policy Map
// ---------------------------------------------------------------------------

const SESSION_TTL_MS = 4 * 60 * 60 * 1000;          // 4 hours
const RECENT_AUTH_WINDOW_MS = 30 * 60 * 1000;        // 30 minutes
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;         // 1 hour

const PERMISSION_POLICIES: Map<SovereignAction, SovereignPermissionPolicy> = new Map([
  // --- Prompt actions ---
  ['prompt.read', {
    action: 'prompt.read',
    requiresEmailMatch: true,
    requiresRecentAuth: false,
    requiresConfirmation: false,
    auditLevel: 'standard',
    rateLimit: 0,
  }],
  ['prompt.edit', {
    action: 'prompt.edit',
    requiresEmailMatch: true,
    requiresRecentAuth: true,
    requiresConfirmation: false,
    auditLevel: 'critical',
    rateLimit: 20,
  }],
  ['prompt.publish', {
    action: 'prompt.publish',
    requiresEmailMatch: true,
    requiresRecentAuth: true,
    requiresConfirmation: true,
    auditLevel: 'critical',
    rateLimit: 5,
  }],
  ['prompt.rollback', {
    action: 'prompt.rollback',
    requiresEmailMatch: true,
    requiresRecentAuth: true,
    requiresConfirmation: true,
    auditLevel: 'critical',
    rateLimit: 5,
  }],

  // --- Feature flag actions ---
  ['flag.read', {
    action: 'flag.read',
    requiresEmailMatch: true,
    requiresRecentAuth: false,
    requiresConfirmation: false,
    auditLevel: 'standard',
    rateLimit: 0,
  }],
  ['flag.toggle', {
    action: 'flag.toggle',
    requiresEmailMatch: true,
    requiresRecentAuth: false,
    requiresConfirmation: false,
    auditLevel: 'detailed',
    rateLimit: 50,
  }],
  ['flag.create', {
    action: 'flag.create',
    requiresEmailMatch: true,
    requiresRecentAuth: false,
    requiresConfirmation: false,
    auditLevel: 'detailed',
    rateLimit: 20,
  }],
  ['flag.delete', {
    action: 'flag.delete',
    requiresEmailMatch: true,
    requiresRecentAuth: true,
    requiresConfirmation: true,
    auditLevel: 'critical',
    rateLimit: 10,
  }],

  // --- User / evolution actions ---
  ['users.read', {
    action: 'users.read',
    requiresEmailMatch: true,
    requiresRecentAuth: false,
    requiresConfirmation: false,
    auditLevel: 'standard',
    rateLimit: 0,
  }],
  ['users.evolution.read', {
    action: 'users.evolution.read',
    requiresEmailMatch: true,
    requiresRecentAuth: false,
    requiresConfirmation: false,
    auditLevel: 'standard',
    rateLimit: 0,
  }],
  ['users.evolution.reset', {
    action: 'users.evolution.reset',
    requiresEmailMatch: true,
    requiresRecentAuth: true,
    requiresConfirmation: true,
    auditLevel: 'critical',
    rateLimit: 10,
  }],

  // --- Bug tracking ---
  ['bugs.read', {
    action: 'bugs.read',
    requiresEmailMatch: true,
    requiresRecentAuth: false,
    requiresConfirmation: false,
    auditLevel: 'standard',
    rateLimit: 0,
  }],
  ['bugs.update', {
    action: 'bugs.update',
    requiresEmailMatch: true,
    requiresRecentAuth: false,
    requiresConfirmation: false,
    auditLevel: 'detailed',
    rateLimit: 50,
  }],

  // --- Deployment / release ---
  ['deploy.trigger', {
    action: 'deploy.trigger',
    requiresEmailMatch: true,
    requiresRecentAuth: true,
    requiresConfirmation: true,
    auditLevel: 'critical',
    rateLimit: 2,
  }],
  ['release.publish', {
    action: 'release.publish',
    requiresEmailMatch: true,
    requiresRecentAuth: true,
    requiresConfirmation: true,
    auditLevel: 'critical',
    rateLimit: 2,
  }],

  // --- Observability ---
  ['logs.stream', {
    action: 'logs.stream',
    requiresEmailMatch: true,
    requiresRecentAuth: false,
    requiresConfirmation: false,
    auditLevel: 'standard',
    rateLimit: 0,
  }],

  // --- Evolution system ---
  ['evolution.rebuild', {
    action: 'evolution.rebuild',
    requiresEmailMatch: true,
    requiresRecentAuth: true,
    requiresConfirmation: true,
    auditLevel: 'critical',
    rateLimit: 5,
  }],
  ['evolution.quarantine_override', {
    action: 'evolution.quarantine_override',
    requiresEmailMatch: true,
    requiresRecentAuth: true,
    requiresConfirmation: true,
    auditLevel: 'critical',
    rateLimit: 5,
  }],
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const REDACTED_KEYS = new Set([
    'password', 'secret', 'token', 'apiKey', 'api_key',
    'authorization', 'jwt', 'cookie', 'sessionToken',
  ]);
  return Object.fromEntries(
    Object.entries(payload).map(([k, v]) =>
      REDACTED_KEYS.has(k.toLowerCase()) ? [k, '[REDACTED]'] : [k, v]
    )
  );
}

function getIpFromRequest(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return request.socket?.remoteAddress ?? 'unknown';
}

// ---------------------------------------------------------------------------
// SovereignSecurityLayer
// ---------------------------------------------------------------------------

export class SovereignSecurityLayer {
  private sessions: Map<string, SovereignSession> = new Map();
  private auditLog: SovereignAuditEntry[] = [];
  private rateLimitCounters: Map<string, { count: number; windowStart: number }> = new Map();
  private supabase: SupabaseClient;

  constructor(
    private sovereignEmail: string,
    private jwtSecret: string,
    private supabaseUrl: string,
    private supabaseKey: string
  ) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  // -------------------------------------------------------------------------
  // guardRoute — Fastify preHandler
  // -------------------------------------------------------------------------

  async guardRoute(
    request: FastifyRequest,
    reply: FastifyReply,
    requiredAction: SovereignAction
  ): Promise<void> {
    const start = Date.now();
    const ip = getIpFromRequest(request);
    const userAgent = request.headers['user-agent'] ?? 'unknown';

    // 1. Extract and verify JWT
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      await this.logAction(requiredAction, 'unknown', ip, {}, 'denied', Date.now() - start);
      reply.code(401).send({ error: 'Missing or malformed Authorization header.' });
      return;
    }

    let decoded: { email: string; sessionId: string; iat: number };
    try {
      decoded = jwt.verify(authHeader.slice(7), this.jwtSecret) as typeof decoded;
    } catch (err) {
      await this.logAction(requiredAction, 'unknown', ip, {}, 'denied', Date.now() - start);
      reply.code(401).send({ error: 'Invalid or expired JWT.' });
      return;
    }

    // 2. Email match
    if (decoded.email.toLowerCase() !== this.sovereignEmail.toLowerCase()) {
      await this.logAction(requiredAction, decoded.email, ip, {}, 'denied', Date.now() - start);
      reply.code(403).send({ error: 'Forbidden: email does not match sovereign account.' });
      return;
    }

    // 3. Session validation
    const { valid, session, reason } = this.validateSession(decoded.sessionId);
    if (!valid || !session) {
      await this.logAction(requiredAction, decoded.email, ip, {}, 'denied', Date.now() - start);
      reply.code(401).send({ error: `Session invalid: ${reason}` });
      return;
    }

    // 4. Policy checks
    const policy = this.getPolicy(requiredAction);

    if (policy.requiresRecentAuth) {
      const age = Date.now() - session.createdAt;
      if (age > RECENT_AUTH_WINDOW_MS) {
        await this.logAction(requiredAction, decoded.email, ip, {}, 'denied', Date.now() - start);
        reply.code(403).send({ error: 'Re-authentication required for this action (recent auth window expired).' });
        return;
      }
    }

    // 5. Rate limit check
    const { allowed, remaining } = this.checkRateLimit(decoded.email, requiredAction);
    if (!allowed) {
      await this.logAction(requiredAction, decoded.email, ip, {}, 'denied', Date.now() - start);
      reply.code(429).send({ error: `Rate limit exceeded for action '${requiredAction}'.`, remaining });
      return;
    }

    // 6. Confirmation check — the client must send { confirmed: true } in the body for destructive actions
    if (policy.requiresConfirmation) {
      const body = request.body as Record<string, unknown> | undefined;
      if (!body?.confirmed) {
        await this.logAction(requiredAction, decoded.email, ip, sanitizePayload(body ?? {}), 'denied', Date.now() - start);
        reply.code(400).send({ error: `Action '${requiredAction}' requires explicit confirmation ({ confirmed: true }).` });
        return;
      }
    }

    // 7. Attach session context to request for downstream handlers
    (request as FastifyRequest & { sovereignSession: SovereignSession }).sovereignSession = session;
    session.lastActivityAt = Date.now();
    session.actionsPerformed.push(requiredAction);
  }

  // -------------------------------------------------------------------------
  // Session management
  // -------------------------------------------------------------------------

  createSession(email: string, ipAddress: string, userAgent: string): SovereignSession {
    const now = Date.now();
    const session: SovereignSession = {
      sessionId: uuidv4(),
      email,
      createdAt: now,
      lastActivityAt: now,
      ipAddress,
      userAgent,
      actionsPerformed: [],
      expiresAt: now + SESSION_TTL_MS,
    };
    this.sessions.set(session.sessionId, session);

    // Persist to Supabase (fire-and-forget; errors non-fatal)
    this.supabase.from('atlas_sovereign_sessions').insert({
      session_id: session.sessionId,
      email: session.email,
      created_at: new Date(session.createdAt).toISOString(),
      expires_at: new Date(session.expiresAt).toISOString(),
      ip_address: session.ipAddress,
      user_agent: session.userAgent,
    }).then(({ error }) => {
      if (error) console.error('[SovereignSecurity] Failed to persist session:', error.message);
    });

    return session;
  }

  validateSession(sessionId: string): { valid: boolean; session?: SovereignSession; reason?: string } {
    const session = this.sessions.get(sessionId);
    if (!session) return { valid: false, reason: 'Session not found.' };
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return { valid: false, reason: 'Session expired.' };
    }
    // Refresh last activity
    session.lastActivityAt = Date.now();
    return { valid: true, session };
  }

  // -------------------------------------------------------------------------
  // Audit log
  // -------------------------------------------------------------------------

  async logAction(
    action: SovereignAction,
    actorEmail: string,
    actorIp: string,
    payload: Record<string, unknown>,
    result: 'success' | 'denied' | 'error',
    durationMs: number,
    targetUserId?: string
  ): Promise<void> {
    const entry: SovereignAuditEntry = {
      id: uuidv4(),
      timestamp: Date.now(),
      action,
      actorEmail,
      actorIp,
      targetUserId,
      payload: sanitizePayload(payload),
      result,
      durationMs,
      sessionId: '', // caller can enrich via request context if available
    };

    this.auditLog.push(entry);

    // Persist to Supabase
    const { error } = await this.supabase.from('atlas_sovereign_audit').insert({
      id: entry.id,
      timestamp: new Date(entry.timestamp).toISOString(),
      action: entry.action,
      actor_email: entry.actorEmail,
      actor_ip: entry.actorIp,
      target_user_id: entry.targetUserId ?? null,
      payload: entry.payload,
      result: entry.result,
      duration_ms: entry.durationMs,
      session_id: entry.sessionId,
    });

    if (error) {
      console.error('[SovereignSecurity] Audit log persistence error:', error.message);
    }
  }

  async getAuditLog(limit: number, offset: number): Promise<SovereignAuditEntry[]> {
    const { data, error } = await this.supabase
      .from('atlas_sovereign_audit')
      .select('*')
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[SovereignSecurity] Audit log fetch error:', error.message);
      // Fall back to in-memory log
      return this.auditLog
        .slice()
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(offset, offset + limit);
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      timestamp: new Date(row.timestamp).getTime(),
      action: row.action as SovereignAction,
      actorEmail: row.actor_email,
      actorIp: row.actor_ip,
      targetUserId: row.target_user_id ?? undefined,
      payload: row.payload ?? {},
      result: row.result as 'success' | 'denied' | 'error',
      durationMs: row.duration_ms,
      sessionId: row.session_id,
    }));
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private checkRateLimit(email: string, action: SovereignAction): { allowed: boolean; remaining: number } {
    const policy = this.getPolicy(action);
    if (policy.rateLimit === 0) return { allowed: true, remaining: Infinity };

    const key = `${action}:${email}`;
    const now = Date.now();
    const counter = this.rateLimitCounters.get(key);

    if (!counter || now - counter.windowStart > RATE_LIMIT_WINDOW_MS) {
      // New window
      this.rateLimitCounters.set(key, { count: 1, windowStart: now });
      return { allowed: true, remaining: policy.rateLimit - 1 };
    }

    if (counter.count >= policy.rateLimit) {
      return { allowed: false, remaining: 0 };
    }

    counter.count += 1;
    return { allowed: true, remaining: policy.rateLimit - counter.count };
  }

  private getPolicy(action: SovereignAction): SovereignPermissionPolicy {
    const policy = PERMISSION_POLICIES.get(action);
    if (!policy) {
      // Safe default: require everything for unknown actions
      return {
        action,
        requiresEmailMatch: true,
        requiresRecentAuth: true,
        requiresConfirmation: true,
        auditLevel: 'critical',
        rateLimit: 1,
      };
    }
    return policy;
  }
}

// ---------------------------------------------------------------------------
// Fastify Plugin
// ---------------------------------------------------------------------------

declare module 'fastify' {
  interface FastifyInstance {
    /** The singleton SovereignSecurityLayer instance. */
    sovereign: SovereignSecurityLayer;
    /**
     * Returns a Fastify preHandler that guards a route requiring the given
     * SovereignAction. Use as a route-level hook:
     *
     *   fastify.get('/api/sovereign/flags', {
     *     preHandler: fastify.guardSovereign('flag.read'),
     *   }, handler)
     */
    guardSovereign(action: SovereignAction): (req: FastifyRequest, rep: FastifyReply) => Promise<void>;
  }
}

export interface SovereignSecurityPluginOptions extends FastifyPluginOptions {
  sovereignEmail: string;
  jwtSecret: string;
  supabaseUrl: string;
  supabaseKey: string;
}

async function sovereignSecurityPluginImpl(
  fastify: FastifyInstance,
  options: SovereignSecurityPluginOptions
): Promise<void> {
  const layer = new SovereignSecurityLayer(
    options.sovereignEmail,
    options.jwtSecret,
    options.supabaseUrl,
    options.supabaseKey
  );

  // Register the layer on the Fastify instance
  fastify.decorate('sovereign', layer);

  // Convenience decorator for per-route guards
  fastify.decorate(
    'guardSovereign',
    (action: SovereignAction) =>
      async (req: FastifyRequest, rep: FastifyReply): Promise<void> => {
        await layer.guardRoute(req, rep, action);
      }
  );

  // Auto-guard all /api/sovereign/* routes via an onRoute hook
  fastify.addHook('onRoute', (routeOptions) => {
    if (!routeOptions.url.startsWith('/api/sovereign/')) return;

    // Determine the action from the route's custom schema or skip if already protected
    const routeAction = (routeOptions.config as Record<string, unknown>)?.sovereignAction as SovereignAction | undefined;
    if (!routeAction) return; // route must declare config.sovereignAction to get auto-guarded

    const existing = routeOptions.preHandler;
    const guard = async (req: FastifyRequest, rep: FastifyReply): Promise<void> => {
      await layer.guardRoute(req, rep, routeAction);
    };

    if (!existing) {
      routeOptions.preHandler = [guard];
    } else if (Array.isArray(existing)) {
      routeOptions.preHandler = [guard, ...existing];
    } else {
      routeOptions.preHandler = [guard, existing];
    }
  });
}

/**
 * Fastify plugin wrapping SovereignSecurityLayer.
 *
 * Registration example (atlas-backend/src/index.ts):
 *
 *   await fastify.register(sovereignSecurityPlugin, {
 *     sovereignEmail: process.env.SOVEREIGN_EMAIL!,
 *     jwtSecret:      process.env.SOVEREIGN_JWT_SECRET!,
 *     supabaseUrl:    process.env.SUPABASE_URL!,
 *     supabaseKey:    process.env.SUPABASE_SERVICE_ROLE_KEY!,
 *   });
 */
export const sovereignSecurityPlugin = fp(sovereignSecurityPluginImpl, {
  name: 'sovereignSecurity',
  fastify: '>=5.0.0',
});
