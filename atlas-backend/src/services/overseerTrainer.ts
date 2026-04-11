// =============================================================================
// Obsidian Atlas — OverseerTrainer
//
// Builds a per-user training profile that makes the Overseer progressively
// smarter for each individual user over time.
//
// Distinction from EvolutionEngine:
//   EvolutionEngine  → tracks WHO the user is (archetype, vocabulary, depth)
//   OverseerTrainer  → tracks WHAT MAKES A GOOD RESPONSE for this user
//
// It accumulates outcome records (did the user keep going? regenerate?
// issue a correction?) and derives adaptive quality thresholds that the
// Overseer uses to decide how aggressively to intervene on each response.
// =============================================================================

import { type EnhancementType } from '../types/evolutionTypes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Public type definitions
// ─────────────────────────────────────────────────────────────────────────────

export interface OverseerTrainingRecord {
  userId: string;
  responseId: string;
  timestamp: number;
  originalQuery: string;
  overseerOutput: string;
  evaluationScores: {
    quality: number;
    depth: number;
    truth: number;
    alignment: number;
  };
  userSignals: {
    /** User clicked regenerate on this response. */
    regenerated: boolean;
    /** The session continued after this response (more turns followed). */
    sessionContinued: boolean;
    /** User asked a follow-up question after this response. */
    followUpAsked: boolean;
    /** User issued a factual or framing correction after this response. */
    correctionIssued: boolean;
    /** User left the session with this response as the last one they saw. */
    sessionEndedAfter: boolean;
  };
  /** 0–1 derived from userSignals. Always recomputed — do not set manually. */
  inferredSatisfaction: number;
  enhancementApplied: EnhancementType;
  /**
   * Approximate 1-based position of this response within the session.
   * Used to distinguish short sessions (< 3 turns) from normal sessions.
   */
  sessionMessageIndex?: number;
}

export interface OverseerTrainingSummary {
  userId: string;
  totalResponses: number;
  avgInferredSatisfaction: number;
  bestPerformingEnhancementType: EnhancementType;
  worstPerformingEnhancementType: EnhancementType;
  /** The depth score that correlates most strongly with session continuation. */
  optimalDepthScore: number;
  optimalQualityThreshold: number;
  regenerationRate: number;
  followUpRate: number;
}

export interface OverseerThresholds {
  /** Below this depth score, always run depth_expansion. */
  minDepthScore: number;
  /** Below this composite quality score, always enhance. */
  minQualityScore: number;
  /** Below this alignment score, always run voice_translation. */
  minAlignmentScore: number;
  /** Below this composite score, force a full_rewrite. */
  forceFullRewriteBelow: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_THRESHOLDS: Readonly<OverseerThresholds> = {
  minDepthScore: 0.4,
  minQualityScore: 0.5,
  minAlignmentScore: 0.5,
  forceFullRewriteBelow: 0.3,
};

/** Minimum records before threshold adaptation kicks in. */
const MIN_RECORDS_FOR_ADAPTATION = 5;

/** Rolling window cap per user. Oldest records are dropped when exceeded. */
const MAX_RECORDS_PER_USER = 500;

/**
 * If a session ended after this many messages or fewer AND sessionEndedAfter
 * is true, apply the short-session satisfaction penalty.
 */
const SHORT_SESSION_THRESHOLD = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Satisfaction computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derives an inferred satisfaction score (0–1) from observable user signals.
 *
 * Baseline: 0.5
 *   +0.3  followUpAsked     — user kept engaging (strong positive)
 *   +0.2  sessionContinued  — session didn't end here
 *   −0.5  regenerated       — explicit dissatisfaction signal
 *   −0.3  correctionIssued  — user found an error or framing problem
 *   −0.4  sessionEndedAfter AND session was short (≤ SHORT_SESSION_THRESHOLD)
 */
function computeInferredSatisfaction(
  record: Omit<OverseerTrainingRecord, 'inferredSatisfaction'>,
): number {
  let score = 0.5;

  if (record.userSignals.followUpAsked) score += 0.3;
  if (record.userSignals.sessionContinued) score += 0.2;
  if (record.userSignals.regenerated) score -= 0.5;
  if (record.userSignals.correctionIssued) score -= 0.3;

  const msgIdx = record.sessionMessageIndex ?? SHORT_SESSION_THRESHOLD + 1;
  if (record.userSignals.sessionEndedAfter && msgIdx <= SHORT_SESSION_THRESHOLD) {
    score -= 0.4;
  }

  return Math.max(0, Math.min(1, score));
}

// ─────────────────────────────────────────────────────────────────────────────
// OverseerTrainer
// ─────────────────────────────────────────────────────────────────────────────

export class OverseerTrainer {
  /** userId → ordered array of training records (chronological, oldest first). */
  private readonly records: Map<string, OverseerTrainingRecord[]> = new Map();

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Record the outcome of a delivered response.
   * The `inferredSatisfaction` field is always recomputed from `userSignals`.
   */
  recordOutcome(record: OverseerTrainingRecord): void {
    const satisfaction = computeInferredSatisfaction(record);
    const final: OverseerTrainingRecord = { ...record, inferredSatisfaction: satisfaction };

    const bucket = this.records.get(record.userId) ?? [];
    bucket.push(final);

    // Enforce rolling window
    if (bucket.length > MAX_RECORDS_PER_USER) {
      bucket.splice(0, bucket.length - MAX_RECORDS_PER_USER);
    }

    this.records.set(record.userId, bucket);
  }

