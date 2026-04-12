/**
 * Atlas Phase 3 — Security Hardening Layer
 *
 * Covers: server-side role enforcement, CSRF/origin validation,
 * brute-force detection, anomaly detection, export restrictions,
 * audit chain integrity, and security event logging.
 */

import { createHash, createHmac } from 'node:crypto';

// ---------------------------------------------------------------------------
// Fastify type stubs — replace with actual fastify imports in your project
// ---------------------------------------------------------------------------
// import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
interface FastifyRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  url: string;
  ip: string;
  // JWT payload decoded by @fastify/jwt
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
}
interface FastifyInstance {
  addHook(
    event: string,
    handler: (req: FastifyRequest, reply: FastifyReply, ...args: unknown[]) => Promise<void>
  ): void;
  decorate(name: string, value: unknown): void;
}

// ---------------------------------------------------------------------------
// SovereignAuditEntry — imported from Phase 2; redeclared here for portability
// ---------------------------------------------------------------------------
export interface SovereignAuditEntry {
  id: string;
  timestamp: number;
  actorId: string;
  action: string;
  resource: string;
  details: Record<string, unknown>;
  chainHash: string; // SHA-256(prevChainHash + serialised entry content)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserRole = 'sovereign' | 'authenticated' | 'anonymous';

export interface RolePolicy {
  role: UserRole;
  /** Action strings like 'chat', 'evolution.read', 'sovereign.*'. '*' = all. */
  allowedActions: string[];
  deniedActions: string[];
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  exportAllowed: boolean;
  /** 0 = no export; -1 = unlimited */
  exportMaxRecords: number;
  canAccessOtherUsers: boolean;
}

export interface SecurityEvent {
  id: string;
  timestamp: number;
  type: SecurityEventType;
  /** userId or 'anonymous' */
  actorId: string;
  actorIp: string;
  action: string;
  resource: string;
  result: 'allowed' | 'blocked' | 'flagged';
  /** 0–1 */
  riskScore: number;
  details: Record<string, unknown>;
}

export type SecurityEventType =
  | 'auth.success'
  | 'auth.failure'
  | 'auth.brute_force'
  | 'auth.anomaly'
  | 'csrf.violation'
  | 'origin.violation'
  | 'role.violation'
  | 'rate_limit.hit'
  | 'export.requested'
  | 'export.blocked'
  | 'sovereign.action'
  | 'audit.tamper_attempt';

export interface BruteForceState {
  /** IP address or userId */
  identifier: string;
  /** Timestamps (ms) of failed auth attempts */
  attempts: number[];
  blocked: boolean;
  blockedUntil?: number;
  riskScore: number;
}

export interface AnomalySignal {
  type: 'unusual_hour' | 'new_ip' | 'rapid_actions' | 'unusual_volume' | 'geography_jump';
  description: string;
  /** Amount added to cumulative risk score (0–1) */
  riskDelta: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function getHeader(req: FastifyRequest, name: string): string {
  const val = req.headers[name.toLowerCase()];
  if (Array.isArray(val)) return val[0] ?? '';
  return val ?? '';
}

/**
 * Match an action string against a policy pattern.
 * Supports exact match, wildcard suffix (e.g. 'sovereign.*'), or global '*'.
 */
function matchesPattern(action: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern === action) return true;
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return action === prefix || action.startsWith(`${prefix}.`);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

export class SecurityHardeningLayer {
  private rolePolicies: Map<UserRole, RolePolicy>;
  private bruteForceStates: Map<string, BruteForceState>;
  private securityEvents: SecurityEvent[];
  private allowedOrigins: Set<string>;

  // In-memory per-identifier request counts (minute + hour windows)
  private requestCounts: Map<
    string,
    { minuteWindow: number[]; hourWindow: number[] }
  >;

  // Sovereign notification callback (wired externally)
  public onSovereignNotification?: (event: SecurityEvent) => void;

  constructor(allowedOrigins: string[]) {
    this.allowedOrigins = new Set(allowedOrigins);
    this.rolePolicies = new Map();
    this.bruteForceStates = new Map();
    this.securityEvents = [];
    this.requestCounts = new Map();
    this.initializeRolePolicies();
  }

