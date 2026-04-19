/**
 * platformSovereignty.test.ts — Phase 0.985–0.99 pure-function tests.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRiskClass,
  formatActionSummary,
  type ActionContractRow,
} from './actionContractService.js';
import {
  computeConnectorTrust,
  formatConnectorSummary,
  type ConnectorRow,
} from './connectorRegistryService.js';
import {
  runEval,
  computeConstitutionalHealth,
  formatEvalSummary,
  type EvalResult,
} from './constitutionalEvalService.js';
import {
  formatAuditSummary,
  type AuditEvent,
} from './auditGovernanceService.js';

// ── computeRiskClass (reversibility × target combos) ─────────────────────────
test('computeRiskClass: irreversible + external => critical', () => {
  assert.equal(computeRiskClass('irreversible', 'external api'), 'critical');
});
test('computeRiskClass: irreversible + remote => critical', () => {
  assert.equal(computeRiskClass('irreversible', 'remote host'), 'critical');
});
test('computeRiskClass: irreversible + local => high', () => {
  assert.equal(computeRiskClass('irreversible', 'local db'), 'high');
});
test('computeRiskClass: partially_reversible + internal => medium', () => {
  assert.equal(computeRiskClass('partially_reversible', 'db'), 'medium');
});
test('computeRiskClass: reversible => low', () => {
  assert.equal(computeRiskClass('reversible', 'db'), 'low');
});
test('computeRiskClass: partially_reversible + external => medium', () => {
  assert.equal(computeRiskClass('partially_reversible', 'external api'), 'medium');
});
test('computeRiskClass: unknown reversibility => low', () => {
  assert.equal(computeRiskClass('unknown' as string, 'db'), 'low');
});

// ── formatActionSummary (2 tests) ────────────────────────────────────────────
const makeContract = (overrides: Partial<ActionContractRow> = {}): ActionContractRow => ({
  id: '123e4567-e89b-42d3-a456-426614174600',
  user_id: '123e4567-e89b-42d3-a456-426614174601',
  action_type: 'send_message',
  target: 'slack',
  payload: {},
  status: 'staged',
  risk_class: 'low',
  reversibility: 'reversible',
  contract_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  executed_at: null,
  ...overrides,
});
test('formatActionSummary: includes action_type', () => {
  const c = makeContract();
  assert.match(formatActionSummary(c), /send_message/);
});
test('formatActionSummary: includes status', () => {
  const c = makeContract({ status: 'approved' });
  assert.match(formatActionSummary(c), /approved/);
});

// ── computeConnectorTrust (auth × health combos) ─────────────────────────────
const makeConnector = (overrides: Partial<ConnectorRow> = {}): ConnectorRow => ({
  id: '123e4567-e89b-42d3-a456-426614174700',
  user_id: '123e4567-e89b-42d3-a456-426614174701',
  connector_name: 'x',
  connector_type: null,
  auth_method: 'oauth',
  health_status: 'healthy',
  trust_score: 0.5,
  last_checked_at: new Date().toISOString(),
  connector_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});
test('computeConnectorTrust: oauth + healthy + fresh high', () => {
  const c = makeConnector();
  assert.ok(computeConnectorTrust(c) > 0.7);
});
test('computeConnectorTrust: none + offline low', () => {
  const c = makeConnector({ auth_method: 'none', health_status: 'offline' });
  assert.ok(computeConnectorTrust(c) < 0.2);
});
test('computeConnectorTrust: api_key + degraded moderate', () => {
  const c = makeConnector({ auth_method: 'api_key', health_status: 'degraded' });
  const s = computeConnectorTrust(c);
  assert.ok(s > 0.2 && s < 0.6);
});
test('computeConnectorTrust: jwt + healthy solid', () => {
  const c = makeConnector({ auth_method: 'jwt' });
  assert.ok(computeConnectorTrust(c) > 0.6);
});
test('computeConnectorTrust: null last_checked yields mid freshness', () => {
  const c = makeConnector({ last_checked_at: null });
  const s = computeConnectorTrust(c);
  assert.ok(s > 0 && s < 1);
});
test('computeConnectorTrust: unknown auth defaults', () => {
  const c = makeConnector({ auth_method: 'mystery' });
  assert.ok(computeConnectorTrust(c) >= 0);
});
test('computeConnectorTrust: unknown health uses 0.4', () => {
  const c = makeConnector({ health_status: 'unknown' });
  const s = computeConnectorTrust(c);
  assert.ok(s > 0 && s < 1);
});

// ── formatConnectorSummary (2 tests) ─────────────────────────────────────────
test('formatConnectorSummary: includes name & health', () => {
  const c = makeConnector({ connector_name: 'gh' });
  assert.match(formatConnectorSummary(c), /gh/);
  assert.match(formatConnectorSummary(c), /healthy/);
});
test('formatConnectorSummary: shows connector_type when set', () => {
  const c = makeConnector({ connector_type: 'git' });
  assert.match(formatConnectorSummary(c), /git/);
});

// ── runEval (7 types passing + failing) ──────────────────────────────────────
test('runEval: sovereignty pass', () => {
  const r = runEval('sovereignty', { userControlScore: 0.8 });
  assert.equal(r.passed, true);
});
test('runEval: sovereignty fail', () => {
  const r = runEval('sovereignty', { userControlScore: 0.3 });
  assert.equal(r.passed, false);
});
test('runEval: transparency pass', () => {
  const r = runEval('transparency', { reasoningExposed: true, policyVisible: true });
  assert.equal(r.passed, true);
});
test('runEval: transparency fail', () => {
  const r = runEval('transparency', { reasoningExposed: false, policyVisible: true });
  assert.equal(r.passed, false);
});
test('runEval: truth_adherence pass', () => {
  const r = runEval('truth_adherence', { claimVerificationRate: 0.8 });
  assert.equal(r.passed, true);
});
test('runEval: truth_adherence fail', () => {
  const r = runEval('truth_adherence', { claimVerificationRate: 0.3 });
  assert.equal(r.passed, false);
});
test('runEval: operator_fidelity pass', () => {
  const r = runEval('operator_fidelity', {
    systemPromptHonored: true,
    instructionsFollowed: true,
  });
  assert.equal(r.passed, true);
});
test('runEval: operator_fidelity fail', () => {
  const r = runEval('operator_fidelity', {
    systemPromptHonored: false,
    instructionsFollowed: true,
  });
  assert.equal(r.passed, false);
});
test('runEval: anti_drift pass', () => {
  const r = runEval('anti_drift', { driftEventCount: 1 });
  assert.equal(r.passed, true);
});
test('runEval: anti_drift fail', () => {
  const r = runEval('anti_drift', { driftEventCount: 5 });
  assert.equal(r.passed, false);
});
test('runEval: minimal_mutation pass', () => {
  const r = runEval('minimal_mutation', { policyMutationRate: 0.1 });
  assert.equal(r.passed, true);
});
test('runEval: minimal_mutation fail', () => {
  const r = runEval('minimal_mutation', { policyMutationRate: 0.5 });
  assert.equal(r.passed, false);
});
test('runEval: recall_fidelity pass', () => {
  const r = runEval('recall_fidelity', { memoryRecallAccuracy: 0.9 });
  assert.equal(r.passed, true);
});
test('runEval: recall_fidelity fail', () => {
  const r = runEval('recall_fidelity', { memoryRecallAccuracy: 0.5 });
  assert.equal(r.passed, false);
});
test('runEval: unknown type fails', () => {
  const r = runEval('blerg', {});
  assert.equal(r.passed, false);
});

// ── computeConstitutionalHealth (3 tests) ────────────────────────────────────
test('computeConstitutionalHealth: empty => not passed', () => {
  const r = computeConstitutionalHealth([]);
  assert.equal(r.passed, false);
});
test('computeConstitutionalHealth: majority pass => passed', () => {
  const results: EvalResult[] = [
    { eval_type: 'sovereignty', score: 0.9, passed: true, notes: '' },
    { eval_type: 'transparency', score: 1, passed: true, notes: '' },
    { eval_type: 'anti_drift', score: 0.4, passed: false, notes: '' },
  ];
  const r = computeConstitutionalHealth(results);
  assert.equal(r.passed, true);
});
test('computeConstitutionalHealth: majority fail => not passed', () => {
  const results: EvalResult[] = [
    { eval_type: 'sovereignty', score: 0.2, passed: false, notes: '' },
    { eval_type: 'transparency', score: 0, passed: false, notes: '' },
    { eval_type: 'anti_drift', score: 0.9, passed: true, notes: '' },
  ];
  const r = computeConstitutionalHealth(results);
  assert.equal(r.passed, false);
});

// ── formatEvalSummary (1 test) ───────────────────────────────────────────────
test('formatEvalSummary: prints pass/total', () => {
  const results: EvalResult[] = [
    { eval_type: 'sovereignty', score: 0.9, passed: true, notes: '' },
    { eval_type: 'anti_drift', score: 0.4, passed: false, notes: '' },
  ];
  const s = formatEvalSummary(results);
  assert.match(s, /1\/2 passed/);
});

// ── formatAuditSummary (3 tests) ─────────────────────────────────────────────
const makeAudit = (t: AuditEvent['event_type']): AuditEvent => ({
  id: '123e4567-e89b-42d3-a456-426614174900',
  user_id: '123e4567-e89b-42d3-a456-426614174901',
  event_type: t,
  actor: null,
  target: null,
  before_state: null,
  after_state: null,
  audit_metadata: {},
  logged_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
});
test('formatAuditSummary: empty => no audit events', () => {
  assert.match(formatAuditSummary([]), /no audit events/);
});
test('formatAuditSummary: groups by type', () => {
  const events = [
    makeAudit('freeze'),
    makeAudit('freeze'),
    makeAudit('revert'),
  ];
  const s = formatAuditSummary(events);
  assert.match(s, /freeze:2/);
  assert.match(s, /revert:1/);
});
test('formatAuditSummary: policy_mutation counted', () => {
  const s = formatAuditSummary([makeAudit('policy_mutation')]);
  assert.match(s, /policy_mutation:1/);
});
