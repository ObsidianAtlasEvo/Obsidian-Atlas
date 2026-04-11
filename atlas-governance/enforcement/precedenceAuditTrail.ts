/**
 * Precedence Audit Trail
 * Phase 4 Governance — Section 1: Policy Precedence Engine
 *
 * Append-only audit trail for all policy enforcement decisions.
 * Writes to the Supabase `atlas_mutation_ledger` table when a client is
 * available; otherwise falls back to an in-memory ledger (matching the
 * project's existing governance pattern).
 *
 * Environment variables (when Supabase is configured):
 *   SUPABASE_URL — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role key
 */

import { PolicyLayer } from './precedenceConflictResolver.ts';

// ── Types ───────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id?: string;
  mutationId: string;
  layer: PolicyLayer;
  action: string;
  actorId: string;
  allowed: boolean;
  reason: string;
  appliedLayer: PolicyLayer;
  timestamp: Date;
}

export interface AuditFilter {
  actorId?: string;
  layer?: PolicyLayer;
  allowed?: boolean;
  from?: Date;
  to?: Date;
  limit?: number;
}

// ── Supabase client (lazy, optional) ────────────────────────────────────────

interface SupabaseClient {
  from(table: string): {
    insert(row: Record<string, unknown>): { select(cols: string): { single(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> } };
    select(cols: string): {
      eq(col: string, val: unknown): SupabaseQuery;
      gte(col: string, val: string): SupabaseQuery;
      lte(col: string, val: string): SupabaseQuery;
      limit(n: number): SupabaseQuery;
      order(col: string, opts: { ascending: boolean }): SupabaseQuery;
    };
  };
}

interface SupabaseQuery {
  eq(col: string, val: unknown): SupabaseQuery;
  gte(col: string, val: string): SupabaseQuery;
  lte(col: string, val: string): SupabaseQuery;
  limit(n: number): SupabaseQuery;
  order(col: string, opts: { ascending: boolean }): SupabaseQuery;
  then(resolve: (result: { data: Record<string, unknown>[] | null; error: { message: string } | null }) => void): void;
}

const AUDIT_TABLE = 'atlas_mutation_ledger';

let supabase: SupabaseClient | null = null;

async function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (supabase) return supabase;

  const url = typeof process !== 'undefined' ? process.env['SUPABASE_URL'] : undefined;
  const key = typeof process !== 'undefined' ? process.env['SUPABASE_SERVICE_ROLE_KEY'] : undefined;

  if (!url || !key) return null;

  try {
    // Dynamic import — @supabase/supabase-js is an optional peer dependency.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const moduleName = '@supabase/supabase-js';
    const mod: { createClient: (url: string, key: string) => unknown } = await import(
      /* webpackIgnore: true */ moduleName
    );
    supabase = mod.createClient(url, key) as SupabaseClient;
    return supabase;
  } catch {
    return null;
  }
}

// ── In-memory fallback ledger ───────────────────────────────────────────────

const memoryLedger: AuditEntry[] = [];
let idCounter = 0;

function generateId(): string {
  return `audit-${Date.now()}-${++idCounter}`;
}

// ── Serialization helpers ───────────────────────────────────────────────────

function entryToRow(entry: AuditEntry, id: string): Record<string, unknown> {
  return {
    id,
    mutation_id: entry.mutationId,
    layer: entry.layer,
    action: entry.action,
    actor_id: entry.actorId,
    allowed: entry.allowed,
    reason: entry.reason,
    applied_layer: entry.appliedLayer,
    timestamp: entry.timestamp.toISOString(),
  };
}

function rowToEntry(row: Record<string, unknown>): AuditEntry {
  return {
    id: row['id'] as string,
    mutationId: row['mutation_id'] as string,
    layer: row['layer'] as PolicyLayer,
    action: row['action'] as string,
    actorId: row['actor_id'] as string,
    allowed: row['allowed'] as boolean,
    reason: row['reason'] as string,
    appliedLayer: row['applied_layer'] as PolicyLayer,
    timestamp: new Date(row['timestamp'] as string),
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Record an enforcement decision to the audit trail.
 * Writes to Supabase if configured, otherwise to the in-memory ledger.
 *
 * @returns The generated audit ID.
 */
export async function record(entry: AuditEntry): Promise<string> {
  const auditId = generateId();
  const client = await getSupabaseClient();

  if (client) {
    const row = entryToRow(entry, auditId);
    const { error } = await client
      .from(AUDIT_TABLE)
      .insert(row)
      .select('id')
      .single();

    if (error) {
      throw new Error(`PrecedenceAuditTrail.record: Supabase write failed — ${error.message}`);
    }

    return auditId;
  }

  // In-memory fallback
  const stored: AuditEntry = { ...entry, id: auditId };
  memoryLedger.push(stored);
  return auditId;
}

/**
 * Query the audit trail with optional filters.
 */
export async function query(filter: AuditFilter): Promise<AuditEntry[]> {
  const client = await getSupabaseClient();

  if (client) {
    let q = client
      .from(AUDIT_TABLE)
      .select('*')
      .order('timestamp', { ascending: false });

    if (filter.actorId !== undefined) q = q.eq('actor_id', filter.actorId);
    if (filter.layer !== undefined) q = q.eq('layer', filter.layer);
    if (filter.allowed !== undefined) q = q.eq('allowed', filter.allowed);
    if (filter.from) q = q.gte('timestamp', filter.from.toISOString());
    if (filter.to) q = q.lte('timestamp', filter.to.toISOString());
    if (filter.limit) q = q.limit(filter.limit);

    const result = await new Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>(
      (resolve) => q.then(resolve)
    );

    if (result.error) {
      throw new Error(`PrecedenceAuditTrail.query: Supabase read failed — ${result.error.message}`);
    }

    return (result.data ?? []).map(rowToEntry);
  }

  // In-memory fallback
  let entries = [...memoryLedger];

  if (filter.actorId !== undefined) entries = entries.filter((e) => e.actorId === filter.actorId);
  if (filter.layer !== undefined) entries = entries.filter((e) => e.layer === filter.layer);
  if (filter.allowed !== undefined) entries = entries.filter((e) => e.allowed === filter.allowed);
  if (filter.from) entries = entries.filter((e) => e.timestamp >= filter.from!);
  if (filter.to) entries = entries.filter((e) => e.timestamp <= filter.to!);

  // Sort descending by timestamp
  entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  if (filter.limit) entries = entries.slice(0, filter.limit);

  return entries;
}