  /**
   * Compute and return a training summary for this user.
   * Returns a neutral default summary if no records exist.
   */
  getTrainingSummary(userId: string): OverseerTrainingSummary {
    const bucket = this.records.get(userId) ?? [];

    if (bucket.length === 0) {
      return {
        userId,
        totalResponses: 0,
        avgInferredSatisfaction: 0.5,
        bestPerformingEnhancementType: 'none',
        worstPerformingEnhancementType: 'full_rewrite',
        optimalDepthScore: 0.6,
        optimalQualityThreshold: DEFAULT_THRESHOLDS.minQualityScore,
        regenerationRate: 0,
        followUpRate: 0,
      };
    }

    const total = bucket.length;
    const avgInferredSatisfaction =
      bucket.reduce((s, r) => s + r.inferredSatisfaction, 0) / total;
    const regenerationRate =
      bucket.filter((r) => r.userSignals.regenerated).length / total;
    const followUpRate =
      bucket.filter((r) => r.userSignals.followUpAsked).length / total;

    // Satisfaction grouped by enhancement type
    const byType = this.groupSatisfactionByType(bucket);
    const sorted = [...byType.entries()].sort(
      ([, a], [, b]) => b.avgSatisfaction - a.avgSatisfaction,
    );

    const bestPerformingEnhancementType: EnhancementType =
      sorted.length > 0 ? (sorted[0][0] as EnhancementType) : 'none';
    const worstPerformingEnhancementType: EnhancementType =
      sorted.length > 0
        ? (sorted[sorted.length - 1][0] as EnhancementType)
        : 'full_rewrite';

    const optimalDepthScore = this.computeOptimalDepthScore(bucket);
    const optimalQualityThreshold = this.computeOptimalQualityThreshold(bucket);

    return {
      userId,
      totalResponses: total,
      avgInferredSatisfaction,
      bestPerformingEnhancementType,
      worstPerformingEnhancementType,
      optimalDepthScore,
      optimalQualityThreshold,
      regenerationRate,
      followUpRate,
    };
  }

