/**
 * uuidMapping — deterministic UUID v5 for SQLite text-id → Postgres uuid
 * mapping during the P4 migration.
 *
 * Each migrating table has its own stable namespace. These namespaces MUST
 * NOT change after deploy — backfill scripts and runtime code depend on the
 * mapping being reproducible across runs and machines.
 */
import { v5 as uuidv5 } from 'uuid';

const NAMESPACES: Record<string, string> = {
  memories:                  '8b1c4f00-1111-4000-8000-000000000001',
  truth_entries:             '8b1c4f00-1111-4000-8000-000000000002',
  evolution_timeline_events: '8b1c4f00-1111-4000-8000-000000000003',
  srg_decisions:             '8b1c4f00-1111-4000-8000-000000000004',
  semantic_claims:           '8b1c4f00-1111-4000-8000-000000000005',
  doctrine_nodes:            '8b1c4f00-1111-4000-8000-000000000006',
  unfinished_business_items: '8b1c4f00-1111-4000-8000-000000000007',
  adaptation_events:         '8b1c4f00-1111-4000-8000-000000000008',
};

export function deterministicUuid(table: keyof typeof NAMESPACES | string, sqliteId: string): string {
  const ns = NAMESPACES[table];
  if (!ns) throw new Error(`No UUID namespace registered for table ${table}`);
  return uuidv5(sqliteId, ns);
}
