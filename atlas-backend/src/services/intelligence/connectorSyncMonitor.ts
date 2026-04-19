/**
 * connectorSyncMonitor.ts — Phase 0.986: detect stale/failed connectors, raise watcher events.
 */

import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import type { ConnectorRow } from './connectorRegistryService.js';
import { getConnectors } from './connectorRegistryService.js';
import { logWatcherEvent } from './watcherFrameworkService.js';

export interface ConnectorSummary {
  id: string;
  name: string;
  health: string;
  trust_score: number;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  reason?: string;
}

export interface SyncHealthReport {
  healthy: ConnectorSummary[];
  stale: ConnectorSummary[];
  failed: ConnectorSummary[];
}

function summarize(c: ConnectorRow, reason?: string): ConnectorSummary {
  const meta = c.connector_metadata ?? {};
  return {
    id: c.id,
    name: c.connector_name,
    health: c.health_status,
    trust_score: c.trust_score ?? 0,
    lastSyncedAt: typeof meta['last_synced_at'] === 'string' ? (meta['last_synced_at'] as string) : null,
    lastSyncStatus: typeof meta['last_sync_status'] === 'string' ? (meta['last_sync_status'] as string) : null,
    ...(reason ? { reason } : {}),
  };
}

/** Pure: decide bucket for a single connector at a given time. */
export function classifyConnector(
  c: ConnectorRow,
  nowMs: number = Date.now(),
): 'healthy' | 'stale' | 'failed' {
  const meta = c.connector_metadata ?? {};
  const lastStatus = typeof meta['last_sync_status'] === 'string' ? (meta['last_sync_status'] as string) : null;
  const failures = typeof meta['consecutive_failures'] === 'number' ? (meta['consecutive_failures'] as number) : 0;
  if (lastStatus === 'failed' && failures >= 3) return 'failed';

  const refresh =
    typeof meta['refresh_interval_minutes'] === 'number'
      ? (meta['refresh_interval_minutes'] as number)
      : 60;
  const lastSynced = typeof meta['last_synced_at'] === 'string' ? (meta['last_synced_at'] as string) : null;
  if (!lastSynced) return 'stale';
  const lastMs = new Date(lastSynced).getTime();
  if (Number.isNaN(lastMs)) return 'stale';
  if (nowMs - lastMs > refresh * 60_000) return 'stale';

  if (lastStatus === 'failed') return 'failed';
  return 'healthy';
}

export async function runSyncHealthCheck(userId: string): Promise<SyncHealthReport> {
  const report: SyncHealthReport = { healthy: [], stale: [], failed: [] };
  try {
    if (!env.memoryLayerEnabled) return report;
    const connectors = await getConnectors(userId);
    const now = Date.now();
    for (const c of connectors) {
      const bucket = classifyConnector(c, now);
      if (bucket === 'healthy') {
        report.healthy.push(summarize(c));
      } else if (bucket === 'stale') {
        report.stale.push(summarize(c, 'stale_sync'));
        await logWatcherEvent(userId, {
          watcher_type: 'connector_stale',
          event_class: 'staleness',
          severity: 'medium',
          description: `Connector ${c.connector_name} has stale sync data`,
          watcher_metadata: { connector_id: c.id },
        }).catch(() => {});
      } else {
        report.failed.push(summarize(c, 'failed_sync'));
        await logWatcherEvent(userId, {
          watcher_type: 'connector_failed',
          event_class: 'violation',
          severity: 'high',
          description: `Connector ${c.connector_name} has 3+ consecutive failed syncs`,
          watcher_metadata: { connector_id: c.id },
        }).catch(() => {});
      }
    }
    return report;
  } catch (err) {
    console.error('[connectorSyncMonitor] runSyncHealthCheck error:', err);
    return report;
  }
}

/** Thin convenience used by Supabase/other modules that want raw classify logic. */
export async function _listConnectorsRaw(userId: string): Promise<ConnectorRow[]> {
  if (!env.memoryLayerEnabled) return [];
  try {
    const res = await supabaseRest<ConnectorRow[]>(
      'GET',
      `connector_registry?user_id=eq.${encodeURIComponent(userId)}`,
    );
    if (!res.ok || !res.data) return [];
    return res.data;
  } catch (err) {
    console.error('[connectorSyncMonitor] _listConnectorsRaw error:', err);
    return [];
  }
}
