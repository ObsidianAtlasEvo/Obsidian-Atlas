/**
 * legalRoutes.ts — Terms & Privacy Policy acceptance tracking.
 *
 * GET  /v1/legal/versions     → { terms: "2026-04-18", privacy: "2026-04-18" }  (public)
 * GET  /v1/legal/acceptance   → { terms: {...} | null, privacy: {...} | null }  (protected)
 * POST /v1/legal/accept       → body: { kind: 'terms' | 'privacy', version: string }  (protected)
 *
 * Auth: acceptance endpoints require a valid Atlas session (same pattern as
 * billing/preferences routes). Versions endpoint is public so the frontend
 * can detect the current required versions before showing the gate.
 *
 * Storage: acceptance is stored directly on `tenant_users` (see migration in
 * src/db/sqlite.ts). We intentionally don't keep a full audit log of every
 * acceptance event — only the latest accepted version + timestamp per kind.
 * Bumping a version forces re-acceptance because the stored version no
 * longer matches the current required version.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Database } from 'better-sqlite3';
import { currentVersionFor, type LegalKind, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from '../config/legalVersions.js';

interface AcceptRequestBody {
  kind?: unknown;
  version?: unknown;
}

function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
): { userId: string; email: string } | null {
  const session = request.atlasSession;
  if (!session) {
    void reply.status(401).send({ error: 'unauthorized', message: 'Atlas session required' });
    return null;
  }
  return session;
}

interface TenantLegalRow {
  terms_version_accepted: string | null;
  terms_accepted_at: string | null;
  privacy_version_accepted: string | null;
  privacy_accepted_at: string | null;
}

function readAcceptance(db: Database, userId: string): TenantLegalRow | null {
  const row = db
    .prepare(
      `SELECT terms_version_accepted, terms_accepted_at,
              privacy_version_accepted, privacy_accepted_at
       FROM tenant_users WHERE id = ?`,
    )
    .get(userId) as TenantLegalRow | undefined;
  return row ?? null;
}

function isValidKind(v: unknown): v is LegalKind {
  return v === 'terms' || v === 'privacy';
}

function isValidVersion(v: unknown): v is string {
  // ISO date (YYYY-MM-DD) — strict to prevent arbitrary tagging
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function registerLegalRoutes(fastify: FastifyInstance, db: Database): void {
  // Public — current required versions (no auth required so we can detect
  // staleness before or during the auth flow).
  fastify.get('/v1/legal/versions', async (_request, reply) => {
    return reply.send({
      terms: CURRENT_TERMS_VERSION,
      privacy: CURRENT_PRIVACY_VERSION,
    });
  });

  // Protected — current user's acceptance state.
  fastify.get('/v1/legal/acceptance', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = requireSession(request, reply);
    if (!session) return;

    const row = readAcceptance(db, session.userId);
    const termsAccepted =
      row?.terms_version_accepted === CURRENT_TERMS_VERSION ? row.terms_accepted_at : null;
    const privacyAccepted =
      row?.privacy_version_accepted === CURRENT_PRIVACY_VERSION ? row.privacy_accepted_at : null;

    return reply.send({
      currentVersions: {
        terms: CURRENT_TERMS_VERSION,
        privacy: CURRENT_PRIVACY_VERSION,
      },
      accepted: {
        terms: termsAccepted
          ? { version: row?.terms_version_accepted ?? null, acceptedAt: termsAccepted }
          : null,
        privacy: privacyAccepted
          ? { version: row?.privacy_version_accepted ?? null, acceptedAt: privacyAccepted }
          : null,
      },
      allAccepted: termsAccepted !== null && privacyAccepted !== null,
    });
  });

  // Protected — record acceptance. Idempotent: re-POSTing same version is a no-op.
  fastify.post('/v1/legal/accept', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = requireSession(request, reply);
    if (!session) return;

    const body = (request.body ?? {}) as AcceptRequestBody;
    if (!isValidKind(body.kind)) {
      return reply.status(400).send({ error: 'invalid_kind', message: "kind must be 'terms' or 'privacy'" });
    }
    if (!isValidVersion(body.version)) {
      return reply.status(400).send({ error: 'invalid_version', message: 'version must be YYYY-MM-DD' });
    }

    const required = currentVersionFor(body.kind);
    if (body.version !== required) {
      return reply.status(409).send({
        error: 'stale_version',
        message: `Current required version for ${body.kind} is ${required}`,
        currentVersion: required,
      });
    }

    const now = new Date().toISOString();
    const versionCol = body.kind === 'terms' ? 'terms_version_accepted' : 'privacy_version_accepted';
    const timestampCol = body.kind === 'terms' ? 'terms_accepted_at' : 'privacy_accepted_at';

    // Upsert: if the user row doesn't exist yet (edge case — auth should have
    // created it), insert with minimal fields.
    const existing = db.prepare(`SELECT id FROM tenant_users WHERE id = ?`).get(session.userId);
    if (!existing) {
      db.prepare(
        `INSERT INTO tenant_users (id, email, created_at, plan_tier, ${versionCol}, ${timestampCol})
         VALUES (?, ?, ?, 'free', ?, ?)`,
      ).run(session.userId, session.email, now, body.version, now);
    } else {
      db.prepare(
        `UPDATE tenant_users SET ${versionCol} = ?, ${timestampCol} = ? WHERE id = ?`,
      ).run(body.version, now, session.userId);
    }

    return reply.send({ ok: true, kind: body.kind, version: body.version, acceptedAt: now });
  });
}
