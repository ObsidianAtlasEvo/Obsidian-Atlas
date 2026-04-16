import { getDb } from '../../db/sqlite.js';
import { env } from '../../config/env.js';
import type { SubscriptionTier } from '../intelligence/groundwork/v4/subscriptionSchema.js';

const TIER_CHAT_LIMIT: Record<NonNullable<SubscriptionTier>, number | null> = {
  free: 120,
  core: 500,
  sovereign: null, // unlimited
};

export class CognitiveQuotaError extends Error {
  readonly code = 'cognitive_quota_reached' as const;

  constructor(message: string) {
    super(message);
    this.name = 'CognitiveQuotaError';
  }
}

function utcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export type QuotaSnapshot = {
  dateUtc: string;
  promptTokens: number;
  completionTokens: number;
  chatRequests: number;
  embedRequests: number;
  limitTokensDaily: number;
  limitChatDaily: number;
};

export function getOrCreateDailyQuotaRow(userId: string): QuotaSnapshot {
  const db = getDb();
  const dateUtc = utcDateString();
  const row = db
    .prepare(
      `SELECT prompt_tokens, completion_tokens, chat_requests, embed_requests
       FROM user_quota_daily WHERE user_id = ? AND date_utc = ?`
    )
    .get(userId, dateUtc) as
    | { prompt_tokens: number; completion_tokens: number; chat_requests: number; embed_requests: number }
    | undefined;

  if (!row) {
    db.prepare(
      `INSERT INTO user_quota_daily (user_id, date_utc, prompt_tokens, completion_tokens, chat_requests, embed_requests)
       VALUES (?, ?, 0, 0, 0, 0)`
    ).run(userId, dateUtc);
    return {
      dateUtc,
      promptTokens: 0,
      completionTokens: 0,
      chatRequests: 0,
      embedRequests: 0,
      limitTokensDaily: env.quotaDailyTokenLimit,
      limitChatDaily: env.quotaDailyChatLimit,
    };
  }

  return {
    dateUtc,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    chatRequests: row.chat_requests,
    embedRequests: row.embed_requests,
    limitTokensDaily: env.quotaDailyTokenLimit,
    limitChatDaily: env.quotaDailyChatLimit,
  };
}

/**
 * Throws CognitiveQuotaError if the user would exceed daily chat/token limits.
 * When a SubscriptionTier is provided the chat limit is resolved from the
 * tier→limit map; otherwise it falls back to the flat env limit.
 */
export function assertChatQuotaAllows(
  userId: string,
  tier?: SubscriptionTier
): QuotaSnapshot {
  // Sovereign tier = unlimited
  if (tier === null || tier === 'sovereign') return getOrCreateDailyQuotaRow(userId);

  const limit =
    tier !== undefined && tier in TIER_CHAT_LIMIT
      ? TIER_CHAT_LIMIT[tier]
      : env.quotaDailyChatLimit ?? 120;

  if (limit === null) return getOrCreateDailyQuotaRow(userId); // belt-and-suspenders for future tiers

  const s = getOrCreateDailyQuotaRow(userId);
  const totalTokens = s.promptTokens + s.completionTokens;

  if (s.chatRequests >= limit) {
    throw new CognitiveQuotaError(
      `Daily chat request limit reached (${limit}). Resets at UTC midnight.`
    );
  }
  if (totalTokens >= env.quotaDailyTokenLimit) {
    throw new CognitiveQuotaError(
      `Daily token budget exhausted (${env.quotaDailyTokenLimit} estimated tokens). Resets at UTC midnight.`
    );
  }
  return s;
}

export function recordChatTokenUsage(
  userId: string,
  promptTokens: number | undefined,
  completionTokens: number | undefined
): void {
  const db = getDb();
  const dateUtc = utcDateString();
  const p = typeof promptTokens === 'number' && Number.isFinite(promptTokens) ? Math.max(0, Math.floor(promptTokens)) : 0;
  const c =
    typeof completionTokens === 'number' && Number.isFinite(completionTokens) ? Math.max(0, Math.floor(completionTokens)) : 0;

  db.prepare(
    `INSERT INTO user_quota_daily (user_id, date_utc, prompt_tokens, completion_tokens, chat_requests, embed_requests)
     VALUES (?, ?, ?, ?, 1, 0)
     ON CONFLICT(user_id, date_utc) DO UPDATE SET
       prompt_tokens = prompt_tokens + excluded.prompt_tokens,
       completion_tokens = completion_tokens + excluded.completion_tokens,
       chat_requests = chat_requests + 1`
  ).run(userId, dateUtc, p, c);
}

export function recordEmbedRequest(userId: string): void {
  const db = getDb();
  const dateUtc = utcDateString();
  db.prepare(
    `INSERT INTO user_quota_daily (user_id, date_utc, prompt_tokens, completion_tokens, chat_requests, embed_requests)
     VALUES (?, ?, 0, 0, 0, 1)
     ON CONFLICT(user_id, date_utc) DO UPDATE SET
       embed_requests = embed_requests + 1`
  ).run(userId, dateUtc);
}
