/**
 * billingRoutes.ts
 * Obsidian Atlas — Fastify route handlers for billing/subscription management.
 *
 * VERSION: v4
 * DATE: April 2026
 * SUPERSEDES: v3 (groundwork/v3/)
 *
 * CHANGES FROM v3 (adversarial validation pass — 2026-04-15):
 *   - Patch 3: GET /api/billing/status route overhauled:
 *     · Calls getSubscriptionStatus(session.userId, db, session.email) — email-aware.
 *     · chatLimit uses direct index access (NOT ??) to preserve null for sovereign.
 *       The v3 bug: `TIER_CHAT_LIMIT[record.tier] ?? TIER_CHAT_LIMIT['free']` collapsed
 *       sovereign null → 120. Fixed by checking !== undefined instead.
 *     · modelAccess preserves optional chaining guard from v3 (regression guard against
 *       corrupted tier values in the DB causing a TypeError).
 *     · Proper try/catch error handling with 500 response.
 *
 * All v3 fixes (Repairs 1–11) are preserved verbatim.
 *
 * Routes:
 *   POST /api/billing/create-checkout-session  — Creates Stripe Checkout session
 *   POST /api/billing/cancel                   — Cancels active subscription
 *   GET  /api/billing/status                   — Returns current tier + usage
 *   POST /api/webhooks/stripe                  — Stripe webhook receiver (raw body)
 *
 * Auth:
 *   - Billing routes require attachAtlasSession middleware (same pattern as protected_app routes)
 *   - Webhook route uses Stripe signature verification instead of session auth
 *
 * IMPORTANT: The webhook route must be registered with raw body support.
 * In Fastify, add the following content-type parser for the webhook route path:
 *
 *   fastify.addContentTypeParser(
 *     'application/json',
 *     { parseAs: 'buffer', bodyLimit: 1048576 },
 *     (req, body, done) => {
 *       if (req.routerPath === '/api/webhooks/stripe') {
 *         done(null, body); // pass raw Buffer
 *       } else {
 *         done(null, JSON.parse(body.toString('utf8')));
 *       }
 *     }
 *   );
 *
 * Or register the webhook route BEFORE the global JSON body parser plugin.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Database } from 'better-sqlite3';
import {
  createCheckoutSession,
  cancelSubscription,
  getSubscriptionStatus,
  handleWebhookEvent,
  WebhookSignatureError,
} from './stripeService.js';
import {
  getTierForUser,
  TIER_MODEL_ACCESS,
  TIER_CHAT_LIMIT,
  isSovereignOwner,
} from './subscriptionSchema.js';

// ---------------------------------------------------------------------------
// Rate limit references
// ---------------------------------------------------------------------------

import { RATE_LIMITS } from '../plugins/rateLimit.js';

// ---------------------------------------------------------------------------
// Session type — matches what attachAtlasSession injects into the request
// ---------------------------------------------------------------------------

interface AtlasSession {
  userId: string;
  email: string;
}

// Augment FastifyRequest to include the session
declare module 'fastify' {
  interface FastifyRequest {
    atlasSession?: AtlasSession;
  }
}

// ---------------------------------------------------------------------------
// Request/response body types
// ---------------------------------------------------------------------------

interface CreateCheckoutSessionBody {
  tier: 'core' | 'sovereign';
}

interface CreateCheckoutSessionReply {
  url: string;
}

interface CancelSubscriptionReply {
  success: true;
  cancelAtPeriodEnd: boolean;
}

/** [REPAIR 6] chatLimit is number | null. null means unlimited (sovereign tier). */
interface BillingStatusReply {
  tier: string;
  status: string;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  gracePeriodEnd: number | null;
  modelAccess: string[];
  chatLimit: number | null;
  usageToday: number;
}

interface WebhookReply {
  received: true;
}

// ---------------------------------------------------------------------------
// Helper: extract and validate session
// ---------------------------------------------------------------------------

function requireSession(request: FastifyRequest, reply: FastifyReply): AtlasSession | null {
  if (!request.atlasSession?.userId || !request.atlasSession.email) {
    reply.code(401).send({ error: 'Authentication required.' });
    return null;
  }
  return request.atlasSession;
}

// ---------------------------------------------------------------------------
// Helper: get daily chat usage count
// ---------------------------------------------------------------------------

/**
 * Counts how many chat messages the user has sent today (UTC day boundary).
 *
 * [REPAIR 7] Uses the real Atlas `traces` table with columns:
 *   - user_id TEXT
 *   - created_at TEXT (ISO string, e.g. "2026-04-15T14:30:00.000Z")
 *
 * Daily boundary is midnight UTC expressed as an ISO string.
 * ISO 8601 strings sort lexicographically in SQLite — string comparison is correct.
 * One row per user turn confirmed. COUNT(*) is the correct usage metric.
 */
