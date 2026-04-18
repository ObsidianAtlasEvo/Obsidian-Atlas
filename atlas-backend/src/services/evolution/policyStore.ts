import { getDb } from '../../db/sqlite.js';
import type { PolicyProfile } from '../../types/atlas.js';

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

export interface ActiveFeatureFlag {
  feature: string;
  confidence: number;
  recommended_at: string;
  expires_at: string | null;
}

/**
 * Returns all non-expired feature flags with confidence > 0 for a user.
 * Reads from user_feature_recommendations (written by evolveFeatureFlags).
 */
export function getActiveFeatureFlags(userId: string): ActiveFeatureFlag[] {
  const db = getDb();
  try {
    const rows = db
      .prepare(
        `SELECT feature, confidence, recommended_at, expires_at
         FROM user_feature_recommendations
         WHERE user_id = ?
           AND (expires_at IS NULL OR expires_at > datetime('now'))
           AND (confidence IS NULL OR confidence > 0)
         ORDER BY confidence DESC, recommended_at DESC`
      )
      .all(userId) as Array<{
        feature: string;
        confidence: number | null;
        recommended_at: string;
        expires_at: string | null;
      }>;
    return rows.map((r) => ({
      feature: r.feature,
      confidence: r.confidence ?? 1.0,
      recommended_at: r.recommended_at,
      expires_at: r.expires_at,
    }));
  } catch {
    // Table may not exist yet on first run before migration
    return [];
  }
}

// ---------------------------------------------------------------------------
// IMPORTANT: These are structural fallback defaults only.
// They are NOT learned preferences. They must NEVER be presented to the LLM
// as user-stated or user-derived settings.
// A new user's profile is "unlearned" until explicit signals update it.
// Use profile.isLearned to gate whether policy values are passed to the LLM.
// ---------------------------------------------------------------------------
export const DEFAULT_POLICY_PROFILE_VALUES: Omit<PolicyProfile, 'userId' | 'updatedAt'> = {
  verbosity: 'medium',
  tone: 'analytical',
  structurePreference: 'balanced',
  truthFirstStrictness: 0.72,
  writingStyleEnabled: false,
  preferredComputeDepth: 'Light',
  latencyTolerance: 'Low',
  isLearned: false,
};

function rowToProfile(
  userId: string,
  row: {
    verbosity: string;
    tone: string;
    structure_preference: string;
    truth_first_strictness: number;
    writing_style_enabled: number;
    preferred_compute_depth?: string | null;
    latency_tolerance?: string | null;
    updated_at: string;
    is_learned?: number | null;
  }
): PolicyProfile {
  const depthRaw = row.preferred_compute_depth ?? 'Light';
  const latRaw = row.latency_tolerance ?? 'Low';
  return {
    userId,
    verbosity: row.verbosity as PolicyProfile['verbosity'],
    tone: row.tone as PolicyProfile['tone'],
    structurePreference: row.structure_preference as PolicyProfile['structurePreference'],
    truthFirstStrictness: row.truth_first_strictness,
    writingStyleEnabled: Boolean(row.writing_style_enabled),
    preferredComputeDepth: depthRaw === 'Heavy' ? 'Heavy' : 'Light',
    latencyTolerance: latRaw === 'High' ? 'High' : 'Low',
    updatedAt: row.updated_at,
    isLearned: Boolean(row.is_learned),
  };
}

export function getPolicyProfile(userId: string): PolicyProfile {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT verbosity, tone, structure_preference, truth_first_strictness, writing_style_enabled,
              preferred_compute_depth, latency_tolerance, updated_at,
              COALESCE(is_learned, 0) as is_learned
       FROM policy_profiles WHERE user_id = ?`
    )
    .get(userId) as
    | {
        verbosity: string;
        tone: string;
        structure_preference: string;
        truth_first_strictness: number;
        writing_style_enabled: number;
        preferred_compute_depth?: string | null;
        latency_tolerance?: string | null;
        updated_at: string;
        is_learned?: number | null;
      }
    | undefined;

  const now = new Date().toISOString();
  if (!row) {
    db.prepare(
      `INSERT INTO policy_profiles (
         user_id, verbosity, tone, structure_preference, truth_first_strictness, writing_style_enabled,
         preferred_compute_depth, latency_tolerance, updated_at, is_learned
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    ).run(
      userId,
      DEFAULT_POLICY_PROFILE_VALUES.verbosity,
      DEFAULT_POLICY_PROFILE_VALUES.tone,
      DEFAULT_POLICY_PROFILE_VALUES.structurePreference,
      DEFAULT_POLICY_PROFILE_VALUES.truthFirstStrictness,
      DEFAULT_POLICY_PROFILE_VALUES.writingStyleEnabled ? 1 : 0,
      DEFAULT_POLICY_PROFILE_VALUES.preferredComputeDepth,
      DEFAULT_POLICY_PROFILE_VALUES.latencyTolerance,
      now
    );
    return { userId, ...DEFAULT_POLICY_PROFILE_VALUES, updatedAt: now };
  }

  return rowToProfile(userId, row);
}

