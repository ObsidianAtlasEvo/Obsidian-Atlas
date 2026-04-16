/**
 * subscriptionSchema.ts
 * Obsidian Atlas — Stripe subscription schema, types, and tier access definitions.
 *
 * VERSION: v4
 * DATE: April 2026
 * SUPERSEDES: v3 (groundwork/v3/)
 *
 * CHANGES FROM v3 (adversarial validation pass — 2026-04-15):
 *   - Patch 1: getTierForUser() now accepts optional email param.
 *     Sovereign bypass checks BOTH userId AND email before any DB read.
 *     Callers with session.email should pass it for full sovereign coverage.
 *
 * All v3 fixes (Repairs 1–11) are preserved verbatim.
 *
 * Exports:
 *   - SQL migration string (runMigration)
 *   - SubscriptionTier, SubscriptionStatus types
 *   - SubscriptionRecord interface
 *   - TIER_MODEL_ACCESS — model registry IDs accessible per tier
 *   - TIER_BUDGET_MODE  — default budget mode per tier
 *   - TIER_CHAT_LIMIT   — daily chat limits per tier
 *   - getTierForUser    — reads from SQLite, applies Sovereign bypass (email-aware in v4)
 */

import type { Database } from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Migration SQL
// ---------------------------------------------------------------------------

