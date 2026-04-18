/**
 * supabase.ts — Shared Supabase REST helper.
 *
 * Uses raw fetch() to avoid a hard dependency on @supabase/supabase-js
 * (consistent with queueManager.ts and other existing Supabase callers).
 *
 * All operations use the service-role key (bypasses RLS).
 */

function getConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ''), key };
}

export interface SupabaseRestResult<T = unknown> {
  ok: boolean;
  data?: T;
  status?: number;
}

/**
 * Low-level Supabase REST request.
 * `path` is appended to `/rest/v1/` — e.g. `atlas_evolution_profiles?user_id=eq.abc`.
 */
export async function supabaseRest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<SupabaseRestResult<T>> {
  const cfg = getConfig();
  if (!cfg) return { ok: false };

  try {
    const headers: Record<string, string> = {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
    };

    if (method === 'POST') {
      headers['Prefer'] = 'return=representation';
    } else if (method === 'PATCH') {
      headers['Prefer'] = 'return=representation';
    } else if (method === 'GET') {
      headers['Prefer'] = 'return=representation';
    }

    if (extraHeaders) {
      Object.assign(headers, extraHeaders);
    }

    const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) return { ok: false, status: res.status };

    if (method === 'DELETE') return { ok: true, status: res.status };

    const data = (await res.json()) as T;
    return { ok: true, data, status: res.status };
  } catch {
    return { ok: false };
  }
}
