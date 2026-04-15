import { atlasApiUrl, atlasHttpEnabled } from './atlasApi';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'failed';

/** Fire-and-forget write to backend. Returns true if successful. */
export async function syncToBackend(
  endpoint: string,
  method: 'POST' | 'PUT' | 'DELETE',
  data: unknown,
  onStatus?: (s: SyncStatus) => void
): Promise<boolean> {
  if (!atlasHttpEnabled()) return false;
  onStatus?.('syncing');
  try {
    const res = await fetch(atlasApiUrl(endpoint), {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: method !== 'DELETE' ? JSON.stringify(data) : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    onStatus?.('synced');
    return true;
  } catch (e) {
    console.warn('[sovereignSync] sync failed:', endpoint, e);
    onStatus?.('failed');
    return false;
  }
}

/** Hydrate frontend state from backend on mount. */
export async function hydrateFromBackend<T>(
  endpoint: string,
  userId: string,
  onData: (data: T) => void
): Promise<void> {
  if (!atlasHttpEnabled() || userId === 'anonymous') return;
  try {
    const res = await fetch(atlasApiUrl(`${endpoint}?userId=${encodeURIComponent(userId)}&limit=100`), {
      credentials: 'include',
    });
    if (!res.ok) return;
    const data = await res.json() as T;
    onData(data);
  } catch (e) {
    console.warn('[sovereignSync] hydration failed:', endpoint, e);
  }
}

/** One-time migration: push local data to backend if backend is empty for this user. */
export async function migrateLocalToBackend(
  artifact: string,
  userId: string,
  localItems: unknown[],
  postEndpoint: string
): Promise<void> {
  if (!atlasHttpEnabled()) return;
  const key = `atlas-substrate-migrated:${artifact}:${userId}`;
  if (localStorage.getItem(key)) return;
  if (!localItems.length) { localStorage.setItem(key, 'true'); return; }
  // Check if backend already has data
  try {
    const res = await fetch(
      atlasApiUrl(`${postEndpoint}?userId=${encodeURIComponent(userId)}&limit=1`),
      { credentials: 'include' }
    );
    if (!res.ok) return;
    const check = await res.json() as { entries?: unknown[]; nodes?: unknown[] };
    const hasData = (check.entries?.length ?? check.nodes?.length ?? 0) > 0;
    if (hasData) { localStorage.setItem(key, 'true'); return; }
  } catch { return; }
  // Push local items to backend
  let migrated = 0;
  for (const item of localItems) {
    try {
      const r = await fetch(atlasApiUrl(postEndpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(item),
      });
      if (r.ok) migrated++;
    } catch { /* non-fatal */ }
  }
  console.info(`[sovereignSync] migrated ${migrated}/${localItems.length} ${artifact} items to backend`);
  localStorage.setItem(key, 'true');
}
