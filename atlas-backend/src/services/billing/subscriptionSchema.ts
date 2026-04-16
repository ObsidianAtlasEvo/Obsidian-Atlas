/**
 * subscriptionSchema.ts — Live billing path.
 * Re-exports the v4 groundwork implementation from its canonical location.
 *
 * All billing logic lives in the groundwork v4 module; this re-export provides
 * a stable import path for the rest of the codebase:
 *   import { ... } from '../services/billing/subscriptionSchema.js';
 */
export {
  SUBSCRIPTION_SCHEMA_SQL,
  runMigration,
  type SubscriptionTier,
  type SubscriptionStatus,
  type SubscriptionRecord,
  type TierModelAccess,
  TIER_MODEL_ACCESS,
  TIER_BUDGET_MODE,
  TIER_CHAT_LIMIT,
  isSovereignOwner,
  getTierForUser,
  upsertSubscription,
  getByStripeCustomerId,
  getByStripeSubscriptionId,
} from '../intelligence/groundwork/v4/subscriptionSchema.js';
