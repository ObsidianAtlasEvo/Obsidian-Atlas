import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
import { recordGovernanceAudit } from './governanceAudit.js';

function nowIso(): string {
  return new Date().toISOString();
}

export function coreNodeId(userId: string): string {
  return `${userId}::mm::core`;
}

export function domainNodeId(userId: string, domainKey: string): string {
  return `${userId}::mm::domain::${domainKey}`;
}

export function govNodeId(userId: string, system: string, entityId: string): string {
  return `${userId}::mm::gov::${system}::${entityId}`;
}

const DOMAIN_KEYS = [
  'identity',
  'values',
  'goals',
  'focus',
  'curiosity',
  'tensions',
  'memory',
  'patterns',
] as const;

type DomainKey = (typeof DOMAIN_KEYS)[number];

const DOMAIN_META: Record<
  DomainKey,
  { title: string; subtitle: string; description: string }
> = {
  identity: {
    title: 'Identity',
    subtitle: 'Roles, commitments, self-concepts',
    description:
      'Placeholder sector for who you enact, aspire to be, and how you describe yourself — populated from twin traits, protocols, and your own confirmations.',
  },
  values: {
    title: 'Values & standards',
    subtitle: 'What you protect and expect',
    description:
      'Constitutional clauses, principles, and non-negotiables will anchor here as you codify them.',
  },
  goals: {
    title: 'Goals & direction',
    subtitle: 'Aims, pursuits, desired futures',
    description:
      'Identity goals, major decisions, and directional artifacts cluster here as the substrate grows.',
  },
  focus: {
    title: 'Active focus',
    subtitle: 'What holds attention now',
    description:
      'Simulations, pressing workstreams, and high-recurrence topics surface in this orbit.',
  },
  curiosity: {
    title: 'Questions & curiosity',
    subtitle: 'Open inquiry',
    description:
      'Claims, investigations, and unresolved conceptual threads map into this sector.',
  },
  tensions: {
    title: 'Tensions & unknowns',
    subtitle: 'Friction and contradiction',
    description:
      'Unfinished loops, contradictions, friction diagnoses, and strain points converge here.',
  },
  memory: {
    title: 'Memory & experience',
    subtitle: 'Continuity and lessons',
    description:
      'Evolution events, legacy principles, and durable lessons accumulate as weighted anchors.',
  },
  patterns: {
    title: 'Emerging patterns',
    subtitle: 'Recurrence and style',
    description:
      'Habits, rhetorical tendencies, self-revision signals, and twin-inferred structure appear here.',
  },
};

function userHash(userId: string): number {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function insertNode(row: {
  id: string;
  userId: string;
  nodeKind: string;
  category: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  sourceType: string;
  sourceRefsJson: string;
  confidence: number;
  importance: number;
  recurrence: number;
  status: string;
  layoutX: number;
  layoutY: number;
  layoutRing: number;
  clusterKey?: string | null;
  explainabilityJson: string;
  ts: string;
}): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO mind_map_nodes (
        id, user_id, node_kind, category, title, subtitle, description, source_type, source_refs_json,
        confidence, importance, recurrence_score, volatility, status, visibility, archived, pinned,
        layout_x, layout_y, layout_ring, cluster_key, explainability_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'normal', 0, 0, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.id,
      row.userId,
      row.nodeKind,
      row.category,
      row.title,
      row.subtitle ?? null,
      row.description ?? null,
      row.sourceType,
      row.sourceRefsJson,
      row.confidence,
      row.importance,
      row.recurrence,
      row.status,
      row.layoutX,
      row.layoutY,
      row.layoutRing,
      row.clusterKey ?? null,
      row.explainabilityJson,
      row.ts,
      row.ts
    );
}

function upsertEdge(input: {
  userId: string;
  sourceId: string;
  targetId: string;
  edgeType: string;
  weight: number;
  confidence: number;
  justification?: string;
  explainabilityJson: string;
  sourceRefsJson: string;
}): void {
  const db = getDb();
  const ts = nowIso();
  const id = randomUUID();
  const existing = db
    .prepare(
      `SELECT id FROM mind_map_edges WHERE user_id = ? AND source_id = ? AND target_id = ? AND edge_type = ? AND archived = 0`
    )
    .get(input.userId, input.sourceId, input.targetId, input.edgeType) as { id: string } | undefined;
  if (existing) {
    db.prepare(
      `UPDATE mind_map_edges SET weight = ?, confidence = ?, justification = ?, explainability_json = ?, source_refs_json = ?, updated_at = ? WHERE id = ?`
    ).run(
      input.weight,
      input.confidence,
      input.justification ?? null,
      input.explainabilityJson,
      input.sourceRefsJson,
      ts,
      existing.id
    );
    return;
  }
  db.prepare(
    `INSERT INTO mind_map_edges (
      id, user_id, source_id, target_id, edge_type, weight, confidence, directional, symmetric,
      justification, explainability_json, source_refs_json, archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, 0, ?, ?)`
  ).run(
    id,
    input.userId,
    input.sourceId,
    input.targetId,
    input.edgeType,
    input.weight,
    input.confidence,
    input.justification ?? null,
    input.explainabilityJson,
    input.sourceRefsJson,
    ts,
    ts
  );
}

