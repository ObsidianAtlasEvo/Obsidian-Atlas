/**
 * stripeService.ts
 * Obsidian Atlas — Stripe service layer for subscription management.
 *
 * VERSION: v4
 * DATE: April 2026
 * SUPERSEDES: v3 (groundwork/v3/)
 *
 * CHANGES FROM v3 (adversarial validation pass — 2026-04-15):
 *   - Patch 2a: createStripeCustomer() — match existing customers on
 *     metadata.atlasUserId === userId (not just email). Prevents wrong-account
 *     reuse when multiple Atlas users share an email or test accounts exist.
 *     limit increased to 10 to search across recent customer records.
 *   - Patch 2b: getSubscriptionStatus() — accepts optional email param.
 *     Sovereign bypass now checks userId OR email (full coverage).
 *
 * All v3 fixes (Repairs 1–11) are preserved verbatim.
 *
 * All DB writes go directly to SQLite via better-sqlite3.
 * The Stripe npm package is used for all Stripe API calls.
 *
 * Exports:
 *   createStripeCustomer(userId, email)          → Promise<string> (customerId)
 *   createCheckoutSession(userId, email, tier)   → Promise<string> (checkout URL)
 *   cancelSubscription(userId)                   → Promise<{ cancelAtPeriodEnd: boolean }>
 *   getSubscriptionStatus(userId, db, email?)    → Promise<SubscriptionRecord | null>
 *   handleWebhookEvent(rawBody, signature)       → Promise<void>
 *   syncSubscriptionFromStripe(subscriptionId)   → Promise<void>
 */

import Stripe from 'stripe';
import type { Database } from 'better-sqlite3';
import {
  type SubscriptionRecord,
  type SubscriptionTier,
  type SubscriptionStatus,
  isSovereignOwner,
  upsertSubscription,
  getByStripeCustomerId,
  getByStripeSubscriptionId,
  getTierForUser,
} from './subscriptionSchema.js';