  /**
   * Returns adaptive quality thresholds derived from this user's history.
   * Falls back to DEFAULT_THRESHOLDS when insufficient data exists.
   */
  getAdaptedThresholds(userId: string): OverseerThresholds {
    const bucket = this.records.get(userId) ?? [];

    if (bucket.length < MIN_RECORDS_FOR_ADAPTATION) {
      return { ...DEFAULT_THRESHOLDS };
    }

    const summary = this.getTrainingSummary(userId);
    let t: OverseerThresholds = { ...DEFAULT_THRESHOLDS };

    // ── High regeneration rate: raise all thresholds ───────────────────────
    // User is routinely dissatisfied — the Overseer must intervene more often.
    if (summary.regenerationRate > 0.2) {
      const raise = Math.min(0.15, summary.regenerationRate * 0.5);
      t = {
        minDepthScore: Math.min(0.8, t.minDepthScore + raise),
        minQualityScore: Math.min(0.85, t.minQualityScore + raise),
        minAlignmentScore: Math.min(0.8, t.minAlignmentScore + raise),
        forceFullRewriteBelow: Math.min(0.5, t.forceFullRewriteBelow + raise),
      };
    }

    // ── Depth expansion tolerance ──────────────────────────────────────────
    // If the user consistently continues sessions after depth_expansion passes,
    // they accept moderate depth — lower the trigger threshold slightly so we
    // don't over-expand responses that are already good enough.
    const depthExpanded = bucket.filter(
      (r) => r.enhancementApplied === 'depth_expansion',
    );
    if (depthExpanded.length >= 3) {
      const continuationRate =
        depthExpanded.filter((r) => r.userSignals.sessionContinued).length /
        depthExpanded.length;

      if (continuationRate > 0.7) {
        t.minDepthScore = Math.max(0.2, t.minDepthScore - 0.1);
      }
    }

    // ── Align to empirically optimal depth ────────────────────────────────
    // Pull minDepthScore toward the depth band that actually produces
    // continuation — but never raise it above what regeneration already set.
    if (summary.optimalDepthScore > 0) {
      const target = Math.max(0.2, summary.optimalDepthScore - 0.15);
      if (target < t.minDepthScore) {
        t.minDepthScore = target;
      }
    }

    // ── High follow-up rate: relax thresholds slightly ────────────────────
    // User is engaged and not regenerating — the Overseer can be less aggressive.
    if (summary.followUpRate > 0.5 && summary.regenerationRate < 0.1) {
      const relax = 0.05;
      t = {
        minDepthScore: Math.max(0.2, t.minDepthScore - relax),
        minQualityScore: Math.max(0.3, t.minQualityScore - relax),
        minAlignmentScore: Math.max(0.3, t.minAlignmentScore - relax),
        forceFullRewriteBelow: Math.max(0.15, t.forceFullRewriteBelow - relax),
      };
    }

    return t;
  }

  // ─── Persistence ─────────────────────────────────────────────────────────

