/**
 * artifactStateFingerprintService.ts — V1.0 Phase F
 *
 * Computes, persists, and compares fingerprints of the user's artifact state —
 * the set of uploaded documents, code files, and structured assets accessible
 * to Atlas at the time of each request.
 *
 * Purpose:
 *   1. Membrane trigger: when artifacts change between turns, the cached
 *      membrane's context block is stale (it was assembled without knowledge
 *      of the new artifact). The fingerprint difference triggers
 *      'artifact_fingerprint_change' invalidation in sessionMembraneService.
 *
 *   2. Audit: records which artifacts were present during each request,
 *      enabling reasoning about why Atlas responded the way it did.
 *
 *   3. Diff: returns a structured diff when artifacts change, so the conductor
 *      can surface "new document detected" context to the specialist.
 *
 * Fingerprinting:
 *   FNV-1a hash over a deterministic serialisation of the artifact manifest:
 *   sorted array of (id + type + modifiedAt) tuples. This hash is stable
 *   for identical artifact sets regardless of retrieval order.
 *
 * Zero-cost:
 *   No model calls. The manifest is assembled from metadata already present
 *   in the session context (uploaded file IDs, connector document metadata).
 *   Falls back to an empty fingerprint if no artifact metadata is available.
 *
 * Design contract:
 *   - computeArtifactFingerprint: pure, synchronous, no I/O
 *   - persistArtifactFingerprint: fire-and-forget from conductor
 *   - getLatestArtifactFingerprint: async DB read, returns null on failure
 *   - diffArtifactFingerprints: pure, synchronous
 */

import { supabaseRest } from '../../db/supabase.js';

// ── Types ─────────────────────────────────────────────────────────────────

export interface ArtifactEntry {
  id: string;
  type: 'document' | 'code' | 'image' | 'spreadsheet' | 'other';
  name: string;
  modifiedAt: string; // ISO timestamp or empty string if unknown
}

export interface ArtifactFingerprint {
  fingerprint: string;
  manifest: ArtifactEntry[];
  computedAt: string;
}

export interface ArtifactDiff {
  changed: boolean;
  added: ArtifactEntry[];
  removed: ArtifactEntry[];
  modified: ArtifactEntry[];
}

// ── FNV-1a 32-bit hash ────────────────────────────────────────────────────

function fnv1a32(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

// ── Core fingerprinting ───────────────────────────────────────────────────

/**
 * computeArtifactFingerprint
 *
 * Produces a stable FNV-1a fingerprint from an array of ArtifactEntry objects.
 * Deterministic: sorts by (id, modifiedAt) before hashing.
 *
 * @param artifacts  Array of artifact entries from session context.
 * @returns          ArtifactFingerprint with hash, sorted manifest, and timestamp.
 */
export function computeArtifactFingerprint(artifacts: ArtifactEntry[]): ArtifactFingerprint {
  if (!artifacts || artifacts.length === 0) {
    return {
      fingerprint: 'empty',
      manifest: [],
      computedAt: new Date().toISOString(),
    };
  }

  // Deterministic sort: by id, then modifiedAt
  const sorted = [...artifacts].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : a.modifiedAt.localeCompare(b.modifiedAt),
  );

  // Serialise to stable string: id:type:modifiedAt tuples joined
  const serialised = sorted.map((a) => `${a.id}:${a.type}:${a.modifiedAt}`).join('|');
  const fingerprint = fnv1a32(serialised);

  return {
    fingerprint,
    manifest: sorted,
    computedAt: new Date().toISOString(),
  };
}

/**
 * diffArtifactFingerprints
 *
 * Computes the structural diff between two artifact manifests.
 * Pure, synchronous — no I/O.
 *
 * @param previous  Previous manifest (from DB or empty).
 * @param current   Current manifest for this request.
 * @returns         ArtifactDiff with change classification.
 */