// ---------------------------------------------------------------------------
// Environment validation helpers
// ---------------------------------------------------------------------------

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[Atlas/Billing] Required environment variable ${key} is not set.`);
  }
  return value;
}

function getStripeClient(): Stripe {
  const secretKey = requireEnv('STRIPE_SECRET_KEY');
  return new Stripe(secretKey, {
    apiVersion: '2025-06-30.basil' as Stripe.LatestApiVersion,
    typescript: true,
  });
}

function getPriceId(tier: 'core' | 'sovereign'): string {
  if (tier === 'core') return requireEnv('STRIPE_PRICE_CORE');
  if (tier === 'sovereign') return requireEnv('STRIPE_PRICE_SOVEREIGN');
  // TypeScript exhaustiveness guard
  const _exhaustive: never = tier;
  throw new Error(`Unknown tier: ${_exhaustive as string}`);
}

/**
 * Resolves the SubscriptionTier from a Stripe price ID.
 * Returns 'free' if the price ID is not recognized.
 */
function tierFromPriceId(priceId: string): SubscriptionTier {
  const corePrice = process.env['STRIPE_PRICE_CORE'];
  const sovereignPrice = process.env['STRIPE_PRICE_SOVEREIGN'];
  if (corePrice && priceId === corePrice) return 'core';
  if (sovereignPrice && priceId === sovereignPrice) return 'sovereign';
  return 'free';
}

/**
 * Maps a Stripe subscription status string to Atlas's SubscriptionStatus.
 */
function stripeStatusToAtlas(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'canceled';
    case 'incomplete':
    case 'paused':
      return 'inactive';
    default: {
      const _exhaustive: never = stripeStatus;
      console.warn(`[Atlas/Billing] Unknown Stripe status: ${_exhaustive as string}`);
      return 'inactive';
    }
  }
}

// ---------------------------------------------------------------------------
// Grace period constant (3 days in seconds)
// ---------------------------------------------------------------------------

const GRACE_PERIOD_SECONDS = 3 * 24 * 60 * 60; // 259200

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a Stripe Customer for the given Atlas userId and email.
 *
 * [v4 PATCH 2a] Only reuse an existing Stripe customer when it already
 * belongs to THIS Atlas user (matched by metadata.atlasUserId).
 * Searching up to 10 recent customers to prevent wrong-account reuse
 * (e.g., when multiple Atlas users share an email or test accounts exist).
 *
 * @param userId  Atlas internal user ID
 * @param email   User's email address
 * @returns       Stripe Customer ID (cus_*)
 */
export async function createStripeCustomer(
  userId: string,
  email: string
): Promise<string> {
  const stripe = getStripeClient();

  // Only reuse an existing Stripe customer when it already belongs to THIS Atlas user.
  // Reusing the first arbitrary customer by email can bind the wrong Atlas account.
  const existingCustomers = await stripe.customers.list({ email, limit: 10 });

  const atlasMatch = existingCustomers.data.find(
    (customer) => customer.metadata?.['atlasUserId'] === userId
  );

  if (atlasMatch) {
    return atlasMatch.id;
  }

  const customer = await stripe.customers.create({
    email,
    metadata: { atlasUserId: userId },
  });

  return customer.id;
}

/**
 * Creates a Stripe Checkout Session for upgrading to the given tier.
 *
 * If the user doesn't yet have a Stripe Customer, one is created first.
 * The session includes metadata.userId and metadata.tier so the webhook can
 * assign the correct tier on checkout.session.completed.
 *
 * [REPAIR 8] client_reference_id: userId is included in the session create call.
 * This allows Stripe Dashboard to link sessions back to Atlas user IDs without
 * relying solely on metadata.
 *
 * @param userId  Atlas internal user ID
 * @param email   User's email address
 * @param tier    Target subscription tier: 'core' | 'sovereign'
 * @param db      better-sqlite3 Database instance
 * @returns       Stripe Checkout hosted URL (redirect the user here)
 */
export async function createCheckoutSession(
  userId: string,
  email: string,
  tier: 'core' | 'sovereign',
  db: Database
): Promise<string> {
  const stripe = getStripeClient();
  const priceId = getPriceId(tier);
  const successUrl = requireEnv('STRIPE_SUCCESS_URL');
  const cancelUrl = requireEnv('STRIPE_CANCEL_URL');

  // Retrieve or create Stripe Customer
  const existingRecord = getTierForUser(userId, db, email);
  let customerId = existingRecord.stripeCustomerId;

  if (!customerId) {
    customerId = await createStripeCustomer(userId, email);
    // Pre-insert a minimal record so we have the customerId on file
    upsertSubscription(db, {
      userId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: existingRecord.stripeSubscriptionId,
      tier: existingRecord.tier,
      status: existingRecord.status,
      currentPeriodEnd: existingRecord.currentPeriodEnd,
      cancelAtPeriodEnd: existingRecord.cancelAtPeriodEnd,
      gracePeriodEnd: existingRecord.gracePeriodEnd,
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: userId,   // [REPAIR 8] Link session to Atlas userId in Stripe Dashboard
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: {
      trial_period_days: tier === 'core' ? 7 : 3,
      metadata: {
        atlasUserId: userId,
        atlasTier: tier,
      },
    },
    metadata: {
      atlasUserId: userId,
      atlasTier: tier,
    },
  });

  if (!session.url) {
    throw new Error('[Atlas/Billing] Stripe Checkout session URL is null — cannot redirect user.');
  }

  return session.url;
}

/**
 * Cancels the user's active Stripe subscription by setting cancel_at_period_end = true.
 * The user retains access until the end of the current billing period.
 *
 * @param userId  Atlas internal user ID
 * @param db      better-sqlite3 Database instance
 * @returns       Object with cancelAtPeriodEnd flag
 */
export async function cancelSubscription(
  userId: string,
  db: Database
): Promise<{ cancelAtPeriodEnd: boolean }> {
  const stripe = getStripeClient();
  const record = getTierForUser(userId, db);

  if (!record.stripeSubscriptionId) {
    throw new Error('[Atlas/Billing] No active subscription found for this user.');
  }

  const updated = await stripe.subscriptions.update(record.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  upsertSubscription(db, {
    userId,
    stripeCustomerId: record.stripeCustomerId,
    stripeSubscriptionId: record.stripeSubscriptionId,
    tier: record.tier,
    status: record.status,
    currentPeriodEnd: record.currentPeriodEnd,
    cancelAtPeriodEnd: true,
    gracePeriodEnd: record.gracePeriodEnd,
  });

  return { cancelAtPeriodEnd: updated.cancel_at_period_end };
}

/**
 * Returns the current subscription record for the given userId.
 *
 * [v4 PATCH 2b] Accepts optional email param. Sovereign bypass now checks
 * userId OR email — full coverage without relying solely on userId matching.
 *
 * Returns null only if the userId is entirely unknown AND the Sovereign bypass
 * does not apply — callers should treat null as a free-tier user.
 *
 * In practice, getTierForUser() always returns a record (synthesizes free if
 * none exists), so null is only returned when the sovereign bypass does not fire
 * and no DB record exists — which getTierForUser handles by returning free/inactive.
 * This function therefore never returns null in normal operation.
 *
 * @param userId  Atlas internal user ID
 * @param db      better-sqlite3 Database instance
 * @param email   Optional user email — enables email-based sovereign bypass
 */
export async function getSubscriptionStatus(
  userId: string,
  db: Database,
  email?: string
): Promise<SubscriptionRecord | null> {
  // Sovereign Creator bypass — supports either userId or email
  if (isSovereignOwner(userId, email)) {
    const now = Date.now();
    return {
      userId,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      tier: 'sovereign',
      status: 'active',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      gracePeriodEnd: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  const record = getTierForUser(userId, db, email);
  return record;
}

/**
 * Syncs Atlas's local subscription record with the live Stripe subscription.
 * Useful for reconciliation and debugging subscription drift.
 *
 * @param subscriptionId  Stripe Subscription ID (sub_*)
 * @param db              better-sqlite3 Database instance
 */
export async function syncSubscriptionFromStripe(
  subscriptionId: string,
  db: Database
): Promise<void> {
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price'],
  });

  const existingRecord = getByStripeSubscriptionId(db, subscriptionId);
  if (!existingRecord) {
    console.warn(
      `[Atlas/Billing] syncSubscriptionFromStripe: no local record for subscription ${subscriptionId}. ` +
      'Cannot sync without a userId mapping.'
    );
    return;
  }

  const firstItem = subscription.items.data[0];
  const priceId = firstItem?.price.id ?? '';
  const tier = tierFromPriceId(priceId);
  const status = stripeStatusToAtlas(subscription.status);

  // Preserve existing grace period if still relevant
  const nowSeconds = Math.floor(Date.now() / 1000);
  let gracePeriodEnd = existingRecord.gracePeriodEnd;
  if (status !== 'past_due') {
    gracePeriodEnd = null; // Clear grace period when no longer past_due
  }

  upsertSubscription(db, {
    userId: existingRecord.userId,
    stripeCustomerId: typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id,
    stripeSubscriptionId: subscription.id,
    tier,
    status,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    gracePeriodEnd,
  });

  console.info(
    `[Atlas/Billing] Synced subscription ${subscriptionId} → tier=${tier}, status=${status}, ` +
    `periodEnd=${new Date((subscription.current_period_end ?? nowSeconds) * 1000).toISOString()}`
  );
}

// ---------------------------------------------------------------------------
// Webhook event handler
// ---------------------------------------------------------------------------

/**
 * Verifies and handles an incoming Stripe webhook event.
 *
 * The raw request body Buffer and the Stripe-Signature header are required.
 * Stripe signature verification WILL fail if the body has been JSON-parsed
 * or modified before this function is called.
 *
 * Handles:
 *   - checkout.session.completed
 *   - customer.subscription.updated
 *   - customer.subscription.deleted
 *   - invoice.payment_succeeded
 *   - invoice.payment_failed
 *
 * @param rawBody   Raw request body as a Buffer (from Fastify rawBody)
 * @param signature Value of the Stripe-Signature HTTP header
 * @param db        better-sqlite3 Database instance
 */
export async function handleWebhookEvent(
  rawBody: Buffer,
  signature: string,
  db: Database
): Promise<void> {
  const stripe = getStripeClient();
  const webhookSecret = requireEnv('STRIPE_WEBHOOK_SECRET');

  // Verify signature — throws if invalid or timestamp is stale (>300s)
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new WebhookSignatureError(`Stripe webhook signature verification failed: ${message}`);
  }

  console.info(`[Atlas/Billing] Received Stripe webhook: ${event.type} (${event.id})`);

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutSessionCompleted(event.data.object, db);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object, db);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object, db);
      break;
    case 'invoice.payment_succeeded':
      await handleInvoicePaymentSucceeded(event.data.object, db);
      break;
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object, db);
      break;
    default:
      // Unhandled event types — acknowledged but not processed
      console.info(`[Atlas/Billing] Unhandled webhook event type: ${event.type}`);
  }
}

/**
 * Custom error class for webhook signature failures.
 * Allows billingRoutes.ts to return HTTP 400 specifically for this error.
 */
export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

// ---------------------------------------------------------------------------
// Webhook event sub-handlers
// ---------------------------------------------------------------------------

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
  db: Database
): Promise<void> {
  const userId = session.metadata?.['atlasUserId'];
  const tierRaw = session.metadata?.['atlasTier'];

  if (!userId || !tierRaw) {
    console.error(
      '[Atlas/Billing] checkout.session.completed: missing atlasUserId or atlasTier in metadata.',
      { sessionId: session.id }
    );
    return;
  }

  const tier: SubscriptionTier =
    tierRaw === 'core' ? 'core' :
    tierRaw === 'sovereign' ? 'sovereign' :
    'free';

  const customerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id ?? null;

  upsertSubscription(db, {
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    tier,
    status: 'active',
    currentPeriodEnd: null, // Will be set on the next subscription.updated event
    cancelAtPeriodEnd: false,
    gracePeriodEnd: null,
  });

  console.info(
    `[Atlas/Billing] Checkout completed for user ${userId}: tier=${tier}, ` +
    `customerId=${customerId ?? 'null'}, subscriptionId=${subscriptionId ?? 'null'}`
  );

  // Immediately sync full subscription details from Stripe if we have a subscription ID
  if (subscriptionId) {
    await syncSubscriptionFromStripe(subscriptionId, db);
  }
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  db: Database
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  const existingRecord = getByStripeCustomerId(db, customerId);
  if (!existingRecord) {
    console.warn(
      `[Atlas/Billing] subscription.updated: no local record for customer ${customerId}. ` +
      'Skipping update — record may be created by checkout.session.completed later.'
    );
    return;
  }

  const firstItem = subscription.items.data[0];
  const priceId = firstItem?.price.id ?? '';
  const tier = tierFromPriceId(priceId);
  const status = stripeStatusToAtlas(subscription.status);

  // Clear grace period if subscription is no longer past_due
  const gracePeriodEnd = status === 'past_due' ? existingRecord.gracePeriodEnd : null;

  upsertSubscription(db, {
    userId: existingRecord.userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    tier,
    status,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    gracePeriodEnd,
  });

  console.info(
    `[Atlas/Billing] Subscription updated for user ${existingRecord.userId}: ` +
    `tier=${tier}, status=${status}, cancelAtPeriodEnd=${subscription.cancel_at_period_end}`
  );
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  db: Database
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  const existingRecord = getByStripeCustomerId(db, customerId);
  if (!existingRecord) {
    console.warn(
      `[Atlas/Billing] subscription.deleted: no local record for customer ${customerId}.`
    );
    return;
  }

  upsertSubscription(db, {
    userId: existingRecord.userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    tier: 'free',         // Immediate downgrade on deletion
    status: 'canceled',
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: false,
    gracePeriodEnd: null, // No grace period on explicit deletion
  });

  console.info(
    `[Atlas/Billing] Subscription deleted for user ${existingRecord.userId}: ` +
    'downgraded to free tier immediately.'
  );
}

async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice,
  db: Database
): Promise<void> {
  const customerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;

  if (!customerId) {
    console.warn('[Atlas/Billing] invoice.payment_succeeded: no customer ID on invoice.');
    return;
  }

  const existingRecord = getByStripeCustomerId(db, customerId);
  if (!existingRecord) return; // Unknown customer, nothing to update

  // Clear grace period, restore active status
  upsertSubscription(db, {
    userId: existingRecord.userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: existingRecord.stripeSubscriptionId,
    tier: existingRecord.tier,
    status: 'active',
    currentPeriodEnd: existingRecord.currentPeriodEnd,
    cancelAtPeriodEnd: existingRecord.cancelAtPeriodEnd,
    gracePeriodEnd: null, // Payment succeeded — grace period cleared
  });

  console.info(
    `[Atlas/Billing] Payment succeeded for user ${existingRecord.userId}: ` +
    'grace period cleared, status=active.'
  );

  // [REPAIR 9] Sync full subscription details from Stripe after payment success.
  // Ensures currentPeriodEnd, cancelAtPeriodEnd, and tier stay accurate.
  const subscriptionId = invoice.subscription as string | null;
  if (subscriptionId) {
    await syncSubscriptionFromStripe(subscriptionId, db);
  }
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  db: Database
): Promise<void> {
  const customerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;

  if (!customerId) {
    console.warn('[Atlas/Billing] invoice.payment_failed: no customer ID on invoice.');
    return;
  }

  const existingRecord = getByStripeCustomerId(db, customerId);
  if (!existingRecord) return; // Unknown customer, nothing to update

  // Set grace period to now + 3 days (in seconds)
  const nowSeconds = Math.floor(Date.now() / 1000);
  const gracePeriodEnd = nowSeconds + GRACE_PERIOD_SECONDS;

  upsertSubscription(db, {
    userId: existingRecord.userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: existingRecord.stripeSubscriptionId,
    tier: existingRecord.tier, // Preserve tier during grace period
    status: 'past_due',
    currentPeriodEnd: existingRecord.currentPeriodEnd,
    cancelAtPeriodEnd: existingRecord.cancelAtPeriodEnd,
    gracePeriodEnd,
  });

  console.warn(
    `[Atlas/Billing] Payment failed for user ${existingRecord.userId}: ` +
    `status=past_due, gracePeriodEnd=${new Date(gracePeriodEnd * 1000).toISOString()}. ` +
    'Access preserved for 3-day grace period.'
  );

  // [REPAIR 9] Sync full subscription details from Stripe after payment failure.
  // Ensures currentPeriodEnd, cancelAtPeriodEnd, and tier stay accurate
  // rather than relying on stale cached data.
  const subscriptionId = invoice.subscription as string | null;
  if (subscriptionId) {
    await syncSubscriptionFromStripe(subscriptionId, db);
  }
}
