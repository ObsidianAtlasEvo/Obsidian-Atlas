/**
 * scopeResolutionService.ts — Phase 0.8: Scope assignment and refinement.
 *
 * Provides:
 *   resolveScope()         — pure: assigns a ScopeResolution from content cues
 *                            and context hints.
 *   persistScopeToSignal() — async: writes resolved scope fields back to
 *                            an identity_signals row.
 *   getScopeForMemory()    — async: reads the scope attached to a memory's
 *                            active signal.
 *
 * Design invariants:
 *   - resolveScope() is pure (no I/O) — safe to call in hot path.
 *   - All Supabase calls guarded by env.memoryLayerEnabled.
 *   - Imports identityGovernance.ts only for types/pure functions.
 *   - Does NOT import from other Phase 0.8 files.
 */

import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';
import {
  type MemoryScopeType,
  type ScopeResolution,
  type ScopeStrength,
  computeScopeStrength,
} from './identityGovernance.js';
import { inferScopeType } from './memoryGovernance.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ResolveScopeInput {
  content: string;
  kind: string;
  chamber?: string;
  projectKey?: string;
  sessionId?: string;
  /** If a scope was already computed upstream, we refine but don't regress. */
  existingScope?: MemoryScopeType;
}

// ── DB row shape ─────────────────────────────────────────────────────────────

interface RawIdentitySignalScopeRow {
  id: string;
  scope_type: string;
  scope_key?: string | null;
  scope_strength?: string | null;
  scope_confidence?: number | null;
  scope_expiration?: string | null;
}

// ── Chamber cue detection ────────────────────────────────────────────────────

const CHAMBER_CUES = /\b(in (?:this |the )?chamber|chamber[\-\s]scoped|this chamber|current chamber|atlas chamber)\b/i;
const PROJECT_CUES = /\b(for (?:this |the )?(?:project|repo|codebase|integration|service)|in (?:atlas|obsidian|the repo))\b/i;
const SESSION_CUES = /\b(for now|this session|right now|just for today|currently|temporarily|just for this)\b/i;
const TOPIC_CUES   = /\b(when (?:discussing|working on|doing)|for (?:architecture|design|code|audit|analysis|reviews?))\b/i;

// ── Pure: resolveScope ───────────────────────────────────────────────────────

/**
 * Determine the best ScopeResolution for a piece of content given optional
 * contextual hints (chamber, project, session).
 *
 * Resolution priority:
 *  1. Explicit session cues in content → session (narrow)
 *  2. Chamber hint + chamber cues → chamber
 *  3. ProjectKey hint + project cues → project
 *  4. Topic cues → topic
 *  5. Fallback to inferScopeType() from memoryGovernance.ts
 *  6. existingScope is respected: we never regress a tighter scope to a broader one
 */
export function resolveScope(input: ResolveScopeInput): ScopeResolution {
  const { content, chamber, projectKey, sessionId, existingScope } = input;
  const safeContent = content ?? '';

  // 1. Session cues always win — most restrictive.
  if (SESSION_CUES.test(safeContent) || (sessionId && !chamber && !projectKey)) {
    if (!chamber && !projectKey) {
      return buildScope('session', undefined, 'narrow', 0.85, 'Session cue detected in content');
    }
  }

  // 2. Chamber hint + chamber cue in content.
  if (chamber && CHAMBER_CUES.test(safeContent)) {
    return buildScope('chamber', chamber, 'moderate', 0.9, `Chamber cue matched: ${chamber}`);
  }

  // 3. Chamber hint even without explicit content cue (lower confidence).
  if (chamber) {
    return buildScope('chamber', chamber, 'moderate', 0.7, `Chamber context provided: ${chamber}`);
  }

  // 4. Project key + project cues in content.
  if (projectKey && PROJECT_CUES.test(safeContent)) {
    return buildScope('project', projectKey, 'moderate', 0.88, `Project cue matched: ${projectKey}`);
  }

  // 5. Project key without cue — still project-scoped but lower confidence.
  if (projectKey) {
    return buildScope('project', projectKey, 'moderate', 0.65, `Project context provided: ${projectKey}`);
  }

  // 6. Topic cue in content.
  if (TOPIC_CUES.test(safeContent)) {
    return buildScope('topic', extractTopicKey(safeContent), 'moderate', 0.75, 'Topic cue detected in content');
  }

  // 7. Delegate to memoryGovernance.ts inferScopeType for remaining cases.
  const inferred = inferScopeType(safeContent);
  const inferredType = inferred.scopeType;

  // 8. If existingScope is narrower than inferred, keep existing (never regress).
  const resolvedType = pickNarrowerScope(existingScope, inferredType);
  const resolvedKey  = inferredType === resolvedType ? (inferred.scopeKey ?? undefined) : undefined;
  const strength = computeScopeStrength(resolvedType);
  const reasoning = inferredType !== resolvedType
    ? `Kept existing tighter scope '${existingScope}' over inferred '${inferredType}'`
    : `Inferred from content analysis: ${inferredType}`;

  return buildScope(resolvedType, resolvedKey, strength, 0.65, reasoning);
}

