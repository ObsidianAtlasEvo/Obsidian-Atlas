/**
 * scopedRateLimit.ts — Per-scope inline rate limiting.
 *
 * Why this exists:
 *   The root app registers @fastify/rate-limit globally (see plugins/rateLimit.ts),
 *   but CodeQL's "js/missing-rate-limiting" (CWE-770) can't syntactically trace
 *   a plugin-registered limiter to an individual route handler inside a nested
 *   scope. Calling `enforceScopedRateLimit` from the scope's preHandler gives
 *   CodeQL a visible guard on the same call path as the DB access, AND provides
 *   defence-in-depth on top of the global limiter.
 *
 * Usage (inside `fastify.register(async (scope) => { ... })`):
 *
 *   const limiter = createScopedRateLimiter({ max: 30, windowMs: 60_000 });
 *   scope.addHook('onRequest', async (req, reply) => {
 *     await limiter.enforce(req, reply);
 *   });
 *   scope.addHook('preHandler', async (req, reply) => {
 *     const allowed = await limiter.enforce(req, reply);
 *     if (!allowed) return;
 *     // ...the rest of your preHandler (auth bridge, etc.)
 *   });
 *
 * The bucket is in-memory and per-process. For multi-instance deployments the
 * global @fastify/rate-limit plugin should be configured with a shared store
 * (Redis) — this helper is a CodeQL-visible guard, not the sole defence.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';

export interface ScopedRateLimitOptions {
  /** Max requests per window, per IP. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Human-readable name shown in the 429 message (e.g. 'Billing', 'Legal'). */
  scopeName?: string;
  /** Optional predicate — return true to skip the limiter for a given request. */
  allowList?: (req: FastifyRequest) => boolean;
}

export interface ScopedRateLimiter {
  /**
   * Enforces the rate limit. Returns `true` if the request is allowed to
   * proceed, `false` if a 429 was sent. Always `await` — even though the
   * fast path is synchronous, the reject path sends a reply.
   */
  enforce: (request: FastifyRequest, reply: FastifyReply) => Promise<boolean>;
}

interface Bucket {
  count: number;
  resetAt: number;
}

function extractIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (Array.isArray(forwarded) && forwarded[0]) return forwarded[0];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() || request.ip || 'unknown';
  }
  return request.ip ?? 'unknown';
}

/**
 * Factory — one limiter per scope. Each call returns an independent bucket
 * map so scopes don't share counters.
 */
export function createScopedRateLimiter(opts: ScopedRateLimitOptions): ScopedRateLimiter {
  const { max, windowMs, scopeName = 'Request', allowList } = opts;
  const buckets = new Map<string, Bucket>();

  // Opportunistic GC: prune expired buckets on every Nth request to avoid
  // unbounded growth under high-cardinality IP traffic.
  let requestsSinceGc = 0;
  const GC_EVERY = 500;

  const enforce = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<boolean> => {
    if (allowList && allowList(request)) return true;

    // If a prior hook already sent a reply (e.g. earlier rate-limit pass),
    // don't try to send again.
    if (reply.sent) return false;

    const ip = extractIp(request);
    const now = Date.now();

    if (++requestsSinceGc >= GC_EVERY) {
      requestsSinceGc = 0;
      for (const [k, v] of buckets) {
        if (v.resetAt <= now) buckets.delete(k);
      }
    }

    const bucket = buckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(ip, { count: 1, resetAt: now + windowMs });
      return true;
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfterSecs = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      reply.header('Retry-After', retryAfterSecs);
      await reply.status(429).send({
        statusCode: 429,
        error: 'Too Many Requests',
        message: `${scopeName} rate limit exceeded. Retry after ${retryAfterSecs}s.`,
      });
      return false;
    }

    return true;
  };

  return { enforce };
}
