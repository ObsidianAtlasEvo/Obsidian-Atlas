import type { FastifyRequest } from 'fastify';
import { env } from '../../config/env.js';
import { normalizeEmail } from '../intelligence/router.js';

const HEADER_VERIFIED_EMAIL = 'x-atlas-verified-email';

/**
 * Email used only for server-side compute routing. Prefer OAuth session / JWT after Phase 1 auth;
 * optionally accept a gateway-injected header when {@link env.trustAtlasRoutingEmailHeader} is enabled.
 */
export function getVerifiedUserEmail(request: FastifyRequest): string | null {
  if (env.trustAtlasRoutingEmailHeader) {
    const raw = request.headers[HEADER_VERIFIED_EMAIL];
    if (typeof raw === 'string' && raw.trim()) return normalizeEmail(raw);
    if (Array.isArray(raw) && raw[0]) return normalizeEmail(raw[0]);
  }
  if (typeof request.atlasVerifiedEmail === 'string' && request.atlasVerifiedEmail.trim()) {
    return normalizeEmail(request.atlasVerifiedEmail);
  }
  return null;
}
