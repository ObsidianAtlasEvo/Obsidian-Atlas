/**
 * connectorOutboundService.test.ts — Phase 0.986 tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  callConnector,
  __resetRateLimitersForTest,
  readConnectorConfig,
} from './connectorOutboundService.js';
import {
  canonicalizeEntities,
  mergeCrossSourceEntities,
  computePayloadHash,
  type ConnectorSchema,
} from './connectorCanonicalizationService.js';
import { classifyConnector } from './connectorSyncMonitor.js';
import type { ConnectorRow } from './connectorRegistryService.js';

const USER = '123e4567-e89b-42d3-a456-426614174010';

const makeConnector = (overrides: Partial<ConnectorRow> = {}): ConnectorRow => ({
  id: '123e4567-e89b-42d3-a456-426614174011',
  user_id: USER,
  connector_name: 'test-connector',
  connector_type: 'api',
  auth_method: 'bearer',
  health_status: 'healthy',
  trust_score: 0.9,
  last_checked_at: null,
  connector_metadata: {
    endpoint_url: 'https://api.example.test',
    rate_limit_rpm: 60,
    auth_config: { auth_type: 'bearer', token: 'tok' },
    data_schema: {
      entity_type: 'claims',
      external_id_field: 'id',
      mappings: [
        { source: 'title', target: 'claim_statement' },
        { source: 'note', target: 'detail' },
      ],
    },
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

// ─── callConnector ────────────────────────────────────────────────────────────

test('callConnector: bearer auth sets Authorization header', async () => {
  __resetRateLimitersForTest();
  let capturedAuth = '';
  const fakeFetch = (async (_url: string, init: { headers?: Record<string, string> }) => {
    capturedAuth = init.headers?.['Authorization'] ?? '';
    return new Response('{"ok":true}', { status: 200 });
  }) as unknown as typeof fetch;
  const res = await callConnector(USER, makeConnector(), { path: '/items' }, { fetchImpl: fakeFetch });
  assert.equal(res.success, true);
  assert.equal(capturedAuth, 'Bearer tok');
});

test('callConnector: api_key auth sets custom header', async () => {
  __resetRateLimitersForTest();
  let capturedKey = '';
  const fakeFetch = (async (_url: string, init: { headers?: Record<string, string> }) => {
    capturedKey = init.headers?.['X-API-Key'] ?? '';
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
  const connector = makeConnector({
    connector_metadata: {
      endpoint_url: 'https://api.example.test',
      auth_config: { auth_type: 'api_key', token: 'k123', header_name: 'X-API-Key' },
      data_schema: { entity_type: 'x' },
    },
  });
  await callConnector(USER, connector, { path: '/' }, { fetchImpl: fakeFetch });
  assert.equal(capturedKey, 'k123');
});

test('callConnector: rate limit blocks after RPM exceeded', async () => {
  __resetRateLimitersForTest();
  const fakeFetch = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
  const connector = makeConnector({
    id: '123e4567-e89b-42d3-a456-426614174020',
    connector_metadata: {
      endpoint_url: 'https://api.example.test',
      rate_limit_rpm: 2,
      auth_config: { auth_type: 'bearer', token: 'tok' },
      data_schema: { entity_type: 'x' },
    },
  });
  await callConnector(USER, connector, { path: '/' }, { fetchImpl: fakeFetch });
  await callConnector(USER, connector, { path: '/' }, { fetchImpl: fakeFetch });
  const third = await callConnector(USER, connector, { path: '/' }, { fetchImpl: fakeFetch });
  assert.equal(third.success, false);
  assert.equal(third.error, 'rate_limited');
  assert.equal(third.status, 429);
});

test('callConnector: missing endpoint_url => no_endpoint_url', async () => {
  __resetRateLimitersForTest();
  const connector = makeConnector({
    connector_metadata: { auth_config: { auth_type: 'none' }, data_schema: { entity_type: 'x' } },
  });
  const res = await callConnector(USER, connector, { path: '/' });
  assert.equal(res.success, false);
  assert.equal(res.error, 'no_endpoint_url');
});

test('readConnectorConfig: defaults rate_limit_rpm to 60', () => {
  const c = makeConnector({
    connector_metadata: { endpoint_url: 'https://x.test' },
  });
  assert.equal(readConnectorConfig(c).rate_limit_rpm, 60);
});

// ─── canonicalizeEntities ────────────────────────────────────────────────────

const schemaA: ConnectorSchema = {
  connector_id: 'conn_a',
  entity_type: 'claims',
  external_id_field: 'id',
  trust_score: 0.9,
  mappings: [
    { source: 'title', target: 'claim_statement' },
    { source: 'note', target: 'detail' },
  ],
};

const schemaB: ConnectorSchema = {
  connector_id: 'conn_b',
  entity_type: 'claims',
  external_id_field: 'id',
  trust_score: 0.4,
  mappings: [
    { source: 'headline', target: 'claim_statement' },
    { source: 'body', target: 'detail' },
  ],
};

test('canonicalizeEntities: maps fields and dedupes on external_id', () => {
  const raw = [
    { id: '1', title: 'one', note: 'n1' },
    { id: '1', title: 'one-dup', note: 'n2' },
    { id: '2', title: 'two', note: 'n3' },
    { title: 'no-id' },
  ];
  const out = canonicalizeEntities(raw, schemaA);
  assert.equal(out.length, 2);
  assert.equal(out[0]?.fields['claim_statement'], 'one');
});

test('mergeCrossSourceEntities: high-trust source wins on conflicts', () => {
  const aOut = canonicalizeEntities([{ id: 'x', title: 'A-title', note: 'A-note' }], schemaA);
  const bOut = canonicalizeEntities([{ id: 'x', headline: 'B-title', body: 'B-body' }], schemaB);
  const merged = mergeCrossSourceEntities([aOut, bOut]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.fields['claim_statement'], 'A-title');
  assert.equal(merged[0]?.source_connector_id, 'conn_a');
  const sources = merged[0]?.fields['_sources'] as Array<{ connector_id: string }> | undefined;
  assert.ok(Array.isArray(sources));
  assert.equal(sources?.length, 2);
});

test('computePayloadHash: identical input => identical hash (delta sync)', () => {
  const a = computePayloadHash([{ id: 'x' }]);
  const b = computePayloadHash([{ id: 'x' }]);
  const c = computePayloadHash([{ id: 'y' }]);
  assert.equal(a, b);
  assert.notEqual(a, c);
});

// ─── connectorSyncMonitor ─────────────────────────────────────────────────────

test('classifyConnector: never-synced => stale', () => {
  assert.equal(
    classifyConnector(
      makeConnector({
        connector_metadata: { endpoint_url: 'x', refresh_interval_minutes: 60 },
      }),
    ),
    'stale',
  );
});

test('classifyConnector: recent sync + ok => healthy', () => {
  assert.equal(
    classifyConnector(
      makeConnector({
        connector_metadata: {
          endpoint_url: 'x',
          refresh_interval_minutes: 60,
          last_synced_at: new Date(Date.now() - 5_000).toISOString(),
          last_sync_status: 'completed',
        },
      }),
    ),
    'healthy',
  );
});

test('classifyConnector: 3+ consecutive failures => failed', () => {
  assert.equal(
    classifyConnector(
      makeConnector({
        connector_metadata: {
          endpoint_url: 'x',
          last_synced_at: new Date().toISOString(),
          last_sync_status: 'failed',
          consecutive_failures: 3,
        },
      }),
    ),
    'failed',
  );
});

test('classifyConnector: past refresh window => stale', () => {
  assert.equal(
    classifyConnector(
      makeConnector({
        connector_metadata: {
          endpoint_url: 'x',
          refresh_interval_minutes: 15,
          last_synced_at: new Date(Date.now() - 30 * 60_000).toISOString(),
          last_sync_status: 'completed',
        },
      }),
    ),
    'stale',
  );
});
