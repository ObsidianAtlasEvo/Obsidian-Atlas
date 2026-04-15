/**
 * stripeService.ts — Live billing path.
 * Re-exports the v4 groundwork implementation from its canonical location.
 *
 * All Stripe logic lives in the groundwork v4 module; this re-export provides
 * a stable import path for the rest of the codebase:
 *   import { ... } from '../services/billing/stripeService.js';
 */
export {
  createStripeCustomer,
  createCheckoutSession,
  cancelSubscription,
  getSubscriptionStatus,
  handleWebhookEvent,
  syncSubscriptionFromStripe,
  WebhookSignatureError,
} from '../intelligence/groundwork/v4/stripeService.js';
