/**
 * semanticBackfillMapping — pure mapping helpers for the Stage B0 backfill.
 *
 * Kept under `src/` (not `scripts/`) so the logic is type-checked by
 * `tsc --noEmit` and reachable from unit tests.
 */
import { deterministicUuid } from './uuidMapping.js';

export interface SqliteSemanticClaimRow {
  id: string;
  user_id: string;
  claim: string;
  domain: string | null;
  confidence: number;
  evidence_memory_ids: string;
  evidence_count: number;
  times_surfaced: number;
  last_surfaced_at: string | null;
  invalidated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostgresSemanticClaimRow {
  id: string;
  user_id: string;
  claim: string;
  domain: string | null;
  confidence: number;
  evidence_memory_ids: string[];
  evidence_count: number;
  times_surfaced: number;
  last_surfaced_at: string | null;
  invalidated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackfillCliOptions {
  dryRun: boolean;
  batchSize: number;
}

const DEFAULT_BATCH = 500;

export function parseBackfillArgs(argv: string[]): BackfillCliOptions {
  const opts: BackfillCliOptions = { dryRun: false, batchSize: DEFAULT_BATCH };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--batch=')) {
      const n = Number.parseInt(arg.slice('--batch='.length), 10);
      if (Number.isFinite(n) && n > 0) opts.batchSize = n;
    }
  }
  return opts;
}

/** Map one SQLite row to its Postgres counterpart. UUID-coerces both the row id and embedded memory ids. */
export function mapSemanticClaimRow(row: SqliteSemanticClaimRow): PostgresSemanticClaimRow {
  let evidenceIds: string[] = [];
  try {
    const parsed = JSON.parse(row.evidence_memory_ids) as unknown;
    if (Array.isArray(parsed)) {
      evidenceIds = parsed
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
        .map((id) => deterministicUuid('memories', id));
    }
  } catch {
    // Malformed JSON in legacy row — emit empty list rather than aborting.
    evidenceIds = [];
  }

  const clampedConfidence = Math.max(0, Math.min(1, row.confidence));

  return {
    id: deterministicUuid('semantic_claims', row.id),
    user_id: row.user_id,
    claim: row.claim,
    domain: row.domain,
    confidence: clampedConfidence,
    evidence_memory_ids: evidenceIds,
    evidence_count: row.evidence_count,
    times_surfaced: row.times_surfaced,
    last_surfaced_at: row.last_surfaced_at,
    invalidated_at: row.invalidated_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
