/**
 * Application configuration — all values read from environment variables
 * with sensible defaults for local development.
 */

function parseIntEnv(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseStringEnv(key: string, defaultValue: string): string {
  return process.env[key]?.trim() || defaultValue;
}

function parseStringArrayEnv(key: string, defaultValue: string[]): string[] {
  const raw = process.env[key]?.trim();
  if (!raw) return defaultValue;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export const config = {
  /** HTTP port the Fastify server listens on */
  port: parseIntEnv('PORT', 3001),

  /** Host/interface to bind */
  host: parseStringEnv('HOST', '127.0.0.1'),

  /**
   * Host base for Ollama HTTP API (no trailing `/api`).
   * Prefer `OLLAMA_BASE_URL` (same as atlas-backend `env`) so health checks match embeddings.
   */
  ollamaUrl: (() => {
    const raw = (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_URL || 'http://127.0.0.1:11434').trim();
    let u = raw.replace(/\/$/, '');
    if (u.endsWith('/api')) u = u.slice(0, -4).replace(/\/$/, '');
    return u || 'http://127.0.0.1:11434';
  })(),

  /** Default chat/completion model */
  chatModel: parseStringEnv('CHAT_MODEL', 'llama3.1:70b'),

  /** Embedding model */
  embedModel: parseStringEnv('EMBED_MODEL', 'nomic-embed-text'),

  /** Allowed CORS origins */
  corsOrigins: parseStringArrayEnv('CORS_ORIGINS', ['http://localhost:3000']),

  /** Request timeout in milliseconds for Ollama calls */
  requestTimeoutMs: parseIntEnv('REQUEST_TIMEOUT_MS', 120_000),
} as const;

export type Config = typeof config;