export function diffArtifactFingerprints(
  previous: ArtifactEntry[],
  current: ArtifactEntry[],
): ArtifactDiff {
  const prevById = new Map(previous.map((a) => [a.id, a]));
  const currById = new Map(current.map((a) => [a.id, a]));

  const added: ArtifactEntry[] = [];
  const removed: ArtifactEntry[] = [];
  const modified: ArtifactEntry[] = [];

  for (const [id, curr] of currById) {
    const prev = prevById.get(id);
    if (!prev) {
      added.push(curr);
    } else if (prev.modifiedAt !== curr.modifiedAt) {
      modified.push(curr);
    }
  }

  for (const [id, prev] of prevById) {
    if (!currById.has(id)) {
      removed.push(prev);
    }
  }

  return {
    changed: added.length > 0 || removed.length > 0 || modified.length > 0,
    added,
    removed,
    modified,
  };
}

// ── Persistence ───────────────────────────────────────────────────────────

/**
 * persistArtifactFingerprint
 *
 * Writes an artifact fingerprint snapshot to artifact_state_fingerprints.
 * Always fire-and-forget. Never throws.
 *
 * @param userId      User ID.
 * @param requestId   Request correlation ID.
 * @param traceId     Conductor trace ID.
 * @param current     Current fingerprint.
 * @param previous    Previous fingerprint (for diff tracking), or null.
 */
export async function persistArtifactFingerprint(
  userId: string,
  requestId: string,
  traceId: string,
  current: ArtifactFingerprint,
  previous: string | null,
): Promise<void> {
  try {
    if (!userId || !requestId) return;

    const changed = previous !== null && previous !== current.fingerprint && previous !== 'empty';

    await supabaseRest(
      'POST',
      'artifact_state_fingerprints',
      {
        user_id: userId,
        request_id: requestId,
        trace_id: traceId,
        fingerprint: current.fingerprint,
        artifact_manifest: current.manifest,
        changed_from_previous: changed,
        previous_fingerprint: previous ?? null,
      },
      { Prefer: 'return=minimal' },
    );
  } catch {
    // Non-critical — silently swallow
  }
}

/**
 * getLatestArtifactFingerprint
 *
 * Retrieves the most recently persisted artifact fingerprint for a user.
 * Used to compare against the current request's fingerprint for membrane invalidation.
 *
 * @param userId  User ID.
 * @returns       Most recent fingerprint string, or null if none exists.
 */
export async function getLatestArtifactFingerprint(
  userId: string,
): Promise<string | null> {
  try {
    const result = await supabaseRest<Array<{ fingerprint: string }>>(
      'GET',
      `artifact_state_fingerprints?user_id=eq.${encodeURIComponent(userId)}&tombstoned=eq.false&order=created_at.desc&limit=1`,
    );
    if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
      return result.data[0].fingerprint ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * buildArtifactManifestFromInput
 *
 * Constructs an ArtifactEntry array from the conductor input's available metadata.
 * Currently reads from input.attachments if present (future: connector documents).
 * Returns empty array if no artifact metadata is available.
 *
 * @param attachments  Optional array of attachment metadata from the request.
 * @returns            Normalised ArtifactEntry array.
 */
export function buildArtifactManifestFromInput(
  attachments?: Array<{
    id?: string;
    name?: string;
    type?: string;
    modifiedAt?: string;
    size?: number;
  }> | null,
): ArtifactEntry[] {
  if (!attachments || attachments.length === 0) return [];

  return attachments
    .filter((a) => !!a.id)
    .map((a) => ({
      id: a.id!,
      type: normaliseArtifactType(a.type ?? ''),
      name: a.name ?? a.id!,
      modifiedAt: a.modifiedAt ?? '',
    }));
}

function normaliseArtifactType(raw: string): ArtifactEntry['type'] {
  const lower = raw.toLowerCase();
  if (lower.includes('doc') || lower.includes('pdf') || lower.includes('txt')) return 'document';
  if (lower.includes('code') || lower.includes('js') || lower.includes('ts') || lower.includes('py')) return 'code';
  if (lower.includes('img') || lower.includes('png') || lower.includes('jpg')) return 'image';
  if (lower.includes('sheet') || lower.includes('csv') || lower.includes('xls')) return 'spreadsheet';
  return 'other';
}
