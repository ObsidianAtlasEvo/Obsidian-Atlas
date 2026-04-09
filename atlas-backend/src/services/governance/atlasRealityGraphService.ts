import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
import { atlasRgNodeKindSchema, atlasRgRelationSchema } from '../../types/strategicLayer.js';
import { recordGovernanceAudit } from './governanceAudit.js';
import { getDecisionWithOptions } from './decisionLedgerService.js';

function nowIso(): string {
  return new Date().toISOString();
}

const TENSION_RELATIONS = new Set([
  'conflicts_with',
  'is_contradicted_by',
  'threatens',
  'drains',
  'weakens',
  'distorts',
  'remains_unresolved_by',
]);

export function upsertAtlasRgNode(input: {
  userId: string;
  id?: string;
  kind: string;
  label: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  ledgerRefType?: string | null;
  ledgerRefId?: string | null;
}): string {
  atlasRgNodeKindSchema.parse(input.kind);
  const db = getDb();
  const id = input.id ?? randomUUID();
  const ts = nowIso();
  const existing = db.prepare(`SELECT id FROM atlas_rg_nodes WHERE id = ? AND user_id = ?`).get(id, input.userId) as
    | { id: string }
    | undefined;

  if (existing) {
    db.prepare(
      `UPDATE atlas_rg_nodes SET kind = ?, label = ?, summary = ?, metadata_json = ?, ledger_ref_type = ?, ledger_ref_id = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(
      input.kind,
      input.label.trim().slice(0, 500),
      (input.summary ?? '').trim().slice(0, 10_000),
      JSON.stringify(input.metadata ?? {}),
      input.ledgerRefType ?? null,
      input.ledgerRefId ?? null,
      ts,
      id,
      input.userId
    );
  } else {
    db.prepare(
      `INSERT INTO atlas_rg_nodes (id, user_id, kind, label, summary, metadata_json, ledger_ref_type, ledger_ref_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.userId,
      input.kind,
      input.label.trim().slice(0, 500),
      (input.summary ?? '').trim().slice(0, 10_000),
      JSON.stringify(input.metadata ?? {}),
      input.ledgerRefType ?? null,
      input.ledgerRefId ?? null,
      ts,
      ts
    );
  }

  recordGovernanceAudit({
    userId: input.userId,
    action: 'atlas_rg_node_upsert',
    entityType: 'atlas_rg_node',
    entityId: id,
  });
  return id;
}

export function addAtlasRgEdge(input: {
  userId: string;
  srcNodeId: string;
  dstNodeId: string;
  relation: string;
  weight?: number;
  rationale?: string;
  meta?: Record<string, unknown>;
}): string {
  atlasRgRelationSchema.parse(input.relation);
  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO atlas_rg_edges (id, user_id, src_node_id, dst_node_id, relation, weight, rationale, meta_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.srcNodeId,
    input.dstNodeId,
    input.relation,
    input.weight ?? 1,
    (input.rationale ?? '').trim().slice(0, 5000),
    input.meta != null ? JSON.stringify(input.meta) : null,
    ts
  );
  recordGovernanceAudit({
    userId: input.userId,
    action: 'atlas_rg_edge_add',
    entityType: 'atlas_rg_edge',
    entityId: id,
  });
  return id;
}

export function listAtlasRgNodes(userId: string, limit = 200) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM atlas_rg_nodes WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?`
    )
    .all(userId, limit) as Record<string, unknown>[];
}

export function listAtlasRgEdges(userId: string, limit = 400) {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM atlas_rg_edges WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(userId, limit) as Record<string, unknown>[];
}

export function neighborsOf(userId: string, nodeId: string) {
  const db = getDb();
  const out = db
    .prepare(
      `SELECT e.*, n.label as neighbor_label, n.kind as neighbor_kind
       FROM atlas_rg_edges e
       JOIN atlas_rg_nodes n ON n.id = e.dst_node_id AND n.user_id = e.user_id
       WHERE e.user_id = ? AND e.src_node_id = ?`
    )
    .all(userId, nodeId) as Record<string, unknown>[];
  const inn = db
    .prepare(
      `SELECT e.*, n.label as neighbor_label, n.kind as neighbor_kind
       FROM atlas_rg_edges e
       JOIN atlas_rg_nodes n ON n.id = e.src_node_id AND n.user_id = e.user_id
       WHERE e.user_id = ? AND e.dst_node_id = ?`
    )
    .all(userId, nodeId) as Record<string, unknown>[];
  return { outgoing: out, incoming: inn };
}

/** Edges whose relations indicate structural stress (for reasoning, not visualization-only). */
export function listStructuralTensionEdges(userId: string, limit = 80) {
  const db = getDb();
  const placeholders = [...TENSION_RELATIONS].map(() => '?').join(',');
  return db
    .prepare(
      `SELECT e.*, s.label as src_label, s.kind as src_kind, d.label as dst_label, d.kind as dst_kind
       FROM atlas_rg_edges e
       JOIN atlas_rg_nodes s ON s.id = e.src_node_id
       JOIN atlas_rg_nodes d ON d.id = e.dst_node_id
       WHERE e.user_id = ? AND e.relation IN (${placeholders})
       ORDER BY e.weight DESC, e.created_at DESC
       LIMIT ?`
    )
    .all(userId, ...TENSION_RELATIONS, limit) as Record<string, unknown>[];
}

export function leveragePointNodes(userId: string, limit = 12): { nodeId: string; label: string; kind: string; score: number }[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT n.id, n.label, n.kind, COUNT(e.id) as ec
       FROM atlas_rg_nodes n
       LEFT JOIN atlas_rg_edges e ON (e.src_node_id = n.id OR e.dst_node_id = n.id) AND e.user_id = n.user_id
       WHERE n.user_id = ?
       GROUP BY n.id
       ORDER BY ec DESC
       LIMIT ?`
    )
    .all(userId, limit) as { id: string; label: string; kind: string; ec: number }[];
  return rows.map((r) => ({ nodeId: r.id, label: r.label, kind: r.kind, score: r.ec }));
}

