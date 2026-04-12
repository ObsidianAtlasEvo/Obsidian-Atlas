/**
 * evolutionRepository.ts
 *
 * Supabase persistence layer for the Obsidian Atlas evolution system.
 *
 * Tables
 * ──────
 * atlas_evolution_profiles
 *   user_id         TEXT  PRIMARY KEY
 *   profile_data    JSONB  — full UserEvolutionProfile (excluding user_id)
 *   version         INTEGER
 *   confidence      NUMERIC(5,4)
 *   last_mutated_at TIMESTAMPTZ
 *   created_at      TIMESTAMPTZ
 *
 * atlas_evolution_signals
 *   id              UUID   PRIMARY KEY
 *   user_id         TEXT
 *   session_id      TEXT
 *   signal_type     TEXT
 *   payload         JSONB
 *   weight          NUMERIC(4,3)
 *   processed       BOOLEAN DEFAULT FALSE
 *   created_at      TIMESTAMPTZ
 *
 * All Supabase errors are surfaced as thrown Error instances so callers can
 * handle them with normal try/catch patterns.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  CollectedSignalKind,
  EvolutionSignal,
  ProfileStats,
  UserEvolutionProfile,
} from '../types/evolutionTypes.js';

// ---------------------------------------------------------------------------
// Table names — single source of truth
// ---------------------------------------------------------------------------

const TABLE_PROFILES = 'atlas_evolution_profiles' as const;
const TABLE_SIGNALS  = 'atlas_evolution_signals'  as const;

// ---------------------------------------------------------------------------
// DB row types
// ---------------------------------------------------------------------------

type ProfileJson = Omit<
  UserEvolutionProfile,
  'userId' | 'profileVersion' | 'archetypeConfidence' | 'lastUpdated' | 'firstContact'
>;

/** Shape of a row in atlas_evolution_profiles. */
interface ProfileRow {
  user_id: string;
  profile_data: ProfileJson;
  version: number;
  confidence: number;
  last_mutated_at: string | null;
  created_at: string;
}

