/**
 * migrate-p4-a3-evolution.ts — Backfill SQLite `evolution_timeline_events`
 * into Postgres `identity_evolution_timeline` (mig 009 schema).
 *
 * Usage:
 *   tsx scripts/migrate-p4-a3-evolution.ts --dry-run
 *   tsx scripts/migrate-p4-a3-evolution.ts --batch=500
 *   tsx scripts/migrate-p4-a3-evolution.ts --user=<uuid>
 *
 * Notes:
 *  - Idempotent: row ids are deterministic UUID v5 via uuidMapping.
 *  - Best-effort: per-row failures are logged and counted; the script
 *    continues. Final exit code is 0 unless --strict is passed.
 *  - Drops fields (evidence_refs_json, pattern_fingerprint,
 *    narrated_self_image_risk, genuine_improvement_score) that have no
 *    column in mig 009; logged in the summary.
 */
import { getDb } from '../src/db/sqlite.js';
import { supabaseRest } from '../src/db/supabase.js';
import { deterministicUuid } from '../src/utils/uuidMapping.js';
import {
  mapEventTypeToSupabase,
  type SupabaseTimelineEventType,
} from '../src/services/governance/evolutionTimelineService.js';

interface SqliteRow {
  id: string;
  user_id: string;
  event_type: string;
  title: string;
  body: string;
  significance: number;
  evidence_refs_json: string;
  pattern_fingerprint: string | null;
  user_declared: number;
  narrated_self_image_risk: number | null;
  genuine_improvement_score: number | null;
  related_domain: string | null;
  created_at: string;
}

interface Args {
  dryRun: boolean;
  strict: boolean;
  batch: number;
  userId: string | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, strict: false, batch: 500, userId: null };
  for (const a of argv) {
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--strict') args.strict = true;
    else if (a.startsWith('--batch=')) args.batch = parseInt(a.slice('--batch='.length), 10);
    else if (a.startsWith('--user=')) args.userId = a.slice('--user='.length);
  }
  if (!Number.isFinite(args.batch) || args.batch <= 0) args.batch = 500;
  return args;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function rowToBody(row: SqliteRow, droppedFields: string[]): {
  id: string;
  user_id: string;
  timeline_event_type: SupabaseTimelineEventType;
  domain: string | null;
  change_reason_chain: string;
  impact_scope: 'local';
  affected_domains: never[];
  triggered_by: 'user' | 'system';
  significance: number;
  created_at: string;
} {
  if (row.evidence_refs_json && row.evidence_refs_json !== '[]') droppedFields.push('evidence_refs_json');
  if (row.pattern_fingerprint) droppedFields.push('pattern_fingerprint');
  if (row.narrated_self_image_risk != null) droppedFields.push('narrated_self_image_risk');
  if (row.genuine_improvement_score != null) droppedFields.push('genuine_improvement_score');

  return {
    id: deterministicUuid('evolution_timeline_events', row.id),
    user_id: row.user_id,
    timeline_event_type: mapEventTypeToSupabase(row.event_type),
    domain: row.related_domain?.trim() || null,
    change_reason_chain: `${row.title}\n\n${row.body}`,
    impact_scope: 'local' as const,
    affected_domains: [] as never[],
    triggered_by: row.user_declared ? ('user' as const) : ('system' as const),
    significance: clamp01(row.significance ?? 0.5),
    created_at: row.created_at,
  };
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[P4-A3] backfill starting`, args);

  const db = getDb();
  const select = args.userId
    ? db.prepare(`SELECT * FROM evolution_timeline_events WHERE user_id = ? ORDER BY created_at ASC`)
    : db.prepare(`SELECT * FROM evolution_timeline_events ORDER BY created_at ASC`);
  const rows = (args.userId ? select.all(args.userId) : select.all()) as SqliteRow[];

  let okCount = 0;
  let failCount = 0;
  const unmappedTypes = new Map<string, number>();
  const droppedFieldHits = new Map<string, number>();

  const knownTypes = new Set([
    'belief_shift', 'standard_change', 'self_concept_change', 'goal_created',
    'goal_abandoned', 'goal_completed', 'goal_drift', 'recurring_failure_pattern',
    'growth_claim', 'developmental_improvement', 'unresolved_internal_conflict',
    'major_inflection', 'cross_domain_tension', 'development_phase',
    'constitutional_amendment_echo', 'decision_outcome_echo',
  ]);

  for (let i = 0; i < rows.length; i += args.batch) {
    const batch = rows.slice(i, i + args.batch);
    const bodies = batch.map((row) => {
      const drops: string[] = [];
      const body = rowToBody(row, drops);
      for (const d of drops) droppedFieldHits.set(d, (droppedFieldHits.get(d) ?? 0) + 1);
      if (!knownTypes.has(row.event_type)) {
        unmappedTypes.set(row.event_type, (unmappedTypes.get(row.event_type) ?? 0) + 1);
      }
      return body;
    });

    if (args.dryRun) {
      okCount += bodies.length;
      continue;
    }

    const result = await supabaseRest(
      'POST',
      'identity_evolution_timeline',
      bodies,
      { Prefer: 'resolution=merge-duplicates,return=minimal' },
    );
    if (result.ok) {
      okCount += bodies.length;
    } else {
      failCount += bodies.length;
      console.error(`[P4-A3] batch ${i / args.batch} failed: status=${result.status ?? 'n/a'}`);
    }
  }

  const summary = {
    mode: args.dryRun ? 'dry-run' : 'write',
    totalSqliteRows: rows.length,
    ok: okCount,
    fail: failCount,
    unmappedEventTypes: Object.fromEntries(unmappedTypes),
    droppedFieldHits: Object.fromEntries(droppedFieldHits),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (args.strict && failCount > 0) process.exit(1);
}

run().catch((err) => {
  console.error('[P4-A3] fatal:', err);
  process.exit(1);
});
