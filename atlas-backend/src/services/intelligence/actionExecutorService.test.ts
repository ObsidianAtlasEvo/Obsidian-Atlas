/**
 * actionExecutorService.test.ts — Phase 0.985 pure-function tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyRisk } from './actionExecutorService.js';
import {
  normalizeDispatchResult,
  dispatchContract,
} from './actionDispatchBroker.js';
import {
  getReversalAnchor,
  reverseContract,
} from './actionReversalLayer.js';
import { extractEntities } from './actionResultIngestionService.js';
import type { ActionContractRow } from './actionContractService.js';

const TEST_UUID = '123e4567-e89b-42d3-a456-426614174900';

const makeContract = (overrides: Partial<ActionContractRow> = {}): ActionContractRow => ({
  id: TEST_UUID,
  user_id: '123e4567-e89b-42d3-a456-426614174901',
  action_type: 'send_message',
  target: 'slack',
  payload: {},
  status: 'approved',
  risk_class: 'low',
  reversibility: 'reversible',
  contract_metadata: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  executed_at: null,
  ...overrides,
});

// ─── classifyRisk ────────────────────────────────────────────────────────────

test('classifyRisk: critical risk => blocked', () => {
  assert.equal(classifyRisk(makeContract({ risk_class: 'critical' })), 'blocked');
});

test('classifyRisk: irreversible + destructive => blocked', () => {
  assert.equal(
    classifyRisk(makeContract({ action_type: 'delete_all', reversibility: 'irreversible' })),
    'blocked',
  );
});

test('classifyRisk: irreversible + external => blocked', () => {
  assert.equal(
    classifyRisk(makeContract({ target: 'external api', reversibility: 'irreversible' })),
    'blocked',
  );
});

test('classifyRisk: irreversible + local => multi_step', () => {
  assert.equal(
    classifyRisk(makeContract({ target: 'local db', reversibility: 'irreversible' })),
    'multi_step',
  );
});

test('classifyRisk: high risk => multi_step', () => {
  assert.equal(classifyRisk(makeContract({ risk_class: 'high' })), 'multi_step');
});

test('classifyRisk: multi-step payload => multi_step', () => {
  assert.equal(
    classifyRisk(makeContract({ payload: { steps: [{ name: 'a' }, { name: 'b' }] } })),
    'multi_step',
  );
});

test('classifyRisk: low-risk read/observe + reversible => auto', () => {
  assert.equal(classifyRisk(makeContract({ action_type: 'read_inbox' })), 'auto');
});

test('classifyRisk: single write default => user_confirm', () => {
  assert.equal(classifyRisk(makeContract({ action_type: 'send_message' })), 'user_confirm');
});

// ─── normalizeDispatchResult ─────────────────────────────────────────────────

test('normalizeDispatchResult: all steps succeed => success=true', () => {
  const r = normalizeDispatchResult(
    TEST_UUID,
    1,
    [{ index: 0, name: 's', status: 'succeeded' }],
    [],
  );
  assert.equal(r.success, true);
  assert.equal(r.contractId, TEST_UUID);
  assert.equal(r.attempts, 1);
});

test('normalizeDispatchResult: any error => success=false', () => {
  const r = normalizeDispatchResult(
    TEST_UUID,
    2,
    [{ index: 0, name: 's', status: 'failed' }],
    ['boom'],
  );
  assert.equal(r.success, false);
});

// ─── dispatchContract idempotency (memory layer disabled path) ───────────────

test('dispatchContract: contract_not_found when memory layer disabled', async () => {
  const r = await dispatchContract('123e4567-e89b-42d3-a456-426614174902', TEST_UUID);
  assert.equal(r.success, false);
  assert.equal(r.errors[0], 'contract_not_found');
});

// ─── reverseContract — missing anchor path (no DB) ───────────────────────────

test('reverseContract: contract_not_found when memory layer disabled', async () => {
  const r = await reverseContract(
    '123e4567-e89b-42d3-a456-426614174903',
    TEST_UUID,
    'test',
  );
  assert.equal(r.ok, false);
  assert.equal(r.reversed, false);
  assert.equal(r.reason, 'contract_not_found');
});

// ─── getReversalAnchor (pure) ────────────────────────────────────────────────

test('getReversalAnchor: reads from contract_metadata', () => {
  const anchor = getReversalAnchor(makeContract({ contract_metadata: { reversal_anchor: 'undo_42' } }));
  assert.equal(anchor, 'undo_42');
});

test('getReversalAnchor: falls back to payload', () => {
  const anchor = getReversalAnchor(makeContract({ payload: { reversal_anchor: 'undo_99' } }));
  assert.equal(anchor, 'undo_99');
});

test('getReversalAnchor: null when absent', () => {
  const anchor = getReversalAnchor(makeContract());
  assert.equal(anchor, null);
});

// ─── extractEntities (pure) ──────────────────────────────────────────────────

test('extractEntities: parses JSON step details', () => {
  const res = extractEntities({
    success: true,
    contractId: TEST_UUID,
    executedAt: new Date().toISOString(),
    attempts: 1,
    errors: [],
    steps: [
      {
        index: 0,
        name: 's',
        status: 'succeeded',
        detail: JSON.stringify({
          workstream_ids: ['w1'],
          workstream_status: 'completed',
          contradictions: [{ description: 'x' }],
          evidence: [{ claim_id: 'c1' }],
        }),
      },
    ],
  });
  assert.deepEqual(res.workstream_ids, ['w1']);
  assert.equal(res.workstream_status, 'completed');
  assert.equal(res.contradictions?.length, 1);
  assert.equal(res.evidence?.length, 1);
});

test('extractEntities: non-JSON details ignored, returns empty', () => {
  const res = extractEntities({
    success: true,
    contractId: TEST_UUID,
    executedAt: new Date().toISOString(),
    attempts: 1,
    errors: [],
    steps: [{ index: 0, name: 's', status: 'succeeded', detail: 'plain text' }],
  });
  assert.equal(res.workstream_ids, undefined);
  assert.equal(res.contradictions, undefined);
});