// ── Async: persistScopeToSignal ──────────────────────────────────────────────

/**
 * Write the resolved scope fields back to an identity_signals row.
 * No-op if storage is unavailable.
 */
export async function persistScopeToSignal(
  signalId: string,
  scope: ScopeResolution,
): Promise<void> {
  if (!env.memoryLayerEnabled) return;
  if (!process.env.SUPABASE_URL) return;
  if (!signalId) return;

  try {
    await supabaseRest(
      'PATCH',
      `identity_signals?id=eq.${encodeURIComponent(signalId)}`,
      {
        scope_type: scope.scopeType,
        scope_key: scope.scopeKey ?? null,
        scope_strength: scope.scopeStrength,
        scope_confidence: scope.scopeConfidence,
        scope_expiration: scope.scopeExpiration?.toISOString() ?? null,
        updated_at: new Date().toISOString(),
      },
      { Prefer: 'return=minimal' },
    );
  } catch (err) {
    console.warn('[scopeResolutionService] persistScopeToSignal threw:', err instanceof Error ? err.message : err);
  }
}

// ── Async: getScopeForMemory ──────────────────────────────────────────────────

/**
 * Look up the ScopeResolution that was assigned to a given memory_id via
 * its active, non-superseded identity_signals row.
 * Returns null when no signal is found.
 */
export async function getScopeForMemory(
  memoryId: string,
): Promise<ScopeResolution | null> {
  if (!env.memoryLayerEnabled) return null;
  if (!process.env.SUPABASE_URL) return null;
  if (!memoryId) return null;

  try {
    const res = await supabaseRest<RawIdentitySignalScopeRow[]>(
      'GET',
      `identity_signals?memory_id=eq.${encodeURIComponent(memoryId)}&active=eq.true&superseded_by=is.null&select=id,scope_type,scope_key,scope_strength,scope_confidence,scope_expiration&limit=1`,
    );

    if (!res.ok || !Array.isArray(res.data) || res.data.length === 0) {
      return null;
    }

    const row = res.data[0];
    if (!row) return null;

    return {
      scopeType: (row.scope_type as MemoryScopeType) ?? 'global',
      scopeKey: row.scope_key ?? undefined,
      scopeStrength: (row.scope_strength as ScopeStrength) ?? 'broad',
      scopeConfidence: row.scope_confidence ?? 0.5,
      scopeExpiration: row.scope_expiration ? new Date(row.scope_expiration) : undefined,
      scopeReasoning: 'Loaded from identity_signals',
    };
  } catch (err) {
    console.warn('[scopeResolutionService] getScopeForMemory threw:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildScope(
  scopeType: MemoryScopeType,
  scopeKey: string | undefined,
  scopeStrength: ScopeStrength,
  scopeConfidence: number,
  scopeReasoning: string,
  scopeExpiration?: Date,
): ScopeResolution {
  return {
    scopeType,
    scopeKey: scopeKey?.slice(0, 120) || undefined,
    scopeStrength,
    scopeConfidence: Math.max(0, Math.min(1, scopeConfidence)),
    scopeExpiration,
    scopeReasoning,
  };
}

/**
 * Scope hierarchy from narrowest to broadest:
 * session < topic < chamber < project < global
 *
 * Returns whichever of a or b is narrower (lower index wins).
 * If a is undefined, returns b.
 */
const SCOPE_ORDER: MemoryScopeType[] = ['session', 'topic', 'chamber', 'project', 'global'];

function pickNarrowerScope(
  a: MemoryScopeType | undefined,
  b: MemoryScopeType,
): MemoryScopeType {
  if (!a) return b;
  const indexA = SCOPE_ORDER.indexOf(a);
  const indexB = SCOPE_ORDER.indexOf(b);
  // If a is not in the list at all, fall back to b.
  if (indexA === -1) return b;
  if (indexB === -1) return a;
  return indexA <= indexB ? a : b;
}

function extractTopicKey(content: string): string | undefined {
  const m = content.match(/\b(?:for|on|in|about|when (?:discussing|working on))\s+([\w\-]+(?:\s+[\w\-]+)?)/i);
  if (!m) return undefined;
  return m[1].toLowerCase().trim().slice(0, 60) || undefined;
}
