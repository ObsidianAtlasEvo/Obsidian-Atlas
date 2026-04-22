/**
 * sessionMembraneService.ts — V1.0 Phase B (hardened)
 *
 * Session membrane: Redis-backed cache for the assembled context package
 * produced at Stage 4 of the cognitiveOrchestrator pipeline.
 *
 * Purpose:
 *   Prevents Atlas from performing full Stage 4 (raw recall → curateContext)
 *   on every turn of a deep session when the context has not meaningfully changed.
 *   This is the primary cost and latency lever for multi-turn sessions.
 *
 * Membrane key composition:
 *   membrane:{userId}:{sessionId}:{chamber}:{profileIntentHash}:{doctrineVersionHash}
 *
 * Membrane record contains:
 *   - curatedContextBlock    (string — the pre-formatted injection block)
 *   - doctrineBundleIds      (string[] — what was loaded)
 *   - contextHash            (string — FNV-1a fingerprint of the curated block)
 *   - artifactFingerprint    (string — hash of codebase/doc artifacts, Phase F)
 *   - doctrineVersionHash    (string — bumped each migration cycle)
 *   - sensitivityClass       (string — 'low' | 'medium' | 'high')
 *   - policyProfileVersion   (string — PolicyProfile.updatedAt ISO timestamp)
 *   - degradedStateHash      (string — hash of degraded flags at assembly time)
 *   - chamber                (AtlasChamber)
 *   - resolvedAt             (ISO string)
 *   - hitCount               (number — turns that reused this membrane)
 *
 * Invalidation triggers:
 *   1. Chamber switch
 *   2. Doctrine version change (new migration applied)
 *   3. Sensitivity class change (sovereignty escalation/de-escalation)
 *   4. Policy profile version change (user updated preferences mid-session)
 *   5. Degraded mode transition (Redis/Groq/Ollama availability changed)
 *   6. Artifact fingerprint change (Phase F)
 *   7. Hard topic pivot (cosine distance ≥ 0.85 — Phase E wires this)
 *   8. Explicit force_refresh from client
 *   9. TTL expiry (default 30 min, configurable via MEMBRANE_TTL_SECONDS)
 *
 * Degradation contract:
 *   All methods return null / false gracefully when Redis is unavailable.
 *   The conductor falls back to full Stage 4 execution — no errors, no blocking.
 */

import { env } from '../../config/env.js';
import { redisSafeGet, redisSafeSet, redisSafeDel } from '../infrastructure/redisClient.js';
import type { AtlasChamber, DoctrineBundleId, SensitivityClass } from '../../types/requestProfile.js';
import { detectMembranePivot } from './membranePivotDetector.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface MembraneRecord {
  /** The formatted curated context block ready for injection. */
  curatedContextBlock: string;
  /** Which doctrine bundles were loaded. */
  doctrineBundleIds: DoctrineBundleId[];
  /** FNV-1a fingerprint of curatedContextBlock (fast, non-crypto). */
  contextHash: string;
  /** Artifact fingerprint from Phase F; empty string until Phase F ships. */
  artifactFingerprint: string;
  /** Doctrine version hash — bumped when migrations run. */
  doctrineVersionHash: string;
  /** Sensitivity class at assembly time — invalidates on escalation/de-escalation. */
  sensitivityClass: SensitivityClass;
  /**
   * PolicyProfile.updatedAt at assembly time.
   * Invalidates when the user modifies preferences mid-session.
   */
  policyProfileVersion: string;
  /**
   * Hash of the degraded state flags at assembly time
   * (groqUnavailable | localOllamaDisabled | memoryLayerEnabled).
   * Invalidates on availability transitions so stale context isn't reused
   * under a different compute posture.
   */
  degradedStateHash: string;
  /** Chamber at assembly time. */
  chamber: AtlasChamber;
  /** ISO timestamp of membrane assembly. */
  resolvedAt: string;
  /** Number of turns that have consumed this membrane without invalidation. */
  hitCount: number;
  /** Phase E: first 500 chars of the prompt that generated this membrane. */
  originPromptSnippet?: string;
  /** Phase E: routing mode at assembly time (for pivot detection). */
  originMode?: string;
  /** Phase E: gravity (posture) at assembly time (for pivot detection). */
  originGravity?: number;
}

export interface MembraneValidationResult {
  hit: boolean;
  record: MembraneRecord | null;
  /** Populated on every miss — reason string for telemetry/trace logging. */
  invalidationReason: string;
}

export interface MembraneWriteInput {
  userId: string;
  sessionId: string;
  chamber: AtlasChamber;
  intentHash: string;
  doctrineVersionHash: string;
  curatedContextBlock: string;
  doctrineBundleIds: DoctrineBundleId[];
  sensitivityClass: SensitivityClass;
  policyProfileVersion: string;
  degradedStateHash: string;
  artifactFingerprint?: string;
  /** Phase E: origin prompt snippet for pivot detection. */
  originPromptSnippet?: string;
  /** Phase E: routing mode at assembly time. */
  originMode?: string;
  /** Phase E: gravity at assembly time. */
  originGravity?: number;
}

