import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UncertaintyType =
  | 'factual_gap'            // Atlas doesn't know something
  | 'model_disagreement'     // models gave conflicting answers
  | 'temporal_gap'           // information may be outdated
  | 'user_specific_unknown'  // unknown specific to this user's situation
  | 'inferential_leap'       // Atlas made a deductive jump
  | 'definitional_ambiguity'; // key term is undefined or context-dependent

export interface UncertaintyRecord {
  id: string;
  userId: string;
  domain: string;
  topic: string;
  uncertaintyType: UncertaintyType;
  magnitude: number;         // 0-1, how uncertain
  firstEncountered: number;
  lastEncountered: number;
  acknowledged: boolean;     // has Atlas explicitly told the user about this uncertainty?
  resolved: boolean;
  resolution?: string;
}

// ---------------------------------------------------------------------------
// Disclosure Templates
// ---------------------------------------------------------------------------

/** Human-readable labels for each uncertainty type. */
const TYPE_LABELS: Record<UncertaintyType, string> = {
  factual_gap: 'Knowledge gap',
  model_disagreement: 'Conflicting model outputs',
  temporal_gap: 'Potentially outdated information',
  user_specific_unknown: 'User-context unknown',
  inferential_leap: 'Inferential jump',
  definitional_ambiguity: 'Definitional ambiguity',
};

/** Short advisory phrases for each uncertainty type. */
const TYPE_ADVISORIES: Record<UncertaintyType, string> = {
  factual_gap: 'I lack reliable information on this — verify independently.',
  model_disagreement:
    'Different reasoning paths produced conflicting answers. Treat with caution.',
  temporal_gap:
    'My information may be outdated. Check a current source before acting on this.',
  user_specific_unknown:
    "I'm missing context specific to your situation that could change this answer.",
  inferential_leap:
    'This conclusion involves a deductive step that may not hold universally.',
  definitional_ambiguity:
    'The key terms here are context-dependent — define them precisely before proceeding.',
};

// ---------------------------------------------------------------------------
// Magnitude thresholds
// ---------------------------------------------------------------------------

/** Magnitude above which an uncertainty is considered "high". */
const HIGH_MAGNITUDE_THRESHOLD = 0.65;

/** Number of high-magnitude unresolved uncertainties that triggers high-uncertainty state. */
const HIGH_UNCERTAINTY_COUNT_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// UncertaintyTracker Class
// ---------------------------------------------------------------------------

export class UncertaintyTracker {
  /**
   * In-memory store. Keyed by uncertainty ID.
   * Populated from Supabase on load(); persisted on save().
   */
  private records: Map<string, UncertaintyRecord> = new Map();

  /**
   * Log a new uncertainty. If a very similar one (same userId + topic + type)
   * already exists and is unresolved, we update lastEncountered and
   * bump magnitude instead of creating a duplicate.
   */
  record(record: Omit<UncertaintyRecord, 'id'>): UncertaintyRecord {
    const now = Date.now();

    // Deduplication: look for matching unresolved record
    const existing = this.findExisting(record.userId, record.topic, record.uncertaintyType);

    if (existing) {
      // Update in place: bump lastEncountered, escalate magnitude slightly
      existing.lastEncountered = now;
      existing.magnitude = Math.min(1, existing.magnitude + 0.05);
      // If not yet acknowledged, keep it flagged for disclosure
      this.records.set(existing.id, existing);
      return existing;
    }

    const newRecord: UncertaintyRecord = {
      ...record,
      id: randomUUID(),
      firstEncountered: record.firstEncountered ?? now,
      lastEncountered: record.lastEncountered ?? now,
    };

    this.records.set(newRecord.id, newRecord);
    return newRecord;
  }

  /**
   * Get all active (unresolved) uncertainties for a user,
   * sorted by magnitude descending.
   */
  getActive(userId: string): UncertaintyRecord[] {
    return [...this.records.values()]
      .filter((r) => r.userId === userId && !r.resolved)
      .sort((a, b) => b.magnitude - a.magnitude);
  }

  /**
   * Returns true if the user currently has more than
   * HIGH_UNCERTAINTY_COUNT_THRESHOLD unresolved high-magnitude uncertainties.
   */
  isHighUncertaintyState(userId: string): boolean {
    const active = this.getActive(userId);
    const highMagnitudeCount = active.filter(
      (r) => r.magnitude >= HIGH_MAGNITUDE_THRESHOLD
    ).length;
    return highMagnitudeCount > HIGH_UNCERTAINTY_COUNT_THRESHOLD;
  }

