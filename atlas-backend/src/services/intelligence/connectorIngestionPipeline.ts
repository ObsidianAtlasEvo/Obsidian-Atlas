/**
 * connectorIngestionPipeline.ts — Phase 0.986: ingest canonicalized records.
 *
 * Runs one ingestion cycle for a single connector:
 *   1. Fetch raw records via callConnector (or injected fetcher for tests)
 *   2. Compare hash vs last_sync_hash on connector metadata (delta sync)
 *   3. If changed, canonicalize and insert into the target table
 *   4. Persist last_sync_hash, last_sync_status, last_synced_at on the connector
 */

import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import type { ConnectorRow } from './connectorRegistryService.js';
import {
  canonicalizeEntities,
  computePayloadHash,
  type ConnectorSchema,
  type CanonicalEntity,
} from './connectorCanonicalizationService.js';
import {
  callConnector,
  readConnectorConfig,
  type ConnectorPayload,
  type ConnectorResult,
} from './connectorOutboundService.js';

export interface IngestionResult {
  connectorId: string;
  skipped: boolean;
  reason?: string;
  recordsFetched: number;
  recordsInserted: number;
  hash: string;
  status: 'completed' | 'failed' | 'skipped';
}

export interface RunIngestionOptions {
  fetchImpl?: typeof fetch;
  /** For tests: bypass HTTP and supply raw records directly. */
  injectRaw?: unknown[];
  /** Override connector call payload. */
  payload?: ConnectorPayload;
}

function schemaFromConnector(connector: ConnectorRow): ConnectorSchema | null {
  const cfg = readConnectorConfig(connector);
  const ds = cfg.data_schema;
  if (!ds) return null;
  const entityType = typeof ds['entity_type'] === 'string' ? (ds['entity_type'] as string) : null;
  const externalIdField =
    typeof ds['external_id_field'] === 'string' ? (ds['external_id_field'] as string) : 'id';
  const mappingsRaw = Array.isArray(ds['mappings']) ? (ds['mappings'] as unknown[]) : [];
  const mappings = mappingsRaw
    .map((m) => {
      if (m && typeof m === 'object') {
        const rec = m as Record<string, unknown>;
        if (typeof rec['source'] === 'string' && typeof rec['target'] === 'string') {
          return { source: rec['source'] as string, target: rec['target'] as string };
        }
      }
      return null;
    })
    .filter((m): m is { source: string; target: string } => m !== null);
  if (!entityType) return null;
  return {
    connector_id: connector.id,
    entity_type: entityType,
    external_id_field: externalIdField,
    mappings,
    trust_score: connector.trust_score ?? 0.5,
  };
}

async function insertCanonicalEntities(
  userId: string,
  table: string,
  entities: CanonicalEntity[],
): Promise<number> {
  if (!env.memoryLayerEnabled || entities.length === 0) return 0;
  let inserted = 0;
  for (const ent of entities) {
    try {
      const body = {
        id: randomUUID(),
        user_id: userId,
        ...ent.fields,
        source_connector_id: ent.source_connector_id,
        external_id: ent.external_id,
        created_at: new Date().toISOString(),
      };
      const res = await supabaseRest('POST', table, body);
      if (res.ok) inserted++;
    } catch (err) {
      console.error('[connectorIngestionPipeline] insertCanonicalEntity error:', err);
    }
  }
  return inserted;
}

async function persistConnectorSyncState(
  userId: string,
  connector: ConnectorRow,
  hash: string,
  status: 'completed' | 'failed' | 'skipped',
): Promise<void> {
  if (!env.memoryLayerEnabled) return;
  try {
    const now = new Date().toISOString();
    const meta = {
      ...(connector.connector_metadata ?? {}),
      last_sync_hash: hash,
      last_sync_status: status,
      last_synced_at: now,
    };
    await supabaseRest(
      'PATCH',
      `connector_registry?id=eq.${encodeURIComponent(connector.id)}&user_id=eq.${encodeURIComponent(userId)}`,
      {
        connector_metadata: meta,
        last_checked_at: now,
        updated_at: now,
      },
    );
  } catch (err) {
    console.error('[connectorIngestionPipeline] persistConnectorSyncState error:', err);
  }
}

export async function runIngestionCycle(
  userId: string,
  connector: ConnectorRow,
  options: RunIngestionOptions = {},
): Promise<IngestionResult> {
  try {
    const schema = schemaFromConnector(connector);
    if (!schema) {
      return {
        connectorId: connector.id,
        skipped: true,
        reason: 'no_schema',
        recordsFetched: 0,
        recordsInserted: 0,
        hash: '',
        status: 'skipped',
      };
    }

    let raw: unknown[] = [];
    if (options.injectRaw) {
      raw = options.injectRaw;
    } else {
      const call: ConnectorResult = await callConnector(
        userId,
        connector,
        options.payload ?? { method: 'GET', path: '/' },
        { ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) },
      );
      if (!call.success) {
        await persistConnectorSyncState(userId, connector, '', 'failed');
        return {
          connectorId: connector.id,
          skipped: false,
          reason: call.error ?? 'outbound_failed',
          recordsFetched: 0,
          recordsInserted: 0,
          hash: '',
          status: 'failed',
        };
      }
      raw = Array.isArray(call.body)
        ? call.body
        : call.body && typeof call.body === 'object' && Array.isArray((call.body as Record<string, unknown>)['data'])
          ? ((call.body as Record<string, unknown>)['data'] as unknown[])
          : [];
    }

    const hash = computePayloadHash(raw);
    const prevHash =
      typeof (connector.connector_metadata ?? {})['last_sync_hash'] === 'string'
        ? ((connector.connector_metadata ?? {})['last_sync_hash'] as string)
        : '';

    if (prevHash && prevHash === hash) {
      await persistConnectorSyncState(userId, connector, hash, 'skipped');
      return {
        connectorId: connector.id,
        skipped: true,
        reason: 'unchanged',
        recordsFetched: raw.length,
        recordsInserted: 0,
        hash,
        status: 'skipped',
      };
    }

    const canonical = canonicalizeEntities(raw, schema);
    const inserted = await insertCanonicalEntities(userId, schema.entity_type, canonical);
    await persistConnectorSyncState(userId, connector, hash, 'completed');
    return {
      connectorId: connector.id,
      skipped: false,
      recordsFetched: raw.length,
      recordsInserted: inserted,
      hash,
      status: 'completed',
    };
  } catch (err) {
    console.error('[connectorIngestionPipeline] runIngestionCycle error:', err);
    return {
      connectorId: connector.id,
      skipped: false,
      reason: 'ingestion_error',
      recordsFetched: 0,
      recordsInserted: 0,
      hash: '',
      status: 'failed',
    };
  }
}