  // -------------------------------------------------------------------------
  // Role policies
  // -------------------------------------------------------------------------

  private initializeRolePolicies(): void {
    const sovereign: RolePolicy = {
      role: 'sovereign',
      allowedActions: ['*'],
      deniedActions: [],
      maxRequestsPerMinute: 120,
      maxRequestsPerHour: 2000,
      exportAllowed: true,
      exportMaxRecords: -1, // unlimited
      canAccessOtherUsers: true,
    };

    const authenticated: RolePolicy = {
      role: 'authenticated',
      allowedActions: [
        'chat',
        'evolution.read',
        'evolution.control',
        'crucible.*',
        'journal.*',
        'resonance.*',
        'goals.read',
        'goals.write',
        'bugs.submit',
        'export.own',
      ],
      deniedActions: [
        'users.read',
        'users.evolution.read',
        'deploy.*',
        'sovereign.*',
        'flags.*',
        'prompt.*',
      ],
      maxRequestsPerMinute: 30,
      maxRequestsPerHour: 500,
      exportAllowed: true,
      exportMaxRecords: 10_000,
      canAccessOtherUsers: false,
    };

    const anonymous: RolePolicy = {
      role: 'anonymous',
      allowedActions: ['chat.limited'],
      deniedActions: [],
      maxRequestsPerMinute: 5,
      maxRequestsPerHour: 20,
      exportAllowed: false,
      exportMaxRecords: 0,
      canAccessOtherUsers: false,
    };

    this.rolePolicies.set('sovereign', sovereign);
    this.rolePolicies.set('authenticated', authenticated);
    this.rolePolicies.set('anonymous', anonymous);
  }

  // -------------------------------------------------------------------------
  // CSRF / Origin validation
  // -------------------------------------------------------------------------

  /**
   * Validate CSRF and origin for every non-GET request.
   *
   * Rules:
   *   1. Origin header must be in the allowedOrigins whitelist (fallback: Referer).
   *   2. All API routes must include the `X-Atlas-Request: true` custom header.
   *   3. Sovereign routes additionally require `X-Sovereign-Token`.
   */
  validateOrigin(
    request: FastifyRequest
  ): { valid: boolean; reason?: string } {
    // GET requests are exempt from CSRF checks
    if (request.method === 'GET') return { valid: true };

    const origin = getHeader(request, 'origin');
    const referer = getHeader(request, 'referer');
    const atlasHeader = getHeader(request, 'x-atlas-request');
    const sovereignToken = getHeader(request, 'x-sovereign-token');
    const isSovereignRoute = request.url.startsWith('/api/sovereign') ||
      request.url.startsWith('/api/security');

    // --- 1. Origin / Referer check ---
    let originValid = false;

    if (origin) {
      // Strip trailing slash for comparison
      const normalised = origin.replace(/\/$/, '').toLowerCase();
      originValid = this.allowedOrigins.has(normalised);
    } else if (referer) {
      // Fall back to Referer host
      try {
        const refUrl = new URL(referer);
        const refOrigin = `${refUrl.protocol}//${refUrl.host}`.toLowerCase();
        originValid = this.allowedOrigins.has(refOrigin);
      } catch {
        originValid = false;
      }
    }

    if (!originValid) {
      return {
        valid: false,
        reason: `Origin '${origin || referer || 'none'}' is not in the allowed origins list`,
      };
    }

    // --- 2. X-Atlas-Request header required on all API routes ---
    if (request.url.startsWith('/api/') && atlasHeader.toLowerCase() !== 'true') {
      return {
        valid: false,
        reason: 'Missing required X-Atlas-Request: true header',
      };
    }

    // --- 3. Sovereign routes additionally require X-Sovereign-Token ---
    if (isSovereignRoute && !sovereignToken) {
      return {
        valid: false,
        reason: 'Sovereign route requires X-Sovereign-Token header',
      };
    }

    return { valid: true };
  }

  // -------------------------------------------------------------------------
  // Server-side role enforcement
  // -------------------------------------------------------------------------