/** Idempotent: creates core + eight domain anchors and structural edges if missing. */
export function ensureMindMapSeed(userId: string): void {
  const ts = nowIso();
  const cid = coreNodeId(userId);
  const hx = userHash(userId);

  insertNode({
    id: cid,
    userId,
    nodeKind: 'core_self',
    category: 'self',
    title: 'Core self',
    subtitle: 'Your cognitive instance in Atlas',
    description:
      'Stable anchor for this mind map. All sectors connect through here; proximity and gravity calculations use this node as the personal center of mass.',
    sourceType: 'seed',
    sourceRefsJson: '[]',
    confidence: 1,
    importance: 1,
    recurrence: 1,
    status: 'stable',
    layoutX: 0,
    layoutY: 0,
    layoutRing: 0,
    clusterKey: 'core',
    explainabilityJson: JSON.stringify({
      why: 'System seed',
      signals: ['initial_map_scaffold'],
      userDeclared: false,
    }),
    ts,
  });

  const n = DOMAIN_KEYS.length;
  DOMAIN_KEYS.forEach((key, i) => {
    const meta = DOMAIN_META[key];
    const angle = (i / n) * Math.PI * 2 + (hx % 360) * (Math.PI / 180) * 0.02;
    const r = 240;
    const x = Math.round(Math.cos(angle) * r * 10) / 10;
    const y = Math.round(Math.sin(angle) * r * 10) / 10;
    insertNode({
      id: domainNodeId(userId, key),
      userId,
      nodeKind: 'domain_anchor',
      category: key,
      title: meta.title,
      subtitle: meta.subtitle,
      description: meta.description,
      sourceType: 'seed',
      sourceRefsJson: '[]',
      confidence: 0.85,
      importance: 0.75,
      recurrence: 0,
      status: 'emerging',
      layoutX: x,
      layoutY: y,
      layoutRing: 1,
      clusterKey: `domain:${key}`,
      explainabilityJson: JSON.stringify({
        why: 'First-order cognitive sector',
        signals: ['seed_architecture'],
        domainKey: key,
        userDeclared: false,
      }),
      ts,
    });
    upsertEdge({
      userId,
      sourceId: domainNodeId(userId, key),
      targetId: cid,
      edgeType: 'is_part_of',
      weight: 1,
      confidence: 1,
      justification: 'Domain sector belongs to the user cognitive map anchored at core self.',
      explainabilityJson: JSON.stringify({ structural: true }),
      sourceRefsJson: '[]',
    });
  });
}

export type MindMapNodeRow = {
  id: string;
  user_id: string;
  node_kind: string;
  category: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  source_type: string;
  source_refs_json: string;
  confidence: number;
  importance: number;
  recurrence_score: number;
  emotional_weight: number | null;
  volatility: number;
  status: string;
  visibility: string;
  archived: number;
  pinned: number;
  user_confirmed: number | null;
  layout_x: number;
  layout_y: number;
  layout_ring: number;
  cluster_key: string | null;
  explainability_json: string;
  created_at: string;
  updated_at: string;
  last_reinforced_at: string | null;
  last_challenged_at: string | null;
};

export type MindMapEdgeRow = {
  id: string;
  user_id: string;
  source_id: string;
  target_id: string;
  edge_type: string;
  weight: number;
  confidence: number;
  directional: number;
  symmetric: number;
  justification: string | null;
  explainability_json: string;
  source_refs_json: string;
  archived: number;
  created_at: string;
  updated_at: string;
};

export function listMindMapNodes(userId: string, includeArchived = false): MindMapNodeRow[] {
  const db = getDb();
  if (includeArchived) {
    return db.prepare(`SELECT * FROM mind_map_nodes WHERE user_id = ? ORDER BY layout_ring ASC, title ASC`).all(userId) as MindMapNodeRow[];
  }
  return db
    .prepare(`SELECT * FROM mind_map_nodes WHERE user_id = ? AND archived = 0 ORDER BY layout_ring ASC, title ASC`)
    .all(userId) as MindMapNodeRow[];
}

export function listMindMapEdges(userId: string, includeArchived = false): MindMapEdgeRow[] {
  const db = getDb();
  if (includeArchived) {
    return db.prepare(`SELECT * FROM mind_map_edges WHERE user_id = ?`).all(userId) as MindMapEdgeRow[];
  }
  return db.prepare(`SELECT * FROM mind_map_edges WHERE user_id = ? AND archived = 0`).all(userId) as MindMapEdgeRow[];
}