export function explainNeighborhoodPlainLanguage(userId: string, nodeId: string): string {
  const { outgoing, incoming } = neighborsOf(userId, nodeId);
  const db = getDb();
  const self = db.prepare(`SELECT label, kind FROM atlas_rg_nodes WHERE id = ? AND user_id = ?`).get(nodeId, userId) as
    | { label: string; kind: string }
    | undefined;
  if (!self) return '(node not found)';
  const lines: string[] = [];
  lines.push(`Center: [${self.kind}] ${self.label}`);
  for (const e of outgoing) {
    lines.push(
      `  → (${e.relation}) [${e.neighbor_kind}] ${e.neighbor_label}${e.rationale ? ` — ${String(e.rationale).slice(0, 120)}` : ''}`
    );
  }
  for (const e of incoming) {
    lines.push(
      `  ← (${e.relation}) from [${e.neighbor_kind}] ${e.neighbor_label}${e.rationale ? ` — ${String(e.rationale).slice(0, 120)}` : ''}`
    );
  }
  return lines.join('\n');
}

export function summarizeAtlasGraphForPrompt(userId: string, edgeCap = 48): string {
  const nodes = listAtlasRgNodes(userId, 60) as { id: string; kind: string; label: string }[];
  if (nodes.length === 0) return '(atlas reality graph empty — add nodes/edges or sync from decisions)';
  const tensions = listStructuralTensionEdges(userId, 24);
  const leverage = leveragePointNodes(userId, 8);
  const edgeSample = listAtlasRgEdges(userId, edgeCap) as {
    src_node_id: string;
    dst_node_id: string;
    relation: string;
    rationale: string;
  }[];
  const idToLabel = new Map(nodes.map((n) => [n.id, `${n.kind}:${n.label.slice(0, 80)}`]));
  const parts: string[] = [];
  parts.push('NODES (sample):');
  parts.push(...nodes.slice(0, 36).map((n) => `- ${n.id.slice(0, 8)}… [${n.kind}] ${n.label.slice(0, 120)}`));
  parts.push('\nSTRUCTURAL_TENSIONS:');
  if (tensions.length === 0) parts.push('(none recorded)');
  else {
    for (const t of tensions.slice(0, 16)) {
      parts.push(
        `- [${t.relation}] ${idToLabel.get(String(t.src_node_id)) ?? '?'} ↔ ${idToLabel.get(String(t.dst_node_id)) ?? '?'}`
      );
    }
  }
  parts.push('\nLEVERAGE (high degree):');
  parts.push(...leverage.map((l) => `- [${l.kind}] ${l.label} (edges≈${l.score})`));
  parts.push('\nEDGES (sample):');
  for (const e of edgeSample.slice(0, 32)) {
    parts.push(
      `- ${idToLabel.get(e.src_node_id) ?? e.src_node_id} —${e.relation}→ ${idToLabel.get(e.dst_node_id) ?? e.dst_node_id}${e.rationale ? ` (${e.rationale.slice(0, 80)})` : ''}`
    );
  }
  return parts.join('\n');
}

/** Ensure a graph node exists for a decision_ledger row; returns node id. */
export function syncDecisionToGraph(userId: string, decisionId: string): string {
  const wrapped = getDecisionWithOptions(userId, decisionId);
  if (!wrapped) throw new Error('decision_not_found');
  const d = wrapped.decision;
  const db = getDb();
  const existing = db
    .prepare(`SELECT id FROM atlas_rg_nodes WHERE user_id = ? AND ledger_ref_type = 'decision_ledger' AND ledger_ref_id = ?`)
    .get(userId, decisionId) as { id: string } | undefined;
  if (existing) {
    upsertAtlasRgNode({
      userId,
      id: existing.id,
      kind: 'decision',
      label: d.statement.slice(0, 200),
      summary: d.context?.slice(0, 2000) ?? '',
      ledgerRefType: 'decision_ledger',
      ledgerRefId: decisionId,
    });
    return existing.id;
  }
  return upsertAtlasRgNode({
    userId,
    kind: 'decision',
    label: d.statement.slice(0, 200),
    summary: d.context?.slice(0, 2000) ?? '',
    ledgerRefType: 'decision_ledger',
    ledgerRefId: decisionId,
  });
}

export function runGraphReasoningQuery(userId: string, queryKind: 'tensions' | 'leverage' | 'narrative_divergence_hint') {
  if (queryKind === 'tensions') {
    return { kind: queryKind, edges: listStructuralTensionEdges(userId, 40) };
  }
  if (queryKind === 'leverage') {
    return { kind: queryKind, nodes: leveragePointNodes(userId, 20) };
  }
  const tensions = listStructuralTensionEdges(userId, 30);
  const decisions = listAtlasRgNodes(userId, 80).filter(
    (n) => (n as { kind: string }).kind === 'decision'
  ) as { id: string; label: string }[];
  return {
    kind: queryKind,
    note: 'Heuristic: many tensions touching few decision nodes may indicate narrative drift from committed choices.',
    tension_count: tensions.length,
    decision_nodes_sample: decisions.slice(0, 10),
  };
}
