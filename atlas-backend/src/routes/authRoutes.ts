import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ATLAS_OAUTH_STATE_COOKIE,
  ATLAS_SESSION_COOKIE,
  authSuccessRedirectLocation,
  buildGoogleAuthorizationUrl,
  exchangeGoogleAuthorizationCode,
  fetchGoogleUserProfile,
  googleSubToSupabaseUuid,
  isGoogleAuthConfigured,
  newOAuthState,
  signAtlasSessionJwt,
  upsertTenantFromGoogleOAuth,
  verifyAtlasSessionJwt,
} from '../services/auth/authProvider.js';
import { normalizeEmail } from '../services/intelligence/router.js';
import { env } from '../config/env.js';

const STATE_MAX_AGE_SEC = 600;

function sessionCookieOptions(): {
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  maxAge: number;
} {
  const secure = env.nodeEnv === 'production';
  // 'strict' is safe here because the SPA and API share the same origin
  // (nginx proxies /api and /auth to the Fastify backend).
  // Use 'lax' only if the frontend moves to a different domain and
  // the backend has CORS configured with credentials:true + sameSite:'none'.
  return {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: secure ? 'strict' : 'lax',
    maxAge: 60 * 60 * 24 * 7,
  };
}

function stateCookieOptions(): {
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  maxAge: number;
} {
  const secure = env.nodeEnv === 'production';
  return {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: STATE_MAX_AGE_SEC,
  };
}

function clearCookie(reply: FastifyReply, name: string): void {
  const secure = env.nodeEnv === 'production';
  reply.setCookie(name, '', { path: '/', httpOnly: true, secure, sameSite: secure ? 'strict' : 'lax', maxAge: 0 });
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.get('/auth/google', async (request, reply) => {
    try {
      if (!isGoogleAuthConfigured()) {
        return reply.status(501).send({ error: 'google_oauth_not_configured' });
      }
      const state = newOAuthState();
      reply.setCookie(ATLAS_OAUTH_STATE_COOKIE, state, stateCookieOptions());
      const url = buildGoogleAuthorizationUrl(state);
      return reply.redirect(url);
    } catch (e) {
      request.log.error(e);
      return reply.status(500).send({
        error: 'google_oauth_start_failed',
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  });

  app.get('/auth/google/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isGoogleAuthConfigured()) {
      return reply.status(501).send({ error: 'google_oauth_not_configured' });
    }
    const q = request.query as { code?: string; state?: string; error?: string };
    if (q.error) {
      return reply.status(400).send({ error: 'oauth_denied', detail: q.error });
    }
    const code = typeof q.code === 'string' ? q.code : '';
    const state = typeof q.state === 'string' ? q.state : '';
    const expected = request.cookies?.[ATLAS_OAUTH_STATE_COOKIE];
    clearCookie(reply, ATLAS_OAUTH_STATE_COOKIE);
    if (!code || !state || !expected || state !== expected) {
      return reply.status(400).send({ error: 'invalid_oauth_state' });
    }
    try {
      const { accessToken } = await exchangeGoogleAuthorizationCode(code);
      const profile = await fetchGoogleUserProfile(accessToken);
      if (!profile.emailVerified) {
        return reply.status(403).send({ error: 'email_not_verified' });
      }
      const emailNorm = normalizeEmail(profile.email) ?? profile.email.trim().toLowerCase();
      upsertTenantFromGoogleOAuth(profile.sub, emailNorm);
      const jwt = await signAtlasSessionJwt({
        databaseUserId: profile.sub,
        email: emailNorm,
        supabaseId: googleSubToSupabaseUuid(profile.sub),
      });
      reply.setCookie(ATLAS_SESSION_COOKIE, jwt, sessionCookieOptions());
      return reply.redirect(authSuccessRedirectLocation());
    } catch (e) {
      request.log.error(e);
      return reply.status(502).send({ error: 'oauth_callback_failed' });
    }
  });

  app.post('/auth/signout', async (_request, reply) => {
    clearCookie(reply, ATLAS_SESSION_COOKIE);
    clearCookie(reply, ATLAS_OAUTH_STATE_COOKIE);
    return reply.send({ ok: true });
  });

  /**
   * Lightweight session probe for the SPA. Does not return email (routing identity stays server-side).
   */
  app.get('/v1/auth/session', async (request, reply) => {
    const token = request.cookies?.[ATLAS_SESSION_COOKIE];
    if (!token) {
      return reply.send({ authenticated: false });
    }
    const user = await verifyAtlasSessionJwt(token);
    if (!user) {
      clearCookie(reply, ATLAS_SESSION_COOKIE);
      return reply.send({ authenticated: false });
    }
    return reply.send({
      authenticated: true,
      databaseUserId: user.databaseUserId,
      email: user.email,
    });
  });
}
