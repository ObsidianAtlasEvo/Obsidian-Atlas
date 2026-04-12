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
 * Use live Atlas HTTP (vs offline mock) when we have a direct URL, Vite dev proxy,
 * `VITE_ATLAS_SAME_ORIGIN`, or a production build (Caddy/nginx proxies `/api` to backend).
 */
export function atlasHttpEnabled(): boolean {
  return Boolean(getAtlasApiBase()) || import.meta.env.DEV || isAtlasSameOriginApi() || import.meta.env.PROD;
}

/**
 * Whether Atlas **chat** should call the HTTP backend (`/v1/chat/omni-stream`) instead of browser → Ollama only.
 *
 * `atlasHttpEnabled()` alone is often **false** in production when `VITE_ATLAS_SAME_ORIGIN` was not set at build
 * time; Rollup then tree-shakes the omni client out of `dist/`, so `grep omni-stream` finds nothing even though
 * the server proxies `/api`. This helper defaults to **true** in production builds unless
 * `VITE_ATLAS_LOCAL_OLLAMA=true` (or `1`) opts into an Ollama-only bundle.
 */
export function atlasChatUseHttpBackend(): boolean {
  if (atlasHttpEnabled()) return true;
  const localOnly = import.meta.env.VITE_ATLAS_LOCAL_OLLAMA;
  if (localOnly === 'true' || localOnly === '1') return false;
  return import.meta.env.PROD;
}

const PROXY_API_PREFIX = '/api';

/**
 * Standard headers for omni-stream and other authenticated backend calls.
 * In dev, sends `X-Atlas-Verified-Email` so the backend routes to local Ollama
 * without requiring full OAuth (backend must set ATLAS_TRUST_ROUTING_EMAIL_HEADER=true).
 */
export function atlasStreamHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (import.meta.env.DEV) {
    h['X-Atlas-Verified-Email'] = 'crowleyrc62@gmail.com';
  }
  return h;
}

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
