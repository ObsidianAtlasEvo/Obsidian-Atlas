import { useState, useEffect, useCallback } from 'react';
import { atlasApiUrl } from '../../lib/atlasApi';
import type { Explanation } from './explainabilityTypes';

export function useExplainabilityFeed(userId: string | undefined, limit = 80) {
  const [data, setData] = useState<Explanation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const uid = userId?.trim();
    if (!uid) {
      setData([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url =
        atlasApiUrl('/v1/explanations') +
        `?userId=${encodeURIComponent(uid)}&limit=${encodeURIComponent(String(limit))}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || res.statusText);
      }
      const json = (await res.json()) as { data?: Explanation[] };
      setData(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      setData([]);
      setError(e instanceof Error ? e.message : 'Failed to load explanations');
    } finally {
      setLoading(false);
    }
  }, [userId, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refetch: load };
}