export interface MembraneValidateInput {
  userId: string;
  sessionId: string;
  chamber: AtlasChamber;
  intentHash: string;
  currentSensitivityClass: SensitivityClass;
  currentPolicyProfileVersion: string;
  currentDegradedStateHash: string;
  forceRefresh?: boolean;
  currentArtifactFingerprint?: string;
  /** Phase E: current prompt for pivot detection. */
  currentPrompt?: string;
  /** Phase E: current routing mode for pivot detection. */
  currentMode?: string;
  /** Phase E: current gravity for pivot detection. */
  currentGravity?: number;
}

// ── Key construction ───────────────────────────────────────────────────────

/**
 * Deterministic membrane key.
 * Encodes enough context to detect chamber/intent/doctrine drift without
 * requiring a full content comparison on every turn.
 */
function membraneKey(
  userId: string,
  sessionId: string,
  chamber: AtlasChamber,
  intentHash: string,
  doctrineVersionHash: string,
): string {
  return `membrane:${userId}:${sessionId}:${chamber}:${intentHash}:${doctrineVersionHash}`;
}

/**
 * Simple fast hash for short strings (intent + doctrine version).
 * FNV-1a 32-bit — not cryptographic; used for cache key discrimination only.
 */
export function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Compute a context fingerprint from the curated block string.
 * First 8 chars of FNV-1a — fast, non-crypto, used for drift detection.
 */
export function contextFingerprint(block: string): string {
  if (!block) return '00000000';
  return shortHash(block.slice(0, 2000));
}

/**
 * Hash the degraded state struct into a short discriminator string.
 * A change in any flag (groq availability, ollama disabled, memory layer)
 * produces a different hash and triggers membrane invalidation.
 */
export function degradedStateHash(degraded: {
  groqUnavailable: boolean;
  localOllamaDisabled: boolean;
  memoryLayerEnabled: boolean;
}): string {
  const sig = `${degraded.groqUnavailable ? '1' : '0'}${degraded.localOllamaDisabled ? '1' : '0'}${degraded.memoryLayerEnabled ? '1' : '0'}`;
  return shortHash(sig);
}

// ── Doctrine version ───────────────────────────────────────────────────────

/**
 * Current doctrine version hash — derived from the last applied migration
 * number. Increment whenever a schema migration ships.
 * Phase F replaces this with a real artifact fingerprint service.
 */
const CURRENT_DOCTRINE_VERSION = '016';

export function getCurrentDoctrineVersionHash(): string {
  return CURRENT_DOCTRINE_VERSION;
}

// ── Invalidation checks ───────────────────────────────────────────────────

/**
 * Validate an existing membrane record against current request context.
 *
 * Returns a string describing the invalidation reason, or undefined if valid.
 *
 * Checks (in priority order):
 *   1. force_refresh override
 *   2. Chamber switch
 *   3. Doctrine version change
 *   4. Sensitivity class change     (sovereignty escalation/de-escalation)
 *   5. Policy profile version change (user preference update)
 *   6. Degraded state transition    (availability mode change)
 *   7. Artifact fingerprint change  (Phase F)
 */
