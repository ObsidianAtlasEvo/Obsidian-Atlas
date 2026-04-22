/**
 * redisClient.ts — V1.0 Phase B
 *
 * Thin singleton wrapper around Upstash Redis (@upstash/redis).
 * Uses the Upstash REST client — no persistent TCP connection, works cleanly
 * in serverless and long-running Node ESM processes alike.
 *
 * Degradation contract:
 *   When UPSTASH_REDIS_URL / UPSTASH_REDIS_TOKEN are absent or the client
 *   cannot be instantiated, getRedis() returns null (sync) or resolves null
 *   (async). All callers must treat null as a no-op — Redis is always an
 *   enhancement layer, never a hard dep.
 *
 * Architecture note:
 *   The client is initialised lazily via ensureRedis() (async, ESM-safe).
 *   getRedis() provides a synchronous fast-path once initialisation is done.
 *   Callers that need the client on the hot path should call ensureRedis()
 *   once at startup (or on first request) to warm the singleton.
 */

import { env } from '../../config/env.js';

type UpstashRedis = import('@upstash/redis').Redis;

let _redis: UpstashRedis | null | undefined = undefined; // undefined = not yet initialised
let _initPromise: Promise<UpstashRedis | null> | null = null;

/**
 * Async initialiser — uses dynamic ESM import instead of require().
 * Safe under --experimental-vm-modules, ts-node ESM, and compiled ESM output.
 * Returns null when credentials are absent or the module fails to load.
 * Never throws.
 */
async function _initRedis(): Promise<UpstashRedis | null> {
  if (!env.upstashRedisUrl || !env.upstashRedisToken) {
    _redis = null;
    return null;
  }
  try {
    const { Redis } = await import('@upstash/redis');
    _redis = new Redis({
      url: env.upstashRedisUrl,
      token: env.upstashRedisToken,
    });
    return _redis;
  } catch (err) {
    console.error('[redisClient] Failed to initialise Upstash Redis client:', err);
    _redis = null;
    return null;
  }
}

/**
 * Async accessor — always safe to call; resolves immediately after first init.
 * Preferred on the hot path: await ensureRedis() once per request if needed.
 */
export async function ensureRedis(): Promise<UpstashRedis | null> {
  if (_redis !== undefined) return _redis;
  if (!_initPromise) _initPromise = _initRedis();
  return _initPromise;
}

/**
 * Sync accessor — returns the client if already initialised, null otherwise.
 * Safe to call after awaiting ensureRedis(); returns null before init completes.
 */
export function getRedis(): UpstashRedis | null {
  return _redis ?? null;
}

/** True when Redis is configured and the client initialised successfully. */
export function isRedisAvailable(): boolean {
  return _redis !== null && _redis !== undefined;
}

/**
 * Safe set — wraps redis.set with a timeout race.
 * Returns false (never throws) on failure.
 * Calls ensureRedis() so the client is warm on first invocation.
 */
export async function redisSafeSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<boolean> {
  const redis = await ensureRedis();
  if (!redis) return false;
  try {
    await Promise.race([
      redis.set(key, JSON.stringify(value), { ex: ttlSeconds }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Redis set timeout')), 1_500)),
    ]);
    return true;
  } catch (err) {
    console.warn('[redisClient] redisSafeSet failed:', err);
    return false;
  }
}

/**
 * Safe get — returns parsed value or null on miss/error.
 * Never throws.
 */
export async function redisSafeGet<T>(key: string): Promise<T | null> {
  const redis = await ensureRedis();
  if (!redis) return null;
  try {
    const raw = await Promise.race([
      redis.get<string>(key),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1_500)),
    ]);
    if (raw === null || raw === undefined) return null;
    // Upstash REST client may auto-parse JSON — handle both string and object
    if (typeof raw === 'string') return JSON.parse(raw) as T;
    return raw as unknown as T;
  } catch (err) {
    console.warn('[redisClient] redisSafeGet failed:', err);
    return null;
  }
}

/**
 * Safe delete — returns false (never throws) on failure.
 */
export async function redisSafeDel(key: string): Promise<boolean> {
  const redis = await ensureRedis();
  if (!redis) return false;
  try {
    await redis.del(key);
    return true;
  } catch (err) {
    console.warn('[redisClient] redisSafeDel failed:', err);
    return false;
  }
}