  /**
   * Upsert all in-memory training records for a user into Supabase.
   * Uses `Prefer: resolution=merge-duplicates` to avoid duplicate rows.
   * Supabase table must have a unique constraint on (user_id, response_id).
   */
  async save(userId: string, supabaseUrl: string, supabaseKey: string): Promise<void> {
    const bucket = this.records.get(userId) ?? [];
    if (bucket.length === 0) return;

    const url = `${supabaseUrl}/rest/v1/overseer_training_records`;

    const rows = bucket.map((r) => ({
      user_id: r.userId,
      response_id: r.responseId,
      timestamp: r.timestamp,
      original_query: r.originalQuery,
      overseer_output: r.overseerOutput,
      evaluation_scores: r.evaluationScores,
      user_signals: r.userSignals,
      inferred_satisfaction: r.inferredSatisfaction,
      enhancement_applied: r.enhancementApplied,
      session_message_index: r.sessionMessageIndex ?? null,
    }));

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => 'unknown');
      throw new Error(`[OverseerTrainer] Supabase save error ${res.status}: ${err}`);
    }
  }

  /**
   * Load all training records for a user from Supabase, replacing any
   * existing in-memory records for that user.
   */
  async load(userId: string, supabaseUrl: string, supabaseKey: string): Promise<void> {
    const url =
      `${supabaseUrl}/rest/v1/overseer_training_records` +
      `?user_id=eq.${encodeURIComponent(userId)}` +
      `&order=timestamp.asc` +
      `&limit=${MAX_RECORDS_PER_USER}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    if (!res.ok) {
      const err = await res.text().catch(() => 'unknown');
      throw new Error(`[OverseerTrainer] Supabase load error ${res.status}: ${err}`);
    }

    interface RawRow {
      user_id: string;
      response_id: string;
      timestamp: number;
      original_query: string;
      overseer_output: string;
      evaluation_scores: OverseerTrainingRecord['evaluationScores'];
      user_signals: OverseerTrainingRecord['userSignals'];
      inferred_satisfaction: number;
      enhancement_applied: EnhancementType;
      session_message_index: number | null;
    }

    const rows = (await res.json()) as RawRow[];

    this.records.set(
      userId,
      rows.map((row) => ({
        userId: row.user_id,
        responseId: row.response_id,
        timestamp: row.timestamp,
        originalQuery: row.original_query,
        overseerOutput: row.overseer_output,
        evaluationScores: row.evaluation_scores,
        userSignals: row.user_signals,
        inferredSatisfaction: row.inferred_satisfaction,
        enhancementApplied: row.enhancement_applied,
        sessionMessageIndex: row.session_message_index ?? undefined,
      })),
    );
  }

  // ─── Analytics helpers ────────────────────────────────────────────────────

  private groupSatisfactionByType(
    records: OverseerTrainingRecord[],
  ): Map<EnhancementType, { avgSatisfaction: number; count: number }> {
    const groups = new Map<EnhancementType, number[]>();

    for (const r of records) {
      const arr = groups.get(r.enhancementApplied) ?? [];
      arr.push(r.inferredSatisfaction);
      groups.set(r.enhancementApplied, arr);
    }

    const out = new Map<EnhancementType, { avgSatisfaction: number; count: number }>();
    for (const [type, scores] of groups) {
      const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
      out.set(type, { avgSatisfaction: avg, count: scores.length });
    }
    return out;
  }

  /**
   * Find the depth score band (0.1-wide buckets) that correlates most
   * strongly with session continuation. Returns the bucket midpoint.
   */
  private computeOptimalDepthScore(records: OverseerTrainingRecord[]): number {
    const relevant = records.filter(
      (r) => r.userSignals.sessionContinued || r.userSignals.sessionEndedAfter,
    );
    if (relevant.length < 5) return 0.6;

    const buckets = new Map<number, { continued: number; total: number }>();

    for (const r of relevant) {
      const key = Math.floor(r.evaluationScores.depth * 10) / 10;
      const entry = buckets.get(key) ?? { continued: 0, total: 0 };
      entry.total++;
      if (r.userSignals.sessionContinued) entry.continued++;
      buckets.set(key, entry);
    }

    let bestKey = 0.6;
    let bestRate = -1;

    for (const [key, { continued, total }] of buckets) {
      if (total < 2) continue;
      const rate = continued / total;
      if (rate > bestRate) {
        bestRate = rate;
        bestKey = key;
      }
    }

    return Math.max(0.2, Math.min(0.9, bestKey));
  }

  /**
   * Returns the 25th-percentile quality score among records where the user
   * continued the session and did not regenerate. This is the minimum quality
   * that still reliably produced positive engagement.
   */
  private computeOptimalQualityThreshold(records: OverseerTrainingRecord[]): number {
    const positives = records.filter(
      (r) => r.userSignals.sessionContinued && !r.userSignals.regenerated,
    );
    if (positives.length < 5) return DEFAULT_THRESHOLDS.minQualityScore;

    const sorted = positives
      .map((r) => r.evaluationScores.quality)
      .sort((a, b) => a - b);

    const p25 = sorted[Math.floor(sorted.length * 0.25)] ?? DEFAULT_THRESHOLDS.minQualityScore;
    return Math.max(0.2, p25);
  }
}
