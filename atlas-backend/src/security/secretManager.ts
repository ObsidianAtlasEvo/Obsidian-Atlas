/**
 * Atlas Phase 3 — Secret Manager
 *
 * Centralised secret management layer.
 * Prevents secrets from being hardcoded, accidentally logged, or exposed
 * via error messages, stack traces, or API responses.
 *
 * Usage:
 *   const sm = new SecretManager();
 *   sm.loadFromEnv();           // call once at startup
 *   const key = sm.get('GROQ_API_KEY');
 *   console.log(sm.mask('GROQ_API_KEY'));  // "sk-a...23"
 */

// ---------------------------------------------------------------------------
// Fastify type stubs — replace with actual fastify imports in your project
// ---------------------------------------------------------------------------
// import { FastifyInstance } from 'fastify';
interface FastifyInstance {
  decorate(name: string, value: unknown): void;
  // Overloads for the hook signatures used in this file
  addHook(
    event: 'onSend',
    handler: (req: unknown, reply: unknown, payload: unknown) => Promise<unknown>
  ): void;
  addHook(
    event: string,
    handler: (...args: unknown[]) => Promise<void> | void
  ): void;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SecretKey =
  | 'GROQ_API_KEY'
  | 'SUPABASE_URL'
  | 'SUPABASE_SERVICE_KEY'
  | 'SUPABASE_ANON_KEY'
  | 'JWT_SECRET'
  | 'SOVEREIGN_EMAIL'
  | 'SOVEREIGN_HMAC_SECRET'
  | 'OLLAMA_URL'
  | 'OPENAI_API_KEY'
  | 'ANTHROPIC_API_KEY'
  | 'MISTRAL_API_KEY';

export interface SecretMetadata {
  key: SecretKey;
  /** If true, startup will fail when the secret is absent */
  required: boolean;
  /** If true, never log even a masked version */
  sensitive: boolean;
  /** If true, rotation logic is implemented */
  rotatable: boolean;
  lastRotatedAt?: number;
  /** Unix ms — if set and now > expiresAt the secret is considered expired */
  expiresAt?: number;
  source: 'env' | 'vault' | 'runtime';
}

export interface SecretValidationResult {
  valid: boolean;
  missing: SecretKey[];
  expired: SecretKey[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Secret catalogue — static metadata for every known secret
// ---------------------------------------------------------------------------

const SECRET_CATALOGUE: SecretMetadata[] = [
  { key: 'GROQ_API_KEY',          required: false, sensitive: true,  rotatable: true,  source: 'env' },
  { key: 'SUPABASE_URL',          required: false, sensitive: false, rotatable: false, source: 'env' },
  { key: 'SUPABASE_SERVICE_KEY',  required: false, sensitive: true,  rotatable: true,  source: 'env' },
  { key: 'SUPABASE_ANON_KEY',     required: false, sensitive: true,  rotatable: true,  source: 'env' },
  { key: 'JWT_SECRET',            required: false, sensitive: true,  rotatable: true,  source: 'env' },
  { key: 'SOVEREIGN_EMAIL',       required: false, sensitive: false, rotatable: false, source: 'env' },
  { key: 'SOVEREIGN_HMAC_SECRET', required: false, sensitive: true,  rotatable: true,  source: 'env' },
  { key: 'OLLAMA_URL',            required: false, sensitive: false, rotatable: false, source: 'env' },
  { key: 'OPENAI_API_KEY',        required: false, sensitive: true,  rotatable: true,  source: 'env' },
  { key: 'ANTHROPIC_API_KEY',     required: false, sensitive: true,  rotatable: true,  source: 'env' },
  { key: 'MISTRAL_API_KEY',       required: false, sensitive: true,  rotatable: true,  source: 'env' },
];

// ---------------------------------------------------------------------------
// SecretManager
// ---------------------------------------------------------------------------

export class SecretManager {
  private secrets: Map<SecretKey, string>;
  private metadata: Map<SecretKey, SecretMetadata>;

  // Track whether loadFromEnv has been called
  private loaded = false;

  constructor() {
    this.secrets = new Map();
    this.metadata = new Map();

    // Populate metadata from the catalogue
    for (const meta of SECRET_CATALOGUE) {
      this.metadata.set(meta.key, { ...meta });
    }
  }

  // -------------------------------------------------------------------------
  // loadFromEnv
  // -------------------------------------------------------------------------

  /**
   * Load all known secrets from `process.env`.
   * Must be called once at application startup before any `get()` call.
   *
   * Returns a validation result so the caller can decide whether to abort
   * or proceed with warnings.
   */
  loadFromEnv(): SecretValidationResult {
    for (const meta of SECRET_CATALOGUE) {
      const value = process.env[meta.key];
      if (value !== undefined && value.trim() !== '') {
        this.secrets.set(meta.key, value.trim());
        // Update source and timestamp in metadata
        const stored = this.metadata.get(meta.key)!;
        stored.source = 'env';
      }
    }

    this.loaded = true;
    return this.validate();
  }

  // -------------------------------------------------------------------------
  // get
  // -------------------------------------------------------------------------

  /**
   * Retrieve the value of a secret.
   * Throws if the secret is not loaded — never silently returns an empty string.
   */
  get(key: SecretKey): string {
    if (!this.loaded) {
      throw new Error(
        `[SecretManager] loadFromEnv() must be called before get('${key}')`
      );
    }

    const value = this.secrets.get(key);
    if (value === undefined) {
      const meta = this.metadata.get(key);
      if (meta?.required) {
        throw new Error(
          `[SecretManager] Required secret '${key}' is not set`
        );
      }
      throw new Error(
        `[SecretManager] Secret '${key}' is not available`
      );
    }

    return value;
  }

  // -------------------------------------------------------------------------
  // has
  // -------------------------------------------------------------------------

  /**
   * Check if a secret is present without exposing its value.
   */
  has(key: SecretKey): boolean {
    return this.secrets.has(key) && (this.secrets.get(key)?.length ?? 0) > 0;
  }

  // -------------------------------------------------------------------------
  // validate
  // -------------------------------------------------------------------------

  /**
   * Validate all registered secrets.
   * Returns lists of missing required keys, expired keys, and warnings.
   */
  validate(): SecretValidationResult {
    const missing: SecretKey[] = [];
    const expired: SecretKey[] = [];
    const warnings: string[] = [];
    const now = Date.now();

    for (const [key, meta] of this.metadata.entries()) {
      const present = this.has(key);

      if (meta.required && !present) {
        missing.push(key);
        continue;
      }

      if (!present && !meta.required) {
        warnings.push(`Optional secret '${key}' is not set`);
        continue;
      }

      if (meta.expiresAt && now > meta.expiresAt) {
        expired.push(key);
        warnings.push(`Secret '${key}' expired at ${new Date(meta.expiresAt).toISOString()}`);
      }

      if (meta.rotatable && meta.lastRotatedAt) {
        const daysSinceRotation = (now - meta.lastRotatedAt) / 86_400_000;
        if (daysSinceRotation > 90) {
          warnings.push(
            `Secret '${key}' has not been rotated in ${Math.floor(daysSinceRotation)} days (recommended: 90)`
          );
        }
      }
    }

    return {
      valid: missing.length === 0 && expired.length === 0,
      missing,
      expired,
      warnings,
    };
  }

  // -------------------------------------------------------------------------
  // mask
  // -------------------------------------------------------------------------

  /**
   * Return a safe masked representation of a secret value for logging.
   *
   * Masking rules:
   *   - If the secret is `sensitive`, return `[REDACTED]`
   *   - URLs: return the host/domain portion only
   *   - UUIDs (8-4-4-4-12): return first 8 chars + '...'
   *   - Everything else: show first 4 + '...' + last 2 chars
   *     (or fewer if the value is very short)
   */
  mask(key: SecretKey): string {
    const meta = this.metadata.get(key);
    if (meta?.sensitive) {
      return '[REDACTED]';
    }

    const value = this.secrets.get(key);
    if (!value) return '[not set]';

    // URL masking — show origin only
    if (value.startsWith('http://') || value.startsWith('https://')) {
      try {
        const url = new URL(value);
        return url.origin;
      } catch {
        // fall through to generic masking
      }
    }

    // UUID masking
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(value)) {
      return `${value.slice(0, 8)}...`;
    }

    // Generic masking
    if (value.length <= 6) return '***';
    const head = value.slice(0, 4);
    const tail = value.slice(-2);
    return `${head}...${tail}`;
  }

  // -------------------------------------------------------------------------
  // scanForLeaks
  // -------------------------------------------------------------------------

  /**
   * Scan an arbitrary string (e.g. an error message, log line, or API response)
   * for the literal values of any loaded secrets.
   *
   * Returns the keys whose values appear as substrings — never the values themselves.
   *
   * Only checks secrets with a value of ≥8 characters to avoid false positives
   * on very short values.
   *
   * Usage:
   *   const { leaked, leakedKeys } = sm.scanForLeaks(errorMessage);
   *   if (leaked) scrubAndLog(leakedKeys);
   */
  scanForLeaks(text: string): { leaked: boolean; leakedKeys: SecretKey[] } {
    if (!text || text.length === 0) return { leaked: false, leakedKeys: [] };

    const leakedKeys: SecretKey[] = [];

    for (const [key, value] of this.secrets.entries()) {
      // Skip short values — too likely to produce false positives
      if (value.length < 8) continue;
      if (text.includes(value)) {
        leakedKeys.push(key);
      }
    }

    return { leaked: leakedKeys.length > 0, leakedKeys };
  }

  // -------------------------------------------------------------------------
  // scrubLeaks (convenience helper)
  // -------------------------------------------------------------------------

  /**
   * Replace any leaked secret values in `text` with their masked equivalents.
   * Safe to use before writing to logs or sending error responses.
   */
  scrubLeaks(text: string): string {
    let scrubbed = text;

    for (const [key, value] of this.secrets.entries()) {
      if (value.length < 8) continue;
      if (scrubbed.includes(value)) {
        scrubbed = scrubbed.split(value).join(this.mask(key));
      }
    }

    return scrubbed;
  }

  // -------------------------------------------------------------------------
  // setSecret (runtime override)
  // -------------------------------------------------------------------------

  /**
   * Inject a secret value at runtime (e.g. from a vault or after rotation).
   * Marks the source as 'runtime' and records the rotation timestamp.
   */
  setSecret(key: SecretKey, value: string): void {
    if (!value || value.trim().length === 0) {
      throw new Error(`[SecretManager] Cannot set '${key}' to an empty value`);
    }
    this.secrets.set(key, value.trim());
    const meta = this.metadata.get(key);
    if (meta) {
      meta.source = 'runtime';
      meta.lastRotatedAt = Date.now();
    }
  }

  // -------------------------------------------------------------------------
  // getMetadata
  // -------------------------------------------------------------------------

  /**
   * Return the metadata for a secret (safe to expose — no values).
   */
  getMetadata(key: SecretKey): SecretMetadata | undefined {
    return this.metadata.get(key) ? { ...this.metadata.get(key)! } : undefined;
  }

  // -------------------------------------------------------------------------
  // getAllMetadata (for admin/debug endpoints)
  // -------------------------------------------------------------------------

  /**
   * Return metadata for all registered secrets (never includes values).
   */
  getAllMetadata(): Array<SecretMetadata & { present: boolean; masked: string }> {
    return Array.from(this.metadata.values()).map((meta) => ({
      ...meta,
      present: this.has(meta.key),
      masked: this.has(meta.key) ? this.mask(meta.key) : '[not set]',
    }));
  }

  // -------------------------------------------------------------------------
  // registerFastifyPlugin
  // -------------------------------------------------------------------------

  /**
   * Register the SecretManager as `fastify.secrets` so that route handlers
   * can access secrets via `fastify.secrets.get('JWT_SECRET')`.
   *
   * Also adds an `onSend` hook that scrubs any leaked secrets from response
   * payloads before they are sent to the client.
   */
  registerFastifyPlugin(fastify: FastifyInstance): void {
    // Decorate the fastify instance
    fastify.decorate('secrets', this);

    // Scrub secrets from outgoing payloads (error responses etc.)
    fastify.addHook('onSend', async (_req: unknown, _reply: unknown, payload: unknown) => {
      if (typeof payload !== 'string') return payload;

      const { leaked } = this.scanForLeaks(payload);
      if (!leaked) return payload;

      // Replace leaked values with masked versions
      return this.scrubLeaks(payload);
    });
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _instance: SecretManager | null = null;

/**
 * Return the application-wide SecretManager singleton.
 * Creates and loads from environment on first call.
 */
export function getSecretManager(): SecretManager {
  if (!_instance) {
    _instance = new SecretManager();
    const result = _instance.loadFromEnv();

    if (!result.valid) {
      const issues = [
        ...result.missing.map((k) => `Missing required: ${k}`),
        ...result.expired.map((k) => `Expired: ${k}`),
      ];
      console.warn(`[SecretManager] Validation issues (non-fatal):\n  ${issues.join('\n  ')}`);
    }

    if (result.warnings.length > 0) {
      console.warn(
        '[SecretManager] Warnings:\n  ' + result.warnings.join('\n  ')
      );
    }
  }

  return _instance;
}

/**
 * Reset the singleton — for use in tests only.
 */
export function _resetSecretManagerForTests(): void {
  _instance = null;
}
