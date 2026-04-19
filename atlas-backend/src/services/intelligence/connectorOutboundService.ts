/**
 * connectorOutboundService.ts — Phase 0.986: Outbound connector calls.
 *
 * Handles authenticated outbound HTTP to registered connectors with per-minute
 * rate limiting, trust scoring, and full audit. Never throws; errors become
 * structured ConnectorResult rows with the reason in `error`.
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import type { ConnectorRow } from './connectorRegistryService.js';
import { logWatcherEvent } from './watcherFrameworkService.js';

export type ConnectorAuthType = 'bearer' | 'api_key' | 'oauth2_refresh' | 'none';

export interface ConnectorAuthConfig {
  auth_type: ConnectorAuthType;
  token?: string;
  header_name?: string;
  refresh_token?: string;
  refresh_endpoint?: string;
  refresh_client_id?: string;
  refresh_client_secret?: string;
}

export interface ConnectorPayload {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path?: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface ConnectorResult {
  success: boolean;
  connectorId: string;
  status: number;
  latencyMs: number;
  body: unknown;
  error?: string;
}

export interface ConnectorRegistryConfig {
  endpoint_url?: string;
  rate_limit_rpm?: number;
  auth_config?: ConnectorAuthConfig;
  data_schema?: { entity_type?: string } & Record<string, unknown>;
}

interface RateTracker {
  windowStart: number;
  count: number;
}

const rateLimiters = new Map<string, RateTracker>();

export function __resetRateLimitersForTest(): void {
  rateLimiters.clear();
}

function checkAndIncrementRate(connectorId: string, rpm: number): boolean {
  if (rpm <= 0) return true;
  const now = Date.now();
  const tracker = rateLimiters.get(connectorId) ?? { windowStart: now, count: 0 };
  if (now - tracker.windowStart >= 60_000) {
    tracker.windowStart = now;
    tracker.count = 0;
  }
  if (tracker.count >= rpm) {
    rateLimiters.set(connectorId, tracker);
    return false;
  }
  tracker.count++;
  rateLimiters.set(connectorId, tracker);
  return true;
}

function buildAuthHeaders(auth: ConnectorAuthConfig | undefined): Record<string, string> {
  if (!auth) return {};
  const headers: Record<string, string> = {};
  if (auth.auth_type === 'bearer' && auth.token) {
    headers['Authorization'] = `Bearer ${auth.token}`;
  } else if (auth.auth_type === 'api_key' && auth.token) {
    const name = auth.header_name ?? 'X-API-Key';
    headers[name] = auth.token;
  } else if (auth.auth_type === 'oauth2_refresh' && auth.token) {
    // The refresh flow is assumed to have already produced `token` elsewhere.
    // If only a refresh_token is present, we fall back to bearer nothing.
    headers['Authorization'] = `Bearer ${auth.token}`;
  }
  return headers;
}

/** Read the connector's extended config from its metadata. */
export function readConnectorConfig(connector: ConnectorRow): ConnectorRegistryConfig {
  const meta = connector.connector_metadata ?? {};
  const auth =
    (meta['auth_config'] as ConnectorAuthConfig | undefined) ??
    (connector.auth_method ? { auth_type: connector.auth_method as ConnectorAuthType } : undefined);
  return {
    endpoint_url: typeof meta['endpoint_url'] === 'string' ? (meta['endpoint_url'] as string) : undefined,
    rate_limit_rpm:
      typeof meta['rate_limit_rpm'] === 'number' ? (meta['rate_limit_rpm'] as number) : 60,
    auth_config: auth,
    data_schema: (meta['data_schema'] as ConnectorRegistryConfig['data_schema']) ?? undefined,
  };
}

async function writeOutboundAudit(
  userId: string,
  connectorId: string,
  endpoint: string,
  status: number,
  latencyMs: number,
  ok: boolean,
  extra: Record<string, unknown> = {},
): Promise<void> {
  if (!env.memoryLayerEnabled) return;
  try {
    const now = new Date().toISOString();
    await supabaseRest('POST', 'platform_backup_audit', {
      id: randomUUID(),
      user_id: userId,
      operation: 'export',
      resource_scope: `connector:${connectorId}`,
      status: ok ? 'completed' : 'failed',
      initiated_by: 'connector_outbound',
      destination: endpoint,
      backup_metadata: {
        kind: 'connector_outbound',
        connector_id: connectorId,
        http_status: status,
        latency_ms: latencyMs,
        ...extra,
      },
      started_at: now,
      completed_at: now,
      created_at: now,
    });
  } catch (err) {
    console.error('[connectorOutboundService] writeOutboundAudit error:', err);
  }
}

export interface CallConnectorOptions {
  /** Injected fetch for tests. Signature matches global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Perform an outbound call to a registered connector. Safe: never throws.
 * Returns a ConnectorResult describing success or the failure reason.
 */
export async function callConnector(
  userId: string,
  connector: ConnectorRow,
  payload: ConnectorPayload,
  options: CallConnectorOptions = {},
): Promise<ConnectorResult> {
  const started = Date.now();
  const cfg = readConnectorConfig(connector);

  if (!cfg.endpoint_url) {
    await writeOutboundAudit(userId, connector.id, '<no_endpoint>', 0, 0, false, {
      error: 'no_endpoint_url',
    });
    return {
      success: false,
      connectorId: connector.id,
      status: 0,
      latencyMs: 0,
      body: null,
      error: 'no_endpoint_url',
    };
  }

  // Trust scoring: low trust => open a watcher event and continue.
  if ((connector.trust_score ?? 0.5) < 0.5) {
    await logWatcherEvent(userId, {
      watcher_type: 'connector_low_trust',
      event_class: 'anomaly',
      severity: 'medium',
      description: `Outbound call to low-trust connector ${connector.connector_name}`,
      watcher_metadata: {
        connector_id: connector.id,
        trust_score: connector.trust_score,
      },
    }).catch(() => {});
  }

  const rpm = cfg.rate_limit_rpm ?? 60;
  if (!checkAndIncrementRate(connector.id, rpm)) {
    await writeOutboundAudit(userId, connector.id, cfg.endpoint_url, 429, 0, false, {
      error: 'rate_limited',
      rate_limit_rpm: rpm,
    });
    return {
      success: false,
      connectorId: connector.id,
      status: 429,
      latencyMs: 0,
      body: null,
      error: 'rate_limited',
    };
  }

  const method = payload.method ?? 'GET';
  const path = payload.path ?? '';
  const qs = payload.query
    ? '?' + new URLSearchParams(payload.query).toString()
    : '';
  const fullUrl = `${cfg.endpoint_url.replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}${qs}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(payload.headers ?? {}),
    ...buildAuthHeaders(cfg.auth_config),
  };

  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const res = await fetchImpl(fullUrl, {
      method,
      headers,
      body: payload.body === undefined ? undefined : JSON.stringify(payload.body),
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep raw text */
    }
    const latency = Date.now() - started;
    const ok = res.ok;
    await writeOutboundAudit(userId, connector.id, fullUrl, res.status, latency, ok);
    return {
      success: ok,
      connectorId: connector.id,
      status: res.status,
      latencyMs: latency,
      body: parsed,
      error: ok ? undefined : `http_${res.status}`,
    };
  } catch (err) {
    const latency = Date.now() - started;
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[connectorOutboundService] callConnector error:', err);
    await writeOutboundAudit(userId, connector.id, fullUrl, 0, latency, false, { error: msg });
    return {
      success: false,
      connectorId: connector.id,
      status: 0,
      latencyMs: latency,
      body: null,
      error: msg,
    };
  }
}