  /**
   * Enforce that the JWT role claim is accurate and that the requested action
   * is permitted under the policy for that role.
   */
  enforceRole(
    request: FastifyRequest,
    requiredRole: UserRole,
    action: string
  ): { allowed: boolean; reason?: string } {
    const user = request.user;
    const actualRole: UserRole = user?.role ?? 'anonymous';

    // Hierarchy: sovereign > authenticated > anonymous
    const hierarchy: UserRole[] = ['anonymous', 'authenticated', 'sovereign'];
    const actualLevel = hierarchy.indexOf(actualRole);
    const requiredLevel = hierarchy.indexOf(requiredRole);

    if (actualLevel < requiredLevel) {
      return {
        allowed: false,
        reason: `Role '${actualRole}' does not meet required role '${requiredRole}'`,
      };
    }

    const policy = this.rolePolicies.get(actualRole);
    if (!policy) {
      return { allowed: false, reason: `No policy defined for role '${actualRole}'` };
    }

    // Check explicit denials first
    for (const denied of policy.deniedActions) {
      if (matchesPattern(action, denied)) {
        return {
          allowed: false,
          reason: `Action '${action}' is explicitly denied for role '${actualRole}'`,
        };
      }
    }

    // Check allowlist
    const actionAllowed = policy.allowedActions.some((pattern) =>
      matchesPattern(action, pattern)
    );

    if (!actionAllowed) {
      return {
        allowed: false,
        reason: `Action '${action}' is not in the allowed actions for role '${actualRole}'`,
      };
    }

    // Rate-limit check
    const identifier = user?.id ?? request.ip;
    const rateLimitResult = this.checkRateLimit(identifier, policy);
    if (!rateLimitResult.allowed) {
      return rateLimitResult;
    }

    return { allowed: true };
  }

  // -------------------------------------------------------------------------
  // Rate limiting (internal — called by enforceRole)
  // -------------------------------------------------------------------------

  private checkRateLimit(
    identifier: string,
    policy: RolePolicy
  ): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const oneMinuteAgo = now - 60_000;
    const oneHourAgo = now - 3_600_000;

    if (!this.requestCounts.has(identifier)) {
      this.requestCounts.set(identifier, { minuteWindow: [], hourWindow: [] });
    }

    const counts = this.requestCounts.get(identifier)!;

    // Purge stale entries
    counts.minuteWindow = counts.minuteWindow.filter((t) => t > oneMinuteAgo);
    counts.hourWindow = counts.hourWindow.filter((t) => t > oneHourAgo);

    if (counts.minuteWindow.length >= policy.maxRequestsPerMinute) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${policy.maxRequestsPerMinute} requests/minute for role '${policy.role}'`,
      };
    }

    if (counts.hourWindow.length >= policy.maxRequestsPerHour) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${policy.maxRequestsPerHour} requests/hour for role '${policy.role}'`,
      };
    }

    // Record this request
    counts.minuteWindow.push(now);
    counts.hourWindow.push(now);

