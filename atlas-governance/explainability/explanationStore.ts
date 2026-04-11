/**
 * Atlas Explanation Store
 * Phase 4 Section 4 — Explainability Layer
 *
 * IndexedDB-backed explanation store with optional Supabase backup.
 * Provides CRUD + query + TTL pruning for explanation entries.
 */

import { get, set, keys, del, createStore } from 'idb-keyval';
import { computeDiff, type ExplanationDiff } from './ExplanationDiff';

/* ────────────────────────── Types ────────────────────────── */

export interface ExplanationEntry {
  id?: string;
  eventType: string;
  targetId: string;
  actorId: string;
  timestamp: Date;
  humanSummary: string;
  technicalDetail: string;
  policyLayer?: string;
  diff?: ExplanationDiff;
  ttlDays?: number;
}

export interface ExplanationFilter {
  eventType?: string;
  targetId?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

/* ────────────────────────── IDB Store ────────────────────── */

const IDB_PREFIX = 'atlas-explanation-';
const explanationIdb = createStore('atlas-explanations-v1', 'explanations');

function makeId(): string {
  return `expl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function entryKey(id: string): string {
  return `${IDB_PREFIX}${id}`;
}

/** Serialize Date fields for IndexedDB storage. */
function serialize(entry: ExplanationEntry): Record<string, unknown> {
  return {
    ...entry,
    timestamp: entry.timestamp.toISOString(),
  };
}

/** Deserialize stored record back to ExplanationEntry. */
function deserialize(raw: Record<string, unknown>): ExplanationEntry {
  return {
    ...raw,
    timestamp: new Date(raw.timestamp as string),
  } as ExplanationEntry;
}

/* ────────────────────── Supabase Backup ─────────────────── */

async function backupToSupabase(entry: ExplanationEntry): Promise<void> {
  try {
    const supabaseUrl = (globalThis as Record<string, unknown>).VITE_SUPABASE_URL as string | undefined;
    const supabaseKey = (globalThis as Record<string, unknown>).VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!supabaseUrl || !supabaseKey) return;

    await fetch(`${supabaseUrl}/rest/v1/atlas_explanations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(serialize(entry)),
    });
  } catch {
    // Supabase backup is best-effort; swallow errors silently.
  }
}

/* ────────────────────── Public API ───────────────────────── */

/**
 * Store an explanation entry. Auto-generates diff if a previous entry with
 * the same eventType + targetId exists.
 * Returns the generated id.
 */
export async function storeExplanation(entry: ExplanationEntry): Promise<string> {
  const id = entry.id ?? makeId();
  const entryWithId: ExplanationEntry = { ...entry, id };

  // Auto-diff: find existing entry with same eventType + targetId
  const allKeys = await keys<string>(explanationIdb);
  for (const k of allKeys) {
    if (!k.startsWith(IDB_PREFIX)) continue;
    const existing = await get<Record<string, unknown>>(k, explanationIdb);
    if (
      existing &&
      existing.eventType === entry.eventType &&
      existing.targetId === entry.targetId
    ) {
      const prev = deserialize(existing);
      entryWithId.diff = computeDiff(prev, entryWithId);
      break;
    }
  }

  await set(entryKey(id), serialize(entryWithId), explanationIdb);
  backupToSupabase(entryWithId);
  return id;
}

/**
 * Retrieve a single explanation by id.
 */
export async function getExplanation(id: string): Promise<ExplanationEntry | null> {
  const raw = await get<Record<string, unknown>>(entryKey(id), explanationIdb);
  return raw ? deserialize(raw) : null;
}

/**
 * Query explanations with optional filters.
 */
export async function queryExplanations(filter: ExplanationFilter): Promise<ExplanationEntry[]> {
  const allKeys = await keys<string>(explanationIdb);
  const results: ExplanationEntry[] = [];

  for (const k of allKeys) {
    if (!k.startsWith(IDB_PREFIX)) continue;
    const raw = await get<Record<string, unknown>>(k, explanationIdb);
    if (!raw) continue;
    const entry = deserialize(raw);

    if (filter.eventType && entry.eventType !== filter.eventType) continue;
    if (filter.targetId && entry.targetId !== filter.targetId) continue;
    if (filter.actorId && entry.actorId !== filter.actorId) continue;
    if (filter.from && entry.timestamp < filter.from) continue;
    if (filter.to && entry.timestamp > filter.to) continue;

    results.push(entry);
  }

  results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return filter.limit ? results.slice(0, filter.limit) : results;
}

/**
 * Delete entries older than their TTL (default 90 days).
 * Returns count of deleted entries.
 */
export async function pruneExpired(): Promise<number> {
  const now = Date.now();
  const allKeys = await keys<string>(explanationIdb);
  let deleted = 0;

  for (const k of allKeys) {
    if (!k.startsWith(IDB_PREFIX)) continue;
    const raw = await get<Record<string, unknown>>(k, explanationIdb);
    if (!raw) continue;
    const entry = deserialize(raw);
    const ttl = entry.ttlDays ?? 90;
    const expiry = entry.timestamp.getTime() + ttl * 24 * 60 * 60 * 1000;
    if (now > expiry) {
      await del(k, explanationIdb);
      deleted++;
    }
  }

  return deleted;
}
