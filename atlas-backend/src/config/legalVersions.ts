/**
 * Current required versions of each legal document.
 *
 * Must be kept in sync with src/lib/legal/documents.ts on the frontend.
 * Bumping a version forces all users to re-accept on next request.
 *
 * Using ISO date strings (YYYY-MM-DD) so version comparison is string-sortable.
 */

export const CURRENT_TERMS_VERSION = '2026-04-18';
export const CURRENT_PRIVACY_VERSION = '2026-04-18';

export type LegalKind = 'terms' | 'privacy';

export function currentVersionFor(kind: LegalKind): string {
  return kind === 'terms' ? CURRENT_TERMS_VERSION : CURRENT_PRIVACY_VERSION;
}
