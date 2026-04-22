/**
 * Google OAuth + signed session JWT for Atlas (Fastify).
 *
 * Uses the same environment variables as Auth.js / NextAuth-style setups:
 * `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`.
 *
 * This is not the Next.js `next-auth` runtime (that requires a Next app). It implements
 * the same provider contract so you can share credentials with a future NextAuth deployment.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../../config/env.js';
import { getDb } from '../../db/sqlite.js';
import { normalizeEmail } from '../intelligence/router.js';
import { getSubscriptionStatus } from '../billing/stripeService.js';

export const ATLAS_SESSION_COOKIE = 'atlas_session';
export const ATLAS_OAUTH_STATE_COOKIE = 'atlas_google_oauth_state';

export type AuthenticatedAtlasUser = {
  /** Stable id (Google `sub`) — use as `tenant_users.id` / API `userId` after login. */
  databaseUserId: string;
  /** Verified email — server-side routing only; do not branch on this in browser bundles. */
  email: string;
};

export function jwtKeyMaterial(): Uint8Array {
  const secret = env.authSecret?.trim();
  if (!secret) {
    throw new Error('[FATAL] AUTH_SECRET / NEXTAUTH_SECRET is not set. Cannot sign or verify JWTs.');
  }
  return new Uint8Array(createHash('sha256').update(secret).digest());
}

export function isGoogleAuthConfigured(): boolean {
  return Boolean(
    env.googleClientId?.trim() &&
      env.googleClientSecret?.trim() &&
      env.authSecret?.trim() &&
      env.nextAuthUrl?.trim()
  );
}

/** Must match Google Cloud “Authorized redirect URIs” exactly, e.g. https://obsidianatlastech.com/auth/google/callback */
function callbackRedirectUri(): string {
  const base = env.nextAuthUrl!.replace(/\/$/, '');
  return `${base}/auth/google/callback`;
}

export function buildGoogleAuthorizationUrl(oauthState: string): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', env.googleClientId!.trim());
  u.searchParams.set('redirect_uri', callbackRedirectUri());
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', oauthState);
  u.searchParams.set('access_type', 'online');
  u.searchParams.set('prompt', 'select_account');
  return u.toString();
}

export function newOAuthState(): string {
  return randomBytes(24).toString('hex');
}

export async function exchangeGoogleAuthorizationCode(
  code: string
): Promise<{ accessToken: string }> {
  const body = new URLSearchParams({
    code,
    client_id: env.googleClientId!.trim(),
    client_secret: env.googleClientSecret!.trim(),
    redirect_uri: callbackRedirectUri(),
    grant_type: 'authorization_code',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${raw.slice(0, 200)}`);
  }
  const data = JSON.parse(raw) as { access_token?: string };
  if (!data.access_token) throw new Error('Google token response missing access_token');
  return { accessToken: data.access_token };
}

export async function fetchGoogleUserProfile(accessToken: string): Promise<{
  sub: string;
  email: string;
  emailVerified: boolean;
}> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Google userinfo failed (${res.status}): ${raw.slice(0, 200)}`);
  }
  const data = JSON.parse(raw) as {
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
  };
  const sub = typeof data.sub === 'string' ? data.sub : '';
  const email = typeof data.email === 'string' ? data.email : '';
  const ev = data.email_verified;
  const emailVerified = ev === true || ev === 'true';
  if (!sub || !email) throw new Error('Google userinfo missing sub or email');
  return { sub, email, emailVerified };
}

export async function signAtlasSessionJwt(user: AuthenticatedAtlasUser): Promise<string> {
  const key = jwtKeyMaterial();
  if (key.length === 0) throw new Error('AUTH_SECRET / NEXTAUTH_SECRET not configured');
  const jwt = await new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.databaseUserId)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key);
  return jwt;
}

export async function verifyAtlasSessionJwt(token: string): Promise<AuthenticatedAtlasUser | null> {
  try {
    const key = jwtKeyMaterial();
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    const emailRaw = payload.email;
    const email = typeof emailRaw === 'string' ? emailRaw : '';
    if (!sub || !email) return null;
    return { databaseUserId: sub, email };
  } catch (err) {
    console.error('[AUTH] JWT verification failed — key material unavailable or token invalid:', err);
    return null;
  }
}

function readCookie(request: FastifyRequest, name: string): string | undefined {
  const raw = request.headers.cookie;
  if (!raw) return undefined;
  const parts = raw.split(';');
  for (const p of parts) {
    const [k, ...rest] = p.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('=').trim());
  }
  return undefined;
}

function sessionTokenFromRequest(request: FastifyRequest): string | undefined {
  const jar = (request as FastifyRequest & { cookies?: Record<string, string | undefined> }).cookies;
  const fromPlugin = jar?.[ATLAS_SESSION_COOKIE];
  if (typeof fromPlugin === 'string' && fromPlugin.length) return fromPlugin;
  return readCookie(request, ATLAS_SESSION_COOKIE);
}

export async function getAuthenticatedUser(request: FastifyRequest): Promise<AuthenticatedAtlasUser | null> {
  if (request.atlasAuthUser !== undefined && request.atlasAuthUser !== null) {
    return request.atlasAuthUser;
  }
  const token = sessionTokenFromRequest(request);
  if (!token) return null;
  const user = await verifyAtlasSessionJwt(token);
  if (user) request.atlasAuthUser = user;
  return user;
}

/**
 * Hydrates `request.atlasAuthUser` and sets `request.atlasVerifiedEmail` from the OAuth session
 * (never from client JSON). Call at the start of protected handlers.
 */
export async function attachAtlasSession(request: FastifyRequest): Promise<void> {
  const u = await getAuthenticatedUser(request);
  if (u) {
    request.atlasVerifiedEmail = normalizeEmail(u.email);

    // Attach subscription tier for downstream quota/model-access checks
    try {
      const sub = await getSubscriptionStatus(u.databaseUserId, getDb(), u.email);
      request.subscriptionTier = sub?.tier ?? 'core';
    } catch {
      request.subscriptionTier = 'core';
    }
  }
}

export function upsertTenantFromGoogleOAuth(sub: string, email: string): void {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tenant_users (id, email, created_at, plan_tier)
       VALUES (?, ?, ?, 'free')
       ON CONFLICT(id) DO UPDATE SET email = excluded.email`
    ).run(sub, email, now);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[AUTH] tenant_users upsert failed (table may not exist in Supabase): ${msg}`);
  }
}

export function authSuccessRedirectLocation(): string {
  const custom = env.authSuccessRedirect?.trim();
  if (custom) return custom;
  return env.nextAuthUrl?.replace(/\/$/, '') ?? '/';
}
