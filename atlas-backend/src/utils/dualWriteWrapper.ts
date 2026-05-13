/**
 * dualWriteWrapper — run two writes during the `dual` cutover phase.
 *
 * The primary write is awaited and its result returned; failures propagate.
 * The secondary write is best-effort: its errors are logged but never thrown,
 * so a Postgres outage during shadow-write does not break the SQLite path.
 */

type WriteFn<T> = () => Promise<T> | T;

export interface DualWriteOptions {
  table: string;
  /** mode: which side is primary */
  mode: 'sqlite' | 'dual' | 'supabase';
}

export async function dualWrite<T>(
  primary: WriteFn<T>,
  secondary: WriteFn<unknown> | null,
  opts: DualWriteOptions,
): Promise<T> {
  const result = await primary();
  if (secondary) {
    try {
      await secondary();
    } catch (err) {
      // Secondary failures are logged but never thrown
      console.error(`[dualWrite] ${opts.table} secondary write failed:`, err);
    }
  }
  return result;
}
