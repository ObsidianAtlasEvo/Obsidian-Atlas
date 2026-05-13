/**
 * unfinishedBusinessMapping — SQLite ⇄ Postgres row transforms for the P4
 * unfinished_business cutover. Shared by the service (dual-write path) and
 * the one-shot backfill script so the transform is single-sourced.
 */

import { deterministicUuid } from '../../utils/uuidMapping.js';
import type { UnfinishedRow } from './unfinishedBusinessService.js';

/**
 * SQLite enum is {'open','deferred','resolved','archived'} (see
 * `unfinishedStatusSchema` in types/longitudinal.ts).  Postgres CHECK enum is
 * {'open','snoozed','resolved','dropped'} (mig 024).  Map between the two.
 */
export function mapStatusToPostgres(sqliteStatus: string): string {
  switch (sqliteStatus) {
    case 'open':
      return 'open';
    case 'deferred':
      return 'snoozed';
    case 'resolved':
      return 'resolved';
    case 'archived':
      return 'dropped';
    default:
      return 'open';
  }
}

export function mapStatusFromPostgres(pgStatus: string): string {
  switch (pgStatus) {
    case 'open':
      return 'open';
    case 'snoozed':
      return 'deferred';
    case 'resolved':
      return 'resolved';
    case 'dropped':
      return 'archived';
    default:
      return 'open';
  }
}

export interface PostgresUnfinishedRow {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  description: string;
  significance_score: number;
  recurrence_score: number;
  urgency_score: number;
  identity_relevance_score: number;
  composite_score: number;
  surfaced_count: number;
  last_surfaced_at: string | null;
  status: string;
  decision_id: string | null;
  constitution_version_group_id: string | null;
  linked_claim_ids: unknown[];
  pattern_fingerprint: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
}

/** Coerce a SQLite row (text ids, JSON-text) into the Postgres wire shape. */
export function sqliteRowToPostgres(row: UnfinishedRow): PostgresUnfinishedRow {
  let linked: unknown[] = [];
  try {
    const parsed = JSON.parse(row.linked_claim_ids_json);
    if (Array.isArray(parsed)) linked = parsed;
  } catch {
    linked = [];
  }
  return {
    id: deterministicUuid('unfinished_business_items', row.id),
    user_id: row.user_id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    significance_score: row.significance_score,
    recurrence_score: row.recurrence_score,
    urgency_score: row.urgency_score,
    identity_relevance_score: row.identity_relevance_score,
    composite_score: row.composite_score,
    surfaced_count: row.surfaced_count,
    last_surfaced_at: row.last_surfaced_at,
    status: mapStatusToPostgres(row.status),
    decision_id: row.decision_id ? deterministicUuid('srg_decisions', row.decision_id) : null,
    constitution_version_group_id: row.constitution_version_group_id,
    linked_claim_ids: linked,
    pattern_fingerprint: row.pattern_fingerprint,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at,
    resolution_note: row.resolution_note,
  };
}

/** Coerce a Postgres row back into the SQLite-shaped row used by callers. */
export function postgresRowToSqlite(
  pg: PostgresUnfinishedRow,
  sqliteIdHint?: string,
): UnfinishedRow {
  return {
    id: sqliteIdHint ?? pg.id,
    user_id: pg.user_id,
    kind: pg.kind,
    title: pg.title,
    description: pg.description,
    significance_score: pg.significance_score,
    recurrence_score: pg.recurrence_score,
    urgency_score: pg.urgency_score,
    identity_relevance_score: pg.identity_relevance_score,
    composite_score: pg.composite_score,
    surfaced_count: pg.surfaced_count,
    last_surfaced_at: pg.last_surfaced_at,
    status: mapStatusFromPostgres(pg.status),
    decision_id: pg.decision_id,
    constitution_version_group_id: pg.constitution_version_group_id,
    linked_claim_ids_json: JSON.stringify(pg.linked_claim_ids ?? []),
    pattern_fingerprint: pg.pattern_fingerprint,
    created_at: pg.created_at,
    updated_at: pg.updated_at,
    resolved_at: pg.resolved_at,
    resolution_note: pg.resolution_note,
  };
}
