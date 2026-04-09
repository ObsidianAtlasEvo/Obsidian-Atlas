import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
import type { AlignmentVerdict, ConstitutionClauseType } from '../../types/cognitiveSovereignty.js';
import { constitutionClauseTypeSchema } from '../../types/cognitiveSovereignty.js';
import { recordGovernanceAudit } from './governanceAudit.js';

export interface ConstitutionClauseRow {
  id: string;
  user_id: string;
  version_group_id: string;
  version: number;
  supersedes_clause_id: string | null;
  clause_type: string;
  title: string;
  body: string;
  priority: number;
  protected: number;
  effective_from: string;
  created_at: string;
  archived_at: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function listActiveConstitutionClauses(userId: string, limit = 200): ConstitutionClauseRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM constitution_clauses
       WHERE user_id = ? AND archived_at IS NULL
       ORDER BY protected DESC, priority DESC, created_at ASC
       LIMIT ?`
    )
    .all(userId, limit) as ConstitutionClauseRow[];
}

export function getConstitutionClause(userId: string, id: string): ConstitutionClauseRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM constitution_clauses WHERE user_id = ? AND id = ?`)
    .get(userId, id) as ConstitutionClauseRow | undefined;
  return row ?? null;
}

export function getConstitutionVersionHistory(userId: string, versionGroupId: string): ConstitutionClauseRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM constitution_clauses
       WHERE user_id = ? AND version_group_id = ?
       ORDER BY version ASC`
    )
    .all(userId, versionGroupId) as ConstitutionClauseRow[];
}

export interface CreateClauseInput {
  userId: string;
  clauseType: ConstitutionClauseType;
  title: string;
  body: string;
  priority?: number;
  protected?: boolean;
  versionGroupId?: string;
}

/**
 * Creates a new constitutional clause (version 1) or a new version in an existing group (supersedes prior active).
 */
export function createConstitutionClause(input: CreateClauseInput): ConstitutionClauseRow {
  constitutionClauseTypeSchema.parse(input.clauseType);
  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  const versionGroupId = input.versionGroupId ?? randomUUID();
  const priority = input.priority ?? 0;
  const prot = input.protected ? 1 : 0;

  const prior = db
    .prepare(
      `SELECT id, version FROM constitution_clauses
       WHERE user_id = ? AND version_group_id = ? AND archived_at IS NULL
       ORDER BY version DESC LIMIT 1`
    )
    .get(input.userId, versionGroupId) as { id: string; version: number } | undefined;

  const nextVersion = prior ? prior.version + 1 : 1;
  const supersedes = prior?.id ?? null;

  if (prior) {
    db.prepare(`UPDATE constitution_clauses SET archived_at = ? WHERE id = ?`).run(ts, prior.id);
  }

  db.prepare(
    `INSERT INTO constitution_clauses (
      id, user_id, version_group_id, version, supersedes_clause_id, clause_type, title, body,
      priority, protected, effective_from, created_at, archived_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
  ).run(
    id,
    input.userId,
    versionGroupId,
    nextVersion,
    supersedes,
    input.clauseType,
    input.title.trim(),
    input.body.trim(),
    priority,
    prot,
    ts,
    ts
  );

  recordGovernanceAudit({
    userId: input.userId,
    action: 'constitution_clause_create',
    entityType: 'constitution_clause',
    entityId: id,
    payload: { versionGroupId, version: nextVersion, clauseType: input.clauseType },
  });

  const row = getConstitutionClause(input.userId, id);
  if (!row) throw new Error('constitution_clause_insert_failed');
  return row;
}

/** Tokens for naive relevance + tension heuristics (no LLM required). */
function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

export interface AlignmentClauseHit {
  id: string;
  version_group_id: string;
  clause_type: string;
  title: string;
  overlap_score: number;
  protected: boolean;
}

export interface AlignmentEvaluation {
  verdict: AlignmentVerdict;
  clause_hits: AlignmentClauseHit[];
  notes: string[];
  emotional_appeal_risk: 'low' | 'medium' | 'high';
}

const HYPE_MARKERS = /\b(amazing|love|hate|must|always|never|obviously|everyone knows|just trust)\b/i;

/**
 * Structural alignment pass: token overlap + protected-clause tension heuristics.
 * LLM refinement can be layered in the response pipeline; this output is inspectable and deterministic.
 */
export function evaluateConstitutionalAlignment(input: {
  userId: string;
  recommendationText: string;
  /** Optional user-stated action for principle conflict surfacing */
  userActionSummary?: string;
}): AlignmentEvaluation {
  const clauses = listActiveConstitutionClauses(input.userId, 300);
  const recTokens = tokenize(input.recommendationText);
  const actionTokens = input.userActionSummary ? tokenize(input.userActionSummary) : new Set<string>();

  const hits: AlignmentClauseHit[] = [];
  const notes: string[] = [];

  for (const c of clauses) {
    const ct = tokenize(`${c.title} ${c.body}`);
    let overlap = 0;
    for (const t of recTokens) {
      if (ct.has(t)) overlap += 1;
    }
    const denom = Math.sqrt(recTokens.size * ct.size) || 1;
    const score = overlap / denom;
    if (score > 0.08 || c.protected === 1) {
      hits.push({
        id: c.id,
        version_group_id: c.version_group_id,
        clause_type: c.clause_type,
        title: c.title,
        overlap_score: Number(score.toFixed(4)),
        protected: c.protected === 1,
      });
    }

    if (c.protected === 1 && input.userActionSummary) {
      let aOverlap = 0;
      for (const t of actionTokens) {
        if (ct.has(t)) aOverlap += 1;
      }
      const anti =
        c.clause_type === 'anti_value' ||
        c.clause_type === 'red_line' ||
        c.clause_type === 'non_negotiable';
      if (anti && aOverlap >= 2) {
        notes.push(
          `Possible tension: user action summary overlaps ${c.clause_type} clause "${c.title}" (id=${c.id}).`
        );
      }
    }
  }

  hits.sort((a, b) => (b.protected === a.protected ? b.overlap_score - a.overlap_score : b.protected ? 1 : -1));

  let verdict: AlignmentVerdict = 'insufficient_context';
  if (clauses.length === 0) {
    notes.push('No constitutional clauses on file — cannot evaluate alignment.');
  } else if (notes.some((n) => n.startsWith('Possible tension'))) {
    verdict = 'tension';
  } else if (hits.some((h) => h.protected && h.overlap_score > 0.15)) {
    verdict = 'aligned';
  } else if (hits.length > 0 && hits[0]!.overlap_score > 0.12) {
    verdict = 'aligned';
  } else if (hits.length > 0) {
    verdict = 'tension';
  }

  const hype = HYPE_MARKERS.test(input.recommendationText);
  const emotional_appeal_risk: AlignmentEvaluation['emotional_appeal_risk'] = hype ? 'high' : 'low';
  if (hype) {
    notes.push(
      'Recommendation text contains hype / absolutist markers — treat as potential emotional appeal vs constitutional grounding.'
    );
  }

  return { verdict, clause_hits: hits.slice(0, 24), notes, emotional_appeal_risk };
}

export function formatConstitutionBlockForPrompt(userId: string, limit = 48): string {
  const rows = listActiveConstitutionClauses(userId, limit);
  if (rows.length === 0) return '(no constitution_clauses on file — legacy doctrine_nodes may still apply)';
  return rows
    .map(
      (r) =>
        `### [${r.clause_type}] ${r.title} (id=${r.id}, v${r.version}, protected=${r.protected === 1})\n${r.body.slice(0, 4000)}${r.body.length > 4000 ? '…' : ''}`
    )
    .join('\n\n');
}
