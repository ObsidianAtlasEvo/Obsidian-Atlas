/**
 * Legal API client — thin wrapper around /v1/legal/* endpoints.
 */

import { atlasApiUrl, isAtlasAuthDisabled } from '../atlasApi';

export interface LegalAcceptedRecord {
  version: string;
  acceptedAt: string;
}

export interface LegalAcceptanceState {
  currentVersions: { terms: string; privacy: string };
  accepted: {
    terms: LegalAcceptedRecord | null;
    privacy: LegalAcceptedRecord | null;
  };
  allAccepted: boolean;
}

/**
 * Fetches the current user's acceptance state. Returns null when the request
 * fails (e.g. transient network error). In auth-disabled local dev, returns
 * a synthetic "all accepted" state so the gate doesn't show.
 */
export async function getLegalAcceptance(): Promise<LegalAcceptanceState | null> {
  if (isAtlasAuthDisabled()) {
    return {
      currentVersions: { terms: 'dev', privacy: 'dev' },
      accepted: {
        terms: { version: 'dev', acceptedAt: new Date().toISOString() },
        privacy: { version: 'dev', acceptedAt: new Date().toISOString() },
      },
      allAccepted: true,
    };
  }

  try {
    const res = await fetch(atlasApiUrl('/v1/legal/acceptance'), {
      credentials: 'include',
    });
    if (!res.ok) return null;
    return (await res.json()) as LegalAcceptanceState;
  } catch {
    return null;
  }
}

export interface AcceptLegalResult {
  ok: boolean;
  acceptedAt?: string;
  error?: string;
}

/**
 * Records acceptance of the given document kind at the given version. The
 * server validates that `version` matches the currently required version; if
 * a newer version is required, the request fails with 409 `stale_version`.
 */
export async function acceptLegalDocument(
  kind: 'terms' | 'privacy',
  version: string,
): Promise<AcceptLegalResult> {
  if (isAtlasAuthDisabled()) {
    return { ok: true, acceptedAt: new Date().toISOString() };
  }

  try {
    const res = await fetch(atlasApiUrl('/v1/legal/accept'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ kind, version }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: body.error ?? `http_${res.status}` };
    }
    const body = (await res.json()) as { acceptedAt?: string };
    return { ok: true, acceptedAt: body.acceptedAt };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}
