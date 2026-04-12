import { getDb } from '../../db/sqlite.js';
import type { EvalResult } from '../evolution/evalEngine.js';

export type MergedGapRow = {
  id: string;
  userId: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  type: string;
  notes: string | null;
  detectedAt: string;
  repairedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Distinguishes console-created gaps from eval pipeline gaps. */
  source: 'governance' | 'evolution';
};

function parseEvalSnapshot(raw: string): Partial<EvalResult> | null {
  try {
    return JSON.parse(raw) as EvalResult;
  } catch {
    return null;
  }
}

/**
 * Lists governance_gaps plus evolution_gaps (eval below threshold), merged newest-first.
 */
export function listMergedGapsForUser(userId: string, statusFilter?: string): MergedGapRow[] {
  const db = getDb();

  const govRows = (() => {
    if (statusFilter) {
      return db
        .prepare(
          `SELECT id, user_id, title, description, severity, status, type, notes, detected_at, repaired_at, created_at, updated_at
           FROM governance_gaps WHERE user_id = ? AND status = ?`
        )
        .all(userId, statusFilter) as Record<string, unknown>[];
    }
    return db
      .prepare(
        `SELECT id, user_id, title, description, severity, status, type, notes, detected_at, repaired_at, created_at, updated_at
         FROM governance_gaps WHERE user_id = ?`
      )
      .all(userId) as Record<string, unknown>[];
  })();

  const mappedGov: MergedGapRow[] = govRows.map((r) => ({
    id: String(r['id']),
    userId: String(r['user_id']),
    title: String(r['title']),
    description: String(r['description']),
    severity: String(r['severity']),
    status: String(r['status']),
    type: String(r['type']),
    notes: r['notes'] != null ? String(r['notes']) : null,
    detectedAt: String(r['detected_at']),
    repairedAt: r['repaired_at'] != null ? String(r['repaired_at']) : null,
    createdAt: String(r['created_at']),
    updatedAt: String(r['updated_at']),
    source: 'governance' as const,
  }));

  let evoRows: Record<string, unknown>[] = [];
  try {
    evoRows = db
      .prepare(
        `SELECT id, user_id, trace_id, reason, eval_snapshot, created_at
         FROM evolution_gaps WHERE user_id = ? ORDER BY datetime(created_at) DESC`
      )
      .all(userId) as Record<string, unknown>[];
  } catch {
    evoRows = [];
  }

  const includeEvolution = !statusFilter || statusFilter === 'identified';

  const mappedEvo: MergedGapRow[] = includeEvolution
    ? evoRows.map((r) => {
    const snap = parseEvalSnapshot(String(r['eval_snapshot'] ?? '{}'));
    const combined = snap?.combinedNormalized;
    const detailLines = [
      String(r['reason'] ?? ''),
      snap
        ? `eval: combinedNormalized=${combined ?? '?'} gapFlagged=${String(snap.gapFlagged)} source=${snap.source}`
        : '',
    ].filter(Boolean);
    const trace = r['trace_id'] ? `trace=${String(r['trace_id'])}` : '';
    return {
      id: String(r['id']),
      userId: String(r['user_id']),
      title: 'Evolution / epistemic gap (post-turn eval)',
      description: [detailLines.join('\n'), trace].filter(Boolean).join('\n'),
      severity: 'high',
      status: 'identified',
      type: 'evolution_eval_gap',
      notes: null,
      detectedAt: String(r['created_at']),
      repairedAt: null,
      createdAt: String(r['created_at']),
      updatedAt: String(r['created_at']),
      source: 'evolution' as const,
    };
  })
    : [];

  const merged = [...mappedGov, ...mappedEvo];
  merged.sort((a, b) => {
    const ta = Date.parse(a.detectedAt) || 0;
    const tb = Date.parse(b.detectedAt) || 0;
    return tb - ta;
  });

  return merged;
}
