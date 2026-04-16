/**
 * Atlas backend URL strategy:
 * - If `VITE_ATLAS_API_URL` is set → absolute URLs (direct API or CDN).
 * - If unset → same-origin relative paths: `/api/v1/...` (Vite dev proxy or edge → backend). Avoid hardcoded `http://localhost` here to prevent mixed content over HTTPS (e.g. Cloudflare Tunnel).
 * - Auth routes stay at `/auth/...` (separate Vite proxy; no `/api` prefix).
 */

/** Explicit API origin, no trailing slash (optional). */
export function getAtlasApiBase(): string | undefined {
  const raw = import.meta.env.VITE_ATLAS_API_URL as string | undefined;
  const t = raw?.trim();
  return t ? t.replace(/\/$/, '') : undefined;
}

/** When true, AuthGuard does not block the shell (local dev without OAuth). */
export function isAtlasAuthDisabled(): boolean {
  const v = import.meta.env.VITE_ATLAS_AUTH_DISABLED;
  return v === 'true' || v === '1';
}

/**
 * Same-origin deployment: Vite proxy (dev) or nginx routes `/api` → backend.
 * Set in production when the SPA and API share a host and you use relative `/api` paths only.
 */
export function isAtlasSameOriginApi(): boolean {
  const v = import.meta.env.VITE_ATLAS_SAME_ORIGIN;
  return v === 'true' || v === '1';
}

/**
 * Use live Atlas HTTP (vs offline mock) when we have a direct URL, Vite dev proxy, or `VITE_ATLAS_SAME_ORIGIN`.
 *
 * PRODUCTION REQUIREMENT: In production builds, `import.meta.env.DEV` is false.
 * You MUST set either `VITE_ATLAS_API_URL` (absolute backend origin) or
 * `VITE_ATLAS_SAME_ORIGIN=true` (when frontend/backend share a host behind
 * nginx or similar). Without one of these, this function returns false, and all
 * governance console / AI commands will skip the backend entirely, falling
 * through to the local Ollama path (which won't exist in production).
 * See .env.example for configuration details.
 */
export function atlasHttpEnabled(): boolean {
  return Boolean(getAtlasApiBase()) || import.meta.env.DEV || isAtlasSameOriginApi();
}

const PROXY_API_PREFIX = '/api';

/** Backend paths like `/v1/auth/session`, `/v1/chat/omni-stream`. */
export function atlasApiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  const base = getAtlasApiBase();
  if (base) return `${base}${p}`;
  return `${PROXY_API_PREFIX}${p}`;
}

/** OAuth and cookie auth routes: `/auth/google`, `/auth/signout`. */
export function atlasAuthUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  const base = getAtlasApiBase();
  if (base) return `${base}${p}`;
  return p;
}

// ---------------------------------------------------------------------------
// User preferences API
// ---------------------------------------------------------------------------

export interface UserPreferences {
  preferredModel: string | null;
  availableModels: string[];
  tier: string;
}

export async function getUserPreferences(): Promise<UserPreferences | null> {
  try {
    const res = await fetch(atlasApiUrl('/api/user/preferences'), {
      credentials: 'include',
    });
    if (!res.ok) return null;
    return (await res.json()) as UserPreferences;
  } catch {
    return null;
  }
}

export async function patchUserPreferences(
  preferredModel: string | null,
): Promise<{ preferredModel: string | null } | null> {
  try {
    const res = await fetch(atlasApiUrl('/api/user/preferences'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ preferredModel }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { preferredModel: string | null };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Model display names and tier metadata
// ---------------------------------------------------------------------------

/** Map from model registry ID to human-readable display name. */
export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'openai/gpt-3.5-turbo':          'GPT-3.5 Turbo',
  'groq/llama-3.1-70b-versatile':  'Llama 3.1 70B (Groq)',
  'google/gemini-2.5-flash':       'Gemini 2.5 Flash',
  'omnirouter':                     'OmniRouter',
  'openai/gpt-4o-mini':            'GPT-4o Mini',
  'google/gemini-2.0-flash':       'Gemini 2.0 Flash',
  'openai/gpt-4o':                 'GPT-4o',
  'openai/o1-preview':             'o1 Preview',
  'anthropic/claude-3-opus':       'Claude 3 Opus',
  'anthropic/claude-3.5-sonnet':   'Claude 3.5 Sonnet',
};

/** Which tier first unlocks each model (for lock icon display). */
export const MODEL_MIN_TIER: Record<string, string> = {
  'groq/llama-3.1-70b-versatile':  'free',
  'google/gemini-2.5-flash':       'free',
  'omnirouter':                     'free',
  'openai/gpt-3.5-turbo':          'core',
  'openai/gpt-4o-mini':            'core',
  'google/gemini-2.0-flash':       'core',
  'openai/gpt-4o':                 'sovereign',
  'openai/o1-preview':             'sovereign',
  'anthropic/claude-3-opus':       'sovereign',
  'anthropic/claude-3.5-sonnet':   'sovereign',
};

/** All known models in display order. */
export const ALL_MODELS_ORDERED: string[] = [
  'openai/gpt-3.5-turbo',
  'groq/llama-3.1-70b-versatile',
  'google/gemini-2.5-flash',
  'omnirouter',
  'openai/gpt-4o-mini',
  'google/gemini-2.0-flash',
  'openai/gpt-4o',
  'openai/o1-preview',
  'anthropic/claude-3-opus',
  'anthropic/claude-3.5-sonnet',
];

const TRANSIENT_USER_MESSAGE = 'Atlas is momentarily overloaded. Please try again in a few seconds.';

/** Replace raw API error strings with a clean user-facing message. */
export function sanitizeAtlasError(msg: string): string {
  if (
    msg.includes('[GoogleGenerativeAI Error]') ||
    msg.includes('GoogleGenerativeAI') ||
    (msg.includes('503') && (msg.includes('Service Unavailable') || msg.includes('overloaded'))) ||
    msg.includes('high demand') ||
    (msg.includes('429') && (msg.includes('Rate limit') || msg.includes('Too Many Requests'))) ||
    msg.includes('RESOURCE_EXHAUSTED')
  ) {
    return TRANSIENT_USER_MESSAGE;
  }
  return msg;
}