function upsertGovNode(input: {
  userId: string;
  id: string;
  nodeKind: string;
  category: DomainKey;
  title: string;
  subtitle?: string;
  description: string;
  sourceRefs: { system: string; id: string; role?: string }[];
  confidence: number;
  importance: number;
  recurrenceDelta: number;
  explainability: Record<string, unknown>;
  clusterKey: string;
}): void {
  const db = getDb();
  const ts = nowIso();
  const refs = JSON.stringify(input.sourceRefs);
  const expl = JSON.stringify(input.explainability);
  const existing = db.prepare(`SELECT recurrence_score, id FROM mind_map_nodes WHERE id = ?`).get(input.id) as
    | { recurrence_score: number; id: string }
    | undefined;

  if (existing) {
    const newRec = Math.min(1, existing.recurrence_score + input.recurrenceDelta);
    db.prepare(
      `UPDATE mind_map_nodes SET
        title = ?, subtitle = ?, description = ?, source_refs_json = ?, confidence = ?, importance = ?,
        recurrence_score = ?, cluster_key = ?, explainability_json = ?, updated_at = ?, last_reinforced_at = ?,
        status = CASE WHEN ? > 0.15 THEN 'active' ELSE status END
      WHERE id = ?`
    ).run(
      input.title.slice(0, 500),
      input.subtitle?.slice(0, 500) ?? null,
      input.description.slice(0, 8000),
      refs,
      input.confidence,
      input.importance,
      newRec,
      input.clusterKey,
      expl,
      ts,
      ts,
      newRec,
      input.id
    );
    return;
  }

  db.prepare(
    `INSERT INTO mind_map_nodes (
      id, user_id, node_kind, category, title, subtitle, description, source_type, source_refs_json,
      confidence, importance, recurrence_score, volatility, status, visibility, archived, pinned,
      layout_x, layout_y, layout_ring, cluster_key, explainability_json, created_at, updated_at, last_reinforced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'governance_sync', ?, ?, ?, ?, 0.1, 'emerging', 'normal', 0, 0, 0, 0, 2, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.userId,
    input.nodeKind,
    input.category,
    input.title.slice(0, 500),
    input.subtitle?.slice(0, 500) ?? null,
    input.description.slice(0, 8000),
    refs,
    input.confidence,
    input.importance,
    input.recurrenceDelta,
    input.clusterKey,
    expl,
    ts,
    ts,
    ts
  );
}

/** Pulls from sovereignty tables into the mind map; reinforces existing nodes. */
export function syncMindMapFromGovernance(userId: string): { nodesAdded: number; edgesTouched: number } {
  ensureMindMapSeed(userId);
  const db = getDb();
  const before = db.prepare(`SELECT COUNT(*) as c FROM mind_map_nodes WHERE user_id = ?`).get(userId) as { c: number };

  const clauses = db
    .prepare(
      `SELECT id, title, body, clause_type FROM constitution_clauses WHERE user_id = ? AND archived_at IS NULL`
    )
    .all(userId) as { id: string; title: string; body: string; clause_type: string }[];

  for (const c of clauses) {
    const id = govNodeId(userId, 'constitution', c.id);
    upsertGovNode({
      userId,
      id,
      nodeKind: 'doctrine',
      category: 'values',
      title: c.title,
      subtitle: c.clause_type,
      description: c.body.slice(0, 2000),
      sourceRefs: [{ system: 'constitution', id: c.id }],
      confidence: 0.9,
      importance: 0.85,
      recurrenceDelta: 0.04,
      clusterKey: 'domain:values',
      explainability: {
        why: 'Constitutional clause in active set',
        systems: ['Constitutional Core'],
        inferred: false,
      },
    });
    upsertEdge({
      userId,
      sourceId: id,
      targetId: domainNodeId(userId, 'values'),
      edgeType: 'is_part_of',
      weight: 0.95,
      confidence: 0.95,
      justification: 'Clause grouped under values & standards sector.',
      explainabilityJson: JSON.stringify({}),
      sourceRefsJson: JSON.stringify([{ system: 'constitution', id: c.id }]),
    });
    upsertEdge({
      userId,
      sourceId: id,
      targetId: coreNodeId(userId),
      edgeType: 'stems_from',
      weight: 0.5,
      confidence: 0.7,
      explainabilityJson: JSON.stringify({}),
      sourceRefsJson: JSON.stringify([{ system: 'constitution', id: c.id }]),
    });
  }

  const decisions = db
    .prepare(`SELECT id, statement, context, status FROM decision_ledger WHERE user_id = ? ORDER BY updated_at DESC LIMIT 80`)
    .all(userId) as { id: string; statement: string; context: string; status: string }[];

  for (const d of decisions) {
    const id = govNodeId(userId, 'decision', d.id);
    upsertGovNode({
      userId,
      id,
      nodeKind: 'decision',
      category: 'goals',
      title: d.statement.slice(0, 200) || 'Decision',
      subtitle: d.status,
      description: d.context.slice(0, 3000),
      sourceRefs: [{ system: 'decision_ledger', id: d.id }],
      confidence: 0.82,
      importance: d.status === 'draft' ? 0.65 : 0.8,
      recurrenceDelta: 0.03,
      clusterKey: 'domain:goals',
      explainability: {
        why: 'Recorded in Decision Ledger',
        systems: ['Decision Ledger'],
      },
    });
    upsertEdge({
      userId,
      sourceId: id,
      targetId: domainNodeId(userId, 'goals'),
      edgeType: 'is_part_of',
      weight: 0.85,
      confidence: 0.88,
      explainabilityJson: JSON.stringify({}),
      sourceRefsJson: JSON.stringify([{ system: 'decision_ledger', id: d.id }]),
    });
  }

  const unfinished = db
    .prepare(
      `SELECT id, title, description, kind, status, composite_score FROM unfinished_business_items WHERE user_id = ? AND status = 'open' ORDER BY composite_score DESC LIMIT 60`
    )
    .all(userId) as { id: string; title: string; description: string; kind: string; status: string; composite_score: number }[];

  for (const u of unfinished) {
    const id = govNodeId(userId, 'unfinished', u.id);
    upsertGovNode({
      userId,
      id,
      nodeKind: 'tension',
      category: 'tensions',
      title: u.title,
      subtitle: u.kind,
      description: u.description.slice(0, 3000),
      sourceRefs: [{ system: 'unfinished_business', id: u.id }],
      confidence: 0.78,
      importance: 0.55 + Math.min(0.35, u.composite_score),
      recurrenceDelta: 0.05,
      clusterKey: 'domain:tensions',
      explainability: {
        why: 'Open unfinished business loop',
        systems: ['Unfinished Business Engine'],
      },
    });
    upsertEdge({
      userId,
      sourceId: id,
      targetId: domainNodeId(userId, 'tensions'),
      edgeType: 'is_part_of',
      weight: 0.9,
      confidence: 0.85,
      explainabilityJson: JSON.stringify({}),
      sourceRefsJson: JSON.stringify([{ system: 'unfinished_business', id: u.id }]),
    });
  }

  const goals = db
    .prepare(`SELECT id, aspiration_statement, status, trait_archetype FROM identity_goals WHERE user_id = ? AND status = 'active'`)
    .all(userId) as { id: string; aspiration_statement: string; status: string; trait_archetype: string }[];

  for (const g of goals) {
    const id = govNodeId(userId, 'identity_goal', g.id);
    upsertGovNode({
      userId,
      id,
      nodeKind: 'goal',
      category: 'goals',
      title: g.aspiration_statement.slice(0, 200),
      subtitle: g.trait_archetype,
      description: g.aspiration_statement,
      sourceRefs: [{ system: 'identity_goals', id: g.id }],
      confidence: 0.88,
      importance: 0.9,
      recurrenceDelta: 0.04,
      clusterKey: 'domain:goals',
      explainability: {
        why: 'Active identity goal',
        systems: ['Identity-to-Action Bridge'],
      },
    });
    upsertEdge({
      userId,
      sourceId: id,
      targetId: domainNodeId(userId, 'goals'),
      edgeType: 'is_part_of',
      weight: 0.92,
      confidence: 0.9,
      explainabilityJson: JSON.stringify({}),
      sourceRefsJson: JSON.stringify([{ system: 'identity_goals', id: g.id }]),
    });
    upsertEdge({
      userId,
      sourceId: id,
      targetId: domainNodeId(userId, 'identity'),
      edgeType: 'informs',
      weight: 0.55,
      confidence: 0.72,
      explainabilityJson: JSON.stringify({}),
      sourceRefsJson: JSON.stringify([{ system: 'identity_goals', id: g.id }]),
    });
  }

  const traits = db
    .prepare(
      `SELECT id, domain, trait_key, value, confidence FROM cognitive_twin_traits WHERE user_id = ? AND archived_at IS NULL LIMIT 40`
    )
    .all(userId) as { id: string; domain: string; trait_key: string; value: string; confidence: number }[];

  for (const t of traits) {
    const id = govNodeId(userId, 'twin_trait', t.id);
    upsertGovNode({
      userId,
      id,
      nodeKind: 'trait',
      category: 'patterns',
      title: `${t.trait_key}: ${t.value}`.slice(0, 200),
      subtitle: t.domain,
      description: `Cognitive twin trait in domain ${t.domain}.`,
      sourceRefs: [{ system: 'cognitive_twin', id: t.id }],
      confidence: t.confidence,
      importance: 0.55,
      recurrenceDelta: 0.02,
      clusterKey: 'domain:patterns',
      explainability: {
        why: 'Active cognitive twin trait',
        systems: ['Cognitive Twin'],
        inferred: true,
      },
    });
    upsertEdge({
      userId,
      sourceId: id,
      targetId: domainNodeId(userId, 'patterns'),
      edgeType: 'is_part_of',
      weight: 0.75,
      confidence: t.confidence,
      explainabilityJson: JSON.stringify({}),
      sourceRefsJson: JSON.stringify([{ system: 'cognitive_twin', id: t.id }]),
    });
  }

  const claims = db
    .prepare(`SELECT id, statement, epistemic_state, confidence FROM epistemic_claims WHERE user_id = ? LIMIT 50`)
    .all(userId) as { id: string; statement: string; epistemic_state: string; confidence: number }[];

  for (const cl of claims) {
    const id = govNodeId(userId, 'claim', cl.id);
    upsertGovNode({
      userId,
      id,
      nodeKind: 'inquiry',
      category: 'curiosity',
      title: cl.statement.slice(0, 180),
      subtitle: cl.epistemic_state,
      description: cl.statement,
      sourceRefs: [{ system: 'epistemic_claims', id: cl.id }],
      confidence: cl.confidence,
      importance: 0.62,
      recurrenceDelta: 0.025,
      clusterKey: 'domain:curiosity',
      explainability: {
        why: 'Structured epistemic claim',
        systems: ['Truth & Evidence Ledger'],
      },
    });
    upsertEdge({
      userId,
      sourceId: id,
      targetId: domainNodeId(userId, 'curiosity'),
      edgeType: 'is_part_of',
      weight: 0.8,
      confidence: cl.confidence,
      explainabilityJson: JSON.stringify({}),
      sourceRefsJson: JSON.stringify([{ system: 'epistemic_claims', id: cl.id }]),
    });
  }

  const frictions = db
    .prepare(`SELECT id, title, friction_type, severity FROM friction_cartography_items WHERE user_id = ? AND status = 'active' LIMIT 40`)
    .all(userId) as { id: string; title: string; friction_type: string; severity: number }[];

  for (const f of frictions) {
    const id = govNodeId(userId, 'friction', f.id);
    upsertGovNode({
      userId,
      id,
      nodeKind: 'tension',
      category: 'tensions',
      title: f.title,
      subtitle: f.friction_type,
      description: `Friction cartography: ${f.friction_type}`,
      sourceRefs: [{ system: 'friction_cartography', id: f.id }],
      confidence: 0.7 + f.severity * 0.15,
      importance: 0.5 + f.severity * 0.35,
      recurrenceDelta: 0.04,
      clusterKey: 'domain:tensions',
      explainability: {
        why: 'Friction cartography item',
        systems: ['Friction Cartography'],
      },
    });
    upsertEdge({
      userId,
      sourceId: id,
      targetId: domainNodeId(userId, 'tensions'),
      edgeType: 'is_part_of',
      weight: 0.75 + f.severity * 0.2,
      confidence: 0.75,
      explainabilityJson: JSON.stringify({ severity: f.severity }),
      sourceRefsJson: JSON.stringify([{ system: 'friction_cartography', id: f.id }]),
    });
  }

  const legacy = db
    .prepare(`SELECT id, title, body FROM legacy_artifacts WHERE user_id = ? AND archived_at IS NULL LIMIT 30`)
    .all(userId) as { id: string; title: string; body: string }[];

  for (const l of legacy) {
    const id = govNodeId(userId, 'legacy', l.id);
    upsertGovNode({
      userId,
      id,
      nodeKind: 'legacy',
      category: 'memory',
      title: l.title,
      description: l.body.slice(0, 2500),
      sourceRefs: [{ system: 'legacy', id: l.id }],
      confidence: 0.92,
      importance: 0.88,
      recurrenceDelta: 0.02,
      clusterKey: 'domain:memory',
      explainability: {
        why: 'Legacy layer artifact',
        systems: ['Legacy Layer'],
      },
    });
    upsertEdge({
      userId,
      sourceId: id,
      targetId: domainNodeId(userId, 'memory'),
      edgeType: 'is_part_of',
      weight: 0.9,
      confidence: 0.9,
      explainabilityJson: JSON.stringify({}),
      sourceRefsJson: JSON.stringify([{ system: 'legacy', id: l.id }]),
    });
  }

  const evo = db
    .prepare(`SELECT id, title, body, significance FROM evolution_timeline_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 35`)
    .all(userId) as { id: string; title: string; body: string; significance: number }[];

  for (const e of evo) {
    const id = govNodeId(userId, 'evolution', e.id);
    upsertGovNode({
      userId,
      id,
      nodeKind: 'memory',
      category: 'memory',
      title: e.title.slice(0, 200),
      description: e.body.slice(0, 2500),
      sourceRefs: [{ system: 'evolution_timeline', id: e.id }],
      confidence: 0.75 + e.significance * 0.2,
      importance: 0.55 + e.significance * 0.35,
      recurrenceDelta: 0.02,
      clusterKey: 'domain:memory',
      explainability: {
        why: 'Evolution timeline event',
        systems: ['Evolution Timeline'],
      },
    });
    upsertEdge({
      userId,
      sourceId: id,
      targetId: domainNodeId(userId, 'memory'),
      edgeType: 'is_part_of',
      weight: 0.82,
      confidence: 0.8,
      explainabilityJson: JSON.stringify({}),
      sourceRefsJson: JSON.stringify([{ system: 'evolution_timeline', id: e.id }]),
    });
  }

  const forges = db
    .prepare(`SELECT id, title, situation_summary FROM simulation_forges WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20`)
    .all(userId) as { id: string; title: string; situation_summary: string }[];

  for (const s of forges) {
    const id = govNodeId(userId, 'simulation_forge', s.id);
    upsertGovNode({
      userId,
      id,
      nodeKind: 'project',
      category: 'focus',
      title: s.title,
      description: s.situation_summary.slice(0, 2500),
      sourceRefs: [{ system: 'simulation_forge', id: s.id }],
      confidence: 0.8,
      importance: 0.72,
      recurrenceDelta: 0.03,
      clusterKey: 'domain:focus',
      explainability: {
        why: 'Strategic simulation forge',
        systems: ['Strategic Simulation Forge'],
      },
    });
    upsertEdge({
      userId,
      sourceId: id,
      targetId: domainNodeId(userId, 'focus'),
      edgeType: 'is_part_of',
      weight: 0.85,
      confidence: 0.82,
      explainabilityJson: JSON.stringify({}),
      sourceRefsJson: JSON.stringify([{ system: 'simulation_forge', id: s.id }]),
    });
  }

  const contradictions = db
    .prepare(`SELECT id, claim_a_id, claim_b_id, contradiction_strength FROM claim_contradictions WHERE user_id = ? AND status = 'open' LIMIT 25`)
    .all(userId) as { id: string; claim_a_id: string; claim_b_id: string; contradiction_strength: number }[];

  for (const c of contradictions) {
    const na = govNodeId(userId, 'claim', c.claim_a_id);
    const nb = govNodeId(userId, 'claim', c.claim_b_id);
    upsertEdge({
      userId,
      sourceId: na,
      targetId: nb,
      edgeType: 'contradicts',
      weight: c.contradiction_strength,
      confidence: 0.65 + c.contradiction_strength * 0.25,
      justification: 'Open contradiction between claims (Truth Ledger).',
      explainabilityJson: JSON.stringify({ contradictionId: c.id }),
      sourceRefsJson: JSON.stringify([{ system: 'claim_contradictions', id: c.id }]),
    });
  }

  const revisions = db
    .prepare(
      `SELECT id, category, detected_pattern, recommendation_title, status FROM self_revision_records WHERE user_id = ? AND status = 'open' LIMIT 20`
    )
    .all(userId) as { id: string; category: string; detected_pattern: string; recommendation_title: string; status: string }[];

  for (const r of revisions) {
    const id = govNodeId(userId, 'self_revision', r.id);
    upsertGovNode({
      userId,
      id,
      nodeKind: 'pattern',
      category: 'patterns',
      title: r.recommendation_title.slice(0, 200),
      subtitle: r.category,
      description: r.detected_pattern.slice(0, 2000),
      sourceRefs: [{ system: 'self_revision', id: r.id }],
      confidence: 0.68,
      importance: 0.7,
      recurrenceDelta: 0.03,
      clusterKey: 'domain:patterns',
      explainability: {
        why: 'Open self-revision record',
        systems: ['Self-Revision'],
      },
    });
    upsertEdge({
      userId,
      sourceId: id,
      targetId: domainNodeId(userId, 'patterns'),
      edgeType: 'is_part_of',
      weight: 0.8,
      confidence: 0.72,
      explainabilityJson: JSON.stringify({}),
      sourceRefsJson: JSON.stringify([{ system: 'self_revision', id: r.id }]),
    });
  }

  applyLayout(userId);

  const after = db.prepare(`SELECT COUNT(*) as c FROM mind_map_nodes WHERE user_id = ?`).get(userId) as { c: number };
  const nodesAdded = Math.max(0, after.c - before.c);

  const edgesTouched = db.prepare(`SELECT COUNT(*) as c FROM mind_map_edges WHERE user_id = ? AND archived = 0`).get(userId) as {
    c: number;
  };

  recordGovernanceAudit({
    userId,
    actor: 'system',
    action: 'mind_map_sync',
    entityType: 'mind_map',
    entityId: userId,
    payload: { nodes: after.c, edges: edgesTouched.c },
  });

  return { nodesAdded, edgesTouched: edgesTouched.c };
}

/** Positions governance nodes in orbit around their domain anchor; respects `pinned`. */
export function applyLayout(userId: string): void {
  const db = getDb();
  const nodes = listMindMapNodes(userId);
  const domains = new Map<string, MindMapNodeRow>();
  for (const n of nodes) {
    if (n.node_kind === 'domain_anchor' && n.cluster_key?.startsWith('domain:')) {
      const key = n.cluster_key.replace('domain:', '');
      domains.set(key, n);
    }
  }

  const hx = userHash(userId);
  const byCluster = new Map<string, MindMapNodeRow[]>();
  for (const n of nodes) {
    if (n.archived || n.pinned || n.node_kind === 'core_self' || n.node_kind === 'domain_anchor') continue;
    const ck = n.cluster_key ?? 'patterns';
    const list = byCluster.get(ck) ?? [];
    list.push(n);
    byCluster.set(ck, list);
  }

  for (const [cluster, group] of byCluster) {
    const domainKey = cluster.replace('domain:', '') as DomainKey;
    const parent = domains.get(domainKey) ?? domains.get('patterns');
    if (!parent) continue;
    const baseAngle = Math.atan2(parent.layout_y, parent.layout_x);
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
    sorted.forEach((n, idx) => {
      const spread = Math.min(0.55, 0.12 + sorted.length * 0.03);
      const step = sorted.length <= 1 ? 0 : spread * (idx / (sorted.length - 1) - 0.5) * 2;
      const jitter = ((hx + idx * 31 + n.id.length * 7) % 1000) / 1000 - 0.5;
      const angle = baseAngle + step + jitter * 0.12;
      const r = 52 + (idx % 5) * 14 + (hx % 18);
      const x = Math.round((parent.layout_x + Math.cos(angle) * r) * 10) / 10;
      const y = Math.round((parent.layout_y + Math.sin(angle) * r) * 10) / 10;
      db.prepare(`UPDATE mind_map_nodes SET layout_x = ?, layout_y = ?, layout_ring = 2, updated_at = ? WHERE id = ? AND pinned = 0`).run(
        x,
        y,
        nowIso(),
        n.id
      );
    });
  }
}

export function createMindMapSnapshot(userId: string, label?: string): string {
  const nodes = listMindMapNodes(userId);
  const edges = listMindMapEdges(userId);
  const id = randomUUID();
  const ts = nowIso();
  const kinds: Record<string, number> = {};
  for (const n of nodes) {
    kinds[n.node_kind] = (kinds[n.node_kind] ?? 0) + 1;
  }
  const meta = {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    kinds,
    label: label ?? '',
  };
  getDb()
    .prepare(
      `INSERT INTO mind_map_snapshots (id, user_id, label, nodes_json, edges_json, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, userId, label ?? '', JSON.stringify(nodes), JSON.stringify(edges), JSON.stringify(meta), ts);
  return id;
}

export function listMindMapSnapshots(userId: string, limit = 30): { id: string; label: string; created_at: string; meta_json: string }[] {
  return getDb()
    .prepare(`SELECT id, label, created_at, meta_json FROM mind_map_snapshots WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(userId, limit) as { id: string; label: string; created_at: string; meta_json: string }[];
}

export function getMindMapSnapshot(userId: string, snapshotId: string): { nodes: MindMapNodeRow[]; edges: MindMapEdgeRow[]; meta: unknown } | null {
  const row = getDb()
    .prepare(`SELECT nodes_json, edges_json, meta_json FROM mind_map_snapshots WHERE user_id = ? AND id = ?`)
    .get(userId, snapshotId) as { nodes_json: string; edges_json: string; meta_json: string } | undefined;
  if (!row) return null;
  return {
    nodes: JSON.parse(row.nodes_json) as MindMapNodeRow[],
    edges: JSON.parse(row.edges_json) as MindMapEdgeRow[],
    meta: JSON.parse(row.meta_json),
  };
}

export function patchMindMapNode(
  userId: string,
  nodeId: string,
  patch: Partial<{
    title: string;
    subtitle: string | null;
    description: string | null;
    pinned: number;
    archived: number;
    userConfirmed: number | null;
    status: string;
    layoutX: number;
    layoutY: number;
  }>
): boolean {
  const db = getDb();
  const row = db.prepare(`SELECT id FROM mind_map_nodes WHERE user_id = ? AND id = ?`).get(userId, nodeId) as { id: string } | undefined;
  if (!row) return false;
  const ts = nowIso();
  const sets: string[] = ['updated_at = ?'];
  const vals: unknown[] = [ts];
  if (patch.title !== undefined) {
    sets.push('title = ?');
    vals.push(patch.title);
  }
  if (patch.subtitle !== undefined) {
    sets.push('subtitle = ?');
    vals.push(patch.subtitle);
  }
  if (patch.description !== undefined) {
    sets.push('description = ?');
    vals.push(patch.description);
  }
  if (patch.pinned !== undefined) {
    sets.push('pinned = ?');
    vals.push(patch.pinned);
  }
  if (patch.archived !== undefined) {
    sets.push('archived = ?');
    vals.push(patch.archived);
  }
  if (patch.userConfirmed !== undefined) {
    sets.push('user_confirmed = ?');
    vals.push(patch.userConfirmed);
  }
  if (patch.status !== undefined) {
    sets.push('status = ?');
    vals.push(patch.status);
  }
  if (patch.layoutX !== undefined) {
    sets.push('layout_x = ?');
    vals.push(patch.layoutX);
  }
  if (patch.layoutY !== undefined) {
    sets.push('layout_y = ?');
    vals.push(patch.layoutY);
  }
  vals.push(nodeId);
  db.prepare(`UPDATE mind_map_nodes SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  recordGovernanceAudit({
    userId,
    actor: 'user',
    action: 'mind_map_node_patch',
    entityType: 'mind_map_node',
    entityId: nodeId,
    payload: patch,
  });
  return true;
}

export function createUserMindMapNode(input: {
  userId: string;
  nodeKind: string;
  category: string;
  title: string;
  subtitle?: string;
  description?: string;
  clusterKey?: string;
}): string {
  ensureMindMapSeed(input.userId);
  const id = randomUUID();
  const ts = nowIso();
  const cluster = input.clusterKey ?? 'domain:focus';
  getDb()
    .prepare(
      `INSERT INTO mind_map_nodes (
      id, user_id, node_kind, category, title, subtitle, description, source_type, source_refs_json,
      confidence, importance, recurrence_score, volatility, status, visibility, archived, pinned,
      layout_x, layout_y, layout_ring, cluster_key, explainability_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'user', '[]', 1, 0.75, 0, 0, 'active', 'normal', 0, 0, 0, 0, 2, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.userId,
      input.nodeKind,
      input.category,
      input.title.slice(0, 500),
      input.subtitle?.slice(0, 500) ?? null,
      (input.description ?? '').slice(0, 8000),
      cluster,
      JSON.stringify({ why: 'User-authored node', userDeclared: true }),
      ts,
      ts
    );
  applyLayout(input.userId);
  return id;
}

export function archiveMindMapNode(userId: string, nodeId: string): boolean {
  const db = getDb();
  const n = db.prepare(`SELECT source_type FROM mind_map_nodes WHERE user_id = ? AND id = ?`).get(userId, nodeId) as
    | { source_type: string }
    | undefined;
  if (!n || n.source_type === 'seed') return false;
  db.prepare(`UPDATE mind_map_nodes SET archived = 1, updated_at = ? WHERE id = ?`).run(nowIso(), nodeId);
  db.prepare(`UPDATE mind_map_edges SET archived = 1, updated_at = ? WHERE user_id = ? AND (source_id = ? OR target_id = ?)`).run(
    nowIso(),
    userId,
    nodeId,
    nodeId
  );
  return true;
}

export function computeMindMapInsights(userId: string): {
  dominantKinds: { kind: string; count: number }[];
  tensionEdges: number;
  avgImportanceByDomain: Record<string, number>;
  structuralNotes: string[];
} {
  const nodes = listMindMapNodes(userId);
  const edges = listMindMapEdges(userId);
  const kindCount = new Map<string, number>();
  for (const n of nodes) {
    kindCount.set(n.node_kind, (kindCount.get(n.node_kind) ?? 0) + 1);
  }
  const dominantKinds = [...kindCount.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const tensionEdges = edges.filter((e) => e.edge_type === 'contradicts').length;

  const domainImp = new Map<string, { sum: number; n: number }>();
  for (const n of nodes) {
    if (n.node_kind === 'domain_anchor') continue;
    const d = n.category;
    const cur = domainImp.get(d) ?? { sum: 0, n: 0 };
    cur.sum += n.importance;
    cur.n += 1;
    domainImp.set(d, cur);
  }
  const avgImportanceByDomain: Record<string, number> = {};
  for (const [d, v] of domainImp) {
    avgImportanceByDomain[d] = v.n ? Math.round((v.sum / v.n) * 100) / 100 : 0;
  }

  const structuralNotes: string[] = [];
  if (tensionEdges > 0) {
    structuralNotes.push(`${tensionEdges} open contradiction bridge(s) between claims — inspect Truth & Evidence.`);
  }
  const openTensionNodes = nodes.filter((n) => n.node_kind === 'tension' && n.status !== 'dormant').length;
  if (openTensionNodes > 5) {
    structuralNotes.push('Tension sector is dense; consider Friction Cartography and Unfinished Business review.');
  }
  const goalLike = nodes.filter((n) => n.node_kind === 'goal' || n.node_kind === 'decision').length;
  const projectLike = nodes.filter((n) => n.node_kind === 'project').length;
  if (goalLike > 3 && projectLike < 2) {
    structuralNotes.push('Goals/decisions outnumber active execution forges — possible intent–action gap (Trajectory Observatory).');
  }

  return { dominantKinds, tensionEdges, avgImportanceByDomain, structuralNotes };
}