export const SUBSCRIPTION_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS user_subscriptions (
  userId              TEXT PRIMARY KEY,
  stripeCustomerId    TEXT UNIQUE,
  stripeSubscriptionId TEXT,
  tier                TEXT NOT NULL DEFAULT 'free',
  status              TEXT NOT NULL DEFAULT 'inactive',
  currentPeriodEnd    INTEGER,
  cancelAtPeriodEnd   INTEGER NOT NULL DEFAULT 0,
  gracePeriodEnd      INTEGER,
  createdAt           INTEGER NOT NULL,
  updatedAt           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_customer
  ON user_subscriptions(stripeCustomerId);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_sub
  ON user_subscriptions(stripeSubscriptionId);
`;

/**
 * Run the subscription schema migration.
 * Safe to call on every boot — all statements are idempotent.
 */
export function runMigration(db: Database): void {
  db.exec(SUBSCRIPTION_SCHEMA_SQL);
}

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type SubscriptionTier = 'free' | 'core' | 'sovereign';

export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'trialing'
  | 'inactive';

export interface SubscriptionRecord {
  userId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  /** Unix timestamp (seconds) — end of current billing period. Null for free/sovereign bypass. */
  currentPeriodEnd: number | null;
  /** Whether the subscription is set to cancel at period end. */
  cancelAtPeriodEnd: boolean;
  /**
   * Unix timestamp (seconds) — end of the payment-failed grace period.
   * Null unless the subscription is in `past_due` state.
   * Access is preserved until this timestamp; after it, the user is treated as free tier.
   */
  gracePeriodEnd: number | null;
  /** Unix timestamp (ms) */
  createdAt: number;
  /** Unix timestamp (ms) */
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Tier model access
// ---------------------------------------------------------------------------

/**
 * Model access descriptor for a given tier.
 * `modelIds` use the canonical namespaced IDs from modelRegistry.ts
 * (e.g. 'openai/gpt-4o', 'groq/llama-3.1-70b-versatile').
 */
export interface TierModelAccess {
  /** List of model registry IDs accessible at this tier. */
  modelIds: string[];
  /** Human-readable description of access level. */
  description: string;
}

/**
 * Model registry IDs accessible per tier.
 *
 * GPT-5.4 bare IDs (no `openai/` prefix) — the router resolves provider at runtime.
 *
 * Free:      gpt-5.4-nano, Groq Llama 3.3 70B, Gemini 2.5 Flash. Overseer: gemini-3.1-flash-lite-preview (fallback: gpt-5.4-nano).
 * Core:      Free models + gpt-5.4-mini, gpt-5.4 (Overseer standard).
 * Sovereign: Core models + gpt-5.4 (worker), gpt-5.4-pro, Claude Sonnet 4.6, Claude Opus 4.6.
 */
export const TIER_MODEL_ACCESS: Record<SubscriptionTier, TierModelAccess> = {
  free: {
    modelIds: [
      'gpt-5.4-nano',
      'groq/llama-3.3-70b-versatile',
      'gemini-2.5-flash',
      'gemini-3.1-flash-lite-preview',
    ],
    description: 'GPT-5.4 Nano, Groq Llama 3.3 70B, Gemini 2.5 Flash. Overseer: gemini-3.1-flash-lite-preview (fallback: gpt-5.4-nano).',
  },
  core: {
    modelIds: [
      'gpt-5.4-nano',
      'groq/llama-3.3-70b-versatile',
      'gemini-2.5-flash',
      'gpt-5.4-mini',
      'gpt-5.4',
    ],
    description: 'Free models + GPT-5.4 Mini, GPT-5.4 (Overseer standard).',
  },
  sovereign: {
    modelIds: [
      'gpt-5.4-nano',
      'groq/llama-3.3-70b-versatile',
      'gemini-2.5-flash',
      'gpt-5.4-mini',
      'gpt-5.4',
      'gpt-5.4-pro',
      'claude-sonnet-4-6',
      'claude-opus-4-6',
    ],
    description: 'Full model access including GPT-5.4 (worker), GPT-5.4 Pro, Claude Sonnet 4.6, and Claude Opus 4.6.',
  },
};

// ---------------------------------------------------------------------------
// Tier budget mode defaults
// ---------------------------------------------------------------------------

/**
 * Default budget mode per tier.
 * Overrides the global `budgetMode` env var on a per-user basis.
 */
export const TIER_BUDGET_MODE: Record<SubscriptionTier, 'fast' | 'balanced' | 'max-depth'> = {
  free: 'fast',
  core: 'balanced',
  sovereign: 'max-depth',
};

// ---------------------------------------------------------------------------
// Daily chat limits
// ---------------------------------------------------------------------------

/**
 * Daily chat limit per tier.
 * [REPAIR 6] null means unlimited (sovereign tier). Infinity is not valid JSON
 * and must not be serialized. Use `=== null` to check for unlimited.
 */
export const TIER_CHAT_LIMIT: Record<SubscriptionTier, number | null> = {
  free: 120,
  core: 500,
  sovereign: null,
};

// ---------------------------------------------------------------------------
// Sovereign Creator bypass
// ---------------------------------------------------------------------------

/**
 * Returns true if the given userId or email matches the Sovereign Creator.
 *
 * Checks BOTH userId AND email — either match is sufficient.
 *
 * @param userId  Atlas internal user ID (optional)
 * @param email   User email address (optional)
 */
export function isSovereignOwner(userId?: string, email?: string): boolean {
  const sovereignId    = process.env['SOVEREIGN_CREATOR_USER_ID'] ?? '';
  const sovereignEmail = process.env['SOVEREIGN_CREATOR_EMAIL'] ?? 'crowleyrc62@gmail.com';
  const idMatch    = Boolean(userId)  && Boolean(sovereignId)    && userId === sovereignId;
  const emailMatch = Boolean(email)   && email!.toLowerCase() === sovereignEmail.toLowerCase();
  return idMatch || emailMatch;
}

/**
 * Builds a synthetic SubscriptionRecord representing the Sovereign Creator's
 * permanent max-tier access. No DB write occurs — this is a pure runtime override.
 */
function buildSovereignBypassRecord(userId: string): SubscriptionRecord {
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

// ---------------------------------------------------------------------------
// SQLite row shape returned by better-sqlite3
// ---------------------------------------------------------------------------

interface SubscriptionRow {
  userId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  tier: string;
  status: string;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: number;
  gracePeriodEnd: number | null;
  createdAt: number;
  updatedAt: number;
}

function isValidTier(value: string): value is SubscriptionTier {
  return value === 'free' || value === 'core' || value === 'sovereign';
}

function isValidStatus(value: string): value is SubscriptionStatus {
  return (
    value === 'active' ||
    value === 'past_due' ||
    value === 'canceled' ||
    value === 'trialing' ||
    value === 'inactive'
  );
}

/**
 * Converts a raw SQLite row to a typed SubscriptionRecord.
 * Falls back to safe defaults if stored values are invalid.
 */
function rowToRecord(row: SubscriptionRow): SubscriptionRecord {
  const tier: SubscriptionTier = isValidTier(row.tier) ? row.tier : 'free';
  const status: SubscriptionStatus = isValidStatus(row.status) ? row.status : 'inactive';

  // Apply grace period: if payment failed and grace period has expired, treat as free
  const nowSeconds = Math.floor(Date.now() / 1000);
  let effectiveTier = tier;
  if (
    status === 'past_due' &&
    row.gracePeriodEnd !== null &&
    row.gracePeriodEnd < nowSeconds
  ) {
    effectiveTier = 'free';
  }

  return {
    userId: row.userId,
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    tier: effectiveTier,
    status,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd === 1,
    gracePeriodEnd: row.gracePeriodEnd,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Primary export: getTierForUser (v4 — email-aware sovereign bypass)
// ---------------------------------------------------------------------------

/**
 * Reads the subscription record for the given userId from SQLite.
 *
 * [v4 PATCH 1] Accepts optional email parameter.
 * Sovereign bypass checks BOTH userId AND email before any DB read.
 * Callers that have session.email should pass it so email-only sovereign
 * detection fires correctly (e.g., when SOVEREIGN_CREATOR_USER_ID is not set).
 *
 * Applies the following resolution order:
 *   1. Sovereign Creator bypass (userId OR email match) → always returns sovereign/active
 *   2. DB lookup in user_subscriptions
 *   3. If no DB record exists → returns default free/inactive synthetic record
 *
 * All tier checks must be runtime DB reads (not cached beyond a single request).
 * Grace period expiry is applied inline (past_due + gracePeriodEnd < now → effective free tier).
 *
 * @param userId  Atlas internal user ID (from Auth.js session)
 * @param db      better-sqlite3 Database instance
 * @param email   Optional user email — enables email-based sovereign bypass
 */
export function getTierForUser(
  userId: string,
  db: Database,
  email?: string
): SubscriptionRecord {
  // 1. Sovereign Creator bypass — no DB read needed
  if (isSovereignOwner(userId, email)) {
    return buildSovereignBypassRecord(userId);
  }

  // 2. DB lookup
  const stmt = db.prepare<[string], SubscriptionRow>(`
    SELECT
      userId,
      stripeCustomerId,
      stripeSubscriptionId,
      tier,
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      gracePeriodEnd,
      createdAt,
      updatedAt
    FROM user_subscriptions
    WHERE userId = ?
  `);

  const row = stmt.get(userId);

  if (!row) {
    // 3. No record → synthesize default free record
    const now = Date.now();
    return {
      userId,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      tier: 'free',
      status: 'inactive',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      gracePeriodEnd: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  return rowToRecord(row);
}

/**
 * Upserts a subscription record in user_subscriptions.
 * Used by stripeService.ts for webhook-driven updates.
 */
export function upsertSubscription(
  db: Database,
  record: Omit<SubscriptionRecord, 'createdAt' | 'updatedAt'> & {
    createdAt?: number;
    updatedAt?: number;
  }
): void {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO user_subscriptions (
      userId,
      stripeCustomerId,
      stripeSubscriptionId,
      tier,
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      gracePeriodEnd,
      createdAt,
      updatedAt
    ) VALUES (
      @userId,
      @stripeCustomerId,
      @stripeSubscriptionId,
      @tier,
      @status,
      @currentPeriodEnd,
      @cancelAtPeriodEnd,
      @gracePeriodEnd,
      @createdAt,
      @updatedAt
    )
    ON CONFLICT(userId) DO UPDATE SET
      stripeCustomerId      = excluded.stripeCustomerId,
      stripeSubscriptionId  = excluded.stripeSubscriptionId,
      tier                  = excluded.tier,
      status                = excluded.status,
      currentPeriodEnd      = excluded.currentPeriodEnd,
      cancelAtPeriodEnd     = excluded.cancelAtPeriodEnd,
      gracePeriodEnd        = excluded.gracePeriodEnd,
      updatedAt             = excluded.updatedAt
  `);

  stmt.run({
    userId: record.userId,
    stripeCustomerId: record.stripeCustomerId,
    stripeSubscriptionId: record.stripeSubscriptionId,
    tier: record.tier,
    status: record.status,
    currentPeriodEnd: record.currentPeriodEnd,
    cancelAtPeriodEnd: record.cancelAtPeriodEnd ? 1 : 0,
    gracePeriodEnd: record.gracePeriodEnd,
    createdAt: record.createdAt ?? now,
    updatedAt: record.updatedAt ?? now,
  });
}

