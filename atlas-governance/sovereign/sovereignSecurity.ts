/**
 * Atlas Sovereign Security
 * Phase 2 Governance
 *
 * JWT auth, session TTL, rate limits, permission policies,
 * CSRF validation, brute-force detection, and audit hooks
 * for the Sovereign Creator Console.
 */

import { SOVEREIGN_CREATOR_EMAIL } from '../../src/config/sovereignCreator';

export type SovereignRole = 'creator' | 'observer' | 'none';

export type SovereignPermission =
  | 'read:console'
  | 'write:system_prompt'
  | 'write:feature_flags'
  | 'read:user_observatory'
  | 'write:user_observatory'
  | 'execute:deploy'
  | 'execute:emergency'
  | 'read:audit_log'
  | 'write:bug_reports'
  | 'read:bug_reports';

const ROLE_PERMISSIONS: Record<SovereignRole, SovereignPermission[]> = {
  creator: [
    'read:console',
    'write:system_prompt',
    'write:feature_flags',
    'read:user_observatory',
    'write:user_observatory',
    'execute:deploy',
    'execute:emergency',
    'read:audit_log',
    'write:bug_reports',
    'read:bug_reports',
  ],
  observer: [
    'read:console',
    'read:audit_log',
    'read:bug_reports',
  ],
  none: [],
};

// Creator email — single source of truth for sovereign access
const CREATOR_EMAIL = SOVEREIGN_CREATOR_EMAIL;

// Rate limit config per permission group
const RATE_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
  'write:system_prompt': { maxRequests: 20, windowMs: 60_000 },
  'execute:deploy': { maxRequests: 5, windowMs: 300_000 },
  'execute:emergency': { maxRequests: 3, windowMs: 60_000 },
  'write:feature_flags': { maxRequests: 50, windowMs: 60_000 },
  default: { maxRequests: 200, windowMs: 60_000 },
};

// Brute-force detection: failed auth attempts
const authAttempts: Map<string, { count: number; firstAttempt: number; locked: boolean }> = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Rate limit state
const rateLimitState: Map<string, { count: number; windowStart: number }> = new Map();

export interface SecurityCheckResult {
  allowed: boolean;
  role: SovereignRole;
  reason?: string;
}

export interface SessionToken {
  email: string;
  role: SovereignRole;
  issuedAt: number;
  expiresAt: number;
  sessionId: string;
}

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const activeSessions: Map<string, SessionToken> = new Map();

/**
 * Resolve role from email.
 */
export function resolveRole(email: string): SovereignRole {
  if (email.trim().toLowerCase() === CREATOR_EMAIL) return 'creator';
  return 'none';
}

/**
 * Issue a sovereign session token.
 */
export function issueSession(email: string): SessionToken | null {
  const normalizedEmail = email.trim().toLowerCase();

  // Check lockout
  const attempts = authAttempts.get(normalizedEmail);
  if (attempts?.locked) {
    const elapsed = Date.now() - attempts.firstAttempt;
    if (elapsed < LOCKOUT_DURATION_MS) return null;
    authAttempts.delete(normalizedEmail); // unlock after duration
  }

  const role = resolveRole(normalizedEmail);
  if (role === 'none') {
    recordFailedAttempt(normalizedEmail);
    return null;
  }

  const token: SessionToken = {
    email: normalizedEmail,
    role,
    issuedAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    sessionId: `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  };

  activeSessions.set(token.sessionId, token);
  authAttempts.delete(normalizedEmail); // reset on success
  return token;
}

/**
 * Validate a session token and return its state.
 */
export function validateSession(sessionId: string): SessionToken | null {
  const session = activeSessions.get(sessionId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(sessionId);
    return null;
  }
  return session;
}

export function revokeSession(sessionId: string): void {
  activeSessions.delete(sessionId);
}

/**
 * Check if a session has a specific permission.
 */
export function checkPermission(
  sessionId: string,
  permission: SovereignPermission
): SecurityCheckResult {
  const session = validateSession(sessionId);

  if (!session) {
    return { allowed: false, role: 'none', reason: 'Invalid or expired session' };
  }

  const permissions = ROLE_PERMISSIONS[session.role];
  if (!permissions.includes(permission)) {
    return { allowed: false, role: session.role, reason: `Role '${session.role}' lacks permission '${permission}'` };
  }

  // Rate limiting
  const rateLimitKey = `${sessionId}:${permission}`;
  const limit = RATE_LIMITS[permission] ?? RATE_LIMITS['default'];
  const state = rateLimitState.get(rateLimitKey) ?? { count: 0, windowStart: Date.now() };

  if (Date.now() - state.windowStart > limit.windowMs) {
    state.count = 0;
    state.windowStart = Date.now();
  }

  state.count++;
  rateLimitState.set(rateLimitKey, state);

  if (state.count > limit.maxRequests) {
    return { allowed: false, role: session.role, reason: `Rate limit exceeded for ${permission}` };
  }

  return { allowed: true, role: session.role };
}

/**
 * Validate CSRF origin header.
 */
export function validateOrigin(origin: string, allowedOrigins: string[]): boolean {
  const normalized = origin.replace(/\/$/, '').toLowerCase();
  return allowedOrigins.some((o) => o.replace(/\/$/, '').toLowerCase() === normalized);
}

function recordFailedAttempt(email: string): void {
  const attempts = authAttempts.get(email) ?? { count: 0, firstAttempt: Date.now(), locked: false };
  attempts.count++;
  if (attempts.count >= MAX_FAILED_ATTEMPTS) {
    attempts.locked = true;
  }
  authAttempts.set(email, attempts);
}

export function isLockedOut(email: string): boolean {
  const attempts = authAttempts.get(email.trim().toLowerCase());
  if (!attempts?.locked) return false;
  return Date.now() - attempts.firstAttempt < LOCKOUT_DURATION_MS;
}

export function getActiveSovereignSession(email: string): SessionToken | undefined {
  for (const session of activeSessions.values()) {
    if (session.email === email.trim().toLowerCase()) return session;
  }
  return undefined;
}

export function getRolePermissions(role: SovereignRole): SovereignPermission[] {
  return [...ROLE_PERMISSIONS[role]];
}