  /**
   * Generate a natural-language uncertainty disclosure for injection into responses.
   * Formats a concise section that can be prepended or appended to an Atlas response.
   */
  buildUncertaintyDisclosure(uncertainties: UncertaintyRecord[]): string {
    const active = uncertainties.filter((u) => !u.resolved);

    if (active.length === 0) {
      return '';
    }

    const lines: string[] = [];

    // Severity tier: separate critical from moderate
    const critical = active.filter((u) => u.magnitude >= 0.8);
    const notable = active.filter((u) => u.magnitude >= HIGH_MAGNITUDE_THRESHOLD && u.magnitude < 0.8);
    const minor = active.filter((u) => u.magnitude < HIGH_MAGNITUDE_THRESHOLD);

    if (critical.length > 0) {
      lines.push('⚠ HIGH UNCERTAINTY — review before acting:');
      for (const u of critical) {
        lines.push(
          `  • [${TYPE_LABELS[u.uncertaintyType]}] ${u.topic}: ${TYPE_ADVISORIES[u.uncertaintyType]}`
        );
      }
    }

    if (notable.length > 0) {
      lines.push('Notable uncertainties in this response:');
      for (const u of notable) {
        lines.push(
          `  • [${TYPE_LABELS[u.uncertaintyType]}] ${u.topic}: ${TYPE_ADVISORIES[u.uncertaintyType]}`
        );
      }
    }

    if (minor.length > 0 && active.length <= 5) {
      // Only list minor uncertainties if total list is short
      lines.push('Minor uncertainties:');
      for (const u of minor) {
        lines.push(
          `  • [${TYPE_LABELS[u.uncertaintyType]}] ${u.topic}`
        );
      }
    } else if (minor.length > 0) {
      lines.push(`Plus ${minor.length} lower-magnitude uncertainty item(s) not listed.`);
    }

    // Summarise if many uncertainties
    if (active.length > 5) {
      lines.push(
        `(${active.length} total active uncertainties — showing highest magnitude first.)`
      );
    }

    return lines.join('\n');
  }

  /**
   * Mark an uncertainty as resolved, optionally recording the resolution.
   * No-ops silently if the ID is not found.
   */
  resolve(uncertaintyId: string, resolution: string): void {
    const record = this.records.get(uncertaintyId);
    if (!record) return;

    record.resolved = true;
    record.resolution = resolution;
    this.records.set(uncertaintyId, record);
  }

  /**
   * Mark a set of uncertainties as acknowledged (Atlas has disclosed them to the user).
   * Useful for preventing repetitive disclosures within a session.
   */
  markAcknowledged(uncertaintyIds: string[]): void {
    for (const id of uncertaintyIds) {
      const record = this.records.get(id);
      if (record) {
        record.acknowledged = true;
        this.records.set(id, record);
      }
    }
  }

  /**
   * Return unacknowledged active uncertainties for a user.
   * Used to decide whether a disclosure is needed.
   */
  getUnacknowledged(userId: string): UncertaintyRecord[] {
    return this.getActive(userId).filter((r) => !r.acknowledged);
  }

  /**
   * Prune stale resolved records older than `maxAgeMs` to prevent unbounded growth.
   * Defaults to 90 days.
   */
  prune(userId: string, maxAgeMs: number = 90 * 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    let pruned = 0;

    for (const [id, record] of this.records) {
      if (
        record.userId === userId &&
        record.resolved &&
        record.lastEncountered < cutoff
      ) {
        this.records.delete(id);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Persist uncertainty records for a user to Supabase table: atlas_uncertainty_records
   */
  async save(userId: string, supabaseUrl: string, supabaseKey: string): Promise<void> {
    const client = createClient(supabaseUrl, supabaseKey);

    const userRecords = [...this.records.values()].filter((r) => r.userId === userId);

    if (userRecords.length === 0) return;

    const rows = userRecords.map((r) => ({
      id: r.id,
      user_id: r.userId,
      domain: r.domain,
      topic: r.topic,
      uncertainty_type: r.uncertaintyType,
      magnitude: r.magnitude,
      first_encountered: new Date(r.firstEncountered).toISOString(),
      last_encountered: new Date(r.lastEncountered).toISOString(),
      acknowledged: r.acknowledged,
      resolved: r.resolved,
      resolution: r.resolution ?? null,
    }));

    const { error } = await client
      .from('atlas_uncertainty_records')
      .upsert(rows, { onConflict: 'id' });

    if (error) {
      throw new Error(`UncertaintyTracker.save failed: ${error.message}`);
    }
  }

  /**
   * Load uncertainty records for a user from Supabase table: atlas_uncertainty_records
   */
  async load(userId: string, supabaseUrl: string, supabaseKey: string): Promise<void> {
    const client = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await client
      .from('atlas_uncertainty_records')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw new Error(`UncertaintyTracker.load failed: ${error.message}`);
    }

    if (!data) return;

    for (const row of data) {
      try {
        const record: UncertaintyRecord = {
          id: row.id,
          userId: row.user_id,
          domain: row.domain,
          topic: row.topic,
          uncertaintyType: row.uncertainty_type as UncertaintyType,
          magnitude: row.magnitude,
          firstEncountered: new Date(row.first_encountered).getTime(),
          lastEncountered: new Date(row.last_encountered).getTime(),
          acknowledged: row.acknowledged,
          resolved: row.resolved,
          resolution: row.resolution ?? undefined,
        };
        this.records.set(record.id, record);
      } catch {
        console.warn(`UncertaintyTracker.load: skipped malformed row ${row.id}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private findExisting(
    userId: string,
    topic: string,
    type: UncertaintyType
  ): UncertaintyRecord | undefined {
    const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const normTopic = normalise(topic);

    for (const record of this.records.values()) {
      if (
        record.userId === userId &&
        record.uncertaintyType === type &&
        !record.resolved &&
        normalise(record.topic) === normTopic
      ) {
        return record;
      }
    }
    return undefined;
  }
}
