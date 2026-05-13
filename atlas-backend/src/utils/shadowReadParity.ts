/**
 * shadowReadParity — fire-and-forget secondary read for the `dual` phase.
 *
 * The primary value is returned synchronously to the caller. In the
 * background, the secondary read is executed and compared; mismatches are
 * logged as parity misses but never surfaced to callers.
 */

export async function shadowCompare<T>(
  primary: T,
  secondaryFn: () => Promise<T>,
  opts: { table: string; key: string; equals?: (a: T, b: T) => boolean },
): Promise<T> {
  void (async () => {
    try {
      const secondary = await secondaryFn();
      const eq = opts.equals ?? ((a, b) => JSON.stringify(a) === JSON.stringify(b));
      if (!eq(primary, secondary)) {
        console.warn(`[shadow] ${opts.table} parity miss for ${opts.key}`);
      }
    } catch (err) {
      console.warn(`[shadow] ${opts.table} secondary read failed:`, err);
    }
  })();
  return primary;
}