    return { allowed: true };
  }

  // -------------------------------------------------------------------------
  // Brute-force detection
  // -------------------------------------------------------------------------

  /**
   * Track and evaluate failed/successful auth attempts for an identifier
   * (IP address or userId).
   *
   * Thresholds (sliding 15-minute window):
   *   ≥5  failures → soft block  5 min
   *   ≥10 failures → hard block 60 min
   *   ≥20 failures → permanent flag + sovereign notification
   *
   * Risk score = min(1.0, consecutiveFailures × 0.15 + recentFailures × 0.05)
   */
  checkBruteForce(
    identifier: string,
    success: boolean
  ): { blocked: boolean; blockedUntil?: number; riskScore: number } {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const windowStart = now - windowMs;

    if (!this.bruteForceStates.has(identifier)) {
      this.bruteForceStates.set(identifier, {
        identifier,
        attempts: [],
        blocked: false,
        riskScore: 0,
      });
    }

    const state = this.bruteForceStates.get(identifier)!;

    // Clear expired block
    if (state.blocked && state.blockedUntil && now > state.blockedUntil) {
      state.blocked = false;
      state.blockedUntil = undefined;
    }

    // If already blocked, return early
    if (state.blocked) {
      return {
        blocked: true,
        blockedUntil: state.blockedUntil,
        riskScore: state.riskScore,
      };
    }

    if (success) {
      // Successful auth clears recent attempts (but not permanent flags)
      state.attempts = [];
      state.riskScore = 0;
      return { blocked: false, riskScore: 0 };
    }

    // Record this failure
    state.attempts.push(now);

    // Purge attempts outside the 15-minute window
    state.attempts = state.attempts.filter((t) => t > windowStart);

    const recentFailures = state.attempts.length;

    // Count consecutive failures (all failures since last success = entire current list)
    const consecutiveFailures = recentFailures;

    // Risk score formula
    const riskScore = Math.min(
      1.0,
      consecutiveFailures * 0.15 + recentFailures * 0.05
    );
    state.riskScore = riskScore;

    // Threshold decisions
    if (recentFailures >= 20) {
      state.blocked = true;
      state.blockedUntil = undefined; // permanent until manually cleared
      state.riskScore = 1.0;

      // Fire sovereign notification
      const event: SecurityEvent = {
        id: generateId(),
        timestamp: now,
        type: 'auth.brute_force',
        actorId: identifier,
        actorIp: identifier,
        action: 'auth.attempt',
        resource: 'authentication',
        result: 'blocked',
        riskScore: 1.0,
        details: {
          recentFailures,
          threshold: 20,
          severity: 'permanent',
          message: `Permanent flag: ${recentFailures} failed auth attempts in 15 minutes`,
        },
      };
      this.securityEvents.push(event);
      this.onSovereignNotification?.(event);

      return { blocked: true, riskScore: 1.0 };
    }

    if (recentFailures >= 10) {
      const blockedUntil = now + 60 * 60 * 1000; // 60 minutes
      state.blocked = true;
      state.blockedUntil = blockedUntil;
      return { blocked: true, blockedUntil, riskScore };
    }

    if (recentFailures >= 5) {
      const blockedUntil = now + 5 * 60 * 1000; // 5 minutes
      state.blocked = true;
      state.blockedUntil = blockedUntil;
      return { blocked: true, blockedUntil, riskScore };
    }

    return { blocked: false, riskScore };
  }

  // -------------------------------------------------------------------------
  // Anomaly detection
  // -------------------------------------------------------------------------

  /**
   * Detect behavioural anomalies for a user's current request.
   *
   * Signals checked:
   *   - unusual_hour      : activity outside 06:00–23:00 local (UTC proxy)
   *   - new_ip            : IP not seen in recent history for this user
   *   - rapid_actions     : >15 actions in the last 60 seconds
   *   - unusual_volume    : >3× the user's average hourly request rate
   *   - geography_jump    : IP subnet differs from all IPs in last 10 events
   */
  detectAnomaly(
    userId: string,
    request: FastifyRequest,
    recentActivity: SecurityEvent[]
  ): AnomalySignal[] {
    const signals: AnomalySignal[] = [];
    const now = Date.now();
    const currentIp = request.ip;

    // Filter events belonging to this user
    const userEvents = recentActivity.filter((e) => e.actorId === userId);

    // --- unusual_hour ---
    const hour = new Date(now).getUTCHours();
    if (hour < 6 || hour >= 23) {
      signals.push({
        type: 'unusual_hour',
        description: `Activity at unusual UTC hour: ${hour}:00`,
        riskDelta: 0.1,
      });
    }

    // --- new_ip ---
    const knownIps = new Set(userEvents.map((e) => e.actorIp));
    if (knownIps.size > 0 && !knownIps.has(currentIp)) {
      signals.push({
        type: 'new_ip',
        description: `Request from previously unseen IP: ${currentIp}`,
        riskDelta: 0.2,
      });
    }

    // --- rapid_actions ---
    const last60s = userEvents.filter((e) => e.timestamp > now - 60_000);
    if (last60s.length > 15) {
      signals.push({
        type: 'rapid_actions',
        description: `${last60s.length} actions in the last 60 seconds (threshold: 15)`,
        riskDelta: 0.25,
      });
    }

    // --- unusual_volume ---
    if (userEvents.length >= 10) {
      const oldest = userEvents[0].timestamp;
      const spanHours = Math.max(1, (now - oldest) / 3_600_000);
      const avgPerHour = userEvents.length / spanHours;
      const lastHour = userEvents.filter((e) => e.timestamp > now - 3_600_000).length;
      if (lastHour > avgPerHour * 3) {
        signals.push({
          type: 'unusual_volume',
          description: `${lastHour} requests in the last hour vs. average of ${avgPerHour.toFixed(1)}/hr (3× threshold)`,
          riskDelta: 0.2,
        });
      }
    }

    // --- geography_jump (subnet check) ---
    const recentIps = userEvents.slice(-10).map((e) => e.actorIp);
    if (recentIps.length > 0) {
      const getSubnet = (ip: string): string => ip.split('.').slice(0, 2).join('.');
      const currentSubnet = getSubnet(currentIp);
      const knownSubnets = new Set(recentIps.map(getSubnet));
      if (!knownSubnets.has(currentSubnet)) {
        signals.push({
          type: 'geography_jump',
          description: `IP subnet ${currentSubnet}.x.x not seen in last 10 events`,
          riskDelta: 0.3,
        });
      }
    }

    return signals;
  }

  // -------------------------------------------------------------------------
  // Export restriction enforcement
  // -------------------------------------------------------------------------

  /**
   * Validate whether a user's export request is permitted under their role policy.
   */
  enforceExportRestriction(
    userId: string,
    role: UserRole,
    requestedRecords: number,
    category: string
  ): { allowed: boolean; reason?: string; maxAllowed: number } {
    const policy = this.rolePolicies.get(role);
    if (!policy) {
      return { allowed: false, reason: `Unknown role '${role}'`, maxAllowed: 0 };
    }

    if (!policy.exportAllowed) {
      return {
        allowed: false,
        reason: `Export is not allowed for role '${role}'`,
        maxAllowed: 0,
      };
    }

    // Authenticated users may only export their own data
    if (role === 'authenticated' && category !== 'own') {
      return {
        allowed: false,
        reason: `Role 'authenticated' may only export own data (requested category: '${category}')`,
        maxAllowed: policy.exportMaxRecords,
      };
    }

    // Unlimited for sovereign
    if (policy.exportMaxRecords === -1) {
      return { allowed: true, maxAllowed: -1 };
    }

    if (requestedRecords > policy.exportMaxRecords) {
      return {
        allowed: false,
        reason: `Requested ${requestedRecords} records exceeds the ${policy.exportMaxRecords} record limit for role '${role}'`,
        maxAllowed: policy.exportMaxRecords,
      };
    }

    return { allowed: true, maxAllowed: policy.exportMaxRecords };
  }

  // -------------------------------------------------------------------------
  // Audit integrity verification (chain hashing)
  // -------------------------------------------------------------------------

  /**
   * Each audit entry's chainHash = SHA-256(prevChainHash + JSON(entry without chainHash)).
   * The genesis entry uses prevChainHash = 'ATLAS_GENESIS'.
   *
   * Recomputes the entire chain and returns the first entry whose stored hash
   * doesn't match the recomputed hash — indicating a tamper point.
   */
  verifyAuditIntegrity(
    entries: SovereignAuditEntry[]
  ): { intact: boolean; firstCorruptedEntry?: string } {
    if (entries.length === 0) return { intact: true };

    let prevHash = 'ATLAS_GENESIS';

    for (const entry of entries) {
      // Serialise entry content without its chainHash field
      const { chainHash: storedHash, ...content } = entry;
      const serialised = JSON.stringify(content, Object.keys(content).sort());
      const expectedHash = createHash('sha256')
        .update(prevHash + serialised)
        .digest('hex');

      if (storedHash !== expectedHash) {
        return { intact: false, firstCorruptedEntry: entry.id };
      }

      prevHash = storedHash;
    }

    return { intact: true };
  }

  /**
   * Compute the chainHash for a new audit entry (helper for audit writers).
   */
  computeChainHash(
    entry: Omit<SovereignAuditEntry, 'chainHash'>,
    prevChainHash: string
  ): string {
    const serialised = JSON.stringify(entry, Object.keys(entry).sort());
    return createHash('sha256')
      .update(prevChainHash + serialised)
      .digest('hex');
  }

  // -------------------------------------------------------------------------
  // Security event logging
  // -------------------------------------------------------------------------

  /**
   * Append a security event to the in-memory log and persist it to Supabase.
   * The Supabase table is expected to be `security_events`.
   */
  async logSecurityEvent(
    event: Omit<SecurityEvent, 'id' | 'timestamp'>,
    supabaseUrl: string,
    supabaseKey: string
  ): Promise<void> {
    const full: SecurityEvent = {
      ...event,
      id: generateId(),
      timestamp: Date.now(),
    };

    this.securityEvents.push(full);

    // Trim in-memory log to last 10,000 events
    if (this.securityEvents.length > 10_000) {
      this.securityEvents.splice(0, this.securityEvents.length - 10_000);
    }

    try {
      await fetch(`${supabaseUrl}/rest/v1/security_events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(full),
      });
    } catch (err) {
      // Logging errors must never crash the application
      console.error('[SecurityHardeningLayer] Failed to persist security event:', (err as Error).message);
    }
  }

  // -------------------------------------------------------------------------
  // Risk score accessor
  // -------------------------------------------------------------------------

  /**
   * Return the current risk score for an identifier (userId or IP).
   * Returns 0 if no state exists.
   */
  getRiskScore(identifier: string): number {
    return this.bruteForceStates.get(identifier)?.riskScore ?? 0;
  }

  // -------------------------------------------------------------------------
  // Fastify role guard factory
  // -------------------------------------------------------------------------

  /**
   * Build a Fastify preHandler that enforces role + action on a route.
   *
   * Usage:
   *   fastify.get('/api/sovereign/data', {
   *     preHandler: security.createRoleGuard('sovereign', 'sovereign.data.read'),
   *   }, handler);
   */
  createRoleGuard(
    requiredRole: UserRole,
    action: string
  ): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const result = this.enforceRole(request, requiredRole, action);

      if (!result.allowed) {
        await this.logSecurityEvent(
          {
            type: 'role.violation',
            actorId: request.user?.id ?? 'anonymous',
            actorIp: request.ip,
            action,
            resource: request.url,
            result: 'blocked',
            riskScore: 0.5,
            details: { reason: result.reason },
          },
          // supabaseUrl / supabaseKey are not available here without DI;
          // pass empty strings and rely on the caller to set them via
          // the securityMiddleware plugin which has access to fastify.secrets.
          '',
          ''
        );

        reply.status(403).send({
          error: 'Forbidden',
          message: result.reason ?? 'Insufficient role or action not permitted',
        });
      }
    };
  }

  // -------------------------------------------------------------------------
  // Accessors (for securityRoutes.ts)
  // -------------------------------------------------------------------------

  getRecentEvents(
    limit = 100,
    offset = 0,
    filterType?: SecurityEventType,
    filterResult?: SecurityEvent['result']
  ): { events: SecurityEvent[]; total: number } {
    let filtered = this.securityEvents;

    if (filterType) {
      filtered = filtered.filter((e) => e.type === filterType);
    }
    if (filterResult) {
      filtered = filtered.filter((e) => e.result === filterResult);
    }

    const total = filtered.length;
    const events = filtered.slice(offset, offset + limit);
    return { events, total };
  }

  getAnomalousUsers(threshold = 0.4): Array<{ identifier: string; riskScore: number }> {
    const result: Array<{ identifier: string; riskScore: number }> = [];

    for (const [identifier, state] of this.bruteForceStates.entries()) {
      if (state.riskScore >= threshold) {
        result.push({ identifier, riskScore: state.riskScore });
      }
    }

    return result.sort((a, b) => b.riskScore - a.riskScore);
  }

  clearBlock(identifier: string): boolean {
    const state = this.bruteForceStates.get(identifier);
    if (!state) return false;
    state.blocked = false;
    state.blockedUntil = undefined;
    state.attempts = [];
    state.riskScore = 0;
    return true;
  }

  getExportLog(sinceMs: number): SecurityEvent[] {
    return this.securityEvents.filter(
      (e) =>
        (e.type === 'export.requested' || e.type === 'export.blocked') &&
        e.timestamp >= sinceMs
    );
  }
}
