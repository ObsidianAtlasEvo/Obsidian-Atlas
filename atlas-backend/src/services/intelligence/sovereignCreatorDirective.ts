/**
 * sovereignCreatorDirective.ts
 * Obsidian Atlas — Sovereign Creator identity resolution.
 *
 * Single source of truth for the Sovereign Creator identity check.
 * All files that previously hardcoded crowleyrc62@gmail.com should import from here.
 *
 * COMPATIBILITY: Exports both isSovereignOwner (groundwork v4 signature) and
 * isSovereignOwnerEmail (live repo signature) so no call site needs to change at merge time.
 */

import { SOVEREIGN_CREATOR_EMAIL as CANONICAL_EMAIL } from '../../config/sovereignCreator.js';

// ---------------------------------------------------------------------------
// Sovereign identity constants
// ---------------------------------------------------------------------------

/**
 * The canonical Sovereign Creator email.
 * Importable so legalHoldRegistry.ts and layerLockGuard.ts can stop hardcoding it.
 */
export const SOVEREIGN_CREATOR_EMAIL =
  process.env['SOVEREIGN_CREATOR_EMAIL'] ?? CANONICAL_EMAIL;

// ---------------------------------------------------------------------------
// Sovereign identity check
// ---------------------------------------------------------------------------

/**
 * Returns true if the given userId or email matches the Sovereign Creator.
 *
 * Resolution order:
 *   1. SOVEREIGN_CREATOR_USER_ID env var match (userId-based)
 *   2. SOVEREIGN_CREATOR_EMAIL env var (or hardcoded fallback) match (email-based)
 *
 * Either match is sufficient. Warns at most once if neither env var is set.
 *
 * @param userId  Atlas internal user ID (optional)
 * @param email   User email address (optional)
 */
export function isSovereignOwner(userId?: string, email?: string | null): boolean {
  const sovereignId = process.env['SOVEREIGN_CREATOR_USER_ID'] ?? '';
  const sovereignEmail = SOVEREIGN_CREATOR_EMAIL;

  const idMatch = Boolean(userId) && Boolean(sovereignId) && userId === sovereignId;
  const emailMatch =
    Boolean(email) && email!.trim().toLowerCase() === sovereignEmail.trim().toLowerCase();

  if (!sovereignId && !process.env['SOVEREIGN_CREATOR_EMAIL']) {
    if (!(globalThis as Record<string, unknown>)['_sovereignWarnLogged']) {
      console.warn(
        '[Atlas/Sovereign] Neither SOVEREIGN_CREATOR_USER_ID nor SOVEREIGN_CREATOR_EMAIL is set. ' +
        'Sovereign bypass is inactive.'
      );
      (globalThis as Record<string, unknown>)['_sovereignWarnLogged'] = true;
    }
  }

  return idMatch || emailMatch;
}

/**
 * Compatibility alias — all live repo callers use isSovereignOwnerEmail(email).
 * This alias allows existing call sites to compile without modification after merge.
 *
 * After all callers are migrated to isSovereignOwner(), this alias can be removed.
 */
export function isSovereignOwnerEmail(email: string | null | undefined): boolean {
  return isSovereignOwner(undefined, email ?? undefined);
}
