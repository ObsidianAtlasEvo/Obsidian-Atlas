/**
 * connectorRegistryService.ts — Phase 0.985–0.99: Connector registry & trust.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';

export type ConnectorHealth = 'healthy' | 'degraded' | 'offline' | 'unknown';

export interface ConnectorRow {
  id: string;
  user_id: string;
  connector_name: string;
  connector_type: string | null;
  auth_method: string | null;
  health_status: ConnectorHealth;
  trust_score: number;
  last_checked_at: string | null;
  connector_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ConnectorCreateInput {
  connector_name: string;
  connector_type?: string;
  auth_method?: string;
  health_status?: ConnectorHealth;
  trust_score?: number;
  last_checked_at?: string;
  connector_metadata?: Record<string, unknown>;
}

export async function registerConnector(
  userId: string,
  data: ConnectorCreateInput,
): Promise<ConnectorRow | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const id = randomUUID();
    const now = new Date().toISOString();
    const body = {
      id,
      user_id: userId,
      connector_name: data.connector_name,
      connector_type: data.connector_type ?? null,
      auth_method: data.auth_method ?? null,
      health_status: data.health_status ?? 'unknown',
      trust_score: data.trust_score ?? 0.5,
      last_checked_at: data.last_checked_at ?? null,
      connector_metadata: data.connector_metadata ?? {},
      created_at: now,
      updated_at: now,
    };
    const result = await supabaseRest<ConnectorRow[]>(
      'POST',
      'connector_registry',
      body,
      { Prefer: 'return=representation' },
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return body as ConnectorRow;
    }
    return result.data[0] ?? (body as ConnectorRow);
  } catch (err) {
    console.error('[connectorRegistryService] registerConnector error:', err);
    return null;
  }
}

export async function getConnectorById(
  userId: string,
  connectorId: string,
): Promise<ConnectorRow | null> {
  if (!env.memoryLayerEnabled) return null;
  try {
    const result = await supabaseRest<ConnectorRow[]>(
      'GET',
      `connector_registry?id=eq.${encodeURIComponent(connectorId)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    );
    if (!result.ok || !result.data || result.data.length === 0) return null;
    return result.data[0] ?? null;
  } catch (err) {
    console.error('[connectorRegistryService] getConnectorById error:', err);
    return null;
  }
}

export async function getConnectors(userId: string): Promise<ConnectorRow[]> {
  if (!env.memoryLayerEnabled) return [];
  try {
    const result = await supabaseRest<ConnectorRow[]>(
      'GET',
      `connector_registry?user_id=eq.${encodeURIComponent(userId)}&order=trust_score.desc`,
    );
    if (!result.ok || !result.data) return [];
    return result.data;
  } catch (err) {
    console.error('[connectorRegistryService] getConnectors error:', err);
    return [];
  }
}

export async function updateConnectorHealth(
  userId: string,
  id: string,
  health: ConnectorHealth,
): Promise<boolean> {
  if (!env.memoryLayerEnabled) return false;
  try {
    const result = await supabaseRest(
      'PATCH',
      `connector_registry?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`,
      {
        health_status: health,
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    );
    return result.ok;
  } catch (err) {
    console.error('[connectorRegistryService] updateConnectorHealth error:', err);
    return false;
  }
}

/** Pure: compute trust score from auth × health × freshness. */
export function computeConnectorTrust(
  connector: ConnectorRow,
  nowMs: number = Date.now(),
): number {
  const authMap: Record<string, number> = {
    api_key: 0.7,
    oauth: 0.9,
    jwt: 0.85,
    none: 0.3,
  };
  const authScore = authMap[connector.auth_method ?? 'none'] ?? 0.5;
  const healthMap: Record<ConnectorHealth, number> = {
    healthy: 1,
    degraded: 0.6,
    offline: 0.2,
    unknown: 0.4,
  };
  const healthScore = healthMap[connector.health_status] ?? 0.4;
  let freshness = 0.5;
  if (connector.last_checked_at) {
    const last = new Date(connector.last_checked_at).getTime();
    if (!Number.isNaN(last)) {
      const hours = Math.min((nowMs - last) / (60 * 60 * 1000), 72);
      freshness = 1 - hours / 72;
    }
  }
  const score = authScore * healthScore * freshness;
  return Math.max(0, Math.min(1, score));
}

/** Pure: format a connector summary string. */
export function formatConnectorSummary(connector: ConnectorRow): string {
  const type = connector.connector_type ? ` (${connector.connector_type})` : '';
  return `${connector.connector_name}${type} — ${connector.health_status} trust:${(connector.trust_score ?? 0).toFixed(2)}`;
}
