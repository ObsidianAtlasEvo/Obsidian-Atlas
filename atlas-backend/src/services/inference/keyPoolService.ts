/**
 * keyPoolService.ts
 * Obsidian Atlas — Provider Key Pool + Auto-Rotation Engine
 *
 * Problem solved: When a single API key hits its rate limit or quota ceiling,
 * Atlas emits TRANSIENT_USER_MESSAGE and the user's session is dead. This service
 * maintains a pool of keys per provider, rotating automatically within the same
 * request when a key fails with a recoverable error (429, 503, RESOURCE_EXHAUSTED).
 *
 * Design:
 *  - In-process pool cache (TTL: 5 minutes) — avoids Supabase round-trips on every call
 *  - Environment key is always priority 0 (lowest priority number = most preferred)
 *  - Pool keys are stored AES-256-GCM encrypted in Supabase (migration 016)
 *  - Cooldown: a key that fails is cooled for COOLDOWN_MS before re-entering rotation
 *  - The env key is NEVER stored in the DB; it is injected at runtime as priority 0
 *  - Per-key health tracking written back to Supabase asynchronously (fire-and-forget)
 *
 * Supported providers: 'groq' | 'openai' | 'openrouter' | 'gemini'
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { env } from '../../config/env.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How long a failing key is excluded from rotation (ms). Default: 5 minutes. */
const COOLDOWN_MS = 5 * 60 * 1_000;

/** Failures within this window trigger cooldown. */
const CONSECUTIVE_FAILURE_THRESHOLD = 2;

/** In-process cache TTL — pool reloaded from Supabase at most once per window. */
const CACHE_TTL_MS = 5 * 60 * 1_000;

/** Encryption algorithm for stored keys. */
const CIPHER_ALGO = 'aes-256-gcm';

/** Derive a 32-byte encryption key from APP_KEY_POOL_SECRET (or AUTH_SECRET fallback). */
function deriveEncryptionKey(): Buffer {
  const secret =
    process.env['APP_KEY_POOL_SECRET'] ??
    process.env['NEXTAUTH_SECRET'] ??
    process.env['AUTH_SECRET'] ??
    'atlas-key-pool-fallback-secret-do-not-use-in-prod';
  return createHash('sha256').update(secret).digest();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProviderName = 'groq' | 'openai' | 'openrouter' | 'gemini';

interface PoolKey {
  id: string;
  provider: ProviderName;
  label: string;
  apiKey: string;           // decrypted, in-memory only
  priority: number;
  consecutiveFailures: number;
  cooldownUntil: number;    // Date.now() ms
  isActive: boolean;
}

interface CacheEntry {
  keys: PoolKey[];
  loadedAt: number;
}

interface KeyHealthUpdate {
  success: boolean;
  errorCode?: string;
  errorMsg?: string;
  rotatedToId?: string;
}

// ---------------------------------------------------------------------------
// In-process state
// ---------------------------------------------------------------------------

const poolCache = new Map<ProviderName, CacheEntry>();

// ---------------------------------------------------------------------------
// Encryption helpers (application-layer, keys never leave the server plaintext)
// ---------------------------------------------------------------------------

export function encryptKey(plaintext: string): { encrypted: string; iv: string } {
  const encKey = deriveEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(CIPHER_ALGO, encKey, iv);
  const enc1 = cipher.update(plaintext, 'utf8', 'base64');
  const enc2 = cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');
  // Store as: base64(ciphertext) + '.' + base64(authTag)
  return {
    encrypted: `${enc1}${enc2}.${authTag}`,
    iv: iv.toString('base64'),
  };
}

export function decryptKey(encrypted: string, ivB64: string): string {
  const encKey = deriveEncryptionKey();
  const iv = Buffer.from(ivB64, 'base64');
  const [cipherB64, authTagB64] = encrypted.split('.');
  if (!cipherB64 || !authTagB64) throw new Error('Malformed encrypted key');
  const decipher = createDecipheriv(CIPHER_ALGO, encKey, iv);
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const dec1 = decipher.update(cipherB64, 'base64', 'utf8');
  const dec2 = decipher.final('utf8');
  return `${dec1}${dec2}`;
}

// ---------------------------------------------------------------------------
// Supabase REST helpers (same pattern as existing supabase.ts in codebase)
// ---------------------------------------------------------------------------

async function supabaseSelect<T>(path: string): Promise<T[]> {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? process.env['SUPABASE_SERVICE_KEY'];
  if (!url || !key) return [];
  try {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return [];
    return (await res.json()) as T[];
  } catch {
    return [];
  }
}

async function supabaseUpsert(table: string, record: Record<string, unknown>): Promise<void> {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? process.env['SUPABASE_SERVICE_KEY'];
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(4_000),
    });
  } catch {
    // Fire-and-forget — never block the request path
  }
}