export function updatePolicyProfile(
  userId: string,
  patch: Partial<
    Pick<
      PolicyProfile,
      | 'verbosity'
      | 'tone'
      | 'structurePreference'
      | 'truthFirstStrictness'
      | 'writingStyleEnabled'
      | 'preferredComputeDepth'
      | 'latencyTolerance'
    >
  >
): PolicyProfile {
  const current = getPolicyProfile(userId);
  const next: PolicyProfile = {
    ...current,
    ...patch,
    userId,
    updatedAt: new Date().toISOString(),
    isLearned: true,  // Any explicit update marks the profile as learned
  };

  const db = getDb();
  db.prepare(
    `UPDATE policy_profiles SET
      verbosity = ?, tone = ?, structure_preference = ?, truth_first_strictness = ?,
      writing_style_enabled = ?, preferred_compute_depth = ?, latency_tolerance = ?, updated_at = ?,
      is_learned = 1
     WHERE user_id = ?`
  ).run(
    next.verbosity,
    next.tone,
    next.structurePreference,
    next.truthFirstStrictness,
    next.writingStyleEnabled ? 1 : 0,
    next.preferredComputeDepth,
    next.latencyTolerance,
    next.updatedAt,
    userId
  );

  return next;
}

/**
 * Lightweight sovereign policy updates from explicit user corrections (no LLM).
 */
export function applyExplicitPolicyCorrections(userId: string, userMessage: string): PolicyProfile | null {
  const current = getPolicyProfile(userId);
  const lower = userMessage.toLowerCase();
  const patch: Partial<
    Pick<
      PolicyProfile,
      | 'verbosity'
      | 'tone'
      | 'structurePreference'
      | 'truthFirstStrictness'
      | 'writingStyleEnabled'
      | 'preferredComputeDepth'
      | 'latencyTolerance'
    >
  > = {};

  if (/\b(be more concise|shorter answers|less verbose|keep it brief|too long)\b/i.test(lower)) {
    patch.verbosity = 'low';
  }
  if (/\b(more detail|longer explanation|go deeper|elaborate)\b/i.test(lower)) {
    patch.verbosity = 'high';
  }
  if (/\b(stop using bullet|no bullets|prose only|paragraph form|no bullet points)\b/i.test(lower)) {
    patch.structurePreference = 'minimal';
  }
  if (/\b(use bullets|bullet points|numbered list)\b/i.test(lower)) {
    patch.structurePreference = 'structured';
  }
  if (/\b(be warmer|friendlier tone)\b/i.test(lower)) {
    patch.tone = 'warm';
  }
  if (/\b(be more direct|blunt|straight to the point)\b/i.test(lower)) {
    patch.tone = 'direct';
  }
  if (/\b(stricter truth|more rigorous|hold higher bar)\b/i.test(lower)) {
    patch.truthFirstStrictness = Math.min(1, current.truthFirstStrictness + 0.08);
  }
  if (/\b(relax|less pedantic|softer standards)\b/i.test(lower)) {
    patch.truthFirstStrictness = Math.max(0, current.truthFirstStrictness - 0.08);
  }
  if (/\b(take your time|quality over speed|no rush|deeper analysis)\b/i.test(lower)) {
    patch.latencyTolerance = 'High';
    patch.preferredComputeDepth = 'Heavy';
  }
  if (/\b(respond instantly|as fast as possible|speed matters|low latency)\b/i.test(lower)) {
    patch.latencyTolerance = 'Low';
    patch.preferredComputeDepth = 'Light';
  }

  if (Object.keys(patch).length === 0) {
    return null;
  }

  return updatePolicyProfile(userId, patch);
}