/** Shape of a row in atlas_evolution_signals. */
interface SignalRow {
  id: string;
  user_id: string;
  session_id: string;
  signal_type: string;
  payload: Record<string, unknown>;
  weight: number;
  processed: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// EvolutionRepository
// ---------------------------------------------------------------------------

export class EvolutionRepository {
  private readonly client: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('[EvolutionRepository] supabaseUrl and supabaseKey are required');
    }
    this.client = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
  }

  // ─── Profiles ─────────────────────────────────────────────────────────────

  /**
   * Fetch the full evolution profile for a user.
   * Returns null when no profile exists yet.
   */
  async getProfile(userId: string): Promise<UserEvolutionProfile | null> {
    const { data, error } = await this.client
      .from(TABLE_PROFILES)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle<ProfileRow>();

    if (error) {
      throw new Error(`[EvolutionRepository.getProfile] ${error.message}`);
    }

    if (!data) return null;

    return rowToProfile(data);
  }

  /**
   * Insert or update a user's evolution profile.
   * Uses Supabase's upsert (ON CONFLICT on user_id).
   */
  async upsertProfile(profile: UserEvolutionProfile): Promise<void> {
    const {
      userId,
      profileVersion,
      archetypeConfidence,
      lastUpdated,
      firstContact,
      ...profileRest
    } = profile;

    const row: ProfileRow = {
      user_id: userId,
      profile_data: profileRest as ProfileJson,
      version: profileVersion,
      confidence: archetypeConfidence,
      last_mutated_at: new Date(lastUpdated).toISOString(),
      created_at: new Date(firstContact).toISOString(),
    };

    const { error } = await this.client
      .from(TABLE_PROFILES)
      .upsert(row, { onConflict: 'user_id' });

    if (error) {
      throw new Error(`[EvolutionRepository.upsertProfile] ${error.message}`);
    }
  }

  // ─── Signals ───────────────────────────────────────────────────────────────

  /**
   * Batch-insert a list of signals.
   * Each signal must have a unique id (UUID) already assigned.
   */
  async saveSignals(signals: EvolutionSignal[]): Promise<void> {
    if (signals.length === 0) return;

    const rows: SignalRow[] = signals.map((s) => ({
      id: s.id,
      user_id: s.userId,
      session_id: s.sessionId,
      signal_type: s.type,
      payload: evolutionSignalToPayload(s),
      weight: s.weight,
      processed: false,
      created_at: s.timestamp.toISOString(),
    }));

    const { error } = await this.client
      .from(TABLE_SIGNALS)
      .insert(rows);

    if (error) {
      throw new Error(`[EvolutionRepository.saveSignals] ${error.message}`);
    }
  }

  /**
   * Return all unprocessed signals for a user, ordered by creation time
   * (oldest first so we process in chronological order).
   */
  async getPendingSignals(userId: string): Promise<EvolutionSignal[]> {
    const { data, error } = await this.client
      .from(TABLE_SIGNALS)
      .select('*')
      .eq('user_id', userId)
      .eq('processed', false)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`[EvolutionRepository.getPendingSignals] ${error.message}`);
    }

    return (data as SignalRow[]).map(rowToSignal);
  }

  /**
   * Mark a batch of signals as processed by their UUIDs.
   * Uses a batch update to minimise round-trips.
   */
  async markSignalsProcessed(signalIds: string[]): Promise<void> {
    if (signalIds.length === 0) return;

    const { error } = await this.client
      .from(TABLE_SIGNALS)
      .update({ processed: true })
      .in('id', signalIds);

    if (error) {
      throw new Error(`[EvolutionRepository.markSignalsProcessed] ${error.message}`);
    }
  }

  // ─── Stats ─────────────────────────────────────────────────────────────────

  /**
   * Return lightweight profile statistics without loading the full JSONB blob.
   * Returns null when no profile exists.
   */
  async getProfileStats(userId: string): Promise<ProfileStats | null> {
    // Fetch top-level columns only (avoids loading large profile_data JSONB).
    const { data: profileRow, error: profileErr } = await this.client
      .from(TABLE_PROFILES)
      .select('version, confidence')
      .eq('user_id', userId)
      .maybeSingle<{ version: number; confidence: number }>();

    if (profileErr) {
      throw new Error(`[EvolutionRepository.getProfileStats] profile lookup: ${profileErr.message}`);
    }

    if (!profileRow) return null;

    // Count total signals (processed + pending) for the user.
    const { count, error: countErr } = await this.client
      .from(TABLE_SIGNALS)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countErr) {
      throw new Error(`[EvolutionRepository.getProfileStats] signal count: ${countErr.message}`);
    }

    return {
      version: profileRow.version,
      confidence: profileRow.confidence,
      totalSignals: count ?? 0,
    };
  }

  // ─── GDPR / data deletion ──────────────────────────────────────────────────

  /**
   * Permanently delete all evolution data for a user (profile + all signals).
   * Satisfies GDPR Article 17 "right to erasure" requirements.
   */
  async deleteUserData(userId: string): Promise<void> {
    // Delete signals first (no FK constraint but keeps things tidy).
    const { error: signalErr } = await this.client
      .from(TABLE_SIGNALS)
      .delete()
      .eq('user_id', userId);

    if (signalErr) {
      throw new Error(
        `[EvolutionRepository.deleteUserData] signals deletion failed: ${signalErr.message}`,
      );
    }

    const { error: profileErr } = await this.client
      .from(TABLE_PROFILES)
      .delete()
      .eq('user_id', userId);

    if (profileErr) {
      throw new Error(
        `[EvolutionRepository.deleteUserData] profile deletion failed: ${profileErr.message}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Row ↔ domain object conversion
// ---------------------------------------------------------------------------

function rowToProfile(row: ProfileRow): UserEvolutionProfile {
  return {
    userId: row.user_id,
    profileVersion: row.version,
    archetypeConfidence: row.confidence,
    lastUpdated: row.last_mutated_at
      ? new Date(row.last_mutated_at).getTime()
      : new Date(row.created_at).getTime(),
    firstContact: new Date(row.created_at).getTime(),
    ...row.profile_data,
  };
}

function evolutionSignalToPayload(s: EvolutionSignal): Record<string, unknown> {
  const core = new Set([
    'id',
    'userId',
    'sessionId',
    'type',
    'timestamp',
    'weight',
    'processed',
    'payload',
  ]);
  const out: Record<string, unknown> = { ...(s.payload ?? {}) };
  for (const [k, v] of Object.entries(s)) {
    if (!core.has(k)) out[k] = v;
  }
  return out;
}

function rowToSignal(row: SignalRow): EvolutionSignal {
  const extra = row.payload ?? {};
  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    type: row.signal_type as CollectedSignalKind,
    timestamp: new Date(row.created_at),
    weight: row.weight,
    processed: row.processed,
    payload: row.payload,
    ...(extra as Partial<EvolutionSignal>),
  };
}