async function supabaseInsert(table: string, record: Record<string, unknown>): Promise<void> {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? process.env['SUPABASE_SERVICE_KEY'];
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(4_000),
    });
  } catch {
    // Fire-and-forget
  }
}

// ---------------------------------------------------------------------------
// Pool loading
// ---------------------------------------------------------------------------

/** Returns the env-configured key for a provider as a priority-0 PoolKey (never stored). */
function envKeyForProvider(provider: ProviderName): PoolKey | null {
  let apiKey: string | null | undefined;
  switch (provider) {
    case 'groq':
      apiKey = env.groqApiKey?.trim() || env.cloudOpenAiApiKey?.trim();
      break;
    case 'openai':
      apiKey = env.openaiApiKey?.trim();
      break;
    case 'openrouter':
      apiKey = env.openrouterApiKey?.trim();
      break;
    case 'gemini':
      apiKey = env.geminiApiKey?.trim();
      break;
  }
  if (!apiKey) return null;
  return {
    id: `env:${provider}`,
    provider,
    label: `${provider}-env-key`,
    apiKey,
    priority: 0,
    consecutiveFailures: 0,
    cooldownUntil: 0,
    isActive: true,
  };
}

/** Load and decrypt all active pool keys for a provider from Supabase. */
async function loadPoolFromSupabase(provider: ProviderName): Promise<PoolKey[]> {
  const rows = await supabaseSelect<{
    id: string;
    provider: string;
    key_label: string;
    key_encrypted: string;
    key_iv: string;
    priority: number;
    consecutive_failures: number;
    cooldown_until: string | null;
    is_active: boolean;
  }>(`provider_key_pool?provider=eq.${provider}&is_active=eq.true&order=priority.asc`);

  const keys: PoolKey[] = [];
  for (const row of rows) {
    try {
      const apiKey = decryptKey(row.key_encrypted, row.key_iv);
      keys.push({
        id: row.id,
        provider: row.provider as ProviderName,
        label: row.key_label,
        apiKey,
        priority: row.priority,
        consecutiveFailures: row.consecutive_failures,
        cooldownUntil: row.cooldown_until ? new Date(row.cooldown_until).getTime() : 0,
        isActive: row.is_active,
      });
    } catch (err) {
      console.warn(`[keyPool] Failed to decrypt key ${row.id} for ${provider}:`, err);
    }
  }
  return keys;
}

/** Get the full pool for a provider (env key + Supabase keys), cached. */
async function getPool(provider: ProviderName): Promise<PoolKey[]> {
  const now = Date.now();
  const cached = poolCache.get(provider);
  if (cached && now - cached.loadedAt < CACHE_TTL_MS) {
    return cached.keys;
  }

  const [envKey, dbKeys] = await Promise.all([
    Promise.resolve(envKeyForProvider(provider)),
    loadPoolFromSupabase(provider),
  ]);

  // Merge: env key always first (priority 0), then DB keys sorted by priority
  const allKeys: PoolKey[] = [];
  if (envKey) allKeys.push(envKey);
  allKeys.push(...dbKeys);

  poolCache.set(provider, { keys: allKeys, loadedAt: now });
  return allKeys;
}

/** Invalidate the in-process cache for a provider (call after adding/removing keys). */
export function invalidatePoolCache(provider: ProviderName): void {
  poolCache.delete(provider);
}

// ---------------------------------------------------------------------------
// Key selection
// ---------------------------------------------------------------------------

/**
 * Pick the best available key for a provider.
 * Returns null if the pool is empty or all keys are in cooldown.
 */
export async function pickKey(provider: ProviderName): Promise<PoolKey | null> {
  const pool = await getPool(provider);
  const now = Date.now();

  // Sort: active, not in cooldown, fewest consecutive failures, lowest priority number
  const available = pool
    .filter((k) => k.isActive && k.cooldownUntil <= now)
    .sort((a, b) => {
      if (a.consecutiveFailures !== b.consecutiveFailures)
        return a.consecutiveFailures - b.consecutiveFailures;
      return a.priority - b.priority;
    });

  return available[0] ?? null;
}

