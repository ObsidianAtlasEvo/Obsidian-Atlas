/**
 * Latency-assertion test for the unfinished_business read path.
 *
 * The service exposes `getReadLatencyStats()` (rolling P50/P95) and a
 * `_recordReadLatencyForTesting` hook so the percentile math can be exercised
 * without an actual Postgres connection. We also pin the session-start budget
 * constant so a silent regression that bumps it triggers a test failure.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SESSION_START_READ_BUDGET_MS,
  _recordReadLatencyForTesting,
  _resetReadLatencyForTesting,
  getReadLatencyStats,
} from '../unfinishedBusinessService.js';

test('the session-start latency budget is pinned to 250ms', () => {
  // If you bump this number, you are loosening a hot-path SLO. Don't do it
  // silently — update the budget and this test together.
  assert.equal(SESSION_START_READ_BUDGET_MS, 250);
});

test('getReadLatencyStats reports zero p50/p95 with no samples', () => {
  _resetReadLatencyForTesting();
  const stats = getReadLatencyStats();
  assert.equal(stats.n, 0);
  assert.equal(stats.p50, 0);
  assert.equal(stats.p95, 0);
});

test('rolling percentile math: P50 is median, P95 is near tail', () => {
  _resetReadLatencyForTesting();
  for (let i = 1; i <= 100; i++) _recordReadLatencyForTesting(i);
  const stats = getReadLatencyStats();
  assert.equal(stats.n, 100);
  // 100 samples (1..100), median index is floor(100*0.5)=50 → value 51
  assert.equal(stats.p50, 51);
  // p95 index floor(100*0.95)=95 → value 96
  assert.equal(stats.p95, 96);
  assert.ok(stats.p95 >= stats.p50, 'p95 must be ≥ p50');
});

test('window is bounded to 100 samples (old ones evicted)', () => {
  _resetReadLatencyForTesting();
  for (let i = 1; i <= 150; i++) _recordReadLatencyForTesting(i);
  const stats = getReadLatencyStats();
  assert.equal(stats.n, 100, 'sliding window cap');
  // After eviction the kept samples are 51..150. P95 is near the upper end.
  assert.ok(stats.p95 >= 140, `expected p95 in the high tail, got ${stats.p95}`);
});

test('latency assertion: synthetic samples under budget keep P95 under SLO', () => {
  _resetReadLatencyForTesting();
  for (let i = 0; i < 100; i++) _recordReadLatencyForTesting(50 + (i % 20));
  const stats = getReadLatencyStats();
  assert.ok(
    stats.p95 < SESSION_START_READ_BUDGET_MS,
    `expected P95 (${stats.p95}) < budget (${SESSION_START_READ_BUDGET_MS})`,
  );
});
