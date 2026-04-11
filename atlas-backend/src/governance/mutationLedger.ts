// ─────────────────────────────────────────────────────────────────────────────
// Atlas Governance Layer — Mutation Ledger
// Append-only record of all mutations: approved, rejected, and rolled back.
// Enables rollback, audit, and regression detection.
// ─────────────────────────────────────────────────────────────────────────────

import type { MutationRecord, ProposedMutation } from './mutationConstitution.js';

// Re-export so callers can import everything from this module if needed
export type { MutationRecord, ProposedMutation };

// ─────────────────────────────────────────────────────────────────────────────
// Supabase thin-client types (no external SDK — raw fetch only)
// ─────────────────────────────────────────────────────────────────────────────

interface SupabaseRow {
  id: string;
  user_id: string;
  record: string;   // JSON-serialised MutationRecord
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function nowMs(): number {
  return Date.now();
}

function generateId(): string {
  return `ledger_${nowMs()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Shallow merge of two records, used when re-writing a rolled-back entry.
 */
function patchRecord(original: MutationRecord, patch: Partial<MutationRecord>): MutationRecord {
  return { ...original, ...patch };
}

// ─────────────────────────────────────────────────────────────────────────────
// MutationLedger
// ─────────────────────────────────────────────────────────────────────────────

export class MutationLedger {
  /** In-memory store: userId → ordered list of MutationRecords (oldest first). */
  private records: Map<string, MutationRecord[]> = new Map();

  private supabaseUrl: string;
  private supabaseKey: string;

  /** Table name on Supabase. */
  private readonly TABLE = 'atlas_mutation_ledger';

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabaseUrl = supabaseUrl.replace(/\/$/, ''); // strip trailing slash
    this.supabaseKey = supabaseKey;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private userRecords(userId: string): MutationRecord[] {
    if (!this.records.has(userId)) {
      this.records.set(userId, []);
    }
    return this.records.get(userId)!;
  }

  private findRecord(userId: string, mutationId: string): MutationRecord | undefined {
    return this.userRecords(userId).find((r) => r.id === mutationId);
  }

  /**
   * Build the Supabase REST endpoint URL for the ledger table.
   */
  private endpoint(params?: string): string {
    const base = `${this.supabaseUrl}/rest/v1/${this.TABLE}`;
    return params ? `${base}?${params}` : base;
  }

  /**
   * Common headers for Supabase REST requests.
   */
  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'apikey': this.supabaseKey,
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Prefer': 'return=representation',
      ...extra,
    };
  }

  // ─── Core append ────────────────────────────────────────────────────────────

  /**
   * Append a new mutation record to the in-memory ledger and persist it to
   * Supabase. The ledger is append-only: existing records are never modified
   * in place; rollbacks append a new record that references the original.
   */
  async commit(record: MutationRecord): Promise<void> {
    const list = this.userRecords(record.userId);

    // Prevent duplicate IDs (idempotent commit)
    if (list.some((r) => r.id === record.id)) {
      return;
    }

    list.push(record);

    // Persist to Supabase
    await this.persistRow(record);
  }

  // ─── Rollback ───────────────────────────────────────────────────────────────

  /**
   * Roll back a specific mutation by ID.
   *
   * - Marks the original record as `rolled_back` in memory.
   * - Appends a new `rolled_back` record that carries the original `currentValue`
   *   as `proposedValue` so the evolution engine can restore state.
   * - Returns a synthetic ProposedMutation representing the restoration.
   */
  async rollback(
    mutationId: string,
    userId: string,
    reason: string,
  ): Promise<ProposedMutation> {
    const original = this.findRecord(userId, mutationId);
    if (!original) {
      throw new Error(`MutationLedger.rollback: record "${mutationId}" not found for user "${userId}".`);
    }

    if (original.status === 'rolled_back') {
      throw new Error(`MutationLedger.rollback: record "${mutationId}" is already rolled back.`);
    }

    const now = nowMs();

    // Patch the original record in memory
    const patched = patchRecord(original, {
      status: 'rolled_back',
      rolledBackAt: now,
      rollbackReason: reason,
    });

    const list = this.userRecords(userId);
    const idx = list.findIndex((r) => r.id === mutationId);
    if (idx !== -1) list[idx] = patched;

    // Build the restoration ProposedMutation (inverts current ↔ proposed)
    const restoration: ProposedMutation = {
      id: generateId(),
      userId,
      targetField: original.mutation.targetField,
      currentValue: original.mutation.proposedValue,     // what was committed
      proposedValue: original.mutation.currentValue,     // what we're restoring
      source: `rollback:${mutationId}`,
      confidence: 1,                                     // rollback is authoritative
      proposedAt: now,
    };

    // Append a rollback record to the ledger
    const rollbackRecord: MutationRecord = {
      id: restoration.id,
      userId,
      mutation: restoration,
      validation: {
        approved: true,
        zone: original.validation.zone,
        violations: [],
        requiresElevation: false,
      },
      status: 'rolled_back',
      committedAt: now,
      rolledBackAt: now,
      rollbackReason: reason,
      degraded: false,
    };

    list.push(rollbackRecord);

    // Persist both the patched original and the new rollback record
    await Promise.all([
      this.persistRow(patched),
      this.persistRow(rollbackRecord),
    ]);

    return restoration;
  }

  /**
   * Roll back all approved mutations for a user since a given timestamp.
   * Mutations are rolled back in reverse chronological order (newest first).
   * Returns the set of MutationRecords that were rolled back.
   */
  async rollbackSince(
    userId: string,
    sinceTimestamp: number,
    reason: string,
  ): Promise<MutationRecord[]> {
    const list = this.userRecords(userId);

    // Identify eligible mutations: approved, committed after sinceTimestamp, not yet rolled back
    const eligible = list
      .filter(
        (r) =>
          r.status === 'approved' &&
          r.committedAt !== undefined &&
          r.committedAt >= sinceTimestamp,
      )
      .sort((a, b) => (b.committedAt ?? 0) - (a.committedAt ?? 0)); // newest first

    const rolled: MutationRecord[] = [];

    for (const record of eligible) {
      await this.rollback(record.id, userId, reason);
      rolled.push(record);
    }

    return rolled;
  }

  // ─── Quality / quarantine ───────────────────────────────────────────────────

  /**
   * Return all approved mutations where output quality dropped by more than 0.1
   * after the mutation was committed (i.e. `degraded: true`).
   */
  getDegradedMutations(userId: string): MutationRecord[] {
    return this.userRecords(userId).filter(
      (r) => r.status === 'approved' && r.degraded === true,
    );
  }

  /**
   * Return true if the last 3 committed mutations for the user all degraded
   * output quality. When true, the EvolutionEngine should skip the next cycle.
   *
   * A mutation is considered degraded when:
   *   outputQualityAfter < outputQualityBefore - 0.1
   *
   * This check ignores rollback records and looks only at approved commits.
   */
  shouldQuarantine(userId: string): boolean {
    const committed = this.userRecords(userId)
      .filter((r) => r.status === 'approved' && r.committedAt !== undefined)
      .sort((a, b) => (b.committedAt ?? 0) - (a.committedAt ?? 0)); // newest first

    if (committed.length < 3) return false;

    const lastThree = committed.slice(0, 3);
    return lastThree.every((r) => {
      if (
        typeof r.outputQualityBefore === 'number' &&
        typeof r.outputQualityAfter === 'number'
      ) {
        return r.outputQualityAfter < r.outputQualityBefore - 0.1;
      }
      // If scores are absent, fall back to the `degraded` flag
      return r.degraded === true;
    });
  }

  // ─── Audit ──────────────────────────────────────────────────────────────────

  /**
   * Return the full chronological audit trail for a user.
   */
  getAuditTrail(userId: string): MutationRecord[] {
    return [...this.userRecords(userId)].sort(
      (a, b) => (a.committedAt ?? a.mutation.proposedAt) - (b.committedAt ?? b.mutation.proposedAt),
    );
  }

  // ─── Persistence (Supabase) ─────────────────────────────────────────────────

  /**
   * Load all records for a user from Supabase into the in-memory store.
   * Existing in-memory records are replaced.
   */
  async load(userId: string): Promise<void> {
    const url = this.endpoint(`user_id=eq.${encodeURIComponent(userId)}&order=created_at.asc`);

    const response = await fetch(url, {
      method: 'GET',
      headers: this.headers({ 'Prefer': 'return=representation' }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `MutationLedger.load: Supabase GET failed [${response.status}]: ${body}`,
      );
    }

    const rows: SupabaseRow[] = await response.json();
    const parsed: MutationRecord[] = rows.map((row) => JSON.parse(row.record) as MutationRecord);

    this.records.set(userId, parsed);
  }

  /**
   * Upsert all in-memory records for a user to Supabase.
   * Uses Supabase's `on_conflict` upsert to avoid duplicates.
   */
  async save(userId: string): Promise<void> {
    const list = this.userRecords(userId);
    if (list.length === 0) return;

    const rows: Omit<SupabaseRow, 'created_at'>[] = list.map((record) => ({
      id: record.id,
      user_id: userId,
      record: JSON.stringify(record),
    }));

    const url = this.endpoint();
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers({ 'Prefer': 'resolution=merge-duplicates' }),
      body: JSON.stringify(rows),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `MutationLedger.save: Supabase POST failed [${response.status}]: ${body}`,
      );
    }
  }

  /**
   * Persist a single record row to Supabase (upsert).
   * Called internally by commit() and rollback().
   */
  private async persistRow(record: MutationRecord): Promise<void> {
    const row: Omit<SupabaseRow, 'created_at'> = {
      id: record.id,
      user_id: record.userId,
      record: JSON.stringify(record),
    };

    const url = this.endpoint();
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers({ 'Prefer': 'resolution=merge-duplicates' }),
      body: JSON.stringify(row),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `MutationLedger.persistRow: Supabase upsert failed [${response.status}]: ${body}`,
      );
    }
  }
}
