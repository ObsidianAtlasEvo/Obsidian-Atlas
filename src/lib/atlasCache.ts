/**
 * Standalone intelligent cache — extracted from ollamaService.ts.
 * No inference dependency. Safe to import anywhere.
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  tier: 1 | 2 | 3;
  invalidationHash: string;
}

class IntelligentCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly TTL: Record<1 | 2 | 3, number> = {
    1: 1000 * 60 * 60 * 24,
    2: 1000 * 60 * 60,
    3: 1000 * 60 * 5,
  };

  set<T>(key: string, data: T, tier: 1 | 2 | 3, hash: string): void {
    this.cache.set(key, { data, timestamp: Date.now(), tier, invalidationHash: hash });
  }

  get<T>(key: string, currentHash: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.invalidationHash !== currentHash) { this.cache.delete(key); return null; }
    if (Date.now() - entry.timestamp > this.TTL[entry.tier]) { this.cache.delete(key); return null; }
    return entry.data as T;
  }

  invalidateAll(): void { this.cache.clear(); }
}

export const atlasCache = new IntelligentCache();