export function checkMembraneValidity(
  record: MembraneRecord,
  opts: {
    currentChamber: AtlasChamber;
    currentDoctrineVersionHash: string;
    currentSensitivityClass: SensitivityClass;
    currentPolicyProfileVersion: string;
    currentDegradedStateHash: string;
    forceRefresh: boolean;
    currentArtifactFingerprint?: string;
    /** Phase E: current prompt for pivot detection. */
    currentPrompt?: string;
    /** Phase E: current routing mode for pivot detection. */
    currentMode?: string;
    /** Phase E: current gravity for pivot detection. */
    currentGravity?: number;
  },
): string | undefined {
  if (opts.forceRefresh) return 'explicit_force_refresh';

  if (record.chamber !== opts.currentChamber) {
    return `chamber_switch:${record.chamber}->${opts.currentChamber}`;
  }

  if (record.doctrineVersionHash !== opts.currentDoctrineVersionHash) {
    return `doctrine_version_change:${record.doctrineVersionHash}->${opts.currentDoctrineVersionHash}`;
  }

  if (record.sensitivityClass !== opts.currentSensitivityClass) {
    return `sensitivity_class_change:${record.sensitivityClass}->${opts.currentSensitivityClass}`;
  }

  if (record.policyProfileVersion !== opts.currentPolicyProfileVersion) {
    return `policy_profile_version_change`;
  }

  if (record.degradedStateHash !== opts.currentDegradedStateHash) {
    return `degraded_mode_transition`;
  }

  if (
    opts.currentArtifactFingerprint &&
    record.artifactFingerprint &&
    record.artifactFingerprint !== opts.currentArtifactFingerprint
  ) {
    return 'artifact_fingerprint_change';
  }

  // Phase E — pivot detection: check for semantic intent shift.
  if (opts.currentPrompt) {
    const pivotResult = detectMembranePivot({
      currentPrompt: opts.currentPrompt,
      cachedOriginPromptSnippet: record.originPromptSnippet,
      currentMode: opts.currentMode,
      cachedMode: record.originMode,
      currentGravity: opts.currentGravity ?? 3,
      cachedGravity: record.originGravity,
      currentChamber: opts.currentChamber,
    });
    if (pivotResult.isPivot) {
      return pivotResult.reason;
    }
  }

  return undefined; // valid
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Validate the Stage 3 membrane check.
 *
 * Returns { hit: true, record, invalidationReason: 'cache_hit' } on valid cache hit.
 * Returns { hit: false, record: null, invalidationReason } on miss, stale, or Redis absent.
 *
 * Never throws.
 */
export async function validateSessionMembrane(
  opts: MembraneValidateInput,
): Promise<MembraneValidationResult> {
  if (!env.upstashRedisUrl) {
    return { hit: false, record: null, invalidationReason: 'redis_unavailable' };
  }

  const doctrineHash = getCurrentDoctrineVersionHash();
  const key = membraneKey(opts.userId, opts.sessionId, opts.chamber, opts.intentHash, doctrineHash);

  const record = await redisSafeGet<MembraneRecord>(key);

  if (!record) {
    return { hit: false, record: null, invalidationReason: 'cache_miss' };
  }

  const invalidReason = checkMembraneValidity(record, {
    currentChamber: opts.chamber,
    currentDoctrineVersionHash: doctrineHash,
    currentSensitivityClass: opts.currentSensitivityClass,
    currentPolicyProfileVersion: opts.currentPolicyProfileVersion,
    currentDegradedStateHash: opts.currentDegradedStateHash,
    forceRefresh: opts.forceRefresh ?? false,
    currentArtifactFingerprint: opts.currentArtifactFingerprint,
    currentPrompt: opts.currentPrompt,
    currentMode: opts.currentMode,
    currentGravity: opts.currentGravity,
  });

  if (invalidReason) {
    // Proactively delete stale membrane — fire-and-forget
    void redisSafeDel(key).catch(() => {});
    return { hit: false, record: null, invalidationReason: invalidReason };
  }

  // Valid hit — increment counter (fire-and-forget, non-blocking)
  const updated: MembraneRecord = { ...record, hitCount: record.hitCount + 1 };
  void redisSafeSet(key, updated, env.membraneTtlSeconds).catch(() => {});

  return { hit: true, record, invalidationReason: 'cache_hit' };
}

/**
 * Write a new membrane after Stage 4 context assembly.
 *
 * Stores the curated context block so subsequent turns can bypass Stage 4
 * when the context hasn't meaningfully changed.
 * Never throws.
 */
export async function writeSessionMembrane(input: MembraneWriteInput): Promise<boolean> {
  if (!env.upstashRedisUrl) return false;

  const doctrineHash = getCurrentDoctrineVersionHash();
  const key = membraneKey(
    input.userId,
    input.sessionId,
    input.chamber,
    input.intentHash,
    doctrineHash,
  );

  const record: MembraneRecord = {
    curatedContextBlock: input.curatedContextBlock,
    doctrineBundleIds: input.doctrineBundleIds,
    contextHash: contextFingerprint(input.curatedContextBlock),
    artifactFingerprint: input.artifactFingerprint ?? '',
    doctrineVersionHash: doctrineHash,
    sensitivityClass: input.sensitivityClass,
    policyProfileVersion: input.policyProfileVersion,
    degradedStateHash: input.degradedStateHash,
    chamber: input.chamber,
    resolvedAt: new Date().toISOString(),
    hitCount: 0,
    // Phase E: store origin context for pivot detection on subsequent turns.
    originPromptSnippet: input.originPromptSnippet?.slice(0, 500),
    originMode: input.originMode,
    originGravity: input.originGravity,
  };

  return redisSafeSet(key, record, env.membraneTtlSeconds);
}

/**
 * Explicitly invalidate a session membrane.
 * Called on sovereignty control changes, hard pivot detection (Phase E), etc.
 * Never throws.
 */
export async function invalidateSessionMembrane(
  userId: string,
  sessionId: string,
  chamber: AtlasChamber,
  intentHash: string,
): Promise<boolean> {
  if (!env.upstashRedisUrl) return false;
  const doctrineHash = getCurrentDoctrineVersionHash();
  const key = membraneKey(userId, sessionId, chamber, intentHash, doctrineHash);
  return redisSafeDel(key);
}