/**
 * Pick the next key after `currentKeyId` fails.
 * Returns null if no alternative is available.
 */
export async function pickNextKey(
  provider: ProviderName,
  excludeKeyId: string,
): Promise<PoolKey | null> {
  const pool = await getPool(provider);
  const now = Date.now();

  const available = pool
    .filter((k) => k.id !== excludeKeyId && k.isActive && k.cooldownUntil <= now)
    .sort((a, b) => {
      if (a.consecutiveFailures !== b.consecutiveFailures)
        return a.consecutiveFailures - b.consecutiveFailures;
      return a.priority - b.priority;
    });

  return available[0] ?? null;
}

// ---------------------------------------------------------------------------
// Health recording (async, never blocks request path)
// ---------------------------------------------------------------------------

export function recordKeySuccess(key: PoolKey): void {
  // Reset in-process state
  key.consecutiveFailures = 0;
  key.cooldownUntil = 0;

  // If this is a DB key (not env), persist asynchronously
  if (!key.id.startsWith('env:')) {
    void supabaseUpsert('provider_key_pool', {
      id: key.id,
      consecutive_failures: 0,
      cooldown_until: null,
      last_success_at: new Date().toISOString(),
      total_requests: 'total_requests + 1', // NOTE: handled via RPC in full impl; approximated here
    });
    void supabaseInsert('provider_key_events', {
      key_id: key.id,
      provider: key.provider,
      event_type: 'success',
    });
  }
}

export function recordKeyFailure(
  key: PoolKey,
  update: KeyHealthUpdate,
): void {
  key.consecutiveFailures += 1;

  const shouldCooldown = key.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD;
  if (shouldCooldown) {
    key.cooldownUntil = Date.now() + COOLDOWN_MS;
    console.warn(
      `[keyPool] Key "${key.label}" (${key.provider}) entering cooldown for ${COOLDOWN_MS / 1000}s after ${key.consecutiveFailures} consecutive failures`,
    );
  }

  if (!key.id.startsWith('env:')) {
    void supabaseUpsert('provider_key_pool', {
      id: key.id,
      consecutive_failures: key.consecutiveFailures,
      cooldown_until: shouldCooldown ? new Date(key.cooldownUntil).toISOString() : null,
      last_failure_at: new Date().toISOString(),
    });
    void supabaseInsert('provider_key_events', {
      key_id: key.id,
      provider: key.provider,
      event_type: shouldCooldown ? 'cooldown' : 'failure',
      error_code: update.errorCode,
      error_msg: update.errorMsg?.slice(0, 512),
      rotated_to: update.rotatedToId,
    });
  }
}

// ---------------------------------------------------------------------------
// Recoverable error detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the error is a rate-limit or transient capacity error
 * that warrants rotating to the next key rather than failing immediately.
 */
export function isRotatableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('429') ||
    msg.includes('Rate limit') ||
    msg.includes('Too Many Requests') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota') ||
    msg.includes('Quota') ||
    msg.includes('rate_limit') ||
    (msg.includes('503') && (msg.includes('overloaded') || msg.includes('Service Unavailable'))) ||
    msg.includes('[GoogleGenerativeAI Error]')
  );
}

// ---------------------------------------------------------------------------
// Admin: add a new key to the pool
// ---------------------------------------------------------------------------

