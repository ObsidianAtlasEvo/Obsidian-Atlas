import { env } from '../../config/env.js';
import { getDb } from '../../db/sqlite.js';
import { getPolicyProfile } from '../evolution/policyStore.js';

/** Free-tier deep research runs per user per UTC day when using the system Tavily key. */
export const DEEP_RESEARCH_FREE_DAILY_LIMIT = 5;

export class QuotaExceededError extends Error {
  readonly code = 'deep_research_quota_exceeded' as const;

  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

export class SystemDeepResearchUnavailableError extends Error {
  readonly code = 'system_deep_research_unavailable' as const;

  constructor(message: string) {
    super(message);
    this.name = 'SystemDeepResearchUnavailableError';
  }
}

function utcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

type QuotaRow = {
  tavily_api_key: string | null;
  deep_research_daily_count: number;
  deep_research_quota_date_utc: string | null;
};

function readQuotaRow(userId: string): QuotaRow {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT tavily_api_key, deep_research_daily_count, deep_research_quota_date_utc
       FROM policy_profiles WHERE user_id = ?`
    )
    .get(userId) as QuotaRow | undefined;
  if (!row) {
    return { tavily_api_key: null, deep_research_daily_count: 0, deep_research_quota_date_utc: null };
  }
  return row;
}

/**
 * Public quota snapshot for UI (never includes the BYOK secret).
 */
export function getDeepResearchQuotaSnapshot(userId: string): {
  hasByok: boolean;
  unlimited: boolean;
  usedToday: number;
  limit: number;
  resetsUtcMidnight: boolean;
} {
  getPolicyProfile(userId);
  const row = readQuotaRow(userId);
  const hasByok = Boolean(row.tavily_api_key?.trim());
  const today = utcDateString();
  let usedToday = row.deep_research_daily_count ?? 0;
  if (!hasByok && row.deep_research_quota_date_utc !== today) {
    usedToday = 0;
  }
  return {
    hasByok,
    unlimited: hasByok,
    usedToday,
    limit: DEEP_RESEARCH_FREE_DAILY_LIMIT,
    resetsUtcMidnight: !hasByok,
  };
}

/**
 * Gatekeeper: BYOK bypasses quota; otherwise resets count at UTC midnight, enforces 5/day, consumes system key slot.
 * Returns the Tavily API key to use for this single Maximum Clarity run.
 */
export function reserveDeepResearchTavilyKey(userId: string): { apiKey: string; usedSystemQuota: boolean } {
  getPolicyProfile(userId);
  const db = getDb();

  const txn = db.transaction((): { apiKey: string; usedSystemQuota: boolean } => {
    const row = db
      .prepare(
        `SELECT tavily_api_key, deep_research_daily_count, deep_research_quota_date_utc
         FROM policy_profiles WHERE user_id = ?`
      )
      .get(userId) as QuotaRow | undefined;

    if (!row) {
      throw new Error('policy_profiles row missing after getPolicyProfile');
    }

    const byok = row.tavily_api_key?.trim();
    if (byok) {
      return { apiKey: byok, usedSystemQuota: false };
    }

    const today = utcDateString();
    let count = row.deep_research_daily_count ?? 0;
    if (row.deep_research_quota_date_utc !== today) {
      count = 0;
    }

    if (count >= DEEP_RESEARCH_FREE_DAILY_LIMIT) {
      throw new QuotaExceededError(
        `Daily Maximum Clarity deep-research limit reached (${DEEP_RESEARCH_FREE_DAILY_LIMIT} per UTC day). Save your own Tavily API key in Sovereignty settings for unlimited research.`
      );
    }

    const systemKey = env.systemTavilyApiKey?.trim();
    if (!systemKey) {
      throw new SystemDeepResearchUnavailableError(
        'System Tavily key is not configured (SYSTEM_TAVILY_API_KEY). Add your own Tavily key in settings or configure the server.'
      );
    }

    const next = count + 1;
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE policy_profiles SET
        deep_research_daily_count = ?,
        deep_research_quota_date_utc = ?,
        updated_at = ?
       WHERE user_id = ?`
    ).run(next, today, now, userId);

    return { apiKey: systemKey, usedSystemQuota: true };
  });

  return txn();
}

export function setUserTavilyByok(userId: string, apiKey: string | null): void {
  getPolicyProfile(userId);
  const trimmed = apiKey?.trim() || null;
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE policy_profiles SET tavily_api_key = ?, updated_at = ? WHERE user_id = ?`
  ).run(trimmed, now, userId);
}