/**
 * Looks up a subscription record by Stripe Customer ID.
 * Used by the webhook handler when userId is not directly available.
 */
export function getByStripeCustomerId(
  db: Database,
  stripeCustomerId: string
): SubscriptionRecord | null {
  const stmt = db.prepare<[string], SubscriptionRow>(`
    SELECT
      userId,
      stripeCustomerId,
      stripeSubscriptionId,
      tier,
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      gracePeriodEnd,
      createdAt,
      updatedAt
    FROM user_subscriptions
    WHERE stripeCustomerId = ?
  `);

  const row = stmt.get(stripeCustomerId);
  return row ? rowToRecord(row) : null;
}

/**
 * Looks up a subscription record by Stripe Subscription ID.
 */
export function getByStripeSubscriptionId(
  db: Database,
  stripeSubscriptionId: string
): SubscriptionRecord | null {
  const stmt = db.prepare<[string], SubscriptionRow>(`
    SELECT
      userId,
      stripeCustomerId,
      stripeSubscriptionId,
      tier,
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      gracePeriodEnd,
      createdAt,
      updatedAt
    FROM user_subscriptions
    WHERE stripeSubscriptionId = ?
  `);

  const row = stmt.get(stripeSubscriptionId);
  return row ? rowToRecord(row) : null;
}