export async function addKeyToPool(params: {
  provider: ProviderName;
  label: string;
  apiKey: string;
  priority?: number;
  addedBy: string;
  notes?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const { encrypted, iv } = encryptKey(params.apiKey);
    const id = crypto.randomUUID();
    await supabaseInsert('provider_key_pool', {
      id,
      provider: params.provider,
      key_label: params.label,
      key_encrypted: encrypted,
      key_iv: iv,
      is_active: true,
      priority: params.priority ?? 100,
      added_by: params.addedBy,
      notes: params.notes ?? null,
    });
    await supabaseInsert('provider_key_events', {
      key_id: id,
      provider: params.provider,
      event_type: 'added',
    });
    // Bust cache so this key is immediately available
    invalidatePoolCache(params.provider);
    console.info(`[keyPool] Added new key "${params.label}" for provider "${params.provider}"`);
    return { success: true, id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Admin: remove / deactivate a key
// ---------------------------------------------------------------------------

export async function deactivateKey(keyId: string, provider: ProviderName): Promise<void> {
  await supabaseUpsert('provider_key_pool', { id: keyId, is_active: false });
  await supabaseInsert('provider_key_events', {
    key_id: keyId,
    provider,
    event_type: 'removed',
  });
  invalidatePoolCache(provider);
}

// ---------------------------------------------------------------------------
// Admin: list keys (masked) for a provider
// ---------------------------------------------------------------------------

export async function listKeys(provider?: ProviderName): Promise<Array<{
  id: string;
  provider: string;
  label: string;
  isActive: boolean;
  priority: number;
  consecutiveFailures: number;
  cooldownUntil: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  addedBy: string;
  notes: string | null;
  createdAt: string;
}>> {
  const filter = provider ? `provider=eq.${provider}&` : '';
  const rows = await supabaseSelect<{
    id: string;
    provider: string;
    key_label: string;
    is_active: boolean;
    priority: number;
    consecutive_failures: number;
    cooldown_until: string | null;
    last_success_at: string | null;
    last_failure_at: string | null;
    added_by: string;
    notes: string | null;
    created_at: string;
  }>(`provider_key_pool?${filter}order=provider.asc,priority.asc`);

  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    label: r.key_label,
    isActive: r.is_active,
    priority: r.priority,
    consecutiveFailures: r.consecutive_failures,
    cooldownUntil: r.cooldown_until,
    lastSuccessAt: r.last_success_at,
    lastFailureAt: r.last_failure_at,
    addedBy: r.added_by,
    notes: r.notes,
    createdAt: r.created_at,
  }));
}

// ---------------------------------------------------------------------------
// withKeyRotation — high-level wrapper used by universalAdapter
// ---------------------------------------------------------------------------

/**
 * Execute `fn` with the best available key for `provider`.
 * On recoverable failure (429/503/quota), rotate to the next key and retry once.
 * Returns { apiKey, result } on success, throws if all keys exhausted.
 *
 * Usage in universalAdapter:
 *   const { apiKey } = await withKeyRotation('groq', async (key) => callGroq(key, ...));
 */
export async function withKeyRotation<T>(
  provider: ProviderName,
  fn: (apiKey: string) => Promise<T>,
): Promise<T> {
  const firstKey = await pickKey(provider);

  // No pool at all → delegate to existing env-key logic (backward compat)
  if (!firstKey) {
    return fn('');  // caller's resolveXAuth() handles missing key
  }

  try {
    const result = await fn(firstKey.apiKey);
    recordKeySuccess(firstKey);
    return result;
  } catch (err) {
    if (!isRotatableError(err)) {
      // Non-rotatable error (auth failure, bad request, etc.) — record and rethrow
      recordKeyFailure(firstKey, {
        success: false,
        errorCode: extractErrorCode(err),
        errorMsg: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    // Rotatable error — try next key
    recordKeyFailure(firstKey, {
      success: false,
      errorCode: extractErrorCode(err),
      errorMsg: err instanceof Error ? err.message : String(err),
    });

    const nextKey = await pickNextKey(provider, firstKey.id);
    if (!nextKey) {
      console.error(`[keyPool] All keys for "${provider}" exhausted or in cooldown`);
      throw err; // propagate original error; upstream TRANSIENT_USER_MESSAGE handles it
    }

    console.info(`[keyPool] Rotating "${provider}": ${firstKey.label} → ${nextKey.label}`);
    void supabaseInsert('provider_key_events', {
      key_id: firstKey.id,
      provider,
      event_type: 'rotation',
      error_code: extractErrorCode(err),
      rotated_to: nextKey.id.startsWith('env:') ? null : nextKey.id,
    });

    try {
      const result = await fn(nextKey.apiKey);
      recordKeySuccess(nextKey);
      return result;
    } catch (nextErr) {
      recordKeyFailure(nextKey, {
        success: false,
        errorCode: extractErrorCode(nextErr),
        errorMsg: nextErr instanceof Error ? nextErr.message : String(nextErr),
      });
      throw nextErr;
    }
  }
}

function extractErrorCode(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('429')) return '429';
  if (msg.includes('503')) return '503';
  if (msg.includes('401')) return '401';
  if (msg.includes('RESOURCE_EXHAUSTED')) return 'RESOURCE_EXHAUSTED';
  if (msg.includes('quota') || msg.includes('Quota')) return 'QUOTA';
  return 'unknown';
}
