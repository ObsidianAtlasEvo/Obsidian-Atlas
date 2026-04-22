/**
 * requestCheckpointService.ts — V1.0 Phase B
 *
 * Per-request stage checkpoints keyed by (userId, requestId).
 *
 * Purpose:
 *   When SSE breaks mid-stream, the conductor can resume from the last
 *   persisted checkpoint stage rather than restarting from Stage 0.
 *   Clients replay by resubmitting the same requestId — the conductor
 *   detects the checkpoint and skips already-completed stages.
 *
 * Checkpoint key:
 *   checkpoint:{userId}:{requestId}
 *
 * Checkpoint record:
 *   - currentStage       (0–8)
 *   - completedStages    (Set serialized as number[])
 *   - stageOutputRefs    (Map<stage, summary/ref> — brief per-stage output)
 *   - profileSnapshot    (serialized RequestProfile — immutable after Stage 2)
 *   - curatedContextHash (fingerprint of Stage 4 output)
 *   - retryCount         (how many times this request has been resumed)
 *   - createdAt          (ISO string)
 *   - updatedAt          (ISO string)
 *
 * TTL: 10 minutes by default (CHECKPOINT_TTL_SECONDS).
 *
 * Degradation contract:
 *   All operations return null / false when Redis is unavailable.
 *   The conductor falls back to full pipeline execution — no errors.
 */

import { env } from '../../config/env.js';
import { redisSafeGet, redisSafeSet, redisSafeDel } from '../infrastructure/redisClient.js';
import type { RequestProfile } from '../../types/requestProfile.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type ConductorStage = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface StageOutput {
  stage: ConductorStage;
  /** Brief serializable summary of stage output (not the full payload — just enough to resume). */
  summary: string;
  durationMs: number;
  completedAt: string;
}

export interface RequestCheckpoint {
  userId: string;
  requestId: string;
  currentStage: ConductorStage;
  completedStages: ConductorStage[];
  stageOutputs: StageOutput[];
  /**
   * Immutable RequestProfile snapshot (serialized).
   * Stored after Stage 2 so resuming requests don't re-derive profile.
   */
  profileSnapshot: RequestProfile | null;
  /**
   * Fingerprint of the curated context block from Stage 4.
   * Allows the conductor to skip Stage 4 on resume if membrane provides
   * the same block.
   */
  curatedContextHash: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── Key construction ───────────────────────────────────────────────────────

function checkpointKey(userId: string, requestId: string): string {
  return `checkpoint:${userId}:${requestId}`;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Retrieve an existing checkpoint for this (userId, requestId) pair.
 * Returns null on miss or when Redis is unavailable.
 * Never throws.
 */
export async function getCheckpoint(
  userId: string,
  requestId: string,
): Promise<RequestCheckpoint | null> {
  if (!env.upstashRedisUrl) return null;
  return redisSafeGet<RequestCheckpoint>(checkpointKey(userId, requestId));
}

/**
 * Create a new checkpoint at Stage 0 (admission).
 * Called by the conductor before any work begins so interruptions are recoverable.
 * Never throws.
 */
export async function createCheckpoint(
  userId: string,
  requestId: string,
): Promise<boolean> {
  if (!env.upstashRedisUrl) return false;

  const now = new Date().toISOString();
  const checkpoint: RequestCheckpoint = {
    userId,
    requestId,
    currentStage: 0,
    completedStages: [],
    stageOutputs: [],
    profileSnapshot: null,
    curatedContextHash: '',
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  return redisSafeSet(checkpointKey(userId, requestId), checkpoint, env.checkpointTtlSeconds);
}

/**
 * Advance the checkpoint to the next stage.
 * Records stage output and updates the current stage marker.
 * Never throws — returns false on failure (conductor continues regardless).
 */
export async function advanceCheckpoint(
  userId: string,
  requestId: string,
  stage: ConductorStage,
  output: Omit<StageOutput, 'stage'>,
): Promise<boolean> {
  if (!env.upstashRedisUrl) return false;

  const existing = await getCheckpoint(userId, requestId);
  if (!existing) return false;

  const nextStage = Math.min(stage + 1, 8) as ConductorStage;
  const updated: RequestCheckpoint = {
    ...existing,
    currentStage: nextStage,
    completedStages: [...new Set([...existing.completedStages, stage])],
    stageOutputs: [
      ...existing.stageOutputs.filter((o) => o.stage !== stage),
      { stage, ...output },
    ],
    updatedAt: new Date().toISOString(),
  };

  return redisSafeSet(checkpointKey(userId, requestId), updated, env.checkpointTtlSeconds);
}

/**
 * Store the RequestProfile snapshot after Stage 2.
 * Enables resume requests to skip profile re-derivation.
 * Never throws.
 */
export async function persistProfileSnapshot(
  userId: string,
  requestId: string,
  profile: RequestProfile,
): Promise<boolean> {
  if (!env.upstashRedisUrl) return false;

  const existing = await getCheckpoint(userId, requestId);
  if (!existing) return false;

  const updated: RequestCheckpoint = {
    ...existing,
    profileSnapshot: profile,
    updatedAt: new Date().toISOString(),
  };

  return redisSafeSet(checkpointKey(userId, requestId), updated, env.checkpointTtlSeconds);
}

/**
 * Store the curated context hash after Stage 4.
 * Enables the conductor to detect unchanged context on resume.
 * Never throws.
 */
export async function persistCuratedContextHash(
  userId: string,
  requestId: string,
  hash: string,
): Promise<boolean> {
  if (!env.upstashRedisUrl) return false;

  const existing = await getCheckpoint(userId, requestId);
  if (!existing) return false;

  const updated: RequestCheckpoint = {
    ...existing,
    curatedContextHash: hash,
    updatedAt: new Date().toISOString(),
  };

  return redisSafeSet(checkpointKey(userId, requestId), updated, env.checkpointTtlSeconds);
}

/**
 * Increment retry count when a request is being resumed after interruption.
 * Never throws.
 */
export async function incrementRetryCount(
  userId: string,
  requestId: string,
): Promise<boolean> {
  if (!env.upstashRedisUrl) return false;

  const existing = await getCheckpoint(userId, requestId);
  if (!existing) return false;

  const updated: RequestCheckpoint = {
    ...existing,
    retryCount: existing.retryCount + 1,
    updatedAt: new Date().toISOString(),
  };

  return redisSafeSet(checkpointKey(userId, requestId), updated, env.checkpointTtlSeconds);
}

/**
 * Delete a checkpoint after successful completion.
 * Prevents stale checkpoint data from interfering with future requests.
 * Never throws.
 */
export async function deleteCheckpoint(
  userId: string,
  requestId: string,
): Promise<boolean> {
  if (!env.upstashRedisUrl) return false;
  return redisSafeDel(checkpointKey(userId, requestId));
}

/**
 * Check whether a stage is already completed in the checkpoint.
 * Used by the conductor to skip completed stages on resume.
 */
export function isStageCompleted(
  checkpoint: RequestCheckpoint | null,
  stage: ConductorStage,
): boolean {
  if (!checkpoint) return false;
  return checkpoint.completedStages.includes(stage);
}