function getDailyUsage(userId: string, db: Database): number {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const startOfDayIso = startOfDay.toISOString(); // e.g. "2026-04-15T00:00:00.000Z"

  const stmt = db.prepare<[string, string], { count: number }>(`
    SELECT COUNT(*) as count
    FROM traces
    WHERE user_id = ?
      AND created_at >= ?
  `);

  const result = stmt.get(userId, startOfDayIso);
  return result?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

/**
 * Registers all billing routes on the Fastify instance.
 *
 * @param fastify  Fastify instance
 * @param db       better-sqlite3 Database instance (shared with the rest of Atlas)
 */
export async function registerBillingRoutes(
  fastify: FastifyInstance,
  db: Database
): Promise<void> {

  // -----------------------------------------------------------------------
  // POST /api/billing/create-checkout-session
  // -----------------------------------------------------------------------
  fastify.post<{
    Body: CreateCheckoutSessionBody;
    Reply: CreateCheckoutSessionReply | { error: string };
  }>(
    '/api/billing/create-checkout-session',
    {
      config: { rateLimit: RATE_LIMITS.writeUser },
      schema: {
        body: {
          type: 'object',
          required: ['tier'],
          properties: {
            tier: { type: 'string', enum: ['core', 'sovereign'] },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: { url: { type: 'string' } },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: CreateCheckoutSessionBody }>, reply: FastifyReply) => {
      const session = requireSession(request, reply);
      if (!session) return;

      // [REPAIR 3] Sovereign Creator guard — bypass billing entirely
      if (isSovereignOwner(session.userId, session.email)) {
        return reply.code(403).send({
          error: 'Sovereign Creator access is managed outside billing.'
        });
      }

      const { tier } = request.body;

      // Disallow if user already has an active subscription at or above this tier
      const current = getTierForUser(session.userId, db, session.email);
      if (current.status === 'active' || current.status === 'trialing') {
        if (current.tier === tier || (current.tier === 'sovereign' && tier === 'core')) {
          return reply.code(409).send({ error: 'You already have an active subscription at this tier or higher.' });
        }
      }

      try {
        const url = await createCheckoutSession(session.userId, session.email, tier, db);
        return reply.code(200).send({ url });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create checkout session.';
        fastify.log.error({ err, userId: session.userId }, '[Atlas/Billing] create-checkout-session error');
        return reply.code(500).send({ error: message });
      }
    }
  );

  // -----------------------------------------------------------------------
  // POST /api/billing/cancel
  // -----------------------------------------------------------------------
  fastify.post<{
    Reply: CancelSubscriptionReply | { error: string };
  }>(
    '/api/billing/cancel',
    {
      config: { rateLimit: RATE_LIMITS.writeUser },
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              cancelAtPeriodEnd: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = requireSession(request, reply);
      if (!session) return;

      // [REPAIR 3] Sovereign Creator guard — bypass billing entirely
      if (isSovereignOwner(session.userId, session.email)) {
        return reply.code(403).send({
          error: 'Sovereign Creator access is managed outside billing.'
        });
      }

      // Verify they have an active subscription to cancel
      const current = getTierForUser(session.userId, db, session.email);
      if (!current.stripeSubscriptionId) {
        return reply.code(404).send({ error: 'No active subscription found.' });
      }
      if (current.cancelAtPeriodEnd) {
        return reply.code(409).send({ error: 'Subscription is already set to cancel at period end.' });
      }

      try {
        const result = await cancelSubscription(session.userId, db);
        return reply.code(200).send({ success: true, cancelAtPeriodEnd: result.cancelAtPeriodEnd });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to cancel subscription.';
        fastify.log.error({ err, userId: session.userId }, '[Atlas/Billing] cancel error');
        return reply.code(500).send({ error: message });
      }
    }
  );

  // -----------------------------------------------------------------------
  // GET /api/billing/status
  //
  // [v4 PATCH 3] Key fixes:
  //   1. Calls getSubscriptionStatus(session.userId, db, session.email) — email-aware.
  //   2. chatLimit: direct index access (not ??) to preserve null for sovereign.
  //      TIER_CHAT_LIMIT.sovereign === null means unlimited. The ?? operator would
  //      collapse null → TIER_CHAT_LIMIT['free'] (120). Use !== undefined instead.
  //   3. modelAccess: preserves optional chaining guard (?.modelIds) to prevent
  //      TypeError if a corrupted tier string appears in the DB.
  // -----------------------------------------------------------------------
  fastify.get<{
    Reply: BillingStatusReply | { error: string };
  }>(
    '/api/billing/status',
    {
      config: { rateLimit: RATE_LIMITS.readUser },
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              tier: { type: 'string' },
              status: { type: 'string' },
              currentPeriodEnd: { type: ['number', 'null'] },
              cancelAtPeriodEnd: { type: 'boolean' },
              gracePeriodEnd: { type: ['number', 'null'] },
              modelAccess: { type: 'array', items: { type: 'string' } },
              chatLimit: { type: ['number', 'null'] },  // [REPAIR 6] null for sovereign unlimited
              usageToday: { type: 'number' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = requireSession(request, reply);
      if (!session) return;

      try {
        // [v4 PATCH 3] Pass session.email for full email-aware sovereign detection
        const record = await getSubscriptionStatus(session.userId, db, session.email);
        if (!record) {
          return reply.code(200).send({
            tier: 'free',
            status: 'inactive',
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            gracePeriodEnd: null,
            modelAccess: TIER_MODEL_ACCESS['free'].modelIds,
            chatLimit: TIER_CHAT_LIMIT['free'],
            usageToday: 0,
          });
        }

        // [v4 PATCH 3] Preserve optional chaining guard — corrupted tier values must
        // not cause a TypeError. Fall back to free-tier model list if tier is unknown.
        const modelAccess = TIER_MODEL_ACCESS[record.tier]?.modelIds ?? TIER_MODEL_ACCESS['free'].modelIds;

        // [v4 PATCH 3 — CRITICAL FIX] Do NOT use ?? here.
        // TIER_CHAT_LIMIT.sovereign === null (unlimited). The ?? operator treats null as
        // nullish and would fall through to TIER_CHAT_LIMIT['free'] (120), incorrectly
        // limiting sovereign users. Use !== undefined to preserve the null value.
        const chatLimit = TIER_CHAT_LIMIT[record.tier] !== undefined
          ? TIER_CHAT_LIMIT[record.tier]
          : TIER_CHAT_LIMIT['free'];

        const usageToday = getDailyUsage(session.userId, db);

        return reply.code(200).send({
          tier: record.tier,
          status: record.status,
          currentPeriodEnd: record.currentPeriodEnd,
          cancelAtPeriodEnd: record.cancelAtPeriodEnd,
          gracePeriodEnd: record.gracePeriodEnd,
          modelAccess,
          chatLimit,
          usageToday,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to retrieve billing status.';
        fastify.log.error({ err, userId: session.userId }, '[Atlas/Billing] status error');
        return reply.code(500).send({ error: message });
      }
    }
  );

  // -----------------------------------------------------------------------
  // POST /api/webhooks/stripe
  //
  // CRITICAL: This route requires the raw request body as a Buffer.
  // Register this route before the global JSON body parser, OR add a
  // content-type parser override for this specific path.
  //
  // Fastify raw body setup:
  //   fastify.addContentTypeParser('application/json', { parseAs: 'buffer' },
  //     (req, body, done) => {
  //       if (req.url === '/api/webhooks/stripe') done(null, body);
  //       else done(null, JSON.parse(body.toString('utf8')));
  //     }
  //   );
  // -----------------------------------------------------------------------
  fastify.post<{
    Reply: WebhookReply | { error: string };
  }>(
    '/api/webhooks/stripe',
    {
      // No rate limiting — Stripe controls delivery rate.
      // No attachAtlasSession — signature verification is the auth mechanism.
      config: {},
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const signature = request.headers['stripe-signature'];

      if (!signature || typeof signature !== 'string') {
        return reply.code(400).send({ error: 'Missing Stripe-Signature header.' });
      }

      // The body must be a raw Buffer. If it's a string or object, the
      // content-type parser was not configured correctly for this route.
      const rawBody = request.body;
      if (!Buffer.isBuffer(rawBody)) {
        fastify.log.error(
          '[Atlas/Billing] Webhook body is not a Buffer. ' +
          'Ensure raw body parsing is configured for /api/webhooks/stripe. ' +
          `Received type: ${typeof rawBody}`
        );
        return reply.code(500).send({ error: 'Server misconfiguration: raw body not available.' });
      }

      try {
        await handleWebhookEvent(rawBody, signature, db);
        return reply.code(200).send({ received: true });
      } catch (err) {
        if (err instanceof WebhookSignatureError) {
          // [REPAIR 2] Log warn (already in v2 for sig errors — preserved)
          fastify.log.warn({ err }, '[Atlas/Billing] Webhook signature verification failed');
          return reply.code(400).send({ error: err.message });
        }
        // [REPAIR 2] Return 500 (not 200) for unexpected errors.
        // Returning 200 would tell Stripe to stop retrying — wrong for real failures.
        fastify.log.error({ err }, '[Atlas/Billing] Webhook handler failed');
        return reply.code(500).send({ error: 'Webhook processing failed.' });
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Plugin export for Fastify's plugin system (optional)
// ---------------------------------------------------------------------------

/**
 * Fastify plugin wrapper for use with fastify.register().
 *
 * Usage:
 *   await fastify.register(billingPlugin, { db });
 */
export async function billingPlugin(
  fastify: FastifyInstance,
  options: { db: Database }
): Promise<void> {
  await registerBillingRoutes(fastify, options.db);
}
