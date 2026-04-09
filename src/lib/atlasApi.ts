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
