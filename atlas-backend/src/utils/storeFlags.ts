/**
 * storeFlags — per-table cutover flags for the P4 SQLite→Postgres migration.
 *
 * Each migrating table family has its own env var with three valid states:
 *   - `sqlite`   — only the legacy SQLite store is read/written (default)
 *   - `dual`     — both stores are written; SQLite remains the read-of-record
 *   - `supabase` — only the Postgres/Supabase store is read/written
 *
 * Subsequent stages of the migration consume these flags via
 * `shouldWriteSqlite`, `shouldWriteSupabase`, and `shouldReadSupabase`.
 */

export type StoreMode = 'sqlite' | 'dual' | 'supabase';

const VALID: StoreMode[] = ['sqlite', 'dual', 'supabase'];

function read(name: string): StoreMode {
  const raw = (process.env[name] ?? 'sqlite').toLowerCase();
  return (VALID as string[]).includes(raw) ? (raw as StoreMode) : 'sqlite';
}

export const storeFlags = {
  memory:             () => read('MEMORY_STORE'),
  truth:              () => read('TRUTH_STORE'),
  doctrine:           () => read('DOCTRINE_STORE'),
  evolutionTimeline:  () => read('EVOLUTION_TIMELINE_STORE'),
  semanticClaims:     () => read('SEMANTIC_CLAIMS_STORE'),
  srg:                () => read('SRG_STORE'),
  unfinishedBusiness: () => read('UNFINISHED_BUSINESS_STORE'),
  adaptation:         () => read('ADAPTATION_STORE'),
};

export function shouldWriteSqlite(mode: StoreMode): boolean {
  return mode === 'sqlite' || mode === 'dual';
}
export function shouldWriteSupabase(mode: StoreMode): boolean {
  return mode === 'dual' || mode === 'supabase';
}
export function shouldReadSupabase(mode: StoreMode): boolean {
  return mode === 'supabase';
}
